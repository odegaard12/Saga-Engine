# -*- coding: utf-8 -*-
"""Auditoría del 04/10/2026, lado del móvil: se EJECUTA la lógica TS del jugador
(tests/js/auditoria_04_10.cjs, en el navegador de mentira de
entorno_navegador.cjs) y se comprueba lo que hace.

El escenario de extremo a extremo junta las dos mitades: el servidor de verdad
sirve la misión sintética (tests/test_auditoria_mochila_y_avance.py), el móvil la
juega entera SIN RED con `enviarCodigo` —premio del minijuego, coleccionable,
recarga de la app a mitad, nodos que piden los objetos— y la cola que deja se
sube al servidor de verdad. Tiene que llegar todo, en orden, sin rechazos y sin
objetos de más ni de menos.

Sin Node o sin frontend/node_modules, se salta.
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-auditoria-js-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402
from test_auditoria_mochila_y_avance import USUARIO, mision_sintetica  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
ARNES = RAIZ / "tests" / "js" / "auditoria_04_10.cjs"


def _ejecutar(partida=None, partida_nueva=None):
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    argumentos = [node, str(ARNES), str(partida or ""), str(partida_nueva or "")]
    proceso = subprocess.run(
        argumentos, capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ)
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


@pytest.fixture(scope="module")
def js():
    return _ejecutar()


# --------------------------------------------------------------- GPS


def test_el_rescate_de_45_s_salta_tambien_con_el_gps_denegado(js):
    r = js["rescateGps"]
    assert r["espera"] == 45_000
    assert r["denegado_10s"] == {"reason": "gps_unavailable", "canEnter": False}
    assert r["denegado_46s"] == {"reason": "gps_rendido", "canEnter": True}
    assert r["sin_senal_46s"] == {"reason": "gps_rendido", "canEnter": True}
    assert r["listo_sin_distancia_46s"]["reason"] == "gps_rendido"
    assert r["listo_sin_distancia_10s"]["reason"] == "distance_unknown"
    # Con la distancia conocida manda la distancia: el rescate no abre nodos lejanos.
    assert r["con_distancia_lejos"] == {"reason": "out_of_range", "canEnter": False}


# --------------------------------------------------------------- premios y mochila


def test_el_premio_del_nodo_y_su_clave(js):
    p = js["premios"]
    assert p["armado"] == {"itemId": "llave", "label": "Llave", "quantity": 2, "message": "Toma", "grantId": "reward:9"}
    assert p["aviso_armado"] == "Toma"
    assert p["en_config"]["itemId"] == "mapa"
    assert "Mapa" in p["aviso_sin_mensaje"]
    assert p["coleccionable"] is None, "un coleccionable no da su objeto dos veces"
    assert p["sin_premio"] is None
    assert p["clave_coleccionable"] == "collect:11"


def test_una_entrega_se_hace_una_vez_y_el_evento_lleva_sus_unidades(js):
    m = js["mochila"]
    assert m["primera"] is True and m["segunda"] is False
    assert m["unidades_tras_repetir"] == 3
    assert [(e["grant_id"], e["cantidad"]) for e in m["cola"]] == [("collect:5", 2), ("collect:6", 1)]


def test_hidratar_suma_la_entrega_del_panel_una_vez_y_no_resucita(js):
    m = js["mochila"]
    assert m["con_admin"] == 4, "el «Dar objeto» llega aunque el móvil ya tuviera gemas"
    assert m["hidratar_dos_veces"] == 4
    assert m["tras_cache"] == {"gema": 4, "llave_gastada": 0, "reintento": False}
    assert m["tras_reinicio"] == {"gema": 0, "vuelve_a_entregar": True}


def test_fabricar_va_a_la_cola_como_gasto_y_recogida(js):
    f = js["fabricar"]
    assert f["hecho"] is True and f["repetir"] is False
    gastos = [e for e in f["cola"] if e["accion"] == "used"]
    recogidas = [e for e in f["cola"] if e["accion"] == "collected"]
    assert sorted(e["item"] for e in gastos) == sorted(f["entradas"])
    assert [e["item"] for e in recogidas] == f["salidas"]
    assert len({e["grant_id"] for e in f["cola"]}) == len(f["cola"])


def test_la_recogida_va_antes_que_el_avance_aunque_la_cola_se_lea_tarde(js):
    assert js["ordenDeLaCola"] == ["qr_scanned", "qr_scanned:gema", "node_completed"]


# --------------------------------------------------------------- fotos


def test_las_fotos_rechazadas_no_atascan_la_cola(js):
    f = js["fotos"]
    d = f["decisiones"]
    assert d["ok"] == {"accion": "borrar"}
    assert d["malo"]["accion"] == d["grande"]["accion"] == d["cupo"]["accion"] == "fallida"
    assert d["cupo"]["motivo"] == "cupo_lleno"
    assert d["sesion"]["accion"] == "esperar_sesion"
    assert d["sin_posicion"]["accion"] == "reintentar"
    assert d["sin_red_0"]["esperaMs"] < d["sin_red_3"]["esperaMs"] < d["sin_red_40"]["esperaMs"] == 30 * 60_000
    assert f["tiempo_subida_ms"] == 45_000

    assert f["tras_primera_vuelta"] == [{"id": f["client_ids"][0], "fallida": True, "motivo": "demasiado_grande"}]
    assert f["peticiones_total"] == f["peticiones_primera"] == 2, "la rechazada no se vuelve a mandar"
    assert f["fallidas_avisadas"] == ["demasiado_grande"]
    assert f["id_respetado"] in f["client_ids"], "el client_proof_id es el id de la foto en el móvil"
    assert f["sin_gps_sin_coordenadas"] is True


def test_sin_red_o_sin_sesion_espera_y_no_se_queda_colgada(js):
    f = js["fotos"]
    assert f["sin_red"] == {"llamadas": 1, "intentos": 1, "espera_futura": True}
    assert f["sesion"] == {"intentos": 0, "espera_futura": True}
    assert f["colgada"]["intentos"] == 1
    assert f["colgada"]["tardo_ms"] < 5_000


# --------------------------------------------------------------- minijuegos


def test_simon_cambia_de_patron_en_cada_intento_salvo_semilla_fijada(js):
    s = js["minijuegos"]["simon"]
    assert s["intento0"] != s["intento1"]
    assert s["fijada0"] == s["fijada1"] == "patron"
    assert s["vieja_de_serie"] != "saga-simon"
    assert s["vieja_de_serie_fijada"] != "saga-simon", "la de serie no cuenta como fijada"


def test_modo_alternativo_solo_sin_sensor_y_con_penalizacion(js):
    a = js["minijuegos"]["alternativo"]
    assert a["sin_comprobar"] is False and a["disponible"] is False
    assert a["denegado"] is True and a["no_disponible"] is True and a["mudo"] is True
    assert a["denegado_sin_permiso_del_nodo"] is False
    assert a["penalizacion"] == 60_000 and a["sin_penalizacion"] == 0
    assert a["toques_validos"] == [0, 130, 260, 380], "al menos 120 ms entre toques"
    assert a["evidencia"] == {"modo_alternativo": True, "motivo": "denegado"}
    assert a["host_penalizacion"] == 60_000 and a["host_sin"] is None


def test_audio_sostenido_por_reloj_y_el_viento_a_golpes_no_gana(js):
    au = js["minijuegos"]["audio"]
    assert au["defecto"] == {"umbral": 95, "sostenidoMs": 2500}
    assert au["recortado"] == {"umbral": 220, "sostenidoMs": 1000}
    assert au["viento_gana"] is False
    assert 2500 <= au["soplo_gana_en_ms"] <= 2600
    assert abs(au["a_120hz"] - au["a_30hz"]) <= 40, "la frecuencia de pantalla no cambia el reto"


def test_relevo_cuenta_a_quien_juega(js):
    r = js["minijuegos"]["relevo"]
    assert r["solo"] is False and r["con_uno"] is True
    assert r["necesarios_1"] == 2 and r["necesarios_vacio"] == 2
    assert r["presentes_con_dos"] == 3


# --------------------------------------------------------------- validador del panel


def test_el_validador_mira_el_orden_de_la_ruta(js):
    v = js["validadorDelPanel"]
    assert v["en_orden"] is None
    assert "después" in v["al_reves"]
    assert v["coleccionable_no_cuenta_doble"] and "sólo dan 1" in v["coleccionable_no_cuenta_doble"]
    assert v["gastada_antes"] and "N3" in v["gastada_antes"]
    assert "ningún nodo" in v["nadie_lo_da"]


# --------------------------------------------------------------- extremo a extremo


def test_mision_sintetica_jugada_sin_red_con_recarga_llega_entera_al_servidor(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.save_stages(main.STAGES_DB, mision_sintetica())
    main.set_player_progress_level(USUARIO, 0)
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()

    partida = cliente.get("/api/game/PLAYER%201?offline_pack=true")
    assert partida.status_code == 200
    fichero = tmp_path / "partida.json"
    fichero.write_text(json.dumps(partida.json()), encoding="utf-8")

    movil = _ejecutar(fichero)["extremoAExtremo"]

    assert [p["ok"] for p in movil["pasos"]] == [True] * 4, movil["pasos"]
    assert movil["tras_recarga_nivel"] == 2, "la recarga no pierde los nodos hechos sin red"
    assert movil["nivel_final"] == 4
    assert any("llave de prueba" in a for a in movil["pasos"][0]["avisos"]), movil["pasos"][0]["avisos"]
    local = {o["id"]: o for o in movil["mochila_local"]}
    assert local["llave_prueba"]["n"] == 1
    assert local["gema_prueba"]["n"] == 0

    # Orden de la cola: cada objeto entra ANTES que el avance del nodo que lo pide.
    orden = movil["orden"]
    assert orden.index("qr_scanned:gema_prueba@collect:302") < orden.index("node_completed", 2)
    assert orden.count("node_completed") == 4

    # Vuelve la red: la cola sube al servidor de verdad.
    respuesta = cliente.post("/api/events/sync", json=movil["cuerpo"])
    assert respuesta.status_code == 200, respuesta.text
    eventos = respuesta.json()["events"]
    # Los avances, aplicados; las recogidas, aceptadas (se guardan tal cual).
    assert [e["status"] for e in eventos if e["type"] == "node_completed"] == ["synced"] * 4, eventos
    assert all(e["status"] in ("synced", "pending") and not e.get("error") for e in eventos), eventos
    assert main.get_player_progress_level(USUARIO, 0) == 4
    assert main.count_player_inventory_item(USUARIO, "llave_prueba") == 1
    assert main.count_player_inventory_item(USUARIO, "gema_prueba") == 0

    # Y otra vez (el móvil no vio la respuesta): nada cambia.
    segunda = cliente.post("/api/events/sync", json=movil["cuerpo"]).json()
    assert all(e["duplicate"] for e in segunda["events"])
    assert main.count_player_inventory_item(USUARIO, "llave_prueba") == 1
    assert main.get_player_progress_level(USUARIO, 0) == 4


def test_con_la_cache_borrada_el_movil_recupera_lo_recogido_y_abre_el_nodo(monkeypatch, tmp_path):
    """Recoger sin red, sincronizar, y abrir la app en un navegador vacío (caché
    borrada, sesión cerrada, otro móvil): la mochila vuelve desde el servidor y
    el nodo que pide el objeto se abre."""
    preparar_mision(monkeypatch, tmp_path)
    main.save_stages(main.STAGES_DB, mision_sintetica())
    main.set_player_progress_level(USUARIO, 0)
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()
    assert cliente.get("/api/game/PLAYER%201").status_code == 200

    hace = "2020-01-01T00:00:00Z"
    cola = [
        {"client_event_id": "a0", "type": "node_completed", "payload": {"code": "OK", "level_before": 0, "local_created_at": hace}},
        {"client_event_id": "r0", "type": "qr_scanned", "payload": {
            "inventory_item_id": "gema_prueba", "inventory_action": "collected", "inventory_quantity": 2,
            "grant_id": "collect:302", "local_created_at": hace}},
        {"client_event_id": "a1", "type": "node_completed", "payload": {"code": "OK", "level_before": 1, "local_created_at": hace}},
    ]
    assert cliente.post("/api/events/sync", json={"user": USUARIO, "events": cola}).status_code == 200

    partida = cliente.get("/api/game/PLAYER%201?offline_pack=true").json()
    fichero = tmp_path / "partida_nueva.json"
    fichero.write_text(json.dumps(partida), encoding="utf-8")

    movil = _ejecutar(None, fichero)["dispositivoNuevo"]
    objetos = {o["id"]: o for o in movil["items"]}
    assert objetos["llave_prueba"]["n"] == 1, "el premio del minijuego vuelve"
    assert objetos["gema_prueba"]["n"] == 2, "lo recogido sin red vuelve"
    assert movil["puerta"] is None, "el nodo que pide la llave se abre"

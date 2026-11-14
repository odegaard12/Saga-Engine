# -*- coding: utf-8 -*-
"""15/11: criterio de Óscar para «+1 nodo», «Dar por terminada» y «Añadir objeto» del panel.

Saltar un nodo es «como si lo hubiera completado el jugador, salvo el tiempo»: se le entrega el objeto del coleccionable
(en sus cuatro formas) y el premio de objeto del minijuego o punto de control, sin duplicar lo que el móvil ya recogió, y
se evalúan sus accesorios. El tiempo ya NO son 5 min fijos: lo elige el organizador (`tiempo_modo`).

Misión sintética (nada de datos reales):
  0 (501) punto de control con premio «sello» x3
  1 (502) minijuego con premio «llave»
  2 (503) puerta: pide «llave»
  3 (504) coleccionable con el id sólo en physical_qr.item_id  («brujula»)
  4 (505) coleccionable con physical_node_kind y el id en el nodo («mapa_viejo»)
  5 (506) coleccionable de mapa sin physical_node_kind («gema» x2)
  6 (507) coleccionable con physical_item_kind «collectible» («pluma»)
  7 (508) final
"""
import os
import tempfile
import uuid

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-saltar-nodo-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.storage import match_log_store as _registro  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
BASE = {"lat": 40.5, "lon": -3.5, "radius": 25}
UNIDAD = {"checkpoint": {"type": "checkpoint", "config": {}}}


def mision():
    return [
        {
            "id": 501, "title": "Paso con sello", **BASE, "minigame": UNIDAD["checkpoint"],
            "config": {"reward_item_id": "sello", "reward_item_label": "Sello", "reward_item_quantity": 3},
        },
        {
            "id": 502, "title": "Simón con llave", **BASE,
            "minigame": {"type": "circuit_matrix", "config": {"game_id": "sequence_code"}},
            "config": {"game_id": "sequence_code", "reward_item_id": "llave", "reward_item_label": "Llave"},
        },
        {
            "id": 503, "title": "Puerta de la llave", **BASE, "minigame": UNIDAD["checkpoint"],
            "config": {"required_item_id": "llave", "required_item_label": "Llave"},
        },
        {
            "id": 504, "title": "Coleccionable A", **BASE, "minigame": UNIDAD["checkpoint"],
            "physical_node_kind": "collectible",
            "physical_qr": {"item_id": "brujula", "label": "Brújula"},
            "config": {},
        },
        {
            "id": 505, "title": "Coleccionable B", **BASE, "minigame": UNIDAD["checkpoint"],
            "physical_node_kind": "collectible", "physical_item_id": "mapa_viejo", "physical_item_label": "Mapa viejo",
            "config": {},
        },
        {
            "id": 506, "title": "Coleccionable C", **BASE, "minigame": UNIDAD["checkpoint"],
            "physical_item_id": "gema", "physical_item_label": "Gema", "physical_item_quantity": 2,
            "config": {"is_map_collectible": True},
        },
        {
            "id": 507, "title": "Coleccionable D", **BASE, "minigame": UNIDAD["checkpoint"],
            "physical_item_kind": "collectible", "physical_item_id": "pluma", "physical_item_label": "Pluma",
            "config": {},
        },
        {"id": 508, "title": "Final", **BASE, "minigame": UNIDAD["checkpoint"], "config": {"success_code": "FIN-508"}},
    ]


@pytest.fixture
def panel(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.save_stages(main.STAGES_DB, mision())
    main.set_player_progress_level(USUARIO, 0)
    monkeypatch.setattr(main, "ADMIN_OPS_DB", str(tmp_path / "admin_ops.json"))
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "MANUAL_POSITION_NOTICE_DB", str(tmp_path / "aviso_manual.json"))
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    estado = {"cfg": dict(main.load_config())}
    estado["cfg"].pop("desbloqueables", None)
    monkeypatch.setattr(main, "load_config", lambda: dict(estado["cfg"]))
    monkeypatch.setattr(main, "save_config", lambda cfg: estado.update(cfg=dict(cfg)))
    main._desbloqueos_glue.olvidar_pendientes()
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _op():
    return "op-" + uuid.uuid4().hex[:16]


def _accion(cliente, accion, **extra):
    r = cliente.post("/api/admin/profile-action", json={"profile_id": USUARIO, "action": accion, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def _unidades(item_id):
    eventos, copia = main._eventos_y_copia_de_mochila(USUARIO)
    return main._mochila.contar_objeto(eventos, copia, USUARIO, item_id)


def _en_la_mochila_del_movil(item_id):
    snap = main.inventory_snapshot_for_player(USUARIO)
    return sum(int(i.get("quantity") or 1) for i in snap.get("items", []) if i.get("item_id") == item_id)


def _avanzar(cliente, nivel):
    r = cliente.post("/api/advance", json={"user": USUARIO, "code": "OK", "level_before": nivel, "time_spent_ms": 20_000})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- premio y coleccionables

def test_level_next_entrega_el_premio_y_el_nodo_que_lo_exige_se_abre(panel):
    primero = _accion(panel, "level_next")  # 501: sello x3
    assert [e["item_id"] for e in primero["entregado"]] == ["sello"]
    assert primero["entregado"][0]["quantity"] == 3 and primero["entregado"][0]["origen"] == "premio"
    segundo = _accion(panel, "level_next")  # 502: llave
    assert [e["item_id"] for e in segundo["entregado"]] == ["llave"] and segundo["entregado"][0]["origen"] == "premio"
    assert _unidades("sello") == 3 and _unidades("llave") == 1
    assert _en_la_mochila_del_movil("llave") == 1

    # El nodo 503 exige la llave: antes de 15/11 saltar el 502 dejaba al jugador con `missing_required_item`.
    respuesta = _avanzar(panel, 2)
    assert respuesta["status"] == "ok", respuesta


@pytest.mark.parametrize("indice, item, unidades", [(3, "brujula", 1), (4, "mapa_viejo", 1), (5, "gema", 2), (6, "pluma", 1)])
def test_level_next_entrega_el_coleccionable_en_sus_cuatro_formas(panel, indice, item, unidades):
    main.set_player_progress_level(USUARIO, indice)

    r = _accion(panel, "level_next")

    assert [(e["item_id"], e["quantity"], e["origen"]) for e in r["entregado"]] == [(item, unidades, "coleccionable")]
    assert _unidades(item) == unidades and _en_la_mochila_del_movil(item) == unidades


def test_level_next_no_duplica_lo_que_el_movil_ya_recogio(panel):
    # El móvil recogió la gema (collect:<nodo>) pero el avance falló: «+1 nodo» no la vuelve a dar (4 en vez de 2).
    main.append_event(
        main.EVENT_LOG_DB,
        {
            "type": "inventory_item_collected", "status": "synced", "source": "offline_queue", "user": USUARIO,
            "team_id": USUARIO, "node_id": "506",
            "payload": {"inventory_item_id": "gema", "inventory_label": "Gema", "inventory_action": "collected",
                        "inventory_quantity": 2, "grant_id": "collect:506"},
        },
    )
    main.set_player_progress_level(USUARIO, 5)

    r = _accion(panel, "level_next")

    assert r["entregado"] == [] and any("no se duplica" in a for a in r["avisos"])
    assert _unidades("gema") == 2


def test_level_next_dos_veces_el_mismo_nodo_no_duplica(panel):
    main.set_player_progress_level(USUARIO, 5)
    _accion(panel, "level_next")
    main.set_player_progress_level(USUARIO, 5, desde_admin=True)  # el organizador lo vuelve a poner ahí y lo salta otra vez
    r = _accion(panel, "level_next")
    assert r["entregado"] == [] and _unidades("gema") == 2


# ---------------------------------------------------------------- Dar por terminada

def test_mark_finished_entrega_todo_lo_saltado_una_sola_vez_y_los_accesorios_del_final(panel):
    # El accesorio de «final de misión» tiene que llegar también a quien termina por el panel.
    r0 = panel.post("/api/admin/desbloqueables", json={}).json()
    g = panel.post("/api/admin/desbloqueables/guardar", json={
        "revision": r0["config"]["revision"], "activos": True,
        "reglas": [{"id": "f", "cuando": {"tipo": "final_mision"}, "da": ["item:bordon"]}],
    })
    assert g.status_code == 200, g.text

    r = _accion(panel, "mark_finished")

    items = {e["item_id"]: e["quantity"] for e in r["entregado"]}
    assert items == {"sello": 3, "llave": 1, "brujula": 1, "mapa_viejo": 1, "gema": 2, "pluma": 1}
    assert r["finished"] is True and r["nodo_despues"]["terminado"] is True
    assert [d["clave"] for d in r["desbloqueos"]] == ["item:bordon"] and r["desbloqueos"][0]["label"]
    assert _unidades("sello") == 3 and _unidades("gema") == 2

    # Otra vez no entrega ni cobra nada.
    r2 = _accion(panel, "mark_finished")
    assert r2["entregado"] == [] and r2["tiempo_cobrado_ms"] == 0 and r2["desbloqueos"] == []
    assert _unidades("sello") == 3 and _unidades("gema") == 2


# ---------------------------------------------------------------- tiempo

def test_sin_campos_nuevos_no_se_cobra_nada(panel):
    r = _accion(panel, "level_next")  # una petición «vieja»: sin tiempo_modo
    assert r["tiempo_cobrado_ms"] == 0
    assert main.load_player_timers().get(USUARIO, {}).get("penalties_ms", 0) == 0


def test_el_organizador_elige_el_tiempo_y_retroceder_lo_devuelve(panel):
    main.set_player_progress_level(USUARIO, 5)
    r = _accion(panel, "level_next", tiempo_modo="cifra", tiempo_ms=45_000)
    assert r["tiempo_cobrado_ms"] == 45_000 and main.load_player_timers()[USUARIO]["penalties_ms"] == 45_000

    atras = _accion(panel, "level_prev")
    assert atras["tiempo_devuelto_ms"] == 45_000 and main.load_player_timers()[USUARIO].get("penalties_ms", 0) == 0
    assert any("repetirá desde cero" in a for a in atras["avisos"])

    main.set_player_progress_level(USUARIO, 5, desde_admin=True)
    respaldo = _accion(panel, "level_next", tiempo_modo="respaldo")
    assert respaldo["tiempo_cobrado_ms"] == main.penalizacion_de_respaldo_ms("506") > 0


def test_el_tiempo_se_limita_a_una_hora_y_un_modo_raro_da_400(panel):
    main.set_player_progress_level(USUARIO, 5)
    assert _accion(panel, "level_next", tiempo_modo="cifra", tiempo_ms=99_999_999)["tiempo_cobrado_ms"] == 3_600_000
    r = panel.post("/api/admin/profile-action", json={"profile_id": USUARIO, "action": "level_next", "tiempo_modo": "mucho"})
    assert r.status_code == 400 and r.json()["detail"] == "invalid tiempo_modo" and "ninguno" in r.json()["mensaje"]


# ---------------------------------------------------------------- idempotencia

def test_reintento_con_el_mismo_op_id_no_repite_ni_entrega_dos_veces(panel):
    op = _op()
    a = _accion(panel, "level_next", op_id=op)
    b = _accion(panel, "level_next", op_id=op)
    assert a["level"] == b["level"] == 1 and b.get("repetida") is True
    assert main.get_player_progress_level(USUARIO) == 1 and _unidades("sello") == 3


def test_el_mismo_op_id_con_otro_tiempo_es_un_409(panel):
    op = _op()
    _accion(panel, "level_next", op_id=op, tiempo_modo="cifra", tiempo_ms=10_000)
    r = panel.post("/api/admin/profile-action", json={
        "profile_id": USUARIO, "action": "level_next", "op_id": op, "tiempo_modo": "cifra", "tiempo_ms": 20_000})
    assert r.status_code == 409 and r.json()["detail"] == "op_id reused" and r.json()["mensaje"]


# ---------------------------------------------------------------- Añadir objeto

def test_dar_el_objeto_de_otro_nodo_avisa_del_salto_de_nivel(panel):
    r = _accion(panel, "give_item:brujula")  # el objeto del nodo 504 (índice 3) a quien está en el 501
    assert r["mueve_nivel"] == {"de": 1, "a": 5, "saltados": 3}
    assert any("NO se entregan sus objetos" in a for a in r["avisos"])
    assert [(e["item_id"], e["origen"]) for e in r["entregado"]] == [("brujula", "manual")]
    assert r["nodo_antes"]["indice"] == 1 and r["nodo_despues"]["indice"] == 5 and r["nodo_despues"]["total"] == 8
    assert r["tiempo_cobrado_ms"] == 0


def test_dar_un_objeto_que_ningun_nodo_da_no_mueve_el_nivel(panel):
    r = _accion(panel, "give_item:cuerda_rara")
    assert "mueve_nivel" not in r and r["objeto_conocido"] is False and r["level"] == 0


def test_error_de_objeto_con_mensaje_en_castellano(panel):
    r = panel.post("/api/admin/profile-action", json={"profile_id": USUARIO, "action": "give_item:" + "x" * 100})
    assert r.status_code == 400 and r.json()["detail"] == "invalid item id" and "identificador" in r.json()["mensaje"]


# ---------------------------------------------------------------- contrato de la respuesta

def test_la_respuesta_trae_el_contrato_completo(panel):
    r = _accion(panel, "level_next")
    assert set(["entregado", "desbloqueos", "tiempo_cobrado_ms", "nodo_antes", "nodo_despues", "avisos"]) <= set(r)
    assert r["nodo_antes"] == {"indice": 1, "total": 8, "nombre": "Paso con sello", "terminado": False}
    assert r["nodo_despues"]["indice"] == 2 and r["nodo_despues"]["nombre"] == "Simón con llave"


# ---------------------------------------------------------------- huella en el registro de partida

def test_cada_accion_del_panel_deja_huella_en_el_registro_de_partida(panel):
    _accion(panel, "level_next", tiempo_modo="cifra", tiempo_ms=30_000)
    _accion(panel, "give_item:cuerda_rara")
    panel.post("/api/admin/jugador/tiempo", json={"profile_id": USUARIO, "segundos": 60, "op_id": _op()})

    filas = _registro.list_entries(main.MATCH_LOG_DB, user=USUARIO, event_type="accion_de_admin")
    acciones = [f["payload"]["accion"] if isinstance(f.get("payload"), dict) else None for f in filas]
    assert "level_next" in acciones and "give_item:cuerda_rara" in acciones
    salto = next(f for f in filas if f["payload"]["accion"] == "level_next")["payload"]
    assert salto["nivel_antes"] == 0 and salto["nivel_despues"] == 1 and salto["tiempo_cobrado_ms"] == 30_000
    assert salto["entregado"] == [{"item_id": "sello", "quantity": 3}]


# ---------------------------------------------------------------- accesorios y estrellas del panel

def test_conceder_retirar_y_estrellas_son_idempotentes_y_devuelven_saldo_y_etiqueta(panel):
    op = _op()
    cuerpo = {"jugadores": [USUARIO], "claves": ["item:casco"], "motivo": "fiesta", "op_id": op}
    a = panel.post("/api/admin/desbloqueos/conceder", json=cuerpo).json()
    b = panel.post("/api/admin/desbloqueos/conceder", json=cuerpo).json()
    assert a["concedidos"] == {USUARIO: ["item:casco"]} and a["etiquetas"]["item:casco"] and USUARIO in a["saldos"]
    assert b.get("repetida") is True and b["concedidos"] == a["concedidos"]

    op2 = _op()
    e1 = panel.post("/api/admin/estrellas", json={"jugadores": [USUARIO], "cantidad": 5, "op_id": op2}).json()
    e2 = panel.post("/api/admin/estrellas", json={"jugadores": [USUARIO], "cantidad": 5, "op_id": op2}).json()
    assert e1["saldos"][USUARIO] == 5 and e1["aplicadas"] == {USUARIO: 5}
    assert e2.get("repetida") is True and e2["saldos"][USUARIO] == 5, "repetir la respuesta perdida NO suma otras 5"
    # Sin op_id (un cliente viejo) sigue sumando, como siempre.
    e3 = panel.post("/api/admin/estrellas", json={"jugadores": [USUARIO], "cantidad": 2}).json()
    assert e3["saldos"][USUARIO] == 7

    op3 = _op()
    r1 = panel.post("/api/admin/desbloqueos/retirar", json={"jugador": USUARIO, "clave": "item:casco", "op_id": op3}).json()
    r2 = panel.post("/api/admin/desbloqueos/retirar", json={"jugador": USUARIO, "clave": "item:casco", "op_id": op3}).json()
    assert r1["status"] == "ok" and r1["etiqueta"] and r1["saldo"] == 7 and r2.get("repetida") is True


def test_el_mismo_op_id_con_otro_cuerpo_en_estrellas_es_409(panel):
    op = _op()
    assert panel.post("/api/admin/estrellas", json={"jugadores": [USUARIO], "cantidad": 3, "op_id": op}).status_code == 200
    r = panel.post("/api/admin/estrellas", json={"jugadores": [USUARIO], "cantidad": 4, "op_id": op})
    assert r.status_code == 409 and r.json()["detail"] == "op_id reused"


def test_errores_de_desbloqueos_con_mensaje_en_castellano(panel):
    r = panel.post("/api/admin/estrellas", json={"jugadores": [USUARIO], "cantidad": "abc"})
    assert r.status_code == 400 and r.json()["detail"] == "cantidad required" and r.json()["mensaje"]
    r = panel.post("/api/admin/desbloqueos/conceder", json={"jugadores": [USUARIO], "claves": []})
    assert r.status_code == 400 and r.json()["detail"] == "claves required" and "pieza" in r.json()["mensaje"]


def test_conceder_y_estrellas_dejan_huella_en_el_registro(panel):
    panel.post("/api/admin/desbloqueos/conceder", json={"jugadores": [USUARIO], "claves": ["item:casco"], "motivo": "fiesta"})
    panel.post("/api/admin/estrellas", json={"jugadores": [USUARIO], "cantidad": 4})
    filas = _registro.list_entries(main.MATCH_LOG_DB, user=USUARIO, event_type="accion_de_admin")
    por_accion = {f["payload"]["accion"]: f["payload"] for f in filas}
    assert por_accion["vestuario:conceder"]["claves"] == ["item:casco"] and por_accion["vestuario:conceder"]["motivo"] == "fiesta"
    assert por_accion["vestuario:estrellas"]["estrellas"] == 4

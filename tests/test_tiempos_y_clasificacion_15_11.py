# -*- coding: utf-8 -*-
"""15/11: clasificación y tiempos (informe del 14/11, decisiones de Óscar).

H1  el tiempo de coleccionable / QR / mapa mudo / punto de control cuenta desde que el jugador ENTRA en el radio (la hora
    que manda el móvil en `evidence.abierto_ms`), no desde la «llegada» que vio el latido a ~90 m.
M1  «Dar por terminada» no deja primero a quien no jugó: «terminada por el panel», no apto, detrás de quien acabó jugando.
M2  sin GPS pagan el respaldo todos los nodos sin reto (punto de control, QR, coleccionable, mapa mudo).
M3  el precio del código de respaldo de un nodo no cambia una vez fijado.
M4  `/api/advance` acepta `ms_desde_la_victoria`: la espera hasta que llega el avance no engorda el tiempo observado.
M5  lo declarado y lo observado topan en lo mismo (30 min).
Extra: retroceder tras «Dar por terminada» con «respaldo» devuelve sólo lo de los nodos que se rehacen.

Misión sintética de checkpoints (tests/test_saltar_nodo_15_11.py): nada de datos reales.
"""
import os
import tempfile
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-tiempos-15-11-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import admin as admin_router  # noqa: E402
from backend.app.routers import desbloqueos as desbloqueos_router  # noqa: E402
from backend.app.runtime import exportar_partida, player_timers, proximidad, tiempos_de_nodo  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402
from test_saltar_nodo_15_11 import BASE, mision  # noqa: E402

UNO = "PLAYER 1"
S = 1000
MIN = 60 * S


def _ahora():
    return int(time.time() * 1000)


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.save_stages(main.STAGES_DB, mision())
    main.set_player_progress_level(UNO, 0)
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "MANUAL_POSITION_NOTICE_DB", str(tmp_path / "aviso_manual.json"))
    monkeypatch.setattr(main, "ADMIN_OPS_DB", str(tmp_path / "admin_ops.json"))
    main._LLEGADAS_ANOTADAS.clear()
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _advance(cliente, nivel, **extra):
    r = cliente.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": nivel, **extra})
    assert r.status_code == 200 and r.json()["status"] == "ok", r.text
    return r.json()


def _nodo(nivel):
    return main.load_player_timers()[UNO]["nodos"][str(nivel)]


def _entrada():
    return main.load_player_timers()[UNO]


def _ver_llegar(segundos_antes):
    """El latido ve al jugador dentro del radio del nodo 0 hace `segundos_antes` (la «llegada» del servidor)."""
    hace = time.time() - segundos_antes
    pos = {"lat": BASE["lat"], "lon": BASE["lon"], "accuracy": 5, "pos_at": hace, "source": "player"}
    main.anotar_llegada_al_nodo(UNO, pos, hace)


# ------------------------------------------------------------------------------------------ H1

def test_h1_cuenta_desde_la_entrada_al_radio_y_no_desde_la_llegada_del_latido(sitio):
    _ver_llegar(120)  # el latido le vio dentro de ~90 m hace 2 min
    assert _entrada()["llegadas"]["501"], "la llegada del latido está anotada"
    # El móvil abrió el nodo (entró en el radio) hace 20 s.
    _advance(sitio, 0, time_spent_ms=1_000, evidence={"v": 1, "abierto_ms": _ahora() - 20 * S})
    r = _nodo(0)
    assert 18 * S <= r["observed_ms"] <= 24 * S, r
    assert r["applied_ms"] == r["observed_ms"] and r["apertura_de"] == "movil"


def test_h1_sin_hora_del_movil_sigue_valiendo_la_llegada_del_servidor(sitio):
    _ver_llegar(120)
    _advance(sitio, 0, time_spent_ms=1_000, evidence={"v": 1})
    assert 115 * S <= _nodo(0)["applied_ms"] <= 130 * S


def test_h1_cordura_la_entrada_no_esta_en_el_futuro(sitio):
    # Reloj del móvil adelantado 10 min: la entrada se recorta a «ahora»: no cobra ni regala tiempo inventado.
    _advance(sitio, 0, time_spent_ms=5 * S, evidence={"v": 1, "abierto_ms": _ahora() + 10 * MIN})
    r = _nodo(0)
    assert r["observed_ms"] <= 1 * S and r["applied_ms"] == 5 * S


def test_h1_cordura_la_entrada_no_es_anterior_al_inicio_del_nodo(sitio):
    main.set_player_progress_level(UNO, 3)  # 504 y 505: dos puntos de control seguidos
    _advance(sitio, 3, time_spent_ms=1 * S)
    fin_del_anterior = _nodo(3)["completed_at_ms"]
    # Dice haber entrado en el nodo siguiente hace 10 min: antes de terminar el anterior. Cuenta desde que terminó éste.
    _advance(sitio, 4, time_spent_ms=1 * S, evidence={"v": 1, "abierto_ms": fin_del_anterior - 10 * MIN})
    r = _nodo(4)
    assert r["opened_at_ms"] >= fin_del_anterior and r["observed_ms"] < 5 * S, r


def test_h1_un_dato_roto_no_cobra_media_hora(sitio):
    # `abierto_ms: 1` (1970) o de hace horas no es un tiempo: se ignora (no 30 min de golpe).
    _advance(sitio, 0, time_spent_ms=3 * S, evidence={"v": 1, "abierto_ms": 1})
    assert _nodo(0)["applied_ms"] == 3 * S


def test_h1_se_corrige_el_reloj_del_movil_con_client_sent_at_ms(sitio):
    # Móvil con el reloj 10 min ATRASADO: sin corregir, «abierto hace 20 s» sería hace 10 min y 20 s.
    atraso = 10 * MIN
    _advance(
        sitio, 0, time_spent_ms=1 * S,
        evidence={"v": 1, "abierto_ms": _ahora() - atraso - 20 * S}, client_sent_at_ms=_ahora() - atraso,
    )
    assert 18 * S <= _nodo(0)["observed_ms"] <= 24 * S


def test_h1_por_la_cola_tambien_y_con_el_desfase_ya_aplicado(sitio):
    from datetime import datetime, timezone

    ahora = _ahora()
    iso = datetime.fromtimestamp(ahora / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    ev = {"client_event_id": "h1-cola", "type": "node_completed", "source": "offline_queue",
          "payload": {"code": "OK", "level_before": 0, "time_spent_ms": 1_000, "local_created_at": iso,
                      "evidence": {"v": 1, "abierto_ms": ahora - 25 * S}}}
    _ver_llegar(120)
    r = sitio.post("/api/events/sync", json={"user": UNO, "events": [ev]}).json()["events"]
    assert r[0]["status"] == "synced", r
    assert 23 * S <= _nodo(0)["observed_ms"] <= 30 * S


def test_h1_el_minijuego_no_cambia_su_reloj_arranca_con_comenzar(monkeypatch, sitio):
    main.set_player_progress_level(UNO, 1)
    monkeypatch.setattr(main._mision, "kind_del_nodo", lambda n: "minijuego")
    _advance(sitio, 1, time_spent_ms=1 * S, evidence={"v": 1, "abierto_ms": _ahora() - 50 * S})
    assert _nodo(1)["fuente"] == "minimo_sin_apertura", "la entrada de la hoja no es el inicio del reto"


def test_h1_se_vacian_las_llegadas_al_reiniciar_y_al_retroceder(sitio):
    _ver_llegar(30)
    assert main._LLEGADAS_ANOTADAS.get(UNO) == "501"
    main.set_player_progress_level(UNO, 0, desde_admin=True)  # reinicio / retroceso
    assert UNO not in main._LLEGADAS_ANOTADAS
    assert not _entrada().get("llegadas"), "y la llegada guardada era de la partida anterior"
    _ver_llegar(10)  # volver a pisar el nodo se vuelve a anotar
    assert main._LLEGADAS_ANOTADAS.get(UNO) == "501"
    main.clear_all_player_timers(UNO)
    assert UNO not in main._LLEGADAS_ANOTADAS and not _entrada().get("llegadas")


def test_h1_retroceder_borra_la_llegada_de_los_nodos_que_se_rehacen(sitio):
    main.set_player_progress_level(UNO, 2)
    main._player_timers.record_server_arrival(main.TIMERS_DB, UNO, "503", _ahora() - 5 * MIN)
    main.set_player_progress_level(UNO, 1, desde_admin=True)
    assert not _entrada().get("llegadas")


# ------------------------------------------------------------------------------------------ M1

def test_m1_la_clave_pone_la_terminada_por_el_panel_detras_de_quien_jugo():
    jugo = {"user": "A", "finished": True, "level": 8, "total_time_ms": 6 * MIN, "finished_at": 5}
    panel = {"user": "B", "finished": True, "level": 8, "total_time_ms": 5 * S, "finished_at": 1,
             "terminada_por_panel": True}
    sigue = {"user": "C", "finished": False, "level": 7, "total_time_ms": 1 * S}
    orden = sorted([sigue, panel, jugo], key=player_timers.clave_de_clasificacion)
    assert [j["user"] for j in orden] == ["A", "B", "C"], "con 5 s cobrados ganaba por delante de quien jugó 6 min"
    # Sin la marca, lo de siempre: gana el menor tiempo.
    panel.pop("terminada_por_panel")
    assert [j["user"] for j in sorted([jugo, panel], key=player_timers.clave_de_clasificacion)] == ["B", "A"]


def test_m1_dar_por_terminada_marca_no_apto_y_va_detras_en_panel_y_exportacion(monkeypatch, sitio):
    perfiles = [{"id": j, "display_name": j} for j in ("JUGO", "PANEL")]
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: perfiles)
    todos = len(main.get_runtime_stages())
    # JUGO: los ocho nodos, 6 min en total, a pelo.
    main.save_player_timers({"JUGO": {"stage_times_ms": {str(i): 45 * S for i in range(todos)}, "started_at": 1,
                                      "finished_at": 9_000_000_000_000}})
    main.set_player_progress_level("JUGO", todos)
    # PANEL: «Dar por terminada» cobrando 5 s: por total ganaría.
    antes = admin_router._aplicar_accion_de_perfil(main, "PANEL", "mark_finished", tiempo=("cifra", 5 * S))
    assert antes["finished"] and main.load_player_timers()["PANEL"]["terminada_por_panel"] is True

    jugadores = desbloqueos_router._tiempos_para_revisar(main)["jugadores"]
    assert [j["user"] for j in jugadores] == ["JUGO", "PANEL"], "panel de Tiempos"
    panel = jugadores[1]
    assert panel["terminada_por_panel"] is True and panel["apto_premio"] is False
    assert jugadores[0]["terminada_por_panel"] is False

    filas = exportar_partida._con_posiciones(exportar_partida._clasificacion(main)["jugadores"])
    assert [f["user"] for f in filas] == ["JUGO", "PANEL"], "exportación"
    assert [f["posicion"] for f in filas] == [1, 2]

    # La tabla que ve el móvil lleva la marca (sólo cuando es cierta) para ordenar igual.
    vivo = main.project_live_profile_status({"id": "PANEL", "display_name": "PANEL"}, total_nodes=todos)
    assert vivo["finished"] and vivo["terminada_por_panel"] is True
    assert "terminada_por_panel" not in main.project_live_profile_status({"id": "JUGO"}, total_nodes=todos)

    # Retroceder: ya no está terminada.
    admin_router._aplicar_accion_de_perfil(main, "PANEL", "level_prev")
    assert "terminada_por_panel" not in main.load_player_timers()["PANEL"]


def test_m1_quien_ya_habia_terminado_jugando_no_se_marca(sitio):
    main.set_player_progress_level(UNO, len(main.get_runtime_stages()))
    admin_router._aplicar_accion_de_perfil(main, UNO, "mark_finished")  # ya estaba al final: no avanza nada
    assert "terminada_por_panel" not in main.load_player_timers().get(UNO, {})


# ------------------------------------------------------------------------------------------ M2

@pytest.fixture
def cobrando(monkeypatch):
    monkeypatch.setattr(main, "COBRAR_CHECKPOINT_SIN_GPS", True)


NODOS_SIN_RETO = {
    "checkpoint": {"id": "c", "type": "checkpoint"},
    "qr": {"id": "q", "type": "qr"},
    "coleccionable": {"id": "g", "physical_node_kind": "collectible"},
    "mapa_mudo": {"id": "m", "config": {"game_id": "mapa_mudo"}},
}


@pytest.mark.parametrize("kind", sorted(NODOS_SIN_RETO))
def test_m2_sin_gps_pagan_el_respaldo_todos_los_nodos_sin_reto(cobrando, kind):
    nodo = NODOS_SIN_RETO[kind]
    assert main._mision.kind_del_nodo(nodo) == kind
    respaldo = main.penalizacion_de_respaldo_ms(nodo["id"])
    assert respaldo >= 60 * S
    sin_gps = {"veredicto": proximidad.SIN_GPS}
    assert main.penalizacion_checkpoint_sin_gps(0, nodo, sin_gps) == respaldo, "negar el GPS no regala el nodo"
    assert main.penalizacion_checkpoint_sin_gps(respaldo + 5 * S, nodo, sin_gps) == respaldo + 5 * S, "max, no suma"
    for veredicto in (proximidad.CERCA, proximidad.LEJOS, proximidad.MODO_PRUEBA, proximidad.NO_APLICA):
        assert main.penalizacion_checkpoint_sin_gps(0, nodo, {"veredicto": veredicto}) == 0


def test_m2_el_minijuego_sigue_sin_pagar_su_reto_ya_se_mide_con_el_reloj(cobrando):
    minijuego = {"id": "j", "type": "signal_hunt", "config": {"game_id": "spark_radar"}}
    assert main.penalizacion_checkpoint_sin_gps(0, minijuego, {"veredicto": proximidad.SIN_GPS}) == 0


def test_m2_en_linea_un_coleccionable_sin_gps_cobra_el_respaldo(cobrando, sitio):
    etapas = mision()
    etapas[0].update({"physical_node_kind": "collectible", "config": {"success_code": "QR-501"},
                      "minigame": {"type": "circuit_matrix", "config": {"game_id": "qr_collectible"}}})
    main.save_stages(main.STAGES_DB, etapas)
    assert main._mision.kind_del_nodo(main.get_runtime_stages()[0]) == "qr"
    r = sitio.post("/api/advance", json={"user": UNO, "code": "QR-501", "level_before": 0, "time_spent_ms": 1 * S,
                                         "penalty_ms": 0, "evidence": {"v": 1}})
    assert r.json()["status"] == "ok", r.text
    assert _entrada()["penalties_ms"] >= main.penalizacion_de_respaldo_ms("501")


# ------------------------------------------------------------------------------------------ M3

def test_m3_el_precio_no_cambia_aunque_cambien_los_demas(monkeypatch):
    def timers(*tiempos):
        return {f"J{i}": {"nodos": {"0": {"node_id": "7", "applied_ms": t, "manual": False}}}
                for i, t in enumerate(tiempos)}

    monkeypatch.setattr(main, "load_player_timers", lambda: timers(90 * S, 100 * S, 110 * S))
    assert main.penalizacion_de_respaldo_ms("7") == 100 * S

    # Pasa un minuto largo (caché caducada) y llegan jugadores más lentos: la mediana viva diría 130 s. El precio ya
    # está fijado: el mismo acto cuesta lo mismo a todos.
    main._RESPALDO_CACHE["hasta"] = 0.0
    monkeypatch.setattr(main, "load_player_timers", lambda: timers(90 * S, 100 * S, 110 * S, 200 * S, 210 * S, 220 * S))
    assert main.penalizacion_de_respaldo_ms("7") == 100 * S

    # También tras un reinicio del servidor (caché en memoria perdida): sale del fichero.
    main._RESPALDO_CACHE["hasta"] = 0.0
    main._RESPALDO_CACHE["valores"] = {}
    monkeypatch.setattr(main, "load_player_timers", lambda: {})
    assert main.penalizacion_de_respaldo_ms("7") == 100 * S


def test_m3_sin_datos_vale_el_minimo_y_el_rango_sigue_siendo_1_a_3_minutos(monkeypatch):
    monkeypatch.setattr(main, "load_player_timers", lambda: {})
    assert main.penalizacion_de_respaldo_ms("nuevo") == 60 * S
    lentos = {f"J{i}": {"nodos": {"0": {"node_id": "8", "applied_ms": 900 * S}}} for i in range(3)}
    monkeypatch.setattr(main, "load_player_timers", lambda: lentos)
    main._RESPALDO_CACHE["hasta"] = 0.0
    assert main.penalizacion_de_respaldo_ms("8") == 180 * S
    assert tiempos_de_nodo.PENALIZACION_RESPALDO_MIN_MS == 60 * S and tiempos_de_nodo.PENALIZACION_RESPALDO_MAX_MS == 180 * S


def test_m3_cambiar_la_salida_de_la_mision_empieza_otra_partida(monkeypatch):
    timers = {f"J{i}": {"nodos": {"0": {"node_id": "7", "applied_ms": t}}} for i, t in enumerate((90 * S, 100 * S, 110 * S))}
    monkeypatch.setattr(main, "load_player_timers", lambda: timers)
    assert main.penalizacion_de_respaldo_ms("7") == 100 * S
    for t in timers.values():
        t["nodos"]["0"]["applied_ms"] *= 2
    monkeypatch.setattr(main, "_salida_de_la_mision_ms", lambda: 12345)
    main._RESPALDO_CACHE["hasta"] = 0.0
    assert main.penalizacion_de_respaldo_ms("7") == 180 * S, "otra partida: se vuelve a calcular"


# ------------------------------------------------------------------------------------------ M4

def test_m4_la_espera_desde_la_victoria_no_engorda_el_tiempo_observado(sitio):
    _ver_llegar(60)
    # Entró hace 60 s y ganó hace 25 s: el avance tardó 25 s en llegar (cobertura). Cuenta 35 s, no 60.
    _advance(sitio, 0, time_spent_ms=1 * S, ms_desde_la_victoria=25 * S,
             evidence={"v": 1, "abierto_ms": _ahora() - 60 * S})
    r = _nodo(0)
    assert 33 * S <= r["observed_ms"] <= 37 * S, r


def test_m4_sin_el_dato_o_con_uno_implausible_vale_la_llegada_de_siempre(sitio):
    assert main.hora_de_la_victoria(None, 1_000_000) == 1_000_000
    assert main.hora_de_la_victoria("x", 1_000_000) == 1_000_000
    assert main.hora_de_la_victoria(-5, 1_000_000) == 1_000_000
    assert main.hora_de_la_victoria(0, 1_000_000) == 1_000_000
    assert main.hora_de_la_victoria(main.MAX_MS_DESDE_LA_VICTORIA + 1, 1_000_000) == 1_000_000, "un móvil no se resta una hora"
    assert main.hora_de_la_victoria(12_000, 1_000_000) == 988_000
    _advance(sitio, 0, time_spent_ms=1 * S, ms_desde_la_victoria=10 * MIN)  # no rompe ni resta
    assert _nodo(0)["applied_ms"] >= 0


def test_m4_el_cliente_manda_los_dos_campos():
    from pathlib import Path

    api = (Path(main.__file__).parent / "frontend" / "src" / "shared" / "api.ts").read_text(encoding="utf-8")
    assert "ms_desde_la_victoria" in api and "client_sent_at_ms" in api and "crearCuerpo()" in api
    envio = (Path(main.__file__).parent / "frontend" / "src" / "player" / "avance" / "enviarCodigo.ts").read_text(encoding="utf-8")
    assert "const victoriaEn = Date.now()" in envio and "victoriaEn\n" in envio.replace("\r\n", "\n")


# ------------------------------------------------------------------------------------------ M5

def test_m5_declarado_y_observado_topan_en_lo_mismo():
    assert tiempos_de_nodo.TOPE_DECLARADO_MS == tiempos_de_nodo.TOPE_OBSERVADO_MS == 30 * MIN
    r = tiempos_de_nodo.tiempo_de_nodo(2 * 3600 * S, None, _ahora(), ahora_ms=_ahora())
    assert r["declared_ms"] == r["applied_ms"] == 30 * MIN


# ------------------------------------------------------------------------------------------ extra

def test_retroceder_tras_dar_por_terminada_con_respaldo_devuelve_solo_el_nodo_que_se_rehace(sitio):
    main.set_player_progress_level(UNO, 5)
    r = admin_router._aplicar_accion_de_perfil(main, UNO, "mark_finished", tiempo=("respaldo", 0))
    cobrado = r["tiempo_cobrado_ms"]
    precios = [main.penalizacion_de_respaldo_ms(str(501 + i)) for i in range(5, 8)]
    assert cobrado == sum(precios) and _entrada()["penalties_ms"] == cobrado
    assert _entrada()["saltos_ms"] == {"5": precios[0], "6": precios[1], "7": precios[2]}

    atras = admin_router._aplicar_accion_de_perfil(main, UNO, "level_prev")  # vuelve al último nodo (el 7)
    assert atras["tiempo_devuelto_ms"] == precios[2], "sólo lo que costó el nodo que va a repetir"
    assert _entrada()["penalties_ms"] == precios[0] + precios[1]
    # Si lo juega y lo pasa, paga su tiempo de juego y ya no el respaldo de ese nodo.
    _advance(sitio, 7, time_spent_ms=30 * S)
    assert _entrada()["penalties_ms"] == precios[0] + precios[1]


def test_con_cifra_fija_todo_se_apunta_en_el_nivel_de_partida_como_siempre(sitio):
    main.set_player_progress_level(UNO, 5)
    admin_router._aplicar_accion_de_perfil(main, UNO, "mark_finished", tiempo=("cifra", 45 * S))
    assert _entrada()["saltos_ms"] == {"5": 45 * S}

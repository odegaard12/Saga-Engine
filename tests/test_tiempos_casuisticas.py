# -*- coding: utf-8 -*-
"""Matriz de casuísticas del TIEMPO que decide la clasificación (26/10), parte del servidor.

La parte del navegador (cerrar y reabrir, recargar, pantalla apagada, sin red, reloj del móvil, reinicio del servidor,
reset del panel) se prueba con Playwright en sim/playwright-bench; aquí: duplicados, reintentos tras un timeout,
reabrir un nodo superado, nodos sin tiempo, último nodo y clasificación, dos jugadores a la vez, modo prueba y que lo
guardado sobrevive a un reinicio. Nada de datos reales.
"""
import os
import tempfile
import time
from datetime import datetime, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-casuisticas-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import player_timers  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

UNO = "PLAYER 1"
DOS = "PLAYER 2"
S = 1000


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _ahora():
    return int(time.time() * 1000)


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "MANUAL_POSITION_NOTICE_DB", str(tmp_path / "aviso_manual.json"))
    main.set_player_progress_level(DOS, 0)
    main._RESPALDO_CACHE["hasta"] = 0.0
    c = TestClient(main.app)
    assert c.get("/api/game/PLAYER%201").status_code == 200
    return c


def _cliente_de(usuario):
    # Una sesión de jugador por cliente: la cookie es de quien entró último.
    c = TestClient(main.app)
    assert c.get("/api/game/" + usuario.replace(" ", "%20")).status_code == 200
    return c


def _sync(c, eventos, usuario=UNO):
    r = c.post("/api/events/sync", json={"user": usuario, "events": eventos})
    assert r.status_code == 200, r.text
    return r.json()["events"]


def _abrir(cid, nodo, en_ms):
    return {"client_event_id": cid, "type": "node_opened", "node_id": str(nodo), "payload": {"local_created_at": _iso(en_ms)}}


def _completar(cid, nivel, en_ms, declarado, codigo="OK", **payload):
    return {
        "client_event_id": cid,
        "type": "node_completed",
        "source": "offline_queue",
        "payload": {"code": codigo, "level_before": nivel, "time_spent_ms": declarado, "local_created_at": _iso(en_ms), **payload},
    }


def _timers(u=UNO):
    return main.load_player_timers().get(u, {})


def _pen(u=UNO):
    return int(_timers(u).get("penalties_ms") or 0)


def _tiempo_del_nodo(nivel, u=UNO):
    return int((_timers(u).get("stage_times_ms") or {}).get(str(nivel), 0))


def test_un_evento_duplicado_no_duplica_ni_tiempo_ni_penalizacion(sitio):
    ev = _completar("dup-1", 0, _ahora(), 20 * S, penalty_ms=30 * S)
    primero = _sync(sitio, [ev])
    segundo = _sync(sitio, [ev])
    assert primero[0]["status"] == "synced" and segundo[0]["status"] == "synced"
    assert main.get_player_progress_level(UNO, 0) == 1
    assert _pen() == 30 * S
    assert _tiempo_del_nodo(0) == 20 * S


def test_el_reintento_tras_un_timeout_no_cobra_dos_veces(sitio):
    """El móvil mandó el avance, se cortó la respuesta y lo reintenta (en línea y luego por la cola)."""
    cuerpo = {"user": UNO, "code": "OK", "level_before": 0, "time_spent_ms": 25 * S, "penalty_ms": 45 * S}
    assert sitio.post("/api/advance", json=cuerpo).json()["status"] == "ok"
    sitio.post("/api/advance", json=cuerpo)  # el reintento no puede avanzar otro nodo ni cobrar otra vez
    _sync(sitio, [_completar("reintento-cola", 0, _ahora(), 25 * S, penalty_ms=45 * S)])
    assert main.get_player_progress_level(UNO, 0) == 1, "ni el reintento ni su eco por la cola avanzan otro nodo"
    assert _pen() == 45 * S
    assert _tiempo_del_nodo(0) == 25 * S


def test_abrir_de_nuevo_un_nodo_ya_superado_no_toca_su_tiempo(sitio):
    ahora = _ahora()
    _sync(sitio, [_abrir("o1", 101, ahora - 40 * S), _completar("c1", 0, ahora, 5 * S)])
    antes = _tiempo_del_nodo(0)
    assert antes >= 38 * S, "el servidor vio 40 s entre la apertura y el avance"
    _sync(sitio, [_abrir("o1-otra-vez", 101, ahora + 5 * S)])
    assert _tiempo_del_nodo(0) == antes
    assert main.get_player_progress_level(UNO, 0) == 1


def test_los_nodos_de_paso_no_suman_tiempo(sitio):
    r = sitio.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 0, "time_spent_ms": 0})
    assert r.json()["status"] == "ok"
    assert _tiempo_del_nodo(0) == 0
    assert _pen() == 0
    assert main.get_player_total_time_ms(UNO) == 0


def test_ultimo_nodo_total_y_clasificacion(sitio):
    """Seis nodos: total = suma de nodos + penalizaciones; gana el menor tiempo entre quienes terminan."""
    tiempos = [0, 0, 40 * S, 55 * S, 30 * S, 70 * S]
    for nivel, ms in enumerate(tiempos):
        extra = {"penalty_ms": 60 * S} if nivel == 3 else {}
        codigo = "SAGA_QR_1" if nivel == 1 else "OK"
        r = sitio.post("/api/advance", json={"user": UNO, "code": codigo, "level_before": nivel, "time_spent_ms": ms, **extra}).json()
        assert r["status"] == "ok", (nivel, r)
    assert main.get_player_progress_level(UNO, 0) == 6
    por_nodo = [_tiempo_del_nodo(n) for n in range(6)]
    assert por_nodo[0] == 0, "el punto de control no cuenta"
    # El nodo 1 de esta ruta de prueba es un minijuego de señales sin apertura: no baja de 30 s (auditoría 25/10).
    assert por_nodo[1] == 30 * S and por_nodo[2:] == tiempos[2:]
    assert main.get_player_total_time_ms(UNO) == sum(por_nodo) + 60 * S
    dos = _cliente_de(DOS)
    for nivel in range(3):
        codigo = "SAGA_QR_1" if nivel == 1 else "OK"
        assert dos.post("/api/advance", json={"user": DOS, "code": codigo, "level_before": nivel, "time_spent_ms": 5 * S}).json()["status"] == "ok"
    sitio.cookies.clear()
    jugadores = [
        {"user": DOS, "level": 3, "finished": False, "total_time_ms": main.get_player_total_time_ms(DOS)},
        {"user": UNO, "level": 6, "finished": True, "total_time_ms": main.get_player_total_time_ms(UNO), "finished_at": 2},
    ]
    ordenados = sorted(jugadores, key=player_timers.clave_de_clasificacion)
    assert [j["user"] for j in ordenados] == [UNO, DOS]


def test_dos_jugadores_a_la_vez_no_se_mezclan(sitio):
    a = _ahora()
    _sync(sitio, [_abrir("a-o", 101, a - 30 * S), _completar("a-c", 0, a, 1 * S, penalty_ms=15 * S)], UNO)
    _sync(_cliente_de(DOS), [_abrir("b-o", 101, a - 90 * S), _completar("b-c", 0, a, 1 * S)], DOS)
    assert _pen(UNO) == 15 * S and _pen(DOS) == 0
    assert 28 * S <= _tiempo_del_nodo(0, UNO) <= 32 * S
    assert 88 * S <= _tiempo_del_nodo(0, DOS) <= 92 * S


def test_el_modo_prueba_cuenta_el_tiempo_pero_queda_marcado(sitio):
    """Una posición escrita a mano (modo prueba): el tiempo se cuenta igual y el nodo queda con la marca `prueba`."""
    sitio.post("/api/heartbeat", json={"user": UNO, "lat": 40.5, "lon": -3.5, "accuracy": 5, "source": "manual", "gps_status": "ok"})
    ahora = _ahora()
    _sync(sitio, [_abrir("p-o", 101, ahora - 20 * S), _completar("p-c", 0, ahora, 2 * S)])
    nodo = _timers()["nodos"]["0"]
    assert nodo["applied_ms"] >= 18 * S
    assert nodo.get("prueba") is True


def test_lo_guardado_sobrevive_a_un_reinicio_del_servidor(sitio):
    """«Reiniciar» = volver a leer del disco: la apertura sigue ahí y el avance posterior la usa."""
    ahora = _ahora()
    _sync(sitio, [_abrir("r-o", 101, ahora - 50 * S)])
    main._RESPALDO_CACHE["hasta"] = 0.0  # lo único que vive sólo en memoria
    _sync(sitio, [_completar("r-c", 0, ahora, 1 * S)])
    assert _tiempo_del_nodo(0) >= 48 * S


def test_la_apertura_del_movil_sustituye_a_la_llegada_y_el_tiempo_puede_bajar(sitio):
    """El juego rápido se supera antes de que el aviso `node_opened` se suba: mientras tanto vale la llegada que vio el
    servidor (incluye leer y preparar el reto), y al llegar la del móvil se recalcula hacia ABAJO."""
    ahora = _ahora()
    # El servidor vio al jugador dentro del radio hace 90 s; empezó el reto hace 30 s.
    main._player_timers.record_server_arrival(main.TIMERS_DB, UNO, "101", ahora - 90 * S)
    r = sitio.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 0, "time_spent_ms": 30 * S})
    assert r.json()["status"] == "ok"
    antes = _tiempo_del_nodo(0)
    assert antes >= 88 * S, "sin el aviso del móvil vale la llegada (suelo contra quien calla la apertura)"
    assert _timers()["nodos"]["0"]["apertura_de"] == "llegada"
    # Llega por la cola el aviso del móvil, con su hora real: hace 31 s.
    _sync(sitio, [_abrir("tarde", 101, ahora - 31 * S)])
    despues = _tiempo_del_nodo(0)
    assert despues <= 33 * S, (antes, despues)
    assert _timers()["nodos"]["0"]["apertura_de"] == "movil"
    assert main.get_player_total_time_ms(UNO) == despues
    # Otro aviso posterior (un duplicado con otra hora) ya no puede empeorarlo ni mejorarlo por debajo de lo declarado.
    _sync(sitio, [_abrir("tarde-2", 101, ahora - 5 * S)])
    assert _tiempo_del_nodo(0) >= 30 * S

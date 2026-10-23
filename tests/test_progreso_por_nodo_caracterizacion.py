# -*- coding: utf-8 -*-
"""Fase 0 de «progreso por id de nodo»: fija CÓMO se comporta hoy el avance.

Antes de tocar nada se escribe lo que hace el servidor con la cola sin cobertura
y con la edición de la misión: el eco (`already_advanced`), ir por detrás
(`behind`), el reinicio (`stale_before_reset`), borrar un nodo ya hecho y el
retroceso del panel con sus tiempos. Todo esto tiene que seguir igual después
de la entrega 1; lo único que cambia es el caso del bug, que aquí queda
documentado.

El bug: editar la misión con un jugador sin cobertura que ya jugó el nodo D deja
en su cola un `node_completed` con `node_id=D` y el `level_before` ANTIGUO. El
servidor decidía por `level_before` y lo cerraba como `already_advanced`: D
volvía a quedar pendiente. Este test nació como `xfail(strict=True)` y se
arregló con el punto 3 de la entrega (el id manda sobre `level_before`); el
segundo test reproduce el comportamiento viejo anulando el reconocimiento del id.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-carac-nodo-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision, ruta_de_seis_nodos  # noqa: E402

USUARIO = "PLAYER 1"
CODIGOS = ["OK", "SAGA_QR_1", "OK", "OK", "OK", "OK"]
IDS = ["101", "102", "103", "104", "105", "106"]


def _cliente():
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _hai(minutos_atras):
    momento = datetime.now(timezone.utc) - timedelta(minutes=minutos_atras)
    return momento.isoformat().replace("+00:00", "Z")


def _avance(nivel, minutos_atras, con_id=True, eid=None, level_before=None):
    """Un node_completed del nodo `nivel` (de la ruta de 6) tal como lo encola el móvil."""
    evento = {
        "client_event_id": eid or f"carac-{nivel}",
        "type": "node_completed",
        "source": "offline_queue",
        "payload": {
            "code": CODIGOS[nivel],
            "level_before": nivel if level_before is None else level_before,
            "time_spent_ms": 20_000,
            "penalty_ms": 0,
            "local_created_at": _hai(minutos_atras),
            "offline_at_creation": True,
            "evidence": {"v": 1, "via": "qr" if nivel == 1 else "juego"},
        },
    }
    if con_id:
        evento["node_id"] = IDS[nivel]
    return evento


def _sincronizar(cliente, eventos):
    respuesta = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos})
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["events"]


def _jugar(cliente, hasta, con_id=True):
    """El jugador supera los nodos 0..hasta-1 por la cola."""
    resultado = _sincronizar(cliente, [_avance(n, 40 - n * 5, con_id=con_id) for n in range(hasta)])
    assert all(e["status"] == "synced" for e in resultado), resultado
    assert main.get_player_progress_level(USUARIO, 0) == hasta


def _con_nodo_nuevo_en(indice, id_nuevo=150):
    antes = ruta_de_seis_nodos()
    despues = ruta_de_seis_nodos()
    despues.insert(
        indice,
        {
            "id": id_nuevo,
            "title": "Nuevo",
            "lat": 40.5,
            "lon": -3.5,
            "radius": 25,
            "minigame": {"type": "checkpoint", "config": {}},
            "config": {},
        },
    )
    return antes, despues


def _guardar_mision(antes, despues):
    main.save_stages(main.STAGES_DB, despues)
    main.reindex_player_levels_on_save(antes, despues)


# ---------------------------------------------------------------------------
# El caso del bug
# ---------------------------------------------------------------------------

def test_insertar_un_nodo_delante_no_pierde_el_nodo_encolado(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()
    _jugar(cliente, 3)

    # El jugador pierde cobertura, juega el nodo 104 (índice 3) y lo deja en la cola.
    d = _avance(3, 5)
    # Mientras tanto el organizador inserta un nodo nuevo en el índice 1.
    _guardar_mision(*_con_nodo_nuevo_en(1))
    assert main.get_player_progress_level(USUARIO, 0) == 4  # ahora 104 es el índice 4

    (resultado,) = _sincronizar(cliente, [d])

    assert resultado["status"] == "synced", resultado
    assert main.get_player_progress_level(USUARIO, 0) == 5


def test_sin_reconocer_el_id_el_bug_se_reproduce(monkeypatch, tmp_path):
    """El comportamiento de antes, para que quede escrito: sólo `level_before` decide."""
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "_veredicto_por_id", lambda *a, **k: None)
    cliente = _cliente()
    _jugar(cliente, 3)

    d = _avance(3, 5)
    _guardar_mision(*_con_nodo_nuevo_en(1))

    (resultado,) = _sincronizar(cliente, [d])

    assert resultado["status"] == "ignored"
    assert resultado["error"] == "already_advanced"
    assert main.get_player_progress_level(USUARIO, 0) == 4, "D se perdía: seguía pendiente"


# ---------------------------------------------------------------------------
# Lo que NO cambia
# ---------------------------------------------------------------------------

def test_eco_el_mismo_nodo_dos_veces_es_already_advanced(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()
    _jugar(cliente, 2)

    # Mismo avance del nodo 1 con otro client_event_id (reintento del móvil).
    (eco,) = _sincronizar(cliente, [_avance(1, 30, eid="otro-id")])

    assert eco["status"] == "ignored"
    assert eco["error"] == "already_advanced"
    assert main.get_player_progress_level(USUARIO, 0) == 2


def test_eco_sin_node_id_tambien_se_decide_por_level_before(monkeypatch, tmp_path):
    """Un móvil viejo no manda `node_id`: se conserva el comportamiento de siempre."""
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()
    _jugar(cliente, 2, con_id=False)

    (eco,) = _sincronizar(cliente, [_avance(1, 30, con_id=False, eid="otro-id")])

    assert (eco["status"], eco["error"]) == ("ignored", "already_advanced")
    assert main.get_player_progress_level(USUARIO, 0) == 2


def test_behind_si_falta_un_avance_anterior(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()
    _jugar(cliente, 1)

    # El jugador va por el nodo 1 y llega el 3: falta el 2.
    for con_id in (True, False):
        (resultado,) = _sincronizar(cliente, [_avance(3, 5, con_id=con_id, eid=f"adelante-{con_id}")])
        assert resultado["status"] == "failed"
        assert resultado["error"] == "behind"
    assert main.get_player_progress_level(USUARIO, 0) == 1


def test_stale_before_reset_no_deshace_el_reinicio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()
    _jugar(cliente, 2)

    main.set_player_progress_level(USUARIO, 0, desde_admin=True)
    main.bump_reset_marker(USUARIO)

    # Un avance encolado ANTES del reinicio (partida borrada) no resucita nada.
    (resultado,) = _sincronizar(cliente, [_avance(0, 30, eid="viejo-0")])

    assert resultado["status"] == "ignored"
    assert resultado["error"] == "stale_before_reset"
    assert main.get_player_progress_level(USUARIO, 0) == 0


def test_borrar_un_nodo_ya_hecho_baja_el_nivel_y_avisa_al_movil(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = _cliente()
    _jugar(cliente, 3)
    antes = ruta_de_seis_nodos()
    despues = [n for n in ruta_de_seis_nodos() if n["id"] != 102]
    reinicio_antes = main.player_progress_reset_at(USUARIO)

    _guardar_mision(antes, despues)

    # Había hecho 101, 102 y 103: sin el 102 le quedan 101 y 103 -> próximo = 104.
    assert main.get_player_progress_level(USUARIO, 0) == 2
    assert main.player_progress_reset_at(USUARIO) > reinicio_antes, "bajó de nivel: el móvil tiene que enterarse"


def test_retroceso_del_panel_borra_los_tiempos_de_lo_que_se_repite(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    for nivel, ms in ((0, 5000), (1, 4000), (2, 33000)):
        main.set_player_progress_level(USUARIO, nivel + 1)
        main.record_player_stage_time(USUARIO, nivel, ms)

    main.set_player_progress_level(USUARIO, 1, desde_admin=True)

    tiempos = (main.load_player_timers().get(USUARIO) or {}).get("stage_times_ms") or {}
    assert int(tiempos.get("0") or 0) == 5000
    assert int(tiempos.get("1") or 0) == 0
    assert int(tiempos.get("2") or 0) == 0
    assert main.get_player_progress_level(USUARIO, 0) == 1


def test_hacia_atras_no_se_va_fuera_del_panel(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.set_player_progress_level(USUARIO, 3)

    main.set_player_progress_level(USUARIO, 1)  # un rebote de la red, no del panel

    assert main.get_player_progress_level(USUARIO, 0) == 3

# -*- coding: utf-8 -*-
"""Auditoría 25/10: el aviso «OK» de los minijuegos no supera un nodo QR, y el código de respaldo paga su
penalización aunque el móvil lo mande con `manual: false` (en línea y por la cola sin cobertura)."""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-codigos-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision, ruta_de_seis_nodos  # noqa: E402

UNO = "PLAYER 1"


def _ruta():
    nodos = ruta_de_seis_nodos()
    # Nodo 1 como los QR reales: «qr_collectible» con su pegatina y un respaldo.
    nodos[1]["minigame"] = {"type": "signal_hunt", "config": {"game_id": "qr_collectible", "fallback_code": "RESPALDO1"}}
    nodos[1]["config"] = {"game_id": "qr_collectible", "fallback_code": "RESPALDO1"}
    return nodos


@pytest.fixture
def c(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.save_stages(main.STAGES_DB, _ruta())
    main.set_player_progress_level(UNO, 1)
    cl = TestClient(main.app)
    assert cl.get("/api/game/PLAYER%201").status_code == 200
    return cl


def _avance(c, code, manual=False):
    return c.post("/api/advance", json={"user": UNO, "code": code, "manual": manual, "level_before": 1, "time_spent_ms": 60000}).json()


def test_ok_no_supera_un_qr(c):
    assert _avance(c, "OK")["status"] != "ok"
    assert main.get_player_progress_level(UNO, 0) == 1


def test_la_pegatina_si_y_sin_penalizacion(c):
    assert _avance(c, "SAGA_QR_1")["status"] == "ok"
    assert not main.load_player_timers()[UNO].get("penalties_ms")


def test_respaldo_con_manual_false_paga(c):
    assert _avance(c, "RESPALDO1", manual=False)["status"] == "ok"
    assert int(main.load_player_timers()[UNO].get("penalties_ms") or 0) >= main.PENALIZACION_CODIGO_A_MANO_MS


def test_respaldo_por_la_cola_tambien_paga(c):
    ev = {"client_event_id": "r1", "type": "node_completed", "payload": {"code": "RESPALDO1", "manual": False, "level_before": 1, "time_spent_ms": 60000}}
    r = c.post("/api/events/sync", json={"user": UNO, "events": [ev]}).json()
    assert r["events"][0]["status"] != "failed", r
    assert int(main.load_player_timers()[UNO].get("penalties_ms") or 0) >= main.PENALIZACION_CODIGO_A_MANO_MS


def test_ok_sigue_valiendo_en_checkpoint_y_minijuego(c):
    main.set_player_progress_level(UNO, 0)
    assert c.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 0, "time_spent_ms": 0}).json()["status"] == "ok"
    main.set_player_progress_level(UNO, 5)
    assert c.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 5, "time_spent_ms": 90000}).json()["status"] == "ok"


# ---------------------------------------------------------------- GPS de depuración (auditoría 25/10)

def test_gps_de_prueba_solo_con_la_sesion_del_panel(c):
    assert "gps_de_prueba" not in c.get("/api/game/PLAYER%201?fresh=1").json()
    c.cookies.set(main.ADMIN_SESSION_COOKIE, main.create_admin_session())
    assert c.get("/api/game/PLAYER%201?fresh=1").json().get("gps_de_prueba") is True


def test_el_shim_no_planta_al_jugador_sin_permiso():
    from pathlib import Path

    raiz = Path(__file__).resolve().parents[1]
    shim = (raiz / "frontend/src/player/utils/debugGeolocationShim.ts").read_text(encoding="utf-8")
    assert "if (!import.meta.env.DEV && payload?.gps_de_prueba !== true) return null" in shim
    banco = (raiz / "scripts/banco-de-simulacion.js").read_text(encoding="utf-8")
    assert "datos.gps_de_prueba = true" in banco

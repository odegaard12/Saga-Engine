# -*- coding: utf-8 -*-
"""Auditoría 25/10: el tiempo de un nodo ya no lo decide sólo el móvil.

Sin `node_opened` cuenta la llegada al nodo que vio el servidor por el latido; sin ninguna de las dos, un minijuego
no baja de MINIMO_MINIJUEGO_SIN_APERTURA_MS y queda como sospechoso."""
import os
import tempfile
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-tiempos25-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import tiempos_de_nodo  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

UNO = "PLAYER 1"


@pytest.fixture
def c(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main._LLEGADAS_ANOTADAS.clear()
    main.set_player_progress_level(UNO, 5)  # «Pulso»: minijuego
    cl = TestClient(main.app)
    assert cl.get("/api/game/PLAYER%201").status_code == 200
    return cl


def _avanzar(c):
    r = c.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 5, "time_spent_ms": 1}).json()
    assert r["status"] == "ok", r
    return main.load_player_timers()[UNO]["nodos"]["5"]


def test_minijuego_sin_ninguna_apertura_tiene_suelo(c):
    reg = _avanzar(c)
    assert reg["applied_ms"] >= tiempos_de_nodo.MINIMO_MINIJUEGO_SIN_APERTURA_MS
    assert reg["fuente"] == "minimo_sin_apertura" and reg["sospechoso"]


def test_la_llegada_que_vio_el_servidor_cuenta(c):
    hace = time.time() - 120
    main.anotar_llegada_al_nodo(UNO, {"lat": 40.5, "lon": -3.5, "accuracy": 5, "pos_at": hace, "source": "player"}, hace)
    reg = _avanzar(c)
    assert 110_000 <= reg["applied_ms"] <= 130_000, reg


def test_lejos_del_nodo_no_hay_llegada(c):
    hace = time.time() - 120
    main.anotar_llegada_al_nodo(UNO, {"lat": 41.5, "lon": -3.5, "accuracy": 5, "pos_at": hace, "source": "player"}, hace)
    assert not (main.load_player_timers().get(UNO) or {}).get("llegadas")


def test_el_panel_lo_marca_no_apto_para_premio(c):
    _avanzar(c)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, main.create_admin_session())
    datos = c.post("/api/admin/tiempos", json={}).json()
    yo = next(j for j in datos["jugadores"] if j["user"] == UNO)
    assert yo["apto_premio"] is False


def test_un_avance_escribe_los_relojes_una_sola_vez(c, monkeypatch):
    from backend.app.storage import json_store

    escrituras = []
    original = json_store._write_text_unlocked

    def contar(file, texto):
        if os.path.abspath(file) == os.path.abspath(main.TIMERS_DB):
            escrituras.append(file)
        return original(file, texto)

    monkeypatch.setattr(json_store, "_write_text_unlocked", contar)
    main.set_player_progress_level(UNO, 2)  # un nodo de en medio: sin fin de ruta
    escrituras.clear()
    r = c.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 2, "time_spent_ms": 60000}).json()
    assert r["status"] == "ok", r
    # El tiempo del nodo, el inicio y la penalización en una (antes, tres); el nivel anota su avance aparte.
    assert len(escrituras) <= 2, escrituras


def test_game_timers_se_guarda_compacto(tmp_path):
    from backend.app.storage import json_store

    f = tmp_path / "game_timers.json"
    json_store.save_json(str(f), {"a": {"b": 1}})
    assert f.read_text(encoding="utf-8") == '{"a":{"b":1}}'

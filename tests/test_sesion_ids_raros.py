# -*- coding: utf-8 -*-
"""Revisión 19/10/2026: un jugador cuyo id lleva un punto (o apóstrofo, coma…) entraba y luego no podía jugar.

La sesión salía con el id «limpio» («AnaG») y al comprobarla se comparaba con el id tal cual («Ana.G»): el latido, el
avance y la sincronización daban 403 y el móvil lo tapaba. Ahora la sesión guarda el id tal cual.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ids-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", "")
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    cfg = main.load_config()
    cfg["player_profiles"] = [
        {"id": "Ana.G", "display_name": "Ana"},
        {"id": "O'Neill", "display_name": "Neill"},
        {"id": "Luis", "display_name": "Luis"},
    ]
    cfg["players"] = ["Ana.G", "O'Neill", "Luis"]
    main.save_config(cfg)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    return TestClient(main.app)


@pytest.mark.parametrize("jugador", ["Ana.G", "O'Neill", "Luis"])
def test_con_cualquier_id_la_sesion_vale_para_el_latido(cliente, jugador):
    assert cliente.get(f"/api/game/{jugador}").status_code == 200
    r = cliente.post("/api/heartbeat", json={"user": jugador, "lat": 42.6, "lon": -8.7})
    assert r.status_code == 200, r.text


def test_la_normalizacion_solo_quita_lo_invisible():
    assert main.normalize_player_session_user("  Ana.G  ") == "Ana.G"
    assert main.normalize_player_session_user("O'Neill") == "O'Neill"
    assert main.normalize_player_session_user("Ana\x00G") == "AnaG"


def test_el_codigo_de_la_pegatina_vale_con_las_mismas_variantes_que_el_movil():
    """Revisión 19/10: el móvil acepta sin cobertura «SAGA01» por «SAGA_01» (`qr_hashes`); el servidor también."""
    from backend.app.runtime.mision import stage_accepts_code
    nodo = {"qr_payload": "SAGA_01"}
    assert stage_accepts_code(nodo, "SAGA_01") and stage_accepts_code(nodo, "SAGA01") and stage_accepts_code(nodo, "saga 01")
    assert not stage_accepts_code(nodo, "SAGA02")

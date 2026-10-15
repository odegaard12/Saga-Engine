# -*- coding: utf-8 -*-
"""Auditoría 15/10/2026, fase 0: con la clave de misión puesta, toda /api/* exige su cookie.

Sin cookie, 401; con la cookie de /api/acceso (o una sesión de admin), pasa. Fuera quedan sólo entrar, el login
del panel, /api/version y /api/salud. La clave sale de SAGA_CLAVE_TEMPORAL y, al cambiarla, caen las sesiones.
"""
from fastapi.testclient import TestClient

import main

CERRADAS_GET = [
    "/api/config", "/api/game/PLAYER 1", "/api/state/PLAYER 1", "/api/team/PLAYER 1", "/api/player-avatar/PLAYER 1",
    "/api/personaje/PLAYER 1", "/api/desbloqueos/PLAYER 1", "/api/tiempo", "/api/edificios", "/api/road-graph",
    "/api/field-proofs",
]
CERRADAS_POST = [
    "/api/teselas/lote", "/api/advance", "/api/heartbeat", "/api/reaccion", "/api/personaje", "/api/events/sync",
    "/api/desbloqueos/visto", "/api/client-errors",
]


def _cliente(monkeypatch, tmp_path, clave="Clave-De-Prueba-7"):
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "MISSION_UNLOCK_ATTEMPTS", {})
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", clave)
    main.ensure_mission_auth()
    return TestClient(main.app)


def test_sin_cookie_toda_la_api_da_401(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    for ruta in CERRADAS_GET:
        assert c.get(ruta).status_code == 401, ruta
    for ruta in CERRADAS_POST:
        assert c.post(ruta, json={}).status_code == 401, ruta
    # Quedan fuera: la salud y la versión (monitores) y el propio acceso.
    assert c.get("/api/salud").status_code != 401 and c.get("/api/version").status_code == 200


def test_con_la_clave_pasa_y_al_cambiarla_caen_las_sesiones(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    assert c.post("/api/acceso", json={"password": "mal"}).status_code == 403
    ok = c.post("/api/acceso", json={"password": "Clave-De-Prueba-7"})
    assert ok.status_code == 200 and "saga_mission" in ok.headers.get("set-cookie", "")
    assert "httponly" in ok.headers["set-cookie"].lower() and "samesite=lax" in ok.headers["set-cookie"].lower()
    assert c.get("/api/config").status_code == 200
    # Nueva clave en el entorno + arranque: la cookie vieja ya no vale.
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", "Otra-Clave-9")
    main.ensure_mission_auth()
    assert c.get("/api/config").status_code == 401


def test_el_admin_entra_con_su_sesion_sin_la_clave(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "verify_admin_session_token", lambda token: token == "sesion-admin")
    c.cookies.set(main.ADMIN_SESSION_COOKIE, "sesion-admin")
    assert c.get("/api/config").status_code == 200


def test_cinco_intentos_y_24_horas():
    assert main.MISSION_UNLOCK_MAX_ATTEMPTS == 5 and main.MISSION_UNLOCK_WINDOW_SECONDS == 600
    assert main.MISSION_COOKIE_TTL_SECONDS == 24 * 3600

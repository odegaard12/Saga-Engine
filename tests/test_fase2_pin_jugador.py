# -*- coding: utf-8 -*-
"""Auditoría 15/10/2026, fase 2: con PINs puestos, tocar un nombre en la portada ya no te hace ese jugador.

La sesión sólo sale de POST /api/jugador/entrar con el PIN bueno (5 fallos = 429); /player/{nombre} y
/api/game/{nombre} dejan de regalarla, y las sesiones emitidas antes de poner el PIN dejan de valer.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-pin-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import pines_jugador  # noqa: E402

USUARIO = "PLAYER 1"


def _cliente(monkeypatch, tmp_path):
    real_hash = main.admin_auth_security.hash_password
    monkeypatch.setattr(main.admin_auth_security, "hash_password",
                        lambda password, salt=None, iterations=1000: real_hash(password, salt=salt, iterations=iterations))
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "PLAYER_PINS_DB", str(tmp_path / "player_pins.json"))
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", "")
    monkeypatch.setattr(pines_jugador, "INTENTOS", {})
    assert main.resolve_known_player_profile(USUARIO)
    return TestClient(main.app)


def _con_sesion(c):
    return main.PLAYER_SESSION_COOKIE in c.cookies


def _malo(pin):
    return "000000" if pin != "000000" else "111111"


def test_sin_pines_todo_sigue_como_antes(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    assert c.get("/api/config").json()["player_pins_required"] is False
    c.get(f"/player/{USUARIO}")
    assert _con_sesion(c)
    assert c.post("/api/jugador/entrar", json={"user": USUARIO}).status_code == 200


def test_con_pines_la_portada_no_da_sesion_y_el_pin_si(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    c.get(f"/player/{USUARIO}")
    assert _con_sesion(c)
    # El PIN se pone "después" (reloj a 2033) que la sesión que ya tenía.
    monkeypatch.setattr(pines_jugador.time, "time", lambda: 2_000_000_000)
    pin = pines_jugador.generar([USUARIO])[USUARIO]
    assert len(pin) == 6 and pin not in (tmp_path / "player_pins.json").read_text()
    assert c.get("/api/config").json()["player_pins_required"] is True

    # La sesión de antes del PIN ya no sirve, y ni la portada ni /api/game la reponen.
    assert c.get(f"/api/state/{USUARIO}").status_code == 403
    c.cookies.clear()
    c.get(f"/player/{USUARIO}")
    assert not _con_sesion(c)
    assert c.get(f"/api/game/{USUARIO}").status_code == 403 and not _con_sesion(c)

    assert c.post("/api/jugador/entrar", json={"user": USUARIO, "pin": _malo(pin)}).status_code == 403
    ok = c.post("/api/jugador/entrar", json={"user": USUARIO, "pin": pin})
    assert ok.status_code == 200 and _con_sesion(c)
    assert c.get(f"/api/state/{USUARIO}").status_code == 200
    assert c.get(f"/api/game/{USUARIO}").status_code == 200


def test_cinco_fallos_bloquean(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    pin = pines_jugador.generar([USUARIO])[USUARIO]
    codigos = [c.post("/api/jugador/entrar", json={"user": USUARIO, "pin": _malo(pin)}).status_code for _ in range(6)]
    assert codigos[:5] == [403] * 5 and codigos[5] == 429
    assert c.post("/api/jugador/entrar", json={"user": USUARIO, "pin": pin}).status_code == 429


def test_quitar_vuelve_a_la_entrada_por_nombre(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    pines_jugador.generar([USUARIO])
    pines_jugador.quitar()
    assert not pines_jugador.activos()
    c.get(f"/player/{USUARIO}")
    assert _con_sesion(c)


def test_topes_de_errores_y_lotes(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    main.clear_player_rate_limits()
    monkeypatch.setattr(main, "CLIENT_ERRORS_RATE_LIMIT_MAX", 3)
    monkeypatch.setattr(main, "TESELAS_LOTE_RATE_LIMIT_MAX", 2)
    errores = [c.post("/api/client-errors", json={"errores": []}).status_code for _ in range(4)]
    lotes = [c.post("/api/teselas/lote", json={"teselas": []}).status_code for _ in range(3)]
    main.clear_player_rate_limits()
    assert 429 not in errores[:3] and errores[3] == 429
    assert 429 not in lotes[:2] and lotes[2] == 429


# Las únicas rutas que cambian algo y responden sin sesión de jugador ni de admin. Todo lo demás: 401/403
# (o 400 si el cuerpo ya no vale antes de mirar la sesión).
ABIERTAS = {"/api/admin/logout", "/api/admin/login", "/api/mission/unlock", "/api/acceso", "/api/jugador/entrar",
            "/api/client-errors", "/api/teselas/lote"}


def test_ninguna_ruta_que_cambia_algo_responde_sin_sesion(monkeypatch, tmp_path):
    import importlib
    import re

    _cliente(monkeypatch, tmp_path)
    c = TestClient(main.app, raise_server_exceptions=False)
    rutas = []
    for nombre in ("admin", "assets", "desbloqueos", "field_proofs", "game", "integraciones", "public", "registro", "shell"):
        rutas += list(importlib.import_module("backend.app.routers." + nombre).router.routes)
    rutas += [r for r in main.app.routes if hasattr(r, "methods")]
    probadas = 0
    for r in rutas:
        for metodo in sorted((getattr(r, "methods", None) or set()) & {"POST", "PUT", "DELETE", "PATCH"}):
            if r.path in ABIERTAS:
                continue
            codigo = c.request(metodo, re.sub(r"\{[^}]+\}", "x", r.path), json={"user": USUARIO}).status_code
            assert codigo in (400, 401, 403), (metodo, r.path, codigo)
            probadas += 1
    assert probadas >= 40

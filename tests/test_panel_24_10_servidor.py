# -*- coding: utf-8 -*-
"""Revisión del 24/10/2026 del panel del organizador (lado del servidor, routers/admin.py).

- El contador de PIN contaba a los jugadores ya borrados (su PIN se queda guardado).
- Un jugador añadido con los PIN puestos no tiene el suyo y no entra: nadie lo decía. Ahora `player-pins` da
  `sin_pin` y guardar jugadores devuelve `jugadores_sin_pin`.
- `mission-status` (lo que sondea el panel cada 15 s) viajaba con la foto de cada jugador en data URI y releía
  la ruta, los tiempos y el progreso por jugador; ahora va sin foto y dice desde cuándo está cada uno en su nodo.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-24-10-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import admin as admin_router  # noqa: E402
from backend.app.runtime import pines_jugador  # noqa: E402

FOTO = "data:image/jpeg;base64," + "A" * 20_000


def _config(*ids):
    return {
        "players": list(ids),
        "player_profiles": [{"id": i, "display_name": i, "avatar_url": FOTO} for i in ids],
    }


@pytest.fixture
def pines(monkeypatch, tmp_path):
    real_hash = main.admin_auth_security.hash_password
    monkeypatch.setattr(
        main.admin_auth_security,
        "hash_password",
        lambda password, salt=None, iterations=1000: real_hash(password, salt=salt, iterations=iterations),
    )
    monkeypatch.setattr(main, "PLAYER_PINS_DB", str(tmp_path / "player_pins.json"))
    return monkeypatch


def test_el_contador_de_pin_no_cuenta_a_los_borrados_y_dice_quien_falta(pines):
    pines.setattr(main, "load_config", lambda: _config("UNO", "DOS", "BORRADO"))
    pines_jugador.generar(["UNO", "DOS", "BORRADO"])
    # Se borra un jugador y se añade otro, con los PIN puestos.
    pines.setattr(main, "load_config", lambda: _config("UNO", "DOS", "NUEVO"))

    estado = admin_router._estado_de_los_pines(main)

    assert estado["activos"] is True
    assert estado["con_pin"] == ["UNO", "DOS"], "el borrado ya no cuenta"
    assert estado["sin_pin"] == ["NUEVO"], "el nuevo no tiene PIN: no podrá entrar"


def test_sin_pin_puestos_no_falta_nadie(pines):
    pines.setattr(main, "load_config", lambda: _config("UNO"))
    assert admin_router._estado_de_los_pines(main) == {"activos": False, "con_pin": [], "sin_pin": []}


def test_en_el_nodo_desde_es_lo_mas_reciente_entre_avance_arranque_y_apertura():
    assert admin_router._en_el_nodo_desde(None, "n1") is None
    assert admin_router._en_el_nodo_desde({}, "n1") is None
    entrada = {"started_at": 1_000_000, "last_advance_at_ms": 2_000_000, "aperturas": {"n1": 3_000_000, "n0": 9_000_000}}
    assert admin_router._en_el_nodo_desde(entrada, "n1") == 3_000, "abrir ESE nodo es llegar a él"
    assert admin_router._en_el_nodo_desde(entrada, "n2") == 2_000, "sin abrirlo, desde el último avance"
    assert admin_router._en_el_nodo_desde({"started_at": "basura", "last_advance_at_ms": 5_000}, "x") == 5


def test_mission_status_va_sin_foto_y_con_el_nodo(monkeypatch):
    monkeypatch.setattr(main, "load_config", lambda: _config("UNO", "DOS"))
    monkeypatch.setattr(main, "get_runtime_stages", lambda: [
        {"id": "n0", "presentation": {"title": "Puente"}},
        {"id": "n1", "presentation": {"title": "Molino"}},
    ])
    monkeypatch.setattr(main, "load_player_progress", lambda: {"UNO": 1, "DOS": 2})
    monkeypatch.setattr(main, "load_live_positions", lambda: {})
    monkeypatch.setattr(main, "load_player_timers", lambda: {"UNO": {"last_advance_at_ms": 7_000_000}})

    datos = admin_router._estado_de_la_mision(main)
    uno, dos = datos["profiles"]

    assert "avatar_url" not in uno and FOTO not in str(datos), "la foto no viaja en el sondeo"
    assert (uno["level"], uno["current_stage"], uno["en_nodo_desde"]) == (1, "Molino", 7_000)
    assert dos["finished"] is True and dos["en_nodo_desde"] is None


@pytest.fixture
def sitio(pines, tmp_path):
    pines.setenv("SECRET_KEY", "test-secret-key")
    pines.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    pines.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    pines.setattr(main, "ADMIN_AUTH_DB", str(tmp_path / "admin_auth.json"))
    pines.setattr(main, "ADMIN_SESSIONS_DB", str(tmp_path / "admin_sessions.json"))
    pines.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    pines.setattr(main, "DATA_DIR", str(tmp_path))
    main.ADMIN_SESSIONS.clear()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    main.set_admin_password("clave-de-admin-24-10")
    cliente = TestClient(main.app)
    cliente.cookies.set(main.ADMIN_SESSION_COOKIE, main.create_admin_session())
    return cliente


def _guardar(cliente, *ids):
    perfiles = [{"id": i, "display_name": i} for i in ids]
    return cliente.post("/api/admin/save-config", json={"config": {"players": list(ids), "player_profiles": perfiles}})


def test_guardar_jugadores_con_pin_dice_quien_se_queda_sin_el_suyo(sitio):
    assert _guardar(sitio, "UNO").json()["jugadores_sin_pin"] == [], "sin PIN puestos no falta nadie"
    assert sitio.post("/api/admin/player-pins", json={"accion": "generar"}).json()["nuevos"].keys() == {"UNO"}

    respuesta = _guardar(sitio, "UNO", "NUEVO").json()

    assert respuesta["status"] == "ok"
    assert respuesta["jugadores_sin_pin"] == ["NUEVO"]
    estado = sitio.post("/api/admin/player-pins", json={"accion": "estado"}).json()
    assert (estado["con_pin"], estado["sin_pin"]) == (["UNO"], ["NUEVO"])
    # Guardar otros ajustes no dice nada de PIN: no cambian quién falta.
    assert "jugadores_sin_pin" not in sitio.post("/api/admin/save-config", json={"config": {"site_name": "X"}}).json()

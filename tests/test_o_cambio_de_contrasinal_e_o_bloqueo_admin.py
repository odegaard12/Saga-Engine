# -*- coding: utf-8 -*-
"""A15 de la caza de fallos del 30/09/2026 (parte del servidor).

- Cambiar la contraseña del administrador no cerraba las demás sesiones abiertas
  (un portátil olvidado, alguien que ya la conocía): seguían valiendo hasta que
  caducaban.
- Varias acciones (exportar, purgar, reiniciar, el Registro de partida...) no
  miraban `admin_password_change_required`: con la contraseña de arranque todavía
  puesta se podía hacer casi todo salvo cambiarla.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-a15-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

CLAVE_UNO = "clave-de-admin-uno-123"
CLAVE_DOS = "clave-de-admin-dos-456"


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    # PBKDF2 con 200 000 vueltas son ~1 s por contraseña: aquí, unas pocas.
    real_hash = main.admin_auth_security.hash_password
    monkeypatch.setattr(
        main.admin_auth_security,
        "hash_password",
        lambda password, salt=None, iterations=1000: real_hash(password, salt=salt, iterations=iterations),
    )
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    monkeypatch.setattr(main, "ADMIN_AUTH_DB", str(tmp_path / "admin_auth.json"))
    monkeypatch.setattr(main, "ADMIN_SESSIONS_DB", str(tmp_path / "admin_sessions.json"))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    monkeypatch.setattr(main, "STAGES_DB", str(tmp_path / "stages.json"))
    monkeypatch.setattr(main, "GAME_DB", str(tmp_path / "gamestate.json"))
    monkeypatch.setattr(main, "MATCH_LOG_DB", str(tmp_path / "match_log.sqlite3"))
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    main.ADMIN_SESSIONS.clear()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    main.set_admin_password(CLAVE_UNO)
    return tmp_path


def _con_sesion():
    token = main.create_admin_session()
    cliente = TestClient(main.app)
    cliente.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    return cliente, token


def _cambiar(cliente, actual=CLAVE_UNO, nueva=CLAVE_DOS):
    return cliente.post(
        "/api/admin/change-password",
        json={"password": actual, "new_password": nueva, "confirm_password": nueva},
    )


# ---------------------------------------------------------------------------
# Cambiar la contraseña cierra las otras sesiones
# ---------------------------------------------------------------------------

def test_cambiar_la_contrasena_cierra_las_demas_sesiones_y_conserva_la_propia(sitio):
    cliente, mio = _con_sesion()
    _, del_portatil_olvidado = _con_sesion()
    _, del_que_la_conocia = _con_sesion()
    assert main.verify_admin_session_token(del_portatil_olvidado)

    resposta = _cambiar(cliente)

    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok", "closed_sessions": 2}
    assert main.verify_admin_session_token(mio) is True, "quien la cambia sigue dentro"
    assert main.verify_admin_session_token(del_portatil_olvidado) is False
    assert main.verify_admin_session_token(del_que_la_conocia) is False


def test_tras_el_cambio_solo_vale_la_contrasena_nueva(sitio):
    cliente, _ = _con_sesion()
    assert _cambiar(cliente).status_code == 200

    nuevo = TestClient(main.app)
    assert nuevo.post("/api/admin/login", json={"password": CLAVE_UNO}).status_code == 401
    assert nuevo.post("/api/admin/login", json={"password": CLAVE_DOS}).status_code == 200


def test_una_contrasena_actual_equivocada_no_cierra_ninguna_sesion(sitio):
    cliente, mio = _con_sesion()
    _, otra = _con_sesion()

    resposta = _cambiar(cliente, actual="no-es-esta-123456")

    assert resposta.status_code == 403
    assert main.verify_admin_session_token(mio) and main.verify_admin_session_token(otra)


# ---------------------------------------------------------------------------
# Con la contraseña de arranque puesta, nada funciona salvo cambiarla
# ---------------------------------------------------------------------------

RUTAS_QUE_NO_PUEDEN_USARSE = [
    "/api/admin/export",
    "/api/admin/datos-personales",
    "/api/reset",
    "/api/admin/match-log",
    "/api/admin/match-log/export",
    "/api/admin/events",
    "/api/admin/events/mark",
    "/api/admin/player/restore-node",
    "/api/admin/mission-status",
    "/api/admin/anti-cheat-flags",
    "/api/admin/road-graph/status",
    "/api/admin/road-graph/build",
    "/api/admin/profile-action",
    "/api/admin/save",
    "/api/admin/save-config",
    "/api/admin/stages",
    "/api/admin/simulation/run",
    "/api/admin/simulation/cleanup",
    "/api/admin/simulation/browser-session/stop",
]


@pytest.mark.parametrize("ruta", RUTAS_QUE_NO_PUEDEN_USARSE)
def test_con_la_contrasena_de_arranque_las_acciones_del_panel_dan_403(sitio, ruta):
    main.set_admin_password("clave-temporal-1234", must_change=True)
    cliente, _ = _con_sesion()
    assert main.admin_password_change_required() is True

    resposta = cliente.post(ruta, json={})

    assert resposta.status_code == 403, (ruta, resposta.text)
    assert resposta.json()["detail"] == "password change required"


def test_lo_unico_que_sigue_funcionando_es_el_resumen_que_avisa_y_el_cambio_de_contrasena(sitio):
    main.set_admin_password("clave-temporal-1234", must_change=True)
    cliente, _ = _con_sesion()

    resumen = cliente.post("/api/admin/react-overview", json={})
    assert resumen.status_code == 200 and resumen.json()["status"] == "password_change_required"

    cambio = _cambiar(cliente, actual="clave-temporal-1234")
    assert cambio.status_code == 200
    assert main.admin_password_change_required() is False

    assert cliente.post("/api/admin/mission-status", json={}).status_code == 200


def test_sin_la_marca_todo_sigue_respondiendo(sitio):
    cliente, _ = _con_sesion()

    for ruta in ("/api/admin/mission-status", "/api/admin/events", "/api/admin/match-log", "/api/admin/anti-cheat-flags"):
        assert cliente.post(ruta, json={}).status_code == 200, ruta

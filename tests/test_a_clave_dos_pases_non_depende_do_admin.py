# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S18: cambiar la contraseña del administrador
cerraba la sesión de TODOS los jugadores.

Producción no tiene `SECRET_KEY`, así que los pases de jugador se firmaban con
`sal:hash` de la contraseña del administrador: cambiarla en plena ruta daba un 403
en cada avance. Ahora, mientras no haya `SECRET_KEY`, la clave vive en un fichero
del directorio de datos que se crea UNA vez con el valor que ya estaba en uso (así
los pases que ya llevan los móviles siguen valiendo) y a partir de ahí es
independiente de la contraseña del administrador.
"""
import json
import os
import tempfile
import threading

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-clave-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.security import clave_de_sesion, player_session  # noqa: E402

USUARIO = "PLAYER 1"


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    """Un despliegue de producción en pequeño: sin SECRET_KEY y con su contraseña de admin."""
    # PBKDF2 con 200 000 vueltas son ~1 s por contraseña: aquí, unas pocas.
    real_hash = main.admin_auth_security.hash_password
    monkeypatch.setattr(
        main.admin_auth_security,
        "hash_password",
        lambda password, salt=None, iterations=1000: real_hash(password, salt=salt, iterations=iterations),
    )
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    monkeypatch.setattr(main, "ADMIN_AUTH_DB", str(tmp_path / "admin_auth.json"))
    monkeypatch.setattr(main, "ADMIN_SESSIONS_DB", str(tmp_path / "admin_sessions.json"))
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "SESSION_KEY_DB", str(tmp_path / "session_key.json"))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    main.set_admin_password("clave-de-admin-uno-123")
    return tmp_path / "session_key.json"


def _derivada():
    auth = main.load_admin_auth()
    return "%s:%s" % (auth["salt"], auth["password_hash"])


def _pedir_estado(token):
    cliente = TestClient(main.app)
    return cliente.get(
        "/api/state/PLAYER%201", headers={"Cookie": "%s=%s" % (main.PLAYER_SESSION_COOKIE, token)}
    ).status_code


def test_la_primera_vez_se_guarda_la_clave_que_ya_estaba_en_uso(sitio):
    assert not sitio.exists()
    en_uso = _derivada()

    clave = main.get_session_signing_secret()

    assert clave == en_uso, "tiene que ser la MISMA para que los pases que ya llevan los móviles sigan valiendo"
    assert json.loads(sitio.read_text(encoding="utf-8"))["key"] == en_uso


def test_un_pase_firmado_antes_del_cambio_sigue_valiendo(sitio):
    pase_viejo = player_session.create_player_session_token(USUARIO, ttl_seconds=3600, secret=_derivada())

    assert _pedir_estado(pase_viejo) == 200  # crea el fichero con la clave en uso
    assert sitio.exists()


def test_cambiar_la_contrasena_del_admin_ya_no_cierra_a_los_jugadores(sitio):
    pase_viejo = player_session.create_player_session_token(USUARIO, ttl_seconds=3600, secret=_derivada())
    assert _pedir_estado(pase_viejo) == 200

    main.set_admin_password("clave-de-admin-dos-456")

    assert _pedir_estado(pase_viejo) == 200, "el pase de un jugador dependía de la contraseña del admin"
    # Y un pase firmado con la clave derivada de la contraseña NUEVA no vale: ya no van atados.
    con_la_derivada_nueva = player_session.create_player_session_token(
        USUARIO, ttl_seconds=3600, secret=_derivada()
    )
    assert _pedir_estado(con_la_derivada_nueva) == 403


def test_los_pases_nuevos_tras_el_cambio_valen(sitio):
    main.get_session_signing_secret()
    main.set_admin_password("clave-de-admin-dos-456")

    cliente = TestClient(main.app)
    assert cliente.get("/player/PLAYER%201").status_code in {200, 503}
    assert cliente.cookies.get(main.PLAYER_SESSION_COOKIE)

    assert cliente.get("/api/state/PLAYER%201").status_code == 200

    main.set_admin_password("clave-de-admin-tres-789")
    assert cliente.get("/api/state/PLAYER%201").status_code == 200


def test_la_cookie_de_mision_tampoco_se_invalida_al_cambiar_la_contrasena_del_admin(sitio):
    main.set_mission_password("clave-de-mision-123")
    try:
        antes = main._mission_cookie_value()

        main.set_admin_password("clave-de-admin-dos-456")

        assert main._mission_cookie_value() == antes
    finally:
        main.set_mission_password("")


def test_con_secret_key_en_el_entorno_manda_el_entorno_y_no_se_crea_fichero(sitio, monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "clave-del-entorno")

    assert main.get_session_signing_secret() == "clave-del-entorno"
    assert not sitio.exists()


def test_el_fichero_se_crea_una_sola_vez(sitio):
    main.get_session_signing_secret()
    huella = (sitio.stat().st_mtime_ns, sitio.read_bytes())

    main.set_admin_password("clave-de-admin-dos-456")
    main.get_session_signing_secret()

    assert (sitio.stat().st_mtime_ns, sitio.read_bytes()) == huella


def test_sin_admin_inicializado_ni_secret_key_sigue_fallando_como_antes(monkeypatch, tmp_path):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "vacio.sqlite3"))
    monkeypatch.setattr(main, "ADMIN_AUTH_DB", str(tmp_path / "admin_auth.json"))
    monkeypatch.setattr(main, "SESSION_KEY_DB", str(tmp_path / "session_key.json"))

    with pytest.raises(RuntimeError):
        main.get_session_signing_secret()


def test_dos_hilos_que_crean_la_clave_a_la_vez_acaban_con_la_misma(tmp_path):
    ruta = str(tmp_path / "carrera.json")
    resultados = []

    def crear(valor):
        resultados.append(clave_de_sesion.crear_clave(ruta, valor, origen="prueba"))

    hilos = [threading.Thread(target=crear, args=("valor-%d" % i,)) for i in range(8)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join()

    assert len(set(resultados)) == 1
    assert clave_de_sesion.leer_clave(ruta) == resultados[0]


def test_si_el_directorio_no_admite_escritura_se_usa_la_derivada_como_antes(tmp_path):
    bloqueador = tmp_path / "archivo"
    bloqueador.write_text("no soy una carpeta")

    clave = clave_de_sesion.crear_clave(str(bloqueador / "session_key.json"), "derivada", origen="prueba")

    assert clave == "derivada"

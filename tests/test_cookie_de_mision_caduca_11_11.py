# -*- coding: utf-8 -*-
"""11/11 (auditoría): la cookie de la clave de misión caduca de verdad en el servidor.

Antes era un valor fijo, igual para todos; las «24 h» eran sólo el `max_age` del navegador, así que un valor
copiado una vez entraba para siempre. Ahora lleva la fecha de emisión firmada dentro.
"""
import hashlib
import hmac
import time

import pytest
from fastapi.testclient import TestClient

import main

CLAVE = "KX3TQ7DM"


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "MISSION_UNLOCK_ATTEMPTS", {})
    main.set_mission_password(CLAVE)
    return TestClient(main.app)


def _pedir(cliente, cookie):
    return cliente.get("/api/no-existe", headers={"Cookie": "%s=%s" % (main.MISSION_COOKIE, cookie)})


def _formato_viejo():
    rotacion = str(main.load_mission_auth().get("password_hash"))
    return hmac.new(
        main.get_session_signing_secret().encode("utf-8"), ("mission-ok:" + rotacion).encode("utf-8"), hashlib.sha256
    ).hexdigest()


def test_una_cookie_reciente_pasa_y_una_caducada_no(cliente):
    ahora = time.time()
    assert _pedir(cliente, main._mission_cookie_value(ahora - 3600)).status_code == 404  # pasa: la ruta no existe
    caducada = main._mission_cookie_value(ahora - main.MISSION_COOKIE_TTL_SECONDS - 60)
    assert _pedir(cliente, caducada).status_code == 401
    assert _pedir(cliente, main._mission_cookie_value(ahora + 3600)).status_code == 401  # del futuro


def test_cambiar_la_fecha_rompe_la_firma(cliente):
    emitida, _, firma = main._mission_cookie_value(time.time() - main.MISSION_COOKIE_TTL_SECONDS - 60).partition(".")
    assert _pedir(cliente, "%d.%s" % (int(time.time()), firma)).status_code == 401
    for basura in ("1.2.3", ".", "9" * 40 + ".x", "１２３.x", "abc.def"):
        assert not main.mission_cookie_valida(basura)


def test_la_renovacion_lleva_fecha_nueva(cliente):
    vieja = main._mission_cookie_value(time.time() - 3600)
    nueva = _pedir(cliente, vieja).cookies.get(main.MISSION_COOKIE)
    assert nueva != vieja and main.mission_cookie_valida(nueva)
    assert int(nueva.split(".")[0]) >= int(time.time()) - 5


def test_el_formato_viejo_vale_solo_durante_la_gracia(cliente):
    """Quien ya jugaba con la cookie sin fecha no se queda fuera: vale un plazo y se cambia por una con fecha."""
    vieja = _formato_viejo()
    assert _pedir(cliente, vieja).status_code == 401  # clave recién puesta: no hay cookies viejas que respetar

    auth = main.load_mission_auth()
    del auth["formato_viejo_hasta"]  # como una clave puesta antes de esta versión
    main.save_mission_auth(auth)
    main.ensure_mission_auth()
    hasta = main.load_mission_auth()["formato_viejo_hasta"]
    assert 0 < hasta - time.time() <= main.MISSION_COOKIE_TTL_SECONDS

    r = _pedir(cliente, vieja)
    assert r.status_code == 404
    assert "." in r.cookies.get(main.MISSION_COOKIE)  # sale ya con fecha
    assert not main.mission_cookie_valida(vieja, now=hasta + 1)
    main.ensure_mission_auth()  # otro arranque no alarga la gracia
    assert main.load_mission_auth()["formato_viejo_hasta"] == hasta


def test_tras_caducar_se_vuelve_a_entrar_con_la_clave(cliente):
    caducada = main._mission_cookie_value(time.time() - main.MISSION_COOKIE_TTL_SECONDS - 60)
    cliente.cookies.set(main.MISSION_COOKIE, caducada)
    assert cliente.get("/api/config").status_code == 401
    cliente.cookies.clear()
    assert cliente.post("/api/mission/unlock", json={"password": CLAVE}).status_code == 200
    assert cliente.get("/api/config").status_code == 200

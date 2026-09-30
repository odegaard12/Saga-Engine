# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S9: `player_avatar` no tenía puerta.

Bastaba conocer el id de un jugador -un nombre- para bajarse su retrato, y con
`Cache-Control: public` Cloudflare lo guardaba en su borde. Ahora pasa por la
MISMA puerta que la lista de jugadores de `/api/config`: sin MISSION_PASS es
pública (la pantalla de login enseña las caras antes de que nadie tenga pase);
con MISSION_PASS hace falta la cookie de misión, un pase de jugador o la sesión
del panel. Y el móvil que ya entró sigue pidiéndolas con su cookie de siempre.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-retrato-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
RUTA = "/api/player-avatar/PLAYER%201"


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.delenv("SAGA_AVATARS_REQUIRE_SESSION", raising=False)
    main.save_config(
        {
            "site_name": "Prueba",
            "player_profiles": [
                {"id": USUARIO, "display_name": USUARIO, "mode": "solo", "avatar_url": PNG_1X1},
                {"id": "PLAYER 2", "display_name": "PLAYER 2", "mode": "solo", "avatar_url": ""},
            ],
        }
    )
    yield
    main.set_mission_password("")
    main.MISSION_UNLOCK_ATTEMPTS.clear()


def test_sin_contrasena_de_mision_el_retrato_sigue_a_la_vista_como_la_lista_de_jugadores(sitio):
    resposta = TestClient(main.app).get(RUTA)

    assert resposta.status_code == 200
    assert resposta.headers["content-type"] == "image/png"


def test_el_retrato_ya_no_se_declara_public(sitio):
    cabecera = TestClient(main.app).get(RUTA).headers["cache-control"]

    assert "private" in cabecera and "public" not in cabecera
    assert "immutable" in cabecera


def test_con_contrasena_de_mision_un_desconocido_no_ve_el_retrato(sitio):
    main.set_mission_password("clave-de-mision-123")

    resposta = TestClient(main.app).get(RUTA)

    assert resposta.status_code == 403


def test_con_la_cookie_de_mision_si_lo_ve(sitio):
    main.set_mission_password("clave-de-mision-123")
    cliente = TestClient(main.app)
    assert cliente.get(RUTA).status_code == 403

    assert cliente.post("/api/mission/unlock", json={"password": "clave-de-mision-123"}).status_code == 200

    assert cliente.get(RUTA).status_code == 200


def test_el_movil_que_ya_entro_lo_sigue_viendo_con_su_pase_de_jugador(sitio):
    """El camino de verdad de la app: un <img> del mismo origen lleva la cookie de sesión."""
    main.set_mission_password("clave-de-mision-123")
    cliente = TestClient(main.app)
    assert cliente.get("/player/PLAYER%201").status_code in {200, 503}  # reparte el pase aunque falte el build

    assert cliente.cookies.get(main.PLAYER_SESSION_COOKIE)
    assert cliente.get(RUTA).status_code == 200


def test_la_sesion_del_panel_tambien_lo_ve(sitio):
    main.set_mission_password("clave-de-mision-123")
    token = main.create_admin_session()
    cliente = TestClient(main.app)

    resposta = cliente.get(RUTA, headers={"Cookie": "%s=%s" % (main.ADMIN_SESSION_COOKIE, token)})

    assert resposta.status_code == 200


def test_el_interruptor_exige_sesion_siempre(sitio, monkeypatch):
    monkeypatch.setenv("SAGA_AVATARS_REQUIRE_SESSION", "1")
    cliente = TestClient(main.app)

    assert cliente.get(RUTA).status_code == 403

    cliente.get("/player/PLAYER%201")
    assert cliente.get(RUTA).status_code == 200


def test_la_revalidacion_por_etag_sigue_funcionando(sitio):
    cliente = TestClient(main.app)
    primera = cliente.get(RUTA)

    segunda = cliente.get(RUTA, headers={"If-None-Match": primera.headers["etag"]})

    assert segunda.status_code == 304

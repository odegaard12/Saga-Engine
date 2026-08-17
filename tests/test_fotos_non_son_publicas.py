# -*- coding: utf-8 -*-
"""Las fotos de campo no se sirven a cualquiera.

Comprobado contra sagagia.es el 2026-08-09, sin sesión, sin contraseña y sin
saber nada: `GET /api/field-proofs` devolvía las 17 fotos de la ruta con el
NOMBRE de quien la hizo, las COORDENADAS exactas y el nodo, y la imagen se
descargaba entera desde su URL. También el zip con todas.

Para una ruta entre amigos ya era feo. Para vender esto a un colegio es
inaceptable: el permiso que firma un padre cubre hacer la foto, no publicarla en
internet junto al sitio exacto donde estaba su hijo y a qué hora.

El pase de jugador no es una identificación fuerte —se consigue entrando en la
misión— pero corta a buscadores, rastreadores y a cualquiera que no sepa un
nombre. Lo que protege de verdad es no guardar lo que no hace falta y borrarlo
al acabar la ruta.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-fotos-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import field_proofs as fp_router  # noqa: E402


def _cliente():
    app = FastAPI()
    app.include_router(fp_router.router)
    return TestClient(app)


def _un_jugador():
    perfiles = main.get_player_profiles(main.load_config())
    assert perfiles, "la misión de pruebas necesita al menos un jugador"
    return perfiles[0].get("id")


def _con_pase(cliente, user):
    """Un cliente con el pase de jugador puesto, como el móvil de verdad."""
    token = main.player_session_security.create_player_session_token(
        user,
        ttl_seconds=3600,
        secret=main.get_session_signing_secret(),
    )
    cliente.cookies.set(main.PLAYER_SESSION_COOKIE, token)
    return cliente


def test_a_lista_de_fotos_non_e_publica():
    resposta = _cliente().get("/api/field-proofs")
    assert resposta.status_code == 403, (
        "esto devolvía nombres y coordenadas de todo el grupo a cualquiera"
    )


def test_o_zip_de_todas_as_fotos_non_e_publico():
    resposta = _cliente().get("/api/field-proofs/download")
    assert resposta.status_code == 403


def test_a_imaxe_solta_non_e_publica():
    resposta = _cliente().get("/api/field-proofs/proof_inventado/image")
    # 403 y no 404: no se puede ni comprobar si una foto existe desde fuera.
    assert resposta.status_code == 403


def test_un_xogador_da_mision_si_ve_as_fotos():
    """Salen en el mapa de todo el grupo: es parte del juego."""
    cliente = _con_pase(_cliente(), _un_jugador())
    resposta = cliente.get("/api/field-proofs")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "ok"


def test_un_pase_falso_non_vale():
    cliente = _cliente()
    cliente.cookies.set(main.PLAYER_SESSION_COOKIE, "esto.no-esta-firmado")

    assert cliente.get("/api/field-proofs").status_code == 403


def test_un_pase_dun_xogador_que_non_existe_non_vale():
    cliente = _cliente()
    token = main.player_session_security.create_player_session_token(
        "NoSoyDeEstaMision",
        ttl_seconds=3600,
        secret=main.get_session_signing_secret(),
    )
    cliente.cookies.set(main.PLAYER_SESSION_COOKIE, token)

    assert cliente.get("/api/field-proofs").status_code == 403


def test_as_fotos_non_se_cachean_como_publicas():
    """Con `public`, Cloudflare las guarda en su borde y sirve sin preguntar."""
    fuente = open("backend/app/routers/field_proofs.py", encoding="utf-8").read()
    assert 'Cache-Control": "public' not in fuente

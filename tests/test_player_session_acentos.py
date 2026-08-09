# -*- coding: utf-8 -*-
"""Un jugador con tilde en el nombre tiene que poder jugar.

`hmac.compare_digest` lanza TypeError si se le pasan cadenas con caracteres
fuera del ASCII. La sesión del jugador comparaba así el nombre, de modo que
Álvaro recibía un 500 del servidor cada vez que completaba un nodo: no podía
avanzar en toda la ruta, y en el monte eso no se arregla.
"""
import time

from backend.app.security.player_session import (
    create_player_session_token,
    verify_player_session_token,
)

SECRETO = "secreto-de-pruebas"


def test_un_nombre_con_tilde_valida_su_propia_sesion():
    token = create_player_session_token("Álvaro", secret=SECRETO, ttl_seconds=600)
    assert verify_player_session_token(token, user="Álvaro", secret=SECRETO) is True


def test_un_nombre_con_tilde_no_vale_para_otro_jugador():
    token = create_player_session_token("Álvaro", secret=SECRETO, ttl_seconds=600)
    assert verify_player_session_token(token, user="Alvaro", secret=SECRETO) is False
    assert verify_player_session_token(token, user="Nati", secret=SECRETO) is False


def test_el_resto_de_nombres_siguen_funcionando():
    token = create_player_session_token("Nati", secret=SECRETO, ttl_seconds=600)
    assert verify_player_session_token(token, user="Nati", secret=SECRETO) is True
    assert verify_player_session_token(token, user="Paula", secret=SECRETO) is False


def test_una_sesion_caducada_no_vale_aunque_lleve_tilde():
    token = create_player_session_token("Álvaro", secret=SECRETO, ttl_seconds=1)
    caducado = int(time.time()) + 120
    assert verify_player_session_token(token, user="Álvaro", secret=SECRETO, now=caducado) is False

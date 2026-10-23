# -*- coding: utf-8 -*-
"""Revisión del 23/10/2026: panel del organizador, entrada del jugador y fotos (lado del servidor).

- Dos «Generar PIN» seguidos (doble toque en el panel) se pisaban: las dos peticiones veían a los mismos jugadores
  sin PIN y les daban uno cada una; el servidor guardaba los de la segunda y el panel podía enseñar los de la
  primera. Nadie entraba con el PIN repartido.
"""
import os
import tempfile
import threading
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-23-10-"))

import main  # noqa: E402
from backend.app.runtime import pines_jugador  # noqa: E402

USUARIO = "PLAYER 1"


def test_dos_generar_a_la_vez_no_se_pisan(monkeypatch, tmp_path):
    real_hash = main.admin_auth_security.hash_password

    def hash_lento(password, salt=None, iterations=1000):
        time.sleep(0.05)  # Lo bastante para que, sin candado, las dos peticiones lean antes de que nadie guarde.
        return real_hash(password, salt=salt, iterations=iterations)

    monkeypatch.setattr(main.admin_auth_security, "hash_password", hash_lento)
    monkeypatch.setattr(main, "PLAYER_PINS_DB", str(tmp_path / "player_pins.json"))
    assert main.resolve_known_player_profile(USUARIO)

    respuestas = []
    hilos = [
        threading.Thread(target=lambda: respuestas.append(pines_jugador.generar([USUARIO], True))) for _ in range(2)
    ]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()

    repartidos = [r[USUARIO] for r in respuestas if USUARIO in r]
    assert len(repartidos) == 1, "sólo una de las dos pulsaciones da PIN; la otra ya lo encuentra puesto"
    assert pines_jugador.comprobar(USUARIO, repartidos[0]), "el PIN que ve el panel es el que guarda el servidor"


def test_rehacer_todos_sigue_cambiando_el_que_ya_habia(monkeypatch, tmp_path):
    real_hash = main.admin_auth_security.hash_password
    monkeypatch.setattr(main.admin_auth_security, "hash_password",
                        lambda password, salt=None, iterations=1000: real_hash(password, salt=salt, iterations=iterations))
    monkeypatch.setattr(main, "PLAYER_PINS_DB", str(tmp_path / "player_pins.json"))
    primero = pines_jugador.generar([USUARIO])[USUARIO]
    assert pines_jugador.generar([USUARIO], True) == {}
    segundo = pines_jugador.generar([USUARIO])[USUARIO]
    assert pines_jugador.comprobar(USUARIO, segundo)
    assert primero == segundo or not pines_jugador.comprobar(USUARIO, primero)

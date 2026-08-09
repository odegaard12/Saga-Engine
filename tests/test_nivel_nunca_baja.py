# -*- coding: utf-8 -*-
"""Un nodo superado no puede volver a estar sin hacer.

Es el fallo que se persiguió durante todo un día de pruebas: el jugador completa
el nodo 3, la pantalla lo devuelve a la salida con el tiempo a cero, y al rato
todo vuelve a su sitio. Pasaba jugando en casa y con wifi, así que no era
cobertura: era que algo mandaba un nivel más bajo y el servidor lo aceptaba.

Ahora no lo acepta. Sólo el reset, que entra con un cero explícito, puede bajar.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-nivel-"))

import main  # noqa: E402


def test_un_nivel_menor_no_hace_retroceder():
    main.set_player_progress_level("Camina", 0)
    main.set_player_progress_level("Camina", 4)

    # Llega tarde una respuesta de cuando iba por el nodo 2.
    main.set_player_progress_level("Camina", 2)

    assert main.get_player_progress_level("Camina", 0) == 4


def test_el_mismo_nivel_no_rompe_nada():
    main.set_player_progress_level("Repite", 0)
    main.set_player_progress_level("Repite", 3)
    main.set_player_progress_level("Repite", 3)

    assert main.get_player_progress_level("Repite", 0) == 3


def test_avanzar_sigue_funcionando():
    main.set_player_progress_level("Avanza", 0)
    for nivel in range(1, 11):
        main.set_player_progress_level("Avanza", nivel)

    assert main.get_player_progress_level("Avanza", 0) == 10


def test_el_reset_si_puede_bajar():
    main.set_player_progress_level("Reinicia", 0)
    main.set_player_progress_level("Reinicia", 7)
    main.record_player_stage_time("Reinicia", 1, 9000)
    main.add_player_penalty("Reinicia", 120000)

    main.set_player_progress_level("Reinicia", 0)

    assert main.get_player_progress_level("Reinicia", 0) == 0
    assert main.get_player_total_time_ms("Reinicia") == 0

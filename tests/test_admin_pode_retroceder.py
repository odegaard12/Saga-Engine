# -*- coding: utf-8 -*-
"""El juego no retrocede solo, pero el organizador sí puede moverlo.

Son dos cosas distintas y se confundieron: al poner el candado que impide que un
nodo superado vuelva a estar sin hacer, se bloqueó también el botón de retroceder
del panel de administración. Decía que retrocedía y el jugador se quedaba donde
estaba.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-admin-"))

import main  # noqa: E402


def test_el_juego_no_retrocede_solo():
    main.set_player_progress_level("Xogo", 0)
    main.set_player_progress_level("Xogo", 5)
    main.set_player_progress_level("Xogo", 3)

    assert main.get_player_progress_level("Xogo", 0) == 5


def test_administracion_si_pode_retroceder():
    main.set_player_progress_level("Panel", 0)
    main.set_player_progress_level("Panel", 5)
    main.set_player_progress_level("Panel", 3, desde_admin=True)

    assert main.get_player_progress_level("Panel", 0) == 3


def test_administracion_pode_deixalo_nun_nodo_calquera():
    main.set_player_progress_level("Panel2", 0)
    main.set_player_progress_level("Panel2", 8)

    for destino in (6, 2, 7, 1):
        main.set_player_progress_level("Panel2", destino, desde_admin=True)
        assert main.get_player_progress_level("Panel2", 0) == destino

# -*- coding: utf-8 -*-
"""Resetear a un jugador tiene que dejarle el reloj a cero. Todo el reloj.

El reset borraba los tiempos de cada nodo pero se dejaba las penalizaciones,
así que quien hubiese usado un código de respaldo empezaba la partida nueva con
esos dos minutos encima y sin que nada lo dijera en pantalla.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-reset-"))

import main  # noqa: E402


def test_el_reset_borra_tambien_las_penalizaciones():
    main.set_player_progress_level("Probas", 3)
    main.record_player_stage_time("Probas", 1, 12000)
    main.add_player_penalty("Probas", 120000)

    assert main.get_player_total_time_ms("Probas") == 132000

    main.set_player_progress_level("Probas", 0)

    assert main.get_player_total_time_ms("Probas") == 0


def test_avanzar_de_nodo_no_borra_lo_ya_hecho():
    main.set_player_progress_level("Camina", 0)
    main.record_player_stage_time("Camina", 0, 8000)
    main.set_player_progress_level("Camina", 1)
    main.record_player_stage_time("Camina", 1, 5000)
    main.set_player_progress_level("Camina", 2)

    assert main.get_player_total_time_ms("Camina") == 13000

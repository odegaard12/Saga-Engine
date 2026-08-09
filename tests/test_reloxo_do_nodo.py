# -*- coding: utf-8 -*-
"""Qué cuenta y qué no cuenta en el reloj de un nodo.

La regla, en palabras del organizador: leer la explicación no cuenta; jugar sí
—ver el trazado del patrón, la foto del mosaico, cazar señales, mover la bola—;
y al superarlo el reloj para, porque el nodo ya está hecho.

Esto no se puede comprobar desde Python: el reloj vive en el móvil. Lo que sí
se fija aquí es la mitad del servidor, que es la que decide qué se guarda.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-reloxo-"))

import main  # noqa: E402


def _tempos(user):
    return (main.load_player_timers().get(user) or {}).get("stage_times_ms") or {}


def test_o_total_e_a_suma_dos_nodos_mais_as_penalizacions():
    main.set_player_progress_level("Reloxo", 0)

    main.record_player_stage_time("Reloxo", 0, 12000)
    main.record_player_stage_time("Reloxo", 1, 30000)
    main.add_player_penalty("Reloxo", 5000)

    estado = main.project_live_profile_status(main.get_player_profile("Reloxo"))

    assert estado["total_time_ms"] == 47000


def test_un_checkpoint_non_suma_nada():
    main.set_player_progress_level("Reloxo2", 0)

    # Los puntos de control mandan 0: llegar y leer no es una prueba.
    main.record_player_stage_time("Reloxo2", 0, 0)

    assert int(_tempos("Reloxo2").get("0") or 0) == 0
    estado = main.project_live_profile_status(main.get_player_profile("Reloxo2"))
    assert estado["total_time_ms"] == 0


def test_o_tempo_dun_nodo_non_se_acumula_ao_repetir():
    main.set_player_progress_level("Reloxo3", 0)

    # Dos envíos del mismo nodo no suman: es un nodo, no dos.
    main.record_player_stage_time("Reloxo3", 0, 9000)
    main.record_player_stage_time("Reloxo3", 0, 9000)

    assert int(_tempos("Reloxo3").get("0") or 0) == 9000

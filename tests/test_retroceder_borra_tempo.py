# -*- coding: utf-8 -*-
"""Retroceder desde el panel borra el reloj de lo que se va a repetir.

Se devolvía al jugador a un nodo anterior y los tiempos de los nodos que tenía
que rehacer seguían guardados. El marcador arrancaba la repetición con segundos
de una partida que ya no cuenta, y al superar el nodo otra vez se quedaba el
mayor de los dos —`record_player_stage_time` guarda el máximo—, no el nuevo.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-atras-"))

import main  # noqa: E402


def _tempos(user):
    return (main.load_player_timers().get(user) or {}).get("stage_times_ms") or {}


def test_retroceder_deixa_o_reloxo_a_cero():
    main.set_player_progress_level("Atras", 0)

    for nivel, ms in ((0, 5000), (1, 4000), (2, 33000)):
        main.set_player_progress_level("Atras", nivel + 1)
        main.record_player_stage_time("Atras", nivel, ms)

    main.set_player_progress_level("Atras", 2, desde_admin=True)

    tempos = _tempos("Atras")
    assert int(tempos.get("2") or 0) == 0, "el nodo que se repite empieza en cero"
    assert int(tempos.get("0") or 0) == 5000, "lo ya jugado y no repetido se respeta"


def test_ao_repetir_conta_o_tempo_novo_aínda_que_sexa_menor():
    main.set_player_progress_level("Atras2", 0)
    main.set_player_progress_level("Atras2", 3)
    main.record_player_stage_time("Atras2", 2, 40000)

    main.set_player_progress_level("Atras2", 2, desde_admin=True)
    main.record_player_stage_time("Atras2", 2, 12000)

    # Sin el borrado se quedaba en 40000: el máximo de los dos.
    assert int(_tempos("Atras2").get("2") or 0) == 12000

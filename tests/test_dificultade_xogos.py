# -*- coding: utf-8 -*-
"""La dificultad que se pidió tiene que llegar al jugador.

Estos números se han perdido ya en varios rollbacks, y cuesta darse cuenta:
el juego funciona igual, sólo que fácil. Y no se tocan desde el panel de
administración —los valores por defecto viven aquí—, así que si aquí se caen,
en el móvil se caen.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-dif-"))

from backend.app.runtime.minigames import normalize_minigame_config  # noqa: E402


# El "tipo" y el "juego" no son lo mismo: varios juegos comparten tipo, y el
# juego concreto lo elige game_id dentro de la configuracion.
TIPO_DE_XOGO = {
    "tilt_maze": "circuit_matrix",
    "spark_radar": "circuit_matrix",
    "logic_circuit": "circuit_matrix",
}


def _config(game_id):
    return normalize_minigame_config(TIPO_DE_XOGO[game_id], {"game_id": game_id})


def test_laberinto_non_e_un_paseo():
    c = _config("tilt_maze")

    assert c["grid_rows"] >= 11, "el tablero se cruzaba en pocos movimientos"
    assert c["hole_count"] >= 14, "quedaba pasillo limpio de sobra"
    assert c["collectible_count"] >= 3
    # Lo que de verdad hacia el laberinto un paseo: con vidas de sobra se
    # cruzaba a lo bruto y caer solo costaba repetir un trozo.
    assert c["lives"] == 1, "caer tiene que devolverte a la salida"
    assert c["step_cooldown_ms"] <= 300, "la bola tiene que costar de parar"


def test_o_patron_hai_que_lembralo():
    c = _config("logic_circuit")

    assert c["grid_rows"] >= 6, "el patron cabia de un vistazo"
    assert c["path_length"] >= 11
    # Ni tan lento que se copie, ni tan rapido que no de tiempo a seguirlo.
    assert 350 <= c["preview_cell_ms"] <= 500
    # Un despiste al principio no puede mandar a repetir el nodo entero: eso
    # mide suerte, no memoria.
    assert c["max_errors"] == 2


def test_caza_sinais_segue_en_vintecinco():
    c = _config("spark_radar")

    assert c["target_hits"] == 25

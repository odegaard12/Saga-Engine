# -*- coding: utf-8 -*-
"""El aviso interno de los minijuegos no vale escrito a mano.

El motor añade a todos los nodos una condición de éxito con la que un minijuego
dice "superado". Como es la misma en todos, escrita en la casilla de código de
respaldo saltaba cualquier nodo: sin jugar el reto, sin buscar la pegatina y sin
los dos minutos de penalización. Bastaba con que alguien la viese una vez.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-manual-"))

import main  # noqa: E402
from backend.app.runtime.core_engine import MINIGAME_OK_CODE  # noqa: E402


def _nodo_con_respaldo():
    return {
        "id": 1,
        "title": "Nodo de prueba",
        "lat": 0.0,
        "lon": 0.0,
        "radius": 50,
        "type": "signal_hunt",
        "answer": "CODIGO_PROPIO",
    }


def test_un_minijuego_ganado_supera_el_nodo():
    nodo = _nodo_con_respaldo()
    assert main.stage_accepts_code(nodo, MINIGAME_OK_CODE) is True


def test_escrito_a_mano_ese_mismo_aviso_no_vale():
    nodo = _nodo_con_respaldo()
    assert main.stage_accepts_code(nodo, MINIGAME_OK_CODE, manual=True) is False


def test_el_codigo_de_respaldo_del_nodo_si_vale_a_mano():
    nodo = _nodo_con_respaldo()
    assert main.stage_accepts_code(nodo, "CODIGO_PROPIO", manual=True) is True


def test_un_codigo_inventado_sigue_sin_valer():
    nodo = _nodo_con_respaldo()
    assert main.stage_accepts_code(nodo, "LO_QUE_SEA", manual=True) is False
    assert main.stage_accepts_code(nodo, "LO_QUE_SEA") is False

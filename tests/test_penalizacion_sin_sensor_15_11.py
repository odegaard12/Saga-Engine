# -*- coding: utf-8 -*-
"""«Sin sensor»: Faros y Pulso cobran 25 s; cualquier otro juego, 60 s, aunque el móvil declare menos."""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-sin-sensor-"))

import main  # noqa: E402

S = 1000


def _ev(juego, ms):
    return {"modo_alternativo": True, "game": juego, "penalizacion_modo_alternativo_ms": ms}


def test_faros_y_pulso_cobran_lo_que_muestra_el_movil():
    assert main.penalizacion_minima(0, evidencia=_ev("rumbo_doble", 25 * S)) == 25 * S
    assert main.penalizacion_minima(0, evidencia=_ev("pulso_hierro", 25 * S)) == 25 * S


def test_otros_juegos_no_pueden_declarar_menos_de_60_s():
    assert main.penalizacion_minima(0, evidencia=_ev("tilt_maze", 25 * S)) == 60 * S
    assert main.penalizacion_minima(0, evidencia={"modo_alternativo": True}) == 60 * S


def test_faros_no_baja_de_25_s_ni_sube_del_minimo_clasico():
    assert main.penalizacion_minima(0, evidencia=_ev("rumbo_doble", 1 * S)) == 60 * S
    assert main.penalizacion_minima(0, evidencia=_ev("rumbo_doble", 600 * S)) == 60 * S
    assert main.penalizacion_minima(90 * S, evidencia=_ev("rumbo_doble", 25 * S)) == 90 * S

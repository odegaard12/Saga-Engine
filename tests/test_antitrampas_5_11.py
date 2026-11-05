# -*- coding: utf-8 -*-
"""Antitrampas, revisión 5/11 (6.3.0): un salto único de GPS falso (teletransporte) también se caza.

Antes hacían falta dos tramos seguidos a velocidad imposible: quien falseaba el GPS saltaba de nodo a nodo de una vez y
luego andaba normal, y no se le veía nunca. Ahora un salto de más de 1 km con las dos posiciones precisas (≤100 m) se
anota; un fix de antena que salta kilómetros (precisión de cientos de metros) sigue sin marcar, y un salto pequeño
aislado tampoco (ruido de GPS).
"""
import os
import tempfile

from backend.app.runtime import anti_cheat as ac

LAT, LON = 40.41, -3.69
GRADO_M = 111320.0


def _salto(metros, acc1, acc2, segundos=10):
    d = tempfile.mkdtemp(prefix="saga-salto-")
    sospechas, racha = os.path.join(d, "ac.json"), os.path.join(d, "racha.json")
    r = ac.check_travel_speed(sospechas, racha, "ANA", LAT, LON, 1000.0, acc1, LAT + metros / GRADO_M, LON,
                              1000.0 + segundos, acc2, level=2, total_stages=10)
    return r


def test_un_teletransporte_preciso_se_marca_a_la_primera():
    r = _salto(2000, 8, 10)
    assert r is not None and r["reason"] == "impossible_travel_speed"
    assert r["evidence"]["salto_unico"] is True


def test_un_salto_de_antena_impreciso_no_se_marca():
    assert _salto(2000, 8, 900) is None, "precisión de antena: puede ser ruido"
    assert _salto(2000, None, 10) is None, "sin precisión conocida no se fía"


def test_un_salto_pequeno_aislado_sigue_sin_marcarse():
    assert _salto(600, 8, 10) is None, "600 m en 10 s, una vez: puede ser un mal fix"

# -*- coding: utf-8 -*-
"""Aislamiento común a todas las pruebas.

`rechazos_de_avance.json` (5.79.0: el último nodo rechazado para siempre de cada jugador) vive en la carpeta de
datos, que comparten las pruebas de un mismo proceso. Un rechazo de «PLAYER 1» en una prueba hacía que, en otra, los
avances de «PLAYER 1» por detrás llegasen como `after_rejected_node` en vez de `behind`: fallos según el orden.
"""
import sys

import pytest


@pytest.fixture(autouse=True)
def _rechazos_de_avance_aislados(monkeypatch, tmp_path):
    main = sys.modules.get("main")
    if main is not None and hasattr(main, "RECHAZOS_DE_AVANCE_DB"):
        monkeypatch.setattr(main, "RECHAZOS_DE_AVANCE_DB", str(tmp_path / "rechazos_de_avance.json"))
    yield

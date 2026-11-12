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
    # 11/11: el aviso «OK» exige haber entrado en el nodo (main.aviso_sin_entrada). Las pruebas de siempre avanzan a
    # pelo con {"code": "OK"} para comprobar OTRAS cosas: aquí va apagado, y tests/test_ok_exige_entrada_11_11.py lo
    # enciende para probar la regla.
    if main is not None and hasattr(main, "EXIGIR_ENTRADA_PARA_OK"):
        monkeypatch.setattr(main, "EXIGIR_ENTRADA_PARA_OK", False)
    yield

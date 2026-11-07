# -*- coding: utf-8 -*-
"""7/11/2026: en 3D desde el zoom de los cuerpos (z16+), todos en un reparto en pantalla sin grupos (Óscar: «que no se
monten, que no tapen nodos y que se vean todos»). Pantalla simulada en tests/js/reparto_cuerpos_7_11.cjs: 2-15
compañeros a 1-15 m, la mitad con cuerpo, z16-z18 y un nodo en medio o a 25-60 m.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent


def test_z16_en_3d_sin_grupos_sin_solapes_y_cerca():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "reparto_cuerpos_7_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    d = json.loads(p.stdout)
    assert d["casos"] == 48 and d["grupos"] == 0 and d["faltan"] == 0, d
    assert d["tapan"] == 0 and d["sobreNodo"] == 0, d
    # Como mucho a 5 cuerpos de su sitio (con 16 en el mismo punto y un nodo en medio).
    assert d["distMax"] <= 5.01, d


def test_el_mapa_pasa_quien_va_en_cuerpo():
    m = (RAIZ / "frontend" / "src" / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8-sig")
    assert "retratos: true," in m and "      cuerpos," in m
    assert "setVersionTresD((v) => v + 1)" in m
    assert "conCorro(gps, corroPropioRef.current)" in m

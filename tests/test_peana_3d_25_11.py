# -*- coding: utf-8 -*-
"""25/11/2026 (Óscar: «estás probando solo la vista 2D, ¿y en 3D?»).

En 3D el nodo se dibuja a tamaño de pantalla: a z17,5 su peana mide ~15 m de radio y un cuerpo ~30 m de alto, así que el disco
de 5 m dejaba a los demás de pie en la peana y delante del poste. Ahora el disco de cada poste es la peana que se ve más el aro
de un cuerpo (`radioDePeanaM`, sólo zoom y latitud: girar o inclinar no mueve a nadie). Tú no te mueves; y de pie en el nodo, tu
cuerpo ya no se come el toque del nodo. Lógica en Node (tests/js/peana_3d_25_11.cjs). Hoja: scratchpad moneda-2d, hoja-5.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


@pytest.fixture(scope="module")
def d():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "peana_3d_25_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_nadie_mas_se_sube_a_la_peana_y_tu_no_te_mueves(d):
    assert d["casos"] == 27 and d["peorDentroM"] >= -0.01 and d["yoMovido"] == 0 and d["peorTopeM"] <= 0.01, d
    # Antes (disco de 5 m) se quedaban encima de la peana.
    assert d["antesDentro"] > 20, d


def test_el_radio_va_con_el_zoom_como_la_separacion(d):
    r = d["radios"]
    assert 50 < r["16"] < 65 and 22 < r["17.5"] < 29 and 9 < r["19"] < 13, r


def test_el_camino_en_el_mapa():
    m = (SRC / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8-sig")
    assert "fuente.peanaM = radioDePeanaM(mapa.getZoom(), lat ?? mapa.getCenter().lat)" in m
    assert "if (clave === CLAVE_YO && debugRef.current.alNodo && tocaElNodoActual(evento.point)) return" in m
    f = (SRC / "posicion" / "fuentePosicion.ts").read_text(encoding="utf-8-sig")
    assert "separacionM: this.separacionM, peanaM: this.peanaM, halo: haloTres })" in f
    assert "r: Math.max(R_DISCO_M, peanaM, monedas ? radioDeMonedaM(p, monedas) : 0)" in f

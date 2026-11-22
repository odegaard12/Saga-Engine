# -*- coding: utf-8 -*-
"""22/11 «1 · Brújula bajo el tiempo»: la mini brújula al nodo de la tarjeta, bajo el chip del tiempo. Las funciones
puras (giro corto, flecha con el giro del mapa, distancia) y lo que no puede perderse del componente."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


def test_funciones_puras_de_la_brujula():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "brujula_mini.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    j = json.loads(r.stdout)
    assert j["corto"] == [370, -10, -180, 810, 0]
    assert j["flecha"] == [0, 90, 340]
    assert j["rumbo"] == [0, 90]
    assert j["distancia"] == ["253 m", "1,2 km", "1000 m"]


def test_la_brujula_va_con_el_mapa_y_se_esconde_cuando_no_toca():
    c = leer("player", "components", "BrujulaMini.tsx")
    assert "giroDeLaFlecha(rumbo, rumboMapa)" in c, "la flecha descuenta el giro del mapa, no el del móvil"
    assert "deviceorientation" not in c
    assert "data-saga-brujula" in c and "T.siguienteNodo(distancia)" in c
    app = leer("player", "PlayerApp.tsx")
    i = app.index("<BrujulaMini")
    bloque = app[i:app.index("/>", i)]
    for condicion in ("!payload.finished", "!inRange", "'mapa_mudo'", "rumboMapa={rumboMapa}", "metros={distanceMeters}"):
        assert condicion in bloque, condicion
    css = leer("mobile-themes.css")
    assert "body.theme-dia [data-saga-brujula]" in css
    assert "[data-saga-brujula] g {\n    transition: none !important;" in css
    # Los retratos del mapa no se colocan debajo.
    assert "[data-saga-brujula]" in leer("player", "components", "MapSurfaceGL.tsx")


def test_textos_de_la_brujula_en_los_dos_idiomas():
    t = leer("player", "components", "textosDePantallas.ts")
    assert "`Siguiente nodo a ${distancia}`" in t and "`Seguinte nodo a ${distancia}`" in t

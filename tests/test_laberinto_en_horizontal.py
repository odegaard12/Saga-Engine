# -*- coding: utf-8 -*-
"""El laberinto con la pantalla girada (22/10/2026): se EJECUTA ejesDePantalla.ts (tests/js/ejes_laberinto.cjs).

beta/gamma van en los ejes del aparato. Con la pantalla en horizontal, inclinar «a la derecha» de lo que ve el
jugador movía la bola arriba o abajo. Cada giro tiene que dar las cuatro direcciones, y -90 (window.orientation de
iOS) es lo mismo que 270.

Sin Node o sin frontend/node_modules, se salta.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ARNES = RAIZ / "tests" / "js" / "ejes_laberinto.cjs"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(ARNES)], capture_output=True, text=True, encoding="utf-8", timeout=60, cwd=str(RAIZ)
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    return json.loads(proceso.stdout)


def test_en_vertical_no_cambia_nada(js):
    assert js["0"] == {"gammaMas": "right", "gammaMenos": "left", "betaMas": "down", "betaMenos": "up"}


def test_en_horizontal_se_giran_los_ejes(js):
    # Girado a la izquierda (90): la parte de abajo del aparato queda a la derecha de la pantalla.
    assert js["90"] == {"gammaMas": "up", "gammaMenos": "down", "betaMas": "right", "betaMenos": "left"}
    assert js["270"] == {"gammaMas": "down", "gammaMenos": "up", "betaMas": "left", "betaMenos": "right"}
    assert js["180"] == {"gammaMas": "left", "gammaMenos": "right", "betaMas": "up", "betaMenos": "down"}


def test_menos_noventa_es_doscientos_setenta(js):
    assert js["-90"] == js["270"]

# -*- coding: utf-8 -*-
"""24/11/2026: quien no se mueve no cambia de rumbo (Óscar: «un jugador quieto no cambia en pantalla al mover la cámara o al
cambiar la calidad»). Con 15 quietos, 2-3 cuerpos giraban 90° exactos tras orbitar o cambiar de calidad: el rumbo del servidor
caduca a los 20 s y el cuerpo rehecho nacía mirando a 0 rad y ahí se quedaba. Ahora el rumbo vive en la fuente de posición."""
import json
import math
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
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "rumbo_estable_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_el_rumbo_no_caduca_para_quien_esta_quieto(d):
    assert d["caducado"]["distintos"] == [90] and d["caducado"]["n"] > 50
    assert d["nuevo"] == 200, "un rumbo nuevo del jugador sí lo cambia"


def test_quien_se_para_conserva_el_rumbo_con_el_que_llego(d):
    assert abs(d["parado"]["andando"] - 90) <= 2
    assert d["parado"]["despues"] == [d["parado"]["andando"]]


def test_sin_dato_reposo_y_sin_camara_entre_las_entradas(d):
    assert d["sinDato"] is None and d["aridad"] == 2
    g = d["giro"]
    assert g["aridad"] == 1 and g["nulo"] == g["reposo"] == pytest.approx(math.pi)
    assert g["este"] == pytest.approx(math.pi / 2) and g["norte"] == pytest.approx(math.pi)


def test_el_cuerpo_rehecho_usa_el_rumbo_guardado():
    capa = (SRC / "avatares3d" / "mixamo" / "capaAvatares.ts").read_text(encoding="utf-8")
    assert "tuvoRumbo" not in capa, "el rumbo no se guarda en el cuerpo (se pierde al rehacerlo)"
    assert "let rumboCuerpo = e.ultimoRumbo" in capa and "av.goal = giroDelMotor(rumboCuerpo)" in capa
    assert capa.count("av.goal =") == 2, "sólo el saludo al tocar y el rumbo del jugador fijan el giro"
    # El cuerpo rehecho quieto y barato (pose congelada, sin `update`) nace ya girado; y con el giro a medias no se congela.
    assert "av.root.rotation.y = av.heading = av.goal" in capa
    assert "const parado = !girando &&" in capa

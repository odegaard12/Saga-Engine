# -*- coding: utf-8 -*-
"""25/11/2026 (Óscar, al ver la hoja 6: «el halo rosa del nodo debe ser la zona desde la que se puede entrar; veo jugadores fuera
del halo, entonces no estarían en el nodo»).

El halo del nodo en juego se dibuja con su radio de entrada REAL (metros → zoom), salvo cuando la peana (3D) o la moneda (2D)
no dejarían sitio a un jugador entre ellas y su borde: entonces se dibuja con ese mínimo (`radioMinimoDelHaloPx`). Quien está
REALMENTE dentro del radio se dibuja dentro del anillo (ni en la peana ni fuera) y quien está fuera, fuera; tú también. Con
mucha gente dentro se juntan (hasta 0,95 del reparto igual) en vez de salir del halo.
Lógica en Node (tests/js/halo_25_11.cjs). Hoja: scratchpad moneda-2d, hoja-7-halo*.
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
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "halo_25_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_quien_esta_dentro_se_ve_dentro_y_quien_esta_fuera_fuera(d):
    assert d["casos"] == 414 and d["mal"] == [], d["mal"]


def test_el_halo_es_el_radio_real_salvo_que_no_quepa_nadie(d):
    h = d["halo"]
    # 30 m reales: a z19 cabe (30 m); a z17,5 y z16 la moneda y la peana no dejarían sitio y se dibuja mayor.
    assert h["19"] == 30 and 38 < h["17.5"] < 45 and 85 < h["16"] < 105, h


def test_con_mucha_gente_dentro_se_juntan_sin_salir(d):
    s = d["sepMinDentro"]
    assert s["17.53D"]["minimaM"] > 10 and s["17.52D"]["minimaM"] > 10 and s["193D"]["minimaM"] > 9, s


def test_el_camino_en_el_mapa():
    m = (SRC / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8-sig")
    assert "halo.radioM = (r) => radioDelHaloM(zoom, r, latitud)" in m
    assert "entrada: n.entrada" in m
    e = (SRC / "components" / "mapa" / "estilo.ts").read_text(encoding="utf-8-sig")
    assert "'icon-size': tamanoDelHalo(RADIO_ENTRADA_PX)," in e

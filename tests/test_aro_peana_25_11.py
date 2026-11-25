# -*- coding: utf-8 -*-
"""25/11/2026 (Óscar, al ver la hoja 5).

1) «El aro sólo para mí»: en 3D sólo TU cuerpo lleva el aro de color en el suelo (para saber cuál eres); los demás, sólo el
   cuerpo. Los retratos 2D ya no llevaban aro en el suelo (11/11) y no cambian.
2) «Nadie sobre la peana, tampoco yo»: en 3D tu CUERPO sale de la peana lo mínimo (como tu retrato de la moneda en 2D, con
   el fundido de vista); tu real, tu GPS, la cercanía al nodo y la cámara no cambian. Los demás esquivan ese cuerpo.
Lógica en Node (tests/js/aro_peana_25_11.cjs). Hoja: scratchpad moneda-2d, hoja-6.
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
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "aro_peana_25_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_tu_cuerpo_sale_de_la_peana_y_tu_real_no(d):
    assert d["casos"] == 54 and d["peorDentroM"] >= -0.01 and d["peorExcesoM"] <= 0.01, d
    assert d["realMovido"] == 0 and d["fueraMovido"] == 0 and d["en2D"] == 0, d
    assert d["otrosSobreTiM"] >= -0.01, d


def test_sin_saltos_al_cambiar_de_vista(d):
    assert d["fundidoPeorPasoPx"] <= 6 and d["fundidoFinalM"] >= 25, d


def test_el_aro_solo_bajo_tu_cuerpo():
    c = (SRC / "avatares3d" / "mixamo" / "capaAvatares.ts").read_text(encoding="utf-8-sig")
    assert c.count("if (!e.aro && e.jugador.esYo) {") == 2 and c.count("crearAro(e.jugador.color, true)") == 2
    assert "crearAro(e.jugador.color, e.jugador.esYo)" not in c


def test_el_camino_en_el_mapa():
    m = (SRC / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8-sig")
    assert "const cuerpo = fuente.retratoPropio(CLAVE_YO, ahora) ?? gps" in m
    assert "lat: cuerpo.lat, lon: cuerpo.lon" in m and "real: gps" in m
    assert "fuenteRef.current.pesoCuerpo ??= (id) =>" in m

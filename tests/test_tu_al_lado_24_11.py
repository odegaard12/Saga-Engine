# -*- coding: utf-8 -*-
"""24/11/2026 (Óscar, al ver la hoja 2: «no debo estar encima de la moneda, ni translúcido: mi retrato al lado, como los demás»).

En 2D tu RETRATO sale de la moneda lo mínimo (hacia fuera desde donde estás; encima del poste, hacia donde venías o por tu hash),
con tu peso de moneda (0 con tu cuerpo 3D) y el mismo suavizado que los demás. Sólo las monedas te mueven: la gente nunca. Los
demás esquivan ese retrato apartado. Tu cuerpo, la cámara y tu posición siguen en tu real; un punto pequeño marca tu sitio real.
Lógica en Node (tests/js/tu_al_lado_24_11.cjs). Hoja: scratchpad moneda-2d, hoja-3-tu-al-lado.png.
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
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "tu_al_lado_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def leer(rel):
    return (SRC / rel).read_text(encoding="utf-8-sig")


def test_tu_retrato_al_lado_de_la_moneda_lo_justo(d):
    u = d["uno"]
    assert u["casos"] == 63 and u["peorDentroM"] >= -0.01 and u["peorExcesoM"] <= 0.01, u
    # Fuera de la moneda no se mueve; tu real (cuerpo, cámara) nunca; con tu cuerpo 3D, tampoco el retrato.
    assert u["fueraMovido"] == 0 and u["realMovido"] == 0 and u["en3D"] == 0, u


def test_la_gente_no_te_empuja_y_esquiva_tu_retrato(d):
    g = d["gente"]
    assert g["empujeM"] == 0 and g["casos"] >= 12 and g["peorHuecoM"] >= -0.01, g


def test_encima_del_poste_sales_hacia_donde_venias(d):
    p = d["poste"]
    # Llegas andando hacia el norte: tu retrato, al sur del poste. Sin rumbo, siempre el mismo sitio (hash).
    assert p["norteM"] < -5 and abs(p["esteM"]) < 0.5 and p["estable"] == 0, p


def test_sin_saltos_con_el_zoom_ni_al_cambiar_de_vista(d):
    c = d["continuo"]
    assert c["pellizcoPeorPasoPx"] <= 8 and c["fundidoPeorPasoPx"] <= 6 and c["realMovido"] == 0, c


def test_el_camino_en_el_mapa():
    m = leer("components/MapSurfaceGL.tsx")
    assert "const TU_SOBRE_LA_MONEDA: 'al-lado' | 'encima' | 'translucido' = 'al-lado'" in m
    # 25/11: sin el punto de tu sitio real (molestaba); la capa queda sin datos.
    assert "fuente.retratoPropio(CLAVE_YO, ahora)" in m and "sitioReal: 1" not in m
    e = leer("components/mapa/estilo.ts")
    assert "id: CAPA_TU_SITIO_REAL," in e and "filter: ['has', 'sitioReal']," in e and "filter: ['has', 'icono']," in e
    f = leer("posicion/fuentePosicion.ts")
    assert "yo: yoDos, otros, postes: this.postes" in f, "los demás esquivan tu retrato apartado, no tu real"

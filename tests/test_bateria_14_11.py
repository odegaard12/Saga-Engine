# -*- coding: utf-8 -*-
"""14/11 (batería, animaciones y 3D): sondeos que se paran con la pantalla oculta (JS con un reloj falso) y comprobaciones de texto
sobre lo que sólo se ve en un navegador: segunda pasada de three.js, latido de la portada, aro propio a escalones y modo ahorro."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"
NODE = shutil.which("node")


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    if not NODE:
        pytest.skip("sin node")
    p = subprocess.run([NODE, str(RAIZ / "tests" / "js" / "bateria_14_11.cjs")], capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_el_sondeo_se_para_con_la_pantalla_oculta(datos):
    v = datos["visible"]
    assert v["activoVisible"] == 1 and v["activoOculto"] == 0 and v["activoAlVolver"] == 1, v
    assert v["alVolverLlamo"] is True, v
    assert datos["limpia"] == {"intervalos": 0, "oyentes": 0}
    assert datos["arrancaOculta"] == {"antes": 0, "despues": 1}


@pytest.mark.parametrize(
    "ruta",
    [
        ("player", "avatares3d", "mixamo", "AvisoPersonajes.tsx"),
        ("player", "components", "AvisoDeCobertura.tsx"),
        ("player", "guia", "useSinRed.ts"),
        ("player", "components", "MissionPackPanel.tsx"),
        ("player", "components", "InventoryPanel.tsx"),
        ("player", "components", "CraftingPanel.tsx"),
    ],
)
def test_los_sondeos_de_adorno_usan_el_ayudante(ruta):
    t = leer(*ruta)
    assert "cadaMientrasVisible(" in t and "window.setInterval(" not in t, ruta


def test_el_reloj_de_la_hoja_se_alinea_con_el_segundo():
    t = leer("player", "components", "InteractionSheet.tsx")
    assert "1000 - (ms % 1000)" in t and "}, 250)" not in t


def test_la_segunda_pasada_de_three_solo_con_carteles_visibles():
    t = leer("player", "components", "nodosTresD.ts")
    assert re.search(r"if \(piezas\.some\(\(p\) => p\.grupo\.visible && p\.carteles\.length > 0\)\) \{\s+renderer\.clearDepth\(\)\s+camara\.layers\.set\(1\)", t)


def test_la_portada_ya_no_anima_la_sombra():
    t = leer("shared", "PuertaDeMision.tsx")
    kf = re.search(r"@keyframes puerta-late \{([^}]*\}?[^}]*)\}", t).group(1)
    assert "box-shadow" not in kf and "opacity" in kf, kf


def test_el_aro_propio_late_a_escalones_y_sigue_con_reduced_motion():
    t = leer("player", "components", "map-surface.css")
    assert "saga-yo-pulso 1.3s steps(12, end) infinite" in t
    assert re.search(r"prefers-reduced-motion: reduce\)\s*\{\s*\.saga-yo-pulso > span\s*\{\s*animation: none", t)


def test_el_ahorro_pausa_los_latidos_de_adorno_y_apaga_los_desenfoques():
    t = leer("mobile-themes.css")
    i = t.index("14/11 · Ahorro")
    bloque = t[i:]
    for sel in (".saga-yo-pulso > span", ".puerta-emblema::before", ".puerta-emblema::after", ".saga-aviso-desbloqueo-rayos"):
        assert "html.saga-ahorro " + sel in bloque, sel
    assert "animation-play-state" in bloque and "backdrop-filter: none !important" in bloque
    # sólo con la clase de ahorro: nada de reglas globales sueltas
    assert "html.saga-ahorro *," in bloque

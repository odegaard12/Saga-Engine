# -*- coding: utf-8 -*-
"""7/11/2026: prueba de estrés de la corona de retratos (Óscar: «¿es seguro que ya no se solapan?»).

Pantalla simulada (tests/js/corona_estres_7_11.cjs): 2-15 compañeros a 1-15 m, z15-z18, mapa girado e inclinado y
posiciones nuevas en cada paso (movimiento); y dos corros a 15-120 m uno de otro. Antes del arreglo, con dos corros
cercanos una corona caía encima de la otra en 56 de 576 casos; ahora se juntan (o pasan al número) y no se tapa nada.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent


def test_ningun_retrato_tapa_a_otro_en_la_prueba_de_estres():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "corona_estres_7_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    d = json.loads(p.stdout)
    assert d["casos"] == 720 and d["solapes"] == 0, d["peores"]
    assert d["casosDos"] == 576 and d["solapesDos"] == 0, d["peoresDos"]
    # Con un nodo en medio del corro, ningún retrato encima de su chincheta.
    assert d["casosNodo"] == 32 and d["tapanNodo"] == 0


def test_los_corros_que_se_tapan_se_juntan_y_se_vuelven_a_colocar():
    j = (RAIZ / "frontend" / "src" / "player" / "components" / "jugadoresEnMapa.ts").read_text(encoding="utf-8")
    bucle = j.split("for (let vuelta = 0; vuelta < 8; vuelta += 1) {", 1)[1][:1400]
    assert "if (grupoDe[a] === grupoDe[c]) continue" in bucle
    assert "< ancho * 0.95" in bucle and "padre[raiz(grupoDe[a])] = raiz(grupoDe[c])" in bucle
    assert "if (!junto) break" in bucle


def test_el_mapa_pasa_los_nodos_a_evitar():
    m = (RAIZ / "frontend" / "src" / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8-sig")
    assert "evitar: postesDeNodos," in m


def test_la_corona_se_recoloca_al_girar_o_inclinar_el_mapa():
    m = (RAIZ / "frontend" / "src" / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8-sig")
    assert "mapa.on('rotateend', alGirarLaVista)" in m and "mapa.on('pitchend', alGirarLaVista)" in m
    assert "bocadillos, tresD, pintarFuente, giroDeLaVista])" in m
    j = (RAIZ / "frontend" / "src" / "player" / "components" / "jugadoresEnMapa.ts").read_text(encoding="utf-8")

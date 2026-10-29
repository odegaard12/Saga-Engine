# -*- coding: utf-8 -*-
"""D1 (26/10/2026, «pizarra afinada», elegida por Óscar): todo el jugador en la pizarra, una escala corta de radios,
sombras, letra y movimiento, un solo azul de acción (el verde sólo es «hecho»), «Misión completada» en pizarra y el
chip de cobertura. Pruebas de texto sobre el CSS y los componentes, y la función pura del chip."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"


def leer(*ruta):
    return (SRC.joinpath(*ruta)).read_text(encoding="utf-8")


def test_la_escala_de_d1_esta_definida():
    css = leer("mobile-themes.css")
    for v in ("--saga-radio-hoja: 22px", "--saga-radio-tarjeta: 14px", "--saga-radio-pildora: 999px",
              "--saga-sombra-1", "--saga-sombra-2", "--saga-sombra-3",
              "--saga-texto-xs", "--saga-texto-sm", "--saga-texto-md", "--saga-texto-lg", "--saga-texto-xl",
              "--saga-dur: 180ms", "--saga-curva"):
        assert v in css, v


def test_el_tema_ria_es_la_pizarra_y_la_pulsacion_respeta_reducir_movimiento():
    css = leer("mobile-themes.css")
    i = css.index("html.theme-ria,\nbody.theme-ria {")
    ria = css[i:css.index("\n}\n", i)]
    assert "--theme-ink: 40, 48, 62;" in ria and "--theme-card: #3a4456;" in ria and "--theme-bg: #27324a;" in ria
    assert "--theme-primary: #38bdf8;" in ria, "el azul de acción no cambia"
    assert "--theme-radius-panel: 22px;" in ria and "--theme-radius-card: 14px;" in ria
    assert "@media (prefers-reduced-motion: no-preference)" in css and "scale: 0.98;" in css


def test_mision_completada_en_pizarra_y_boton_azul():
    c = leer("player", "components", "PlayerLayout.tsx")
    i = c.index("export const finishOverlayStyle")
    s = c[i:]
    tarjeta = s[s.index(".saga-finish-card {"):s.index(".saga-finish-orb {")]
    assert "var(--saga-pizarra)" in tarjeta and "var(--saga-radio-hoja)" in tarjeta and "theme-ok" not in tarjeta
    boton = s[s.index(".saga-finish-btn-primary {"):s.index(".saga-finish-btn-secondary {")]
    assert "var(--theme-primary)" in boton and "theme-ok" not in boton, "el verde es sólo para «hecho»: el trofeo"
    assert "-webkit-text-fill-color: transparent" not in s[s.index(".saga-finish-title {"):s.index(".saga-finish-subtitle")]


def test_el_boton_principal_de_herramientas_es_el_azul_de_accion():
    p = leer("player", "components", "MissionPackPanel.tsx")
    primario = p[p.index("const primary: CSSProperties"):p.index("const actions: CSSProperties")]
    assert "var(--theme-primary)" in primario and "theme-done" not in primario


def test_el_chip_de_cobertura_esta_montado_y_no_pide_red():
    app = leer("player", "PlayerApp.tsx")
    assert "<ChipDeCobertura user={payload.user}" in app
    chip = leer("player", "components", "ChipDeCobertura.tsx")
    assert "contarAvancesPendentes" in chip and "sinCoberturaAhora" in chip
    assert "fetch" not in chip, "el chip sólo lee el estado local"
    assert "document.visibilityState === 'hidden'" in chip, "con la página oculta no lee nada"


def test_estado_de_cobertura_puro():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "estado_de_cobertura.cjs")], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    j = json.loads(r.stdout)
    assert j["conRedYVacia"] is None
    assert j["sinRedYVacia"] == {"tipo": "sin_red", "n": 0}
    assert j["sinRedConDos"] == {"tipo": "esperando", "n": 2}
    assert j["conRedYTres"] == {"tipo": "sincronizando", "n": 3}
    assert j["basura"] is None and j["negativo"] == {"tipo": "sin_red", "n": 0}
    assert j["textos"]["es"][0].startswith("Sin cobertura") and j["textos"]["es"][1] == "1 avance esperando cobertura"
    assert j["textos"]["es"][2] == "3 avances esperando cobertura" and j["textos"]["es"][3] == "Sincronizando… 2"
    assert j["textos"]["gl"] == ["1 avance agardando cobertura", "2 avances agardando cobertura"]
    assert j["textos"]["en"] == ["1 node waiting for signal", "2 nodes waiting for signal", "Syncing… 3"]

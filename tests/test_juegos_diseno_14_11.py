# -*- coding: utf-8 -*-
"""14/11/2026: hallazgos de la medición de juegos y diseño (lee el código fuente)."""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src"


def leer(rel: str) -> str:
    return (SRC / rel).read_text(encoding="utf-8-sig")


def test_faros_el_senuelo_no_cae_en_el_rumbo_de_salida():
    assert "[...faros, ...fuera, 0].every" in leer("player/minigames/families/bearingHunt/faros.ts")


def test_botones_de_cierre_con_toque_de_44():
    for f in ("player/components/PlayerHud.tsx", "player/components/RankingSheet.tsx"):
        assert "saga-toque saga-toque-cierre" in leer(f)
    assert ".saga-toque.saga-toque-cierre::after" in leer("mobile-themes.css")
    assert "button::after" in leer("player/avatares3d/mixamo/tienda.css")


def test_aviso_de_cobertura_no_se_pisa_con_el_chip():
    # 20/11: ya no hay dos; el aviso centrado se retiró y queda el ChipDeCobertura.
    assert not (SRC / "player/components/AvisoDeCobertura.tsx").exists()  # 20/11: retirado, lo dice el ChipDeCobertura


def test_checkpoint_sin_gps_cobra_el_respaldo():
    s = leer("player/PlayerApp.tsx")
    assert "penalizacionDeRespaldo(currentStage)" in s and "gps_rendido" in s
    g = leer("player/guia/guia.ts")
    assert "Suma ${e.respaldo}" in g and "Suma ${e.respaldo}" in g.split("gl:")[-1] or "Sen posición fiable" in g


def test_contrastes_menores_con_tokens():
    assert "var(--s-texto-2" in leer("player/components/PlayerLayout.tsx")
    cs = leer("player/minigames/families/signalHunt/CuentaSenalesRuntimeScreen.tsx")
    # el botón relleno lleva el texto pensado para ir sobre el acento (--mg-on-primary = --theme-on-primary, >=4,5:1 en los 7 temas)
    assert "background: var(--theme-primary);\n  color: var(--mg-on-primary)" in cs
    assert "var(--s-fondo" in leer("player/components/InteractionSheet.tsx")
    assert not re.search(r"\.mosaic-progress-head \{[^}]*\.48\)", leer("player/minigames/families/placeMosaic/RuntimeScreen.tsx"))


def test_circuito_celdas_con_toque_ampliado():
    assert ".circuit-cell::after" in leer("player/minigames/families/circuitMatrix/RuntimeScreen.tsx")

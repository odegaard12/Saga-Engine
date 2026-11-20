# -*- coding: utf-8 -*-
"""Un solo aviso «Sin cobertura» (QA del 20/11/2026: salían DOS iguales a la vez durante 2-5 s).

El aviso centrado de 16/10 (AvisoDeCobertura) se retiró: lo dice el ChipDeCobertura, que mira la misma señal con una
ventana más larga, así que siempre que salía el aviso el chip ya estaba. El chip no avisa al volver la red.
"""
from pathlib import Path

COMP = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player" / "components"
CHIP = (COMP / "ChipDeCobertura.tsx").read_text(encoding="utf-8")


def test_el_aviso_retirado_ya_no_existe():
    app = (COMP.parent / "PlayerApp.tsx").read_text(encoding="utf-8")
    assert not (COMP / "AvisoDeCobertura.tsx").exists() and "AvisoDeCobertura" not in app


def test_el_chip_es_el_unico_aviso_sin_red_y_no_avisa_al_volver():
    assert "tx.sinRed" in CHIP and "sinCoberturaAhora(VENTANA_SIN_RED_LARGA_MS)" in CHIP
    assert "Conectado de nuevo" not in CHIP and "Conectado de novo" not in CHIP

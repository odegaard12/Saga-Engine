# -*- coding: utf-8 -*-
"""15/11: con la pantalla oculta se pausan las animaciones infinitas (atributo en <html> + una regla global)."""
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "frontend" / "src"


def test_el_atributo_y_la_regla_van_a_la_par():
    main = (SRC / "main.tsx").read_text(encoding="utf-8")
    css = (SRC / "saga-lenguaje.css").read_text(encoding="utf-8")
    assert "visibilitychange" in main and "data-saga-oculta" in main
    assert "html[data-saga-oculta] * { animation-play-state: paused !important; }" in css

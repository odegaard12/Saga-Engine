# -*- coding: utf-8 -*-
"""26/10: un nodo no puede asomar «dos círculos» (Óscar).

Dos nodos en el mismo punto (un QR y un juego, o una ruta de pruebas apilada) se dibujaban uno sobre otro; como el nodo
en juego va un 8 % más grande, el de debajo asomaba por detrás como una segunda moneda (azul si era de tipo QR). Ahora,
con otro nodo a menos de 3 m del que toca, sólo se pinta el que toca. Y el halo del nodo en juego cuenta esa escala.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
COMP = RAIZ / "frontend" / "src" / "player" / "components"


def test_el_nodo_en_juego_tapa_a_los_que_tiene_debajo():
    s = (COMP / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "const debajoDelActual = " in s and "Math.hypot(dx, dy) < 3" in s
    assert ".filter((_, indice) => !debajoDelActual(nodos[indice], indice))" in s


def test_el_halo_del_nodo_en_juego_cuenta_su_escala():
    s = (COMP / "bolaRenderizada.ts").read_text(encoding="utf-8")
    assert "const ESCALA_NODO_ACTUAL = 1.08" in s
    assert "escena.scale.setScalar(ESCALA_NODO_ACTUAL)" in s
    assert "ESCALA_NODO_ACTUAL * CENTRO_MONEDA * Math.cos(PHI)" in s

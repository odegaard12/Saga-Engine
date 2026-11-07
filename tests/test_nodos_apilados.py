# -*- coding: utf-8 -*-
"""26/10: un nodo no puede asomar «dos círculos» (Óscar).

Dos nodos en el mismo punto (un QR y un juego, o una ruta de pruebas apilada) se dibujaban uno sobre otro; como el nodo
en juego va un 8 % más grande, el de debajo asomaba por detrás como una segunda moneda (azul si era de tipo QR). Ahora,
con otro nodo a menos de 3 m del que toca, sólo se pinta el que toca. Y el halo del nodo en juego cuenta esa escala.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
COMP = RAIZ / "frontend" / "src" / "player" / "components"


def test_los_nodos_apilados_se_abren_en_arco_y_el_actual_queda_encima():
    # 7/11: antes, de cada sitio con varios nodos sólo se pintaba el que toca; ahora se abren en arco compacto
    # (repartoDeNodos.ts, ver test_nodos_monedas_7_11.py) y el nodo en juego sigue pintándose el último.
    s = (COMP / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "debajoDelActual" not in s
    assert "repartirNodos(repartibles," in s and "orden: indice === currentLevel ? 1000 : indice," in s


def test_el_halo_del_nodo_en_juego_cuenta_su_escala():
    s = (COMP / "bolaRenderizada.ts").read_text(encoding="utf-8")
    assert "const ESCALA_NODO_ACTUAL = 1.08" in s
    assert "escena.scale.setScalar(ESCALA_NODO_ACTUAL)" in s
    assert "ESCALA_NODO_ACTUAL * CENTRO_MONEDA * Math.cos(PHI)" in s

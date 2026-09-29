# -*- coding: utf-8 -*-
"""El mapa es la pantalla entera, y era lo que seguía saliendo verde.

Medido en el navegador, sobre el banco de ensayo, sumando el área de cada
elemento verde que se ve:

    saga-offline-grid-tile   28 elementos   1 816 696 px²   <- 99 % del verde
    tilt-primary (borde)      1                14 183 px²
    saga-mission-node-pin     2                 2 426 px²
    saga-avatar-pin (brillo)  1                 2 095 px²

O sea: cambiar botones y tintes no cambiaba nada, porque lo que ocupa la
pantalla es el mapa, y el mapa iba verde por su cuenta —la rejilla de fondo, la
línea de la ruta, el brillo del marcador del jugador y los controles—.

Lo que NO se toca, a propósito: los pines de nodo. Verde = superado, azul = el
que toca ahora, rojo = pendiente. Es una escala con significado, y ahí el rojo
ya quiere decir otra cosa: pintar de rojo lo superado sería mentir en el sitio
donde el jugador mira para saber por dónde va.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"


def test_o_tema_define_o_lavado_do_mapa():
    css = TEMAS.read_text(encoding="utf-8")

    assert "--theme-wash" in css, "falta el tono suave para el fondo del mapa"

    for tema in ("body.theme-glass", "body.theme-flame-red"):
        inicio = css.index(tema)
        assert "--theme-wash:" in css[inicio : css.index("}", inicio)], (
            f"{tema} no define su lavado"
        )

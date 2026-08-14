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
MAPA = RAIZ / "frontend" / "src" / "player" / "components" / "MapSurface.tsx"
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"

# El verde de marca, en sus formas.
VERDE = re.compile(r"34,\s*197,\s*94|22c55e|16a34a|16,\s*185,\s*129|10b981|4ade80|34d399|74,\s*222,\s*128")


def codigo() -> str:
    texto = MAPA.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_a_rexilla_do_mapa_segue_o_tema():
    """Son 28 teselas que tapan la pantalla: es el 99 % del verde."""
    c = codigo()

    inicio = c.index(".saga-offline-grid-tile")
    bloque = c[inicio : c.index("}", inicio)]

    assert not VERDE.search(bloque), "la rejilla del mapa sigue con el verde fijo"
    assert "var(--theme" in bloque, "la rejilla tiene que salir del tema"


def test_a_liña_da_ruta_segue_o_tema():
    """Es lo segundo más grande: cruza el mapa de punta a punta."""
    c = codigo()

    # La regla de CSS, no el `className` que Leaflet le pone al polyline.
    assert ".saga-road-guide {" in c, "falta la regla de estilo de la línea de la ruta"

    inicio = c.index(".saga-road-guide {")
    bloque = c[inicio : inicio + 260]

    assert "stroke: var(--theme" in bloque, (
        "la línea de la ruta tiene que teñirse desde el CSS: Leaflet escribe el "
        "color como atributo del SVG y ahí var() no resuelve"
    )


def test_o_brillo_do_xogador_segue_o_tema():
    c = codigo()

    inicio = c.index("sagaPlayerLocator")
    bloque = c[inicio : inicio + 300]

    assert not VERDE.search(bloque), "el brillo del marcador sigue verde"


def test_os_pins_de_nodo_non_cambian():
    """Verde = superado, azul = el que toca, rojo = pendiente. Es una escala."""
    c = codigo()

    inicio = c.index("const stateColor")
    bloque = c[inicio : inicio + 200]

    assert "#22c55e" in bloque, "el verde de 'superado' se queda: es semántico"
    assert "#3b82f6" in bloque and "#ef4444" in bloque, "la escala entera se queda"


def test_o_tema_define_o_lavado_do_mapa():
    css = TEMAS.read_text(encoding="utf-8")

    assert "--theme-wash" in css, "falta el tono suave para el fondo del mapa"

    for tema in ("body.theme-glass", "body.theme-flame-red"):
        inicio = css.index(tema)
        assert "--theme-wash:" in css[inicio : css.index("}", inicio)], (
            f"{tema} no define su lavado"
        )

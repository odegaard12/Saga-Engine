# -*- coding: utf-8 -*-
"""En la pantalla del jugador, lo grande también sigue al tema.

La entrada ya salía roja, pero el jugador seguía viéndose «glass». Medido en el
banco, ordenando por área, las superficies que tapan la pantalla:

    map-surface         rgb(223, 232, 221)   865 787 px²   gris verdoso
    leaflet-container   rgb(15, 23, 42)      862 086 px²   pizarra
    velo del panel      rgba(2, 6, 23, .42)  874 510 px²   azul marino

Tres colores de la paleta vieja, cada uno del tamaño de la pantalla entera. Con
eso debajo, daba igual que los paneles fuesen rojos.

Y `.leaflet-container` estaba declarado DOS veces, las dos con `!important`:
una apuntando al tema y otra con el azul pizarra escrito a mano. Gana la última
que se inyecta, que es justo el tipo de empate que ya costó caro con
`.saga-glass-panel`.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

MAPA = FRONT / "player" / "components" / "MapSurface.tsx"
PREP = FRONT / "player" / "components" / "FieldPrepPanel.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_o_fondo_do_mapa_segue_o_tema():
    """865 787 px² de gris verdoso debajo de todo."""
    codigo = sin_comentarios(MAPA)

    assert "#dfe8dd" not in codigo, "queda el gris verdoso escrito a mano"


def test_leaflet_declarase_unha_soa_vez_no_mapa():
    """Dos reglas con !important es un empate que decide el orden."""
    codigo = sin_comentarios(MAPA)

    assert "background: #0f172a !important" not in codigo, (
        "queda una segunda regla de .leaflet-container con el azul clavado"
    )


def test_o_velo_do_panel_non_e_azul_marino():
    codigo = sin_comentarios(PREP)

    assert "rgba(2,6,23,.42)" not in codigo and "rgba(2, 6, 23, .42)" not in codigo, (
        "el velo sigue tiñendo de azul marino la pantalla entera"
    )


def test_as_tres_superficies_saen_do_tema():
    for fichero in (MAPA, PREP):
        codigo = sin_comentarios(fichero)
        assert "var(--theme" in codigo, f"{fichero.name} no lee ninguna variable del tema"

# -*- coding: utf-8 -*-
"""El fondo de la aplicación sigue al tema. Medido en el navegador, no supuesto.

Con el tema de fuego puesto en producción, el fondo seguía saliendo azul
marino. Yo había dicho que el tema ya llegaba. No llegaba, y la razón la dio el
navegador, no el código:

    body.className            = "theme-flame-red"     <- bien
    --theme-bg                = "#2f0a0a"             <- bien
    getComputedStyle(body).backgroundColor = "rgb(2, 6, 23)"   <- azul marino

La regla que ganaba:

    html, body, #root { ... background: rgb(2, 6, 23) !important; }

Sale de `globalPlayerEdgeFix`, un bloque de CSS que `ScreenFrame` inyecta en un
`<style>`. Con `!important` gana a cualquier especificidad, así que el tema no
podía pintar el fondo por mucho que la variable estuviera bien.

Y el color salía de un apaño: el bloque tiene `#020617` escrito dentro y se
generaba con `globalPlayerEdgeFix.replace(/#020617/g, themeColor)`, donde
`themeColor` es una prop cuyo valor por defecto es… `#020617`, y nadie le pasa
otro. Un reemplazo de cadenas donde tenía que haber una variable de CSS.

Es el motivo entero de que el tema pareciera "un parche de unos botones": lo
más grande de la pantalla —el fondo y el mapa— no lo tocaba.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

LAYOUT = FRONT / "player" / "components" / "PlayerLayout.tsx"
TEMAS = FRONT / "mobile-themes.css"


def bloque_global() -> str:
    codigo = LAYOUT.read_text(encoding="utf-8")
    inicio = codigo.index("export const globalPlayerEdgeFix")
    return codigo[inicio : codigo.index("`\n", codigo.index("`", inicio) + 1)]


def test_o_fondo_global_sae_do_tema():
    bloque = bloque_global()

    assert "var(--theme-bg)" in bloque, "el fondo global tiene que venir del tema"
    assert "#020617" not in bloque, "queda el azul marino escrito a mano"


def test_o_mapa_tamen_segue_o_tema():
    """Es lo que se ve entre tesela y tesela mientras cargan."""
    bloque = bloque_global()

    assert "var(--theme-surface)" in bloque, "el fondo del mapa también es del tema"
    assert "#1e293b" not in bloque


def test_non_se_xera_o_css_con_reemplazo_de_cadeas():
    """`replace(/#020617/g, ...)` es lo que hacía imposible cambiarlo."""
    codigo = LAYOUT.read_text(encoding="utf-8")

    assert "replace(/#020617/g" not in codigo, (
        "el color no se mete reemplazando texto: para eso están las variables"
    )


def test_cada_tema_define_a_superficie():
    codigo = TEMAS.read_text(encoding="utf-8")

    assert "--theme-surface" in codigo

    for tema in ("body.theme-glass", "body.theme-flame-red"):
        inicio = codigo.index(tema)
        bloque = codigo[inicio : codigo.index("}", inicio)]
        assert "--theme-surface:" in bloque, f"{tema} no define su superficie"


def test_o_marco_da_pantalla_non_pinta_o_seu_propio_fondo():
    """`background: themeColor` en el div volvía a fijar el azul."""
    codigo = LAYOUT.read_text(encoding="utf-8")

    inicio = codigo.index("export function ScreenFrame")
    cuerpo = codigo[inicio : inicio + 1600]

    assert re.search(r"background:\s*'var\(--theme-bg\)'", cuerpo), (
        "el marco tiene que pintar del tema"
    )

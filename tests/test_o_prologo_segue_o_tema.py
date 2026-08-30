# -*- coding: utf-8 -*-
"""`StoryModal.tsx` (el Prólogo y los demás textos de historia) llevaba su
forma entera en línea -color, radio, borde, sombra-, escrita a mano con las
variables de brasa de cristal (`--theme-sheen-*`) en vez de apoyarse en
`.saga-glass-panel`. En cristal daba la casualidad de que coincidía en
píxeles con el resto de paneles, así que nunca se notó como un fallo; en
fuego se quedaba completamente plano, sin corte ni brasa -medido con
`getComputedStyle` en un arnés real: `clip-path: none`, el mismo degradado
gris de cristal, `border-radius: 28px` clavado-.

Encontrado señalando la barra superior («la estropeas») y mirando la
pantalla en fuego con capturas reales: el Prólogo era el que de verdad
estaba sin tocar por el tema, no la barra.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
STORY_MODAL = RAIZ / "frontend" / "src" / "player" / "components" / "StoryModal.tsx"
THEMES = RAIZ / "frontend" / "src" / "mobile-themes.css"


def componente() -> str:
    return STORY_MODAL.read_text(encoding="utf-8")


def temas() -> str:
    return THEMES.read_text(encoding="utf-8")


def test_o_panel_leva_a_clase_do_tema():
    assert 'className="saga-story-panel"' in componente(), (
        "el panel del prólogo perdió la clase que lo engancha al tema"
    )


def test_o_cristal_non_cambia_ni_un_pixel():
    """Lo en línea tiene que seguir ahí: es lo que deja a cristal intacto."""
    codigo = componente()
    assert "borderRadius: '28px'" in codigo, "cristal cambiaría de radio si esto se quita"
    assert "rgba(var(--theme-sheen-a)" in codigo, "cristal perdería su degradado si esto se quita"
    assert "border: '1px solid rgba(255, 255, 255, 0.22)'" in codigo, (
        "cristal perdería su borde si esto se quita"
    )


def bloque_do_tema_de_fogo() -> str:
    texto = temas()
    inicio = texto.index("body.theme-flame-red .saga-story-panel {")
    return texto[inicio : texto.index("}", inicio)]


def test_o_fogo_gana_a_forma_en_liña_con_important():
    """Lo único que le gana a un estilo en línea es !important. Sin eso, esta
    regla entera es tan muerta como la que arregla."""
    b = bloque_do_tema_de_fogo()
    for propiedad in ("background:", "border-radius:", "border:", "border-top:"):
        inicio = b.index(propiedad)
        linea = b[inicio : b.index(";", inicio)]
        assert "!important" in linea, f"{propiedad} sin !important no le gana a lo en línea"


def test_o_fogo_leva_o_mesmo_corte_que_o_resto_de_paneis():
    b = bloque_do_tema_de_fogo()
    assert "var(--theme-panel-cut)" in b, "el prólogo no usa la variable de corte del tema"

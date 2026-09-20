# -*- coding: utf-8 -*-
"""La píldora del contador (1/2, 2/2) en la barra de arriba llevaba un blanco
translúcido pensado para el azul noche de cristal. Sobre la brasa de fuego
-un degradado ya cálido- ese blanco casi no cambia el matiz: medido con
`getComputedStyle`, el fondo de la píldora caía dentro del mismo rango de
color que la propia barra. No se leía mal, se leía como si no hubiera
píldora: el número flotando sin separación.

Pedido directo: «no hai separación entre levar 1/2 o 2/2». El reloj de al
lado no tenía este problema porque usa un color con tinte propio en vez de
un blanco translúcido -el mismo principio que ya arregló el prólogo-.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SHELL = RAIZ / "frontend" / "src" / "player" / "components" / "PlayerShell.tsx"
THEMES = RAIZ / "frontend" / "src" / "mobile-themes.css"


def componente() -> str:
    return SHELL.read_text(encoding="utf-8")


def temas() -> str:
    return THEMES.read_text(encoding="utf-8")


def test_a_pildora_leva_a_clase_do_tema():
    assert 'className="saga-shell-count-pill"' in componente(), (
        "la píldora del contador perdió el enganche al tema"
    )


def test_o_cristal_xa_non_leva_fondo_en_liña():
    """Superseded: «diseño B» quitó el fondo en línea de la píldora.

    Ya no hay `background` en el estilo de `contadorTexto` -solo
    `color: var(--theme-primary)`-, así que en cristal el contador es texto
    coloreado sin píldora propia. `body.theme-flame-red .saga-shell-count-pill`
    en mobile-themes.css SÍ sigue forzando un fondo oscuro con `!important`:
    es una asimetría real entre temas -pendiente en TODO.md-, no algo que
    esta prueba deba ocultar fingiendo que el fondo en línea sigue ahí.
    """
    assert "background: 'rgba(255,255,255,.12)'" not in componente(), (
        "ha vuelto el fondo en línea viejo de la píldora"
    )


def bloque_da_pildora() -> str:
    texto = temas()
    inicio = texto.index("body.theme-flame-red .saga-shell-count-pill {")
    return texto[inicio : texto.index("}", inicio)]


def test_o_fogo_oscurece_en_vez_de_aclarar():
    """Oscurecer separa en cualquier matiz de fondo; aclarar sobre un fondo ya
    cálido no separa nada -ese era el fallo original-."""
    b = bloque_da_pildora()
    assert "rgba(0, 0, 0," in b, "el arreglo tiene que oscurecer el fondo, no aclararlo"
    assert "!important" in b, "sin !important no le gana al estilo en línea"

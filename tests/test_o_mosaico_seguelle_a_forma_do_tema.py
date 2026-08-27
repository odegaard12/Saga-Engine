# -*- coding: utf-8 -*-
"""placeMosaic era el peor caso de docs/plan-de-mejora.md, 4.2: 1236 líneas,
20 formas en línea y **una sola** referencia al tema en todo el fichero. Un
tema podía cambiar todos los colores que quisiera; la cara del minijuego
seguía siendo la misma porque las esquinas estaban clavadas en píxeles.

Medido con un arnés real (`mobile-themes.css` cargado tal cual, sin copiar
valores a mano) antes de dar esto por bueno, porque el propio plan avisa: van
tres rondas de rediseño descartadas al verlas en pantalla.

    Elemento              cristal (antes → ahora)   fuego
    contenedor             22px → 24px                2px
    tarjetas/tablero/botón  12-18px → 16px             2px
    píldoras/insignias      999px (sin cambio)         3px

Esta prueba no repite esa medición -no hay navegador aquí-, pero sí impide que
alguien vuelva a clavar un número donde ahora hay una variable.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUNTIME = (
    RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "placeMosaic" / "RuntimeScreen.tsx"
)

# Selectores que dan forma a piezas de tamaño "tarjeta" (tablero, botones,
# recuadros) o "panel" (el contenedor entero). El de la ficha individual
# (.mosaic-tile, 5px) queda fuera a propósito: es un detalle demasiado
# pequeño para contar como "cara" del tema, no un olvido.
SELECTORES_CARD_O_PANEL = (
    ".mosaic-shell {",
    ".mosaic-counter {",
    ".mosaic-card {",
    ".mosaic-board {",
    ".mosaic-shell button {",
    ".mosaic-preview {",
    ".mosaic-preview-overlay {",
    ".mosaic-completed-photo {",
    ".mosaic-next-step {",
    ".mosaic-question {",
)

# Las que son círculos/píldoras de verdad.
SELECTORES_PILDORA = (
    ".mosaic-progress-track {",
    ".mosaic-preview-meta span {",
    ".mosaic-preview-progress {",
    ".mosaic-completed-badge {",
    ".mosaic-choice-index {",
    ".mosaic-result-icon {",
)


def styles() -> str:
    return RUNTIME.read_text(encoding="utf-8")


def bloque(selector: str) -> str:
    texto = styles()
    inicio = texto.index(selector)
    return texto[inicio : texto.index("}", inicio)]


def test_as_formas_de_tarxeta_seguen_a_variable_do_tema():
    for selector in SELECTORES_CARD_O_PANEL:
        b = bloque(selector)
        assert re.search(r"border-radius:\s*var\(--theme-radius-(panel|card)", b), (
            f"{selector} sigue con una forma clavada en píxeles; "
            "el tema no le llega, igual que antes de 4.9.32"
        )


def test_as_pildoras_seguen_a_variable_do_tema():
    for selector in SELECTORES_PILDORA:
        b = bloque(selector)
        assert re.search(r"border-radius:\s*var\(--theme-radius-pill", b), (
            f"{selector} dejó de usar --theme-radius-pill"
        )


def test_a_ficha_individual_segue_sen_tocar_a_propósito():
    """Que quede documentado por qué NO se tocó, no que se coló."""
    b = bloque(".mosaic-tile {")
    assert "border-radius: 5px;" in b, (
        "si esto cambia, actualiza también el comentario de esta prueba: "
        "dejar 5px fue una decisión, no un olvido"
    )

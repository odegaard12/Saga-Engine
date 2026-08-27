# -*- coding: utf-8 -*-
"""tiltMaze, tercero de la lista de docs/plan-de-mejora.md, 4.2: 665 líneas,
10 formas en línea. Las 9 decorativas pasan a las variables del tema; la
bola (`.tilt-ball`) se deja fuera a propósito -es información (el objeto que
se mueve), no decoración, igual que los alfileres del mapa- y esta prueba
exige que quede así de documentado, no que se coló.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUNTIME = RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "tiltMaze" / "RuntimeScreen.tsx"


def styles() -> str:
    return RUNTIME.read_text(encoding="utf-8")


def regla(selector: str) -> str:
    texto = styles()
    inicio = texto.index(selector)
    return texto[inicio : texto.index("}", inicio)]


SELECTORES_CARD = (
    ".tilt-stat{",
    ".tilt-board{position:relative",
    ".tilt-help{",
    ".tilt-actions button,.tilt-primary{",
    ".tilt-pad button{",
    ".tilt-pad-toggle{",
)

SELECTORES_PANEL = (
    ".tilt-shell{",
    ".tilt-board-wrap{",
)

SELECTORES_PILDORA = (".tilt-result-icon{",)


def test_as_formas_de_tarxeta_seguen_a_variable_do_tema():
    for selector in SELECTORES_CARD:
        b = regla(selector)
        assert re.search(r"border-radius:var\(--theme-radius-card", b), (
            f"{selector} sigue con una forma clavada en píxeles"
        )


def test_os_paneis_seguen_a_variable_do_tema():
    for selector in SELECTORES_PANEL:
        b = regla(selector)
        assert re.search(r"border-radius:var\(--theme-radius-panel", b), (
            f"{selector} sigue con una forma clavada en píxeles"
        )


def test_a_pildora_do_resultado_segue_a_variable_do_tema():
    for selector in SELECTORES_PILDORA:
        b = regla(selector)
        assert re.search(r"border-radius:var\(--theme-radius-pill", b), (
            f"{selector} dejó de usar --theme-radius-pill"
        )


def test_a_bola_segue_sen_tocar_a_propósito():
    b = regla(".tilt-ball{")
    assert "border-radius:999px" in b, (
        "si esto cambia, actualiza también el comentario que lo explica: "
        "la bola tiene que seguir siendo redonda en cualquier tema"
    )
    assert "NO sigue al tema" in styles(), "falta el comentario que explica por qué"

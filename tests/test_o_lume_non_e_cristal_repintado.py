# -*- coding: utf-8 -*-
"""Una variable que vale lo mismo en los dos temas es sospechosa.

Esta semana, seis veces: el mecanismo del tema montado y la pieza sin
enganchar. Ninguna dio un error.

    el corte             --theme-panel-cut valía 0, igual que cristal
    la barra de arriba   --theme-radius-shell no la declaraba NADIE
    los alfileres        border-radius 999px clavado en el componente
    la brasa             el degradado, en un solo sitio de todo el CSS
    la mesa              sin clase de tema
    la hoja              sin clase de tema

Las tres primeras las habría cazado esta prueba. Un tema que se llama distinto y
declara los mismos valores que el otro no es otro tema: es el mismo repintado, y
así lo lee quien lo mira.

Hay excepciones legítimas y van en la lista de abajo, cada una con su razón. La
lista es corta a propósito: si crece, es que el tema se está vaciando.
"""
import re
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "frontend" / "src" / "mobile-themes.css"

# Variables que PUEDEN valer lo mismo en los dos temas, y por qué.
COMPARTIDAS = {
    "--theme-pin": "el color del alfiler del mapa SIGNIFICA algo (hecho/toca/pendiente)",
    "--theme-pin-deep": "íd.",
    "--theme-pin-done": "íd.",
    "--theme-pin-todo": "íd.",
    "--theme-border-w": "el grosor del borde no distingue un tema de otro",
    # --theme-radius-pill salió de esta lista el 21/8: en un tema que corta
    # esquinas, una gragea perfecta canta. Fuego la tiene en 3px.
}


def _variables(selector: str) -> dict:
    texto = CSS.read_text(encoding="utf-8")
    inicio = texto.index(selector)
    cuerpo = texto[inicio : texto.index("}", inicio)]
    return {
        nombre: valor.strip()
        for nombre, valor in re.findall(r"(--theme-[a-z-]+):\s*([^;]+);", cuerpo)
    }


def test_o_lume_non_repite_os_valores_de_cristal():
    cristal = _variables("body.theme-glass {")
    lume = _variables("body.theme-flame-red {")

    iguales = sorted(
        nombre
        for nombre in set(cristal) & set(lume)
        if cristal[nombre] == lume[nombre] and nombre not in COMPARTIDAS
    )

    assert not iguales, (
        "estas variables valen lo mismo en fuego que en cristal, así que el tema "
        "no las está usando para nada:\n  "
        + "\n  ".join(iguales)
        + "\n\nO se les da un valor propio, o se añaden a COMPARTIDAS con su razón. "
        "Así empezó el fallo del corte: declarado, enganchado, y valiendo 0 igual "
        "que cristal."
    )


def test_a_lista_de_excepcions_non_medra_sen_querer():
    """Si la lista crece, el tema se está vaciando."""
    assert len(COMPARTIDAS) <= 8, (
        "demasiadas variables compartidas: cada una es una cosa que el tema ya "
        "no cambia"
    )


def test_as_excepcions_seguen_existindo():
    """Una excepción para una variable que ya no existe es ruido."""
    cristal = _variables("body.theme-glass {")
    sobran = sorted(n for n in COMPARTIDAS if n not in cristal)
    assert not sobran, f"excepciones para variables que ya no existen: {sobran}"

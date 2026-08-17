# -*- coding: utf-8 -*-
"""Cuánto tapan las barras: en fuego, del todo.

El tema de fuego se seguía viendo «glass» después de subir `--theme-glass` al
0.97, porque las barras de arriba y de abajo no usan esa variable: llevan su
propio degradado con la opacidad escrita en cada sitio.

    barra de arriba (PlayerShell)   .72 / .64
    tarjeta del HUD                 .46 / .34
    barra de abajo (PlayerLayout)   .52 / .42
    hojas y paneles                 .34 … .54

Se veía el mapa a través de todas. Y no son iguales entre sí a propósito, así
que igualarlas habría cambiado cristal, que es justo lo que no se puede tocar.

En vez de tocar veinte números, cada opacidad se multiplica por
`--theme-solid`: 1 en cristal -sale el mismo número exacto de antes- y 2.8 en
fuego, donde el navegador recorta en 1 lo que se pase.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
JUGADOR = RAIZ / "frontend" / "src" / "player"
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"

SUPERFICIES = ("--theme-sheen-a", "--theme-sheen-b", "--theme-shell-a", "--theme-shell-b")


def ficheros():
    for f in sorted(JUGADOR.rglob("*")):
        if f.suffix in (".tsx", ".ts", ".css"):
            yield f


def valor_en(bloque: str, variable: str) -> str:
    css = TEMAS.read_text(encoding="utf-8")
    inicio = css.index("body.%s {" % bloque)
    cuerpo = css[inicio : css.index("}", inicio)]
    return re.search(r"%s:\s*([^;]+);" % variable, cuerpo).group(1).strip()


def test_cristal_queda_igual_que_estaba():
    """Multiplicar por 1 tiene que dar el mismo número, no uno parecido."""
    assert valor_en("theme-glass", "--theme-solid") == "1"


def test_o_fume_tapa():
    solidez = float(valor_en("theme-flame-red", "--theme-solid"))

    # La superficie más transparente que hay es .34; con esto pasa de 0.95.
    assert 0.34 * solidez >= 0.9, (
        "con solidez %s la barra más floja se queda en %.2f y se sigue viendo "
        "el mapa a través" % (solidez, 0.34 * solidez)
    )


def test_todas_as_superficies_pasan_polo_multiplicador():
    """Una que se escape se queda transparente sólo ella, y canta."""
    sueltas = []

    for f in ficheros():
        codigo = f.read_text(encoding="utf-8")
        for var in SUPERFICIES:
            patron = r"rgba\(var\(%s\),\s*([0-9.]+)\s*\)" % re.escape(var)
            for m in re.finditer(patron, codigo):
                linea = codigo[: m.start()].count("\n") + 1
                sueltas.append("%s:%s  %s" % (f.relative_to(RAIZ), linea, m.group(0)))

    assert not sueltas, (
        "superficies con la opacidad suelta, sin multiplicar (%d):\n  %s"
        % (len(sueltas), "\n  ".join(sueltas[:10]))
    )


def test_o_multiplicador_non_toca_brillos_nin_bordes():
    """Ahí la transparencia es la gracia; opacarlos deja manchas.

    El multiplicador es sólo para lo que tapa. Un glow o un tinte al 100% deja
    de ser un brillo y pasa a ser un pegote.
    """
    culpables = []
    prohibidas = ("--theme-glow", "--theme-tint", "--theme-tint-strong", "--theme-wash")

    for f in ficheros():
        codigo = f.read_text(encoding="utf-8")
        for var in prohibidas:
            for m in re.finditer(r"var\(%s\)[^)]*--theme-solid" % re.escape(var), codigo):
                culpables.append("%s  %s" % (f.relative_to(RAIZ), var))

    assert not culpables, "el multiplicador se coló en un brillo: %s" % culpables

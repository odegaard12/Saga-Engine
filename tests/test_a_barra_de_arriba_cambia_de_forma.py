# -*- coding: utf-8 -*-
"""Lo que se VE tiene que cambiar de forma, no sólo lo que lleva una clase.

Encender `--theme-panel-cut` (4.9.17) cambió la forma de todo lo que lleva
`.saga-glass-panel` —los minijuegos, el panel de preparación, la de carga— pero
en la pantalla principal eso es **un solo elemento**. Medido en el navegador:

    barra superior          97 767 px²   redondeada a 28 px, sin corte
    Mochila/Herramientas    28 691 px²   sin corte
    fila de iconos          10 811 px²   sin corte

Es decir: el elemento más grande de la pantalla seguía siendo una píldora de
28 px, y por eso el tema seguía leyéndose igual.

Y el porqué es el mismo cero de siempre, en otra variable. `PlayerShell.tsx`
lee el radio así:

    borderRadius: `var(--theme-radius-shell, ${compact ? 22 : 28}px)`

...y **ningún tema declaraba `--theme-radius-shell`**. El arreglo de 4.9.4
enganchó la barra a una variable y nunca le dio valor, así que siempre ganaba
el respaldo de 28 px. El mecanismo puesto, el valor nunca.

Cristal la declara con esos mismos 28 px: no cambia ni un píxel, pero deja de
heredar un valor que nadie eligió para él.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"


def css() -> str:
    return TEMAS.read_text(encoding="utf-8")


def _bloque(selector: str) -> str:
    texto = css()
    inicio = texto.index(selector)
    return texto[inicio : texto.index("}", inicio)]


def test_o_lume_declara_o_radio_da_barra():
    bloque = _bloque("body.theme-flame-red {")
    hallado = re.search(r"--theme-radius-shell:\s*([^;]+);", bloque)
    assert hallado, (
        "el tema de fuego no declara --theme-radius-shell, así que la barra de "
        "arriba se queda en el respaldo de 28 px y sigue siendo una píldora"
    )
    numero = float(re.sub(r"[^0-9.]", "", hallado.group(1)) or 99)
    assert numero < 14, (
        f"--theme-radius-shell vale {hallado.group(1)}: sigue siendo tan redonda "
        "como cristal y el tema no se lee distinto"
    )


def test_o_cristal_declara_o_seu_28():
    """Cristal la declara con lo que ya se veía: no cambia ni un píxel.

    Mi primera versión de esta prueba pedía lo contrario —que cristal NO la
    declarase— y estaba mal: hay una prueba en el proyecto que exige que los dos
    temas declaren el mismo juego de variables, y tiene razón. Una variable en
    un tema y no en el otro es justo el fallo que se está arreglando: el que la
    hereda se lleva un valor que nadie eligió para él.
    """
    bloque = _bloque("body.theme-glass {")
    hallado = re.search(r"--theme-radius-shell:\s*([^;]+);", bloque)
    assert hallado, "cristal no la declara y hereda un valor que nadie eligió"
    assert "28" in hallado.group(1), "cristal cambiaría de forma, y no es lo que se pedía"


def test_o_corte_chega_ao_que_se_ve():
    """Las tres superficies grandes de la pantalla principal."""
    texto = css()
    for selector in ("[data-saga-player-shell='top']", ".saga-hud-quick", ".saga-hud-dock"):
        assert selector in texto, f"{selector} no aparece en el CSS del tema"

    inicio = texto.index("--theme-panel-cut")
    recorte = texto[texto.index("body.theme-flame-red [data-saga-player-shell='top']") :]
    bloque = recorte[: recorte.index("}")]
    assert "clip-path" in bloque, (
        "la barra de arriba y las dos de abajo no reciben el corte: son las tres "
        "superficies más grandes de la pantalla y sin ellas el tema no cambia"
    )
    assert "var(--theme-panel-cut)" in bloque, "el corte no sale del tema"

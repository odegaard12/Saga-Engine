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


def test_as_tres_superficies_xa_non_levan_recorte():
    """Superseded a propósito: ver 'AQUÍ ESTABA EL EMPATE...' en mobile-themes.css.

    Esta prueba pedía que la barra de arriba y las dos de abajo llevasen
    `clip-path` con `--theme-panel-cut`. Esa regla se quitó a propósito: las
    tres pasaron de placas recortadas a velos que se apagan, sin superficie
    grande que recortar. La forma del tema de fuego en la barra de arriba
    sigue viva -y probada- en `--theme-radius-shell` (ver el test de arriba).
    """
    texto = css()
    # data-saga-player-shell='top' ya no aparece en absoluto -ni para el
    # corte ni para nada más-. .saga-hud-quick/.saga-hud-dock sí siguen en el
    # CSS -llevan la regla del color de los iconos-, así que lo que importa
    # es que NINGUNA de sus reglas lleve --theme-panel-cut/clip-path, no que
    # el selector haya desaparecido del todo.
    assert "[data-saga-player-shell='top']" not in texto, (
        "data-saga-player-shell='top' ha vuelto a aparecer en el tema: si es "
        "para recortarlo otra vez, revisar antes por qué se quitó"
    )
    for selector in (".saga-hud-quick", ".saga-hud-dock"):
        for m in re.finditer(re.escape(selector) + r"[^{]*\{([^}]*)\}", texto):
            assert "clip-path" not in m.group(1) and "--theme-panel-cut" not in m.group(1), (
                f"{selector} vuelve a llevar el corte de placa que se quitó a propósito"
            )

# -*- coding: utf-8 -*-
"""Una variable declarada dos veces en el mismo bloque.

Apareció escribiendo esto mismo: `--theme-ring-a` y `--theme-ring-b` quedaron
declaradas dos veces dentro de `:root`. No da error, no se ve, y gana la
última —que es exactamente la trampa que ya costó cara con `.saga-glass-panel`
y con `.leaflet-container`—. La diferencia es que allí eran reglas repetidas y
aquí son variables, y la prueba que vigila los selectores repetidos no las mira.

El día que las dos copias digan cosas distintas, el color que salga dependerá
del orden en que estén escritas.

Y de paso: todos los temas tienen que declarar el mismo juego de variables. Una
que falte en uno cae al valor de `:root`, que es el del tema por defecto, así
que un tema rojo hereda un tono azul sin que nadie lo note.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"


def bloques() -> dict:
    """Cada bloque de declaraciones, por su selector."""
    css = TEMAS.read_text(encoding="utf-8")
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)

    fuera = {}
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        selector = " ".join(m.group(1).split())
        # Sólo los que DECLARAN. Un bloque que use `var(--theme-panel-cut)` no
        # declara nada, y contarlo mete reglas normales entre los temas.
        if not re.search(r"--theme-[a-z0-9-]+\s*:", m.group(2)):
            continue
        fuera[selector] = m.group(2)
    return fuera


TEMA = re.compile(r"^html\.(theme-[a-z-]+), body\.\1$")


def test_ningunha_variable_declarada_dúas_veces():
    culpables = []

    for selector, cuerpo in bloques().items():
        vistas = {}
        for m in re.finditer(r"(--theme-[a-z0-9-]+):\s*([^;]+);", cuerpo):
            nombre, valor = m.group(1), m.group(2).strip()
            if nombre in vistas:
                culpables.append(
                    "%s → %s dos veces (%s y %s)"
                    % (selector[:40], nombre, vistas[nombre], valor)
                )
            vistas[nombre] = valor

    assert not culpables, "variables repetidas:\n  " + "\n  ".join(culpables)


def test_os_temas_declaran_o_mesmo_xogo():
    temas = {s: c for s, c in bloques().items() if TEMA.match(s)}

    assert len(temas) == 2, "se esperaban dos temas, hay %d" % len(temas)

    juegos = {
        s: set(re.findall(r"(--theme-[a-z0-9-]+):", c)) for s, c in temas.items()
    }
    nombres = list(juegos)
    faltan_en_uno = juegos[nombres[0]] ^ juegos[nombres[1]]

    assert not faltan_en_uno, (
        "estas variables están en un tema y no en el otro, así que ese hereda "
        "el valor por defecto —el del tema azul—: %s" % sorted(faltan_en_uno)
    )

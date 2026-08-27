# -*- coding: utf-8 -*-
"""circuitMatrix era el segundo peor caso de docs/plan-de-mejora.md, 4.2: 910
líneas, 16 formas en línea y sólo 30 usos del tema (casi todos de color, no de
forma). Cambiar de tema no le movía ni un píxel a nada.

El fichero tiene una complicación de más: varios selectores
(`.circuit-shell`, `.circuit-board-wrap`, `.circuit-cell`, `.circuit-button`)
están declarados DOS veces en el mismo bloque de estilos -una simplificación
de diseño añadida al final sin limpiar la versión original-, y la segunda
declaración siempre gana. Verificado con `getComputedStyle` en un arnés real
antes de dar esto por bueno: hoy se pintan los valores de la SEGUNDA
declaración. Por eso esta prueba exige la variable del tema en las DOS, no
sólo en la que "se ve": tocar sólo una habría sido un cambio sin efecto.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUNTIME = (
    RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "circuitMatrix" / "RuntimeScreen.tsx"
)

SELECTORES_CARD_O_PANEL = (
    ".circuit-mini-stat {",
    ".circuit-status {",
    ".circuit-rule {",
)

SELECTORES_PILDORA = (
    ".circuit-chip {",
    ".circuit-bar {",
    ".circuit-final-icon {",
)

# Declarados dos veces en el mismo fichero; las dos tienen que llevar la
# variable, porque la segunda es la que gana en cascada.
SELECTORES_DUPLICADOS_PANEL = (".circuit-shell {", ".circuit-board-wrap {")
SELECTORES_DUPLICADOS_CARD = (".circuit-cell {", ".circuit-button {")


def styles() -> str:
    return RUNTIME.read_text(encoding="utf-8")


def bloques(selector: str) -> list[str]:
    """Los bloques de un selector EXACTO, no de uno que lo lleve como sufijo.

    `.circuit-final-icon {` no puede devolver también
    `.circuit-final.success .circuit-final-icon {`: son reglas distintas.
    """
    texto = styles()
    patron = re.compile(r"(?:^|\n)" + re.escape(selector))
    resultado = []
    for m in patron.finditer(texto):
        inicio = m.start() + (1 if texto[m.start()] == "\n" else 0)
        resultado.append(texto[inicio : texto.index("}", inicio)])
    return resultado


def test_as_formas_de_tarxeta_seguen_a_variable_do_tema():
    for selector in SELECTORES_CARD_O_PANEL:
        bs = bloques(selector)
        assert bs, f"no se encontró {selector}"
        assert any(re.search(r"border-radius:\s*var\(--theme-radius-(panel|card)", b) for b in bs), (
            f"{selector} sigue con una forma clavada en píxeles"
        )


def test_as_pildoras_seguen_a_variable_do_tema():
    for selector in SELECTORES_PILDORA:
        bs = bloques(selector)
        assert bs, f"no se encontró {selector}"
        assert any(re.search(r"border-radius:\s*var\(--theme-radius-pill", b) for b in bs), (
            f"{selector} dejó de usar --theme-radius-pill"
        )


def test_os_selectores_duplicados_levan_a_variable_nas_dous_sitios():
    """Tocar sólo la primera declaración no cambiaría nada: la segunda gana."""
    for selector in SELECTORES_DUPLICADOS_PANEL:
        for b in bloques(selector):
            assert re.search(r"border-radius:\s*var\(--theme-radius-panel", b), (
                f"una de las dos declaraciones de {selector} sigue en píxeles fijos"
            )
        assert len(bloques(selector)) == 2, (
            f"{selector} ya no está duplicado; revisa si esta prueba sigue haciendo falta"
        )

    for selector in SELECTORES_DUPLICADOS_CARD:
        for b in bloques(selector):
            assert re.search(r"border-radius:\s*var\(--theme-radius-card", b), (
                f"una de las dos declaraciones de {selector} sigue en píxeles fijos"
            )
        assert len(bloques(selector)) == 2, (
            f"{selector} ya no está duplicado; revisa si esta prueba sigue haciendo falta"
        )

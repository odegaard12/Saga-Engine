# -*- coding: utf-8 -*-
"""circuitMatrix era el segundo peor caso de docs/plan-de-mejora.md, 4.2: 910
líneas, 16 formas en línea y sólo 30 usos del tema (casi todos de color, no de
forma). Cambiar de tema no le movía ni un píxel a nada.

**4.9.33** puso las formas a seguir al tema, pero el fichero tenía una
complicación de más: varios selectores (`.circuit-shell`, `.circuit-cell`,
`.circuit-button`, `.circuit-board-wrap`, y de hecho casi todo el bloque de
estilos) estaban declarados DOS veces -una simplificación de diseño añadida
al final del fichero sin limpiar la versión original-, con la segunda
ganando siempre por cascada. Auditado el JSX entero: la primera mitad del
fichero (topbar, chip, título, mini-estadística, medidor, reglas) no la
renderiza NADA -0 apariciones en el componente-, así que no era sólo una
declaración muerta por selector: era media hoja de estilos entera, muerta.

**Aquí, en la limpieza:** las ~10 reglas nunca alcanzables se borran, y los
~13 selectores que sí se usan y estaban duplicados se fusionan en una sola
declaración cada uno -quedándose con lo que ya se pintaba-. Verificado con
`getComputedStyle` en un arnés real antes y después: los valores no cambian,
sólo desaparece el texto muerto.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUNTIME = (
    RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "circuitMatrix" / "RuntimeScreen.tsx"
)

SELECTORES_CARD_O_PANEL = (
    ".circuit-shell {",
    ".circuit-status {",
    ".circuit-board-wrap {",
    ".circuit-cell {",
    ".circuit-button {",
    ".circuit-final {",
)

SELECTORES_PILDORA = (".circuit-final-icon {",)

# Clases que el JSX del componente no aplica a ningún elemento -auditado con
# grep sobre las líneas de `className` del propio fichero-. Si alguna de
# estas vuelve a aparecer en STYLES sin que el JSX la use, es la misma trampa
# de antes: media hoja de estilos que nadie ve.
CLASES_MUERTAS = (
    "circuit-topbar",
    "circuit-chip",
    "circuit-title-row",
    "circuit-overline",
    "circuit-title",
    "circuit-brief",
    "circuit-mini-stat",
    "circuit-meter",
    "circuit-bar",
    "circuit-fill",
    "circuit-rules",
    "circuit-rule",
)


def styles() -> str:
    return RUNTIME.read_text(encoding="utf-8")


def jsx() -> str:
    texto = styles()
    inicio = texto.index("export function CircuitMatrixRuntimeScreen")
    return texto[inicio:]


def bloque(selector: str) -> str:
    """El bloque de un selector EXACTO (al principio de línea), no de uno que
    lo lleve como sufijo -`.circuit-final.success .circuit-final-icon {` no
    puede colar como si fuera `.circuit-final-icon {`-."""
    texto = styles()
    patron = re.compile(r"(?:^|\n)" + re.escape(selector))
    coincidencias = list(patron.finditer(texto))

    if len(coincidencias) > 1:
        raise AssertionError(f"{selector} sigue apareciendo más de una vez: la fusión no se completó")
    if not coincidencias:
        raise AssertionError(f"no se encontró {selector}")

    m = coincidencias[0]
    inicio = m.start() + (1 if texto[m.start()] == "\n" else 0)
    return texto[inicio : texto.index("}", inicio)]


def test_as_formas_de_tarxeta_ou_panel_seguen_a_variable_do_tema():
    for selector in SELECTORES_CARD_O_PANEL:
        b = bloque(selector)
        assert re.search(r"border-radius:\s*var\(--theme-radius-(panel|card)", b), (
            f"{selector} sigue con una forma clavada en píxeles"
        )


def test_as_pildoras_seguen_a_variable_do_tema():
    for selector in SELECTORES_PILDORA:
        b = bloque(selector)
        assert re.search(r"border-radius:\s*var\(--theme-radius-pill", b), (
            f"{selector} dejó de usar --theme-radius-pill"
        )


def test_non_queda_ningunha_clase_morta_no_bloque_de_estilos():
    """El fallo de origen: media hoja de estilos que ningún elemento usaba."""
    codigo = jsx()
    hoja = styles()

    for clase in CLASES_MUERTAS:
        assert f'"{clase}' not in codigo and f"'{clase}" not in codigo, (
            f"{clase} aparece en el JSX; si ya se usa, sácala de CLASES_MUERTAS "
            "y devuélvele su regla en STYLES"
        )
        assert f".{clase} {{" not in hoja and f".{clase}." not in hoja, (
            f".{clase} sigue en STYLES sin que ningún elemento la use"
        )


def test_o_bloque_de_display_none_desaparece_con_as_clases_que_ocultaba():
    assert "display: none !important" not in styles(), (
        "ese display:none ocultaba clases que ya no existen; si vuelve, "
        "revisa que no esté ocultando algo que sí se usa"
    )

# -*- coding: utf-8 -*-
"""`StoryModal.tsx` (el Prólogo y los demás textos de historia) sigue al tema.

Superseded a propósito -ver el comentario en mobile-themes.css, «La regla de
`.saga-story-panel` se fue con el prólogo»-: aquella versión llevaba la forma
en línea con las variables de brasa DE CRISTAL (`--theme-sheen-*`) copiadas a
mano, y hacía falta una regla `!important` en el tema de fuego para ganarle.
Ahora el panel es una tarjeta sólida del diseño «B» -las mismas
`var(--theme-card)` / `var(--theme-card-shadow)` que la barra superior y las
hojas-, así que sigue al tema sin ninguna regla aparte ni `!important`: cambiar
de tema ya cambia estas variables en un solo sitio.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
STORY_MODAL = RAIZ / "frontend" / "src" / "player" / "components" / "StoryModal.tsx"


def componente() -> str:
    return STORY_MODAL.read_text(encoding="utf-8")


def test_o_panel_usa_a_tarxeta_do_deseno_b():
    codigo = componente()
    assert "var(--theme-card)" in codigo, (
        "el panel del prólogo dejó de leer el color de la tarjeta del tema"
    )
    assert "var(--theme-card-shadow)" in codigo, (
        "el panel del prólogo dejó de leer la sombra de la tarjeta del tema"
    )


def test_non_volveu_a_forma_en_liña_vella():
    """Si esto reaparece, ha vuelto la copia a mano de cristal que hacía
    falta parchear con !important en fuego -el fallo que se arregló-."""
    codigo = componente()
    assert "rgba(var(--theme-sheen-a)" not in codigo, (
        "ha vuelto el degradado de cristal copiado a mano en el prólogo"
    )

# -*- coding: utf-8 -*-
"""El tirador visual de las hojas (Mochila, Herramientas, Ranking) era una
píldora blanca fija (`rgba(255,255,255,.25)`) que no seguía al tema y se
veía mal sobre la brasa del tema de fuego. Pedido explícito: quitarlo.

Se quita el DIBUJO, no la zona de arrastre: `dragHandleWrapper` sigue ahí con
sus manejadores de touch, así que deslizar para cerrar sigue funcionando
igual.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SHEET = RAIZ / "frontend" / "src" / "player" / "components" / "SwipeableSheet.tsx"


def codigo() -> str:
    return SHEET.read_text(encoding="utf-8")


def test_non_queda_ningun_tirador_debuxado():
    assert "const dragHandle:" not in codigo(), (
        "volvió el tirador visual fijo; si se quiere de vuelta, que siga al tema"
    )
    assert "rgba(255,255,255,.25)" not in codigo(), "sigue el color fijo del tirador viejo"


def test_a_zona_de_arrastre_quitouse_a_propósito():
    """Superseded: arrastrar para cerrar se quitó del todo, no solo el dibujo.

    Ver el comentario en SwipeableSheet.tsx: "al mover la hoja con el dedo
    quedaba mal -se despegaba a medias y volvia de golpe- y ya no aportaba
    nada, porque el boton de cerrar vuelve a verse". Ahora se cierra con la
    X o tocando fuera; no hay `onTouchStart`/`onTouchMove`/`onTouchEnd` que
    proteger.
    """
    codigo_ = codigo()
    assert "onTouchStart" not in codigo_, (
        "ha vuelto el arrastre táctil: si es a propósito, revisar antes por "
        "qué se quitó"
    )

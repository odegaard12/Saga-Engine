# -*- coding: utf-8 -*-
"""La pantalla de carga es lo primero que se ve, y es lo último que se tiñó.

Es la que sale con «Primera vez: se guarda el mapa. Tarda unos minutos», o sea
la que un jugador mira más rato el día que estrena la aplicación en el monte. Y
llevaba su propia paleta escrita a mano:

    fondo   radial azul cielo rgba(56,189,248,.16)
            radial verde      rgba(74,222,128,.12)
            base              #030b1a -> #020617
    barra   linear-gradient(90deg, #22c55e, #38bdf8)
    brillo  rgba(56,189,248,.55)

Azul y verde, dijera lo que dijera el tema. Ahora sale del tema, y como la
página ya llega del servidor con la clase puesta, se ve del color correcto
desde el primer píxel.

Y el `<html>`: la clase va en el `<body>`, así que el elemento de más afuera se
quedaba con el color por defecto. No se ve casi nunca porque el `body` lo tapa,
pero asoma al rebotar el desplazamiento en un móvil.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARGA = RAIZ / "frontend" / "src" / "player" / "components" / "SplashScreen.tsx"
CONSTRUCCION = RAIZ / "backend" / "app" / "build_frontend.py"

VIEJA_PALETA = ("56,189,248", "74,222,128", "#22c55e", "#38bdf8", "#030b1a", "#020617")


def codigo() -> str:
    texto = CARGA.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_a_carga_non_ten_paleta_propia():
    c = codigo()
    restos = [v for v in VIEJA_PALETA if v in c]

    assert not restos, f"la pantalla de carga sigue con colores propios: {restos}"


def test_a_carga_le_o_tema():
    c = codigo()

    assert "var(--theme-bg)" in c, "el fondo tiene que salir del tema"
    assert "var(--theme-primary)" in c, "la barra tiene que salir del tema"


def test_o_html_tamen_leva_a_clase():
    """El body lo tapa, pero asoma al rebotar el desplazamiento en un móvil."""
    codigo_py = CONSTRUCCION.read_text(encoding="utf-8")

    assert "<html" in codigo_py, (
        "la clase del tema tiene que ir también en el html, no sólo en el body"
    )

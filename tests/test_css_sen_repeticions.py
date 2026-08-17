# -*- coding: utf-8 -*-
"""Ninguna hoja de estilos declara dos veces lo mismo.

Dos reglas con el mismo selector no dan ningún error: gana la última. Por eso se
cuelan, y por eso son caras — se edita una, no cambia nada, y no hay aviso.

Aquí ya costó dos veces:

- `.saga-glass-panel` estaba dos veces en la carcasa. La segunda pisaba a la
  primera con un degradado gris y seis `!important`, así que el tema no llegaba
  a los paneles del jugador ni de los minijuegos.
- `.saga-build-info--floating` estaba **seis** veces en su hoja, cuatro de ellas
  para esconderla. Los comentarios las numeran: `#235b`, `#235c`, `#235d`,
  `#235e`. `#235c` es copia exacta de `#235b` y `#235e` de `#235d`, y la de
  900 px se traga entera a la de 760 px. Cuatro intentos de tapar lo mismo,
  porque desde fuera no se ve si el anterior funcionó.

Y el fondo de la página estaba escrito a mano en tres sitios de la carcasa
mientras el tema intentaba pintarlo desde otro. Ahora sale de una variable.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

# El CSS del panel de administración queda fuera: son 4 423 líneas con
# `!important` y arreglarlo es otra conversación entera.
HOJAS = (
    FRONT / "styles" / "mobile-shell.css",
    FRONT / "mobile-themes.css",
    FRONT / "player" / "components" / "map-surface.css",
    FRONT / "shared" / "build-info-badge.css",
)


def sin_comentarios(fichero: Path) -> str:
    return re.sub(r"/\*.*?\*/", "", fichero.read_text(encoding="utf-8"), flags=re.DOTALL)


def reglas_de(fichero: Path) -> dict[str, list[str]]:
    """Selector -> cuerpos, contando también los de dentro de un @media."""
    texto = sin_comentarios(fichero)
    salida: dict[str, list[str]] = {}

    for m in re.finditer(r"([^{}@]+)\{([^{}]*)\}", texto):
        sel = " ".join(m.group(1).split())
        if not sel or sel.startswith("@"):
            continue
        salida.setdefault(sel, []).append(" ".join(m.group(2).split()))

    return salida


def test_ningun_selector_se_repite_co_mesmo_corpo():
    """Repetir el mismo cuerpo es siempre ruido: la segunda no hace nada."""
    culpables = []

    for hoja in HOJAS:
        for sel, cuerpos in reglas_de(hoja).items():
            repetidos = [c for c in set(cuerpos) if cuerpos.count(c) > 1]
            for cuerpo in repetidos:
                culpables.append(f"{hoja.name}: {sel} x{cuerpos.count(cuerpo)} identicas")

    assert not culpables, "reglas repetidas palabra por palabra:\n" + "\n".join(culpables)


def test_o_fondo_da_paxina_sae_dunha_variable():
    """Estaba escrito a mano mientras el tema intentaba pintarlo desde otro sitio."""
    codigo = sin_comentarios(FRONT / "styles" / "mobile-shell.css")

    assert "#020617" not in codigo, (
        "el fondo va en la variable --theme-bg, no escrito a mano en la carcasa"
    )


def test_o_distintivo_de_version_escondese_unha_soa_vez():
    reglas = reglas_de(FRONT / "shared" / "build-info-badge.css")
    escondidas = [
        c for c in reglas.get(".saga-build-info--floating", []) if "display: none" in c
    ]

    assert len(escondidas) <= 1, (
        f"se esconde {len(escondidas)} veces; con una basta y las demás confunden"
    )

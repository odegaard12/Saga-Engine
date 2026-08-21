# -*- coding: utf-8 -*-
"""Los alfileres del mapa y los puntos de la barra siguen al tema.

4.9.4 decía que los alfileres «dejan de ser pelotas y pasan a ser chapas». No
era verdad en el código que se sirve: `.saga-mission-node-pin` llevaba
`border-radius: 999px` **clavado**, la insignia de tipo un `50%` clavado, y los
puntos de la barra usaban `--theme-radius-pill`, que vale 999px **en los dos
temas**. Tres formas redondas que ningún tema podía cambiar.

Es el mismo patrón que ya apareció dos veces esta semana: el diseño declarado
en el changelog y el valor sin poner o el número escrito a mano.

Lo que NO se toca, y es a propósito: la posición del propio jugador
(`.saga-player-marker`) y su aura. Un marcador de posición redondo es lo
convencional, y el aura es un degradado radial: cuadrarla se vería mal.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
TEMAS = FRONT / "mobile-themes.css"
MAPA = FRONT / "player" / "components" / "MapSurface.tsx"
SHELL = FRONT / "player" / "components" / "PlayerShell.tsx"

VARIABLE = "--theme-radius-dot"


def _bloque(selector: str) -> str:
    texto = TEMAS.read_text(encoding="utf-8")
    inicio = texto.index(selector)
    return texto[inicio : texto.index("}", inicio)]


def _valor(selector: str) -> str:
    hallado = re.search(rf"{VARIABLE}:\s*([^;]+);", _bloque(selector))
    return hallado.group(1).strip() if hallado else ""


def test_os_dous_temas_declaran_a_forma_do_punto():
    """Declarada en los dos: si falta en uno, hereda lo que nadie eligió."""
    assert _valor("body.theme-glass {"), "cristal no la declara"
    assert _valor("body.theme-flame-red {"), "fuego no la declara"


def test_o_cristal_segue_redondo():
    assert "999" in _valor("body.theme-glass {"), "cristal ha dejado de ser redondo"


def test_o_lume_fai_chapas():
    valor = _valor("body.theme-flame-red {")
    numero = float(re.sub(r"[^0-9.]", "", valor) or 999)
    assert numero < 12, (
        f"en fuego los alfileres valen {valor}: siguen siendo pelotas, y el "
        "diseño de 4.9.4 pedía chapas"
    )


def test_o_alfinete_do_mapa_sae_do_tema():
    mapa = MAPA.read_text(encoding="utf-8")
    pin = re.search(r"\.saga-mission-node-pin \{[^}]*\}", mapa)
    assert pin, "no encuentro el alfiler del nodo"
    assert VARIABLE in pin.group(0), (
        "el alfiler del mapa sigue con el radio escrito a mano: ningún tema "
        "puede cambiarle la forma"
    )


def test_o_punto_da_barra_sae_do_tema():
    shell = SHELL.read_text(encoding="utf-8")
    nodo = re.search(r"const routeNode: CSSProperties = \{[^}]*\}", shell)
    assert nodo, "no encuentro el punto de la barra"
    assert VARIABLE in nodo.group(0), "el punto de la barra no sigue al tema"


def test_a_posicion_do_xogador_segue_redonda():
    """A propósito: un marcador de posición redondo es lo convencional."""
    css = (FRONT / "player" / "components" / "map-surface.css").read_text(encoding="utf-8")
    marcador = re.search(r"\.saga-player-marker \{[^}]*\}", css)
    assert marcador and "50%" in marcador.group(0), (
        "se ha cuadrado la posición del jugador, que no era lo que se pedía"
    )

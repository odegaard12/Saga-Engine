# -*- coding: utf-8 -*-
"""El store del jugador no puede guardar lo que ya guarda otro.

`usePlayerStore` (zustand) declaraba la partida entera —`status`, `payload`,
`config`, `errorMessage`— además del GPS y de qué paneles están abiertos. Pero
la partida de verdad es el `useState<LoadState>` de `PlayerApp`, y medido:

    status        0 lecturas, 0 escrituras
    payload       0 lecturas
    config        0 lecturas
    errorMessage  0 lecturas, 0 escrituras

`setGamePayload` no lo llamaba nadie, así que esos campos se quedaban en sus
valores iniciales para siempre. Dos verdades sobre lo mismo, y la de zustand
vacía.

Ya mordió una vez, y está escrito en `CraftingPanel.tsx`: la mesa de trabajo
leía `usePlayerStore.getState().payload`, encontraba `null`, y decía "No hay
recetas" a un jugador que llevaba los ingredientes encima.

El GPS y los paneles SÍ viven ahí y se quedan: eso lo lee y lo escribe medio
jugador.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

STORE = FRONT / "player" / "store" / "usePlayerStore.ts"
MESA = FRONT / "player" / "components" / "CraftingPanel.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


# Lo que NO puede volver: es la partida, y la partida la lleva PlayerApp.
MUERTOS = ("payload", "config", "errorMessage", "setGamePayload", "setStatus", "updateGps")

# Lo que sí vive ahí y tiene que seguir.
VIVOS = (
    "gpsPosition",
    "gpsStatus",
    "gpsAccuracy",
    "gpsFresh",
    "gpsCapturedAt",
    "toolsOpen",
    # `teamOpen` se fue con la hoja de jugadores: queda la clasificación.
    "rankingOpen",
    "offlinePrepVisible",
)


def test_o_store_non_garda_a_partida():
    codigo = sin_comentarios(STORE)

    sobran = [nombre for nombre in MUERTOS if re.search(rf"\b{nombre}\b", codigo)]
    assert not sobran, (
        f"el store vuelve a guardar la partida: {sobran}. La partida es el "
        "useState de PlayerApp; tener dos acaba en una vacía."
    )


def test_o_gps_e_os_paneles_seguen_no_store():
    """Estos sí los lee medio jugador: quitarlos rompería de verdad."""
    codigo = sin_comentarios(STORE)

    for nombre in VIVOS:
        assert re.search(rf"\b{nombre}\b", codigo), f"falta {nombre} en el store"


def test_ninguen_le_a_partida_do_store():
    """Leer de ahí devuelve null siempre, y parece un dato."""
    culpables = []

    for fichero in FRONT.rglob("*"):
        if fichero.suffix not in (".ts", ".tsx") or not fichero.is_file():
            continue
        codigo = sin_comentarios(fichero)
        if re.search(r"usePlayerStore\.getState\(\)\.(payload|config|status)", codigo):
            culpables.append(fichero.relative_to(RAIZ).as_posix())

    assert not culpables, f"leen la partida del store, que está vacía: {culpables}"


def test_a_mesa_de_traballo_non_ten_respaldo_baleiro():
    """`?? usePlayerStore...payload?.stages ?? []` era siempre `[]`.

    Un respaldo que nunca puede traer nada no es un respaldo: es ruido que
    hace pensar que hay una segunda vía.
    """
    codigo = sin_comentarios(MESA)

    assert "usePlayerStore.getState().payload" not in codigo

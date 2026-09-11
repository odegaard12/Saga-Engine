# -*- coding: utf-8 -*-
"""Del sistema de jugadores queda la clasificación, y nada más.

Había dos hojas que enseñaban lo mismo con distinta cara:

- `TeamSheet` (165 líneas): presencia y estado de GPS de cada jugador. Existía
  para saber quién está conectado y dónde.
- `RankingSheet` (377 líneas): nivel, tiempo total y quién ha terminado.

La segunda es el juego; la primera era vigilancia con otro nombre. Y encajaba
mal con lo que se acaba de arreglar: guardar la posición de gente que ya no
está jugando.

Comprobado antes de quitarla, contra la misión real: la clasificación cuadra
sola. Los 14 jugadores, y en los 14 el total de la tabla es exactamente la suma
de los tiempos por nodo más las penalizaciones. Cero descuadres, cero nodos
fuera de rango. Lo que se queda es lo que funciona.

El latido sigue trayendo la tabla del grupo, porque es de ahí de donde sale la
clasificación.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
JUGADOR = FRONT / "player" / "PlayerApp.tsx"
TIENDA = FRONT / "player" / "store" / "usePlayerStore.ts"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_a_folla_de_xogadores_xa_non_existe():
    assert not (FRONT / "player" / "components" / "TeamSheet.tsx").exists(), (
        "TeamSheet.tsx tiene que desaparecer, no quedarse sin usar"
    )


def test_ninguen_a_importa():
    culpables = []

    for fichero in FRONT.rglob("*"):
        if fichero.suffix not in (".ts", ".tsx") or not fichero.is_file():
            continue
        if "TeamSheet" in sin_comentarios(fichero):
            culpables.append(fichero.relative_to(RAIZ).as_posix())

    assert not culpables, f"siguen nombrando TeamSheet: {culpables}"


def test_non_queda_o_boton_nin_o_seu_estado():
    codigo = sin_comentarios(JUGADOR)

    for resto in ("openTeam", "closeTeam", "teamOpen"):
        assert resto not in codigo, f"queda {resto} en PlayerApp"

    tienda = sin_comentarios(TIENDA)
    for resto in ("teamOpen", "setTeamOpen"):
        assert resto not in tienda, f"queda {resto} en el store"


def test_a_clasificacion_segue_ai():
    codigo = sin_comentarios(JUGADOR)

    assert "RankingSheet" in codigo, "la clasificación se queda"
    assert "rankingPlayers" in codigo


def test_o_latido_segue_traendo_a_taboa():
    """Es de donde sale la clasificación: sin esto queda vacía."""
    codigo = sin_comentarios(JUGADOR)

    assert "equipo: true" in codigo
    assert "teamOtherProfiles" in codigo

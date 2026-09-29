"""Registro único de minijuegos (lado servidor).

Lee ``shared/game_registry.json`` en la raíz del repo: la MISMA fuente que usa
el frontend (``frontend/src/shared/gameRegistry.ts``). Antes cada dato por
juego -familia de presentación, tipos soportados, alias de tipo, suelo del
antitrampas...- vivía en una lista escrita a mano en un fichero distinto, y el
servidor y el admin llegaron a discrepar sobre la familia de un mismo juego.

Este módulo es sólo DATOS y no importa nada del resto de la app, para que
cualquier módulo (``minigames``, ``core_engine``, ``anti_cheat``, ``admin``)
pueda importarlo sin ciclos. La lógica de cada juego (normalizador,
proyección por jugador) sigue en su sitio: ver
``docs/como-anadir-un-minijuego.md``.

En la imagen Docker el fichero viaja en ``/app/shared`` (ver Dockerfile).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

#: Raíz del repo (o de /app en la imagen): backend/app/runtime/ -> 3 niveles.
REGISTRY_PATH = Path(__file__).resolve().parents[3] / "shared" / "game_registry.json"


def _load() -> Dict[str, Any]:
    # Sin registro no hay minijuegos: mejor caer en el arranque y con un
    # mensaje claro que servir una misión con los juegos a medias.
    try:
        with REGISTRY_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except OSError as exc:  # pragma: no cover - sólo con una imagen mal montada
        raise RuntimeError(f"No se pudo leer el registro de minijuegos {REGISTRY_PATH}: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("games"), list):
        raise RuntimeError(f"{REGISTRY_PATH} no tiene la forma esperada (falta 'games').")
    return data


REGISTRY: Dict[str, Any] = _load()

#: Todos los juegos, en el orden del registro (incluye los legacy sin ficha).
GAMES: List[Dict[str, Any]] = REGISTRY["games"]
GAMES_BY_ID: Dict[str, Dict[str, Any]] = {game["id"]: game for game in GAMES}

#: Familias TÉCNICAS (signal_hunt, circuit_matrix...), en el orden del registro.
FAMILIES: List[Dict[str, Any]] = REGISTRY["families"]
FAMILY_IDS = [family["id"] for family in FAMILIES]

#: Familias de PRESENTACIÓN del admin: [{"id", "label"}], como las espera el panel.
DISPLAY_FAMILIES: List[Dict[str, str]] = [
    {"id": family["id"], "label": family["label"]} for family in REGISTRY["display_families"]
]

#: game_id -> familia de presentación.
GAME_ID_DISPLAY_FAMILY: Dict[str, str] = {game["id"]: game["display_family"] for game in GAMES}

#: Nodo viejo sin game_id: se agrupa por su familia técnica.
TYPE_DISPLAY_FAMILY_FALLBACK: Dict[str, str] = {
    **{family["id"]: family["display_fallback"] for family in FAMILIES},
    **REGISTRY.get("legacy_type_display_fallback", {}),
}

#: Tipos de minijuego que acepta ``normalize_minigame_config``.
SUPPORTED_MINIGAME_TYPES = set(REGISTRY["supported_types"])

#: Etiqueta por familia técnica (``MINIGAME_SPECS`` de minigames.py).
MINIGAME_SPECS: Dict[str, Dict[str, str]] = {
    family["id"]: {"label": family["spec_label"]} for family in FAMILIES
}

#: Tipos viejos que ``normalize_stage`` reescribe a una familia técnica
#: (+ el game_id que se les fija si el nodo no trae uno).
TYPE_ALIASES: Dict[str, Dict[str, str]] = REGISTRY.get("type_aliases", {})


def hard_floor_by_game() -> Dict[str, Any]:
    """game_id -> estrategia de suelo del antitrampas declarada en el registro."""
    return {game["id"]: game["hard_floor"] for game in GAMES if game.get("hard_floor") is not None}

"""Game state storage adapter.

JSON remains the default backend.

When SAGA_STORAGE_BACKEND=sqlite, player progress operations use the SQLite
foundation. This lets SAGA migrate gamestate.json progressively without
changing route code.
"""

from __future__ import annotations

import os

from backend.app.storage.game_state import (
    advance_player_level as advance_json_player_level,
    get_player_level as get_json_player_level,
    load_game_state as load_json_game_state,
    reset_player_level as reset_json_player_level,
    save_game_state as save_json_game_state,
    set_player_level as set_json_player_level,
)
from backend.app.storage.sqlite_store import (
    advance_sqlite_player_level,
    get_sqlite_player_level,
    load_sqlite_game_state,
    reset_sqlite_player_level,
    resolve_sqlite_path,
    save_sqlite_game_state,
    set_sqlite_player_level,
)


VALID_GAME_STATE_BACKENDS = {"json", "sqlite"}


def resolve_game_state_backend() -> str:
    backend = str(os.getenv("SAGA_STORAGE_BACKEND") or "json").strip().lower()
    return backend if backend in VALID_GAME_STATE_BACKENDS else "json"


def resolve_game_state_db_path(json_game_state_path: str) -> str:
    if resolve_game_state_backend() != "sqlite":
        return json_game_state_path

    explicit = str(os.getenv("SAGA_SQLITE_DB") or "").strip()
    if explicit:
        return explicit

    data_dir = os.path.dirname(os.path.abspath(json_game_state_path)) or "."
    return resolve_sqlite_path(data_dir)


def load_game_state(path: str) -> dict[str, int]:
    if resolve_game_state_backend() == "sqlite":
        return load_sqlite_game_state(resolve_game_state_db_path(path))

    return load_json_game_state(path)


def save_game_state(path: str, state: dict[str, int]) -> dict[str, int]:
    if resolve_game_state_backend() == "sqlite":
        return save_sqlite_game_state(resolve_game_state_db_path(path), state)

    return save_json_game_state(path, state)


def get_player_level(path: str, user: str, default: int = 0) -> int:
    if resolve_game_state_backend() == "sqlite":
        return get_sqlite_player_level(resolve_game_state_db_path(path), user, default=default)

    return get_json_player_level(path, user, default=default)


def set_player_level(path: str, user: str, level: int) -> dict[str, int]:
    if resolve_game_state_backend() == "sqlite":
        set_sqlite_player_level(resolve_game_state_db_path(path), user, level)
        return load_game_state(path)

    return set_json_player_level(path, user, level)


def reset_player_level(path: str, user: str) -> dict[str, int]:
    if resolve_game_state_backend() == "sqlite":
        return reset_sqlite_player_level(resolve_game_state_db_path(path), user)

    return reset_json_player_level(path, user)


def advance_player_level(path: str, user: str, step: int = 1) -> dict[str, int]:
    if resolve_game_state_backend() == "sqlite":
        return advance_sqlite_player_level(resolve_game_state_db_path(path), user, step=step)

    return advance_json_player_level(path, user, step=step)

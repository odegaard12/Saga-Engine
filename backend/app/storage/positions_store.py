"""Live positions storage adapter.

JSON remains the default backend. When SAGA_STORAGE_BACKEND=sqlite, live
presence operations use the SQLite foundation. This lets SAGA migrate
positions.json progressively without changing route code.
"""

from __future__ import annotations

import os
from typing import Any

from backend.app.storage.positions import (
    load_live_positions_state as load_json_live_positions_state,
    remove_live_position as remove_json_live_position,
    save_live_positions_state as save_json_live_positions_state,
    upsert_live_position as upsert_json_live_position,
)
from backend.app.storage.sqlite_store import (
    get_sqlite_position,
    load_sqlite_positions,
    remove_sqlite_position,
    resolve_sqlite_path,
    save_sqlite_positions_state,
    upsert_sqlite_position,
)

VALID_POSITIONS_BACKENDS = {"json", "sqlite"}


def resolve_positions_storage_backend() -> str:
    backend = str(os.getenv("SAGA_STORAGE_BACKEND") or "json").strip().lower()
    return backend if backend in VALID_POSITIONS_BACKENDS else "json"


def resolve_positions_db_path(json_positions_path: str) -> str:
    if resolve_positions_storage_backend() != "sqlite":
        return json_positions_path

    explicit = str(os.getenv("SAGA_SQLITE_DB") or "").strip()
    if explicit:
        return explicit

    data_dir = os.path.dirname(os.path.abspath(json_positions_path)) or "."
    return resolve_sqlite_path(data_dir)



def get_live_position(path: str, user: str) -> dict[str, Any]:
    user_key = str(user or "").strip()
    if not user_key:
        return {}

    if resolve_positions_storage_backend() == "sqlite":
        return get_sqlite_position(resolve_positions_db_path(path), user_key)

    state = load_json_live_positions_state(path)
    raw = state.get(user_key, {})
    return raw if isinstance(raw, dict) else {}

def load_live_positions_state(path: str) -> dict[str, dict[str, Any]]:
    if resolve_positions_storage_backend() == "sqlite":
        return load_sqlite_positions(resolve_positions_db_path(path))
    return load_json_live_positions_state(path)


def save_live_positions_state(path: str, data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if resolve_positions_storage_backend() == "sqlite":
        return save_sqlite_positions_state(resolve_positions_db_path(path), data)
    return save_json_live_positions_state(path, data)


def upsert_live_position(path: str, user: str, position: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if resolve_positions_storage_backend() == "sqlite":
        sqlite_path = resolve_positions_db_path(path)
        upsert_sqlite_position(sqlite_path, user, position)
        return load_sqlite_positions(sqlite_path)
    return upsert_json_live_position(path, user, position)


def remove_live_position(path: str, user: str) -> dict[str, dict[str, Any]]:
    if resolve_positions_storage_backend() == "sqlite":
        return remove_sqlite_position(resolve_positions_db_path(path), user)
    return remove_json_live_position(path, user)

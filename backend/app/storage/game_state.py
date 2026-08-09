"""Game state repository helpers.

This module isolates player progress operations from the FastAPI route layer.
The current backend still uses the JSON storage backend, but callers should use
these helpers instead of open-coded load/modify/save cycles.

This is a stepping stone toward SQLite/event-backed storage.
"""

from __future__ import annotations

from typing import Any

from backend.app.storage.json_store import load_json, save_json, update_json


def normalize_game_state(raw: Any) -> dict[str, int]:
    if not isinstance(raw, dict):
        return {}

    normalized: dict[str, int] = {}

    for user, level in raw.items():
        key = str(user or "").strip()
        if not key:
            continue

        try:
            normalized[key] = int(level or 0)
        except (TypeError, ValueError):
            normalized[key] = 0

    return normalized


def load_game_state(path: str) -> dict[str, int]:
    return normalize_game_state(load_json(path, {}))


def save_game_state(path: str, state: dict[str, int]) -> dict[str, int]:
    normalized = normalize_game_state(state)
    save_json(path, normalized)
    return normalized


def get_player_level(path: str, user: str, default: int = 0) -> int:
    state = load_game_state(path)
    user_key = str(user or "").strip()
    if not user_key:
        return default
    return int(state.get(user_key, default) or default)


def set_player_level(path: str, user: str, level: int) -> dict[str, int]:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    next_level = max(0, int(level or 0))

    def updater(state):
        state = normalize_game_state(state)
        state[user_key] = next_level
        return state

    return normalize_game_state(update_json(path, {}, updater))


def reset_player_level(path: str, user: str) -> dict[str, int]:
    return set_player_level(path, user, 0)


def advance_player_level(path: str, user: str, step: int = 1) -> dict[str, int]:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    delta = int(step or 1)

    def updater(state):
        state = normalize_game_state(state)
        state[user_key] = max(0, int(state.get(user_key, 0) or 0) + delta)
        return state

    return normalize_game_state(update_json(path, {}, updater))

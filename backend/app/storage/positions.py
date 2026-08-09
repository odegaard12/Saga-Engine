"""Live positions repository helpers.

This module isolates live player/team position state from the FastAPI route
layer. The current backend still uses JSON storage, but callers should use
these helpers instead of open-coded load/save access to positions.json.

This prepares SAGA for stronger multiplayer presence, offline sync and a later
SQLite/event-backed storage backend.
"""

from __future__ import annotations

from typing import Any

from backend.app.storage.json_store import load_json, save_json, update_json


VALID_POSITION_GPS_STATUS = {
    "ok",
    "unknown",
    "unavailable",
    "stale",
    "searching",
    "error",
    "denied",
}

VALID_POSITION_SOURCES = {
    "player",
    "device",
    "react",
    "pwa",
}


def _as_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value

    if value is None:
        return default

    if isinstance(value, (int, float)):
        return bool(value)

    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False

    return default


def _as_float(value: Any):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


def normalize_gps_status(value: Any) -> str:
    status = str(value or "unknown").strip().lower() or "unknown"
    return status if status in VALID_POSITION_GPS_STATUS else "unknown"


def normalize_position_source(value: Any) -> str:
    source = str(value or "player").strip().lower() or "player"
    return source if source in VALID_POSITION_SOURCES else "player"


def normalize_live_position(raw: Any) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}

    return {
        "last_seen": _as_int(raw.get("last_seen"), 0),
        "gps_status": normalize_gps_status(raw.get("gps_status")),
        "lat": _as_float(raw.get("lat")),
        "lon": _as_float(raw.get("lon")),
        "source": normalize_position_source(raw.get("source")),
        "debug_enabled": _as_bool(raw.get("debug_enabled"), False),
    }


def normalize_live_positions(raw: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, dict):
        return {}

    normalized: dict[str, dict[str, Any]] = {}

    for user, position in raw.items():
        user_key = str(user or "").strip()
        if not user_key:
            continue

        normalized[user_key] = normalize_live_position(position)

    return normalized


def load_live_positions_state(path: str) -> dict[str, dict[str, Any]]:
    return normalize_live_positions(load_json(path, {}))


def save_live_positions_state(path: str, data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    normalized = normalize_live_positions(data)
    save_json(path, normalized)
    return normalized


def upsert_live_position(path: str, user: str, position: dict[str, Any]) -> dict[str, dict[str, Any]]:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    def updater(state):
        state = normalize_live_positions(state)
        state[user_key] = normalize_live_position(position)
        return state

    return normalize_live_positions(update_json(path, {}, updater))


def remove_live_position(path: str, user: str) -> dict[str, dict[str, Any]]:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    def updater(state):
        state = normalize_live_positions(state)
        state.pop(user_key, None)
        return state

    return normalize_live_positions(update_json(path, {}, updater))

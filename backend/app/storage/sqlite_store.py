"""SQLite storage foundation for SAGA Engine.

This module is not the active production storage backend yet.

It creates the first SQLite schema and helper functions for the data that will
eventually replace high-churn JSON files:

- event log
- player game state
- live positions

The current runtime can continue using JSON while this foundation is tested.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any
import json
import os
import sqlite3

from backend.app.storage.event_log import normalize_event
from backend.app.storage.positions import normalize_live_position


DEFAULT_SQLITE_FILENAME = "saga.sqlite3"
SQLITE_SCHEMA_VERSION = 1


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve_sqlite_path(data_dir: str, filename: str = DEFAULT_SQLITE_FILENAME) -> str:
    base = str(data_dir or ".").strip() or "."
    if not os.path.isabs(base):
        base = os.path.abspath(base)

    os.makedirs(base, exist_ok=True)
    return os.path.join(base, filename)


def connect_sqlite(path: str) -> sqlite3.Connection:
    parent = os.path.dirname(path) or "."
    os.makedirs(parent, exist_ok=True)

    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


@contextmanager
def sqlite_connection(path: str):
    conn = connect_sqlite(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_sqlite_schema(path: str) -> None:
    with sqlite_connection(path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            INSERT INTO schema_meta (key, value)
            VALUES ('schema_version', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (str(SQLITE_SCHEMA_VERSION),),
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL,
                user TEXT NOT NULL DEFAULT '',
                team_id TEXT NOT NULL DEFAULT '',
                node_id TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                synced_at TEXT,
                error TEXT
            )
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_events_status_created
            ON events(status, created_at)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_events_user_created
            ON events(user, created_at)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_events_type_created
            ON events(type, created_at)
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS game_state (
                user TEXT PRIMARY KEY,
                level INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS positions (
                user TEXT PRIMARY KEY,
                last_seen INTEGER NOT NULL DEFAULT 0,
                gps_status TEXT NOT NULL DEFAULT 'unknown',
                lat REAL,
                lon REAL,
                source TEXT NOT NULL DEFAULT 'player',
                debug_enabled INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_documents (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stages (
                idx INTEGER PRIMARY KEY,
                stage_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def _json_dumps(value: Any) -> str:
    return json.dumps(value if isinstance(value, dict) else {}, ensure_ascii=False)


def _json_loads(value: str) -> dict[str, Any]:
    try:
        decoded = json.loads(value or "{}")
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}


def append_sqlite_event(path: str, event: dict[str, Any]) -> dict[str, Any]:
    init_sqlite_schema(path)
    normalized = normalize_event(event)

    with sqlite_connection(path) as conn:
        conn.execute(
            """
            INSERT INTO events (
                id,
                type,
                status,
                source,
                created_at,
                user,
                team_id,
                node_id,
                payload_json,
                synced_at,
                error
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized["id"],
                normalized["type"],
                normalized["status"],
                normalized["source"],
                normalized["created_at"],
                normalized.get("user", ""),
                normalized.get("team_id", ""),
                normalized.get("node_id", ""),
                _json_dumps(normalized.get("payload")),
                normalized.get("synced_at"),
                normalized.get("error"),
            ),
        )

    return normalized


def _row_to_event(row: sqlite3.Row) -> dict[str, Any]:
    event = {
        "id": row["id"],
        "type": row["type"],
        "status": row["status"],
        "source": row["source"],
        "created_at": row["created_at"],
        "user": row["user"],
        "team_id": row["team_id"],
        "node_id": row["node_id"],
        "payload": _json_loads(row["payload_json"]),
    }

    if row["synced_at"]:
        event["synced_at"] = row["synced_at"]

    if row["error"]:
        event["error"] = row["error"]

    return event


def list_sqlite_events(
    path: str,
    *,
    status: str | None = None,
    user: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    init_sqlite_schema(path)

    clauses = []
    params: list[Any] = []

    if status:
        clauses.append("status = ?")
        params.append(status)

    if user:
        clauses.append("user = ?")
        params.append(user)

    if event_type:
        clauses.append("type = ?")
        params.append(event_type)

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"SELECT * FROM events{where} ORDER BY created_at ASC, id ASC"

    if limit is not None:
        sql += " LIMIT ?"
        params.append(max(1, min(5000, int(limit))))

    with sqlite_connection(path) as conn:
        rows = conn.execute(sql, params).fetchall()

    return [_row_to_event(row) for row in rows]


def set_sqlite_player_level(path: str, user: str, level: int) -> None:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    next_level = max(0, int(level or 0))
    now = utc_now_iso()

    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        conn.execute(
            """
            INSERT INTO game_state (user, level, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user) DO UPDATE SET
                level = excluded.level,
                updated_at = excluded.updated_at
            """,
            (user_key, next_level, now),
        )


def load_sqlite_game_state(path: str) -> dict[str, int]:
    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        rows = conn.execute("SELECT user, level FROM game_state ORDER BY user ASC").fetchall()

    return {row["user"]: int(row["level"] or 0) for row in rows}


def upsert_sqlite_position(path: str, user: str, position: dict[str, Any]) -> None:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    normalized = normalize_live_position(position)
    now = utc_now_iso()

    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        conn.execute(
            """
            INSERT INTO positions (
                user,
                last_seen,
                gps_status,
                lat,
                lon,
                source,
                debug_enabled,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user) DO UPDATE SET
                last_seen = excluded.last_seen,
                gps_status = excluded.gps_status,
                lat = excluded.lat,
                lon = excluded.lon,
                source = excluded.source,
                debug_enabled = excluded.debug_enabled,
                updated_at = excluded.updated_at
            """,
            (
                user_key,
                normalized["last_seen"],
                normalized["gps_status"],
                normalized["lat"],
                normalized["lon"],
                normalized["source"],
                1 if normalized["debug_enabled"] else 0,
                now,
            ),
        )



def get_sqlite_position(path: str, user: str) -> dict[str, Any]:
    user_key = str(user or "").strip()
    if not user_key:
        return {}

    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        row = conn.execute(
            """
            SELECT user, last_seen, gps_status, lat, lon, source, debug_enabled
            FROM positions
            WHERE user = ?
            """,
            (user_key,),
        ).fetchone()

    if not row:
        return {}

    return {
        "last_seen": int(row["last_seen"] or 0),
        "gps_status": row["gps_status"],
        "lat": row["lat"],
        "lon": row["lon"],
        "source": row["source"],
        "debug_enabled": bool(row["debug_enabled"]),
    }

def load_sqlite_positions(path: str) -> dict[str, dict[str, Any]]:
    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        rows = conn.execute(
            """
            SELECT user, last_seen, gps_status, lat, lon, source, debug_enabled
            FROM positions
            ORDER BY user ASC
            """
        ).fetchall()

    return {
        row["user"]: {
            "last_seen": int(row["last_seen"] or 0),
            "gps_status": row["gps_status"],
            "lat": row["lat"],
            "lon": row["lon"],
            "source": row["source"],
            "debug_enabled": bool(row["debug_enabled"]),
        }
        for row in rows
    }

def mark_sqlite_event_status(
    path: str,
    event_id: str,
    status: str,
    *,
    error: str | None = None,
) -> dict[str, Any] | None:
    init_sqlite_schema(path)

    event_key = str(event_id or "").strip()
    if not event_key:
        return None

    next_status = str(status or "pending").strip() or "pending"
    synced_at = utc_now_iso() if next_status == "synced" else None

    with sqlite_connection(path) as conn:
        existing = conn.execute(
            "SELECT * FROM events WHERE id = ?",
            (event_key,),
        ).fetchone()

        if not existing:
            return None

        conn.execute(
            """
            UPDATE events
            SET status = ?,
                synced_at = COALESCE(?, synced_at),
                error = COALESCE(?, error)
            WHERE id = ?
            """,
            (next_status, synced_at, error, event_key),
        )

        updated = conn.execute(
            "SELECT * FROM events WHERE id = ?",
            (event_key,),
        ).fetchone()

    return _row_to_event(updated)

def save_sqlite_game_state(path: str, state: dict[str, int]) -> dict[str, int]:
    normalized: dict[str, int] = {}

    for user, level in (state or {}).items():
        user_key = str(user or "").strip()
        if not user_key:
            continue
        try:
            normalized[user_key] = max(0, int(level or 0))
        except (TypeError, ValueError):
            normalized[user_key] = 0

    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        conn.execute("DELETE FROM game_state")
        for user, level in normalized.items():
            conn.execute(
                """
                INSERT INTO game_state (user, level, updated_at)
                VALUES (?, ?, ?)
                """,
                (user, level, utc_now_iso()),
            )

    return normalized


def get_sqlite_player_level(path: str, user: str, default: int = 0) -> int:
    user_key = str(user or "").strip()
    if not user_key:
        return int(default or 0)

    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        row = conn.execute(
            "SELECT level FROM game_state WHERE user = ?",
            (user_key,),
        ).fetchone()

    if not row:
        return int(default or 0)

    return int(row["level"] or 0)


def reset_sqlite_player_level(path: str, user: str) -> dict[str, int]:
    set_sqlite_player_level(path, user, 0)
    return load_sqlite_game_state(path)


def advance_sqlite_player_level(path: str, user: str, step: int = 1) -> dict[str, int]:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    current = get_sqlite_player_level(path, user_key, default=0)
    try:
        delta = int(step or 1)
    except (TypeError, ValueError):
        delta = 1

    set_sqlite_player_level(path, user_key, max(0, current + delta))
    return load_sqlite_game_state(path)

def save_sqlite_positions_state(path: str, state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    normalized: dict[str, dict[str, Any]] = {}
    for user, position in (state or {}).items():
        user_key = str(user or "").strip()
        if not user_key:
            continue
        normalized[user_key] = normalize_live_position(position)

    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        conn.execute("DELETE FROM positions")
        for user, position in normalized.items():
            conn.execute(
                "INSERT INTO positions (user, last_seen, gps_status, lat, lon, source, debug_enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    user,
                    position["last_seen"],
                    position["gps_status"],
                    position["lat"],
                    position["lon"],
                    position["source"],
                    1 if position["debug_enabled"] else 0,
                    utc_now_iso(),
                ),
            )
    return normalized


def remove_sqlite_position(path: str, user: str) -> dict[str, dict[str, Any]]:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        conn.execute("DELETE FROM positions WHERE user = ?", (user_key,))
    return load_sqlite_positions(path)

def _json_dumps_any(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_loads_any(value: str, default: Any) -> Any:
    try:
        return json.loads(value or "null")
    except Exception:
        return default


def load_sqlite_document(path: str, key: str, default: Any) -> Any:
    init_sqlite_schema(path)
    document_key = str(key or "").strip()
    if not document_key:
        return default

    with sqlite_connection(path) as conn:
        row = conn.execute(
            "SELECT value_json FROM app_documents WHERE key = ?",
            (document_key,),
        ).fetchone()

    if not row:
        return default

    return _json_loads_any(row["value_json"], default)


def save_sqlite_document(path: str, key: str, value: Any) -> None:
    init_sqlite_schema(path)
    document_key = str(key or "").strip()
    if not document_key:
        raise ValueError("document key is required")

    with sqlite_connection(path) as conn:
        conn.execute(
            """
            INSERT INTO app_documents (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
            """,
            (document_key, _json_dumps_any(value), utc_now_iso()),
        )


def load_sqlite_stages(path: str) -> list[dict[str, Any]]:
    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        rows = conn.execute(
            "SELECT stage_json FROM stages ORDER BY idx ASC"
        ).fetchall()

    stages: list[dict[str, Any]] = []
    for row in rows:
        decoded = _json_loads_any(row["stage_json"], {})
        if isinstance(decoded, dict):
            stages.append(decoded)

    return stages


def save_sqlite_stages(path: str, stages: list[dict[str, Any]]) -> None:
    init_sqlite_schema(path)
    safe_stages = stages if isinstance(stages, list) else []

    with sqlite_connection(path) as conn:
        conn.execute("DELETE FROM stages")
        for index, stage in enumerate(safe_stages):
            if not isinstance(stage, dict):
                continue
            conn.execute(
                """
                INSERT INTO stages (idx, stage_json, updated_at)
                VALUES (?, ?, ?)
                """,
                (index, _json_dumps_any(stage), utc_now_iso()),
            )


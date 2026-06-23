#!/usr/bin/env python3
"""Dry-run migration from JSON runtime state to SQLite.

This script is intentionally non-destructive:
- it reads JSON runtime files from a data directory
- it writes to a temporary SQLite DB by default
- it prints a migration summary
- it does not modify JSON files
- it does not enable SQLite for the running app
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Any

from backend.app.storage.event_log import normalize_event_log
from backend.app.storage.json_store import load_json
from backend.app.storage.positions import normalize_live_position
from backend.app.storage.sqlite_store import (
    append_sqlite_event,
    init_sqlite_schema,
    list_sqlite_events,
    load_sqlite_document,
    load_sqlite_game_state,
    load_sqlite_positions,
    save_sqlite_document,
    save_sqlite_game_state,
    save_sqlite_stages,
    load_sqlite_stages,
    save_sqlite_positions_state,
)


def resolve_data_dir(value: str) -> Path:
    data_dir = Path(value or "data").expanduser()
    if not data_dir.is_absolute():
        data_dir = Path.cwd() / data_dir
    return data_dir.resolve()


def normalize_game_state(raw: Any) -> dict[str, int]:
    if not isinstance(raw, dict):
        return {}

    normalized: dict[str, int] = {}
    for user, level in raw.items():
        user_key = str(user or "").strip()
        if not user_key:
            continue
        try:
            normalized[user_key] = max(0, int(level or 0))
        except (TypeError, ValueError):
            normalized[user_key] = 0
    return normalized


def normalize_positions(raw: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, dict):
        return {}

    normalized: dict[str, dict[str, Any]] = {}
    for user, position in raw.items():
        user_key = str(user or "").strip()
        if not user_key:
            continue
        normalized[user_key] = normalize_live_position(position)
    return normalized


def build_sqlite_from_json(data_dir: Path, sqlite_path: Path) -> dict[str, Any]:
    game_json = data_dir / "gamestate.json"
    positions_json = data_dir / "positions.json"
    events_json = data_dir / "events.json"
    config_json = data_dir / "config.json"
    admin_auth_json = data_dir / "admin_auth.json"
    stages_json = data_dir / "stages.json"

    game_state = normalize_game_state(load_json(str(game_json), {}))
    positions = normalize_positions(load_json(str(positions_json), {}))
    events = normalize_event_log(load_json(str(events_json), []))
    config = load_json(str(config_json), {})
    admin_auth = load_json(str(admin_auth_json), {})
    stages = load_json(str(stages_json), [])
    if not isinstance(config, dict):
        config = {}
    if not isinstance(admin_auth, dict):
        admin_auth = {}
    if not isinstance(stages, list):
        stages = []

    init_sqlite_schema(str(sqlite_path))
    save_sqlite_game_state(str(sqlite_path), game_state)
    save_sqlite_positions_state(str(sqlite_path), positions)
    if config:
        save_sqlite_document(str(sqlite_path), "config", config)
    if admin_auth:
        save_sqlite_document(str(sqlite_path), "admin_auth", admin_auth)
    save_sqlite_stages(str(sqlite_path), [stage for stage in stages if isinstance(stage, dict)])

    event_errors: list[str] = []
    for event in events:
        try:
            append_sqlite_event(str(sqlite_path), event)
        except sqlite3.IntegrityError as exc:
            event_errors.append(f"{event.get('id', '<missing-id>')}: {exc}")

    loaded_game_state = load_sqlite_game_state(str(sqlite_path))
    loaded_positions = load_sqlite_positions(str(sqlite_path))
    loaded_events = list_sqlite_events(str(sqlite_path))
    loaded_config = load_sqlite_document(str(sqlite_path), "config", {})
    loaded_admin_auth = load_sqlite_document(str(sqlite_path), "admin_auth", {})
    loaded_stages = load_sqlite_stages(str(sqlite_path))

    return {
        "data_dir": str(data_dir),
        "sqlite_path": str(sqlite_path),
        "json_counts": {
            "game_state": len(game_state),
            "positions": len(positions),
            "events": len(events),
            "config": 1 if config else 0,
            "admin_auth": 1 if admin_auth else 0,
            "stages": len([stage for stage in stages if isinstance(stage, dict)]),
        },
        "sqlite_counts": {
            "game_state": len(loaded_game_state),
            "positions": len(loaded_positions),
            "events": len(loaded_events),
            "config": 1 if loaded_config else 0,
            "admin_auth": 1 if loaded_admin_auth else 0,
            "stages": len(loaded_stages),
        },
        "event_errors": event_errors,
    }


def print_summary(summary: dict[str, Any]) -> None:
    print("SQLite migration dry-run summary")
    print("================================")
    print(f"Data dir:    {summary['data_dir']}")
    print(f"SQLite DB:   {summary['sqlite_path']}")
    print()
    print("JSON input counts:")
    for key, value in summary["json_counts"].items():
        print(f"- {key}: {value}")
    print()
    print("SQLite output counts:")
    for key, value in summary["sqlite_counts"].items():
        print(f"- {key}: {value}")

    if summary["event_errors"]:
        print()
        print("Event import errors:")
        for error in summary["event_errors"]:
            print(f"- {error}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default=os.getenv("SAGA_DATA_DIR") or "data")
    parser.add_argument("--sqlite-db", default="")
    parser.add_argument(
        "--keep-temp-db",
        action="store_true",
        help="Keep the temporary SQLite DB when --sqlite-db is not provided.",
    )
    args = parser.parse_args()

    data_dir = resolve_data_dir(args.data_dir)
    if not data_dir.exists():
        raise SystemExit(f"Data directory does not exist: {data_dir}")

    temp_dir = None
    if args.sqlite_db:
        sqlite_path = Path(args.sqlite_db).expanduser()
        if not sqlite_path.is_absolute():
            sqlite_path = Path.cwd() / sqlite_path
        sqlite_path = sqlite_path.resolve()
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        temp_dir = tempfile.TemporaryDirectory(prefix="saga-sqlite-dry-run-")
        sqlite_path = Path(temp_dir.name) / "saga.sqlite3"

    try:
        summary = build_sqlite_from_json(data_dir, sqlite_path)
        print_summary(summary)

        if summary["event_errors"]:
            return 1

        if summary["json_counts"] != summary["sqlite_counts"]:
            print()
            print("ERROR: JSON and SQLite counts differ.")
            return 1

        print()
        print("Dry-run passed. JSON files were not modified.")
        if temp_dir and args.keep_temp_db:
            print(f"Temporary DB kept at: {sqlite_path}")
            temp_dir = None
        return 0
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())

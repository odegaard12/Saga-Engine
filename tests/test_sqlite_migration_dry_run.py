import json
import subprocess
import sys
from pathlib import Path

from backend.app.storage.sqlite_store import (
    list_sqlite_events,
    load_sqlite_game_state,
    load_sqlite_positions,
)


def test_sqlite_migration_dry_run_imports_runtime_json(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    sqlite_db = tmp_path / "dry-run.sqlite3"

    (data_dir / "gamestate.json").write_text(
        json.dumps({"PLAYER 1": 2, "PLAYER 2": 0}),
        encoding="utf-8",
    )
    (data_dir / "positions.json").write_text(
        json.dumps(
            {
                "PLAYER 1": {
                    "last_seen": 123,
                    "gps_status": "ok",
                    "lat": 42.2708,
                    "lon": -8.8601,
                    "source": "pwa",
                    "debug_enabled": True,
                }
            }
        ),
        encoding="utf-8",
    )
    (data_dir / "events.json").write_text(
        json.dumps(
            [
                {
                    "id": "evt_test_1",
                    "type": "qr_scanned",
                    "status": "pending",
                    "source": "offline_queue",
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "user": "PLAYER 1",
                    "node_id": "node-1",
                    "payload": {"code": "OMEGA"},
                }
            ]
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            "scripts/sqlite_migration_dry_run.py",
            "--data-dir",
            str(data_dir),
            "--sqlite-db",
            str(sqlite_db),
        ],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert "Dry-run passed" in result.stdout

    game_state = load_sqlite_game_state(str(sqlite_db))
    positions = load_sqlite_positions(str(sqlite_db))
    events = list_sqlite_events(str(sqlite_db))

    assert game_state == {"PLAYER 1": 2, "PLAYER 2": 0}
    assert positions["PLAYER 1"]["gps_status"] == "ok"
    assert positions["PLAYER 1"]["debug_enabled"] is True
    assert len(events) == 1
    assert events[0]["id"] == "evt_test_1"


def test_sqlite_migration_dry_run_missing_data_dir_fails(tmp_path: Path):
    missing_dir = tmp_path / "missing"

    result = subprocess.run(
        [
            sys.executable,
            "scripts/sqlite_migration_dry_run.py",
            "--data-dir",
            str(missing_dir),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert result.returncode != 0
    assert "Data directory does not exist" in result.stderr or "Data directory does not exist" in result.stdout

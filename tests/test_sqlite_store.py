from pathlib import Path

from backend.app.storage.sqlite_store import (
    SQLITE_SCHEMA_VERSION,
    append_sqlite_event,
    init_sqlite_schema,
    list_sqlite_events,
    load_sqlite_game_state,
    load_sqlite_positions,
    resolve_sqlite_path,
    set_sqlite_player_level,
    upsert_sqlite_position,
)


def test_sqlite_schema_initializes(tmp_path: Path):
    db = tmp_path / "saga.sqlite3"

    init_sqlite_schema(str(db))

    assert db.exists()


def test_sqlite_path_resolves_inside_data_dir(tmp_path: Path):
    resolved = resolve_sqlite_path(str(tmp_path))

    assert resolved == str(tmp_path / "saga.sqlite3")


def test_sqlite_event_roundtrip_and_filters(tmp_path: Path):
    db = tmp_path / "saga.sqlite3"

    first = append_sqlite_event(
        str(db),
        {
            "type": "qr_scanned",
            "source": "qr",
            "user": "PLAYER 1",
            "node_id": "node-01",
            "payload": {"physical_id": "node-01-abcd"},
        },
    )
    append_sqlite_event(
        str(db),
        {
            "type": "team_ready",
            "source": "player",
            "user": "PLAYER 2",
            "team_id": "team-a",
            "payload": {"window_s": 30},
        },
    )

    all_events = list_sqlite_events(str(db))
    assert len(all_events) == 2
    assert all_events[0]["id"] == first["id"]
    assert all_events[0]["payload"] == {"physical_id": "node-01-abcd"}

    assert len(list_sqlite_events(str(db), user="PLAYER 1")) == 1
    assert len(list_sqlite_events(str(db), event_type="team_ready")) == 1
    assert len(list_sqlite_events(str(db), status="pending")) == 2
    assert len(list_sqlite_events(str(db), limit=1)) == 1


def test_sqlite_game_state_roundtrip(tmp_path: Path):
    db = tmp_path / "saga.sqlite3"

    set_sqlite_player_level(str(db), "PLAYER 1", 3)
    set_sqlite_player_level(str(db), "PLAYER 2", 1)
    set_sqlite_player_level(str(db), "PLAYER 1", 4)

    assert load_sqlite_game_state(str(db)) == {
        "PLAYER 1": 4,
        "PLAYER 2": 1,
    }


def test_sqlite_positions_roundtrip(tmp_path: Path):
    db = tmp_path / "saga.sqlite3"

    upsert_sqlite_position(
        str(db),
        "PLAYER 1",
        {
            "last_seen": "123",
            "lat": "42.1",
            "lon": "-8.2",
            "gps_status": "OK",
            "source": "PWA",
            "debug_enabled": "true",
        },
    )

    assert load_sqlite_positions(str(db)) == {
        "PLAYER 1": {
            "last_seen": 123,
            "gps_status": "ok",
            "lat": 42.1,
            "lon": -8.2,
            "source": "pwa",
            "debug_enabled": True,
        }
    }


def test_sqlite_schema_version_constant_is_positive():
    assert SQLITE_SCHEMA_VERSION >= 1

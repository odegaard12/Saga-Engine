from pathlib import Path

from backend.app.storage.positions_store import (
    load_live_positions_state,
    remove_live_position,
    resolve_positions_db_path,
    resolve_positions_storage_backend,
    save_live_positions_state,
    upsert_live_position,
)


def test_positions_store_defaults_to_json_backend(monkeypatch, tmp_path: Path):
    monkeypatch.delenv("SAGA_STORAGE_BACKEND", raising=False)
    target = tmp_path / "positions.json"

    assert resolve_positions_storage_backend() == "json"
    assert resolve_positions_db_path(str(target)) == str(target)

    upsert_live_position(
        str(target),
        "PLAYER 1",
        {
            "last_seen": 100,
            "gps_status": "ok",
            "lat": 42.1,
            "lon": -8.6,
            "source": "react",
            "debug_enabled": True,
        },
    )

    state = load_live_positions_state(str(target))

    assert target.exists()
    assert state["PLAYER 1"]["gps_status"] == "ok"
    assert state["PLAYER 1"]["lat"] == 42.1
    assert state["PLAYER 1"]["debug_enabled"] is True


def test_positions_store_unknown_backend_falls_back_to_json(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "unknown")
    target = tmp_path / "positions.json"

    assert resolve_positions_storage_backend() == "json"

    save_live_positions_state(
        str(target),
        {
            "PLAYER 1": {
                "last_seen": 200,
                "gps_status": "searching",
                "lat": None,
                "lon": None,
                "source": "player",
                "debug_enabled": False,
            }
        },
    )

    assert load_live_positions_state(str(target))["PLAYER 1"]["gps_status"] == "searching"


def test_positions_store_uses_sqlite_backend_when_enabled(monkeypatch, tmp_path: Path):
    db = tmp_path / "saga.sqlite3"
    json_target = tmp_path / "positions.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(db))

    assert resolve_positions_storage_backend() == "sqlite"
    assert resolve_positions_db_path(str(json_target)) == str(db)

    upsert_live_position(
        str(json_target),
        "TEAM A",
        {
            "last_seen": 300,
            "gps_status": "ok",
            "lat": 42.2,
            "lon": -8.7,
            "source": "pwa",
            "debug_enabled": False,
        },
    )

    state = load_live_positions_state(str(json_target))

    assert db.exists()
    assert not json_target.exists()
    assert state["TEAM A"]["last_seen"] == 300
    assert state["TEAM A"]["gps_status"] == "ok"
    assert state["TEAM A"]["lat"] == 42.2
    assert state["TEAM A"]["lon"] == -8.7
    assert state["TEAM A"]["source"] == "pwa"
    assert state["TEAM A"]["debug_enabled"] is False


def test_positions_store_save_replaces_sqlite_state(monkeypatch, tmp_path: Path):
    db = tmp_path / "saga.sqlite3"
    json_target = tmp_path / "positions.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(db))

    save_live_positions_state(
        str(json_target),
        {
            "PLAYER 1": {"last_seen": 1, "gps_status": "ok"},
            "PLAYER 2": {"last_seen": 2, "gps_status": "stale"},
        },
    )

    assert sorted(load_live_positions_state(str(json_target)).keys()) == ["PLAYER 1", "PLAYER 2"]

    save_live_positions_state(
        str(json_target),
        {
            "PLAYER 1": {"last_seen": 9, "gps_status": "denied"},
        },
    )

    state = load_live_positions_state(str(json_target))

    assert list(state.keys()) == ["PLAYER 1"]
    assert state["PLAYER 1"]["gps_status"] == "denied"


def test_positions_store_remove_position_in_sqlite_and_json(monkeypatch, tmp_path: Path):
    db = tmp_path / "saga.sqlite3"
    sqlite_json_target = tmp_path / "sqlite_positions.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(db))

    upsert_live_position(str(sqlite_json_target), "PLAYER 1", {"last_seen": 1, "gps_status": "ok"})
    upsert_live_position(str(sqlite_json_target), "PLAYER 2", {"last_seen": 2, "gps_status": "ok"})

    sqlite_state = remove_live_position(str(sqlite_json_target), "PLAYER 1")

    assert list(sqlite_state.keys()) == ["PLAYER 2"]

    json_target = tmp_path / "positions.json"
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "json")

    upsert_live_position(str(json_target), "PLAYER 1", {"last_seen": 1, "gps_status": "ok"})
    json_state = remove_live_position(str(json_target), "PLAYER 1")

    assert json_state == {}

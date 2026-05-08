from pathlib import Path

from backend.app.storage.game_state_store import (
    advance_player_level,
    get_player_level,
    load_game_state,
    reset_player_level,
    resolve_game_state_backend,
    resolve_game_state_db_path,
    save_game_state,
    set_player_level,
)


def test_game_state_store_defaults_to_json_backend(monkeypatch, tmp_path: Path):
    monkeypatch.delenv("SAGA_STORAGE_BACKEND", raising=False)
    target = tmp_path / "gamestate.json"

    assert resolve_game_state_backend() == "json"
    assert resolve_game_state_db_path(str(target)) == str(target)

    set_player_level(str(target), "PLAYER 1", 3)

    assert target.exists()
    assert get_player_level(str(target), "PLAYER 1") == 3


def test_game_state_store_unknown_backend_falls_back_to_json(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "unknown")
    target = tmp_path / "gamestate.json"

    assert resolve_game_state_backend() == "json"

    set_player_level(str(target), "PLAYER 1", 2)

    assert load_game_state(str(target)) == {"PLAYER 1": 2}


def test_game_state_store_uses_sqlite_backend_when_enabled(monkeypatch, tmp_path: Path):
    db = tmp_path / "saga.sqlite3"
    json_target = tmp_path / "gamestate.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(db))

    assert resolve_game_state_backend() == "sqlite"
    assert resolve_game_state_db_path(str(json_target)) == str(db)

    set_player_level(str(json_target), "PLAYER 1", 4)

    assert db.exists()
    assert not json_target.exists()
    assert get_player_level(str(json_target), "PLAYER 1") == 4
    assert load_game_state(str(json_target)) == {"PLAYER 1": 4}


def test_game_state_store_save_replaces_sqlite_state(monkeypatch, tmp_path: Path):
    db = tmp_path / "saga.sqlite3"
    json_target = tmp_path / "gamestate.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(db))

    save_game_state(str(json_target), {"PLAYER 1": 2, "PLAYER 2": 5})
    assert load_game_state(str(json_target)) == {"PLAYER 1": 2, "PLAYER 2": 5}

    save_game_state(str(json_target), {"PLAYER 1": 7})
    assert load_game_state(str(json_target)) == {"PLAYER 1": 7}


def test_game_state_store_reset_and_advance_sqlite(monkeypatch, tmp_path: Path):
    db = tmp_path / "saga.sqlite3"
    json_target = tmp_path / "gamestate.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(db))

    set_player_level(str(json_target), "PLAYER 1", 3)

    advance_player_level(str(json_target), "PLAYER 1")
    assert get_player_level(str(json_target), "PLAYER 1") == 4

    advance_player_level(str(json_target), "PLAYER 1", step=-2)
    assert get_player_level(str(json_target), "PLAYER 1") == 2

    reset_player_level(str(json_target), "PLAYER 1")
    assert get_player_level(str(json_target), "PLAYER 1") == 0


def test_game_state_store_json_reset_and_advance(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "json")
    target = tmp_path / "gamestate.json"

    set_player_level(str(target), "PLAYER 1", 1)
    advance_player_level(str(target), "PLAYER 1")
    assert get_player_level(str(target), "PLAYER 1") == 2

    reset_player_level(str(target), "PLAYER 1")
    assert get_player_level(str(target), "PLAYER 1") == 0

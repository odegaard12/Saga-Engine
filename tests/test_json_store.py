from pathlib import Path

from backend.app.storage.json_store import load_json, save_json, update_json


def test_json_store_roundtrip(tmp_path: Path):
    target = tmp_path / "state.json"
    payload = {"level": 2, "players": ["PLAYER 1", "PLAYER 2"]}

    save_json(str(target), payload)

    assert load_json(str(target), {}) == payload
    assert not list(tmp_path.glob(".state.json.*.tmp"))


def test_json_store_returns_default_for_missing_file(tmp_path: Path):
    target = tmp_path / "missing.json"

    assert load_json(str(target), {"fallback": True}) == {"fallback": True}


def test_json_store_returns_default_for_invalid_json(tmp_path: Path):
    target = tmp_path / "broken.json"
    target.write_text("{not valid json", encoding="utf-8")

    assert load_json(str(target), {"fallback": True}) == {"fallback": True}


def test_json_store_update_json_locked_read_modify_write(tmp_path: Path):
    target = tmp_path / "state.json"
    save_json(str(target), {"PLAYER 1": 2})

    def advance(state):
        state["PLAYER 1"] = state.get("PLAYER 1", 0) + 1
        state["PLAYER 2"] = 0
        return state

    updated = update_json(str(target), {}, advance)

    assert updated == {"PLAYER 1": 3, "PLAYER 2": 0}
    assert load_json(str(target), {}) == {"PLAYER 1": 3, "PLAYER 2": 0}
    assert not list(tmp_path.glob(".state.json.*.tmp"))


def test_json_store_update_json_uses_default_for_missing_file(tmp_path: Path):
    target = tmp_path / "missing-state.json"

    def initialize(state):
        state["PLAYER 1"] = 0
        return state

    updated = update_json(str(target), {}, initialize)

    assert updated == {"PLAYER 1": 0}
    assert load_json(str(target), {}) == {"PLAYER 1": 0}

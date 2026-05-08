from pathlib import Path

from backend.app.storage.json_store import load_json, save_json


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

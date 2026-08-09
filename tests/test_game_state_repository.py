from pathlib import Path

import pytest

from backend.app.storage.game_state import (
    advance_player_level,
    get_player_level,
    load_game_state,
    reset_player_level,
    save_game_state,
    set_player_level,
)


def test_game_state_repository_roundtrip(tmp_path: Path):
    target = tmp_path / "gamestate.json"

    save_game_state(str(target), {"PLAYER 1": 2, "PLAYER 2": "3"})

    assert load_game_state(str(target)) == {"PLAYER 1": 2, "PLAYER 2": 3}
    assert get_player_level(str(target), "PLAYER 1") == 2
    assert get_player_level(str(target), "PLAYER 2") == 3


def test_game_state_repository_set_reset_and_advance(tmp_path: Path):
    target = tmp_path / "gamestate.json"

    set_player_level(str(target), "PLAYER 1", 4)
    assert get_player_level(str(target), "PLAYER 1") == 4

    advance_player_level(str(target), "PLAYER 1")
    assert get_player_level(str(target), "PLAYER 1") == 5

    reset_player_level(str(target), "PLAYER 1")
    assert get_player_level(str(target), "PLAYER 1") == 0


def test_game_state_repository_rejects_empty_user(tmp_path: Path):
    target = tmp_path / "gamestate.json"

    with pytest.raises(ValueError):
        set_player_level(str(target), "", 1)

    with pytest.raises(ValueError):
        advance_player_level(str(target), "", 1)


def test_game_state_repository_normalizes_broken_values(tmp_path: Path):
    target = tmp_path / "gamestate.json"
    target.write_text('{"PLAYER 1": "bad", "": 99, "PLAYER 2": 2}', encoding="utf-8")

    assert load_game_state(str(target)) == {"PLAYER 1": 0, "PLAYER 2": 2}

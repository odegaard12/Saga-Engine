from pathlib import Path

import pytest

from backend.app.storage.positions import (
    load_live_positions_state,
    normalize_gps_status,
    normalize_live_position,
    normalize_live_positions,
    normalize_position_source,
    remove_live_position,
    save_live_positions_state,
    upsert_live_position,
)


def test_positions_repository_roundtrip(tmp_path: Path):
    target = tmp_path / "positions.json"

    saved = save_live_positions_state(
        str(target),
        {
            "PLAYER 1": {
                "last_seen": "123",
                "lat": "42.1",
                "lon": "-8.2",
                "gps_status": "OK",
                "source": "PWA",
                "debug_enabled": "true",
            }
        },
    )

    assert saved == {
        "PLAYER 1": {
            "last_seen": 123,
            "lat": 42.1,
            "lon": -8.2,
            "gps_status": "ok",
            "source": "pwa",
            "debug_enabled": True,
        }
    }

    assert load_live_positions_state(str(target)) == saved


def test_positions_repository_upsert_and_remove(tmp_path: Path):
    target = tmp_path / "positions.json"

    upsert_live_position(
        str(target),
        "PLAYER 1",
        {
            "last_seen": 10,
            "lat": 42.0,
            "lon": -8.0,
            "gps_status": "searching",
            "source": "react",
            "debug_enabled": False,
        },
    )

    assert load_live_positions_state(str(target))["PLAYER 1"]["gps_status"] == "searching"

    remove_live_position(str(target), "PLAYER 1")

    assert load_live_positions_state(str(target)) == {}


def test_positions_repository_rejects_empty_user(tmp_path: Path):
    target = tmp_path / "positions.json"

    with pytest.raises(ValueError):
        upsert_live_position(str(target), "", {})

    with pytest.raises(ValueError):
        remove_live_position(str(target), "")


def test_positions_repository_normalizes_invalid_values():
    normalized = normalize_live_position(
        {
            "last_seen": "bad",
            "lat": "bad",
            "lon": None,
            "gps_status": "weird",
            "source": "strange",
            "debug_enabled": "no",
        }
    )

    assert normalized == {
        "last_seen": 0,
        "lat": None,
        "lon": None,
        "gps_status": "unknown",
        "source": "player",
        "debug_enabled": False,
    }


def test_positions_repository_normalizes_collection_and_skips_empty_users():
    normalized = normalize_live_positions(
        {
            "": {"last_seen": 1},
            "PLAYER 1": {"last_seen": 5, "gps_status": "denied"},
        }
    )

    assert normalized == {
        "PLAYER 1": {
            "last_seen": 5,
            "lat": None,
            "lon": None,
            "gps_status": "denied",
            "source": "player",
            "debug_enabled": False,
        }
    }


def test_position_status_and_source_helpers():
    assert normalize_gps_status("OK") == "ok"
    assert normalize_gps_status("bad") == "unknown"
    assert normalize_position_source("PWA") == "pwa"
    assert normalize_position_source("bad") == "player"

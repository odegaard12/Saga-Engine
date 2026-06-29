from pathlib import Path

from fastapi.testclient import TestClient

import main
from backend.app.storage.sqlite_store import load_sqlite_positions


def make_client():
    return TestClient(main.app)


def reset_heartbeat_rate_state():
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()


def test_heartbeat_defaults_to_json_positions_backend(tmp_path: Path, monkeypatch):
    positions_json = tmp_path / "positions.json"

    monkeypatch.delenv("SAGA_STORAGE_BACKEND", raising=False)
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    monkeypatch.setattr(main, "POSITIONS_DB", str(positions_json))
    reset_heartbeat_rate_state()

    client = make_client()
    response = client.post(
        "/api/heartbeat",
        json={
            "user": "PLAYER 1",
            "lat": 42.2708,
            "lon": -8.8601,
            "gps_status": "ok",
            "source": "pwa",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    assert main.get_live_position("PLAYER 1").get("gps_status") == "ok"
    state = main.load_live_positions()
    assert state["PLAYER 1"]["gps_status"] == "ok"
    assert state["PLAYER 1"]["lat"] == 42.2708
    assert state["PLAYER 1"]["lon"] == -8.8601
    assert state["PLAYER 1"]["source"] == "pwa"


def test_heartbeat_uses_sqlite_positions_adapter_when_enabled(tmp_path: Path, monkeypatch):
    positions_json = tmp_path / "positions.json"
    sqlite_db = tmp_path / "saga.sqlite3"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(sqlite_db))
    monkeypatch.setattr(main, "POSITIONS_DB", str(positions_json))
    reset_heartbeat_rate_state()

    client = make_client()
    response = client.post(
        "/api/heartbeat",
        json={
            "user": "PLAYER 1",
            "lat": 42.2708,
            "lon": -8.8601,
            "gps_status": "ok",
            "source": "pwa",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    assert sqlite_db.exists()
    assert not positions_json.exists()

    state = load_sqlite_positions(str(sqlite_db))
    assert state["PLAYER 1"]["gps_status"] == "ok"
    assert state["PLAYER 1"]["lat"] == 42.2708
    assert state["PLAYER 1"]["lon"] == -8.8601
    assert state["PLAYER 1"]["source"] == "pwa"

    team_response = client.get("/api/team/PLAYER%201")
    assert team_response.status_code == 200
    profiles = team_response.json()["profiles"]
    player = next(item for item in profiles if item["user"] == "PLAYER 1")
    assert player["presence"] == "live"
    assert player["gps_status"] == "ok"
    assert player["lat"] == 42.2708
    assert player["lon"] == -8.8601


def test_heartbeat_preserves_existing_sqlite_coordinates_when_omitted(tmp_path: Path, monkeypatch):
    positions_json = tmp_path / "positions.json"
    sqlite_db = tmp_path / "saga.sqlite3"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(sqlite_db))
    monkeypatch.setattr(main, "POSITIONS_DB", str(positions_json))
    reset_heartbeat_rate_state()

    client = make_client()
    first = client.post(
        "/api/heartbeat",
        json={
            "user": "PLAYER 1",
            "lat": 42.2708,
            "lon": -8.8601,
            "gps_status": "ok",
            "source": "pwa",
        },
    )
    assert first.status_code == 200

    reset_heartbeat_rate_state()

    second = client.post(
        "/api/heartbeat",
        json={
            "user": "PLAYER 1",
            "gps_status": "searching",
            "source": "player",
        },
    )
    assert second.status_code == 200

    state = load_sqlite_positions(str(sqlite_db))
    assert state["PLAYER 1"]["lat"] == 42.2708
    assert state["PLAYER 1"]["lon"] == -8.8601
    assert state["PLAYER 1"]["gps_status"] == "searching"
    assert state["PLAYER 1"]["source"] == "player"

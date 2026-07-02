import json
from backend.app.storage.sqlite_store import save_sqlite_stages
from pathlib import Path

from fastapi.testclient import TestClient

import main
from backend.app.storage.sqlite_store import get_sqlite_player_level, set_sqlite_player_level


def make_client():
    return TestClient(main.app)


def seed_player_session(client: TestClient, user: str = "PLAYER 1"):
    main.clear_player_rate_limits()
    response = client.get(f"/api/game/{user.replace(' ', '%20')}")
    assert response.status_code == 200


def write_test_stages(path: Path, count: int = 3):
    stages = []
    for index in range(count):
        stages.append(
            {
                "id": f"test-node-{index + 1}",
                "title": f"Test Node {index + 1}",
                "content": "Test node for route-level storage adapter checks.",
                "lat": 42.2708,
                "lon": -8.8601,
                "radius": 50,
                "type": "signal_hunt",
                "answer": "OMEGA",
            }
        )
    path.write_text(json.dumps(stages, ensure_ascii=False), encoding="utf-8")


def configure_sqlite_game_state(monkeypatch, tmp_path: Path):
    game_json = tmp_path / "gamestate.json"
    sqlite_db = tmp_path / "saga.sqlite3"
    stages_json = tmp_path / "stages.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(sqlite_db))
    monkeypatch.setattr(main, "GAME_DB", str(game_json))
    monkeypatch.setattr(main, "STAGES_DB", str(stages_json))
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    main.clear_admin_sessions()

    write_test_stages(stages_json, count=3)
    save_sqlite_stages(str(sqlite_db), json.loads(stages_json.read_text(encoding="utf-8")))
    return game_json, sqlite_db, stages_json


def admin_headers():
    token = main.create_admin_session()
    return {"Cookie": f"{main.ADMIN_SESSION_COOKIE}={token}"}


def test_public_state_and_game_routes_read_sqlite_game_state(monkeypatch, tmp_path: Path):
    game_json, sqlite_db, _ = configure_sqlite_game_state(monkeypatch, tmp_path)
    set_sqlite_player_level(str(sqlite_db), "PLAYER 1", 2)

    client = make_client()

    state_response = client.get("/api/state/PLAYER%201")
    assert state_response.status_code == 200
    state_payload = state_response.json()
    assert state_payload["user"] == "PLAYER 1"
    assert state_payload["level"] == 2

    game_response = client.get("/api/game/PLAYER%201")
    assert game_response.status_code == 200
    game_payload = game_response.json()
    assert game_payload["user"] == "PLAYER 1"
    assert game_payload["level"] == 2

    assert sqlite_db.exists()
    assert not game_json.exists()


def test_advance_route_writes_sqlite_game_state(monkeypatch, tmp_path: Path):
    game_json, sqlite_db, _ = configure_sqlite_game_state(monkeypatch, tmp_path)

    client = make_client()
    seed_player_session(client)
    response = client.post(
        "/api/advance",
        json={
            "user": "PLAYER 1",
            "code": "OMEGA",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert get_sqlite_player_level(str(sqlite_db), "PLAYER 1") == 1

    assert sqlite_db.exists()
    assert not game_json.exists()


def test_admin_profile_action_writes_sqlite_game_state(monkeypatch, tmp_path: Path):
    game_json, sqlite_db, _ = configure_sqlite_game_state(monkeypatch, tmp_path)

    client = make_client()
    response = client.post(
        "/api/admin/profile-action",
        headers=admin_headers(),
        json={
            "profile_id": "PLAYER 1",
            "action": "level_next",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["profile_id"] == "PLAYER 1"
    assert payload["previous_level"] == 0
    assert payload["level"] == 1

    assert get_sqlite_player_level(str(sqlite_db), "PLAYER 1") == 1
    assert sqlite_db.exists()
    assert not game_json.exists()


def test_admin_mission_status_and_react_overview_read_sqlite_game_state(monkeypatch, tmp_path: Path):
    game_json, sqlite_db, _ = configure_sqlite_game_state(monkeypatch, tmp_path)
    set_sqlite_player_level(str(sqlite_db), "PLAYER 1", 2)

    client = make_client()
    headers = admin_headers()

    mission_response = client.post(
        "/api/admin/mission-status",
        headers=headers,
        json={},
    )
    assert mission_response.status_code == 200
    mission_payload = mission_response.json()
    player = next(item for item in mission_payload["profiles"] if item["user"] == "PLAYER 1")
    assert player["level"] == 2

    overview_response = client.post(
        "/api/admin/react-overview",
        headers=headers,
        json={},
    )
    assert overview_response.status_code == 200
    overview_payload = overview_response.json()
    overview_player = next(item for item in overview_payload["profiles"] if item["id"] == "PLAYER 1")
    assert overview_player["level"] == 2

    assert sqlite_db.exists()
    assert not game_json.exists()

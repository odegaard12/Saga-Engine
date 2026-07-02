import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-data-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def make_client():
    return TestClient(main.app)


def seed_player_session(client: TestClient, user: str = "PLAYER 1"):
    main.clear_player_rate_limits()
    response = client.get(f"/api/game/{user.replace(' ', '%20')}")
    assert response.status_code == 200


def admin_headers():
    token = main.create_admin_session()
    return {"Cookie": f"{main.ADMIN_SESSION_COOKIE}={token}"}


def configure_sqlite_events(monkeypatch, tmp_path: Path):
    events_json = tmp_path / "events.json"
    sqlite_db = tmp_path / "saga.sqlite3"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(sqlite_db))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(events_json))
    main.clear_admin_sessions()

    return events_json, sqlite_db


def test_event_sync_and_admin_events_use_sqlite_backend(monkeypatch, tmp_path: Path):
    events_json, sqlite_db = configure_sqlite_events(monkeypatch, tmp_path)

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)
    sync_response = client.post(
        "/api/events/sync",
        json={
            "user": "PLAYER 1",
            "events": [
                {
                    "type": "qr_scanned",
                    "node_id": "test-node-1",
                    "payload": {"code": "OMEGA"},
                }
            ],
        },
    )

    assert sync_response.status_code == 200
    sync_payload = sync_response.json()
    assert sync_payload["status"] == "ok"
    assert sync_payload["accepted"] == 1

    assert sqlite_db.exists()
    assert not events_json.exists()

    admin_response = client.post(
        "/api/admin/events",
        headers=admin_headers(),
        json={"limit": 20},
    )

    assert admin_response.status_code == 200
    admin_payload = admin_response.json()
    event_types = {event["type"] for event in admin_payload["events"]}

    assert "qr_scanned" in event_types
    assert "offline_sync_received" in event_types
    assert not events_json.exists()


def test_admin_event_mark_uses_sqlite_backend(monkeypatch, tmp_path: Path):
    events_json, sqlite_db = configure_sqlite_events(monkeypatch, tmp_path)

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)
    sync_response = client.post(
        "/api/events/sync",
        json={
            "user": "PLAYER 1",
            "events": [
                {
                    "type": "team_ready",
                    "node_id": "test-node-2",
                    "payload": {"ready": True},
                }
            ],
        },
    )
    assert sync_response.status_code == 200

    event_id = sync_response.json()["events"][0]["id"]

    mark_response = client.post(
        "/api/admin/events/mark",
        headers=admin_headers(),
        json={
            "event_id": event_id,
            "status": "synced",
        },
    )

    assert mark_response.status_code == 200
    mark_payload = mark_response.json()
    assert mark_payload["status"] == "ok"
    assert mark_payload["event"]["id"] == event_id
    assert mark_payload["event"]["status"] == "synced"

    assert sqlite_db.exists()
    assert not events_json.exists()

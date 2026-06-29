import os
from pathlib import Path

from fastapi.testclient import TestClient

import main


def make_client():
    return TestClient(main.app)


def test_player_event_sync_accepts_known_player(tmp_path: Path, monkeypatch):
    event_log = tmp_path / "events.json"
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(event_log))

    client = make_client()

    response = client.post(
        "/api/events/sync",
        json={
            "user": "PLAYER 1",
            "events": [
                {
                    "type": "qr_scanned",
                    "source": "qr",
                    "node_id": "node-01",
                    "payload": {
                        "physical_id": "node-01-abcd",
                        "note": "safe public marker",
                    },
                },
                {
                    "type": "team_ready",
                    "team_id": "team-a",
                    "payload": {"window_s": 30},
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["accepted"] == 2
    assert [event["type"] for event in payload["events"]] == ["qr_scanned", "team_ready"]

    events = main.list_events(str(event_log))
    assert len(events) == 3
    assert events[0]["type"] == "qr_scanned"
    assert events[1]["type"] == "team_ready"
    assert events[2]["type"] == "offline_sync_received"


def test_player_event_sync_rejects_unknown_player(tmp_path: Path, monkeypatch):
    event_log = tmp_path / "events.json"
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(event_log))

    client = make_client()

    response = client.post(
        "/api/events/sync",
        json={
            "user": "UNKNOWN PLAYER",
            "events": [{"type": "qr_scanned"}],
        },
    )

    assert response.status_code == 403


def test_player_event_sync_rejects_unsupported_event_type(tmp_path: Path, monkeypatch):
    event_log = tmp_path / "events.json"
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(event_log))

    client = make_client()

    response = client.post(
        "/api/events/sync",
        json={
            "user": "PLAYER 1",
            "events": [{"type": "admin_action"}],
        },
    )

    assert response.status_code == 400


def test_admin_events_requires_authentication(tmp_path: Path, monkeypatch):
    event_log = tmp_path / "events.json"
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(event_log))

    client = make_client()

    response = client.post("/api/admin/events", json={})

    assert response.status_code == 403


def test_admin_events_lists_events_with_session(tmp_path: Path, monkeypatch):
    event_log = tmp_path / "events.json"
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(event_log))

    main.append_event(str(event_log), {"type": "qr_scanned", "user": "PLAYER 1"})
    main.append_event(str(event_log), {"type": "team_ready", "user": "PLAYER 2"})

    client = make_client()
    login = client.post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"]})
    assert login.status_code == 200

    response = client.post("/api/admin/events", json={"limit": 10})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert len(payload["events"]) == 2


def test_admin_can_mark_event_with_session(tmp_path: Path, monkeypatch):
    event_log = tmp_path / "events.json"
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(event_log))

    event = main.append_event(str(event_log), {"type": "qr_scanned", "user": "PLAYER 1"})

    client = make_client()
    login = client.post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"]})
    assert login.status_code == 200

    response = client.post(
        "/api/admin/events/mark",
        json={"event_id": event["id"], "status": "ignored"},
    )

    assert response.status_code == 200
    assert response.json()["event"]["status"] == "ignored"

def test_player_event_sync_deduplicates_client_event_id(tmp_path: Path, monkeypatch):
    event_log = tmp_path / "events.json"
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(event_log))

    client = make_client()
    payload = {
        "user": "PLAYER 1",
        "events": [
            {
                "client_event_id": "offline-qr-001",
                "type": "qr_scanned",
                "source": "qr",
                "node_id": "node-01",
                "payload": {"physical_id": "node-01-abcd"},
            }
        ],
    }

    first = client.post("/api/events/sync", json=payload)
    second = client.post("/api/events/sync", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["events"][0]["client_event_id"] == "offline-qr-001"
    assert second.json()["events"][0]["client_event_id"] == "offline-qr-001"
    assert second.json()["events"][0]["duplicate"] is True

    events = main.list_events(str(event_log))
    qr_events = [event for event in events if event.get("type") == "qr_scanned"]
    sync_events = [event for event in events if event.get("type") == "offline_sync_received"]

    assert len(qr_events) == 1
    assert len(sync_events) == 2


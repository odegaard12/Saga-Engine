from pathlib import Path

from backend.app.storage.event_log import (
    append_event,
    list_events,
    list_pending_events,
    load_event_log,
    mark_event_status,
    normalize_event,
    normalize_event_log,
)


def test_event_log_append_and_list(tmp_path: Path):
    target = tmp_path / "events.json"

    first = append_event(
        str(target),
        {
            "type": "qr_scanned",
            "source": "qr",
            "user": "PLAYER 1",
            "node_id": "node-01",
            "payload": {"physical_id": "node-01-abcd"},
        },
    )

    second = append_event(
        str(target),
        {
            "type": "team_ready",
            "source": "player",
            "user": "PLAYER 2",
            "team_id": "team-a",
            "payload": {"window_s": 30},
        },
    )

    assert first["id"].startswith("evt_")
    assert second["id"].startswith("evt_")
    assert len(load_event_log(str(target))) == 2
    assert [event["type"] for event in list_pending_events(str(target))] == [
        "qr_scanned",
        "team_ready",
    ]


def test_event_log_filters(tmp_path: Path):
    target = tmp_path / "events.json"

    append_event(str(target), {"type": "qr_scanned", "user": "PLAYER 1"})
    append_event(str(target), {"type": "node_completed", "user": "PLAYER 2"})
    append_event(str(target), {"type": "node_completed", "user": "PLAYER 1"})

    assert len(list_events(str(target), user="PLAYER 1")) == 2
    assert len(list_events(str(target), event_type="node_completed")) == 2
    assert len(list_events(str(target), limit=1)) == 1


def test_event_log_mark_event_status(tmp_path: Path):
    target = tmp_path / "events.json"

    event = append_event(str(target), {"type": "offline_sync_received", "user": "PLAYER 1"})

    updated = mark_event_status(str(target), event["id"], "synced")

    assert updated is not None
    assert updated["status"] == "synced"
    assert "synced_at" in updated
    assert list_pending_events(str(target)) == []


def test_event_log_mark_missing_event_returns_none(tmp_path: Path):
    target = tmp_path / "events.json"

    append_event(str(target), {"type": "qr_scanned", "user": "PLAYER 1"})

    assert mark_event_status(str(target), "missing", "failed", error="not found") is None


def test_event_log_normalizes_invalid_event():
    event = normalize_event(
        {
            "id": "",
            "type": "bad",
            "status": "bad",
            "source": "bad",
            "payload": "not a dict",
        }
    )

    assert event["id"].startswith("evt_")
    assert event["type"] == "admin_action"
    assert event["status"] == "pending"
    assert event["source"] == "server"
    assert event["payload"] == {}


def test_event_log_normalizes_collection():
    events = normalize_event_log(
        [
            {"type": "qr_scanned", "status": "pending"},
            "bad",
        ]
    )

    assert len(events) == 2
    assert events[0]["type"] == "qr_scanned"
    assert events[1]["type"] == "admin_action"

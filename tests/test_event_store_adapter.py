from pathlib import Path

from backend.app.storage.event_store import (
    append_event,
    list_events,
    list_pending_events,
    mark_event_status,
    resolve_event_db_path,
    resolve_event_storage_backend,
)


def test_event_store_defaults_to_json_backend(monkeypatch, tmp_path: Path):
    monkeypatch.delenv("SAGA_STORAGE_BACKEND", raising=False)
    target = tmp_path / "events.json"

    assert resolve_event_storage_backend() == "json"
    assert resolve_event_db_path(str(target)) == str(target)

    event = append_event(str(target), {"type": "qr_scanned", "user": "PLAYER 1"})

    assert target.exists()
    assert list_events(str(target), user="PLAYER 1")[0]["id"] == event["id"]


def test_event_store_unknown_backend_falls_back_to_json(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "unknown")
    target = tmp_path / "events.json"

    assert resolve_event_storage_backend() == "json"

    append_event(str(target), {"type": "team_ready", "user": "PLAYER 1"})

    assert len(list_pending_events(str(target))) == 1


def test_event_store_uses_sqlite_backend_when_enabled(monkeypatch, tmp_path: Path):
    db = tmp_path / "saga.sqlite3"
    json_target = tmp_path / "events.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(db))

    assert resolve_event_storage_backend() == "sqlite"
    assert resolve_event_db_path(str(json_target)) == str(db)

    event = append_event(
        str(json_target),
        {
            "type": "offline_sync_received",
            "source": "offline_queue",
            "user": "PLAYER 1",
            "payload": {"event_count": 2},
        },
    )

    assert db.exists()
    assert not json_target.exists()

    listed = list_events(str(json_target), user="PLAYER 1")
    assert listed[0]["id"] == event["id"]
    assert listed[0]["payload"] == {"event_count": 2}


def test_event_store_marks_sqlite_event_status(monkeypatch, tmp_path: Path):
    db = tmp_path / "saga.sqlite3"
    json_target = tmp_path / "events.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(db))

    event = append_event(str(json_target), {"type": "qr_scanned", "user": "PLAYER 1"})

    updated = mark_event_status(str(json_target), event["id"], "synced")

    assert updated is not None
    assert updated["status"] == "synced"
    assert "synced_at" in updated
    assert list_pending_events(str(json_target)) == []


def test_event_store_marks_json_event_status(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "json")
    target = tmp_path / "events.json"

    event = append_event(str(target), {"type": "qr_scanned", "user": "PLAYER 1"})

    updated = mark_event_status(str(target), event["id"], "ignored")

    assert updated is not None
    assert updated["status"] == "ignored"

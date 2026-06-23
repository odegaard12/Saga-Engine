from __future__ import annotations

import json
from pathlib import Path

from backend.app.storage.event_store import append_event, list_events
from backend.app.storage.sqlite_store import save_sqlite_stages


def make_client():
    import main
    from fastapi.testclient import TestClient

    return TestClient(main.app)


def configure_item_requirement_test(monkeypatch, tmp_path: Path, *, consume: bool = False):
    import main

    sqlite_db = tmp_path / "saga.sqlite3"
    stages_json = tmp_path / "stages.json"
    game_json = tmp_path / "gamestate.json"
    events_json = tmp_path / "events.json"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(sqlite_db))

    stages = [
        {
            "id": "node-1",
            "title": "Node 1",
            "lat": 40.0,
            "lon": -3.0,
            "radius": 50,
            "answer": "OMEGA",
            "config": {
                "required_item_id": "runa_agua",
                "required_item_label": "Runa de agua",
                "required_item_quantity": 2,
                "required_item_consume": consume,
            },
        }
    ]

    stages_json.write_text(json.dumps(stages), encoding="utf-8")
    save_sqlite_stages(str(sqlite_db), stages)

    monkeypatch.setattr(main, "STAGES_DB", str(stages_json))
    monkeypatch.setattr(main, "GAME_DB", str(game_json))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(events_json))

    main.set_player_progress_level("PLAYER 1", 0)
    return sqlite_db


def add_inventory_event(item_id: str, quantity: int):
    import main

    append_event(
        main.EVENT_LOG_DB,
        {
            "type": "inventory_item_collected",
            "status": "synced",
            "source": "test",
            "user": "PLAYER 1",
            "team_id": "PLAYER 1",
            "node_id": "test",
            "payload": {
                "inventory_item_id": item_id,
                "inventory_label": item_id,
                "inventory_quantity": quantity,
                "inventory_action": "collected",
            },
        },
    )


def test_advance_rejects_missing_required_item(monkeypatch, tmp_path):
    configure_item_requirement_test(monkeypatch, tmp_path)

    response = make_client().post(
        "/api/advance",
        json={"user": "PLAYER 1", "code": "OMEGA"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "fail"
    assert payload["reason"] == "missing_required_item"
    assert payload["requirement"]["ok"] is False
    assert payload["requirement"]["owned"] == 0


def test_advance_accepts_when_required_item_is_present(monkeypatch, tmp_path):
    configure_item_requirement_test(monkeypatch, tmp_path)
    add_inventory_event("runa_agua", 2)

    response = make_client().post(
        "/api/advance",
        json={"user": "PLAYER 1", "code": "OMEGA"},
    )

    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["requirement"]["ok"] is True
    assert payload["requirement"]["owned"] == 2


def test_advance_consumes_required_item_when_configured(monkeypatch, tmp_path):
    import main

    configure_item_requirement_test(monkeypatch, tmp_path, consume=True)
    add_inventory_event("runa_agua", 2)

    response = make_client().post(
        "/api/advance",
        json={"user": "PLAYER 1", "code": "OMEGA"},
    )

    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["requirement"]["consume"] is True

    used = list_events(main.EVENT_LOG_DB, user="PLAYER 1", event_type="inventory_item_used")
    assert len(used) == 1
    assert used[0]["payload"]["inventory_item_id"] == "runa_agua"

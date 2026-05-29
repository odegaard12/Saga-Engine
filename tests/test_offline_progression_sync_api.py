from pathlib import Path

from fastapi.testclient import TestClient


def make_client():
    import main
    return TestClient(main.app)


def configure_offline_progression(monkeypatch, tmp_path: Path, *, require_item=False, consume=False):
    import main

    sqlite_db = tmp_path / "saga.sqlite3"

    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(sqlite_db))

    monkeypatch.setattr(main, "GAME_DB", str(tmp_path / "gamestate.json"))
    monkeypatch.setattr(main, "STAGES_DB", str(tmp_path / "stages.json"))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    monkeypatch.setattr(main, "POSITIONS_DB", str(tmp_path / "positions.json"))

    config = {
        "required_item_id": "runa_agua" if require_item else "",
        "required_item_label": "Runa de agua" if require_item else "",
        "required_item_quantity": 1,
        "required_item_consume": consume,
    }

    main.save_stages(
        main.STAGES_DB,
        [
            {
                "id": 1,
                "title": "Nodo offline",
                "content": "Completa sin cobertura",
                "lat": 40.0,
                "lon": -3.0,
                "radius": 25,
                "answer": "OMEGA",
                "minigame": {"type": "signal_hunt", "config": config},
                "config": config,
            }
        ],
    )
    main.set_player_progress_level("PLAYER 1", 0)

    return sqlite_db


def add_inventory_item(item_id: str, quantity: int = 1):
    import main
    from backend.app.storage.event_store import append_event

    append_event(
        main.EVENT_LOG_DB,
        {
            "type": "inventory_item_collected",
            "status": "synced",
            "source": "test",
            "user": "PLAYER 1",
            "team_id": "PLAYER 1",
            "payload": {
                "inventory_item_id": item_id,
                "inventory_quantity": quantity,
                "inventory_action": "collected",
            },
        },
    )


def test_sync_node_completed_advances_official_progress(monkeypatch, tmp_path):
    import main

    configure_offline_progression(monkeypatch, tmp_path)

    response = make_client().post(
        "/api/events/sync",
        json={
            "user": "PLAYER 1",
            "events": [
                {
                    "type": "node_completed",
                    "node_id": "1",
                    "payload": {"code": "OMEGA"},
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["events"][0]["status"] == "synced"
    assert main.get_player_progress_level("PLAYER 1", 0) == 1


def test_sync_node_completed_rejects_bad_code(monkeypatch, tmp_path):
    import main

    configure_offline_progression(monkeypatch, tmp_path)

    response = make_client().post(
        "/api/events/sync",
        json={
            "user": "PLAYER 1",
            "events": [
                {
                    "type": "node_completed",
                    "node_id": "1",
                    "payload": {"code": "BAD"},
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["events"][0]["status"] == "failed"
    assert main.get_player_progress_level("PLAYER 1", 0) == 0


def test_sync_node_completed_requires_item(monkeypatch, tmp_path):
    import main

    configure_offline_progression(monkeypatch, tmp_path, require_item=True)

    response = make_client().post(
        "/api/events/sync",
        json={
            "user": "PLAYER 1",
            "events": [
                {
                    "type": "node_completed",
                    "node_id": "1",
                    "payload": {"code": "OMEGA"},
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["events"][0]["status"] == "failed"
    assert main.get_player_progress_level("PLAYER 1", 0) == 0


def test_sync_node_completed_consumes_required_item(monkeypatch, tmp_path):
    import main
    from backend.app.storage.event_store import list_events

    configure_offline_progression(monkeypatch, tmp_path, require_item=True, consume=True)
    add_inventory_item("runa_agua", 1)

    response = make_client().post(
        "/api/events/sync",
        json={
            "user": "PLAYER 1",
            "events": [
                {
                    "type": "node_completed",
                    "node_id": "1",
                    "payload": {"code": "OMEGA"},
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["events"][0]["status"] == "synced"
    assert main.get_player_progress_level("PLAYER 1", 0) == 1

    used = list_events(main.EVENT_LOG_DB, user="PLAYER 1", event_type="inventory_item_used")
    assert len(used) == 1

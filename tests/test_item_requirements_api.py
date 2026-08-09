from __future__ import annotations

import json
from pathlib import Path

from backend.app.storage.event_store import append_event, list_events
from backend.app.storage.sqlite_store import save_sqlite_stages


def make_client():
    import main
    from fastapi.testclient import TestClient

    return TestClient(main.app)


def seed_player_session(client, user: str = "PLAYER 1"):
    import main

    main.clear_player_rate_limits()
    response = client.get(f"/api/game/{user.replace(' ', '%20')}")
    assert response.status_code == 200


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

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)
    response = client.post(
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

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)
    response = client.post(
        "/api/advance",
        json={"user": "PLAYER 1", "code": "OMEGA"},
    )

    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["requirement"]["ok"] is True
    assert payload["requirement"]["owned"] == 2


def configure_bare_requirements_stage(monkeypatch, tmp_path: Path):
    """Nodo cuyo requisito se declara en requirements.items SIN 'consume'.

    Es la forma en que queda un nodo editado a mano o generado por una
    herramienta. Antes reventaba con KeyError: 'consume' y /api/advance devolvía
    500; el jugador no veía error porque el cliente caía a su copia local y
    seguía jugando mientras el servidor se quedaba en el nodo anterior.
    """
    import main

    sqlite_db = tmp_path / "saga.sqlite3"
    stages_json = tmp_path / "stages.json"

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
            "requirements": {
                "items": [{"item_id": "selo", "label": "Selo", "quantity": 1}]
            },
        }
    ]

    stages_json.write_text(json.dumps(stages), encoding="utf-8")
    save_sqlite_stages(str(sqlite_db), stages)

    monkeypatch.setattr(main, "STAGES_DB", str(stages_json))
    monkeypatch.setattr(main, "GAME_DB", str(tmp_path / "gamestate.json"))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))

    main.set_player_progress_level("PLAYER 1", 0)


def test_advance_survives_requirement_without_consume_key(monkeypatch, tmp_path):
    configure_bare_requirements_stage(monkeypatch, tmp_path)

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)
    response = client.post("/api/advance", json={"user": "PLAYER 1", "code": "OMEGA"})

    # Sin el objeto: rechazo limpio, nunca un 500.
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "fail"
    assert payload["reason"] == "missing_required_item"
    assert payload["requirement"]["consume"] is False


def test_advance_accepts_requirement_without_consume_key(monkeypatch, tmp_path):
    configure_bare_requirements_stage(monkeypatch, tmp_path)
    add_inventory_event("selo", 1)

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)
    response = client.post("/api/advance", json={"user": "PLAYER 1", "code": "OMEGA"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["requirement"]["ok"] is True


def test_advance_consumes_required_item_when_configured(monkeypatch, tmp_path):
    import main

    configure_item_requirement_test(monkeypatch, tmp_path, consume=True)
    add_inventory_event("runa_agua", 2)

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)
    response = client.post(
        "/api/advance",
        json={"user": "PLAYER 1", "code": "OMEGA"},
    )

    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["requirement"]["consume"] is True

    used = list_events(main.EVENT_LOG_DB, user="PLAYER 1", event_type="inventory_item_used")
    assert len(used) == 1
    assert used[0]["payload"]["inventory_item_id"] == "runa_agua"

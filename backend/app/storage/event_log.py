"""Event log repository helpers.

The event log is the foundation for offline sync, QR/NFC physical checkpoints,
team actions, inventory changes and future SQLite-backed state.

The current implementation stores a JSON list using update_json(), so appends
use one locked read-modify-write cycle.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from backend.app.storage.json_store import load_json, update_json


VALID_EVENT_TYPES = {
    "heartbeat_received",
    "node_opened",
    "node_completed",
    "qr_scanned",
    "nfc_url_opened",
    "team_ready",
    "team_proof_created",
    "team_proof_accepted",
    "inventory_item_collected",
    "inventory_item_used",
    "offline_sync_received",
    "admin_action",
}

VALID_EVENT_STATUS = {
    "pending",
    "synced",
    "failed",
    "ignored",
}

VALID_EVENT_SOURCES = {
    "server",
    "player",
    "admin",
    "offline_queue",
    "qr",
    "nfc",
    "system",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_event_id() -> str:
    return f"evt_{uuid.uuid4().hex}"


def _as_text(value: Any, default: str = "") -> str:
    text = str(value or "").strip()
    return text or default


def _normalize_type(value: Any) -> str:
    event_type = _as_text(value, "admin_action")
    return event_type if event_type in VALID_EVENT_TYPES else "admin_action"


def _normalize_status(value: Any) -> str:
    status = _as_text(value, "pending")
    return status if status in VALID_EVENT_STATUS else "pending"


def _normalize_source(value: Any) -> str:
    source = _as_text(value, "server")
    return source if source in VALID_EVENT_SOURCES else "server"


def _normalize_payload(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def normalize_event(raw: Any) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}

    event_id = _as_text(raw.get("id")) or new_event_id()
    created_at = _as_text(raw.get("created_at")) or now_iso()

    event = {
        "id": event_id,
        "type": _normalize_type(raw.get("type")),
        "status": _normalize_status(raw.get("status")),
        "source": _normalize_source(raw.get("source")),
        "created_at": created_at,
        "user": _as_text(raw.get("user")),
        "team_id": _as_text(raw.get("team_id")),
        "node_id": _as_text(raw.get("node_id")),
        "payload": _normalize_payload(raw.get("payload")),
    }

    if raw.get("synced_at"):
        event["synced_at"] = _as_text(raw.get("synced_at"))

    if raw.get("error"):
        event["error"] = _as_text(raw.get("error"))

    return event


def normalize_event_log(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []

    return [normalize_event(item) for item in raw]


def load_event_log(path: str) -> list[dict[str, Any]]:
    return normalize_event_log(load_json(path, []))


def append_event(path: str, event: dict[str, Any]) -> dict[str, Any]:
    normalized_event = normalize_event(event)

    def updater(events):
        events = normalize_event_log(events)
        events.append(normalized_event)
        return events

    update_json(path, [], updater)
    return normalized_event


def list_events(
    path: str,
    *,
    status: str | None = None,
    user: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    events = load_event_log(path)

    if status:
        events = [event for event in events if event.get("status") == status]

    if user:
        user_key = _as_text(user)
        events = [event for event in events if event.get("user") == user_key]

    if event_type:
        events = [event for event in events if event.get("type") == event_type]

    if limit is not None:
        events = events[-max(0, int(limit)):]

    return events


def list_pending_events(path: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    return list_events(path, status="pending", limit=limit)


def mark_event_status(
    path: str,
    event_id: str,
    status: str,
    *,
    error: str | None = None,
) -> dict[str, Any] | None:
    event_key = _as_text(event_id)
    next_status = _normalize_status(status)
    updated_event: dict[str, Any] | None = None

    def updater(events):
        nonlocal updated_event

        normalized = normalize_event_log(events)
        for event in normalized:
            if event.get("id") != event_key:
                continue

            event["status"] = next_status

            if next_status == "synced":
                event["synced_at"] = now_iso()

            if error:
                event["error"] = _as_text(error)

            updated_event = event
            break

        return normalized

    update_json(path, [], updater)
    return updated_event

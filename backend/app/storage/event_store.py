"""Event storage adapter.

JSON remains the default event backend.

When SAGA_STORAGE_BACKEND=sqlite, event writes/reads use the SQLite
foundation. This lets SAGA migrate the high-churn event log first without
changing route code or frontend behavior.
"""

from __future__ import annotations

import os
from typing import Any

from backend.app.storage.event_log import (
    append_event as append_json_event,
    list_events as list_json_events,
    list_pending_events as list_json_pending_events,
    mark_event_status as mark_json_event_status,
)
from backend.app.storage.sqlite_store import (
    append_sqlite_event,
    list_sqlite_events,
    mark_sqlite_event_status,
    resolve_sqlite_path,
)


VALID_EVENT_BACKENDS = {"json", "sqlite"}


def resolve_event_storage_backend() -> str:
    backend = str(os.getenv("SAGA_STORAGE_BACKEND") or "json").strip().lower()
    return backend if backend in VALID_EVENT_BACKENDS else "json"


def resolve_event_db_path(json_event_path: str) -> str:
    backend = resolve_event_storage_backend()

    if backend != "sqlite":
        return json_event_path

    explicit = str(os.getenv("SAGA_SQLITE_DB") or "").strip()
    if explicit:
        return explicit

    data_dir = os.path.dirname(os.path.abspath(json_event_path)) or "."
    return resolve_sqlite_path(data_dir)


def append_event(path: str, event: dict[str, Any]) -> dict[str, Any]:
    if resolve_event_storage_backend() == "sqlite":
        return append_sqlite_event(resolve_event_db_path(path), event)
    return append_json_event(path, event)


def list_events(
    path: str,
    *,
    status: str | None = None,
    user: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    if resolve_event_storage_backend() == "sqlite":
        return list_sqlite_events(
            resolve_event_db_path(path),
            status=status,
            user=user,
            event_type=event_type,
            limit=limit,
        )

    return list_json_events(
        path,
        status=status,
        user=user,
        event_type=event_type,
        limit=limit,
    )


def list_pending_events(path: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    if resolve_event_storage_backend() == "sqlite":
        return list_sqlite_events(
            resolve_event_db_path(path),
            status="pending",
            limit=limit,
        )

    return list_json_pending_events(path, limit=limit)


def mark_event_status(
    path: str,
    event_id: str,
    status: str,
    *,
    error: str | None = None,
) -> dict[str, Any] | None:
    if resolve_event_storage_backend() == "sqlite":
        return mark_sqlite_event_status(
            resolve_event_db_path(path),
            event_id,
            status,
            error=error,
        )

    return mark_json_event_status(path, event_id, status, error=error)

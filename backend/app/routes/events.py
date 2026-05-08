"""Route module extracted from main.py.

This module intentionally delegates to helpers/state still defined in main.py.
It is a mechanical route split, not a behavior rewrite.
"""

from __future__ import annotations

from fastapi import APIRouter

import main as _main

globals().update({key: value for key, value in vars(_main).items() if key != "app"})

router = APIRouter()

@router.post("/api/events/sync")
async def sync_player_events(request: Request):
    data = await request.json()
    user = _as_str(data.get("user")).strip()

    profile = resolve_known_player_profile(user)
    if not profile:
        raise HTTPException(status_code=403, detail="unknown player")

    events = data.get("events")
    if not isinstance(events, list):
        raise HTTPException(status_code=400, detail="events must be a list")

    if len(events) > 100:
        raise HTTPException(status_code=400, detail="too many events")

    stored = []
    for raw_event in events:
        normalized = normalize_player_event(raw_event, user, profile)
        stored.append(append_event(_main.EVENT_LOG_DB, normalized))

    append_event(
        _main.EVENT_LOG_DB,
        {
            "type": "offline_sync_received",
            "status": "synced",
            "source": "server",
            "user": user,
            "team_id": _as_str(profile.get("id")),
            "payload": {
                "event_count": len(stored),
            },
        },
    )

    return {
        "status": "ok",
        "accepted": len(stored),
        "events": [
            {
                "id": event.get("id"),
                "type": event.get("type"),
                "status": event.get("status"),
            }
            for event in stored
        ],
    }

@router.post("/api/admin/events")
async def admin_events(request: Request):
    data = await request.json()

    if not admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    limit = data.get("limit", 100)
    try:
        limit = max(1, min(500, int(limit)))
    except (TypeError, ValueError):
        limit = 100

    status = sanitize_event_text(data.get("status"), 80) or None
    user = sanitize_event_text(data.get("user"), 120) or None
    event_type = sanitize_event_text(data.get("type"), 80) or None

    return {
        "status": "ok",
        "events": list_events(
            _main.EVENT_LOG_DB,
            status=status,
            user=user,
            event_type=event_type,
            limit=limit,
        ),
    }

@router.post("/api/admin/events/mark")
async def admin_mark_event(request: Request):
    data = await request.json()

    if not admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    event_id = sanitize_event_text(data.get("event_id"), 120)
    next_status = sanitize_event_text(data.get("status"), 40)

    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required")

    updated = mark_event_status(
        _main.EVENT_LOG_DB,
        event_id,
        next_status,
        error=sanitize_event_text(data.get("error"), 300) or None,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="event not found")

    return {
        "status": "ok",
        "event": updated,
    }




ROUTE_FUNCTIONS = ['sync_player_events', 'admin_events', 'admin_mark_event']

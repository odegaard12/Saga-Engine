"""Sanear y normalizar los eventos que manda el móvil.

La parte pura de la cola de eventos: qué tipos existen, cómo se recorta un
payload que puede venir de un cliente hostil o simplemente viejo, y cómo se
convierte en el evento que se guarda. Movido de main.py para seguir bajando
sus símbolos de superficie (ver docs/plan-de-mejora.md, «Deuda que no corre
prisa»).

Deliberadamente NO se lleva `apply_synced_player_event` ni
`find_existing_player_client_event`: esas dos sí tocan datos -avanzan el
progreso de verdad, deciden qué es un duplicado- y son la parte más
sensible de toda la sincronización offline. Partir lo puro de lo que muta
estado es la misma norma que ya se siguió al no partir `set_player_progress_level`
en player_timers.py.
"""
from fastapi import HTTPException

from backend.app.runtime.minigames import _as_str

PLAYER_EVENT_TYPES = {
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
}

EVENT_PAYLOAD_MAX_KEYS = 32
EVENT_PAYLOAD_MAX_TEXT_LENGTH = 500


def sanitize_event_text(value, max_length=EVENT_PAYLOAD_MAX_TEXT_LENGTH):
    text = _as_str(value).strip()
    if len(text) > max_length:
        return text[:max_length]
    return text


def sanitize_event_payload(value):
    if not isinstance(value, dict):
        return {}

    clean = {}
    for index, (key, raw_value) in enumerate(value.items()):
        if index >= EVENT_PAYLOAD_MAX_KEYS:
            break

        clean_key = sanitize_event_text(key, 80)
        if not clean_key:
            continue

        if isinstance(raw_value, bool) or raw_value is None:
            clean[clean_key] = raw_value
        elif isinstance(raw_value, (int, float)):
            clean[clean_key] = raw_value
        elif isinstance(raw_value, list):
            clean[clean_key] = [
                sanitize_event_text(item)
                for item in raw_value[:20]
            ]
        elif isinstance(raw_value, dict):
            nested = {}
            for nested_index, (nested_key, nested_value) in enumerate(raw_value.items()):
                if nested_index >= 20:
                    break
                nested_clean_key = sanitize_event_text(nested_key, 80)
                if nested_clean_key:
                    nested[nested_clean_key] = sanitize_event_text(nested_value)
            clean[clean_key] = nested
        else:
            clean[clean_key] = sanitize_event_text(raw_value)

    return clean


def normalize_player_event(raw_event, user, profile):
    raw_event = raw_event if isinstance(raw_event, dict) else {}
    event_type = sanitize_event_text(raw_event.get("type"), 80)

    if event_type not in PLAYER_EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"unsupported event type: {event_type or 'missing'}")

    node_id = sanitize_event_text(raw_event.get("node_id"), 120)
    team_id = sanitize_event_text(raw_event.get("team_id") or profile.get("id"), 120)
    client_event_id = sanitize_event_text(raw_event.get("client_event_id"), 160)

    return {
        "type": event_type,
        "status": "pending",
        "source": sanitize_event_text(raw_event.get("source") or "offline_queue", 80),
        "user": user,
        "team_id": team_id,
        "node_id": node_id,
        "client_event_id": client_event_id,
        "payload": sanitize_event_payload(raw_event.get("payload")),
    }


def event_payload_code(payload):
    payload = payload if isinstance(payload, dict) else {}
    for key in ("code", "manual_code", "answer", "raw_value"):
        value = _as_str(payload.get(key)).strip()
        if value:
            return value
    return ""

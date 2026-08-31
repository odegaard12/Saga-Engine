"""El resumen que ve el panel: un nodo o un jugador, aplanados para la tabla.

`GET /api/admin/react-overview` necesita, por cada nodo y cada jugador, una
ficha ligera y ya normalizada -no el documento entero de la misión-. Movido
de main.py para seguir bajando sus símbolos de superficie (ver
docs/plan-de-mejora.md, «Deuda que no corre prisa»).

Puro por diseño: no lee ni escribe nada, sólo aplana lo que ya le pasan.
"""
from backend.app.runtime.core_engine import normalize_stage, preserve_physical_stage_fields
from backend.app.runtime.minigames import (
    MINIGAME_SPECS,
    SUPPORTED_MINIGAME_TYPES,
    _as_str,
    normalize_minigame_config,
)


def admin_stage_summary(stage, index):
    raw = stage if isinstance(stage, dict) else {}

    # get_runtime_stages() returns normalized runtime nodes.
    # Raw admin stages may still come through in tests, so support both shapes.
    node = raw if isinstance(raw, dict) and raw.get("version") == 2 else normalize_stage(raw)

    presentation = node.get("presentation") if isinstance(node.get("presentation"), dict) else {}
    location = node.get("location") if isinstance(node.get("location"), dict) else {}
    entry = node.get("entry") if isinstance(node.get("entry"), dict) else {}
    interaction = node.get("interaction") if isinstance(node.get("interaction"), dict) else {}
    messages = node.get("messages") if isinstance(node.get("messages"), dict) else {}

    raw_minigame = raw.get("minigame") if isinstance(raw.get("minigame"), dict) else {}

    family_type = _as_str(
        interaction.get("type")
        or raw_minigame.get("type")
        or raw.get("type")
        or "signal_hunt"
    ).strip().lower() or "signal_hunt"

    if family_type not in SUPPORTED_MINIGAME_TYPES:
        family_type = "signal_hunt"

    raw_config = (
        interaction.get("config")
        if isinstance(interaction.get("config"), dict)
        else raw_minigame.get("config")
        if isinstance(raw_minigame.get("config"), dict)
        else raw.get("config")
        if isinstance(raw.get("config"), dict)
        else {}
    )
    config = normalize_minigame_config(family_type, raw_config)

    label = (
        _as_str(raw_minigame.get("label")).strip()
        or MINIGAME_SPECS.get(family_type, {}).get("label")
        or family_type.replace("_", " ").title()
    )

    title = _as_str(
        presentation.get("title")
        or raw.get("title")
        or f"NODE {index + 1}"
    ).strip()

    content = _as_str(
        presentation.get("content")
        or raw.get("content")
        or ""
    ).strip()

    lat = location.get("lat")
    if lat is None:
        lat = raw.get("lat")

    lon = location.get("lon")
    if lon is None:
        lon = raw.get("lon")

    radius = location.get("radius_m")
    if radius is None:
        radius = raw.get("radius", 50)

    entry_mode = _as_str(
        entry.get("mode")
        or raw.get("entry_mode")
        or "gps"
    ).strip().lower() or "gps"

    require_proximity = entry.get("require_proximity")
    if require_proximity is None:
        require_proximity = raw.get("require_proximity", entry_mode != "free")

    hint = _as_str(
        messages.get("hint")
        or raw.get("hint")
        or ""
    ).strip()

    gps_unavailable = _as_str(
        messages.get("gps_unavailable")
        or raw.get("gps_unavailable_message")
        or ""
    ).strip()

    locked = _as_str(
        messages.get("locked")
        or raw.get("locked_message")
        or ""
    ).strip()

    summary = {
        "id": raw.get("id", index),
        "index": index,
        "title": title,
        "type": family_type,
        "label": label,
        "lat": lat,
        "lon": lon,
        "radius": radius,
        "entry_mode": entry_mode,
        "require_proximity": bool(require_proximity),
        "has_hint": bool(hint),
        "has_manual_fallback": bool(_as_str(raw.get("answer") or raw.get("rune") or "").strip()),
        "content": content,
        "objective": _as_str(config.get("objective") or "").strip(),
        "config_summary": sorted(str(key) for key in config.keys())[:12],
        "config": config,
        "messages": {
            "hint": hint,
            "gps_unavailable": gps_unavailable,
            "locked": locked,
        },
    }

    return preserve_physical_stage_fields(stage, summary)


def admin_profile_summary(profile, gamestate, positions, inventory_state=None):
    if inventory_state is None:
        inventory_state = {}
    profile = profile or {}
    profile_id = str(profile.get("id") or profile.get("display_name") or "")
    raw_state = gamestate.get(profile_id, {}) if isinstance(gamestate, dict) else {}
    pos = positions.get(profile_id, {}) if isinstance(positions, dict) else {}

    if isinstance(raw_state, dict):
        state = raw_state
        level = state.get("level", 0)
        finished = bool(state.get("finished", False))
    else:
        state = {}
        try:
            level = int(raw_state)
        except Exception:
            level = 0
        finished = False

    if not isinstance(pos, dict):
        pos = {}

    return {
        "id": profile_id,
        "display_name": profile.get("display_name") or profile_id,
        "mode": profile.get("mode") or "solo",
        "status": profile.get("status") or "active",
        "level": level,
        "finished": finished,
        "presence": pos.get("presence") or state.get("presence") or "unknown",
        "gps_status": pos.get("gps_status") or state.get("gps_status") or "unknown",
        "lat": pos.get("lat"),
        "lon": pos.get("lon"),
        "last_seen": pos.get("last_seen") or pos.get("ts") or state.get("last_seen"),
        "inventory_snapshot": inventory_state.get(profile_id, {}),
    }

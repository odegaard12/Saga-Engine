import time
from backend.app.runtime.minigames import (
    SUPPORTED_MINIGAME_TYPES,
    _as_str,
    _as_bool,
    _as_float,
    _as_radius,
    _clean_code,
    normalize_minigame_config,
    validate_minigame_config,
)

MINIGAME_OK_CODE = "OK"

SAGA_PHYSICAL_STAGE_FIELDS = (
    "physical_node_kind",
    "physical_item_kind",
    "physical_item_id",
    "physical_item_label",
    "qr_payload",
    "physical_qr",
    "is_map_collectible",
)

def _positive_int(value, default=1):
    try:
        parsed = int(value)
        if parsed > 0:
            return parsed
    except (ValueError, TypeError):
        pass
    return default

def read_stage_item_requirement(raw_stage):
    req = raw_stage.get("requirements")
    if isinstance(req, dict):
        items = req.get("items")
        if isinstance(items, list) and items:
            return items[0]
            
    config = raw_stage.get("config", {}) if isinstance(raw_stage.get("config"), dict) else {}
    req_item = raw_stage.get("required_item_id") or raw_stage.get("requiredItemId") or config.get("required_item_id")
    if req_item:
        return {
            "item_id": str(req_item).strip(),
            "quantity": _positive_int(raw_stage.get("required_item_quantity") or config.get("required_item_quantity"), 1),
            "consume": bool(raw_stage.get("consume_required_item", False) or config.get("required_item_consume", False)),
            "label": str(raw_stage.get("required_item_label") or config.get("required_item_label") or req_item).strip()
        }
    return None

def _build_success_conditions(raw):
    conditions = [{"kind": "minigame_ok", "value": MINIGAME_OK_CODE}]

    answer = _clean_code(raw.get("answer"))
    rune = _clean_code(raw.get("rune"))

    if answer:
        conditions.append({"kind": "answer", "value": answer})
    if rune:
        conditions.append({"kind": "rune", "value": rune})

    return conditions

def preserve_physical_stage_fields(raw_stage, node):
    if not isinstance(raw_stage, dict) or not isinstance(node, dict):
        return node

    for key in SAGA_PHYSICAL_STAGE_FIELDS:
        if key in raw_stage:
            node[key] = raw_stage[key]

    return node

def normalize_stage(raw):
    raw = raw or {}

    cfg = raw.get("config")
    if not isinstance(cfg, dict):
        cfg = {}

    raw_entry = raw.get("entry")
    if not isinstance(raw_entry, dict):
        raw_entry = {}

    raw_messages = raw.get("messages")
    if not isinstance(raw_messages, dict):
        raw_messages = {}

    raw_debug = raw.get("debug")
    if not isinstance(raw_debug, dict):
        raw_debug = {}

    entry_mode = _as_str(
        raw_entry.get("mode") or raw.get("entry_mode") or "gps"
    ).strip().lower() or "gps"

    require_proximity = _as_bool(
        raw_entry.get("require_proximity", raw.get("require_proximity")),
        default=(entry_mode != "free")
    )

    raw_minigame = raw.get("minigame")
    if not isinstance(raw_minigame, dict):
        raw_minigame = {}

    raw_interaction_type = _as_str(
        raw_minigame.get("type") or raw.get("type")
    ).strip().lower()

    interaction_type_fallback_reason = ""
    if not raw_interaction_type:
        interaction_type = "signal_hunt"
        interaction_type_fallback_reason = "missing_minigame_type"
    elif raw_interaction_type not in SUPPORTED_MINIGAME_TYPES:
        interaction_type = "signal_hunt"
        interaction_type_fallback_reason = f"unsupported_minigame_type:{raw_interaction_type}"
    else:
        interaction_type = raw_interaction_type

    raw_minigame_config = raw_minigame.get("config")
    if not isinstance(raw_minigame_config, dict):
        raw_minigame_config = None

    interaction_config = normalize_minigame_config(
        interaction_type,
        raw_minigame_config if raw_minigame_config is not None else cfg
    )

    item_requirement = read_stage_item_requirement(raw)

    node = {
        "id": raw.get("id"),
        "version": 2,
        "enabled": _as_bool(raw.get("enabled", True), True),
        "presentation": {
            "title": _as_str(raw.get("title")).strip(),
            "content": _as_str(raw.get("content")).strip(),
        },
        "location": {
            "lat": _as_float(raw.get("lat")),
            "lon": _as_float(raw.get("lon")),
            "radius_m": _as_radius(raw.get("radius", 0), 0),
        },
        "entry": {
            "mode": entry_mode,
            "require_proximity": require_proximity,
            "allow_debug_bypass": _as_bool(
                raw_entry.get("allow_debug_bypass", raw.get("allow_debug_bypass")),
                True
            ),
            "allow_manual_fallback_without_gps": _as_bool(
                raw_entry.get(
                    "allow_manual_fallback_without_gps",
                    raw.get("allow_manual_fallback_without_gps")
                ),
                True
            ),
        },
        "interaction": {
            "type": interaction_type,
            "config": interaction_config,
        },
        "success": {
            "mode": "any_of",
            "conditions": _build_success_conditions(raw),
            "case_sensitive": False,
        },
        "requirements": {
            "items": [item_requirement] if item_requirement else [],
        },
        "messages": {
            "locked": _as_str(
                raw_messages.get("locked") or raw.get("locked_message")
            ).strip(),
            "gps_unavailable": _as_str(
                raw_messages.get("gps_unavailable") or raw.get("gps_unavailable_message")
            ).strip(),
            "hint": _as_str(
                raw_messages.get("hint") or raw.get("hint")
            ).strip(),
        },
        "debug": {
            "force_unlock": _as_bool(
                raw_debug.get("force_unlock", raw.get("force_unlock")),
                False
            ),
            "raw_interaction_type": raw_interaction_type,
            "interaction_type_fallback_reason": interaction_type_fallback_reason,
        },
    }

    return preserve_physical_stage_fields(raw, node)

def stage_has_manual_fallback(node):
    for condition in node["success"]["conditions"]:
        if condition.get("kind") in {"answer", "rune"} and _clean_code(condition.get("value")):
            return True
    return False

def evaluate_entry(node, distance_m=None, gps_available=True, debug_enabled=False):
    entry = node.get("entry") or {}
    debug = node.get("debug") or {}
    location = node.get("location") or {}

    if not node.get("enabled", True):
        return {
            "can_enter": False,
            "can_submit_manual_code": False,
            "reason": "disabled",
        }

    if debug_enabled and (entry.get("allow_debug_bypass") or debug.get("force_unlock")):
        return {
            "can_enter": True,
            "can_submit_manual_code": True,
            "reason": "debug_bypass",
        }

    require_proximity = bool(entry.get("require_proximity", True))
    mode = _as_str(entry.get("mode") or "gps").strip().lower()

    if mode == "free" or not require_proximity:
        return {
            "can_enter": True,
            "can_submit_manual_code": True,
            "reason": "free_entry",
        }

    if not gps_available:
        return {
            "can_enter": False,
            "can_submit_manual_code": bool(entry.get("allow_manual_fallback_without_gps")) and stage_has_manual_fallback(node),
            "reason": "gps_unavailable",
        }

    if distance_m is None:
        return {
            "can_enter": False,
            "can_submit_manual_code": stage_has_manual_fallback(node),
            "reason": "distance_unknown",
        }

    radius = location.get("radius_m") or 0
    if distance_m <= radius:
        return {
            "can_enter": True,
            "can_submit_manual_code": True,
            "reason": "within_radius",
        }

    return {
        "can_enter": False,
        "can_submit_manual_code": stage_has_manual_fallback(node),
        "reason": "out_of_range",
    }

def validate_stage(raw_stage, idx=None):
    node = normalize_stage(raw_stage)
    errors = []

    def add(field, detail):
        errors.append({
            "index": idx,
            "field": field,
            "detail": detail,
        })

    title = node["presentation"]["title"]
    if not title:
        add("title", "title is required")

    raw_minigame_for_type = raw_stage.get("minigame") if isinstance(raw_stage, dict) else {}
    if not isinstance(raw_minigame_for_type, dict):
        raw_minigame_for_type = {}

    raw_type_for_validation = _as_str(
        raw_minigame_for_type.get("type") or raw_stage.get("type")
    ).strip().lower()

    if not raw_type_for_validation:
        add("type", "minigame type is required")
    elif raw_type_for_validation not in SUPPORTED_MINIGAME_TYPES:
        add("type", f"unsupported minigame type: {raw_type_for_validation}")

    raw_minigame = raw_stage.get("minigame") if isinstance(raw_stage, dict) else {}
    if not isinstance(raw_minigame, dict):
        raw_minigame = {}

    raw_interaction_type = _as_str(
        raw_minigame.get("type") or (raw_stage.get("type") if isinstance(raw_stage, dict) else "")
    ).strip().lower()
    interaction_type = raw_interaction_type or node["interaction"]["type"]
    if interaction_type not in SUPPORTED_MINIGAME_TYPES:
        add("type", f"unsupported minigame type: {interaction_type}")

    raw_config = raw_minigame.get("config") if isinstance(raw_minigame.get("config"), dict) else (
        raw_stage.get("config") if isinstance(raw_stage, dict) else {}
    )
    if raw_config is not None and not isinstance(raw_config, dict):
        add("config", "config must be an object")
        raw_config = {}

    for field, detail in validate_minigame_config(node["interaction"]["type"], raw_config):
        add(field, detail)

    entry_mode = node["entry"]["mode"]
    if entry_mode not in {"gps", "free"}:
        add("entry.mode", f"unsupported entry mode: {entry_mode}")

    location = node["location"]
    if node["entry"]["mode"] == "gps" and node["entry"]["require_proximity"]:
        if location["lat"] is None:
            add("lat", "lat is required for gps entry")
        if location["lon"] is None:
            add("lon", "lon is required for gps entry")
        if location["radius_m"] is None or location["radius_m"] <= 0:
            add("radius", "radius must be > 0 for gps entry")

    conditions = node["success"]["conditions"]
    if not isinstance(conditions, list) or not conditions:
        add("success.conditions", "at least one success condition is required")

    for i, condition in enumerate(conditions):
        kind = _as_str(condition.get("kind")).strip()
        value = _clean_code(condition.get("value"))

        if kind not in {"minigame_ok", "answer", "rune"}:
            add(f"success.conditions[{i}].kind", f"unsupported success condition kind: {kind}")
        if not value:
            add(f"success.conditions[{i}].value", "success condition value is required")

    return errors

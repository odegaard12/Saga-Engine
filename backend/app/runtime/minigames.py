"""Runtime helpers for SAGA family-native minigames.

This module intentionally contains pure helpers only. FastAPI routes stay in
main.py for now; later PRs can move routers after contract tests exist.
"""

MINIGAME_OK_CODE = "OK"

SUPPORTED_MINIGAME_TYPES = {
    "circuit_matrix",
    "bearing_hunt",
    "signal_hunt",
}

def _as_str(value, default=""):
    if value is None:
        return default
    return str(value)

def _clean_code(value):
    return _as_str(value).strip().upper()

def _as_float(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default

def _as_radius(value, default=0):
    num = _as_float(value, default)
    if num is None:
        return default
    if float(num).is_integer():
        return int(num)
    return num

def _as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


MINIGAME_SPECS = {
    "circuit_matrix": {"label": "Circuit Matrix"},
    "bearing_hunt": {"label": "Bearing Hunt"},
    "signal_hunt": {"label": "Signal Hunt"},
}

def _clamp_int(value, default, minimum=None, maximum=None):
    num = _as_float(value, default)
    try:
        out = int(round(float(num)))
    except Exception:
        out = int(default)
    if minimum is not None:
        out = max(int(minimum), out)
    if maximum is not None:
        out = min(int(maximum), out)
    return out

def _coerce_binary_flag(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(int(value))
    text = _as_str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return None

def _normalize_string_list(value, fallback, allowed=None, min_items=1, max_items=None, uppercase=True):
    if not isinstance(value, list):
        return list(fallback)
    allowed_set = set(allowed) if allowed else None
    items = []
    for item in value:
        text = _as_str(item).strip()
        if uppercase:
            text = text.upper()
        if not text:
            continue
        if allowed_set and text not in allowed_set:
            continue
        items.append(text)
    if max_items is not None:
        items = items[:max_items]
    if len(items) < min_items:
        return list(fallback)
    return items

def _normalize_frequency_label(value, default="104.6"):
    text = _as_str(value).strip().lower().replace("mhz", "").strip()
    num = _as_float(text, None)
    if num is None:
        num = _as_float(default, 104.6)
    return f"{float(num):.1f}"

def _normalize_degree_label(value, default="135°"):
    text = _as_str(value).strip().upper().replace("°", "").strip()
    num = _as_float(text, None)
    if num is None:
        text = _as_str(default).strip().upper().replace("°", "").strip()
        num = _as_float(text, 135)
    return f"{int(round(float(num))) % 360}°"

def get_minigame_spec(minigame_type):
    normalized = _as_str(minigame_type).strip().lower()
    if normalized not in MINIGAME_SPECS:
        normalized = "signal_hunt"
    return MINIGAME_SPECS[normalized]

def normalize_minigame_config(minigame_type, raw_cfg):
    raw = raw_cfg if isinstance(raw_cfg, dict) else {}
    normalized_type = _as_str(minigame_type).strip().lower()
    if normalized_type not in SUPPORTED_MINIGAME_TYPES:
        normalized_type = "signal_hunt"

    if normalized_type == "circuit_matrix":
        out = {
            "objective": _as_str(raw.get("objective") or "path_restore").strip().lower() or "path_restore",
            "grid_cols": _clamp_int(raw.get("grid_cols"), 5, 2, 8),
            "grid_rows": _clamp_int(raw.get("grid_rows"), 5, 2, 8),
            "difficulty": _clamp_int(raw.get("difficulty"), 2, 1, 5),
            "max_moves": _clamp_int(raw.get("max_moves"), 0, 0) or None,
            "max_time_ms": _clamp_int(raw.get("max_time_ms"), 0, 0) or None,
            "allow_rotate": _as_bool(raw.get("allow_rotate"), True),
            "allow_toggle": _as_bool(raw.get("allow_toggle"), True),
            "allow_swap": _as_bool(raw.get("allow_swap"), False),
            "start_nodes": raw.get("start_nodes") if isinstance(raw.get("start_nodes"), list) else [],
            "end_nodes": raw.get("end_nodes") if isinstance(raw.get("end_nodes"), list) else [],
            "target_pattern": raw.get("target_pattern") if isinstance(raw.get("target_pattern"), list) else [],
            "blocked_cells": raw.get("blocked_cells") if isinstance(raw.get("blocked_cells"), list) else [],
            "hint_mode": _as_str(raw.get("hint_mode") or "light").strip().lower() or "light",
            "auto_check": _as_bool(raw.get("auto_check"), True),
            "success_animation": _as_str(raw.get("success_animation") or "restore").strip().lower() or "restore",
        }
        if raw.get("seed") not in (None, ""):
            out["seed"] = _as_str(raw.get("seed")).strip()
        return out

    if normalized_type == "bearing_hunt":
        target_sequence = raw.get("target_sequence_deg")
        false_targets = raw.get("false_targets")

        out = {
            "objective": _as_str(raw.get("objective") or "single_lock").strip().lower() or "single_lock",
            "target_bearing_deg": _as_float(raw.get("target_bearing_deg"), 90),
            "target_sequence_deg": target_sequence if isinstance(target_sequence, list) else [],
            "sector_start_deg": _as_float(raw.get("sector_start_deg"), None),
            "sector_end_deg": _as_float(raw.get("sector_end_deg"), None),
            "tolerance_deg": _clamp_int(raw.get("tolerance_deg"), 12, 1, 90),
            "hold_ms": _clamp_int(raw.get("hold_ms"), 1200, 100),
            "phases": _clamp_int(raw.get("phases"), 1, 1, 10),
            "timeout_ms": _clamp_int(raw.get("timeout_ms"), 0, 0) or None,
            "require_stable_orientation": _as_bool(raw.get("require_stable_orientation"), True),
            "stability_window_ms": _clamp_int(raw.get("stability_window_ms"), 800, 100),
            "feedback_mode": _as_str(raw.get("feedback_mode") or "mixed").strip().lower() or "mixed",
            "noise_level": _clamp_int(raw.get("noise_level"), 1, 0, 3),
            "false_targets": false_targets if isinstance(false_targets, list) else [],
            "show_numeric_bearing": _as_bool(raw.get("show_numeric_bearing"), False),
            "show_compass_ring": _as_bool(raw.get("show_compass_ring"), True),
            "allow_recenter": _as_bool(raw.get("allow_recenter"), True),
        }
        return out

    if normalized_type == "signal_hunt":
        false_peaks = raw.get("false_peaks")
        dead_zones = raw.get("dead_zones")

        out = {
            "objective": _as_str(raw.get("objective") or "proximity_lock").strip().lower() or "proximity_lock",
            "source_lat": _as_float(raw.get("source_lat"), None),
            "source_lon": _as_float(raw.get("source_lon"), None),
            "source_radius_m": _as_float(raw.get("source_radius_m"), 20),
            "lock_threshold": _clamp_int(raw.get("lock_threshold"), 85, 1, 100),
            "hold_ms": _clamp_int(raw.get("hold_ms"), 1500, 100),
            "max_signal": _clamp_int(raw.get("max_signal"), 100, 1, 100),
            "noise_floor": _clamp_int(raw.get("noise_floor"), 4, 0, 100),
            "jitter": _clamp_int(raw.get("jitter"), 1, 0, 100),
            "decay_curve": _as_str(raw.get("decay_curve") or "smooth").strip().lower() or "smooth",
            "timeout_ms": _clamp_int(raw.get("timeout_ms"), 0, 0) or None,
            "update_rate_ms": _clamp_int(raw.get("update_rate_ms"), 500, 100),
            "use_audio": _as_bool(raw.get("use_audio"), False),
            "use_vibration": _as_bool(raw.get("use_vibration"), True),
            "use_direction_hint": _as_bool(raw.get("use_direction_hint"), False),
            "false_peaks": false_peaks if isinstance(false_peaks, list) else [],
            "dead_zones": dead_zones if isinstance(dead_zones, list) else [],
        }
        return out

    return {}

def validate_minigame_config(minigame_type, raw_cfg):
    raw = raw_cfg if isinstance(raw_cfg, dict) else {}
    normalized_type = _as_str(minigame_type).strip().lower()
    errors = []

    def add(field, detail):
        errors.append((field, detail))

    return errors

def build_stage_minigame_runtime(node):
    interaction = node.get("interaction") or {}
    minigame_type = _as_str(interaction.get("type") or "signal_hunt").strip().lower() or "signal_hunt"
    if minigame_type not in SUPPORTED_MINIGAME_TYPES:
        minigame_type = "signal_hunt"
    spec = get_minigame_spec(minigame_type)
    config = normalize_minigame_config(minigame_type, interaction.get("config") or {})
    return {
        "type": minigame_type,
        "label": spec.get("label") or minigame_type.replace("_", " ").title(),
        "version": "v1",
        "config": config,
    }

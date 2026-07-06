"""Runtime helpers for SAGA family-native minigames.

This module intentionally contains pure helpers only. FastAPI routes stay in
main.py for now; later PRs can move routers after contract tests exist.
"""

MINIGAME_OK_CODE = "OK"

SUPPORTED_MINIGAME_TYPES = {
    "circuit_matrix",
    "bearing_hunt",
    "signal_hunt",
    "motion_challenge",
    "audio_challenge",
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
    "motion_challenge": {"label": "Motion Challenge"},
    "audio_challenge": {"label": "Audio Challenge"},
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


CIRCUIT_OBJECTIVES = {
    "path_restore",
    "power_balance",
    "switch_logic",
    "signal_route",
}

CIRCUIT_PATTERN_MODES = {
    "random_each_game",
    "fixed",
}

CIRCUIT_DIFFICULTIES = {
    "easy",
    "normal",
    "hard",
}


def _normalize_circuit_difficulty(value):
    if isinstance(value, str):
        text = value.strip().lower()

        if text in CIRCUIT_DIFFICULTIES:
            return text

    return _clamp_int(value, 2, 1, 5)


def _normalize_circuit_path_cells(value, rows, cols):
    if not isinstance(value, list):
        return []

    if len(value) < 4:
        return []

    cells = []
    seen = set()
    previous = None
    maximum = max(1, int(rows) * int(cols))

    if len(value) > maximum:
        return []

    for item in value:
        text = _as_str(item).strip()
        parts = text.split(":")

        if len(parts) != 2:
            return []

        try:
            row = int(parts[0])
            col = int(parts[1])
        except (TypeError, ValueError):
            return []

        if row < 0 or row >= rows:
            return []

        if col < 0 or col >= cols:
            return []

        cell = f"{row}:{col}"

        if cell in seen:
            return []

        if previous is not None:
            distance = (
                abs(row - previous[0])
                + abs(col - previous[1])
            )

            if distance != 1:
                return []

        cells.append(cell)
        seen.add(cell)
        previous = (row, col)

    return cells



def _normalize_sequence_tokens(value):
    if not isinstance(value, list):
        return []

    if len(value) < 3 or len(value) > 10:
        return []

    tokens = []
    seen = set()

    for raw_item in value:
        token = _as_str(raw_item).strip()

        if not token or len(token) > 32:
            return []

        identity = token.casefold()

        if identity in seen:
            return []

        tokens.append(token)
        seen.add(identity)

    return tokens


def _normalize_mosaic_choices(value):
    if not isinstance(value, list):
        return [
            "Puerta",
            "Escudo",
            "Campana",
        ]

    choices = []

    for item in value:
        text = _as_str(item).strip()[:60]

        if text:
            choices.append(text)

    choices = choices[:4]

    if len(choices) < 2:
        return [
            "Puerta",
            "Escudo",
            "Campana",
        ]

    return choices


def normalize_minigame_config(minigame_type, raw_cfg):
    raw = raw_cfg if isinstance(raw_cfg, dict) else {}
    out = _normalize_minigame_config_raw(minigame_type, raw)
    if not isinstance(out, dict):
        out = {}
    for field in ["is_map_collectible", "game_id", "game_title", "completion_method"]:
        if field in raw:
            if field == "is_map_collectible":
                out[field] = _as_bool(raw[field])
            else:
                out[field] = _as_str(raw[field]).strip()
    return out


def _normalize_minigame_config_raw(minigame_type, raw_cfg):
    raw = raw_cfg if isinstance(raw_cfg, dict) else {}
    normalized_type = _as_str(minigame_type).strip().lower()
    if normalized_type not in SUPPORTED_MINIGAME_TYPES:
        normalized_type = "signal_hunt"

    if normalized_type == "audio_challenge":
        return {
            "objective": _as_str(raw.get("objective") or "blow_charge").strip().lower() or "blow_charge",
            "game_id": _as_str(raw.get("game_id") or "audio_challenge").strip() or "audio_challenge",
        }

    if normalized_type == "circuit_matrix":
        game_id = (
            _as_str(
                raw.get("game_id")
                or "logic_circuit"
            )
            .strip()
            or "logic_circuit"
        )

        if game_id == "tilt_maze":
            difficulty = (
                _as_str(
                    raw.get("difficulty")
                    or "normal"
                )
                .strip()
                .lower()
                or "normal"
            )

            if difficulty not in CIRCUIT_DIFFICULTIES:
                difficulty = "normal"

            fallback_size = (
                7
                if difficulty == "easy"
                else 11
                if difficulty == "hard"
                else 9
            )

            pattern_mode = (
                "random_each_game"
                if (
                    _as_str(
                        raw.get("pattern_mode")
                    )
                    .strip()
                    .lower()
                    == "random_each_game"
                )
                else "fixed"
            )

            return {
                "objective": "balance_maze",
                "game_id": "tilt_maze",
                "completion_method": "motion",
                "difficulty": difficulty,
                "grid_rows": _clamp_int(
                    raw.get("grid_rows"),
                    fallback_size,
                    5,
                    13,
                ),
                "grid_cols": _clamp_int(
                    raw.get("grid_cols"),
                    fallback_size,
                    5,
                    13,
                ),
                "pattern_mode": pattern_mode,
                "maze_seed": (
                    _as_str(
                        raw.get("maze_seed")
                        or "saga-maze"
                    )
                    .strip()[:80]
                    or "saga-maze"
                ),
                "time_limit_s": _clamp_int(
                    raw.get("time_limit_s"),
                    75,
                    20,
                    180,
                ),
                "lives": _clamp_int(
                    raw.get("lives"),
                    3,
                    1,
                    5,
                ),
                "hole_count": _clamp_int(
                    raw.get("hole_count"),
                    4,
                    0,
                    18,
                ),
                "collectible_count": _clamp_int(
                    raw.get(
                        "collectible_count"
                    ),
                    2,
                    0,
                    6,
                ),
                "sensor_enabled": _as_bool(
                    raw.get("sensor_enabled"),
                    True,
                ),
                "tilt_threshold": _clamp_int(
                    raw.get("tilt_threshold"),
                    12,
                    6,
                    30,
                ),
                "step_cooldown_ms": _clamp_int(
                    raw.get(
                        "step_cooldown_ms"
                    ),
                    360,
                    180,
                    800,
                ),
            }

        if game_id == "place_mosaic":
            image_data_url = (
                _as_str(
                    raw.get("image_data_url")
                )
                .strip()
            )

            valid_image = (
                len(image_data_url) <= 600000
                and (
                    image_data_url.startswith(
                        "data:image/jpeg;base64,"
                    )
                    or image_data_url.startswith(
                        "data:image/png;base64,"
                    )
                    or image_data_url.startswith(
                        "data:image/webp;base64,"
                    )
                )
            )

            if not valid_image:
                image_data_url = ""

            grid_size = _clamp_int(
                (
                    raw.get("grid_size")
                    if raw.get("grid_size") is not None
                    else raw.get("grid_cols")
                ),
                3,
                2,
                4,
            )

            choices = (
                _normalize_mosaic_choices(
                    raw.get("final_choices")
                )
            )

            correct_index = _clamp_int(
                raw.get("final_correct_index"),
                0,
                0,
                len(choices) - 1,
            )

            return {
                "objective": "image_mosaic",
                "game_id": "place_mosaic",
                "completion_method": "puzzle",
                "image_data_url": image_data_url,
                "image_alt": (
                    _as_str(
                        raw.get("image_alt")
                    )
                    .strip()[:120]
                ),
                "grid_size": grid_size,
                "grid_cols": grid_size,
                "grid_rows": grid_size,
                "preview_ms": _clamp_int(
                    raw.get("preview_ms"),
                    2500,
                    0,
                    6000,
                ),
                "max_moves": _clamp_int(
                    raw.get("max_moves"),
                    0,
                    0,
                    500,
                ),
                "require_final_question": (
                    _as_bool(
                        raw.get(
                            "require_final_question"
                        ),
                        False,
                    )
                ),
                "final_question": (
                    _as_str(
                        raw.get("final_question")
                        or (
                            "¿Qué detalle aparece "
                            "en el lugar real?"
                        )
                    )
                    .strip()[:180]
                ),
                "final_choices": choices,
                "final_correct_index": (
                    correct_index
                ),
            }

        if game_id == "sequence_code":
            sequence = _normalize_sequence_tokens(
                raw.get("sequence")
            )

            difficulty = (
                _as_str(
                    raw.get("difficulty")
                    or "normal"
                )
                .strip()
                .lower()
                or "normal"
            )

            if difficulty not in CIRCUIT_DIFFICULTIES:
                difficulty = "normal"

            return {
                "objective": "sequence_order",
                "game_id": "sequence_code",
                "completion_method": "sequence",
                "sequence": sequence,
                "difficulty": difficulty,
                "max_attempts": _clamp_int(
                    raw.get("max_attempts"),
                    3,
                    1,
                    8,
                ),
                "hint_text": (
                    _as_str(
                        raw.get("hint_text")
                    )
                    .strip()[:240]
                ),
                "shuffle_choices": True,
            }

        rows = _clamp_int(
            raw.get("grid_rows"),
            5,
            4,
            6,
        )

        cols = _clamp_int(
            raw.get("grid_cols"),
            5,
            4,
            6,
        )

        objective = (
            _as_str(
                raw.get("objective")
                or "path_restore"
            )
            .strip()
            .lower()
        )

        if objective not in CIRCUIT_OBJECTIVES:
            objective = "path_restore"

        path_cells = _normalize_circuit_path_cells(
            raw.get("path_cells"),
            rows,
            cols,
        )

        raw_pattern_mode = (
            _as_str(raw.get("pattern_mode"))
            .strip()
            .lower()
        )

        if raw_pattern_mode in CIRCUIT_PATTERN_MODES:
            pattern_mode = raw_pattern_mode
        elif len(path_cells) >= 4:
            pattern_mode = "fixed"
        else:
            pattern_mode = "random_each_game"

        if pattern_mode != "fixed":
            path_cells = []

        if pattern_mode == "fixed" and path_cells:
            path_length = len(path_cells)
        else:
            path_length = _clamp_int(
                raw.get("path_length"),
                11,
                4,
                rows * cols,
            )

        out = {
            "objective": objective,
            "game_id": (
                _as_str(
                    raw.get("game_id")
                    or "logic_circuit"
                )
                .strip()
                or "logic_circuit"
            ),
            "completion_method": "puzzle",
            "grid_cols": cols,
            "grid_rows": rows,
            "difficulty": (
                _normalize_circuit_difficulty(
                    raw.get("difficulty")
                )
            ),
            "max_errors": _clamp_int(
                raw.get("max_errors"),
                3,
                1,
                6,
            ),
            "preview_cell_ms": _clamp_int(
                raw.get("preview_cell_ms"),
                460,
                220,
                900,
            ),
            "path_length": path_length,
            "pattern_mode": pattern_mode,
            "path_cells": path_cells,
            "max_moves": (
                _clamp_int(
                    raw.get("max_moves"),
                    0,
                    0,
                )
                or None
            ),
            "max_time_ms": (
                _clamp_int(
                    raw.get("max_time_ms"),
                    0,
                    0,
                )
                or None
            ),
            "allow_rotate": _as_bool(
                raw.get("allow_rotate"),
                True,
            ),
            "allow_toggle": _as_bool(
                raw.get("allow_toggle"),
                True,
            ),
            "allow_swap": _as_bool(
                raw.get("allow_swap"),
                False,
            ),
            "start_nodes": (
                raw.get("start_nodes")
                if isinstance(
                    raw.get("start_nodes"),
                    list,
                )
                else []
            ),
            "end_nodes": (
                raw.get("end_nodes")
                if isinstance(
                    raw.get("end_nodes"),
                    list,
                )
                else []
            ),
            "target_pattern": (
                raw.get("target_pattern")
                if isinstance(
                    raw.get("target_pattern"),
                    list,
                )
                else []
            ),
            "blocked_cells": (
                raw.get("blocked_cells")
                if isinstance(
                    raw.get("blocked_cells"),
                    list,
                )
                else []
            ),
            "hint_mode": (
                _as_str(
                    raw.get("hint_mode")
                    or "light"
                )
                .strip()
                .lower()
                or "light"
            ),
            "auto_check": _as_bool(
                raw.get("auto_check"),
                True,
            ),
            "success_animation": (
                _as_str(
                    raw.get("success_animation")
                    or "restore"
                )
                .strip()
                .lower()
                or "restore"
            ),
        }

        out["seed"] = (
            _as_str(raw.get("seed"))
            .strip()
        )

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


    if normalized_type == "motion_challenge":
        difficulty = _as_str(raw.get("difficulty") or "normal").strip().lower() or "normal"
        if difficulty not in {"easy", "normal", "hard"}:
            difficulty = "normal"

        duration_mode = _as_str(raw.get("duration_mode") or "normal").strip().lower() or "normal"
        if duration_mode not in {"short", "normal", "long"}:
            duration_mode = "normal"

        penalty_mode = _as_str(raw.get("penalty_mode") or "normal").strip().lower() or "normal"
        if penalty_mode not in {"soft", "normal", "hard"}:
            penalty_mode = "normal"

        out = {
            "objective": _as_str(raw.get("objective") or "shake_charge").strip().lower() or "shake_charge",
            "game_id": _as_str(raw.get("game_id") or "shake_antenna_charge").strip() or "shake_antenna_charge",
            "difficulty": difficulty,
            "duration_mode": duration_mode,
            "penalty_mode": penalty_mode,
            "allow_touch_fallback": _as_bool(raw.get("allow_touch_fallback"), True),
            "energy_target": _clamp_int(raw.get("energy_target"), 100, 40, 300),
            "time_limit_ms": _clamp_int(raw.get("time_limit_ms"), 35000, 12000, 120000),
            "stabilize_ms": _clamp_int(raw.get("stabilize_ms"), 2000, 600, 8000),
            "calibration_ms": _clamp_int(raw.get("calibration_ms"), 1000, 400, 3000),
            "good_min": _as_float(raw.get("good_min"), 1.2),
            "good_max": _as_float(raw.get("good_max"), 3.8),
            "overcharge_threshold": _as_float(raw.get("overcharge_threshold"), 5.4),
            "idle_decay": _as_float(raw.get("idle_decay"), 0.15),
            "charge_rate": _as_float(raw.get("charge_rate"), 2.4),
            "stability_min": _clamp_int(raw.get("stability_min"), 35, 0, 100),
            "use_vibration": _as_bool(raw.get("use_vibration"), True),
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

    label = (
        spec.get("label")
        or minigame_type.replace("_", " ").title()
    )

    if (
        minigame_type == "circuit_matrix"
        and config.get("game_id") == "sequence_code"
    ):
        label = "Código secuencial"

    if (
        minigame_type == "circuit_matrix"
        and config.get("game_id") == "place_mosaic"
    ):
        label = "Mosaico del lugar"

    if minigame_type == "audio_challenge":
        label = "Desafío de audio"

    return {
        "type": minigame_type,
        "label": label,
        "version": "v1",
        "config": config,
    }

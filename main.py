from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import json
import os
import hashlib
import hmac
import secrets
import time
from pathlib import Path

app = FastAPI()

def load_json(file, default):
    try:
        if not os.path.exists(file):
            return default
        with open(file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else default
    except Exception as e:
        print(f"Error cargando {file}: {e}")
        return default

def save_json(file, data):
    try:
        parent = os.path.dirname(file)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
    except Exception as e:
        print(f"Error guardando {file}: {e}")

VALID_PLAYER_THEMES = {"classic", "glass"}

def normalize_player_theme(value):
    theme = str(value or "classic").strip().lower()
    return theme if theme in VALID_PLAYER_THEMES else "classic"

def load_config():
    cfg = load_json("config.json", {
        "site_name": "PUT TITLE HERE",
        "admin_title": "PUT ADMIN TITLE HERE",
        "admin_subtitle": "PUT ADMIN SUBTITLE HERE",
        "story_title": "",
        "story_text": "",
        "map_center": [42.26, -8.86],
        "map_zoom": 13,
        "players": ["PLAYER 1", "PLAYER 2"],
        "ui_lang": "en",
        "player_theme": "classic",
        "data_dir": "data"
    })
    if not isinstance(cfg, dict):
        cfg = {}
    cfg["player_theme"] = normalize_player_theme(cfg.get("player_theme", "classic"))
    return cfg

CONFIG = load_config()

def resolve_data_dir():
    env_dir = (os.getenv("SAGA_DATA_DIR") or "").strip()
    cfg_dir = str(CONFIG.get("data_dir", "data") or "data").strip()
    data_dir = env_dir or cfg_dir or "data"
    if not os.path.isabs(data_dir):
        data_dir = os.path.abspath(data_dir)
    os.makedirs(data_dir, exist_ok=True)
    return data_dir

DATA_DIR = resolve_data_dir()
GAME_DB = os.path.join(DATA_DIR, "gamestate.json")
STAGES_DB = os.path.join(DATA_DIR, "stages.json")
POSITIONS_DB = os.path.join(DATA_DIR, "positions.json")
ADMIN_AUTH_DB = os.path.join(DATA_DIR, "admin_auth.json")

BOOTSTRAP_ADMIN_PASS = (os.getenv("ADMIN_PASS") or "").strip()
ALLOW_DEFAULT_ADMIN = (os.getenv("ALLOW_DEFAULT_ADMIN") or "0").strip() == "1"
ADMIN_RESET = (os.getenv("ADMIN_RESET") or "0").strip() == "1"

PLAYERS = CONFIG.get("players", ["PLAYER 1", "PLAYER 2"])

def hash_password(password, salt=None, iterations=200000):
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    return {
        "salt": salt,
        "password_hash": dk.hex(),
        "iterations": iterations
    }

def load_admin_auth():
    return load_json(ADMIN_AUTH_DB, {})

def save_admin_auth(data):
    save_json(ADMIN_AUTH_DB, data)

def verify_admin_password(password):
    auth = load_admin_auth()
    salt = auth.get("salt")
    expected = auth.get("password_hash")
    iterations = int(auth.get("iterations") or 200000)

    if not salt or not expected:
        return False

    dk = hashlib.pbkdf2_hmac(
        "sha256",
        (password or "").encode("utf-8"),
        salt.encode("utf-8"),
        iterations
    ).hex()

    return hmac.compare_digest(dk, expected)

def is_weak_admin_password(password):
    p = (password or "").strip()
    weak = {
        "",
        "CHANGE_ME",
        "admin",
        "password",
        "12345678",
    }
    return len(p) < 10 or p in weak

def set_admin_password(password, must_change=False, source="manual"):
    data = hash_password(password)
    auth = {
        "salt": data["salt"],
        "password_hash": data["password_hash"],
        "iterations": data["iterations"],
        "must_change": bool(must_change),
        "source": source
    }
    save_admin_auth(auth)
    return auth

def admin_password_change_required():
    auth = load_admin_auth()
    return bool(auth.get("must_change"))

def ensure_admin_auth():
    auth = load_admin_auth()

    if ADMIN_RESET:
        if not BOOTSTRAP_ADMIN_PASS:
            raise RuntimeError("ADMIN_RESET=1 requires ADMIN_PASS.")
        set_admin_password(
            BOOTSTRAP_ADMIN_PASS,
            must_change=is_weak_admin_password(BOOTSTRAP_ADMIN_PASS),
            source="reset"
        )
        print("[WARN] Admin password reset from environment.")
        return

    if auth.get("password_hash") and auth.get("salt"):
        return

    if BOOTSTRAP_ADMIN_PASS:
        set_admin_password(
            BOOTSTRAP_ADMIN_PASS,
            must_change=is_weak_admin_password(BOOTSTRAP_ADMIN_PASS),
            source="bootstrap"
        )
        print("[INFO] Admin password initialized from ADMIN_PASS.")
        return

    if ALLOW_DEFAULT_ADMIN:
        set_admin_password("CHANGE_ME", must_change=True, source="fallback")
        print("[WARN] ADMIN_PASS not set. Using development fallback CHANGE_ME because ALLOW_DEFAULT_ADMIN=1")
        return

    raise RuntimeError("ADMIN_PASS is required. Set ADMIN_PASS, or enable ALLOW_DEFAULT_ADMIN=1 only for local development.")

ensure_admin_auth()

ADMIN_LOGIN_WINDOW_SECONDS = 600
ADMIN_LOGIN_MAX_ATTEMPTS = 5
ADMIN_LOGIN_LOCK_SECONDS = 600
ADMIN_LOGIN_ATTEMPTS = {}

def get_client_ip(request: Request):
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    client = getattr(request, "client", None)
    if client and getattr(client, "host", None):
        return client.host
    return "unknown"

def prune_admin_login_attempts(now=None):
    now = now or time.time()
    stale_keys = []
    for ip, state in ADMIN_LOGIN_ATTEMPTS.items():
        locked_until = float(state.get("locked_until") or 0)
        attempts = [ts for ts in state.get("attempts", []) if now - ts <= ADMIN_LOGIN_WINDOW_SECONDS]
        if locked_until <= now and not attempts:
            stale_keys.append(ip)
        else:
            state["attempts"] = attempts
            if locked_until <= now:
                state["locked_until"] = 0
    for ip in stale_keys:
        ADMIN_LOGIN_ATTEMPTS.pop(ip, None)

def get_admin_login_state(ip, now=None):
    now = now or time.time()
    prune_admin_login_attempts(now)
    state = ADMIN_LOGIN_ATTEMPTS.setdefault(ip, {"attempts": [], "locked_until": 0})
    state["attempts"] = [ts for ts in state.get("attempts", []) if now - ts <= ADMIN_LOGIN_WINDOW_SECONDS]
    if float(state.get("locked_until") or 0) <= now:
        state["locked_until"] = 0
    return state

def clear_admin_login_state(ip):
    ADMIN_LOGIN_ATTEMPTS.pop(ip, None)

def register_admin_login_failure(ip, now=None):
    now = now or time.time()
    state = get_admin_login_state(ip, now)
    state["attempts"].append(now)
    if len(state["attempts"]) >= ADMIN_LOGIN_MAX_ATTEMPTS:
        state["locked_until"] = now + ADMIN_LOGIN_LOCK_SECONDS
    return state

def get_admin_lock_remaining_seconds(ip, now=None):
    now = now or time.time()
    state = get_admin_login_state(ip, now)
    locked_until = float(state.get("locked_until") or 0)
    return max(0, int(locked_until - now))


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

VALID_PROFILE_MODES = {"solo", "team"}

def parse_player_entries(raw_players):
    if isinstance(raw_players, str):
        items = [line.strip() for line in raw_players.splitlines() if line.strip()]
    elif isinstance(raw_players, list):
        items = raw_players
    else:
        return ["PLAYER 1", "PLAYER 2"]

    parsed = []
    for item in items:
        if isinstance(item, dict):
            parsed.append(item)
            continue

        text = _as_str(item).strip()
        if not text:
            continue

        if text.startswith("{") and text.endswith("}"):
            try:
                obj = json.loads(text)
                if isinstance(obj, dict):
                    parsed.append(obj)
                    continue
            except Exception:
                pass

        parsed.append(text)

    return parsed or ["PLAYER 1", "PLAYER 2"]

def normalize_player_profile(raw, index=0):
    if isinstance(raw, dict):
        display_name = _as_str(
            raw.get("display_name") or raw.get("name") or raw.get("id") or f"PLAYER {index + 1}"
        ).strip() or f"PLAYER {index + 1}"

        profile_id = _as_str(raw.get("id") or display_name).strip() or display_name

        mode = _as_str(raw.get("mode") or "solo").strip().lower()
        if mode not in VALID_PROFILE_MODES:
            mode = "solo"

        members_raw = raw.get("members") or []
        if isinstance(members_raw, str):
            members = [m.strip() for m in members_raw.split(",") if m.strip()]
        elif isinstance(members_raw, list):
            members = [_as_str(m).strip() for m in members_raw if _as_str(m).strip()]
        else:
            members = []

        status = _as_str(raw.get("status") or "active").strip().lower() or "active"

        if mode == "solo" and not members and display_name:
            members = [display_name]

        return {
            "id": profile_id,
            "display_name": display_name,
            "mode": mode,
            "members": members,
            "status": status,
        }

    display_name = _as_str(raw, f"PLAYER {index + 1}").strip() or f"PLAYER {index + 1}"
    return {
        "id": display_name,
        "display_name": display_name,
        "mode": "solo",
        "members": [display_name],
        "status": "active",
    }

def get_player_profiles(cfg=None):
    cfg = cfg or load_config()
    raw_players = parse_player_entries(cfg.get("players", ["PLAYER 1", "PLAYER 2"]))
    return [normalize_player_profile(item, index=i) for i, item in enumerate(raw_players)]

def profile_matches_user(profile, user_text):
    user_text = _as_str(user_text).strip()
    if not user_text:
        return False

    if _as_str(profile.get("id")).strip() == user_text:
        return True

    if _as_str(profile.get("display_name")).strip() == user_text:
        return True

    for member in profile.get("members", []):
        if _as_str(member).strip() == user_text:
            return True

    return False


def get_player_profile(user, cfg=None):
    cfg = cfg or load_config()
    user_text = _as_str(user).strip()
    profiles = get_player_profiles(cfg)

    # 1) exact stable-id match first
    for profile in profiles:
        if _as_str(profile.get("id")).strip() == user_text:
            return profile

    # 2) then visible display-name match
    for profile in profiles:
        if _as_str(profile.get("display_name")).strip() == user_text:
            return profile

    # 3) then team member alias -> canonical team profile
    for profile in profiles:
        if profile_matches_user(profile, user_text):
            return profile

    return normalize_player_profile(user_text or "PLAYER 1", 0)

HEARTBEAT_STALE_SECONDS = 180
HEARTBEAT_MIN_INTERVAL_SECONDS = 2
HEARTBEAT_RATE_WINDOW_SECONDS = 3600
HEARTBEAT_LAST_SEEN_BY_KEY = {}

VALID_HEARTBEAT_GPS_STATUS = {
    "ok",
    "unknown",
    "unavailable",
    "stale",
    "searching",
    "error",
    "denied",
}

VALID_HEARTBEAT_SOURCES = {
    "player",
    "device",
    "react",
    "pwa",
}

def get_heartbeat_client_ip(request: Request):
    client = getattr(request, "client", None)
    if client and getattr(client, "host", None):
        return client.host
    return "unknown"

def prune_heartbeat_rate_state(now=None):
    now = now or time.time()
    stale_keys = [
        key for key, ts in HEARTBEAT_LAST_SEEN_BY_KEY.items()
        if now - float(ts or 0) > HEARTBEAT_RATE_WINDOW_SECONDS
    ]
    for key in stale_keys:
        HEARTBEAT_LAST_SEEN_BY_KEY.pop(key, None)

def normalize_heartbeat_gps_status(value):
    status = _as_str(value or "unknown").strip().lower() or "unknown"
    return status if status in VALID_HEARTBEAT_GPS_STATUS else "unknown"

def normalize_heartbeat_source(value):
    source = _as_str(value or "player").strip().lower() or "player"
    return source if source in VALID_HEARTBEAT_SOURCES else "player"

def resolve_known_player_profile(user, cfg=None):
    cfg = cfg or load_config()
    user_text = _as_str(user).strip()
    if not user_text:
        return None

    for profile in get_player_profiles(cfg):
        if profile_matches_user(profile, user_text):
            return profile

    return None

def load_live_positions():
    data = load_json(POSITIONS_DB, {})
    return data if isinstance(data, dict) else {}

def save_live_positions(data):
    save_json(POSITIONS_DB, data)

def project_live_profile_status(profile, raw=None, now=None):
    now = int(now or time.time())
    raw = raw if isinstance(raw, dict) else {}

    last_seen = int(raw.get("last_seen") or 0)
    gps_status = _as_str(raw.get("gps_status") or "unknown").strip().lower() or "unknown"

    if last_seen <= 0:
        presence = "offline"
    elif (now - last_seen) <= HEARTBEAT_STALE_SECONDS:
        presence = "live"
    else:
        presence = "stale"

    return {
        "user": profile.get("id"),
        "display_name": profile.get("display_name"),
        "session_mode": profile.get("mode", "solo"),
        "members": profile.get("members", []),
        "status": profile.get("status", "active"),
        "presence": presence,
        "last_seen": last_seen,
        "gps_status": gps_status,
        "lat": _as_float(raw.get("lat")),
        "lon": _as_float(raw.get("lon")),
        "source": _as_str(raw.get("source") or "player").strip() or "player",
        "debug_enabled": _as_bool(raw.get("debug_enabled"), False),
    }

def _build_success_conditions(raw):
    conditions = [{"kind": "minigame_ok", "value": MINIGAME_OK_CODE}]

    answer = _clean_code(raw.get("answer"))
    rune = _clean_code(raw.get("rune"))

    if answer:
        conditions.append({"kind": "answer", "value": answer})
    if rune:
        conditions.append({"kind": "rune", "value": rune})

    return conditions

# RUNTIME_CONTRACT_CLEANUP_V1: el player React debe recibir family-native minigames.
# Avoid letting incomplete data silently fall back to outdated minigame defaults.
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

    return {
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

def validate_stages(raw_stages):
    if not isinstance(raw_stages, list):
        return [{"index": None, "field": "stages", "detail": "stages payload must be a list"}]

    errors = []
    for idx, stage in enumerate(raw_stages):
        if not isinstance(stage, dict):
            errors.append({"index": idx, "field": "node", "detail": "each node must be an object"})
            continue
        errors.extend(validate_stage(stage, idx=idx))
    return errors

def get_runtime_stages():
    raw_stages = load_json(STAGES_DB, [])
    if not isinstance(raw_stages, list):
        return []
    return [normalize_stage(stage) for stage in raw_stages]

def project_stage_for_player(raw_stage, include_runtime=False):
    node = raw_stage if isinstance(raw_stage, dict) and raw_stage.get("version") == 2 else normalize_stage(raw_stage)

    out = {
        "id": node["id"],
        "title": node["presentation"]["title"],
        "lat": node["location"]["lat"],
        "lon": node["location"]["lon"],
        "radius": node["location"]["radius_m"],
    }

    if include_runtime:
        out.update({
            "content": node["presentation"]["content"],
            "type": node["interaction"]["type"],
            "config": node["interaction"]["config"],
            "minigame": build_stage_minigame_runtime(node),
            "entry": node["entry"],
            "messages": node["messages"],
        })

    return out

def stage_accepts_code(raw_stage, code):
    node = raw_stage if isinstance(raw_stage, dict) and raw_stage.get("version") == 2 else normalize_stage(raw_stage)
    submitted = _clean_code(code)

    if not submitted:
        return False

    for condition in node["success"]["conditions"]:
        expected = _clean_code(condition.get("value"))
        if expected and submitted == expected:
            return True

    return False

APP_DIR = Path(__file__).resolve().parent
REACT_DIST_DIR = APP_DIR / "frontend" / "dist"
REACT_INDEX_FILE = REACT_DIST_DIR / "index.html"
REACT_ASSETS_DIR = REACT_DIST_DIR / "assets"

app.mount("/assets", StaticFiles(directory=str(REACT_ASSETS_DIR), check_dir=False), name="react_assets")
templates = Jinja2Templates(directory="templates")

def react_index_or_missing():
    if REACT_INDEX_FILE.exists():
        return FileResponse(REACT_INDEX_FILE)

    return HTMLResponse(
        """
        <!doctype html>
        <html>
          <head><title>SAGA React build missing</title></head>
          <body style="font-family: system-ui; padding: 24px;">
            <h1>SAGA React build missing</h1>
            <p>Run <code>cd frontend && npm run build</code> before serving the React player from FastAPI.</p>
            <p>Build the React frontend with <code>cd frontend && npm run build</code>, then restart FastAPI.</p>
          </body>
        </html>
        """,
        status_code=503,
    )

@app.middleware("http")
async def saga_no_cache_html(request, call_next):
    response = await call_next(request)
    path = request.url.path or ""

    if path == "/admin" or path.startswith("/admin/") or path.startswith("/api/admin"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["CDN-Cache-Control"] = "no-store"
        response.headers["Surrogate-Control"] = "no-store"

        if request.method == "GET" and path == "/admin":
            cookie = request.headers.get("cookie", "") or ""
            if "saga_csd=1" not in cookie:
                response.headers["Clear-Site-Data"] = '"cache", "storage", "executionContexts"'
                response.headers["Set-Cookie"] = "saga_csd=1; Max-Age=600; Path=/; SameSite=Lax"
        return response

    ct = (response.headers.get("content-type") or "").lower()
    if request.method == "GET" and ("text/html" in ct):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["CDN-Cache-Control"] = "no-store"
        response.headers["Surrogate-Control"] = "no-store"

    return response

@app.head("/", response_class=HTMLResponse, include_in_schema=False)
@app.get("/", response_class=HTMLResponse)
async def react_entry():
    return react_index_or_missing()

@app.head("/admin-react", response_class=HTMLResponse, include_in_schema=False)
@app.get("/admin-react", response_class=HTMLResponse)
async def react_admin_shell():
    return react_index_or_missing()

@app.head("/admin-react/{path:path}", response_class=HTMLResponse, include_in_schema=False)
@app.get("/admin-react/{path:path}", response_class=HTMLResponse)
async def react_admin_shell_path(path: str):
    return react_index_or_missing()

@app.head("/player/{name}", response_class=HTMLResponse, include_in_schema=False)
@app.get("/player/{name}", response_class=HTMLResponse)
async def react_player(name: str):
    # Serve the React app directly. The frontend derives the player from /player/{name}.
    # Avoid RedirectResponse here: user-controlled redirect targets trigger CodeQL open-redirect checks.
    return react_index_or_missing()

@app.head("/admin", response_class=HTMLResponse, include_in_schema=False)
@app.get("/admin")
async def admin_redirect_to_react():
    return Response(status_code=307, headers={"Location": "/admin-react"})


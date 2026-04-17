from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import json
import os
import hashlib
import hmac
import secrets
import time

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
    "digital_tuner",
    "circuit_hack",
    "cryptex",
    "radio_azimuth",
    "gyro_storm",
    "simon_says",
    "switchboard",
    "compass_blow",
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
            "type": _as_str(raw.get("type") or "circuit_hack").strip() or "circuit_hack",
            "config": cfg,
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

    interaction_type = node["interaction"]["type"]
    if interaction_type not in SUPPORTED_MINIGAME_TYPES:
        add("type", f"unsupported minigame type: {interaction_type}")

    if not isinstance(node["interaction"]["config"], dict):
        add("config", "config must be an object")

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

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

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

@app.get("/", response_class=HTMLResponse)
async def login(request: Request):
    cfg = load_config()
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "request": request,
            "players": cfg.get("players", ["PLAYER 1", "PLAYER 2"]),
            "profiles": get_player_profiles(cfg),
            "config": cfg
        }
    )

@app.get("/player/{name}", response_class=HTMLResponse)
async def game(request: Request, name: str):
    cfg = load_config()
    return templates.TemplateResponse(
        request=request,
        name="game.html",
        context={
            "request": request,
            "user": name,
            "profile": get_player_profile(name, cfg),
            "config": cfg
        }
    )

@app.get("/admin", response_class=HTMLResponse)
async def admin(request: Request):
    cfg = load_config()
    return templates.TemplateResponse(
        request=request,
        name="admin.html",
        context={
            "request": request,
            "config": cfg
        }
    )

@app.get("/api/config")
async def get_config():
    cfg = load_config()
    return {
        "site_name": cfg.get("site_name", "PUT TITLE HERE"),
        "admin_title": cfg.get("admin_title", "PUT ADMIN TITLE HERE"),
        "admin_subtitle": cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE"),
        "ui_lang": cfg.get("ui_lang", "en"),
        "player_theme": normalize_player_theme(cfg.get("player_theme", "classic")),
        "story_title": cfg.get("story_title", ""),
        "story_text": cfg.get("story_text", ""),
        "prologue_title": cfg.get("prologue_title", "PUT PROLOGUE TITLE HERE"),
        "prologue_subtitle": cfg.get("prologue_subtitle", ""),
        "prologue_body": cfg.get("prologue_body", ""),
        "map_center": cfg.get("map_center", [40.4168, -3.7038]),
        "map_zoom": cfg.get("map_zoom", 13),
        "players": cfg.get("players", ["PLAYER 1", "PLAYER 2"]),
        "player_profiles": get_player_profiles(cfg)
    }

@app.get("/api/state/{user}")
async def get_state(user: str):
    stages = load_json(STAGES_DB, [])
    state = load_json(GAME_DB, {})
    profile = get_player_profile(user)
    profile_id = profile.get("id") or _as_str(user).strip() or "PLAYER 1"
    lvl = state.get(profile_id, state.get(user, 0))
    return {"user": profile_id, "level": lvl, "finished": lvl >= len(stages)}

@app.get("/api/game/{user}")
async def get_game_payload(user: str):
    runtime_stages = get_runtime_stages()
    state = load_json(GAME_DB, {})
    profile = get_player_profile(user)
    profile_id = profile.get("id") or user
    live_positions = load_live_positions()

    lvl = state.get(profile_id, state.get(user, 0))
    finished = lvl >= len(runtime_stages)

    stages = [
        project_stage_for_player(stage, include_runtime=(i == lvl and not finished))
        for i, stage in enumerate(runtime_stages)
    ]

    return {
        "user": profile_id,
        "display_name": profile.get("display_name", profile_id),
        "session_mode": profile.get("mode", "solo"),
        "profile": profile,
        "live_status": project_live_profile_status(profile, live_positions.get(profile_id)),
        "level": lvl,
        "finished": finished,
        "stages": stages
    }

@app.post("/api/heartbeat")
async def heartbeat(request: Request):
    data = await request.json()

    user = _as_str(data.get("user")).strip()
    if not user:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "user required"})

    profile = get_player_profile(user)
    profile_id = profile.get("id") or user

    positions = load_live_positions()
    current = positions.get(profile_id, {})
    if not isinstance(current, dict):
        current = {}

    lat = _as_float(data.get("lat"))
    lon = _as_float(data.get("lon"))

    if lat is not None and lon is not None:
        current["lat"] = lat
        current["lon"] = lon

    current["last_seen"] = int(time.time())
    current["gps_status"] = _as_str(data.get("gps_status") or current.get("gps_status") or "unknown").strip().lower() or "unknown"
    current["source"] = _as_str(data.get("source") or "player").strip() or "player"
    current["debug_enabled"] = _as_bool(data.get("debug_enabled"), False)

    positions[profile_id] = current
    save_live_positions(positions)

    return {
        "status": "ok",
        "user": profile_id,
        "live_status": project_live_profile_status(profile, current)
    }

@app.post("/api/admin/mission-status")
async def admin_mission_status(request: Request):
    data = await request.json()

    if not verify_admin_password(data.get("password")):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    cfg = load_config()
    runtime_stages = get_runtime_stages()
    state = load_json(GAME_DB, {})
    positions = load_live_positions()
    now = int(time.time())

    items = []
    for profile in get_player_profiles(cfg):
        profile_id = profile.get("id")
        lvl = state.get(profile_id, 0)
        finished = lvl >= len(runtime_stages)

        current_stage = ""
        if not finished and 0 <= lvl < len(runtime_stages):
            current_stage = runtime_stages[lvl]["presentation"]["title"]

        items.append({
            **project_live_profile_status(profile, positions.get(profile_id), now),
            "level": lvl,
            "finished": finished,
            "current_stage": current_stage,
        })

    return {
        "status": "ok",
        "server_ts": now,
        "profiles": items
    }

@app.post("/api/admin/stages")
async def get_stages(request: Request):
    data = await request.json()

    if not verify_admin_password(data.get("password")):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"}
        )

    return load_json(STAGES_DB, [])

@app.post("/api/admin/save-config")
async def save_config_endpoint(request: Request):
    data = await request.json()

    if not verify_admin_password(data.get("password")):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    incoming = data.get("config") or {}
    cfg = load_config()

    if "players" in incoming:
        players = parse_player_entries(incoming.get("players"))
    else:
        players = parse_player_entries(cfg.get("players", ["PLAYER 1", "PLAYER 2"]))

    ui_lang = str(incoming.get("ui_lang", cfg.get("ui_lang", "en"))).strip().lower()
    if ui_lang not in {"en"}:
        ui_lang = "en"

    player_theme = normalize_player_theme(incoming.get("player_theme", cfg.get("player_theme", "classic")))

    cfg["site_name"] = incoming.get("site_name", cfg.get("site_name", "PUT TITLE HERE")).strip() or "PUT TITLE HERE"
    cfg["admin_title"] = incoming.get("admin_title", cfg.get("admin_title", "PUT ADMIN TITLE HERE")).strip() or "PUT ADMIN TITLE HERE"
    cfg["admin_subtitle"] = incoming.get("admin_subtitle", cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE")).strip()
    cfg["ui_lang"] = ui_lang
    cfg["player_theme"] = player_theme
    cfg["story_title"] = incoming.get("story_title", cfg.get("story_title", "")).strip()
    cfg["story_text"] = incoming.get("story_text", cfg.get("story_text", "")).strip()
    cfg["prologue_title"] = incoming.get("prologue_title", cfg.get("prologue_title", "PUT PROLOGUE TITLE HERE")).strip()
    cfg["prologue_subtitle"] = incoming.get("prologue_subtitle", cfg.get("prologue_subtitle", "")).strip()
    cfg["prologue_body"] = incoming.get("prologue_body", cfg.get("prologue_body", "")).strip()

    map_center = incoming.get("map_center", cfg.get("map_center", [40.4168, -3.7038]))
    if isinstance(map_center, list) and len(map_center) == 2:
        try:
            cfg["map_center"] = [float(map_center[0]), float(map_center[1])]
        except Exception:
            pass

    try:
        cfg["map_zoom"] = int(incoming.get("map_zoom", cfg.get("map_zoom", 13)))
    except Exception:
        pass

    cfg["players"] = players

    save_json("config.json", cfg)
    return {"status": "ok", "config": cfg}

@app.post("/api/advance")
async def advance(request: Request):
    data = await request.json()
    user = data.get("user")
    code = (data.get("code") or "").strip().upper()

    profile = get_player_profile(user)
    profile_id = profile.get("id") or _as_str(user).strip() or "PLAYER 1"

    stages = get_runtime_stages()
    state = load_json(GAME_DB, {})
    lvl = state.get(profile_id, state.get(user, 0))

    if lvl < len(stages):
        current_node = stages[lvl]

        if stage_accepts_code(current_node, code):
            state[profile_id] = lvl + 1
            save_json(GAME_DB, state)
            return {"status": "ok", "user": profile_id}

    return {"status": "fail", "user": profile_id}

@app.post("/api/reset")
async def reset(request: Request):
    data = await request.json()

    if not verify_admin_password(data.get("password")):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"}
        )

    user = data.get("user")
    profile = get_player_profile(user)
    profile_id = profile.get("id") or _as_str(user).strip() or "PLAYER 1"

    state = load_json(GAME_DB, {})
    state[profile_id] = 0
    save_json(GAME_DB, state)
    return {"status": "ok", "user": profile_id}



def _clamp_game_level(value, max_level):
    try:
        value = int(value)
    except Exception:
        value = 0
    if value < 0:
        return 0
    if value > max_level:
        return max_level
    return value

@app.post("/api/admin/profile-action")
async def admin_profile_action(request: Request):
    data = await request.json()

    if not verify_admin_password(data.get("password")):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"}
        )

    profile_id = _as_str(data.get("profile_id")).strip()
    action = _as_str(data.get("action")).strip().lower()

    allowed_actions = {
        "reset_profile",
        "level_prev",
        "level_next",
        "mark_finished",
    }

    if action not in allowed_actions:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid action"}
        )

    cfg = load_config()
    profiles = {
        _as_str((p or {}).get("id")).strip(): (p or {})
        for p in get_player_profiles(cfg)
    }

    if not profile_id or profile_id not in profiles:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "detail": "unknown profile"}
        )

    runtime_stages = get_runtime_stages()
    max_level = len(runtime_stages)
    state = load_json(GAME_DB, {})

    previous_level = _clamp_game_level(state.get(profile_id, 0), max_level)

    if action == "reset_profile":
        new_level = 0
    elif action == "level_prev":
        new_level = max(0, previous_level - 1)
    elif action == "level_next":
        new_level = min(max_level, previous_level + 1)
    else:  # mark_finished
        new_level = max_level

    state[profile_id] = new_level
    save_json(GAME_DB, state)

    return {
        "status": "ok",
        "profile_id": profile_id,
        "action": action,
        "previous_level": previous_level,
        "level": new_level,
        "finished": new_level >= max_level,
        "total_stages": max_level,
    }


@app.post("/api/admin/save")
async def save_stages_endpoint(request: Request):
    data = await request.json()
    if not verify_admin_password(data.get("password")):
        return JSONResponse(status_code=403, content={"status": "error"})
    if admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    stages = data.get("stages")
    errors = validate_stages(stages)
    if errors:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid stages", "errors": errors}
        )

    save_json(STAGES_DB, stages)
    return {"status": "ok"}

@app.post("/api/admin/login")
async def admin_login(request: Request):
    data = await request.json()
    now = time.time()
    ip = get_client_ip(request)

    remaining = get_admin_lock_remaining_seconds(ip, now)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail=f"too many failed attempts; retry in {remaining}s"
        )

    if verify_admin_password(data.get("password")):
        clear_admin_login_state(ip)
        return {"status": "ok", "must_change": admin_password_change_required()}

    state = register_admin_login_failure(ip, now)
    remaining_after_fail = get_admin_lock_remaining_seconds(ip, now)

    if remaining_after_fail > 0:
        raise HTTPException(
            status_code=429,
            detail=f"too many failed attempts; retry in {remaining_after_fail}s"
        )

    attempts_left = max(0, ADMIN_LOGIN_MAX_ATTEMPTS - len(state.get("attempts", [])))
    raise HTTPException(
        status_code=401,
        detail=f"invalid password ({attempts_left} attempts left before temporary lock)"
    )

@app.post("/api/admin/change-password")
async def admin_change_password(request: Request):
    data = await request.json()
    current_password = (data.get("password") or "").strip()
    new_password = (data.get("new_password") or "").strip()
    confirm_password = (data.get("confirm_password") or "").strip()

    if not verify_admin_password(current_password):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if not new_password:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "new password required"})

    if new_password != confirm_password:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "passwords do not match"})

    if is_weak_admin_password(new_password):
        return JSONResponse(status_code=400, content={"status": "error", "detail": "choose a stronger password (minimum 10 chars, avoid temporary/default values)"})

    set_admin_password(new_password, must_change=False, source="web_change")
    return {"status": "ok"}

@app.get("/sw.js")
async def saga_sw_block():
    return Response("", media_type="application/javascript", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Service-Worker-Allowed": "/",
    })

@app.get("/service-worker.js")
async def saga_sw_block2():
    return Response("", media_type="application/javascript", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Service-Worker-Allowed": "/",
    })

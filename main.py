from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import json
import io
import zipfile
import base64
import os
import hashlib
import hmac
import secrets
import sqlite3
import time
import ipaddress
from pathlib import Path
try:
    import httpx as _httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

from backend.app.storage.json_store import load_json, save_json, update_json
from backend.app.storage.runtime_store import load_document, load_stages, save_document, save_stages
from backend.app.storage.game_state_store import (
    get_player_level,
    load_game_state,
    reset_player_level,
    set_player_level,
)
from backend.app.storage.positions_store import (
    get_live_position as get_live_position_state,
    load_live_positions_state,
    save_live_positions_state,
    upsert_live_position as upsert_live_position_state,
)
from backend.app.storage.event_store import append_event, list_events, mark_event_status
from backend.app.security import admin_auth as admin_auth_security
from backend.app.security import client_ip as client_ip_security
from backend.app.security import player_session as player_session_security

from backend.app.runtime.core_engine import (
    normalize_stage,
    validate_stage,
    preserve_physical_stage_fields
)
from backend.app.runtime.minigames import (
    _clean_code,
    build_stage_minigame_runtime
)

def _split_csv_env(name, default=""):
    raw = str(os.getenv(name, default) or "").strip()
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


ENABLE_API_DOCS = (os.getenv("SAGA_ENABLE_API_DOCS") or "0").strip() == "1"
API_DOCS_URL = "/docs" if ENABLE_API_DOCS else None
API_REDOC_URL = "/redoc" if ENABLE_API_DOCS else None
API_OPENAPI_URL = "/openapi.json" if ENABLE_API_DOCS else None

app = FastAPI(docs_url=API_DOCS_URL, redoc_url=API_REDOC_URL, openapi_url=API_OPENAPI_URL)
from backend.app.routers import field_proofs, admin, game
app.include_router(field_proofs.router)
app.include_router(admin.router)
app.include_router(game.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_split_csv_env("SAGA_CORS_ALLOW_ORIGINS"),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "HEAD", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-Requested-With"],
)



VALID_PLAYER_THEMES = {"classic", "glass"}

def normalize_player_theme(value):
    theme = str(value or "classic").strip().lower()
    return theme if theme in VALID_PLAYER_THEMES else "classic"

def resolve_config_db_path():
    data_dir = (
        os.getenv("SAGA_DATA_DIR")
        or os.getenv("DATA_DIR")
        or "data"
    )
    return os.path.join(str(data_dir or "data"), "config.json")


def load_config():
    cfg = load_document(resolve_config_db_path(), "config", {
        "site_name": "PUT TITLE HERE",
        "admin_title": "PUT ADMIN TITLE HERE",
        "admin_subtitle": "PUT ADMIN SUBTITLE HERE",
        "story_title": "",
        "story_text": "",
        "map_center": [42.26, -8.86],
        "map_zoom": 13,
        "players": ["PLAYER 1", "PLAYER 2"],
        "ui_lang": "es",
        "player_theme": "classic",
        "data_dir": "data"
    })
    if not isinstance(cfg, dict):
        cfg = {}
    
    cfg["player_theme"] = normalize_player_theme(cfg.get("player_theme", "classic"))
    
    # Fallback to env if Mapbox token is missing
    if not cfg.get("mapbox_token"):
        env_token = os.getenv("VITE_MAPBOX_TOKEN") or os.getenv("MAPBOX_TOKEN")
        if env_token:
            cfg["mapbox_token"] = env_token

    return cfg

def save_config(cfg):
    save_document(resolve_config_db_path(), "config", cfg)


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
EVENT_LOG_DB = os.path.join(DATA_DIR, "events.json")
ADMIN_SESSIONS_DB = os.path.join(DATA_DIR, "admin_sessions.json")

BOOTSTRAP_ADMIN_PASS = (os.getenv("ADMIN_PASS") or "").strip()
ALLOW_DEFAULT_ADMIN = (os.getenv("ALLOW_DEFAULT_ADMIN") or "0").strip() == "1"
ADMIN_RESET = (os.getenv("ADMIN_RESET") or "0").strip() == "1"

ADMIN_LOGIN_WINDOW_SECONDS = 600
ADMIN_LOGIN_MAX_ATTEMPTS = 5
ADMIN_LOGIN_LOCK_SECONDS = 600
ADMIN_LOGIN_ATTEMPTS = {}

ADMIN_SESSION_COOKIE = "saga_admin_session"
ADMIN_SESSION_TTL_SECONDS = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", "3600") or "3600")
ADMIN_SESSIONS = {}
PLAYER_SESSION_COOKIE = "saga_player_session"
PLAYER_SESSION_TTL_SECONDS = int(os.getenv("PLAYER_SESSION_TTL_SECONDS", "43200") or "43200")
PLAYER_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("PLAYER_RATE_LIMIT_WINDOW_SECONDS", "60") or "60")
ADVANCE_RATE_LIMIT_MAX = int(os.getenv("ADVANCE_RATE_LIMIT_MAX", "24") or "24")
EVENT_SYNC_RATE_LIMIT_MAX = int(os.getenv("EVENT_SYNC_RATE_LIMIT_MAX", "12") or "12")
PLAYER_RATE_LIMITS = {"advance": {}, "events_sync": {}}


def hash_password(password, salt=None, iterations=200000):
    return admin_auth_security.hash_password(password, salt=salt, iterations=iterations)


def load_admin_auth():
    return admin_auth_security.load_admin_auth(ADMIN_AUTH_DB)


def save_admin_auth(data):
    admin_auth_security.save_admin_auth(ADMIN_AUTH_DB, data)


def verify_admin_password(password):
    return admin_auth_security.verify_admin_password(ADMIN_AUTH_DB, password)


def is_weak_admin_password(password):
    return admin_auth_security.is_weak_admin_password(password)


def set_admin_password(password, must_change=False, source="manual"):
    return admin_auth_security.set_admin_password(
        ADMIN_AUTH_DB,
        password,
        must_change=must_change,
        source=source,
    )


def admin_password_change_required():
    return admin_auth_security.admin_password_change_required(ADMIN_AUTH_DB)


def ensure_admin_auth():
    return admin_auth_security.ensure_admin_auth(
        ADMIN_AUTH_DB,
        bootstrap_admin_pass=BOOTSTRAP_ADMIN_PASS,
        allow_default_admin=ALLOW_DEFAULT_ADMIN,
        admin_reset=ADMIN_RESET,
    )


ensure_admin_auth()


def _now_ts():
    return admin_auth_security.now_ts()


def prune_admin_sessions(now=None):
    admin_auth_security.prune_admin_sessions(ADMIN_SESSIONS, now=now)
    admin_auth_security.save_admin_sessions(ADMIN_SESSIONS_DB, ADMIN_SESSIONS)


def create_admin_session():
    sessions = admin_auth_security.load_admin_sessions(ADMIN_SESSIONS_DB)
    ADMIN_SESSIONS.clear()
    ADMIN_SESSIONS.update(sessions)
    token = admin_auth_security.create_admin_session(ADMIN_SESSIONS, ADMIN_SESSION_TTL_SECONDS)
    admin_auth_security.save_admin_sessions(ADMIN_SESSIONS_DB, ADMIN_SESSIONS)
    return token


def verify_admin_session_token(token):
    sessions = admin_auth_security.load_admin_sessions(ADMIN_SESSIONS_DB)
    ADMIN_SESSIONS.clear()
    ADMIN_SESSIONS.update(sessions)
    valid = admin_auth_security.verify_admin_session_token(ADMIN_SESSIONS, token)
    admin_auth_security.save_admin_sessions(ADMIN_SESSIONS_DB, ADMIN_SESSIONS)
    return valid


def clear_admin_sessions():
    ADMIN_SESSIONS.clear()
    admin_auth_security.clear_all_admin_sessions(ADMIN_SESSIONS_DB)


def admin_cookie_settings(request: Request):
    return admin_auth_security.admin_cookie_settings(request, ADMIN_SESSION_TTL_SECONDS)


def set_admin_session_cookie(response: Response, request: Request, token: str):
    return admin_auth_security.set_admin_session_cookie(
        response,
        request,
        token,
        ADMIN_SESSION_TTL_SECONDS,
    )


def clear_admin_session_cookie(response: Response, request: Request):
    return admin_auth_security.clear_admin_session_cookie(response, request)


def get_admin_password_from_payload(data):
    return admin_auth_security.get_admin_password_from_payload(data)


def legacy_admin_password_payload_enabled():
    return admin_auth_security.legacy_admin_password_payload_enabled()


def admin_request_authorized(request: Request, data=None):
    cookie_token = request.cookies.get(ADMIN_SESSION_COOKIE)
    if verify_admin_session_token(cookie_token):
        return True
    if not legacy_admin_password_payload_enabled():
        return False
    return verify_admin_password(get_admin_password_from_payload(data or {}))


def get_session_signing_secret():
    explicit = str(os.getenv("SECRET_KEY") or "").strip()
    if explicit:
        return explicit

    auth = load_admin_auth()
    salt = str(auth.get("salt") or "").strip()
    password_hash = str(auth.get("password_hash") or "").strip()
    if salt and password_hash:
        return f"{salt}:{password_hash}"

    raise RuntimeError("SECRET_KEY is required when admin auth has not been initialized.")


def normalize_player_session_user(user):
    text = _as_str(user).strip()
    safe = "".join(ch for ch in text if ch.isalnum() or ch in {" ", "_", "-"})
    return safe[:120].strip()


def set_player_session_cookie(response: Response, request: Request, user: str):
    profile = resolve_known_player_profile(user)
    if not profile:
        return
    safe_user = normalize_player_session_user(profile.get("id"))
    if not safe_user:
        return
    token = player_session_security.create_player_session_token(
        safe_user,
        ttl_seconds=PLAYER_SESSION_TTL_SECONDS,
        secret=get_session_signing_secret(),
    )
    response.set_cookie(
        PLAYER_SESSION_COOKIE,
        token,
        **player_session_security.player_cookie_settings(request, PLAYER_SESSION_TTL_SECONDS),
    )


def clear_player_session_cookie(response: Response, request: Request):
    response.delete_cookie(
        PLAYER_SESSION_COOKIE,
        path="/",
        secure=(request.url.scheme or "").lower() == "https",
        httponly=True,
        samesite="lax",
    )


def verify_player_session(request: Request, user: str):
    return player_session_security.verify_player_session_token(
        request.cookies.get(PLAYER_SESSION_COOKIE),
        user=user,
        secret=get_session_signing_secret(),
    )


def require_player_session(request: Request, user: str):
    if not verify_player_session(request, user):
        raise HTTPException(status_code=403, detail="player session required")


def apply_security_headers(response: Response, request: Request):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), geolocation=(self), microphone=(), interest-cohort=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' data: blob: https: http:; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https: http:; "
        "style-src 'self' 'unsafe-inline' https: http:; "
        "img-src 'self' data: blob: https: http:; "
        "connect-src 'self' https: http: ws: wss:; "
        "worker-src 'self' blob:; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'"
    )
    if (request.url.scheme or "").lower() == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def prune_player_rate_limit_bucket(bucket_name: str, now=None):
    now = float(now or time.time())
    bucket = PLAYER_RATE_LIMITS.setdefault(bucket_name, {})
    stale = []
    for key, timestamps in bucket.items():
        fresh = [ts for ts in timestamps if now - ts <= PLAYER_RATE_LIMIT_WINDOW_SECONDS]
        if fresh:
            bucket[key] = fresh
        else:
            stale.append(key)
    for key in stale:
        bucket.pop(key, None)


def enforce_player_rate_limit(bucket_name: str, request: Request, user: str, limit: int):
    now = time.time()
    prune_player_rate_limit_bucket(bucket_name, now=now)
    bucket = PLAYER_RATE_LIMITS.setdefault(bucket_name, {})
    key = f"{get_client_ip(request)}:{_as_str(user).strip()}"
    hits = bucket.get(key, [])
    if len(hits) >= int(limit):
        raise HTTPException(status_code=429, detail="rate limit exceeded")
    hits.append(now)
    bucket[key] = hits


def clear_player_rate_limits():
    for bucket in PLAYER_RATE_LIMITS.values():
        bucket.clear()


TRUST_PROXY_HEADERS = client_ip_security.TRUST_PROXY_HEADERS
TRUSTED_PROXY_IPS = client_ip_security.TRUSTED_PROXY_IPS
TRUSTED_PROXY_CIDRS = client_ip_security.TRUSTED_PROXY_CIDRS

_split_env_csv = client_ip_security.split_env_csv
_request_client_host = client_ip_security.request_client_host
_ip_in_trusted_proxy_cidrs = client_ip_security.ip_in_trusted_proxy_cidrs
_first_forwarded_ip = client_ip_security.first_forwarded_ip


def is_trusted_proxy_client(host):
    return client_ip_security.is_trusted_proxy_client(
        host,
        trusted_proxy_ips=TRUSTED_PROXY_IPS,
        trusted_proxy_cidrs=TRUSTED_PROXY_CIDRS,
    )


def get_client_ip(request: Request):
    return client_ip_security.get_client_ip(
        request,
        trust_proxy_headers=TRUST_PROXY_HEADERS,
        trusted_proxy_ips=TRUSTED_PROXY_IPS,
        trusted_proxy_cidrs=TRUSTED_PROXY_CIDRS,
    )


def prune_admin_login_attempts(now=None):
    return admin_auth_security.prune_admin_login_attempts(
        ADMIN_LOGIN_ATTEMPTS,
        window_seconds=ADMIN_LOGIN_WINDOW_SECONDS,
        now=now,
    )


def get_admin_login_state(ip, now=None):
    return admin_auth_security.get_admin_login_state(
        ADMIN_LOGIN_ATTEMPTS,
        ip,
        window_seconds=ADMIN_LOGIN_WINDOW_SECONDS,
        now=now,
    )


def clear_admin_login_state(ip):
    return admin_auth_security.clear_admin_login_state(ADMIN_LOGIN_ATTEMPTS, ip)


def register_admin_login_failure(ip, now=None):
    return admin_auth_security.register_admin_login_failure(
        ADMIN_LOGIN_ATTEMPTS,
        ip,
        max_attempts=ADMIN_LOGIN_MAX_ATTEMPTS,
        window_seconds=ADMIN_LOGIN_WINDOW_SECONDS,
        lock_seconds=ADMIN_LOGIN_LOCK_SECONDS,
        now=now,
    )


def get_admin_lock_remaining_seconds(ip, now=None):
    return admin_auth_security.get_admin_lock_remaining_seconds(
        ADMIN_LOGIN_ATTEMPTS,
        ip,
        window_seconds=ADMIN_LOGIN_WINDOW_SECONDS,
        now=now,
    )


from backend.app.runtime.minigames import (
    MINIGAME_OK_CODE,
    MINIGAME_SPECS,
    SUPPORTED_MINIGAME_TYPES,
    _as_bool,
    _as_float,
    _as_radius,
    _as_str,
    _clean_code,
    _clamp_int,
    _coerce_binary_flag,
    _normalize_degree_label,
    _normalize_frequency_label,
    _normalize_string_list,
    build_stage_minigame_runtime,
    get_minigame_spec,
    normalize_minigame_config,
    validate_minigame_config,
)

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

        color = _as_str(raw.get("color") or "").strip()
        avatar_url = _as_str(raw.get("avatar_url") or "").strip()
        avatar_initials = _as_str(raw.get("avatar_initials") or "").strip()[:3].upper()

        return {
            "id": profile_id,
            "display_name": display_name,
            "mode": mode,
            "members": members,
            "status": status,
            "color": color,
            "avatar_url": avatar_url,
            "avatar_initials": avatar_initials,
        }

    display_name = _as_str(raw, f"PLAYER {index + 1}").strip() or f"PLAYER {index + 1}"
    return {
        "id": display_name,
        "display_name": display_name,
        "mode": "solo",
        "members": [display_name],
        "status": "active",
        "color": "",
        "avatar_url": "",
        "avatar_initials": "",
    }

def get_player_profiles(cfg=None):
    cfg = cfg or load_config()

    raw_profiles = cfg.get("player_profiles")
    if isinstance(raw_profiles, list) and raw_profiles:
        return [normalize_player_profile(item, index=i) for i, item in enumerate(raw_profiles)]

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
    "browser_gps",
}

def get_heartbeat_client_ip(request: Request):
    return get_client_ip(request)


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
    return load_live_positions_state(POSITIONS_DB)

def save_live_positions(data):
    save_live_positions_state(POSITIONS_DB, data)


def get_live_position(user):
    return get_live_position_state(POSITIONS_DB, user)


def upsert_live_position_for_user(user, position):
    return upsert_live_position_state(POSITIONS_DB, user, position)


def load_player_progress():
    return load_game_state(GAME_DB)


def get_player_progress_level(user, default=0):
    return get_player_level(GAME_DB, user, default=default)


def set_player_progress_level(user, level):
    return set_player_level(GAME_DB, user, level)


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
        "color": profile.get("color", ""),
        "avatar_url": profile.get("avatar_url", ""),
        "avatar_initials": profile.get("avatar_initials", ""),
        "presence": presence,
        "last_seen": last_seen,
        "gps_status": gps_status,
        "lat": _as_float(raw.get("lat")),
        "lon": _as_float(raw.get("lon")),
        "source": _as_str(raw.get("source") or "player").strip() or "player",
        "debug_enabled": _as_bool(raw.get("debug_enabled"), False),
    }


from backend.app.runtime.core_engine import (
    _build_success_conditions,
    preserve_physical_stage_fields,
    normalize_stage,
    stage_has_manual_fallback,
    evaluate_entry,
    validate_stage,
    _positive_int,
    read_stage_item_requirement,
)

APP_DIR = Path(__file__).resolve().parent
REACT_DIST_DIR = APP_DIR / "frontend" / "dist"
REACT_INDEX_FILE = REACT_DIST_DIR / "index.html"
REACT_ASSETS_DIR = REACT_DIST_DIR / "assets"
REACT_MANIFEST_FILE = REACT_DIST_DIR / "manifest.webmanifest"
REACT_PUBLIC_MANIFEST_FILE = APP_DIR / "frontend" / "public" / "manifest.webmanifest"

app.mount("/assets", StaticFiles(directory=str(REACT_ASSETS_DIR), check_dir=False), name="react_assets")


def saga_asset_file_response(filename: str, media_type: str):
    dist_file = REACT_DIST_DIR / filename
    public_file = APP_DIR / "frontend" / "public" / filename

    if dist_file.exists():
        return FileResponse(
            dist_file,
            media_type=media_type,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )

    if public_file.exists():
        return FileResponse(
            public_file,
            media_type=media_type,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )

    return JSONResponse({"status": "error", "message": f"{filename} not found"}, status_code=404)


@app.api_route("/saga-app-icon.svg", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_app_icon_svg():
    return saga_asset_file_response("saga-app-icon.svg", "image/svg+xml")


@app.api_route("/favicon.ico", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_favicon_ico():
    return saga_asset_file_response("saga-app-icon-192.png", "image/png")

@app.api_route("/manifest.webmanifest", methods=["GET", "HEAD"])
def react_manifest_webmanifest():
    if REACT_MANIFEST_FILE.exists():
        return FileResponse(
            REACT_MANIFEST_FILE,
            media_type="application/manifest+json",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )

    if REACT_PUBLIC_MANIFEST_FILE.exists():
        return FileResponse(
            REACT_PUBLIC_MANIFEST_FILE,
            media_type="application/manifest+json",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )

    return JSONResponse({"status": "missing_manifest"}, status_code=404)


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


@app.get("/favicon.ico", include_in_schema=False)
async def saga_favicon_ico():
    dist_file = REACT_DIST_DIR / "saga-app-icon-192.png"
    public_file = APP_DIR / "frontend" / "public" / "saga-app-icon-192.png"
    target = dist_file if dist_file.exists() else public_file

    if not target.exists():
        return JSONResponse({"status": "error", "detail": "icon not found"}, status_code=404)

    return FileResponse(
        target,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )




@app.api_route("/saga-app-icon-180.png", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_app_icon_180_png():
    icon_file = APP_DIR / "frontend" / "public" / "saga-app-icon-180.png"
    if icon_file.exists():
        return FileResponse(icon_file, media_type="image/png", headers={"Cache-Control": "no-cache, max-age=0"})
    return JSONResponse({"status": "error", "detail": "icon not found"}, status_code=404)


@app.api_route("/saga-app-icon-192.png", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_app_icon_192_png():
    icon_file = APP_DIR / "frontend" / "public" / "saga-app-icon-192.png"
    if icon_file.exists():
        return FileResponse(icon_file, media_type="image/png", headers={"Cache-Control": "no-cache, max-age=0"})
    return JSONResponse({"status": "error", "detail": "icon not found"}, status_code=404)


@app.api_route("/saga-app-icon-512.png", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_app_icon_512_png():
    icon_file = APP_DIR / "frontend" / "public" / "saga-app-icon-512.png"
    if icon_file.exists():
        return FileResponse(icon_file, media_type="image/png", headers={"Cache-Control": "no-cache, max-age=0"})
    return JSONResponse({"status": "error", "detail": "icon not found"}, status_code=404)


@app.api_route("/apple-touch-icon.png", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_apple_touch_icon_png():
    icon_file = APP_DIR / "frontend" / "public" / "saga-app-icon-180.png"
    if icon_file.exists():
        return FileResponse(icon_file, media_type="image/png", headers={"Cache-Control": "no-cache, max-age=0"})
    return JSONResponse({"status": "error", "detail": "icon not found"}, status_code=404)


@app.api_route("/apple-touch-icon-precomposed.png", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_apple_touch_icon_precomposed_png():
    icon_file = APP_DIR / "frontend" / "public" / "saga-app-icon-180.png"
    if icon_file.exists():
        return FileResponse(icon_file, media_type="image/png", headers={"Cache-Control": "no-cache, max-age=0"})
    return JSONResponse({"status": "error", "detail": "icon not found"}, status_code=404)


@app.api_route("/saga-brand-final.svg", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_brand_final_svg():
    public_file = APP_DIR / "frontend" / "public" / "saga-brand-final.svg"
    if public_file.exists():
        return FileResponse(public_file, media_type="image/svg+xml", headers={"Cache-Control": "no-cache, max-age=0"})
    return JSONResponse({"status": "error", "detail": "brand asset not found"}, status_code=404)


@app.api_route("/saga-header-mark.svg", methods=["GET", "HEAD"], include_in_schema=False)
async def saga_header_mark_svg():
    dist_file = REACT_DIST_DIR / "saga-header-mark.svg"
    public_file = APP_DIR / "frontend" / "public" / "saga-header-mark.svg"

    if dist_file.exists():
        return FileResponse(
            dist_file,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    return FileResponse(
        public_file,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"},
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
        return apply_security_headers(response, request)

    ct = (response.headers.get("content-type") or "").lower()
    if request.method == "GET" and ("text/html" in ct):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["CDN-Cache-Control"] = "no-store"
        response.headers["Surrogate-Control"] = "no-store"

    return apply_security_headers(response, request)

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
async def react_player(name: str, request: Request):
    # Serve the React app directly. The frontend derives the player from /player/{name}.
    # Avoid RedirectResponse here: user-controlled redirect targets trigger CodeQL open-redirect checks.
    response = react_index_or_missing()
    profile = resolve_known_player_profile(name)
    if profile:
        set_player_session_cookie(response, request, profile.get("id") or name)
    else:
        clear_player_session_cookie(response, request)
    return response

@app.head("/admin", response_class=HTMLResponse, include_in_schema=False)
@app.get("/admin")
async def admin_redirect_to_react():
    return Response(status_code=307, headers={"Location": "/admin-react"})


def get_runtime_version_payload():
    return {
        "status": "ok",
        "version": os.getenv("SAGA_VERSION", "dev"),
        "commit": os.getenv("SAGA_COMMIT", "unknown"),
        "built_at": os.getenv("SAGA_BUILD_TIME", ""),
    }


@app.get("/api/version")
async def get_version():
    return get_runtime_version_payload()


# ---------------------------------------------------------------------------
# OSM tile proxy – serves tiles from the same HTTP origin so iOS Safari
# does not block them as "mixed content" when the app runs over plain HTTP.
# ---------------------------------------------------------------------------
_OSM_TILE_BASE = "https://tile.openstreetmap.org"
_TILE_PROXY_HEADERS = {
    "User-Agent": "SAGA-Engine/2.x tile-proxy (self-hosted, https://github.com/odegaard12/Saga-Engine)",
    "Referer": "https://www.openstreetmap.org/",
}

@app.get("/map-tiles/{z}/{x}/{y}.png", include_in_schema=False)
async def osm_tile_proxy(z: int, x: int, y: int):
    """Proxy OSM raster tiles so they are served from the same HTTP origin,
    avoiding iOS Safari mixed-content (HTTPS tile ← HTTP page) restrictions."""
    if z < 0 or z > 19:
        raise HTTPException(status_code=400, detail="Invalid zoom")
    url = f"{_OSM_TILE_BASE}/{z}/{x}/{y}.png"
    if _HTTPX_AVAILABLE:
        try:
            async with _httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers=_TILE_PROXY_HEADERS, follow_redirects=True)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Tile not found upstream")
            return Response(
                content=resp.content,
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            )
        except _httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Tile proxy error: {exc}")
    else:
        # Fallback: redirect the client directly to OSM (may still fail on iOS HTTP)
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=url, status_code=302)


@app.get("/api/config")
async def get_config():
    cfg = load_config()
    return {
        "site_name": cfg.get("site_name", "PUT TITLE HERE"),
        "admin_title": cfg.get("admin_title", "PUT ADMIN TITLE HERE"),
        "admin_subtitle": cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE"),
        "ui_lang": ("en" if str(cfg.get("ui_lang", "es")).strip().lower().startswith("en") else "es"),
        "player_theme": normalize_player_theme(cfg.get("player_theme", "classic")),
        "story_title": cfg.get("story_title", ""),
        "story_text": cfg.get("story_text", ""),
        "prologue_title": cfg.get("prologue_title", "PUT PROLOGUE TITLE HERE"),
        "prologue_subtitle": cfg.get("prologue_subtitle", ""),
        "prologue_body": cfg.get("prologue_body", ""),
        "map_center": cfg.get("map_center", [40.4168, -3.7038]),
        "map_zoom": cfg.get("map_zoom", 13),
        "mapbox_style": cfg.get("mapbox_style", ""),
        "players": cfg.get("players", ["PLAYER 1", "PLAYER 2"]),
        "player_profiles": get_player_profiles(cfg)
    }

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
    raw_stages = load_stages(STAGES_DB)
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
            "success": node["success"],
            "requirements": node.get("requirements", {"items": []}),
            "messages": node["messages"],
        })

    out = preserve_physical_stage_fields(node, out)
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


def _event_payload_code(payload):
    payload = payload if isinstance(payload, dict) else {}
    for key in ("code", "manual_code", "answer", "raw_value"):
        value = _as_str(payload.get(key)).strip()
        if value:
            return value
    return ""

def find_existing_player_client_event(user, client_event_id):
    client_event_id = sanitize_event_text(client_event_id, 160)
    if not client_event_id:
        return None

    try:
        events = list_events(EVENT_LOG_DB, user=user)
    except TypeError:
        events = [
            event
            for event in list_events(EVENT_LOG_DB)
            if _as_str(event.get("user")).strip() == _as_str(user).strip()
        ]

    for event in reversed(events):
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        existing_id = _as_str(event.get("client_event_id") or payload.get("client_event_id")).strip()
        if existing_id == client_event_id:
            return event

    return None


def apply_synced_player_event(normalized_event, user, profile):
    """Apply offline player events that have gameplay side effects.

    node_completed is the key local-first progression event:
    - validates the submitted code against the current official node
    - validates required items against server SQLite event history
    - consumes the required item when configured
    - advances official server progress
    """
    event = normalized_event if isinstance(normalized_event, dict) else {}

    if event.get("type") != "node_completed":
        return append_event(EVENT_LOG_DB, event)

    profile_id = _as_str(profile.get("id") or user).strip() or "PLAYER 1"
    stages = get_runtime_stages()
    current_level = get_player_progress_level(profile_id, get_player_progress_level(user, 0))

    if current_level >= len(stages):
        event["status"] = "ignored"
        event["error"] = "mission_already_complete"
        return append_event(EVENT_LOG_DB, event)

    if current_level < 0:
        current_level = 0

    current_node = stages[current_level]
    # The server is authoritative for progression. Never trust client supplied node_id
    # for node_completed events, even when the submitted code is valid.
    event["node_id"] = _as_str(current_node.get("id"))
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    submitted_code = _event_payload_code(payload)

    if not stage_accepts_code(current_node, submitted_code):
        event["status"] = "failed"
        event["error"] = "invalid_completion_code"
        return append_event(EVENT_LOG_DB, event)

    requirement_status = evaluate_stage_item_requirement(current_node, profile_id)
    if requirement_status.get("required") and not requirement_status.get("ok"):
        event["status"] = "failed"
        event["error"] = "missing_required_item"
        event["payload"] = {
            **payload,
            "requirement": requirement_status,
            "level_before": current_level,
        }
        return append_event(EVENT_LOG_DB, event)

    if requirement_status.get("required") and requirement_status.get("consume"):
        append_inventory_item_used_event(user, profile_id, current_node, requirement_status)

    set_player_progress_level(profile_id, current_level + 1)

    event["status"] = "synced"
    event["payload"] = {
        **payload,
        "requirement": requirement_status,
        "level_before": current_level,
        "level_after": current_level + 1,
        "server_applied": True,
    }
    return append_event(EVENT_LOG_DB, event)


def _safe_runtime_json_file(global_names, fallback):
    for name in global_names:
        path = globals().get(name)
        if not path:
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(fallback, dict) and isinstance(data, dict):
                return data
            if isinstance(fallback, list) and isinstance(data, list):
                return data
        except Exception:
            continue
    return fallback


def _admin_react_stage_summary(stage, index):
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


def _admin_react_profile_summary(profile, gamestate, positions):
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
    }


@app.post("/api/admin/react-overview")
async def admin_react_overview(request: Request):
    data = await request.json()

    if not admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if admin_password_change_required():
        return {
            "status": "password_change_required",
            "message": "Admin password change required before using the React admin overview.",
        }

    cfg = load_config()
    stages = get_runtime_stages()
    profiles = get_player_profiles(cfg)

    gamestate = load_player_progress()
    positions = load_live_positions()

    stage_summaries = [
        _admin_react_stage_summary(stage, idx)
        for idx, stage in enumerate(stages)
    ]

    family_counts = {
        "signal_hunt": 0,
        "bearing_hunt": 0,
        "circuit_matrix": 0,
    }
    for stage in stage_summaries:
        stage_type = stage.get("type")
        if stage_type in family_counts:
            family_counts[stage_type] += 1

    profile_summaries = [
        _admin_react_profile_summary(profile, gamestate, positions)
        for profile in profiles
    ]

    return {
        "status": "ok",
        "config": {
            "site_name": cfg.get("site_name"),
            "admin_title": cfg.get("admin_title"),
            "admin_subtitle": cfg.get("admin_subtitle"),
            "player_theme": cfg.get("player_theme"),
            "map_center": cfg.get("map_center"),
            "map_zoom": cfg.get("map_zoom"),
        },
        "counts": {
            "players": len(cfg.get("players", [])) if isinstance(cfg.get("players"), list) else 0,
            "profiles": len(profiles),
            "stages": len(stage_summaries),
            "finished_profiles": sum(1 for item in profile_summaries if item.get("finished")),
            "family_counts": family_counts,
        },
        "families": [
            {"id": "signal_hunt", "label": "Signal Hunt"},
            {"id": "bearing_hunt", "label": "Bearing Hunt"},
            {"id": "circuit_matrix", "label": "Circuit Matrix"},
        ],
        "stages": stage_summaries,
        "profiles": profile_summaries,
    }


@app.post("/api/admin/mission-status")
async def admin_mission_status(request: Request):
    data = await request.json()

    if not admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    cfg = load_config()
    runtime_stages = get_runtime_stages()
    state = load_player_progress()
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

    if not admin_request_authorized(request, data):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"}
        )

    return load_stages(STAGES_DB)

@app.post("/api/admin/save-config")
async def save_config_endpoint(request: Request):
    data = await request.json()

    if not admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    incoming = data.get("config") or {}
    cfg = load_config()

    if "players" in incoming:
        players = parse_player_entries(incoming.get("players"))
    else:
        players = parse_player_entries(cfg.get("players", ["PLAYER 1", "PLAYER 2"]))

    ui_lang = str(incoming.get("ui_lang", cfg.get("ui_lang", "es"))).strip().lower()
    if ui_lang not in {"es", "en"}:
        ui_lang = "es"

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

    cfg["mapbox_token"] = incoming.get("mapbox_token", cfg.get("mapbox_token", "")).strip()
    cfg["mapbox_style"] = incoming.get("mapbox_style", cfg.get("mapbox_style", "")).strip()

    incoming_profiles = incoming.get("player_profiles")
    if isinstance(incoming_profiles, list) and incoming_profiles:
        normalized_profiles = [
            normalize_player_profile(profile, index=i)
            for i, profile in enumerate(incoming_profiles)
        ]
        cfg["player_profiles"] = normalized_profiles
        cfg["players"] = [
            profile.get("id") or profile.get("display_name") or f"PLAYER {i + 1}"
            for i, profile in enumerate(normalized_profiles)
        ]
    else:
        cfg["players"] = players
        if "player_profiles" in incoming:
            cfg["player_profiles"] = [
                normalize_player_profile(player, index=i)
                for i, player in enumerate(players)
            ]

    save_config(cfg)
    return {"status": "ok", "config": cfg}



def _event_payload(event):
    payload = event.get("payload") if isinstance(event, dict) else {}
    return payload if isinstance(payload, dict) else {}


def _event_inventory_item_id(event):
    payload = _event_payload(event)
    return _as_str(
        payload.get("inventory_item_id")
        or payload.get("item_id")
        or payload.get("id")
    ).strip()


def _event_inventory_quantity(event, default=1):
    payload = _event_payload(event)
    for key in ("inventory_quantity", "quantity", "delta"):
        if key in payload:
            return _positive_int(payload.get(key), default)
    return default


def count_player_inventory_item(user, item_id):
    user_key = _as_str(user).strip()
    item_key = _as_str(item_id).strip()
    if not user_key or not item_key:
        return 0

    total = 0
    events = list_events(EVENT_LOG_DB, user=user_key, limit=10000)

    for event in events:
        event_type = _as_str(event.get("type")).strip()
        payload = _event_payload(event)
        current_item = _event_inventory_item_id(event)

        if current_item != item_key:
            continue

        action = _as_str(payload.get("inventory_action")).strip().lower()

        if event_type == "inventory_item_collected" and action != "used":
            total += _event_inventory_quantity(event, 1)
        elif event_type == "inventory_item_used" or action in {"used", "spent", "consumed"}:
            total -= _event_inventory_quantity(event, 1)

    return max(0, total)


def evaluate_stage_item_requirement(raw_stage, user):
    requirement = read_stage_item_requirement(raw_stage)
    if not requirement:
        return {
            "required": False,
            "ok": True,
            "owned": 0,
            "required_quantity": 0,
            "item_id": "",
            "label": "",
            "consume": False,
        }

    owned = count_player_inventory_item(user, requirement["item_id"])
    required_quantity = requirement["quantity"]

    return {
        "required": True,
        "ok": owned >= required_quantity,
        "owned": owned,
        "required_quantity": required_quantity,
        "item_id": requirement["item_id"],
        "label": requirement["label"],
        "consume": requirement["consume"],
    }


def append_inventory_item_used_event(user, profile_id, current_node, requirement_status):
    node_id = _as_str(current_node.get("id")).strip()
    quantity = _positive_int(requirement_status.get("required_quantity"), 1)

    return append_event(
        EVENT_LOG_DB,
        {
            "type": "inventory_item_used",
            "status": "synced",
            "source": "backend_requirement",
            "user": profile_id,
            "team_id": profile_id,
            "node_id": node_id,
            "payload": {
                "inventory_item_id": requirement_status.get("item_id"),
                "inventory_label": requirement_status.get("label"),
                "inventory_action": "used_by_backend",
                "inventory_quantity": quantity,
                "requested_by": _as_str(user).strip(),
            },
        },
    )


@app.api_route("/sw.js", methods=["GET", "HEAD"])
def player_service_worker():
    sw_file = REACT_DIST_DIR / "sw.js"
    if sw_file.exists():
        return FileResponse(
            sw_file,
            media_type="application/javascript",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Service-Worker-Allowed": "/",
            },
        )

    public_sw_file = Path("frontend/public/sw.js")
    if public_sw_file.exists():
        return FileResponse(
            public_sw_file,
            media_type="application/javascript",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Service-Worker-Allowed": "/",
            },
        )

    return JSONResponse({"status": "missing_service_worker"}, status_code=404)


@app.get("/service-worker.js")
def player_service_worker_alias():
    return player_service_worker()

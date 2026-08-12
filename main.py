from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import json
import io
import re
import zipfile
import base64
import os
import hashlib
import hmac
import secrets
import sqlite3
import time
import ipaddress
import urllib.parse
from datetime import datetime
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
    guardar_posicion_sin_leer_todas,
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
from backend.app.routers import field_proofs, admin, game, assets, public, shell
app.include_router(field_proofs.router)
app.include_router(admin.router)
app.include_router(game.router)
app.include_router(assets.router)
app.include_router(public.router)
app.include_router(shell.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_split_csv_env("SAGA_CORS_ALLOW_ORIGINS"),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "HEAD", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-Requested-With"],
)

# Comprimir lo que sale. No estaba puesto: todas las respuestas viajaban en
# JSON crudo. Es texto muy repetitivo —los mismos nombres de campo por cada
# nodo y por cada jugador— y encoge entre cinco y diez veces. En el monte, con
# una barra de cobertura, eso es la diferencia entre que un refresco entre y que
# se quede a medias.
#
# El umbral evita gastar en comprimir respuestas diminutas, y va DESPUÉS de CORS
# para que las cabeceras se pongan igual.
app.add_middleware(GZipMiddleware, minimum_size=1024)



VALID_PLAYER_THEMES = {"classic", "glass", "flame-red"}

SUPPORTED_UI_LANGS = {"gl", "es", "en"}


def normalize_ui_lang(value):
    """Idioma de la interfaz. El gallego es el idioma de la misión."""
    lang = str(value or "").strip().lower()
    if lang.startswith("gl"):
        return "gl"
    if lang.startswith("en"):
        return "en"
    return "es"


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
        "map_center": [40.4168, -3.7038],
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
TIMERS_DB = os.path.join(DATA_DIR, "game_timers.json")
ADMIN_AUTH_DB = os.path.join(DATA_DIR, "admin_auth.json")
EVENT_LOG_DB = os.path.join(DATA_DIR, "events.json")
ADMIN_SESSIONS_DB = os.path.join(DATA_DIR, "admin_sessions.json")
INVENTORY_DB = os.path.join(DATA_DIR, "inventory.json")

def load_inventory_state():
    return load_json(INVENTORY_DB, {})

def _iso_a_ms(valor):
    """Convierte '2026-08-05T13:19:43.955Z' a milisegundos. 0 si no se entiende."""
    texto = _as_str(valor).strip()
    if not texto:
        return 0
    try:
        return int(datetime.fromisoformat(texto.replace("Z", "+00:00")).timestamp() * 1000)
    except (TypeError, ValueError):
        return 0


def save_player_inventory(user: str, inventory_snapshot: dict):
    """Guarda la mochila que sube el jugador, respetando el último reset.

    El reset del panel de administración deja una marca `reset_at`. El móvil no
    se entera hasta la siguiente recarga, y mientras tanto sube su mochila vieja:
    como aquí se reemplazaba el registro entero, esa subida borraba la marca y
    devolvía las piezas, incluidas las ya fabricadas. El jugador empezaba de
    cero pero con el final resuelto, y ya no había forma de limpiarlo.
    """
    state = load_inventory_state()
    anterior = state.get(user) if isinstance(state.get(user), dict) else {}

    entrante = dict(inventory_snapshot) if isinstance(inventory_snapshot, dict) else {"items": []}

    # Gana la marca más reciente. Si viene una en la entrada es que ESTO es un
    # reset nuevo y manda sobre la guardada; si no, se conserva la que había.
    # (Quedarse siempre con la vieja hacía que un segundo reset no limpiase los
    # móviles que ya se habían enterado del primero.)
    reset_at = max(
        int(anterior.get("reset_at") or 0),
        int(entrante.get("reset_at") or 0),
    )

    if reset_at > 0:
        subida_at = _iso_a_ms(entrante.get("updated_at"))
        tiene_objetos = bool(entrante.get("items"))
        if tiene_objetos and subida_at and subida_at < reset_at:
            # Mochila de la partida anterior: se ignora y se deja la marca.
            return
        # La marca sobrevive para que la lean también los demás dispositivos.
        entrante["reset_at"] = reset_at

    state[user] = entrante
    save_json(INVENTORY_DB, state)

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
# Una semana. Eran doce horas, y en una gimcana que se prepara un dia y se juega
# al siguiente el pase caducaba entre medias: el servidor rechazaba el avance
# con un 403, el nodo no se guardaba, y el movil lo daba por bueno igual. Aqui
# no hay nada delicado que proteger -es un juego de catorce personas-, y que
# caduque a mitad de la ruta cuesta mucho mas que lo que ahorra.
PLAYER_SESSION_TTL_SECONDS = int(os.getenv("PLAYER_SESSION_TTL_SECONDS", "604800") or "604800")
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


def hay_sesion_de_algun_jugador(request: Request):
    """¿Quien pregunta es un jugador de esta misión, sea cual sea?

    Distinto de `require_player_session`, que ata la petición a UN jugador
    concreto. Hay cosas que un jugador ve de todo el grupo —las fotos de campo
    salen en el mapa de todos— y ahí lo que hay que comprobar es que sea alguien
    de dentro, no quién.
    """
    datos = player_session_security.read_player_session_token(
        request.cookies.get(PLAYER_SESSION_COOKIE),
        secret=get_session_signing_secret(),
    )

    if not datos:
        return False

    return bool(resolve_known_player_profile(datos.get("user")))


def exigir_ser_del_grupo(request: Request):
    """Cierra la puerta a quien no esté jugando.

    Estos datos estaban abiertos a internet. Sin sesión, sin contraseña y sin
    saber nada, `GET /api/field-proofs` devolvía las 17 fotos de la ruta con el
    NOMBRE de quien la hizo, las COORDENADAS exactas y el nodo, y la imagen se
    descargaba entera desde su URL. Comprobado contra sagagia.es el 2026-08-09.

    Para una ruta entre amigos ya era feo. Para vender esto a un colegio es
    inaceptable, por muchos permisos firmados que haya: el consentimiento cubre
    hacer la foto, no publicarla.

    El pase de jugador no es una identificación fuerte —se consigue entrando en
    la misión—, pero corta a los buscadores, a los rastreadores y a cualquiera
    que no sepa un nombre de jugador. Contra eso, lo que protege de verdad es no
    guardar lo que no hace falta y borrarlo al acabar la ruta.
    """
    if hay_sesion_de_algun_jugador(request):
        return

    # El panel también entra: desde ahí se revisan y se descargan las fotos.
    if verify_admin_session_token(request.cookies.get(ADMIN_SESSION_COOKIE)):
        return

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
    """Guarda dónde está un jugador.

    No devuelve nada: quien llama a esto —el latido, trece móviles cada cinco
    segundos— no usaba el resultado, y calcularlo obligaba a leer la tabla
    entera de posiciones cada vez. Para la tabla del grupo está
    `load_live_positions`.
    """
    return guardar_posicion_sin_leer_todas(POSITIONS_DB, user, position)


def _hash_corto(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8", errors="replace")).hexdigest()[:10]


def aligerar_avatar(perfil: dict) -> dict:
    """Cambia la foto incrustada por una referencia a /api/player-avatar.

    Las fotos se guardan como data URI en base64 dentro del perfil. La tabla de
    equipo se pide cada 5 segundos, y con las fotos dentro esa respuesta era el
    87 % foto: 43 KB con dos jugadores retratados, y proyectando las catorce,
    271 KB por petición. Trece móviles a ese ritmo son 700 KB/s saliendo de la
    Raspberry por el túnel, cada segundo de la travesía, para mandar una y otra
    vez las mismas caras.

    Ahora va la URL de un endpoint aparte que el navegador y el service worker
    cachean: se descarga una vez por jugador y se olvida. El `v=` es el hash de
    la imagen, así que si se cambia una foto en administración la URL cambia y se
    vuelve a bajar sola.
    """
    if not isinstance(perfil, dict):
        return perfil

    foto = _as_str(perfil.get("avatar_url") or "")
    if not foto.startswith("data:"):
        # URL externa o sin foto: no hay nada que aligerar.
        return perfil

    pid = _as_str(perfil.get("id") or perfil.get("user") or "").strip()
    if not pid:
        return perfil

    ligero = dict(perfil)
    ligero["avatar_url"] = ""
    ligero["avatar_ref"] = (
        f"/api/player-avatar/{urllib.parse.quote(pid, safe='')}?v={_hash_corto(foto)}"
    )
    return ligero


def buscar_avatar_de(profile_id: str):
    """Data URI de la foto de un jugador, o None."""
    objetivo = _as_str(profile_id).strip()
    if not objetivo:
        return None

    for perfil in get_player_profiles(load_config()):
        if _as_str(perfil.get("id")).strip() == objetivo:
            foto = _as_str(perfil.get("avatar_url") or "")
            return foto if foto.startswith("data:") else None
    return None


def clear_live_position(user):
    """Borra la última posición conocida de un jugador.

    Se usa al resetear: un jugador a cero no ha estado en ninguna parte todavía,
    y dejarle la posición de la partida anterior lo pintaba en el mapa —a veces
    en mitad de la ruta— como si ya estuviese andando.
    """
    user_key = _as_str(user).strip()
    if not user_key:
        return

    estado = load_live_positions()
    if not isinstance(estado, dict) or user_key not in estado:
        return

    estado.pop(user_key, None)
    save_live_positions(estado)


def load_player_progress():
    return load_game_state(GAME_DB)


def load_player_timers():
    return load_json(TIMERS_DB, {})

def save_player_timers(timers):
    save_json(TIMERS_DB, timers)

def record_player_stage_time(user, level, time_ms):
    timers = load_player_timers()
    user_key = str(user or "").strip()
    if not user_key:
        return
    if user_key not in timers:
        timers[user_key] = {"stage_times_ms": {}}
    
    stage_times = timers[user_key].setdefault("stage_times_ms", {})
    lvl_str = str(level)
    
    # SET the time for this level - do not accumulate across retries.
    # The client sends the correct elapsed time; penalties are added explicitly.
    # Using the max of existing vs new prevents regression when called multiple times.
    existing = stage_times.get(lvl_str, 0)
    stage_times[lvl_str] = max(existing, int(time_ms or 0))
    save_player_timers(timers)


def _now_ms():
    return int(time.time() * 1000)


def mark_player_started(user):
    """Guarda cuándo empezó a jugar, la primera vez que completa algo.

    El tiempo total era la suma de lo que se pasaba DENTRO de cada pantalla, así
    que caminar siete kilómetros entre nodos contaba cero: una ruta entera daba
    veinticinco segundos y la clasificación no medía nada. Lo que cuenta es el
    reloj: desde que arrancas hasta que acabas.
    """
    timers = load_player_timers()
    user_key = str(user or "").strip()
    if not user_key:
        return

    entrada = timers.setdefault(user_key, {"stage_times_ms": {}})
    if not entrada.get("started_at"):
        entrada["started_at"] = _now_ms()
        save_player_timers(timers)


def mark_player_finished(user):
    timers = load_player_timers()
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return

    timers[user_key]["finished_at"] = _now_ms()
    save_player_timers(timers)


def add_player_penalty(user, penalty_ms):
    """Suma una penalización al tiempo total (código de respaldo, fallos...)."""
    penalty = int(penalty_ms or 0)
    if penalty <= 0:
        return

    timers = load_player_timers()
    user_key = str(user or "").strip()
    if not user_key:
        return

    entrada = timers.setdefault(user_key, {"stage_times_ms": {}})
    entrada["penalties_ms"] = int(entrada.get("penalties_ms") or 0) + penalty
    save_player_timers(timers)


def clear_all_player_timers(user):
    """Completely wipe all stage timer data for a player. Called on full profile reset."""
    timers = load_player_timers()
    user_key = str(user or "").strip()
    if not user_key:
        return
    if user_key in timers:
        timers[user_key]["stage_times_ms"] = {}
        # Las penalizaciones y las marcas de inicio y fin también: si no, un
        # jugador reiniciado arrancaba la partida nueva con los minutos que le
        # habían caído en la anterior.
        timers[user_key].pop("penalties_ms", None)
        timers[user_key].pop("started_at", None)
        timers[user_key].pop("finished_at", None)
        timers[user_key].pop("current_stage_started_at", None)
        save_player_timers(timers)

def clear_player_stage_time(user, level):
    timers = load_player_timers()
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return
    stage_times = timers[user_key].setdefault("stage_times_ms", {})
    lvl_str = str(level)
    if lvl_str in stage_times:
        stage_times[lvl_str] = 0
    save_player_timers(timers)

def get_player_progress_level(user, default=0):
    return get_player_level(GAME_DB, user, default=default)

def set_player_progress_level(user, level, penalty_ms=0, desde_admin=False):
    if penalty_ms > 0:
        record_player_stage_time(user, level, penalty_ms)

    objetivo = int(level or 0)

    # Volver al nodo 1 es empezar de cero, tambien en el reloj.
    #
    # Al resetear se borraban los tiempos de los nodos pero NO las
    # penalizaciones, asi que un jugador reseteado arrancaba la partida nueva
    # arrastrando los minutos que le habian caido en la anterior.
    if objetivo <= 0:
        clear_all_player_timers(user)
        return set_player_level(GAME_DB, user, 0)

    # HACIA ATRAS NO SE VA.
    #
    # Este es el fallo que se persiguio todo el dia: un nodo ya superado que de
    # pronto volvia a estar por hacer, la pantalla en la salida con el tiempo a
    # cero, y al rato todo de vuelta en su sitio. Pasaba jugando en casa y con
    # wifi, asi que no era cobertura.
    #
    # Da igual de donde venga el numero mas bajo -una respuesta que llega tarde,
    # una peticion repetida, un movil que guardo datos de antes-: lo hecho,
    # hecho esta. Para deshacerlo esta el reset, que entra por el camino de
    # arriba con un cero explicito.
    #
    # Menos cuando lo pide el organizador desde el panel: ahi el numero mas bajo
    # no es un rebote, es una correccion a mano y tiene que entrar.
    actual = int(get_player_progress_level(user, 0) or 0)
    if objetivo < actual and not desde_admin:
        return load_game_state(GAME_DB)

    # Retroceder desde el panel borra el reloj de lo que se va a repetir.
    #
    # Se devolvia al jugador a un nodo anterior y los tiempos de los nodos que
    # tenia que rehacer seguian guardados: el marcador arrancaba la repeticion
    # con segundos de una partida que ya no cuenta -un 00:04 de la nada- y al
    # superar el nodo otra vez se quedaba el mayor de los dos, no el nuevo.
    # Si se vuelve atras es para rehacerlo, y rehacerlo empieza en cero.
    if objetivo < actual and desde_admin:
        for nivel in range(objetivo, actual + 1):
            clear_player_stage_time(user, nivel)

    # Volver al nodo 1 es empezar de cero, tambien en el reloj.
    #
    # Al resetear se borraban los tiempos de los nodos pero NO las
    # penalizaciones, asi que un jugador reseteado arrancaba la partida nueva
    # arrastrando los minutos que le habian caido en la anterior: dos minutos de
    # un codigo de respaldo, por ejemplo, sin que nada lo dijera en pantalla.
    if int(level or 0) <= 0:
        clear_all_player_timers(user)
        return set_player_level(GAME_DB, user, level)

    # If the level is explicitly set (e.g. by an admin), we should clear any future stage times
    # to avoid the timer holding onto times from nodes they are replaying.
    timers = load_player_timers()
    user_key = str(user or "").strip()
    if user_key and user_key in timers:
        stage_times = timers[user_key].get("stage_times_ms", {})
        keys_to_remove = [k for k in list(stage_times.keys()) if k.isdigit() and int(k) >= level]
        for k in keys_to_remove:
            del stage_times[k]
        save_player_timers(timers)

    return set_player_level(GAME_DB, user, level)

def get_player_total_time_ms(user):
    """Tiempo dentro de las pruebas más las penalizaciones.

    NO es reloj de pared. Todos los equipos hacen la ruta juntos y a la vez, así
    que el tiempo de caminar es el mismo para todos y no distingue a nadie: lo
    que decide la clasificación es lo que cuesta cada reto. Cuenta desde que se
    abre el nodo hasta que se supera —incluido el rato mirando el patrón del
    laberinto o la foto del mosaico, y cada vez que se vuelve a mirar— más lo
    que sumen los fallos y los códigos de respaldo.
    """
    timers = load_player_timers()
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return 0

    entrada = timers[user_key]
    penalizaciones = int(entrada.get("penalties_ms") or 0)
    return sum(entrada.get("stage_times_ms", {}).values()) + penalizaciones

def get_player_is_playing(user):
    # Sin timers en backend, podemos devolver False. El cliente gestiona su propio estado interactivo.
    return False

def get_player_stage_time_ms(user, level):
    timers = load_player_timers()
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return 0
    return timers[user_key].get("stage_times_ms", {}).get(str(level), 0)


def project_live_profile_status(
    profile, raw=None, now=None, total_nodes=None, timers=None, progress=None
):
    now = int(now or time.time())
    raw = raw if isinstance(raw, dict) else {}

    # total_nodes, timers y progress los pasa quien proyecta varios perfiles
    # seguidos (la tabla de equipo son 13 llamadas cada 5 s).
    #
    # Sin esto cada perfil releía del disco la ruta, los tiempos y el progreso:
    # con 13 jugadores eran casi 40 lecturas de fichero por petición, y medido
    # en la Raspberry el equipo tardaba ~700 ms de media con picos de 1,1 s.
    if total_nodes is None:
        total_nodes = len(get_runtime_stages())
    if timers is None:
        timers = load_player_timers()
    if progress is None:
        progress = load_player_progress()

    profile_id = profile.get("id")
    level = progress.get(profile_id, 0) if isinstance(progress, dict) else 0
    try:
        level = int(level)
    except (TypeError, ValueError):
        level = 0

    entrada_timer = timers.get(str(profile_id)) if isinstance(timers, dict) else None
    if isinstance(entrada_timer, dict):
        total_time_ms = (
            sum(entrada_timer.get("stage_times_ms", {}).values())
            + int(entrada_timer.get("penalties_ms") or 0)
        )
    else:
        total_time_ms = 0

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
        "total_time_ms": total_time_ms,
        "is_playing": False,
        "level": level,
        # Sin esto la clasificación no sabía quién había acabado: todos los
        # rivales salían como "Nodo N" para siempre y la pantalla final no
        # podía esperar a que terminase el grupo.
        "finished": total_nodes > 0 and level >= total_nodes,
        "total_nodes": total_nodes,
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

# Las rutas del frontend compilado, el servidor de estaticos y la version
# viven ahora en backend/app/build_frontend.py. Se reexportan aqui porque
# los routers todavia las piden por main mientras se rompe el ciclo.
from backend.app.build_frontend import (  # noqa: E402
    APP_DIR,
    REACT_ASSETS_DIR,
    REACT_DIST_DIR,
    REACT_INDEX_FILE,
    REACT_MANIFEST_FILE,
    REACT_PUBLIC_MANIFEST_FILE,
    get_runtime_version_payload,
    react_index_or_missing,
    saga_asset_file_response,
)

app.mount("/assets", StaticFiles(directory=str(REACT_ASSETS_DIR), check_dir=False), name="react_assets")


# Los iconos, las marcas y el manifiesto viven ahora en
# backend/app/routers/assets.py. Aqui habia ademas DOS manejadores de
# /favicon.ico con el mismo nombre de funcion: solo respondia el primero.


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

# Las pantallas -/, /player/{name}, /admin-react y /admin- viven ahora en
# backend/app/routers/shell.py. Con esto main.py se queda sin rutas: solo
# el ensamblado de la aplicacion y los ayudantes que usan los routers.


# /api/version, /api/config, /api/player-avatar, las teselas del mapa y el
# service worker viven ahora en backend/app/routers/public.py.


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


def stages_revision(runtime_stages=None):
    """Huella del contenido de la misión: cambia sólo si cambian los nodos.

    El móvil necesita los nodos ENTEROS para jugar sin cobertura: el minijuego,
    su configuración, la foto del mosaico y el código que acepta. Eso son 200 KB,
    y el jugador pedía la partida cada 30 segundos, al volver a la aplicación y
    al recuperar la red. En el monte, con una barra de cobertura, eso es la
    misma foto bajándose una y otra vez durante tres horas: lento, caro y para
    nada, porque la misión no cambia mientras se juega.

    Con esta huella el móvil pide lo pesado UNA vez y después sólo pregunta por
    su estado —nivel, tiempo, mochila—, que son 28 KB. Si la huella cambia
    (has tocado algo en administración), se vuelve a bajar todo.
    """
    stages = runtime_stages if runtime_stages is not None else get_runtime_stages()

    try:
        serializado = json.dumps(stages, sort_keys=True, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        # Antes que dar una huella falsa —que dejaría al jugador con nodos
        # viejos para siempre—, se declara "no sé": el móvil bajará todo.
        return ""

    return hashlib.sha1(serializado.encode("utf-8")).hexdigest()[:16]

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

def stage_accepts_code(raw_stage, code, manual=False):
    """¿Este código supera el nodo?

    `manual` marca que viene de una casilla escrita a mano —el código de
    respaldo—, no de un minijuego ganado. Importa porque el motor añade a todos
    los nodos una condición interna con la que los minijuegos avisan de que se
    han superado. Esa palabra la acepta CUALQUIER nodo: escrita en la casilla de
    respaldo saltaba el que fuera, sin los dos minutos de penalización y sin
    jugar. Desde una casilla de texto ya no vale.
    """
    node = raw_stage if isinstance(raw_stage, dict) and raw_stage.get("version") == 2 else normalize_stage(raw_stage)
    submitted = _clean_code(code)

    if not submitted:
        return False

    for condition in node["success"]["conditions"]:
        if manual and condition.get("kind") == "minigame_ok":
            continue
        expected = _clean_code(condition.get("value"))
        if expected and submitted == expected:
            return True

    # El código impreso en la pegatina ES el código del nodo. Sin esto,
    # escanear el QR correcto guardaba el objeto pero no completaba el nodo, y
    # teclear "SAGA_01" como respaldo tampoco valía.
    for expected in _stage_qr_payloads(raw_stage):
        if expected and submitted == expected:
            return True

    return False


def _stage_qr_payloads(raw_stage):
    """Códigos impresos en las pegatinas QR de un nodo."""
    if not isinstance(raw_stage, dict):
        return []

    values = [raw_stage.get("qr_payload")]

    config = raw_stage.get("config")
    if isinstance(config, dict):
        values.append(config.get("qr_payload"))

    physical = raw_stage.get("physical_qr")
    if isinstance(physical, dict):
        values.append(physical.get("payload"))

    return [_clean_code(value) for value in values if value]


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

    # Idempotencia: el jugador encola node_completed cuando /api/advance falla
    # (timeout con mala cobertura). Si la petición sí llegó al servidor, al
    # sincronizar la cola se avanzaba OTRA VEZ y se saltaba un nodo entero
    # dándolo por completado sin haber estado allí.
    # level_before dice en qué nodo estaba el jugador al completar: si el
    # servidor ya está por delante, el evento es un duplicado.
    raw_payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    level_before_raw = raw_payload.get("level_before")
    if isinstance(level_before_raw, bool):
        level_before_raw = None
    try:
        level_before = int(level_before_raw) if level_before_raw is not None else None
    except (TypeError, ValueError):
        level_before = None

    if level_before is not None and level_before < current_level:
        event["status"] = "ignored"
        event["error"] = "already_advanced"
        event["payload"] = {
            **raw_payload,
            "server_level": current_level,
            "duplicate_of_level": level_before,
        }
        return append_event(EVENT_LOG_DB, event)

    current_node = stages[current_level]
    # The server is authoritative for progression. Never trust client supplied node_id
    # for node_completed events, even when the submitted code is valid.
    event["node_id"] = _as_str(current_node.get("id"))
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    submitted_code = _event_payload_code(payload)

    # Un nodo completado sin conexión llega por aquí al recuperar la red. Si se
    # encoló desde la casilla de respaldo escrita a mano, sigue sin valer el
    # aviso interno de los minijuegos.
    if not stage_accepts_code(current_node, submitted_code, manual=_as_bool(payload.get("manual"))):
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

    time_spent_ms = payload.get("time_spent_ms")
    if time_spent_ms is not None:
        record_player_stage_time(profile_id, current_level, int(time_spent_ms))

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


def _admin_react_profile_summary(profile, gamestate, positions, inventory_state=None):
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


# Las cuatro rutas de administracion que vivian aqui (react-overview,
# mission-status, stages y save-config) estaban escritas TAMBIEN en
# backend/app/routers/admin.py, que es el que responde: los routers se
# incluyen en la primera linea de este fichero, asi que estas copias no se
# ejecutaban nunca. Editarlas no cambiaba nada. Ver tests/test_rutas_duplicadas.py.

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

    collected = 0
    used = 0
    events = list_events(EVENT_LOG_DB, user=user_key, limit=10000)

    for event in events:
        event_type = _as_str(event.get("type")).strip()
        payload = _event_payload(event)
        current_item = _event_inventory_item_id(event)

        if current_item != item_key:
            continue

        action = _as_str(payload.get("inventory_action")).strip().lower()

        if event_type == "inventory_item_used" or action in {"used", "spent", "consumed"}:
            used += _event_inventory_quantity(event, 1)
        elif event_type == "inventory_item_collected":
            collected += _event_inventory_quantity(event, 1)
        elif action == "collected":
            # Los escaneos QR/NFC del jugador llegan como qr_scanned/nfc_url_opened
            # con inventory_action=collected en el payload.
            collected += _event_inventory_quantity(event, 1)

    # El snapshot de inventario sincronizado por el jugador cubre los objetos
    # creados en la mesa de trabajo (crafteo local), que no generan eventos.
    snapshot_quantity = 0
    try:
        inventory_state = load_inventory_state()
        snapshot = inventory_state.get(user_key)
        if not isinstance(snapshot, dict):
            snapshot = inventory_state.get(_as_str(user))
        items = snapshot.get("items") if isinstance(snapshot, dict) else None
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                if _as_str(item.get("item_id")).strip() != item_key:
                    continue
                if _as_str(item.get("state")).strip().lower() == "used":
                    continue
                snapshot_quantity += _positive_int(item.get("quantity"), 1)
    except Exception:
        snapshot_quantity = 0

    return max(0, max(collected, snapshot_quantity) - used)


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

    # Con .get() en lugar de indexar: un requisito al que le falte una clave
    # debe poder bloquear el nodo, nunca tumbar /api/advance con un 500. Un
    # error aquí es invisible para el jugador, porque el cliente cae a su copia
    # local y sigue como si nada mientras el servidor se queda atrás.
    item_id = str(requirement.get("item_id") or "").strip()
    owned = count_player_inventory_item(user, item_id)
    required_quantity = _positive_int(requirement.get("quantity"), 1)

    return {
        "required": True,
        "ok": owned >= required_quantity,
        "owned": owned,
        "required_quantity": required_quantity,
        "item_id": item_id,
        "label": str(requirement.get("label") or item_id),
        "consume": bool(requirement.get("consume", False)),
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



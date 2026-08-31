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
    save_game_state,
    set_player_level,
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
from backend.app.runtime import player_timers as _player_timers
from backend.app.runtime import player_profiles as _player_profiles
from backend.app.runtime import mision_reindex as _mision_reindex
from backend.app.runtime import live_positions as _live_positions
from backend.app.runtime import player_events as _player_events
from backend.app.runtime import admin_overview as _admin_overview
from backend.app.runtime import mission_schedule as _mission_schedule

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



VALID_PLAYER_THEMES = {"glass", "flame-red"}

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
    theme = str(value or "glass").strip().lower()
    return theme if theme in VALID_PLAYER_THEMES else "glass"

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
        "player_theme": "glass",
        "data_dir": "data"
    })
    if not isinstance(cfg, dict):
        cfg = {}
    
    cfg["player_theme"] = normalize_player_theme(cfg.get("player_theme", "glass"))
    
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


def huella_de_imagen(dato_uri) -> str:
    """Huella corta del contenido de una foto, para meterla en su URL.

    Va en la URL para que la respuesta pueda declararse inmutable y cachearse un
    anio entero. Si la foto cambia, cambia la URL, y nadie se queda con la
    vieja. Una direccion fija con contenido cambiante obligaria al navegador a
    preguntar cada vez, que es justo el viaje que se quiere ahorrar.
    """
    texto = _as_str(dato_uri)
    if not texto:
        return ""
    return hashlib.sha1(texto.encode("utf-8")).hexdigest()[:12]


def player_reset_at(user) -> int:
    """El milisegundo del último reinicio de este jugador. 0 si nunca lo han reiniciado."""
    record = load_inventory_state().get(user)
    if not isinstance(record, dict):
        return 0
    try:
        return int(record.get("reset_at") or 0)
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

VALID_PROFILE_MODES = _player_profiles.VALID_PROFILE_MODES

def parse_player_entries(raw_players):
    return _player_profiles.parse_player_entries(raw_players)

def normalize_player_profile(raw, index=0):
    return _player_profiles.normalize_player_profile(raw, index=index)

def get_player_profiles(cfg=None):
    return _player_profiles.get_player_profiles(cfg or load_config())

def profile_matches_user(profile, user_text):
    return _player_profiles.profile_matches_user(profile, user_text)


def get_player_profile(user, cfg=None):
    return _player_profiles.get_player_profile(cfg or load_config(), user)

HEARTBEAT_STALE_SECONDS = _live_positions.HEARTBEAT_STALE_SECONDS
HEARTBEAT_MIN_INTERVAL_SECONDS = _live_positions.HEARTBEAT_MIN_INTERVAL_SECONDS
HEARTBEAT_RATE_WINDOW_SECONDS = _live_positions.HEARTBEAT_RATE_WINDOW_SECONDS
# MISMO diccionario que el del módulo, no una copia: game.py lo muta
# directamente (main.HEARTBEAT_LAST_SEEN_BY_KEY[clave] = ahora).
HEARTBEAT_LAST_SEEN_BY_KEY = _live_positions.HEARTBEAT_LAST_SEEN_BY_KEY

VALID_HEARTBEAT_GPS_STATUS = _live_positions.VALID_HEARTBEAT_GPS_STATUS
VALID_HEARTBEAT_SOURCES = _live_positions.VALID_HEARTBEAT_SOURCES

def get_heartbeat_client_ip(request: Request):
    return get_client_ip(request)


def prune_heartbeat_rate_state(now=None):
    _live_positions.prune_heartbeat_rate_state(now or time.time())

def normalize_heartbeat_gps_status(value):
    return _live_positions.normalize_heartbeat_gps_status(value)

def normalize_heartbeat_source(value):
    return _live_positions.normalize_heartbeat_source(value)

def resolve_known_player_profile(user, cfg=None):
    return _live_positions.resolve_known_player_profile(cfg or load_config(), user)

def load_live_positions():
    return _live_positions.load_live_positions(POSITIONS_DB)

def save_live_positions(data):
    _live_positions.save_live_positions(POSITIONS_DB, data)


def get_live_position(user):
    return _live_positions.get_live_position(POSITIONS_DB, user)


def upsert_live_position_for_user(user, position):
    return _live_positions.upsert_live_position_for_user(POSITIONS_DB, user, position)


def _hash_corto(texto: str) -> str:
    return _live_positions._hash_corto(texto)


def aligerar_avatar(perfil: dict) -> dict:
    return _live_positions.aligerar_avatar(perfil)


def buscar_avatar_de(profile_id: str):
    return _live_positions.buscar_avatar_de(load_config(), profile_id)


def clear_live_position(user):
    _live_positions.clear_live_position(POSITIONS_DB, user)


def load_player_progress():
    return _player_timers.load_player_progress(GAME_DB)


def load_player_timers():
    return _player_timers.load_player_timers(TIMERS_DB)

def save_player_timers(timers):
    _player_timers.save_player_timers(TIMERS_DB, timers)

def record_player_stage_time(user, level, time_ms):
    _player_timers.record_player_stage_time(TIMERS_DB, user, level, time_ms)


def _now_ms():
    return _player_timers._now_ms()


def mark_player_started(user):
    _player_timers.mark_player_started(TIMERS_DB, user)


def mark_player_finished(user):
    _player_timers.mark_player_finished(TIMERS_DB, user)


def add_player_penalty(user, penalty_ms):
    _player_timers.add_player_penalty(TIMERS_DB, user, penalty_ms)


def clear_all_player_timers(user):
    _player_timers.clear_all_player_timers(TIMERS_DB, user)

def clear_player_stage_time(user, level):
    _player_timers.clear_player_stage_time(TIMERS_DB, user, level)

def get_player_progress_level(user, default=0):
    return _player_timers.get_player_progress_level(GAME_DB, user, default=default)

def set_player_progress_level(user, level, penalty_ms=0, desde_admin=False):
    return _player_timers.set_player_progress_level(
        TIMERS_DB, GAME_DB, user, level, penalty_ms=penalty_ms, desde_admin=desde_admin
    )

def reindex_player_levels_on_save(old_stages, new_stages):
    """Recoloca el nivel guardado de cada jugador cuando se edita la misión.

    Se llama desde `save_stages_endpoint` justo después de guardar los nodos
    nuevos, con la lista de ANTES y la de DESPUÉS. Ver
    backend/app/runtime/mision_reindex.py para el porqué y el cómo.
    """
    niveles = load_game_state(GAME_DB)
    reindexados = _mision_reindex.reindex_player_levels(old_stages, new_stages, niveles)
    if reindexados != niveles:
        save_game_state(GAME_DB, reindexados)


def get_player_total_time_ms(user):
    return _player_timers.get_player_total_time_ms(TIMERS_DB, user)

def get_player_is_playing(user):
    return _player_timers.get_player_is_playing(user)

def get_player_stage_time_ms(user, level):
    return _player_timers.get_player_stage_time_ms(TIMERS_DB, user, level)


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


# Los nodos de la mision -leerlos, validarlos y prepararlos para el jugador-
# viven ahora en backend/app/runtime/mision.py. Se reexportan porque los routers
# todavia los piden por main mientras se rompe el import circular.
from backend.app.runtime.mision import (  # noqa: E402
    project_stage_for_player,
    stage_accepts_code,
    stage_qr_payloads as _stage_qr_payloads,
    validate_stages,
)
from backend.app.runtime import mision as _mision  # noqa: E402


def mission_is_locked(cfg=None):
    """¿Toca esperar todavía para completar nodos? Ver runtime/mission_schedule.py."""
    cfg = cfg or load_config()
    return _mission_schedule.mission_is_locked(cfg.get("mission_launch_at"))


def get_runtime_stages():
    """Los nodos de la mision, normalizados.

    Se queda aqui porque necesita saber DONDE estan guardados, y eso lo decide
    la configuracion del despliegue.
    """
    raw_stages = load_stages(STAGES_DB)
    if not isinstance(raw_stages, list):
        return []
    return [normalize_stage(stage) for stage in raw_stages]


def stages_revision(runtime_stages=None):
    """Huella del contenido de la mision. Ver runtime/mision.py."""
    stages = runtime_stages if runtime_stages is not None else get_runtime_stages()
    return _mision.stages_revision(stages)


PLAYER_EVENT_TYPES = _player_events.PLAYER_EVENT_TYPES
EVENT_PAYLOAD_MAX_KEYS = _player_events.EVENT_PAYLOAD_MAX_KEYS
EVENT_PAYLOAD_MAX_TEXT_LENGTH = _player_events.EVENT_PAYLOAD_MAX_TEXT_LENGTH

def sanitize_event_text(value, max_length=EVENT_PAYLOAD_MAX_TEXT_LENGTH):
    return _player_events.sanitize_event_text(value, max_length)

def sanitize_event_payload(value):
    return _player_events.sanitize_event_payload(value)

def normalize_player_event(raw_event, user, profile):
    return _player_events.normalize_player_event(raw_event, user, profile)


def _event_payload_code(payload):
    return _player_events.event_payload_code(payload)

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

    # La misión puede tener fecha de inicio (ver runtime/mission_schedule.py):
    # se puede descargar y prepararse con días de antelación, pero no
    # completar nodos hasta esa hora.
    #
    # A PROPOSITO no se guarda con append_event: si quedara escrito con este
    # client_event_id, el PRÓXIMO intento lo encontraría por
    # find_existing_player_client_event y lo cerraría como "duplicate" antes
    # de volver a pasar por aquí -el mismo camino que ya usa
    # already_advanced-, y el nodo no se completaría NUNCA aunque llegase la
    # hora. Sin guardar nada, cada reintento de la cola vuelve a mirar el
    # reloj desde cero.
    #
    # "failed", no "ignored": según syncPendingOfflineEvents en
    # missionPack.ts, "ignored" cierra el hueco local como si ya estuviera
    # resuelto y deja de reintentarse. "failed" con un motivo que no está en
    # RECHAZOS_DEFINITIVOS es justo lo que hace que el móvil lo vuelva a
    # mandar en el siguiente ciclo, solo.
    if mission_is_locked():
        event["status"] = "failed"
        event["error"] = "mission_not_started_yet"
        return event

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

    # Un reinicio tiene que aguantar a la cola vieja del móvil.
    #
    # El candado de arriba es por NIVEL y protege contra avances repetidos: si el
    # servidor ya va por delante, el evento es un eco. Pero después de reiniciar a
    # alguien a 0, un evento de la partida ANTERIOR con `level_before: 0` encaja
    # perfectamente —el servidor está en 0, el evento dice que venía del 0— y le
    # vuelve a avanzar.
    #
    # Visto en producción el 2026-08-17: se reinicia a un jugador con el móvil
    # abierto y al rato el servidor está otra vez en 1 él solo. El móvil seguía
    # marcando 2/10 hasta borrarle localStorage y las tres bases de IndexedDB. En
    # día de ruta eso deja al organizador sin forma de arreglar nada.
    #
    # Lo que distingue una cosa de la otra ya viajaba y nadie lo miraba: el móvil
    # manda `payload.local_created_at` con la fecha en que encoló el avance, y
    # aquí está `reset_at`. Anterior al reinicio = partida borrada.
    reset_at = player_reset_at(profile_id) or player_reset_at(user)
    creado_ms = _iso_a_ms(raw_payload.get("local_created_at"))
    if reset_at and creado_ms and creado_ms < reset_at:
        event["status"] = "ignored"
        event["error"] = "stale_before_reset"
        event["payload"] = {
            **raw_payload,
            "reset_at": reset_at,
            "event_created_ms": creado_ms,
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


def _admin_react_stage_summary(stage, index):
    return _admin_overview.admin_stage_summary(stage, index)


def _admin_react_profile_summary(profile, gamestate, positions, inventory_state=None):
    return _admin_overview.admin_profile_summary(profile, gamestate, positions, inventory_state)


# Las cuatro rutas de administracion que vivian aqui (react-overview,
# mission-status, stages y save-config) estaban escritas TAMBIEN en
# backend/app/routers/admin.py, que es el que responde: los routers se
# incluyen en la primera linea de este fichero, asi que estas copias no se
# ejecutaban nunca. Editarlas no cambiaba nada. Ver tests/test_rutas_duplicadas.py.

# La mochila -que objetos lleva un jugador y si le sirven para abrir un nodo-
# vive ahora en backend/app/runtime/mochila.py. Aqui se quedan las dos funciones
# que necesitan saber DONDE estan guardados los eventos y el inventario.
from backend.app.runtime import mochila as _mochila  # noqa: E402

_event_payload = _mochila.payload_del_evento
_event_inventory_item_id = _mochila.item_del_evento
_event_inventory_quantity = _mochila.cantidad_del_evento


def count_player_inventory_item(user, item_id):
    """Cuantas unidades de un objeto tiene alguien.

    La mochila no se guarda como una lista: se reconstruye sumando los eventos
    y contrastandolos con la copia que sube el movil. Los eventos cubren lo que
    se recoge en un nodo; la copia cubre lo que se forja en la mesa de trabajo,
    que pasa entero en el telefono y no deja evento. Ver runtime/mochila.py.
    """
    user_key = _as_str(user).strip()
    if not user_key:
        return 0

    eventos = list_events(EVENT_LOG_DB, user=user_key, limit=10000)

    try:
        inventario = load_inventory_state()
        copia = inventario.get(user_key)
        if not isinstance(copia, dict):
            copia = inventario.get(_as_str(user))
    except Exception:
        copia = {}

    return _mochila.contar_objeto(eventos, copia, user_key, item_id)


def evaluate_stage_item_requirement(raw_stage, user):
    """Puede abrirse este nodo con lo que lleva encima."""
    requisito = read_stage_item_requirement(raw_stage)
    tiene = (
        count_player_inventory_item(user, str(requisito.get("item_id") or "").strip())
        if requisito
        else 0
    )
    return _mochila.evaluar_requisito(raw_stage, tiene)


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



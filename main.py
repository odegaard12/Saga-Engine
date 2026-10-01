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
import threading
from datetime import datetime, timezone
from pathlib import Path
try:
    import httpx as _httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

from backend.app.storage.json_store import clean_stale_locks, load_json, save_json, update_json
from backend.app.storage import runtime_store as _runtime_store
from backend.app.storage.runtime_store import load_document, load_stages, save_document, save_stages
from backend.app.storage.game_state_store import (
    get_player_level,
    load_game_state,
    reset_player_level,
    save_game_state,
    set_player_level,
)
from backend.app.storage.event_store import (
    append_event,
    count_events,
    find_event_by_client_id,
    list_events,
    mark_event_status,
)
from backend.app.security import admin_auth as admin_auth_security
from backend.app.security import client_ip as client_ip_security
from backend.app.security import clave_de_sesion as clave_de_sesion_security
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
from backend.app.runtime import personajes as _personajes
from backend.app.runtime import player_events as _player_events
from backend.app.runtime import admin_overview as _admin_overview
from backend.app.runtime import mission_schedule as _mission_schedule
from backend.app.runtime import match_log as _match_log
from backend.app.runtime import entradas as _entradas
from backend.app.runtime import reloj_del_movil as _reloj_del_movil
from backend.app.runtime import revisiones as _revisiones
from backend.app.storage import match_log_store as _match_log_store

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

_CORS_ALLOW_ORIGINS = [o for o in _split_csv_env("SAGA_CORS_ALLOW_ORIGINS") if o != "*"]
if "*" in _split_csv_env("SAGA_CORS_ALLOW_ORIGINS"):
    print(
        "[WARN] SAGA_CORS_ALLOW_ORIGINS='*' ignorado: no se puede combinar con "
        "cookies de sesion (allow_credentials). Lista los origenes explicitos."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ALLOW_ORIGINS,
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


# El almacén no pudo escribir ahora (un `.lock` ajeno que no se suelta, SQLite
# ocupada o el disco lleno). Antes el `TimeoutError` se tragaba dentro del
# almacén y el servidor contestaba «ok» sin haber guardado nada (caza de fallos
# S7); ahora sube hasta aquí y el móvil recibe un 503 que sabe reintentar.
@app.exception_handler(TimeoutError)
async def _almacen_ocupado(request, exc):
    return JSONResponse(
        status_code=503,
        content={"status": "error", "detail": "storage_busy"},
        headers={"Retry-After": "2"},
    )


@app.exception_handler(sqlite3.OperationalError)
async def _almacen_no_disponible(request, exc):
    return JSONResponse(
        status_code=503,
        content={"status": "error", "detail": "storage_unavailable"},
        headers={"Retry-After": "2"},
    )



VALID_PLAYER_THEMES = {"glass", "flame-red", "sage-green"}

SUPPORTED_UI_LANGS = {"gl", "es", "en"}

# Qué motor dibuja el mapa del jugador.
#
# `leaflet` es el de siempre y el único completo: lo que juega la gente.
# `maplibre` es el nuevo, en WebGL, que se está portando por capas -le
# faltan cosas, la lista está en frontend/.../mapSurfaceContract.ts-. Se
# elige por misión para poder comparar los dos en un móvil de verdad sin
# arriesgar una partida. El defecto NO cambia hasta que el nuevo gane en
# todo.
VALID_MAP_ENGINES = {"leaflet", "maplibre"}


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


def normalize_map_engine(value):
    """Un valor desconocido cae en Leaflet, que es el motor completo.

    Preferir lo conocido no es cobardía aquí: un nombre mal escrito en la
    configuración no puede dejar a alguien en el monte con un mapa a
    medio portar.
    """
    engine = str(value or "leaflet").strip().lower()
    return engine if engine in VALID_MAP_ENGINES else "leaflet"

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
    cfg["map_engine"] = normalize_map_engine(cfg.get("map_engine", "leaflet"))
    
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
# Un corte de luz o un `docker kill` a mitad de una escritura deja un `.lock`
# huérfano: sin esto, cada escritura de ese fichero esperaba diez segundos en el
# bucle de eventos y luego se perdía en silencio (caza de fallos S7). A esta
# hora nadie de este proceso puede tener ninguno cogido.
clean_stale_locks(DATA_DIR)
GAME_DB = os.path.join(DATA_DIR, "gamestate.json")
STAGES_DB = os.path.join(DATA_DIR, "stages.json")
POSITIONS_DB = os.path.join(DATA_DIR, "positions.json")
TIMERS_DB = os.path.join(DATA_DIR, "game_timers.json")
PERSONAJES_DB = os.path.join(DATA_DIR, "personajes.json")
ADMIN_AUTH_DB = os.path.join(DATA_DIR, "admin_auth.json")
EVENT_LOG_DB = os.path.join(DATA_DIR, "events.json")
ADMIN_SESSIONS_DB = os.path.join(DATA_DIR, "admin_sessions.json")
INVENTORY_DB = os.path.join(DATA_DIR, "inventory.json")
# Sospechas de trampa (ver backend/app/runtime/anti_cheat.py): FLAG, no
# bloqueo. Fichero aparte de events.json porque esto no es un evento de
# partida, es una anotación para que el organizador la revise.
ANTI_CHEAT_DB = os.path.join(DATA_DIR, "anti_cheat.json")
# Racha de tramos consecutivos con velocidad implausible entre nodos, por
# jugador. Aparte de anti_cheat.json: esto no es una sospecha, es sólo la
# cuenta que decide si la siguiente lo es (ver check_travel_speed).
SPEED_STREAK_DB = os.path.join(DATA_DIR, "speed_streak.json")
# Si ya se avisó (nota "info", no sospecha) de que este jugador está en una
# sesión de GPS manual/debug -ver anti_cheat.note_manual_position-. Aparte de
# anti_cheat.json por el mismo motivo que SPEED_STREAK_DB: no es una sospecha,
# es el estado que decide si hace falta anotar otra.
MANUAL_POSITION_NOTICE_DB = os.path.join(DATA_DIR, "manual_position_notice.json")
# Tiempos de partida LIMPIOS (no flagueados) por game_id, en esta misión.
# Es la base de "lo normal aquí" que usa check_completion_time como red de
# seguridad antes de flaguear un tiempo por debajo del suelo físico (ver
# backend/app/runtime/anti_cheat.py, MIN_MUESTRAS_PARA_MEDIANA). Aparte de
# anti_cheat.json: esto no son sospechas, son datos de referencia.
COMPLETION_TIME_SAMPLES_DB = os.path.join(DATA_DIR, "completion_time_samples.json")
# Registro de partida (ver backend/app/runtime/match_log.py): la bitácora
# completa por jugador para revisar después de la ruta. Fichero SQLite propio
# -no events.json- porque tiene su propio límite de tamaño y su propio
# borrado (purga de datos personales), y no depende de qué backend de
# eventos esté activo.
MATCH_LOG_DB = _match_log_store.resolve_match_log_path(DATA_DIR)
# Clave con la que se firman los pases de jugador cuando no hay SECRET_KEY en el
# entorno (ver backend/app/security/clave_de_sesion.py). Se crea una vez con el
# valor que ya estaba en uso, y a partir de ahí cambiar la contraseña del
# administrador no invalida los pases de los jugadores.
SESSION_KEY_DB = os.path.join(DATA_DIR, "session_key.json")

def load_inventory_state():
    return load_json(INVENTORY_DB, {})

def _iso_a_ms(valor):
    """Convierte '2026-08-05T13:19:43.955Z' a milisegundos. 0 si no se entiende."""
    texto = _as_str(valor).strip()
    if not texto:
        return 0
    try:
        return int(datetime.fromisoformat(texto.replace("Z", "+00:00")).timestamp() * 1000)
    except (TypeError, ValueError, OverflowError, OSError):
        # OverflowError/OSError: `timestamp()` de un año 0001 o 9999 según el sistema.
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
    return _entradas.entero_seguro(record.get("reset_at"), 0, minimo=0)


def save_player_inventory(user: str, inventory_snapshot: dict, desde_admin: bool = False):
    """Guarda la mochila que sube el jugador, respetando el último reset.

    El reset del panel de administración deja una marca `reset_at`. El móvil no
    se entera hasta la siguiente recarga, y mientras tanto sube su mochila vieja:
    como aquí se reemplazaba el registro entero, esa subida borraba la marca y
    devolvía las piezas, incluidas las ya fabricadas. El jugador empezaba de
    cero pero con el final resuelto, y ya no había forma de limpiarlo.

    La entrada se SANEA antes de guardarla (ver `mochila.sanear_mochila`): una
    marca `reset_at` con basura o unos `items` que no son una lista abortaban
    `/api/events/sync` entero, y luego rompían las acciones del panel sobre esa
    mochila (caza de fallos S16). `desde_admin` es la mochila que escribe el
    organizador: nunca se descarta por «vieja».

    Es UNA lectura-modificación-escritura bajo el cerrojo del fichero.
    """
    entrante = _mochila.sanear_mochila(inventory_snapshot)

    def _guardar(state):
        state = state if isinstance(state, dict) else {}
        anterior = state.get(user) if isinstance(state.get(user), dict) else {}

        # Gana la marca más reciente. Si viene una en la entrada es que ESTO es un
        # reset nuevo y manda sobre la guardada; si no, se conserva la que había.
        # (Quedarse siempre con la vieja hacía que un segundo reset no limpiase los
        # móviles que ya se habían enterado del primero.)
        reset_at = max(
            _entradas.entero_seguro(anterior.get("reset_at"), 0, minimo=0),
            _entradas.entero_seguro(entrante.get("reset_at"), 0, minimo=0),
        )

        nueva = dict(entrante)
        if reset_at > 0:
            subida_at = _iso_a_ms(nueva.get("updated_at"))
            tiene_objetos = bool(nueva.get("items"))
            if not desde_admin and tiene_objetos and subida_at and subida_at < reset_at:
                # Mochila de la partida anterior: se ignora y se deja la marca.
                return state
            # La marca sobrevive para que la lean también los demás dispositivos.
            nueva["reset_at"] = reset_at

        state[user] = nueva
        return state

    update_json(INVENTORY_DB, {}, _guardar)


def bump_reset_marker(user, items_vacios=False):
    """Sube la marca `reset_at` de este jugador: «adopta lo que dice el servidor».

    La marca vive en la mochila del jugador (`inventory.json[user].reset_at`, ms
    desde la época) y viaja al móvil dentro de `inventory_snapshot.reset_at` al
    pedir `/api/game/{user}`. El móvil sólo cede ante su propia copia cuando la
    marca del servidor es más nueva que la última que vio; por eso cualquier
    acción del organizador que BAJE el nivel de alguien o le QUITE objetos tiene
    que subirla (si no, el móvil ignora los niveles más bajos y vuelve a subir
    su mochila vieja: el «✓ Aplicado» del panel no llegaba nunca al jugador).

    Devuelve la marca nueva. Siempre estrictamente mayor que la anterior.
    """
    ahora = int(time.time() * 1000)
    resultado = {"marca": ahora}

    def _subir(state):
        state = state if isinstance(state, dict) else {}
        registro = state.get(user) if isinstance(state.get(user), dict) else {"user": user, "items": []}
        anterior = _entradas.entero_seguro(registro.get("reset_at"), 0, minimo=0)
        marca = max(ahora, anterior + 1)
        resultado["marca"] = marca
        nuevo = {**registro, "reset_at": marca,
                 "updated_at": datetime.fromtimestamp(marca / 1000.0, tz=timezone.utc)
                 .isoformat(timespec="milliseconds").replace("+00:00", "Z")}
        if items_vacios:
            nuevo["items"] = []
        state[user] = nuevo
        return state

    update_json(INVENTORY_DB, {}, _subir)
    return resultado["marca"]

BOOTSTRAP_ADMIN_PASS = (os.getenv("ADMIN_PASS") or "").strip()
ALLOW_DEFAULT_ADMIN = (os.getenv("ALLOW_DEFAULT_ADMIN") or "0").strip() == "1"
ADMIN_RESET = (os.getenv("ADMIN_RESET") or "0").strip() == "1"

ADMIN_LOGIN_WINDOW_SECONDS = 600
ADMIN_LOGIN_MAX_ATTEMPTS = 5
ADMIN_LOGIN_LOCK_SECONDS = 600
ADMIN_LOGIN_ATTEMPTS = {}

# Contraseña de misión: una sola, compartida por todo el grupo. Cierra la
# entrada de jugadores -sin ella, saber un nombre bastaba para colarse y ver
# el mapa del grupo y las fotos-. Se guarda cifrada en data/mission_auth.json
# y se cambia desde el panel de administración. MISSION_PASS (entorno) sólo es
# la semilla inicial: si no hay clave guardada, la primera vez se toma de ahí.
# Sin clave guardada ni semilla, la puerta está desactivada y el motor público
# funciona exactamente igual que antes.
MISSION_PASS = (os.getenv("MISSION_PASS") or "").strip()
MISSION_AUTH_DB = os.path.join(DATA_DIR, "mission_auth.json")
MISSION_COOKIE = "saga_mission"
MISSION_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 180
MISSION_UNLOCK_WINDOW_SECONDS = 600
MISSION_UNLOCK_MAX_ATTEMPTS = 10
MISSION_UNLOCK_LOCK_SECONDS = 600
MISSION_UNLOCK_ATTEMPTS = {}

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


_ADMIN_SESSIONS_LOCK = threading.Lock()


def verify_admin_session_token(token):
    """¿Es válida esta sesión de administración?

    Sin cookie no se toca el disco: `GET /api/team/x` sin sesión (o cualquier
    ruta de jugador que pregunta «¿y si es el panel?») cargaba Y GUARDABA
    `admin_sessions` en cada llamada, con su fsync. Y con cookie sólo se guarda
    si algo cambió (una sesión caducada que se poda). Caza de fallos S1.
    """
    token = str(token or "").strip()
    if not token:
        return False

    with _ADMIN_SESSIONS_LOCK:
        sessions = admin_auth_security.load_admin_sessions(ADMIN_SESSIONS_DB)
        antes = set(sessions)
        valid = admin_auth_security.verify_admin_session_token(sessions, token)
        ADMIN_SESSIONS.clear()
        ADMIN_SESSIONS.update(sessions)
        if set(sessions) != antes:
            admin_auth_security.save_admin_sessions(ADMIN_SESSIONS_DB, sessions)
    return valid


def invalidate_other_admin_sessions(keep_token):
    """Cierra todas las sesiones de administración menos `keep_token`."""
    with _ADMIN_SESSIONS_LOCK:
        cerradas = admin_auth_security.invalidate_other_admin_sessions(ADMIN_SESSIONS_DB, keep_token)
        ADMIN_SESSIONS.clear()
        ADMIN_SESSIONS.update(admin_auth_security.load_admin_sessions(ADMIN_SESSIONS_DB))
    return cerradas


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
    """La clave con la que se firman los pases de jugador y la cookie de misión.

    1. `SECRET_KEY` del entorno, si existe (producción no la tiene).
    2. Si no, la clave del fichero `session_key.json` del directorio de datos.
    3. Si tampoco existe, se crea AHORA con el valor que ya estaba en uso -el
       `sal:hash` de la contraseña del administrador- para que los pases y las
       cookies que ya llevan los móviles sigan valiendo. Desde entonces cambiar la
       contraseña del administrador no toca a los jugadores (caza de fallos S18).
    """
    explicit = str(os.getenv("SECRET_KEY") or "").strip()
    if explicit:
        return explicit

    guardada = clave_de_sesion_security.leer_clave(SESSION_KEY_DB)
    if guardada:
        return guardada

    auth = load_admin_auth()
    salt = str(auth.get("salt") or "").strip()
    password_hash = str(auth.get("password_hash") or "").strip()
    if salt and password_hash:
        return clave_de_sesion_security.crear_clave(
            SESSION_KEY_DB, f"{salt}:{password_hash}", origen="admin-hash-al-crearse"
        )

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


# Clave de la misión (cookie y bloqueo por intentos): ver backend/app/runtime/clave_de_mision_glue.py.
from backend.app.runtime.clave_de_mision_glue import (  # noqa: E402,F401
    load_mission_auth,
    save_mission_auth,
    mission_gate_enabled,
    set_mission_password,
    ensure_mission_auth,
    _mission_cookie_value,
    mission_unlocked,
    require_mission_unlocked,
    check_mission_password,
    set_mission_cookie,
    clear_mission_cookie,
    mission_unlock_lock_remaining_seconds,
    register_mission_unlock_failure,
    clear_mission_unlock_state,
)


ensure_mission_auth()


# Sesión de jugador, cabeceras de seguridad y límites de ritmo: ver backend/app/runtime/seguridad_jugador_glue.py.
from backend.app.runtime.seguridad_jugador_glue import (  # noqa: E402,F401
    hay_sesion_de_algun_jugador,
    exigir_ser_del_grupo,
    apply_security_headers,
    prune_player_rate_limit_bucket,
    enforce_player_rate_limit,
    clear_player_rate_limits,
)


TRUST_PROXY_HEADERS = client_ip_security.TRUST_PROXY_HEADERS
TRUSTED_PROXY_IPS = client_ip_security.TRUSTED_PROXY_IPS
TRUSTED_PROXY_CIDRS = client_ip_security.TRUSTED_PROXY_CIDRS

if not TRUST_PROXY_HEADERS:
    # Detras de un tunel/reverse-proxy (Cloudflare) todas las peticiones llegan
    # con la IP del proxy. El lockout de login admin es por IP: sin esto, 5
    # fallos de CUALQUIERA bloquean al admin real, y atacante y admin comparten
    # contador. Con el tunel hay que poner TRUST_PROXY_HEADERS=1 y
    # TRUSTED_PROXY_IPS con la IP del proxy (p.ej. 127.0.0.1).
    print(
        "[WARN] TRUST_PROXY_HEADERS=0: si SAGA corre tras un tunel/proxy, el "
        "lockout de login admin es global (DoS trivial). Ver docs/security/client-ip.md"
    )

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


def load_personajes():
    return _personajes.cargar_elegidos(PERSONAJES_DB)


def con_personaje(perfil, elegidos=None):
    return _personajes.con_personaje(perfil, load_personajes() if elegidos is None else elegidos)


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


def record_player_advance(user, at_ms=None):
    return _player_timers.record_player_advance(TIMERS_DB, user, at_ms)


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

        # Quien BAJA de nivel por el guardado (se borró un nodo que ya había
        # superado, se reordenó) tiene que enterarse: el móvil ignora los niveles
        # más bajos que el suyo, así que sin subir su marca `reset_at` seguiría
        # jugando con el número viejo. Quien terminaba y sigue terminado no
        # cuenta: sólo cambia el total.
        for jugador, antes in niveles.items():
            despues = reindexados.get(jugador, antes)
            termino_antes = int(antes or 0) >= len(old_stages)
            termina_despues = int(despues or 0) >= len(new_stages)
            if int(despues or 0) < int(antes or 0) and not (termino_antes and termina_despues):
                bump_reset_marker(jugador)


def get_player_total_time_ms(user):
    return _player_timers.get_player_total_time_ms(TIMERS_DB, user)

def get_player_is_playing(user):
    return _player_timers.get_player_is_playing(user)

def get_player_stage_time_ms(user, level):
    return _player_timers.get_player_stage_time_ms(TIMERS_DB, user, level)


from backend.app.runtime import anti_cheat as _anti_cheat  # noqa: E402


# Anti-trampas y estado en vivo del perfil: ver backend/app/runtime/anti_trampas_glue.py.
from backend.app.runtime.anti_trampas_glue import (  # noqa: E402,F401
    anti_cheat_check_travel_speed,
    anti_cheat_note_manual_position,
    anti_cheat_check_completion_time,
    anti_cheat_check_future_timestamp,
    anti_cheat_check_client_reported_exit,
    anti_cheat_check_declared_time,
    anti_cheat_count_coordinates,
    anti_cheat_scrub_coordinates,
    anti_cheat_review_evidence,
    list_anti_cheat_suspicions,
    count_anti_cheat_suspicions,
    project_live_profile_status,
)


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
    fuzzy_search_circle,
    hot_cold_band_es,
    project_stage_for_player,
    stage_accepts_code,
    stage_qr_payloads as _stage_qr_payloads,
    validate_stages,
)
from backend.app.runtime import mision as _mision  # noqa: E402
# `haversine_m` ya vive en `_anti_cheat` (importado más arriba); se reexporta
# aquí con su propio nombre para que game.py lo pida como `main.haversine_m`.
haversine_m = _anti_cheat.haversine_m  # noqa: E402


def mission_is_locked(cfg=None):
    """¿Toca esperar todavía para completar nodos? Ver runtime/mission_schedule.py."""
    cfg = cfg or load_config()
    return _mission_schedule.mission_is_locked(cfg.get("mission_launch_at"))


def match_log_is_active(cfg=None):
    """¿Hay que escribir en el Registro de partida ahora mismo?

    Ver backend/app/runtime/match_log.py: sólo mientras la misión está
    PROGRAMADA (`mission_launch_at` puesta) y ACTIVA (esa hora ya llegó).
    """
    cfg = cfg or load_config()
    locked = mission_is_locked(cfg)
    return _match_log.is_active(cfg, mission_locked=locked)


# Registro de partida: ver backend/app/runtime/registro_partida_glue.py.
from backend.app.runtime.registro_partida_glue import (  # noqa: E402,F401
    match_log_display_name,
    match_log_record,
    match_log_record_many,
    match_log_record_position,
    match_log_record_session_open,
    match_log_list_timeline,
    match_log_count,
    match_log_purge,
    match_log_to_csv,
    match_log_offline_sync_delay_ms,
    _clamp_penalty_ms,
    match_log_offline_context,
    _match_log_anti_cheat_sink,
)


_anti_cheat.configure_match_log_sink(_match_log_anti_cheat_sink)


def get_runtime_stages():
    """Los nodos de la mision, normalizados.

    Se queda aqui porque necesita saber DONDE estan guardados, y eso lo decide
    la configuracion del despliegue.
    """
    raw_stages = load_stages(STAGES_DB)
    if not isinstance(raw_stages, list):
        return []
    return [normalize_stage(stage) for stage in raw_stages]


def count_runtime_stages():
    """Cuántos nodos tiene la misión, sin cargar ni normalizar ninguno.

    Para los sitios que sólo necesitan el total (el latido, la tabla del equipo):
    `len(get_runtime_stages())` leía, decodificaba y normalizaba TODA la misión,
    fotos incluidas, en cada latido de cada móvil.
    """
    return _runtime_store.count_stages(STAGES_DB)


def stages_revision(runtime_stages=None):
    """Huella del contenido de la mision. Ver runtime/mision.py."""
    stages = runtime_stages if runtime_stages is not None else get_runtime_stages()
    return _mision.stages_revision(stages)


_HUELLA_DE_NODOS_EN_MEMORIA = {}


def _huella_de_nodos_cacheada():
    """`stages_revision()` sin releer y normalizar toda la misión en cada petición.

    `/api/config` la pide cada 30 s desde cada móvil. La clave es la firma de los
    nodos guardados (`stages_signature`: cuántos y la fecha del último guardado),
    que cambia con cualquier guardado, también uno que llegue por fuera (la réplica
    recibe los ficheros por rsync); la copia caduca sola a los 5 min por si acaso.
    """
    clave = (STAGES_DB, os.getenv("SAGA_SQLITE_DB") or "", _runtime_store.stages_signature(STAGES_DB))
    ahora = time.monotonic()
    guardada = _HUELLA_DE_NODOS_EN_MEMORIA.get("v")
    if guardada and guardada[0] == clave and ahora - guardada[1] < 300.0:
        return guardada[2]
    huella = stages_revision()
    _HUELLA_DE_NODOS_EN_MEMORIA["v"] = (clave, ahora, huella)
    return huella


def mission_revision(cfg=None, stages_rev=None):
    """Huella de TODO lo que el móvil se baja de la misión (ver runtime/revisiones.py).

    Cambia si cambia el contenido o las coordenadas de los nodos, la versión de la
    proyección por jugador, las fotos de los jugadores, el centro/zoom del mapa o
    la red de caminos. La pantalla de carga del jugador la usa para decidir
    «misión cambiada». Va en `/api/config` y en `/api/game/{user}`.
    """
    from backend.app.runtime import road_graph

    cfg = cfg if isinstance(cfg, dict) else load_config()
    return _revisiones.mission_revision(
        stages_rev if stages_rev is not None else _huella_de_nodos_cacheada(),
        cfg,
        get_player_profiles(cfg),
        str(road_graph.ruta_fichero(DATA_DIR)),
    )


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
    """El evento de este jugador con ese `client_event_id`, si ya estaba guardado.

    Por ÍNDICE (`user`, `client_event_id`), no leyendo y decodificando todos los
    eventos del jugador: con la cola sin cobertura volcándose cada evento
    tardaba más que el anterior (1,7 s el décimo) y el servidor no atendía a
    nadie más hasta acabar (caza de fallos S2).
    """
    client_event_id = sanitize_event_text(client_event_id, 160)
    if not client_event_id:
        return None

    return find_event_by_client_id(EVENT_LOG_DB, user, client_event_id)


def _nodo_del_evento(event, stages, level_before, current_level):
    """El id del nodo de que trata un avance, para poder decirle al jugador cuál.

    Primero el que declara el móvil si existe en la misión; si no, el nodo al que
    decía llegar (`level_before`); si no, el que le toca al servidor.
    """
    ids = [_as_str(stage.get("id")) for stage in stages if isinstance(stage, dict)]
    declarado = _as_str(event.get("node_id")).strip()
    if declarado and declarado in ids:
        return declarado
    if level_before is not None and 0 <= level_before < len(ids):
        return ids[level_before]
    if 0 <= current_level < len(ids):
        return ids[current_level]
    return declarado


def _comprobar_tiempo_declarado(profile_id, node, declarado_ms, instante_ms):
    """Anota cuándo se completó este nodo y MARCA (no bloquea) un tiempo imposible.

    El servidor sólo observa cuándo llega cada avance; lo que el jugador tardó
    dentro del nodo lo declara el móvil. Si lo declarado no cabe entre el avance
    anterior y éste, queda una sospecha: la clasificación no se toca. Sin hora
    fiable del avance (un evento de la cola sin `local_created_at`) no se compara.
    """
    if not instante_ms:
        return
    previo = record_player_advance(profile_id, instante_ms)
    declarado = _entradas.entero_seguro(declarado_ms, None, minimo=0)
    if previo and declarado:
        anti_cheat_check_declared_time(profile_id, node, declarado, instante_ms - previo)


def apply_synced_player_event(normalized_event, user, profile, active=None):
    """Apply offline player events that have gameplay side effects.

    node_completed is the key local-first progression event:
    - validates the submitted code against the current official node
    - validates required items against server SQLite event history
    - consumes the required item when configured
    - advances official server progress

    `active` dice si el Registro de partida está escribiendo ahora mismo. Quien
    sincroniza una tanda lo calcula UNA vez y lo pasa (antes se releía la
    configuración por cada muestra de posición). Sin él se calcula aquí, una vez
    por evento.
    """
    event = normalized_event if isinstance(normalized_event, dict) else {}
    if active is None:
        active = match_log_is_active()

    if event.get("type") != "node_completed":
        # Anti-trampas del CLIENTE durante un minijuego (salir de la app /
        # abrir el selector de apps: ver useAntiTrampas.ts). Llega por esta
        # misma cola -no un endpoint aparte- para que funcione también sin
        # cobertura: es exactamente el mismo camino offline-first que ya usa
        # cualquier otro evento del jugador.
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        razon = _as_str(payload.get("anti_cheat_reason")).strip()
        profile_id_evento = _as_str(profile.get("id") or user).strip() or "PLAYER 1"
        if razon in ("left_app_during_minigame", "opened_app_switcher_during_minigame"):
            anti_cheat_check_client_reported_exit(
                profile_id_evento, razon, {**payload, "node_id": event.get("node_id") or payload.get("node_id")}
            )

        # Registro de partida: todo lo demás que llega por la cola offline
        # -nodo abierto, QR, mochila, minijuego, equipo- se anota tal cual,
        # con su tipo de evento como tipo de fila. node_completed tiene su
        # propio camino más abajo porque además avanza progreso de verdad.
        #
        # Con la hora ORIGINAL del móvil (`client_created_at`), cuánto tardó
        # en llegar y si se creó sin cobertura: al revisar la partida en casa
        # lo que importa es cuándo pasó, no cuándo se subió.
        contexto = match_log_offline_context(payload)
        if event.get("type") == "position_track":
            # Todas las muestras del evento, en UNA transacción.
            _registrar_track_de_posiciones(profile_id_evento, payload, contexto, profile, active=active)
            # Las posiciones sólo se guardan si hay partida que auditar (misión
            # programada y en marcha). Fuera de esa ventana el evento consta,
            # pero sin coordenadas: no se acumulan sitios donde estuvo la gente
            # sin un motivo.
            if not active:
                event["payload"] = {**payload, "samples": []}
        else:
            match_log_record(
                event.get("type") or "player_event",
                profile_id_evento,
                payload={
                    **payload,
                    "node_id": event.get("node_id"),
                    "via": payload.get("via") or "offline_queue",
                    **contexto,
                },
                client_created_at=_as_str(payload.get("local_created_at")) or None,
                profile=profile,
                active=active,
            )
        return append_event(EVENT_LOG_DB, event)

    profile_id = _as_str(profile.get("id") or user).strip() or "PLAYER 1"
    stages = get_runtime_stages()
    current_level = get_player_progress_level(profile_id, get_player_progress_level(user, 0))

    # level_before dice en qué nodo estaba el jugador al completar. Se lee ya
    # aquí porque también sirve para decir de QUÉ nodo era un avance rechazado.
    raw_payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    level_before = _entradas.entero_seguro(raw_payload.get("level_before"), None)

    if current_level >= len(stages):
        event["status"] = "ignored"
        event["error"] = "mission_already_complete"
        event["node_id"] = _nodo_del_evento(event, stages, level_before, current_level)
        _registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
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
        event["node_id"] = _nodo_del_evento(event, stages, level_before, current_level)
        return event

    # Idempotencia: el jugador encola node_completed cuando /api/advance falla
    # (timeout con mala cobertura). Si la petición sí llegó al servidor, al
    # sincronizar la cola se avanzaba OTRA VEZ y se saltaba un nodo entero
    # dándolo por completado sin haber estado allí.
    # level_before dice en qué nodo estaba el jugador al completar: si el
    # servidor ya está por delante, el evento es un duplicado.
    if level_before is not None and level_before < current_level:
        event["status"] = "ignored"
        event["error"] = "already_advanced"
        event["node_id"] = _nodo_del_evento(event, stages, level_before, current_level)
        event["payload"] = {
            **raw_payload,
            "server_level": current_level,
            "duplicate_of_level": level_before,
        }
        _registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
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
    #
    # Esa fecha es la del RELOJ DEL MÓVIL: quien sincroniza (ver
    # `sync_player_events`) la corrige con `client_sent_at_ms` antes de llegar
    # aquí si el móvil la manda, para que un reloj atrasado o adelantado no
    # descarte un avance legítimo ni deje resucitar uno viejo.
    reset_at = player_reset_at(profile_id) or player_reset_at(user)
    creado_ms = _iso_a_ms(raw_payload.get("local_created_at"))
    if reset_at and creado_ms and creado_ms < reset_at:
        event["status"] = "ignored"
        event["error"] = "stale_before_reset"
        event["node_id"] = _nodo_del_evento(event, stages, level_before, current_level)
        event["payload"] = {
            **raw_payload,
            "reset_at": reset_at,
            "event_created_ms": creado_ms,
        }
        _registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
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
        _registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
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
        _registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
        return append_event(EVENT_LOG_DB, event)

    if requirement_status.get("required") and requirement_status.get("consume"):
        append_inventory_item_used_event(user, profile_id, current_node, requirement_status)

    # Anti-trampas (ver backend/app/runtime/anti_cheat.py): sólo anota, nunca
    # bloquea la sincronización. Un evento que llegó por la cola offline es
    # justo el caso que más hace falta vigilar -nadie estaba mirando en
    # directo mientras pasaba- y el que más hay que perdonar -sin cobertura
    # el reloj del móvil y el GPS son los que hay-.
    anti_cheat_check_completion_time(profile_id, current_node, payload.get("time_spent_ms"))
    anti_cheat_check_future_timestamp(
        profile_id, _iso_a_ms(raw_payload.get("local_created_at")) or None, node_id=current_node.get("id")
    )

    # Igual que level_before arriba: un evento de la cola offline puede llegar
    # con este campo corrupto (móvil viejo, IndexedDB a medias...). Sin
    # protegerlo, un solo evento así tiraba abajo TODO /api/events/sync con un
    # 500 y ningún evento de la tanda -ni los válidos- llegaba a sincronizarse.
    time_spent_ms = payload.get("time_spent_ms")
    if time_spent_ms is not None:
        try:
            record_player_stage_time(profile_id, current_level, max(0, int(time_spent_ms)))
        except (TypeError, ValueError, OverflowError):
            pass

    # Sólo FLAG: ¿cabe el tiempo declarado entre el avance anterior y éste?
    # `instante_ms` es la hora en que PASÓ; sin ella (o con una hora en el
    # futuro) no se compara nada.
    instante_ms = creado_ms if creado_ms and creado_ms <= _now_ms() + 5 * 60 * 1000 else None
    _comprobar_tiempo_declarado(profile_id, current_node, time_spent_ms, instante_ms)

    # El cronómetro y las penalizaciones, igual que en /api/advance.
    #
    # Aquí sólo se guardaba el tiempo del nodo: lo completado sin cobertura no
    # arrancaba el reloj de la travesía, perdía la penalización (código de
    # respaldo, fallos en el reto) y, si era el último nodo, no paraba nunca
    # el cronómetro del jugador. Justo lo que pasa cuando alguien acaba la ruta
    # en un tramo sin cobertura.
    penalizacion_ms = _clamp_penalty_ms(payload.get("penalty_ms"))
    mark_player_started(profile_id)
    add_player_penalty(profile_id, penalizacion_ms)

    # La evidencia se revisa sólo para ANOTAR: pase lo que pase aquí, el
    # jugador avanza (motor antitrampas: flag, no bloqueo).
    evidencia = payload.get("evidence")
    hallazgos = anti_cheat_review_evidence(
        profile_id,
        current_node,
        evidencia,
        penalty_ms=penalizacion_ms if "penalty_ms" in payload else None,
        manual=_as_bool(payload.get("manual")),
    )

    set_player_progress_level(profile_id, current_level + 1)

    if current_level + 1 >= len(stages):
        mark_player_finished(profile_id)

    event["status"] = "synced"
    event["payload"] = {
        **payload,
        "requirement": requirement_status,
        "level_before": current_level,
        "level_after": current_level + 1,
        "server_applied": True,
    }

    match_log_record(
        "advance",
        profile_id,
        payload=payload_de_avance_para_el_registro(
            current_node,
            current_level,
            time_spent_ms=time_spent_ms,
            penalty_ms=penalizacion_ms,
            manual=_as_bool(payload.get("manual")),
            evidencia=evidencia,
            hallazgos=hallazgos,
            via=raw_payload.get("via") or "offline_queue",
            contexto=match_log_offline_context(raw_payload),
        ),
        client_created_at=_as_str(payload.get("local_created_at")) or None,
        profile=profile,
        active=active,
    )

    return append_event(EVENT_LOG_DB, event)


def payload_de_avance_para_el_registro(
    node, level_before, *, time_spent_ms, penalty_ms, manual, evidencia, hallazgos, via, contexto
):
    """La fila «avance» del Registro de partida, igual venga del móvil con red
    (/api/advance) o de la cola: nodo, tipo, juego, evidencia resumida y las
    sospechas que salieron de revisarla."""
    from backend.app.runtime import evidencia as _evidencia

    config = _mision._config_del_nodo(node) if isinstance(node, dict) else {}
    payload = {
        "node_id": node.get("id") if isinstance(node, dict) else None,
        "node_index": level_before,
        "kind": _mision.kind_del_nodo(node) if isinstance(node, dict) else None,
        "game_id": _as_str(config.get("game_id")) or None,
        "level_before": level_before,
        "level_after": level_before + 1,
        "time_spent_ms": time_spent_ms,
        "penalty_ms": penalty_ms,
        "manual": manual,
        "via": via,
        **_evidencia.resumen_de_evidencia(node, evidencia),
        **(contexto or {}),
    }
    if hallazgos:
        payload["sospechas"] = [hallazgo["reason"] for hallazgo in hallazgos]
    return payload


def _registrar_avance_rechazado(event, profile_id, profile, current_level, active=None):
    """Un node_completed que el servidor NO aplicó, en el Registro de partida.

    Sin esto una cola que llegaba con nodos rechazados -un código que ya no
    cuadraba, un eco de otro dispositivo- no dejaba rastro: al revisar la
    partida el jugador aparecía con nodos «que no constan».
    """
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    match_log_record(
        "advance_rejected",
        profile_id,
        payload={
            "node_id": event.get("node_id") or payload.get("node_id"),
            "server_level": current_level,
            "level_before": payload.get("level_before"),
            "error": event.get("error"),
            "status": event.get("status"),
            "via": payload.get("via") or "offline_queue",
            **match_log_offline_context(payload),
        },
        client_created_at=_as_str(payload.get("local_created_at")) or None,
        profile=profile,
        active=active,
    )


def _registrar_track_de_posiciones(profile_id, payload, contexto, profile, active=None):
    """Las posiciones que el móvil fue guardando SIN cobertura (el latido no
    llegaba): cada una entra en el Registro de partida con su hora original.

    Todas las muestras del evento van en UNA transacción (`match_log_record_many`):
    antes cada muestra abría su conexión y hacía su commit, y un lote de 50
    eventos dejaba el servidor bloqueado ≈ 80 s (caza de fallos S2).
    """
    muestras = payload.get("samples") if isinstance(payload.get("samples"), list) else []
    nombre_visible = match_log_display_name(profile_id, profile)
    entradas = []
    for muestra in muestras[:60]:
        if not isinstance(muestra, dict):
            continue
        try:
            iso = datetime.fromtimestamp(float(muestra.get("t")) / 1000.0, tz=timezone.utc).isoformat()
        except (TypeError, ValueError, OverflowError, OSError):
            iso = None
        entradas.append(
            {
                "event_type": "position_sample",
                "user": profile_id,
                "display_name": nombre_visible,
                "payload": {
                    "lat": muestra.get("lat"),
                    "lon": muestra.get("lon"),
                    "accuracy": muestra.get("acc"),
                    "source": muestra.get("src") or "real",
                    "via": "offline_track",
                    **contexto,
                },
                "client_created_at": iso,
            }
        )
    return match_log_record_many(entradas, active=active)


def _admin_react_stage_summary(stage, index, raw_stage=None):
    return _admin_overview.admin_stage_summary(stage, index, raw_stage)


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

    # Sin los rastros de posiciones ni los avisos de sincronización: no traen
    # objetos, y con un tramo largo sin cobertura eran miles de filas grandes
    # que había que decodificar en cada avance.
    eventos = list_events(
        EVENT_LOG_DB,
        user=user_key,
        limit=10000,
        exclude_types=("position_track", "offline_sync_received"),
    )

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


# El banco de pruebas del panel: jugadores simulados recorriendo la misión
# real. Ver backend/app/runtime/simulation_bench.py.
from backend.app.runtime import simulation_bench as _simulation_bench  # noqa: E402


# Banco de pruebas del panel: ver backend/app/runtime/simulacion_glue.py.
from backend.app.runtime.simulacion_glue import (  # noqa: E402,F401
    run_simulation_bench,
    run_long_session_pause_bench,
    registrar_jugadores_de_simulacion,
    quitar_jugadores_de_simulacion,
    mint_simulation_player_tokens,
    simulation_bench_jugadores_reales_en_marcha,
    limpiar_rastro_de_simulacion,
)



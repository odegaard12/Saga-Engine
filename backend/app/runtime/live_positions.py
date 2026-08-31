"""Latido y posición en vivo del jugador.

Dónde está cada uno, si su GPS está sano, y su foto sin pesar el resto de la
tabla del equipo. Movido de main.py para seguir bajando sus símbolos de
superficie (ver docs/plan-de-mejora.md, «Deuda que no corre prisa»).

`resolve_known_player_profile` y `buscar_avatar_de` piden `cfg` obligatorio
en vez de leer `load_config()` por su cuenta -así este módulo no necesita
importar main-; los envoltorios en main.py siguen resolviendo
`cfg = cfg or load_config()` antes de llamar, así que la firma hacia fuera
(con `cfg` opcional) no cambia para los routers que llaman así.

`HEARTBEAT_LAST_SEEN_BY_KEY` sigue siendo el MISMO diccionario que main.py
reexporta -no una copia-: `game.py` lo muta directamente
(`main.HEARTBEAT_LAST_SEEN_BY_KEY[clave] = ahora`), y eso sólo funciona si
los dos nombres apuntan al mismo objeto.
"""
import hashlib
import urllib.parse

from backend.app.runtime.minigames import _as_str
from backend.app.runtime.player_profiles import get_player_profiles, profile_matches_user
from backend.app.storage.positions_store import (
    get_live_position as get_live_position_state,
    guardar_posicion_sin_leer_todas,
    load_live_positions_state,
    save_live_positions_state,
)

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


def prune_heartbeat_rate_state(now):
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


def resolve_known_player_profile(cfg, user):
    user_text = _as_str(user).strip()
    if not user_text:
        return None

    for profile in get_player_profiles(cfg):
        if profile_matches_user(profile, user_text):
            return profile

    return None


def load_live_positions(positions_db):
    return load_live_positions_state(positions_db)


def save_live_positions(positions_db, data):
    save_live_positions_state(positions_db, data)


def get_live_position(positions_db, user):
    return get_live_position_state(positions_db, user)


def upsert_live_position_for_user(positions_db, user, position):
    """Guarda dónde está un jugador.

    No devuelve nada: quien llama a esto —el latido, trece móviles cada cinco
    segundos— no usaba el resultado, y calcularlo obligaba a leer la tabla
    entera de posiciones cada vez. Para la tabla del grupo está
    `load_live_positions`.
    """
    return guardar_posicion_sin_leer_todas(positions_db, user, position)


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


def buscar_avatar_de(cfg, profile_id: str):
    """Data URI de la foto de un jugador, o None."""
    objetivo = _as_str(profile_id).strip()
    if not objetivo:
        return None

    for perfil in get_player_profiles(cfg):
        if _as_str(perfil.get("id")).strip() == objetivo:
            foto = _as_str(perfil.get("avatar_url") or "")
            return foto if foto.startswith("data:") else None
    return None


def clear_live_position(positions_db, user):
    """Borra la última posición conocida de un jugador.

    Se usa al resetear: un jugador a cero no ha estado en ninguna parte todavía,
    y dejarle la posición de la partida anterior lo pintaba en el mapa —a veces
    en mitad de la ruta— como si ya estuviese andando.
    """
    user_key = _as_str(user).strip()
    if not user_key:
        return

    estado = load_live_positions(positions_db)
    if not isinstance(estado, dict) or user_key not in estado:
        return

    estado.pop(user_key, None)
    save_live_positions(positions_db, estado)

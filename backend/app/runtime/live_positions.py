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
import threading
import urllib.parse

from backend.app.runtime.minigames import _as_str
from backend.app.runtime.player_profiles import get_player_profiles, profile_matches_user
from backend.app.storage.positions_store import (
    get_live_position as get_live_position_state,
    guardar_posicion_sin_leer_todas,
    load_live_positions_state,
    remove_live_position,
    save_live_positions_state,
)

HEARTBEAT_STALE_SECONDS = 180
#: Sin latido en este tiempo, el jugador sale «sin conexión» (igual que el móvil).
HEARTBEAT_OFFLINE_SECONDS = 600
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
    # Posición puesta a mano (modo prueba/debug, ver
    # frontend/src/player/PlayerApp.tsx handleDebugSetPosition). Nunca es
    # GPS real: el motor antitrampas la excluye de la comprobación de
    # velocidad (ver backend/app/runtime/anti_cheat.py,
    # MANUAL_POSITION_SOURCE) y deja una nota neutra en vez de una sospecha.
    "manual",
}


_RATE_LOCK = threading.Lock()

#: Hacia dónde mira cada jugador según su móvil: {perfil: (grados, cuándo)}. Sólo en memoria: es un dato
#: de este instante (caduca en `RUMBO_VIGENTE_SECONDS`), no hace falta guardarlo ni replicarlo.
RUMBO_EN_VIVO: dict = {}
RUMBO_VIGENTE_SECONDS = 20


def anotar_rumbo(profile_id, valor, now):
    """Guarda el rumbo que manda el móvil (grados 0-360); ignora lo que no sea un número válido."""
    try:
        grados = float(valor)
    except (TypeError, ValueError):
        return
    if grados != grados or grados in (float("inf"), float("-inf")):
        return
    RUMBO_EN_VIVO[_as_str(profile_id)] = (round(grados % 360, 1), float(now))


def rumbo_vigente(profile_id, now):
    """El rumbo del móvil si llegó hace poco; si no, None (los demás lo sacan de cómo se mueve)."""
    dato = RUMBO_EN_VIVO.get(_as_str(profile_id))
    if not dato or now - dato[1] > RUMBO_VIGENTE_SECONDS:
        return None
    return dato[0]


def prune_heartbeat_rate_state(now):
    # Los latidos se atienden en hilos: recorrer el diccionario mientras otro
    # latido le añade una clave lanzaba «dictionary changed size during
    # iteration». Se recorre una copia y bajo un cerrojo.
    with _RATE_LOCK:
        stale_keys = [
            key for key, ts in list(HEARTBEAT_LAST_SEEN_BY_KEY.items())
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

    # Sólo la fila de ESE jugador (auditoría T3). Antes se leía la tabla entera,
    # se quitaba uno y se volvía a escribir entera: un latido de otro jugador que
    # llegara entre medias se perdía, porque la escritura lo pisaba con la copia
    # leída un instante antes.
    remove_live_position(positions_db, user_key)

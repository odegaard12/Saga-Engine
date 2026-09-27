"""Sospechas de trampa: se anotan, no se bloquean.

Antes de esto no había ninguna comprobación en el servidor -sólo en el
cliente, y sólo para "saliste de la aplicación en mitad de un reto" (ver
useAntiTrampas.ts / tests/test_anti_trampas.py)-. El GPS de entrada y la
progresión de nodos no comprobaban nada más allá de lo que hacía falta para
que el juego avanzara, así que un jugador podía completar un nodo sin haber
estado cerca, o "teletransportarse" entre dos, sin que quedara ningún rastro.

Política, y es la parte que importa: FLAG, no bloqueo. Un GPS ruidoso -de
serie en el monte- o un jugador que jugó entero sin cobertura y sincronizó
todo de golpe al final NO puede acabar penalizado por algo que no hizo. Por
eso cada umbral es deliberadamente generoso, y ninguna de estas funciones
impide nada: sólo dejan constancia en `anti_cheat.json` para que el
organizador lo revise a mano desde el panel (ver
backend/app/routers/admin.py, `/api/admin/anti-cheat-flags`) y decida, caso
por caso, si afecta a la clasificación.
"""
from __future__ import annotations

import math
import time
from typing import Any, Optional

from backend.app.storage.json_store import load_json, update_json

# ---------------------------------------------------------------------------
# Umbrales. Cada uno documenta el motivo del número, no sólo el número.
# ---------------------------------------------------------------------------

#: Un corredor no sostiene más de esto muchos metros; de sobra por encima de
#: caminar rápido o trotar cargado con el móvil.
MAX_PLAUSIBLE_SPEED_KMH = 40.0

#: Si el latido no manda `accuracy` (móviles viejos, o el propio latido sin
#: GPS), se asume esta precisión -mala a propósito- en vez de tratarlo como
#: un GPS perfecto: mejor no flaguear que flaguear a ciegas.
DEFAULT_GPS_ACCURACY_M = 50.0

#: Ningún fix es "0 m de error" en la calle: se perdona esto aunque el GPS
#: diga que acertó de pleno.
MIN_ACCURACY_MARGIN_M = 15.0

#: Tope al margen que se resta por precisión, para que dos fixes muy malos no
#: perdonen un salto de varios kilómetros.
MAX_ACCURACY_MARGIN_M = 300.0

#: Con menos tiempo que esto entre dos posiciones, el error de reloj del
#: móvil pesa más que el movimiento real: no se calcula velocidad.
MIN_INTERVAL_S = 3.0

#: Nadie completa un reto en menos que esto, ni el más rápido: es el tiempo
#: de leer la pantalla una vez y tocar.
MIN_PLAUSIBLE_STAGE_MS = 1500

#: Margen de reloj entre el móvil y el servidor. Los relojes de los móviles
#: no siempre van en hora -sobre todo sin red-, y eso no es lo que se
#: quiere cazar aquí.
FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000

_EARTH_RADIUS_M = 6371000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en metros entre dos puntos, sobre una tierra esférica."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def _accuracy_margin(*accuracies: Optional[float]) -> float:
    """Margen a restar por precisión de GPS: la suma de las conocidas.

    Sin ninguna precisión conocida se asume la peor de serie -no una
    perfecta-, porque el objetivo es no flaguear a quien tiene un GPS ruidoso,
    no dar barra libre a quien no manda nada.
    """
    total = 0.0
    for value in accuracies:
        try:
            v = float(value) if value is not None else DEFAULT_GPS_ACCURACY_M
        except (TypeError, ValueError):
            v = DEFAULT_GPS_ACCURACY_M
        total += max(0.0, v)
    return min(MAX_ACCURACY_MARGIN_M, max(MIN_ACCURACY_MARGIN_M, total))


# ---------------------------------------------------------------------------
# Almacén: un JSON por jugador, con la lista de sospechas.
# ---------------------------------------------------------------------------

def record_suspicion(db_path: str, user: str, reason: str, evidence: Optional[dict] = None) -> dict:
    """Anota una sospecha para `user`. No hace nada más: no bloquea, no penaliza."""
    user_key = str(user or "").strip()
    entrada = {
        "reason": str(reason or "").strip() or "unknown",
        "at": int(time.time() * 1000),
        "evidence": evidence if isinstance(evidence, dict) else {},
    }
    if not user_key:
        return entrada

    def _actualizar(actual):
        actual = actual if isinstance(actual, dict) else {}
        lista = actual.get(user_key)
        lista = list(lista) if isinstance(lista, list) else []
        lista.append(entrada)
        # No crece sin límite: con cientos de sospechas el panel deja de ser
        # legible y el fichero deja de ser pequeño. Se queda con las últimas.
        actual[user_key] = lista[-200:]
        return actual

    update_json(db_path, {}, _actualizar)
    return entrada


def list_suspicions(db_path: str, user: Optional[str] = None) -> dict:
    """Todas las sospechas, o sólo las de `user` si se pide."""
    data = load_json(db_path, {})
    if not isinstance(data, dict):
        return {}
    if user is None:
        return data
    user_key = str(user or "").strip()
    lista = data.get(user_key)
    return {user_key: lista if isinstance(lista, list) else []}


def count_suspicions(db_path: str) -> dict:
    """Cuántas sospechas tiene cada jugador. Para el resumen del panel."""
    data = load_json(db_path, {})
    if not isinstance(data, dict):
        return {}
    return {
        user: len(lista)
        for user, lista in data.items()
        if isinstance(lista, list) and lista
    }


# ---------------------------------------------------------------------------
# Comprobaciones. Cada una devuelve la sospecha registrada, o None si no hay.
# ---------------------------------------------------------------------------

def check_travel_speed(
    db_path: str,
    user: str,
    prev_lat: Optional[float],
    prev_lon: Optional[float],
    prev_at_s: Optional[float],
    prev_accuracy: Optional[float],
    new_lat: float,
    new_lon: float,
    new_at_s: float,
    new_accuracy: Optional[float],
) -> Optional[dict]:
    """Velocidad implausible entre dos posiciones consecutivas del mismo jugador.

    Se resta el margen de precisión de los DOS fixes antes de calcular
    velocidad: dos lecturas de GPS ruidoso pueden separar cien metros sin que
    nadie se haya movido un paso, y eso no es una sospecha, es ruido.
    """
    if prev_lat is None or prev_lon is None or not prev_at_s:
        return None

    delta_s = float(new_at_s) - float(prev_at_s)
    if delta_s < MIN_INTERVAL_S:
        return None

    distancia_m = haversine_m(prev_lat, prev_lon, new_lat, new_lon)
    margen_m = _accuracy_margin(prev_accuracy, new_accuracy)
    distancia_neta_m = max(0.0, distancia_m - margen_m)
    if distancia_neta_m <= 0:
        return None

    velocidad_kmh = (distancia_neta_m / delta_s) * 3.6
    if velocidad_kmh <= MAX_PLAUSIBLE_SPEED_KMH:
        return None

    return record_suspicion(
        db_path,
        user,
        "impossible_travel_speed",
        {
            "speed_kmh": round(velocidad_kmh, 1),
            "distance_m": round(distancia_m, 1),
            "elapsed_s": round(delta_s, 1),
            "accuracy_margin_m": round(margen_m, 1),
            "from": {"lat": prev_lat, "lon": prev_lon},
            "to": {"lat": new_lat, "lon": new_lon},
        },
    )


def check_node_proximity(
    db_path: str,
    user: str,
    node: dict,
    lat: Optional[float],
    lon: Optional[float],
    accuracy: Optional[float],
) -> Optional[dict]:
    """El jugador completa un nodo GPS sin haber estado nunca cerca.

    Sólo se comprueba cuando el nodo exige proximidad (`location.lat/lon` con
    radio) y se conoce la última posición conocida del jugador. Sin GPS no
    hay nada que comparar -y no se flaguea por no tener GPS, que ya castiga
    aparte la propia entrada al nodo-.
    """
    location = node.get("location") if isinstance(node, dict) else None
    if not isinstance(location, dict):
        return None

    node_lat = location.get("lat")
    node_lon = location.get("lon")
    radius_m = location.get("radius_m") or 0
    if node_lat is None or node_lon is None or not radius_m or lat is None or lon is None:
        return None

    distancia_m = haversine_m(float(node_lat), float(node_lon), float(lat), float(lon))
    margen_m = _accuracy_margin(accuracy)
    tolerancia_m = float(radius_m) + margen_m
    if distancia_m <= tolerancia_m:
        return None

    return record_suspicion(
        db_path,
        user,
        "node_completed_without_proximity",
        {
            "node_id": node.get("id"),
            "distance_m": round(distancia_m, 1),
            "radius_m": radius_m,
            "accuracy_margin_m": round(margen_m, 1),
            "player_position": {"lat": lat, "lon": lon},
        },
    )


def check_completion_time(
    db_path: str,
    user: str,
    node: dict,
    time_spent_ms: Optional[int],
) -> Optional[dict]:
    """Un reto superado más rápido de lo físicamente posible.

    El umbral es el mismo para todos los tipos de minijuego, y a propósito
    bajo: no se trata de adivinar cuánto tarda cada familia -eso varía con el
    jugador y el móvil-, sólo de cazar un 0 o un 40 ms que sólo puede venir de
    un aviso interno reenviado a mano, no de una persona jugando.
    """
    if time_spent_ms is None:
        return None
    try:
        ms = int(time_spent_ms)
    except (TypeError, ValueError):
        return None

    if ms < 0 or ms >= MIN_PLAUSIBLE_STAGE_MS:
        return None

    return record_suspicion(
        db_path,
        user,
        "completion_faster_than_possible",
        {
            "node_id": node.get("id") if isinstance(node, dict) else None,
            "time_spent_ms": ms,
            "min_plausible_ms": MIN_PLAUSIBLE_STAGE_MS,
        },
    )


def check_future_timestamp(
    db_path: str,
    user: str,
    local_created_ms: Optional[int],
    server_now_ms: Optional[int] = None,
    node_id: Optional[str] = None,
) -> Optional[dict]:
    """Un evento sincronizado desde la cola offline con fecha futura.

    Pasa cuando el reloj del móvil está mal puesto -sin red no hay NTP que lo
    corrija- o cuando alguien edita a mano el evento guardado para fingir que
    pasó antes o después de lo real. El margen de cinco minutos absorbe el
    primer caso; lo que quede por encima es lo segundo.
    """
    if not local_created_ms:
        return None
    now_ms = server_now_ms if server_now_ms is not None else int(time.time() * 1000)
    adelanto_ms = int(local_created_ms) - int(now_ms)
    if adelanto_ms <= FUTURE_TIMESTAMP_TOLERANCE_MS:
        return None

    return record_suspicion(
        db_path,
        user,
        "offline_event_timestamp_in_future",
        {
            "node_id": node_id,
            "local_created_at_ms": int(local_created_ms),
            "server_now_ms": now_ms,
            "ahead_ms": adelanto_ms,
        },
    )

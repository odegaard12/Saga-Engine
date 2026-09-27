"""Sospechas de trampa: se anotan, no se bloquean.

Antes de esto no había ninguna comprobación en el servidor -sólo en el
cliente, y sólo para "saliste de la aplicación en mitad de un reto" (ver
useAntiTrampas.ts / tests/test_anti_trampas.py)-. El GPS de entrada y la
progresión de nodos no comprobaban nada más allá de lo que hacía falta para
que el juego avanzara, así que un jugador podía "teletransportarse" entre dos
puntos sin que quedara ningún rastro.

Política, y es la parte que importa: FLAG, no bloqueo. Un GPS ruidoso -de
serie en el monte- o un jugador que jugó entero sin cobertura y sincronizó
todo de golpe al final NO puede acabar penalizado por algo que no hizo. Por
eso cada umbral es deliberadamente generoso, y ninguna de estas funciones
impide nada: sólo dejan constancia en `anti_cheat.json` para que el
organizador lo revise a mano desde el panel (ver
backend/app/routers/admin.py, `/api/admin/anti-cheat-flags`) y decida, caso
por caso, si afecta a la clasificación.

⚠️ NO existe (y se quitó a propósito) una comprobación de "nodo completado
lejos de su sitio". El GPS en el monte falla con frecuencia -árboles, valles,
mala cobertura- y esa comprobación acusaba a jugadores honestos casi tan a
menudo como a quien hacía trampa.
"""
from __future__ import annotations

import math
import time
from typing import Any, Optional

from backend.app.storage.json_store import load_json, update_json
from backend.app.runtime.mision import kind_del_nodo

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

#: Una lectura de GPS sola que "salta" no es sospechosa: el propio GPS lo hace
#: constantemente en el monte, sin que nadie se haya movido. Sólo cuenta si la
#: velocidad implausible se sostiene en esta cantidad de tramos consecutivos
#: -cada tramo ya descuenta su propio margen de precisión-, que es lo que un
#: salto de un solo fix no puede fingir.
MIN_CONSECUTIVE_SPEED_VIOLATIONS = 2

#: Nadie completa un reto en menos que esto, ni el más rápido: es el tiempo
#: de leer la pantalla una vez y tocar. Se aplica sólo a minijuegos -ver
#: check_completion_time-, no a checkpoints, QR ni coleccionables.
MIN_PLAUSIBLE_STAGE_MS = 5000

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

def _reset_speed_streak(streak_db_path: str, user: str) -> None:
    """El tramo actual no es sospechoso: se olvida cualquier racha anterior."""
    user_key = str(user or "").strip()
    if not user_key:
        return

    def _actualizar(actual):
        actual = actual if isinstance(actual, dict) else {}
        if user_key in actual:
            actual = dict(actual)
            actual.pop(user_key, None)
        return actual

    update_json(streak_db_path, {}, _actualizar)


def _bump_speed_streak(streak_db_path: str, user: str) -> int:
    """Un tramo más de velocidad implausible: suma uno a la racha y la devuelve."""
    user_key = str(user or "").strip()
    if not user_key:
        return 1

    resultado = {"n": 1}

    def _actualizar(actual):
        actual = dict(actual) if isinstance(actual, dict) else {}
        n = int(actual.get(user_key) or 0) + 1
        actual[user_key] = n
        resultado["n"] = n
        return actual

    update_json(streak_db_path, {}, _actualizar)
    return resultado["n"]


def check_travel_speed(
    db_path: str,
    streak_db_path: str,
    user: str,
    prev_lat: Optional[float],
    prev_lon: Optional[float],
    prev_at_s: Optional[float],
    prev_accuracy: Optional[float],
    new_lat: float,
    new_lon: float,
    new_at_s: float,
    new_accuracy: Optional[float],
    level: Optional[int] = None,
    total_stages: Optional[int] = None,
) -> Optional[dict]:
    """Velocidad implausible ENTRE NODOS, sostenida en más de un tramo.

    Dos motivos para no mirar esto en cualquier momento de la partida:

    - **Antes de completar el primer nodo** un jugador puede llegar en coche
      -de casa al punto de partida- a una velocidad que sería imposible a pie
      entre dos nodos de la ruta. No es trampa, es cómo se llega al inicio.
    - **Con la misión ya terminada** no hay "entre nodos" que vigilar.

    Por eso sólo se evalúa con `0 < level < total_stages`: ha completado ya el
    primero y todavía no ha acabado. Sin ese dato (`level`/`total_stages` no
    informados) no se comprueba nada -mejor no flaguear que flaguear a
    ciegas-.

    Y un único salto de GPS -por ruidoso que sea el fix- nunca basta: sólo
    cuenta si la velocidad implausible se repite en
    `MIN_CONSECUTIVE_SPEED_VIOLATIONS` tramos consecutivos del mismo jugador.
    Un salto aislado se olvida en el siguiente latido bueno.
    """
    if level is None or total_stages is None or level <= 0 or level >= total_stages:
        _reset_speed_streak(streak_db_path, user)
        return None

    if prev_lat is None or prev_lon is None or not prev_at_s:
        return None

    delta_s = float(new_at_s) - float(prev_at_s)
    if delta_s < MIN_INTERVAL_S:
        return None

    distancia_m = haversine_m(prev_lat, prev_lon, new_lat, new_lon)
    margen_m = _accuracy_margin(prev_accuracy, new_accuracy)
    distancia_neta_m = max(0.0, distancia_m - margen_m)
    if distancia_neta_m <= 0:
        _reset_speed_streak(streak_db_path, user)
        return None

    velocidad_kmh = (distancia_neta_m / delta_s) * 3.6
    if velocidad_kmh <= MAX_PLAUSIBLE_SPEED_KMH:
        _reset_speed_streak(streak_db_path, user)
        return None

    racha = _bump_speed_streak(streak_db_path, user)
    if racha < MIN_CONSECUTIVE_SPEED_VIOLATIONS:
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
            "consecutive_segments": racha,
            "from": {"lat": prev_lat, "lon": prev_lon},
            "to": {"lat": new_lat, "lon": new_lon},
        },
    )


def check_completion_time(
    db_path: str,
    user: str,
    node: dict,
    time_spent_ms: Optional[int],
) -> Optional[dict]:
    """Un minijuego superado más rápido de lo físicamente posible.

    Sólo aplica a MINIJUEGOS (ver `kind_del_nodo`). Un checkpoint o un QR se
    "superan" con un solo toque o un escaneo -no hay partida que jugar-, y un
    coleccionable es un pickup: tocar y listo. Medirles un tiempo mínimo de
    partida los flaguearía por hacer exactamente lo que se espera de ellos.

    El umbral es el mismo para todos los tipos de minijuego, y a propósito
    bajo -MIN_PLAUSIBLE_STAGE_MS-: no se trata de adivinar cuánto tarda cada
    familia -eso varía con el jugador y el móvil-, sólo de cazar un tiempo que
    sólo puede venir de un aviso interno reenviado a mano, no de una persona
    jugando.
    """
    kind = kind_del_nodo(node) if isinstance(node, dict) else None
    if kind != "minijuego":
        return None

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

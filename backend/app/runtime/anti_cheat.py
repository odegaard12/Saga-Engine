"""Motor antitrampas SAGA Engine: sospechas de trampa que se anotan, no se bloquean.

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

Este módulo es el único sitio con umbrales del motor antitrampas -no hay un
segundo juego de constantes en otro fichero-. API pública, todo lo demás es
detalle interno:

- `check_travel_speed`     -> velocidad imposible entre nodos (ignora GPS manual/debug).
- `check_completion_time`  -> minijuego superado más rápido de lo físicamente
                               posible, con un mínimo propio por familia de juego
                               (ver `MINIGAME_MIN_DURATION_MS_BY_GAME`).
- `check_future_timestamp` -> evento offline sincronizado con fecha futura.
- `note_manual_position`   -> deja constancia NEUTRA (no es sospecha) de que
                               el jugador usó GPS manual/debug.
- `record_suspicion`       -> anota una sospecha (severidad "suspicion").
- `list_suspicions` / `count_suspicions` -> lo que ve el panel de admin.
"""
from __future__ import annotations

import math
import time
from typing import Any, Dict, Optional

from backend.app.storage.json_store import load_json, update_json
from backend.app.runtime.mision import kind_del_nodo

#: Severidad de una entrada: "suspicion" (algo a revisar) o "info" (neutro,
#: no acusa a nadie -p.ej. "usó posición manual"-). El panel las separa.
SEVERITY_SUSPICION = "suspicion"
SEVERITY_INFO = "info"

#: Valor de `source` que marca un latido con posición puesta a mano (modo
#: prueba/debug), nunca GPS real. Debe coincidir con lo que manda el cliente
#: (ver frontend/src/player/PlayerApp.tsx, heartbeatSourceRef) y con
#: VALID_HEARTBEAT_SOURCES en backend/app/runtime/live_positions.py.
MANUAL_POSITION_SOURCE = "manual"

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
#: check_completion_time-, no a checkpoints, QR ni coleccionables. Es el
#: SUELO absoluto: ningún mínimo por familia (ver más abajo) puede bajar de
#: aquí, y es también lo que se usa si el `game_id` no está en la tabla.
MIN_PLAUSIBLE_STAGE_MS = 5000

#: Fracción de la duración MÍNIMA anunciada al organizador (ver
#: frontend/src/admin/lib/gameCatalog.ts, campo `duration`, p.ej. "2-5 min")
#: que se considera "físicamente posible" para ese minijuego. Un jugador
#: rápido no tarda lo mismo que la media, pero tardar menos de esta fracción
#: del extremo más corto ya no es "rápido", es sospechoso. 20-25 % es
#: deliberadamente bajo -mejor no flaguear que flaguear a quien sólo jugó
#: bien-.
_UMBRAL_FRACCION_DURACION_MINIMA = 0.22


def _ms_desde_minutos(minutos: float) -> int:
    """`minutos` del extremo corto de gameCatalog.ts -> umbral en ms.

    Redondeado a la centena para que la tabla de abajo tenga números
    legibles, y con el suelo de MIN_PLAUSIBLE_STAGE_MS aplicado siempre.
    """
    bruto = minutos * 60_000 * _UMBRAL_FRACCION_DURACION_MINIMA
    return max(MIN_PLAUSIBLE_STAGE_MS, int(round(bruto / 100.0)) * 100)


#: Mínimo plausible por FAMILIA de minijuego (game_id -> ms), en vez de un
#: único suelo para todos. Cada valor sale de aplicar
#: `_UMBRAL_FRACCION_DURACION_MINIMA` al extremo más corto de la duración que
#: el organizador ve en el catálogo (frontend/src/admin/lib/gameCatalog.ts,
#: campo `duration`). Sólo se usa cuando `check_completion_time` ya decidió
#: que el nodo es un minijuego -checkpoint/QR/coleccionable ni pasan por
#: aquí-. Un `game_id` que no esté aquí (minijuego nuevo, o legado) cae en
#: MIN_PLAUSIBLE_STAGE_MS por defecto: nunca sin comprobación, nunca más
#: estricto que el suelo genérico.
MINIGAME_MIN_DURATION_MS_BY_GAME: Dict[str, int] = {
    "spark_radar": _ms_desde_minutos(1),        # "1-2 min"
    "qr_key_gate": _ms_desde_minutos(1),         # "1-3 min"
    "clue_card": _ms_desde_minutos(1),           # "1-2 min"
    "bonus_cache": _ms_desde_minutos(1),         # "1-3 min"
    "shake_charge": _ms_desde_minutos(1),        # "1-2 min"
    "bearing_hunt": _ms_desde_minutos(1),        # "1-3 min"
    "sequence_code": _ms_desde_minutos(2),       # "2-5 min"
    "tilt_maze": _ms_desde_minutos(2),           # "2-6 min"
    "photo_scout": _ms_desde_minutos(2),         # "2-4 min"
    "manual_password": _ms_desde_minutos(2),     # "2-5 min"
    "audio_challenge": _ms_desde_minutos(2),     # "2-4 min"
    "place_mosaic": _ms_desde_minutos(3),        # "3-8 min"
    "logic_circuit": _ms_desde_minutos(4),       # "4-7 min"
    "team_relay": _ms_desde_minutos(5),          # "5-8 min"
}

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

def record_suspicion(
    db_path: str,
    user: str,
    reason: str,
    evidence: Optional[dict] = None,
    severity: str = SEVERITY_SUSPICION,
) -> dict:
    """Anota una entrada para `user`. No hace nada más: no bloquea, no penaliza.

    `severity` distingue una sospecha real ("suspicion", el valor por
    defecto -y lo único que existía antes de esto-) de una nota neutra
    ("info", p.ej. "usó posición manual") que el panel muestra aparte, sin
    acusar a nadie.
    """
    user_key = str(user or "").strip()
    entrada = {
        "reason": str(reason or "").strip() or "unknown",
        "at": int(time.time() * 1000),
        "evidence": evidence if isinstance(evidence, dict) else {},
        "severity": severity if severity == SEVERITY_INFO else SEVERITY_SUSPICION,
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
    """Cuántas entradas (sospechas + info) tiene cada jugador. Resumen del panel."""
    data = load_json(db_path, {})
    if not isinstance(data, dict):
        return {}
    return {
        user: len(lista)
        for user, lista in data.items()
        if isinstance(lista, list) and lista
    }


def _es_sospecha(entrada: Any) -> bool:
    """True si `entrada` es una sospecha real, no una nota "info" neutra.

    Una entrada SIN `severity` es de antes de que existiera este campo:
    todo lo que había entonces era sospecha, así que se trata igual
    -compatibilidad con `anti_cheat.json` ya escrito-.
    """
    if not isinstance(entrada, dict):
        return False
    return entrada.get("severity") != SEVERITY_INFO


def count_by_severity(lista: list) -> dict:
    """Desglose sospechas/info de la lista de un jugador. Para el panel."""
    sospechas = sum(1 for entrada in lista if _es_sospecha(entrada))
    info = len(lista) - sospechas
    return {"suspicion_count": sospechas, "info_count": info}


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
    prev_source: Optional[str] = None,
    new_source: Optional[str] = None,
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

    Un tercer motivo, y es a propósito: si CUALQUIERA de los dos puntos del
    tramo viene de posición MANUAL/debug (`prev_source` o `new_source` ==
    MANUAL_POSITION_SOURCE), el salto es esperado -es justo para eso existe
    el modo prueba, ver PlayerApp.tsx handleDebugSetPosition- y no cuenta
    como velocidad implausible. Se resetea también la racha, así que un
    tramo real->manual->real no arrastra nada de un lado a otro.

    Y un único salto de GPS -por ruidoso que sea el fix- nunca basta: sólo
    cuenta si la velocidad implausible se repite en
    `MIN_CONSECUTIVE_SPEED_VIOLATIONS` tramos consecutivos del mismo jugador.
    Un salto aislado se olvida en el siguiente latido bueno.
    """
    if level is None or total_stages is None or level <= 0 or level >= total_stages:
        _reset_speed_streak(streak_db_path, user)
        return None

    if prev_source == MANUAL_POSITION_SOURCE or new_source == MANUAL_POSITION_SOURCE:
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


def _game_id_del_nodo(node: dict) -> str:
    """`game_id` de un nodo, con la misma resolución que `kind_del_nodo`.

    No se reexporta desde mision.py porque aquí sólo interesa el id para
    mirar la tabla de duraciones -no hace falta el resto de esa función-.
    """
    if not isinstance(node, dict):
        return ""
    interaccion = node.get("interaction") if isinstance(node.get("interaction"), dict) else {}
    config = interaccion.get("config") if isinstance(interaccion.get("config"), dict) else {}
    if not config and isinstance(node.get("config"), dict):
        config = node["config"]
    return str((config or {}).get("game_id") or "").strip().lower()


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

    El umbral YA NO es el mismo para todos los minijuegos: cada familia
    (`game_id`) tiene su propio mínimo en `MINIGAME_MIN_DURATION_MS_BY_GAME`,
    derivado de la duración real que ve el organizador en el catálogo
    (frontend/src/admin/lib/gameCatalog.ts). Un `game_id` sin entrada en la
    tabla -minijuego nuevo o legado- cae en MIN_PLAUSIBLE_STAGE_MS, nunca
    queda sin comprobación.
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

    game_id = _game_id_del_nodo(node)
    umbral_ms = MINIGAME_MIN_DURATION_MS_BY_GAME.get(game_id, MIN_PLAUSIBLE_STAGE_MS)

    if ms < 0 or ms >= umbral_ms:
        return None

    return record_suspicion(
        db_path,
        user,
        "completion_faster_than_possible",
        {
            "node_id": node.get("id") if isinstance(node, dict) else None,
            "game_id": game_id or None,
            "time_spent_ms": ms,
            "min_plausible_ms": umbral_ms,
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


# ---------------------------------------------------------------------------
# Posición manual/debug: nota NEUTRA, no sospecha (ver MANUAL_POSITION_SOURCE).
# ---------------------------------------------------------------------------

def _manual_notice_marked(notice_db_path: str, user_key: str) -> bool:
    data = load_json(notice_db_path, {})
    return bool(isinstance(data, dict) and data.get(user_key))


def _set_manual_notice(notice_db_path: str, user_key: str, marcado: bool) -> None:
    def _actualizar(actual):
        actual = dict(actual) if isinstance(actual, dict) else {}
        if marcado:
            actual[user_key] = True
        else:
            actual.pop(user_key, None)
        return actual

    update_json(notice_db_path, {}, _actualizar)


def note_manual_position(
    db_path: str,
    notice_db_path: str,
    user: str,
    source: Optional[str],
) -> Optional[dict]:
    """Deja constancia de que `user` usó GPS manual/debug -sin acusar de nada-.

    Como mucho una nota "info" por SESIÓN de uso manual: mientras el jugador
    siga mandando latidos con `source == MANUAL_POSITION_SOURCE` no se repite
    nada, y en cuanto vuelve a GPS real se olvida la marca -así que si más
    tarde activa el modo prueba otra vez, se anota de nuevo, porque es una
    sesión distinta-. El panel de administración la muestra separada de las
    sospechas, con un estilo neutro (ver ActivityPanel.tsx).
    """
    user_key = str(user or "").strip()
    if not user_key:
        return None

    if source != MANUAL_POSITION_SOURCE:
        _set_manual_notice(notice_db_path, user_key, False)
        return None

    if _manual_notice_marked(notice_db_path, user_key):
        return None

    _set_manual_notice(notice_db_path, user_key, True)
    return record_suspicion(
        db_path,
        user,
        "manual_position_used",
        {},
        severity=SEVERITY_INFO,
    )

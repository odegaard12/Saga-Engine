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
                               posible. Umbral MUY conservador (ver
                               `MIN_PLAUSIBLE_STAGE_MS` y
                               `MINIGAME_HARD_FLOOR_MS_BY_GAME`), con una red de
                               seguridad basada en la mediana real de la misión
                               en curso (ver `_umbral_ms_para`).
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

#: Puente opcional hacia el Registro de partida (ver
#: backend/app/runtime/match_log.py). `main.py` lo configura una vez al
#: arrancar con `configure_match_log_sink`: cada sospecha o nota "info" que
#: se anota aquí se refleja también en la línea de tiempo del jugador, sin
#: que este módulo tenga que conocer rutas de fichero ni el estado de la
#: misión -eso lo decide quien configura el sink-.
_match_log_sink = None


def configure_match_log_sink(sink):
    """Registra `sink(user, reason, evidence, severity)` para cada sospecha/nota."""
    global _match_log_sink
    _match_log_sink = sink

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
#: SUELO absoluto y es también lo que se usa si el `game_id` no tiene un
#: mínimo físico propio (ver `MINIGAME_HARD_FLOOR_MS_BY_GAME`).
#:
#: v5.34.0 tenía una tabla que derivaba este umbral de la duración "típica"
#: anunciada al organizador (p.ej. team_relay "5-8 min" -> ~66 s mínimo). Eso
#: estaba MAL: la duración del catálogo es una expectativa de diseño, no una
#: medida de lo que un jugador real tarda. Con datos reales, circuitos
#: (logic_circuit) se completaban en ~17 s y otros minijuegos en ~1 s -muy
#: por debajo de lo que la tabla exigía-, así que estaba flagueando a
#: jugadores honestos por jugar bien. Se sustituye por un suelo único,
#: deliberadamente bajo y anclado a un límite físico real (leer+tocar no
#: baja de esto), más la red de seguridad de `_umbral_ms_para` de abajo.
MIN_PLAUSIBLE_STAGE_MS = 2000

#: Tiempo humano mínimo para ver un paso de una secuencia y tocar el que
#: corresponde (p.ej. Simón Dice / sequence_code): ni la reacción más rápida
#: baja de esto por repetición. No es una duración "típica", es un límite
#: fisiológico (tiempo de reacción visual-motor simple ronda 150-250 ms; se
#: dobla para cubrir también el tiempo de "ver" el paso, no sólo reaccionar).
MIN_MS_POR_PASO_DE_SECUENCIA = 350

#: Número de pasos que se asume si el nodo no trae su propia secuencia
#: configurada (no debería pasar, pero mejor un suelo bajo que reventar).
_PASOS_SECUENCIA_POR_DEFECTO = 3


def _config_del_nodo(node: dict) -> dict:
    """Config efectiva de `node`, con la misma resolución que `kind_del_nodo`."""
    if not isinstance(node, dict):
        return {}
    interaccion = node.get("interaction") if isinstance(node.get("interaction"), dict) else {}
    config = interaccion.get("config") if isinstance(interaccion.get("config"), dict) else {}
    if not config and isinstance(node.get("config"), dict):
        config = node["config"]
    return config or {}


def _suelo_sequence_code(node: dict) -> int:
    """Mínimo físico de `sequence_code`: N pasos, cada uno con su mínimo.

    A diferencia de la tabla vieja, esto no es un número fijo "típico": sale
    de contar los pasos REALES configurados en este nodo (`config.sequence`),
    así que un Simón Dice de 3 pasos y uno de 8 no comparten umbral.
    """
    config = _config_del_nodo(node)
    secuencia = config.get("sequence")
    n_pasos = len(secuencia) if isinstance(secuencia, list) and secuencia else _PASOS_SECUENCIA_POR_DEFECTO
    return max(MIN_PLAUSIBLE_STAGE_MS, n_pasos * MIN_MS_POR_PASO_DE_SECUENCIA)


def _suelo_rumbo_doble(node: dict) -> int:
    """Mínimo físico de `rumbo_doble`: N objetivos, cada uno exige su propio
    `hold_ms` de verdad, uno detrás de otro -no se puede mantener dos rumbos
    a la vez-. Igual que `_suelo_sequence_code`, sale de lo que el propio
    nodo tiene configurado (`config.targets` / `config.hold_ms`), no de una
    tabla adivinada: exactamente el bug que se corrigió en v5.34.0 (ver
    MIN_PLAUSIBLE_STAGE_MS). A propósito NO se suma tiempo estimado de giro
    entre objetivos -eso sí sería adivinar-, sólo la suma de los holds que
    el runtime exige de verdad (RuntimeScreen.tsx).
    """
    config = _config_del_nodo(node)
    targets = config.get("targets")
    n_targets = len(targets) if isinstance(targets, list) and targets else 2

    try:
        hold_ms = int(config.get("hold_ms"))
    except (TypeError, ValueError):
        hold_ms = 1200
    if hold_ms <= 0:
        hold_ms = 1200

    return max(MIN_PLAUSIBLE_STAGE_MS, n_targets * hold_ms)


def _suelo_pulso_hierro(node: dict) -> int:
    """Mínimo físico de `pulso_hierro`: suma de toques reales de todas las
    rondas (longitud inicial + crecimiento por ronda, tantas rondas como
    pida el nodo) por la ventana de tiempo real que el runtime da para cada
    toque (`pulso_tap_window_ms`) -exactamente el mismo patrón que
    `_suelo_rumbo_doble` (nº de objetivos x hold_ms), aplicado aquí a nº de
    toques x ventana de toque-. A propósito NO se suma nada por la fase de
    "memorizar" la secuencia ni por las re-estabilizaciones tras perder la
    quietud: eso alargaría el suelo con tiempo que un jugador rápido de
    verdad podría no necesitar, y el suelo es un mínimo físico, no una
    duración esperada.
    """
    config = _config_del_nodo(node)

    try:
        start_length = int(config.get("pulso_start_length"))
    except (TypeError, ValueError):
        start_length = 3
    if start_length <= 0:
        start_length = 3

    try:
        target_rounds = int(config.get("pulso_target_rounds"))
    except (TypeError, ValueError):
        target_rounds = 6
    if target_rounds <= 0:
        target_rounds = 6

    try:
        growth = int(config.get("pulso_growth_per_round"))
    except (TypeError, ValueError):
        growth = 1
    if growth < 0:
        growth = 0

    try:
        tap_window_ms = int(config.get("pulso_tap_window_ms"))
    except (TypeError, ValueError):
        tap_window_ms = 2600
    if tap_window_ms <= 0:
        tap_window_ms = 2600

    total_taps = sum(start_length + i * growth for i in range(target_rounds))
    return max(MIN_PLAUSIBLE_STAGE_MS, total_taps * tap_window_ms)


def _suelo_trampa_palabras(node: dict) -> int:
    """Mínimo físico de `trampa_palabras`: nº de rondas x el límite de
    tiempo por pregunta que puso el organizador, tal cual sale de la config
    REAL de este nodo (`config.n_rounds` / `config.time_limit_s`) -no una
    tabla adivinada, mismo criterio que `_suelo_sequence_code` /
    `_suelo_rumbo_doble` (ver v5.34.0 en MIN_PLAUSIBLE_STAGE_MS)-.
    """
    config = _config_del_nodo(node)

    try:
        n_rounds = int(config.get("n_rounds"))
    except (TypeError, ValueError):
        n_rounds = 6
    if n_rounds <= 0:
        n_rounds = 6

    try:
        time_limit_s = int(config.get("time_limit_s"))
    except (TypeError, ValueError):
        time_limit_s = 12
    if time_limit_s <= 0:
        time_limit_s = 12

    return max(MIN_PLAUSIBLE_STAGE_MS, n_rounds * time_limit_s * 1000)


#: Mínimo físico por FAMILIA de minijuego, sólo para los que tienen un límite
#: físico real y calculable (no una "duración típica"). A propósito NO hay
#: entrada para spark_radar ni team_relay: son prototipos sin cablear en la
#: ruta real (no los resuelve frontend/src/player/minigames/core/resolver.ts
#: en producción), así que no hay ninguna partida real con la que fijar un
#: umbral, y uno "razonable" adivinado es exactamente el error que causó
#: v5.34.0. Cualquier game_id que no esté aquí -incluidos los que ya no
#: existen o quedaron fuera de esta tabla a propósito- cae en el suelo
#: genérico `MIN_PLAUSIBLE_STAGE_MS`, nunca sin comprobación, nunca más
#: estricto que ese suelo.
MINIGAME_HARD_FLOOR_MS_BY_GAME: Dict[str, Any] = {
    "sequence_code": _suelo_sequence_code,  # depende del nodo: nº de pasos real.
    "rumbo_doble": _suelo_rumbo_doble,  # depende del nodo: nº de objetivos x hold_ms real.
    "pulso_hierro": _suelo_pulso_hierro,  # depende del nodo: nº de toques totales x ventana real.
    "trampa_palabras": _suelo_trampa_palabras,  # depende del nodo: rondas x segundos/pregunta real.
}


#: Red de seguridad: aunque el tiempo caiga por debajo del suelo de arriba,
#: no se flaguea si ya hay bastantes partidas reales de ESTE minijuego en
#: esta misión y el tiempo no está muy lejos de ellas. Evita que un récord
#: legítimo -un jugador rápido de verdad, cerca de otros tiempos ya vistos-
#: quede marcado sólo porque es más rápido que el suelo teórico.
#: Con menos muestras que esto no hay base para "lo normal en esta misión":
#: se juzga sólo por el suelo físico de arriba.
MIN_MUESTRAS_PARA_MEDIANA = 5

#: Fracción de la mediana observada por debajo de la cual SÍ se flaguea aun
#: teniendo bastantes muestras. 20 % es deliberadamente bajo: un jugador que
#: tarda la mitad que los demás sigue sin ser sospechoso solo por eso.
_UMBRAL_FRACCION_DE_LA_MEDIANA = 0.20

#: Cuántos tiempos "limpios" (no flagueados) se guardan por minijuego para
#: calcular la mediana. No crece sin límite por el mismo motivo que
#: record_suspicion recorta su lista.
_MAX_MUESTRAS_POR_JUEGO = 500

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

    if _match_log_sink is not None and user_key:
        try:
            _match_log_sink(user_key, entrada["reason"], entrada["evidence"], entrada["severity"])
        except Exception:
            pass

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


def _umbral_fisico_ms(game_id: str, node: dict) -> int:
    """Suelo físico para `game_id`: el propio si tiene uno, si no el genérico."""
    entrada = MINIGAME_HARD_FLOOR_MS_BY_GAME.get(game_id)
    if entrada is None:
        return MIN_PLAUSIBLE_STAGE_MS
    if callable(entrada):
        try:
            return int(entrada(node))
        except (TypeError, ValueError):
            return MIN_PLAUSIBLE_STAGE_MS
    try:
        return max(MIN_PLAUSIBLE_STAGE_MS, int(entrada))
    except (TypeError, ValueError):
        return MIN_PLAUSIBLE_STAGE_MS


def _muestras_de(samples_db_path: str, game_id: str) -> list:
    data = load_json(samples_db_path, {})
    if not isinstance(data, dict):
        return []
    lista = data.get(game_id)
    return [v for v in lista if isinstance(v, (int, float))] if isinstance(lista, list) else []


def _mediana(valores: list) -> float:
    ordenados = sorted(valores)
    n = len(ordenados)
    mitad = n // 2
    if n % 2 == 1:
        return float(ordenados[mitad])
    return (ordenados[mitad - 1] + ordenados[mitad]) / 2.0


def _registrar_muestra(samples_db_path: str, game_id: str, ms: int) -> None:
    """Guarda `ms` como una partida más de `game_id`, en esta misión.

    Se guarda SIEMPRE, esté o no flagueada -es lo que pide la tarea: "ese
    minijuego en la misión actual", no sólo los tiempos que ya se dieron por
    buenos-. No es tan arriesgado como parece: la MEDIANA es robusta a unos
    pocos valores extremos (un par de tramposos entre 50 jugadores apenas la
    mueve), y esto es sólo una ayuda para decidir si SE FLAGUEA, nunca un
    bloqueo -el organizador sigue viendo cada sospecha en el panel-. Lo que
    de verdad protege de que alguien "lave" el umbral a fuerza de repetir
    tiempos absurdos es que cada flag queda anotada y visible: una mediana
    que de pronto se desploma con la misión en marcha es en sí misma la señal
    que el organizador necesita revisar.
    """
    if not game_id:
        return

    def _actualizar(actual):
        actual = dict(actual) if isinstance(actual, dict) else {}
        lista = actual.get(game_id)
        lista = list(lista) if isinstance(lista, list) else []
        lista.append(ms)
        actual[game_id] = lista[-_MAX_MUESTRAS_POR_JUEGO:]
        return actual

    update_json(samples_db_path, {}, _actualizar)


def check_completion_time(
    db_path: str,
    user: str,
    node: dict,
    time_spent_ms: Optional[int],
    samples_db_path: Optional[str] = None,
) -> Optional[dict]:
    """Un minijuego superado más rápido de lo físicamente posible.

    Sólo aplica a MINIJUEGOS (ver `kind_del_nodo`). Un checkpoint o un QR se
    "superan" con un solo toque o un escaneo -no hay partida que jugar-, y un
    coleccionable es un pickup: tocar y listo. Medirles un tiempo mínimo de
    partida los flaguearía por hacer exactamente lo que se espera de ellos.

    Umbral en dos pasos, deliberadamente conservador (ver el porqué en los
    comentarios de MIN_PLAUSIBLE_STAGE_MS -la tabla "por duración típica" de
    v5.34.0 era el propio bug-):

    1. Suelo FÍSICO (`_umbral_fisico_ms`): el genérico de 2 s, o el propio de
       la familia si hay un límite calculable de verdad (p.ej. sequence_code,
       N pasos reales del nodo). Por debajo de esto es candidato a sospecha.
    2. Red de seguridad (`samples_db_path`): si ya hay
       `MIN_MUESTRAS_PARA_MEDIANA` o más partidas registradas de este
       `game_id` en esta misión, sólo se flaguea si además el tiempo está muy
       por debajo (`_UMBRAL_FRACCION_DE_LA_MEDIANA`) de la mediana real
       observada -calculada ANTES de sumar esta partida-. Así un récord
       legítimo -rápido, pero cerca de otros tiempos ya vistos- no queda
       marcado sólo por ser más rápido que el suelo teórico. Sin bastantes
       muestras todavía (misión nueva, minijuego poco jugado) se juzga sólo
       por el suelo físico: mejor no flaguear que flaguear a ciegas con una
       base de un solo dato.

    Cada partida evaluada se guarda en `samples_db_path` -flagueada o no-,
    para que la mediana de la próxima vez sea de verdad "lo que se ve en esta
    misión" (ver `_registrar_muestra`).
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
    umbral_ms = _umbral_fisico_ms(game_id, node)

    candidato = 0 <= ms < umbral_ms
    resultado = None

    if candidato:
        flaguear = True
        if samples_db_path:
            muestras = _muestras_de(samples_db_path, game_id)
            if len(muestras) >= MIN_MUESTRAS_PARA_MEDIANA:
                mediana_ms = _mediana(muestras)
                if ms >= mediana_ms * _UMBRAL_FRACCION_DE_LA_MEDIANA:
                    flaguear = False
        if flaguear:
            resultado = record_suspicion(
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

    if ms >= 0 and samples_db_path:
        _registrar_muestra(samples_db_path, game_id, ms)

    return resultado


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

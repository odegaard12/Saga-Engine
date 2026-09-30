"""El cronómetro y el progreso del jugador.

Movido de main.py para seguir bajando sus símbolos de superficie (ver
docs/plan-de-mejora.md, «Deuda que no corre prisa»: main.py exponía 77
símbolos a los routers y se estaba bajando de uno en uno para romper el
import circular). Cada función lleva ahora la ruta del fichero como primer
argumento en vez de leer una constante de módulo -así no hace falta
importar main desde aquí, que es justo el ciclo que se quiere romper-;
main.py sigue reexportando estas funciones SIN cambiar ninguna firma hacia
fuera, así que los sitios que hacen `import main` y llaman a
`main.load_player_timers()` no se enteran del movimiento.

No se movió `set_player_progress_level` a un módulo aparte de "progreso":
llama a `record_player_stage_time`, `clear_all_player_timers` y
`clear_player_stage_time` constantemente, y las cinco llevan la misma
historia de fallos ya arreglados (ver los comentarios de cada una). Partirlo
habría sido separar lo que se rompió junto.

Cada lectura-modificación-escritura pasa por `update_json`: UN ciclo bajo el
cerrojo del fichero, y sin escribir si nada cambió. Antes eran
`load_json` + `save_json` sueltos, que sólo eran seguros porque el bucle de
eventos no dejaba entrar a nadie entre las dos llamadas.
"""
import time

from backend.app.storage.game_state_store import get_player_level, load_game_state, set_player_level
from backend.app.storage.json_store import load_json, save_json, update_json


def _now_ms():
    return int(time.time() * 1000)


def _ms_seguro(valor, defecto=0):
    """Milisegundos como entero; basura, `inf` y `nan` dan `defecto`."""
    try:
        return int(valor or 0)
    except (TypeError, ValueError, OverflowError):
        return defecto


def load_player_progress(game_db):
    return load_game_state(game_db)


def load_player_timers(timers_db):
    return load_json(timers_db, {})


def save_player_timers(timers_db, timers):
    save_json(timers_db, timers)


def _actualizar_jugador(timers_db, user, cambiar, crear=True):
    """Aplica `cambiar(entrada)` a la entrada del jugador, bajo el cerrojo.

    Con `crear=False` no se toca nada si el jugador no tiene entrada.
    """
    user_key = str(user or "").strip()
    if not user_key:
        return

    def _updater(timers):
        timers = timers if isinstance(timers, dict) else {}
        entrada = timers.get(user_key)
        if not isinstance(entrada, dict):
            if not crear:
                return timers
            entrada = {"stage_times_ms": {}}
            timers[user_key] = entrada
        cambiar(entrada)
        return timers

    update_json(timers_db, {}, _updater)


def record_player_stage_time(timers_db, user, level, time_ms):
    lvl_str = str(level)
    nuevo = _ms_seguro(time_ms)

    def _cambiar(entrada):
        stage_times = entrada.setdefault("stage_times_ms", {})
        # SET the time for this level - do not accumulate across retries.
        # The client sends the correct elapsed time; penalties are added explicitly.
        # Using the max of existing vs new prevents regression when called multiple times.
        existing = stage_times.get(lvl_str, 0)
        stage_times[lvl_str] = max(existing, nuevo)

    _actualizar_jugador(timers_db, user, _cambiar)


def mark_player_started(timers_db, user):
    """Guarda cuándo empezó a jugar, la primera vez que completa algo.

    El tiempo total era la suma de lo que se pasaba DENTRO de cada pantalla, así
    que caminar siete kilómetros entre nodos contaba cero: una ruta entera daba
    veinticinco segundos y la clasificación no medía nada. Lo que cuenta es el
    reloj: desde que arrancas hasta que acabas.
    """
    def _cambiar(entrada):
        entrada.setdefault("stage_times_ms", {})
        if not entrada.get("started_at"):
            entrada["started_at"] = _now_ms()

    _actualizar_jugador(timers_db, user, _cambiar)


def mark_player_finished(timers_db, user):
    def _cambiar(entrada):
        entrada["finished_at"] = _now_ms()

    _actualizar_jugador(timers_db, user, _cambiar, crear=False)


def add_player_penalty(timers_db, user, penalty_ms):
    """Suma una penalización al tiempo total (código de respaldo, fallos...)."""
    penalty = _ms_seguro(penalty_ms)
    if penalty <= 0:
        return

    def _cambiar(entrada):
        entrada.setdefault("stage_times_ms", {})
        entrada["penalties_ms"] = _ms_seguro(entrada.get("penalties_ms")) + penalty

    _actualizar_jugador(timers_db, user, _cambiar)


def record_player_advance(timers_db, user, at_ms=None):
    """Anota CUÁNDO se completó el último nodo y devuelve cuándo fue el anterior.

    Es el único dato de tiempo que el servidor observa por su cuenta -el resto,
    lo que tardó el jugador dentro de cada nodo, lo declara el móvil-. Sirve para
    marcar (nunca para bloquear) un tiempo declarado que no cabe entre dos
    avances consecutivos: ver `anti_cheat.check_declared_time_vs_observed`.

    `at_ms` es el instante en que PASÓ (el del móvil ya corregido con el reloj
    del servidor si venía de la cola); sin él, ahora.
    """
    instante = _ms_seguro(at_ms) or _now_ms()
    anterior = {"ms": 0}

    def _cambiar(entrada):
        entrada.setdefault("stage_times_ms", {})
        anterior["ms"] = _ms_seguro(entrada.get("last_advance_at_ms"))
        # Nunca hacia atrás: un evento antiguo de la cola no borra un avance más nuevo.
        entrada["last_advance_at_ms"] = max(anterior["ms"], instante)

    _actualizar_jugador(timers_db, user, _cambiar)
    return anterior["ms"] or None


def clear_all_player_timers(timers_db, user):
    """Completely wipe all stage timer data for a player. Called on full profile reset."""
    def _cambiar(entrada):
        entrada["stage_times_ms"] = {}
        # Las penalizaciones y las marcas de inicio y fin también: si no, un
        # jugador reiniciado arrancaba la partida nueva con los minutos que le
        # habían caído en la anterior.
        entrada.pop("penalties_ms", None)
        entrada.pop("started_at", None)
        entrada.pop("finished_at", None)
        entrada.pop("current_stage_started_at", None)
        entrada.pop("last_advance_at_ms", None)

    _actualizar_jugador(timers_db, user, _cambiar, crear=False)


def clear_player_stage_time(timers_db, user, level):
    lvl_str = str(level)

    def _cambiar(entrada):
        stage_times = entrada.setdefault("stage_times_ms", {})
        if lvl_str in stage_times:
            stage_times[lvl_str] = 0

    _actualizar_jugador(timers_db, user, _cambiar, crear=False)


def get_player_progress_level(game_db, user, default=0):
    return get_player_level(game_db, user, default=default)


def set_player_progress_level(timers_db, game_db, user, level, penalty_ms=0, desde_admin=False):
    objetivo = int(level or 0)

    # Volver al nodo 1 es empezar de cero, tambien en el reloj.
    #
    # Al resetear se borraban los tiempos de los nodos pero NO las
    # penalizaciones, asi que un jugador reseteado arrancaba la partida nueva
    # arrastrando los minutos que le habian caido en la anterior.
    if objetivo <= 0:
        clear_all_player_timers(timers_db, user)
        return set_player_level(game_db, user, 0)

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
    actual = int(get_player_progress_level(game_db, user, 0) or 0)
    if objetivo < actual and not desde_admin:
        return load_game_state(game_db)

    # Retroceder desde el panel borra el reloj de lo que se va a repetir.
    #
    # Se devolvia al jugador a un nodo anterior y los tiempos de los nodos que
    # tenia que rehacer seguian guardados: el marcador arrancaba la repeticion
    # con segundos de una partida que ya no cuenta -un 00:04 de la nada- y al
    # superar el nodo otra vez se quedaba el mayor de los dos, no el nuevo.
    # Si se vuelve atras es para rehacerlo, y rehacerlo empieza en cero.
    if objetivo < actual and desde_admin:
        for nivel in range(objetivo, actual + 1):
            clear_player_stage_time(timers_db, user, nivel)

    # If the level is explicitly set (e.g. by an admin), we should clear any future stage times
    # to avoid the timer holding onto times from nodes they are replaying.
    user_key = str(user or "").strip()

    def _quitar_tiempos_futuros(timers):
        timers = timers if isinstance(timers, dict) else {}
        entrada = timers.get(user_key)
        if isinstance(entrada, dict):
            stage_times = entrada.get("stage_times_ms", {})
            if isinstance(stage_times, dict):
                for k in [k for k in list(stage_times.keys()) if k.isdigit() and int(k) >= objetivo]:
                    del stage_times[k]
        return timers

    if user_key:
        update_json(timers_db, {}, _quitar_tiempos_futuros)

    # La penalización del organizador va a las PENALIZACIONES, no al tiempo de un
    # nodo. Se guardaba como tiempo del nodo `level` y la línea de arriba
    # -«quitar los tiempos de los nodos >= level»- la borraba en el acto: saltar
    # un nodo desde el panel no costaba nada (caza de fallos S5/A10).
    penalizacion = _ms_seguro(penalty_ms)
    if penalizacion > 0:
        add_player_penalty(timers_db, user, penalizacion)

    return set_player_level(game_db, user, level)


def get_player_total_time_ms(timers_db, user):
    """Tiempo dentro de las pruebas más las penalizaciones.

    NO es reloj de pared. Todos los equipos hacen la ruta juntos y a la vez, así
    que el tiempo de caminar es el mismo para todos y no distingue a nadie: lo
    que decide la clasificación es lo que cuesta cada reto. Cuenta desde que se
    abre el nodo hasta que se supera —incluido el rato mirando el patrón del
    laberinto o la foto del mosaico, y cada vez que se vuelve a mirar— más lo
    que sumen los fallos y los códigos de respaldo.
    """
    timers = load_player_timers(timers_db)
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return 0

    entrada = timers[user_key]
    penalizaciones = int(entrada.get("penalties_ms") or 0)
    return sum(entrada.get("stage_times_ms", {}).values()) + penalizaciones


def get_player_is_playing(user):
    # Sin timers en backend, podemos devolver False. El cliente gestiona su propio estado interactivo.
    return False


def get_player_stage_time_ms(timers_db, user, level):
    timers = load_player_timers(timers_db)
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return 0
    return timers[user_key].get("stage_times_ms", {}).get(str(level), 0)

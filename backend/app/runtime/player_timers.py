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
"""
import time

from backend.app.storage.game_state_store import get_player_level, load_game_state, set_player_level
from backend.app.storage.json_store import load_json, save_json


def _now_ms():
    return int(time.time() * 1000)


def load_player_progress(game_db):
    return load_game_state(game_db)


def load_player_timers(timers_db):
    return load_json(timers_db, {})


def save_player_timers(timers_db, timers):
    save_json(timers_db, timers)


def record_player_stage_time(timers_db, user, level, time_ms):
    timers = load_player_timers(timers_db)
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
    save_player_timers(timers_db, timers)


def mark_player_started(timers_db, user):
    """Guarda cuándo empezó a jugar, la primera vez que completa algo.

    El tiempo total era la suma de lo que se pasaba DENTRO de cada pantalla, así
    que caminar siete kilómetros entre nodos contaba cero: una ruta entera daba
    veinticinco segundos y la clasificación no medía nada. Lo que cuenta es el
    reloj: desde que arrancas hasta que acabas.
    """
    timers = load_player_timers(timers_db)
    user_key = str(user or "").strip()
    if not user_key:
        return

    entrada = timers.setdefault(user_key, {"stage_times_ms": {}})
    if not entrada.get("started_at"):
        entrada["started_at"] = _now_ms()
        save_player_timers(timers_db, timers)


def mark_player_finished(timers_db, user):
    timers = load_player_timers(timers_db)
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return

    timers[user_key]["finished_at"] = _now_ms()
    save_player_timers(timers_db, timers)


def add_player_penalty(timers_db, user, penalty_ms):
    """Suma una penalización al tiempo total (código de respaldo, fallos...)."""
    penalty = int(penalty_ms or 0)
    if penalty <= 0:
        return

    timers = load_player_timers(timers_db)
    user_key = str(user or "").strip()
    if not user_key:
        return

    entrada = timers.setdefault(user_key, {"stage_times_ms": {}})
    entrada["penalties_ms"] = int(entrada.get("penalties_ms") or 0) + penalty
    save_player_timers(timers_db, timers)


def clear_all_player_timers(timers_db, user):
    """Completely wipe all stage timer data for a player. Called on full profile reset."""
    timers = load_player_timers(timers_db)
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
        save_player_timers(timers_db, timers)


def clear_player_stage_time(timers_db, user, level):
    timers = load_player_timers(timers_db)
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return
    stage_times = timers[user_key].setdefault("stage_times_ms", {})
    lvl_str = str(level)
    if lvl_str in stage_times:
        stage_times[lvl_str] = 0
    save_player_timers(timers_db, timers)


def get_player_progress_level(game_db, user, default=0):
    return get_player_level(game_db, user, default=default)


def set_player_progress_level(timers_db, game_db, user, level, penalty_ms=0, desde_admin=False):
    if penalty_ms > 0:
        record_player_stage_time(timers_db, user, level, penalty_ms)

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

    # Volver al nodo 1 es empezar de cero, tambien en el reloj.
    #
    # Al resetear se borraban los tiempos de los nodos pero NO las
    # penalizaciones, asi que un jugador reseteado arrancaba la partida nueva
    # arrastrando los minutos que le habian caido en la anterior: dos minutos de
    # un codigo de respaldo, por ejemplo, sin que nada lo dijera en pantalla.
    if int(level or 0) <= 0:
        clear_all_player_timers(timers_db, user)
        return set_player_level(game_db, user, level)

    # If the level is explicitly set (e.g. by an admin), we should clear any future stage times
    # to avoid the timer holding onto times from nodes they are replaying.
    timers = load_player_timers(timers_db)
    user_key = str(user or "").strip()
    if user_key and user_key in timers:
        stage_times = timers[user_key].get("stage_times_ms", {})
        keys_to_remove = [k for k in list(stage_times.keys()) if k.isdigit() and int(k) >= level]
        for k in keys_to_remove:
            del stage_times[k]
        save_player_timers(timers_db, timers)

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

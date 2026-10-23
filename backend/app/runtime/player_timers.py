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


def mark_player_finished(timers_db, user, at_ms=None):
    """Hora en que acabó (desempate de la clasificación).

    `at_ms` es cuándo PASÓ: con un avance de la cola offline, la hora del móvil
    ya corregida, no la de la subida (si no, acabar sin cobertura y subirlo al
    llegar al bar te ponía detrás de quien acabó después).
    """
    instante = _ms_seguro(at_ms) or _now_ms()

    def _cambiar(entrada):
        entrada["finished_at"] = instante

    _actualizar_jugador(timers_db, user, _cambiar, crear=False)


# ---------------------------------------------------------------------------
# Tiempo por nodo decidido por el servidor (ver runtime/tiempos_de_nodo.py).
#
# En la entrada de cada jugador:
#   "aperturas": {node_id: ms}        primera apertura de un nodo aún sin superar
#   "nodos": {nivel: {node_id, declared_ms, observed_ms, applied_ms, fuente,
#                     opened_at_ms, completed_at_ms, penalty_ms, manual, origen,
#                     ...lo que añada quien llama (perfecto, prueba, sospechoso)}}
# `stage_times_ms[nivel]` guarda el APLICADO: así todo lo que ya sumaba el
# total (tabla de equipo, panel, copia de respaldo) cuenta lo del servidor sin
# cambiar ni un campo.
# ---------------------------------------------------------------------------


def _registro_anterior(nodos, nivel):
    previo = nodos.get(str(int(nivel) - 1)) if isinstance(nodos, dict) else None
    return _ms_seguro(previo.get("completed_at_ms")) if isinstance(previo, dict) else 0


def record_node_time(timers_db, user, level, node_id, declared_ms, completed_at_ms, *, now_ms=None, extra=None, reinicio_ms=None):
    """Anota el tiempo de un nodo superado y devuelve su registro.

    `completed_at_ms` es cuándo pasó (ahora, con red; la hora corregida del
    móvil, desde la cola). Con la apertura que haya llegado para ese nodo se
    calcula el observado; si la apertura llega después, `record_node_opened`
    lo recalcula.
    """
    from backend.app.runtime import tiempos_de_nodo as _tiempos

    lvl_str = str(int(level))
    nodo = str(node_id or "").strip()
    ahora = _ms_seguro(now_ms) or _now_ms()
    salida = {}

    def _cambiar(entrada):
        aperturas = entrada.setdefault("aperturas", {})
        nodos = entrada.setdefault("nodos", {})
        calculo = _tiempos.tiempo_de_nodo(
            declared_ms,
            aperturas.get(nodo) if isinstance(aperturas, dict) else None,
            completed_at_ms,
            anterior_ms=_registro_anterior(nodos, lvl_str),
            ahora_ms=ahora,
            # Revisión 19/10: sin este suelo, una apertura de antes del reinicio
            # (o de antes de la salida) inflaba el primer nodo, que no tiene anterior.
            reinicio_ms=reinicio_ms,
        )
        registro = {"node_id": nodo, "level": int(lvl_str), **calculo, **(extra or {})}
        # Auditoría 23/10: un reintento del MISMO nodo reescribe el registro, pero
        # la penalización ya cobrada se queda como estaba (ver `add_node_penalty`):
        # si no, el segundo intento la cobraba otra vez.
        previo = nodos.get(lvl_str)
        if isinstance(previo, dict) and previo.get("penalty_cobrada") and str(previo.get("node_id")) == nodo:
            registro["penalty_cobrada"] = True
            registro["penalty_ms"] = _ms_seguro(previo.get("penalty_ms"))
        nodos[lvl_str] = registro
        if isinstance(aperturas, dict):
            aperturas.pop(nodo, None)
        stage_times = entrada.setdefault("stage_times_ms", {})
        stage_times[lvl_str] = max(_ms_seguro(stage_times.get(lvl_str)), registro["applied_ms"])
        salida.update(registro)

    _actualizar_jugador(timers_db, user, _cambiar)
    return salida


def record_node_opened(timers_db, user, node_id, at_ms, *, now_ms=None, reinicio_ms=None):
    """Primera apertura de un nodo (evento `node_opened`).

    Si el nodo ya está superado (la apertura llegó en otra tanda, después del
    avance), se recalcula su observado y su aplicado. Devuelve el registro
    recalculado o None.
    """
    from backend.app.runtime import tiempos_de_nodo as _tiempos

    nodo = str(node_id or "").strip()
    instante = _ms_seguro(at_ms)
    if not nodo or instante <= 0:
        return None
    ahora = _ms_seguro(now_ms) or _now_ms()
    instante = min(instante, ahora)
    salida = {}

    def _cambiar(entrada):
        nodos = entrada.setdefault("nodos", {})
        hecho = None
        for clave, registro in nodos.items():
            if isinstance(registro, dict) and str(registro.get("node_id")) == nodo:
                hecho = (clave, registro)
        if hecho is None:
            aperturas = entrada.setdefault("aperturas", {})
            previa = _ms_seguro(aperturas.get(nodo))
            aperturas[nodo] = min(previa, instante) if previa else instante
            return
        clave, registro = hecho
        previa = _ms_seguro(registro.get("opened_at_ms"))
        abierto = min(previa, instante) if previa else instante
        calculo = _tiempos.tiempo_de_nodo(
            registro.get("declared_ms"),
            abierto,
            registro.get("completed_at_ms"),
            anterior_ms=_registro_anterior(nodos, clave),
            ahora_ms=ahora,
            reinicio_ms=reinicio_ms,  # revisión 19/10: igual que en record_node_time
        )
        registro.update(calculo)
        stage_times = entrada.setdefault("stage_times_ms", {})
        stage_times[clave] = max(_ms_seguro(stage_times.get(clave)), calculo["applied_ms"])
        salida.update(registro)

    _actualizar_jugador(timers_db, user, _cambiar)
    return salida or None


def total_de_la_entrada(entrada):
    """Tiempo de clasificación de una entrada de relojes: nodos + penalizaciones - lo devuelto por fallos de la app."""
    if not isinstance(entrada, dict):
        return 0
    nodos = sum(_ms_seguro(v) for v in (entrada.get("stage_times_ms") or {}).values())
    return max(0, nodos + _ms_seguro(entrada.get("penalties_ms")) - _ms_seguro(entrada.get("descuento_ms")))


def fin_de_la_entrada(entrada):
    """Hora en que acabó (desempate de la clasificación), o None.

    `finished_at` sólo se pone al superar el ÚLTIMO nodo. Pero se puede acabar sin
    pasar por ahí: si el organizador borra los nodos que le quedaban a alguien,
    el reindexado (mision_reindex.py) lo deja con la misión hecha y sin
    `finished_at`. Ese jugador salía terminado y, a igual tiempo, siempre el
    último del desempate. Acabó cuando superó su último nodo: el
    `completed_at_ms` más tardío de sus registros (o, sin registros, su último
    avance). Sólo la usa quien ya sabe que ha terminado.
    """
    if not isinstance(entrada, dict):
        return None
    fin = _ms_seguro(entrada.get("finished_at"))
    if fin > 0:
        return fin
    nodos = entrada.get("nodos") if isinstance(entrada.get("nodos"), dict) else {}
    hechos = [_ms_seguro(r.get("completed_at_ms")) for r in nodos.values() if isinstance(r, dict)]
    fin = max(hechos + [_ms_seguro(entrada.get("last_advance_at_ms"))], default=0)
    return fin if fin > 0 else None


def poner_descuento(timers_db, user, descuento_ms):
    """Deja en `descuento_ms` el tiempo devuelto (el organizador lo decide al revisar las incidencias de la app).

    Se FIJA, no se suma: aplicar dos veces la misma sugerencia no devuelve el doble.
    """
    descuento = max(0, _ms_seguro(descuento_ms))

    def _cambiar(entrada):
        entrada.setdefault("stage_times_ms", {})
        if descuento:
            entrada["descuento_ms"] = descuento
        else:
            entrada.pop("descuento_ms", None)

    _actualizar_jugador(timers_db, user, _cambiar)


def add_player_penalty(timers_db, user, penalty_ms):
    """Suma una penalización al tiempo total (código de respaldo, fallos...)."""
    penalty = _ms_seguro(penalty_ms)
    if penalty <= 0:
        return

    def _cambiar(entrada):
        entrada.setdefault("stage_times_ms", {})
        entrada["penalties_ms"] = _ms_seguro(entrada.get("penalties_ms")) + penalty

    _actualizar_jugador(timers_db, user, _cambiar)


def add_node_penalty(timers_db, user, level, node_id, penalty_ms):
    """Suma la penalización de UN nodo superado, una sola vez aunque el avance se repita.

    Auditoría 23/10: el avance hace varias escrituras seguidas (objeto, inicio,
    penalización, tiempo, nivel). Si falla la última, el móvil recibe un 503 y
    reintenta, y `add_player_penalty` volvía a sumar: dos veces los 2 minutos del
    código a mano. Ahora se marca en el registro del nodo (`nodos[nivel]`, que
    `record_node_time` ya dejó escrito): con la marca puesta no se suma nada.
    `penalty_ms` del registro queda igual a lo cobrado, que es lo que restan al
    deshacer el nodo `set_player_progress_level` y el reindexado.

    Sin registro del nodo (no debería pasar: se anota antes) se suma como antes.
    """
    penalty = _ms_seguro(penalty_ms)
    if penalty <= 0:
        return
    lvl_str = str(int(level))
    nodo = str(node_id or "").strip()

    def _cambiar(entrada):
        entrada.setdefault("stage_times_ms", {})
        nodos = entrada.get("nodos") if isinstance(entrada.get("nodos"), dict) else {}
        registro = nodos.get(lvl_str)
        if isinstance(registro, dict) and str(registro.get("node_id")) == nodo:
            if registro.get("penalty_cobrada"):
                return
            registro["penalty_cobrada"] = True
            registro["penalty_ms"] = penalty
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
        entrada.pop("descuento_ms", None)
        entrada.pop("started_at", None)
        entrada.pop("finished_at", None)
        entrada.pop("current_stage_started_at", None)
        entrada.pop("last_advance_at_ms", None)
        entrada.pop("aperturas", None)
        entrada.pop("nodos", None)
        entrada.pop("saltos_ms", None)

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


def set_player_progress_level(timers_db, game_db, user, level, penalty_ms=0, desde_admin=False, ids=None, ts_ms=None):
    """`ids` (los de la misión, en orden) activa la doble escritura en `superados`:
    el nivel sigue mandando, la tabla se actualiza en la misma transacción."""
    objetivo = int(level or 0)

    # Volver al nodo 1 es empezar de cero, tambien en el reloj.
    #
    # Al resetear se borraban los tiempos de los nodos pero NO las
    # penalizaciones, asi que un jugador reseteado arrancaba la partida nueva
    # arrastrando los minutos que le habian caido en la anterior.
    if objetivo <= 0:
        clear_all_player_timers(timers_db, user)
        return set_player_level(game_db, user, 0, ids=ids, desde_admin=desde_admin, ts_ms=ts_ms)

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
            # Los registros por nodo van con su tiempo; las aperturas pendientes,
            # fuera (si se vuelve atrás, el nodo se reabrirá).
            nodos = entrada.get("nodos")
            if isinstance(nodos, dict):
                for k in [k for k in list(nodos.keys()) if k.isdigit() and int(k) >= objetivo]:
                    # Revisión 19/10: la penalización de un nodo deshecho se va con
                    # él; si no, al rehacerlo se pagaba dos veces.
                    registro = nodos[k] if isinstance(nodos[k], dict) else {}
                    quitar = _ms_seguro(registro.get("penalty_ms"))
                    if quitar > 0 and "penalties_ms" in entrada:
                        entrada["penalties_ms"] = max(0, _ms_seguro(entrada.get("penalties_ms")) - quitar)
                    del nodos[k]
            # Lo mismo con el salto del panel («+1 nodo», «Finalizar»): sus 5
            # minutos se apuntan en el nivel desde el que se saltó. Si el
            # organizador lo deshace y el jugador vuelve a jugar ese nodo, el
            # salto ya no ocurrió: antes los 5 minutos se quedaban y, si se
            # volvía a saltar, se pagaban dos veces.
            saltos = entrada.get("saltos_ms")
            if objetivo < actual and isinstance(saltos, dict):
                for k in [k for k in list(saltos.keys()) if str(k).isdigit() and int(k) >= objetivo]:
                    quitar = _ms_seguro(saltos.pop(k))
                    if quitar > 0 and "penalties_ms" in entrada:
                        entrada["penalties_ms"] = max(0, _ms_seguro(entrada.get("penalties_ms")) - quitar)
            if objetivo < actual:
                entrada.pop("aperturas", None)
                # Revisión 19/10: quien vuelve atrás ya no ha acabado; con el
                # finished_at viejo seguía desempatando como terminado.
                entrada.pop("finished_at", None)
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
        if desde_admin and objetivo > actual:
            def _apuntar_salto(entrada):
                saltos = entrada.setdefault("saltos_ms", {})
                saltos[str(actual)] = _ms_seguro(saltos.get(str(actual))) + penalizacion

            _actualizar_jugador(timers_db, user, _apuntar_salto)

    return set_player_level(game_db, user, level, ids=ids, desde_admin=desde_admin, ts_ms=ts_ms)


def clave_de_clasificacion(jugador: dict) -> tuple:
    """El orden de la clasificación en el servidor: panel de Tiempos y exportación.

    Es el MISMO criterio que el móvil (`ordenarClasificacion`, en
    frontend/src/player/components/clasificacion.ts), que es lo que ven los
    jugadores: terminados delante; luego más nodos; a igual nodo, quien tiene
    tiempo va antes que quien tiene 0, y entre tiempos el menor; después la hora
    de llegada, el nombre y el id. Un total 0 (todo devuelto con el descuento, o
    nada anotado) no es un tiempo real: antes el panel lo ponía PRIMERO y el
    móvil detrás de los que tenían tiempo, y el premio dependía de qué pantalla
    se mirase. Si se cambia aquí, se cambia allí (lo fija
    tests/test_revision_19_10_servidor.py).
    """
    total = max(_ms_seguro(jugador.get("total_time_ms")), 0)
    return (
        0 if jugador.get("finished") else 1,
        -int(jugador.get("level") or 0),
        0 if total > 0 else 1,
        total,
        jugador.get("finished_at") or 10**15,
        str(jugador.get("display_name") or jugador.get("user") or ""),
        str(jugador.get("user") or ""),
    )


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

    return total_de_la_entrada(timers[user_key])


def get_player_is_playing(user):
    # Sin timers en backend, podemos devolver False. El cliente gestiona su propio estado interactivo.
    return False


def get_player_stage_time_ms(timers_db, user, level):
    timers = load_player_timers(timers_db)
    user_key = str(user or "").strip()
    if not user_key or user_key not in timers:
        return 0
    return timers[user_key].get("stage_times_ms", {}).get(str(level), 0)

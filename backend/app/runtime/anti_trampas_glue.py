"""Anti-trampas y estado en vivo del perfil: envoltorios que le pasan a `anti_cheat` los datos de `main`.

Sacado de `main.py` sin cambiar comportamiento. Todo lo que estas funciones usan
de `main` se pide como `main.NOMBRE` en el momento de la llamada (igual que hacen
los routers), de modo que lo que un test o el arranque cambie en `main` --rutas de
fichero, funciones sustituidas-- sigue mandando. `main` re-exporta estos nombres.
"""
import time


def anti_cheat_check_travel_speed(user, prev_position, new_lat, new_lon, new_at_s, new_accuracy, new_source=None):
    """Velocidad implausible ENTRE NODOS, entre el punto anterior y el nuevo.

    `prev_position` es lo que había en positions.json ANTES de sobreescribir
    con el latido actual: es exactamente el par consecutivo que hace falta,
    sin guardar historial aparte. `new_source` (y `prev_position["source"]`)
    es lo que deja fuera de esta comprobación cualquier tramo que empiece o
    acabe en una posición manual/debug -ver check_travel_speed-.

    El nivel y el total de nodos deciden si "entre nodos" tiene sentido aquí
    -ver check_travel_speed-: antes de completar el primer nodo (viaje de
    casa al punto de partida) y con la misión ya acabada no se comprueba
    nada.
    """
    import main
    prev = prev_position if isinstance(prev_position, dict) else {}
    profile_id = str(user or "").strip() or "PLAYER 1"
    nivel = main.get_player_progress_level(profile_id, main.get_player_progress_level(user, 0))
    total_nodos = main.count_runtime_stages()
    return main._anti_cheat.check_travel_speed(
        main.ANTI_CHEAT_DB,
        main.SPEED_STREAK_DB,
        user,
        prev.get("lat"),
        prev.get("lon"),
        prev.get("last_seen"),
        prev.get("accuracy"),
        new_lat,
        new_lon,
        new_at_s,
        new_accuracy,
        level=nivel,
        total_stages=total_nodos,
        prev_source=prev.get("source"),
        new_source=new_source,
    )


def anti_cheat_note_manual_position(user, source):
    """Nota NEUTRA (no sospecha) de que `user` usó GPS manual/debug.

    Ver `backend.app.runtime.anti_cheat.note_manual_position`: como mucho una
    por sesión de uso manual, mostrada aparte en el panel.
    """
    import main
    return main._anti_cheat.note_manual_position(main.ANTI_CHEAT_DB, main.MANUAL_POSITION_NOTICE_DB, user, source)


def anti_cheat_check_completion_time(user, node, time_spent_ms):
    import main
    return main._anti_cheat.check_completion_time(
        main.ANTI_CHEAT_DB, user, node, time_spent_ms, samples_db_path=main.COMPLETION_TIME_SAMPLES_DB
    )


def anti_cheat_check_future_timestamp(user, local_created_ms, node_id=None):
    import main
    return main._anti_cheat.check_future_timestamp(main.ANTI_CHEAT_DB, user, local_created_ms, node_id=node_id)


def anti_cheat_check_declared_time(user, node, declared_ms, observed_ms):
    """Marca (nunca bloquea) un tiempo declarado que no cabe entre dos avances.

    Ver `anti_cheat.check_declared_time_vs_observed`: el servidor sólo observa
    cuándo llega cada avance, el resto lo declara el móvil.
    """
    import main
    return main._anti_cheat.check_declared_time_vs_observed(
        main.ANTI_CHEAT_DB, user, node, declared_ms, observed_ms
    )


def anti_cheat_count_coordinates():
    """Cuántas sospechas guardadas llevan coordenadas (para contar antes de purgar)."""
    import main
    return main._anti_cheat.count_entries_with_coordinates(main.ANTI_CHEAT_DB)


def anti_cheat_scrub_coordinates():
    """Quita las coordenadas de las sospechas guardadas (purga de datos personales)."""
    import main
    return main._anti_cheat.scrub_coordinates(main.ANTI_CHEAT_DB)


def anti_cheat_check_client_reported_exit(user, reason, payload):
    """Anota lo que el CLIENTE ya detectó y decidió: salir de la app o abrir
    el selector de tareas mientras había un minijuego en pantalla (ver
    useAntiTrampas.ts). El servidor no vuelve a decidir nada -no puede: no ve
    la pantalla del móvil-, sólo deja constancia para el panel.
    """
    import main
    payload = payload if isinstance(payload, dict) else {}
    return main._anti_cheat.record_suspicion(
        main.ANTI_CHEAT_DB,
        user,
        reason,
        {
            "node_id": payload.get("node_id"),
            "game_id": payload.get("game_id"),
            "stage_title": payload.get("stage_title"),
        },
    )


def anti_cheat_review_evidence(user, node, evidence, penalty_ms=None, manual=False):
    """Revisa la evidencia que trae un nodo completado y anota lo que no cuadre.

    El móvil valida en local -sin cobertura no hay otra- y aquí se vuelve a
    comprobar contra la configuración REAL del nodo (ver
    runtime/evidencia.py). FLAG, no bloqueo: si no cuadra queda una sospecha
    con nombre propio en el panel, y el progreso no se toca.
    """
    import main
    from backend.app.runtime import evidencia as _evidencia

    hallazgos = _evidencia.verificar_evidencia(
        node, user, evidence, penalty_ms=penalty_ms, manual=manual
    )
    for hallazgo in hallazgos:
        main._anti_cheat.record_suspicion(
            main.ANTI_CHEAT_DB,
            user,
            hallazgo["reason"],
            {"node_id": node.get("id") if isinstance(node, dict) else None, **hallazgo["evidence"]},
            severity=hallazgo["severity"],
        )
    return hallazgos


def list_anti_cheat_suspicions(user=None):
    import main
    return main._anti_cheat.list_suspicions(main.ANTI_CHEAT_DB, user)


def count_anti_cheat_suspicions():
    import main
    return main._anti_cheat.count_suspicions(main.ANTI_CHEAT_DB)


def project_live_profile_status(
    profile, raw=None, now=None, total_nodes=None, timers=None, progress=None
):
    import main
    now = int(now or time.time())
    raw = raw if isinstance(raw, dict) else {}

    # total_nodes, timers y progress los pasa quien proyecta varios perfiles
    # seguidos (la tabla de equipo son 13 llamadas cada 5 s).
    #
    # Sin esto cada perfil releía del disco la ruta, los tiempos y el progreso:
    # con 13 jugadores eran casi 40 lecturas de fichero por petición, y medido
    # en la Raspberry el equipo tardaba ~700 ms de media con picos de 1,1 s.
    if total_nodes is None:
        total_nodes = main.count_runtime_stages()
    if timers is None:
        timers = main.load_player_timers()
    if progress is None:
        progress = main.load_player_progress()

    profile_id = profile.get("id")
    level = progress.get(profile_id, 0) if isinstance(progress, dict) else 0
    try:
        level = int(level)
    except (TypeError, ValueError):
        level = 0

    entrada_timer = timers.get(str(profile_id)) if isinstance(timers, dict) else None
    if isinstance(entrada_timer, dict):
        total_time_ms = (
            sum(entrada_timer.get("stage_times_ms", {}).values())
            + int(entrada_timer.get("penalties_ms") or 0)
        )
    else:
        total_time_ms = 0

    last_seen = int(raw.get("last_seen") or 0)
    gps_status = main._as_str(raw.get("gps_status") or "unknown").strip().lower() or "unknown"

    if last_seen <= 0:
        presence = "offline"
    elif (now - last_seen) <= main.HEARTBEAT_STALE_SECONDS:
        presence = "live"
    else:
        presence = "stale"

    return {
        "user": profile.get("id"),
        "display_name": profile.get("display_name"),
        "session_mode": profile.get("mode", "solo"),
        "members": profile.get("members", []),
        "status": profile.get("status", "active"),
        "color": profile.get("color", ""),
        "avatar_url": profile.get("avatar_url", ""),
        "avatar_initials": profile.get("avatar_initials", ""),
        "presence": presence,
        "last_seen": last_seen,
        "gps_status": gps_status,
        "lat": main._as_float(raw.get("lat")),
        "lon": main._as_float(raw.get("lon")),
        "source": main._as_str(raw.get("source") or "player").strip() or "player",
        "debug_enabled": main._as_bool(raw.get("debug_enabled"), False),
        "total_time_ms": total_time_ms,
        "is_playing": False,
        "level": level,
        # Sin esto la clasificación no sabía quién había acabado: todos los
        # rivales salían como "Nodo N" para siempre y la pantalla final no
        # podía esperar a que terminase el grupo.
        "finished": total_nodes > 0 and level >= total_nodes,
        "total_nodes": total_nodes,
    }

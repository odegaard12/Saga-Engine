"""Registro de partida: envoltorios que le pasan a `match_log` las rutas y la configuración de `main`.

Sacado de `main.py` sin cambiar comportamiento. Todo lo que estas funciones usan
de `main` se pide como `main.NOMBRE` en el momento de la llamada (igual que hacen
los routers), de modo que lo que un test o el arranque cambie en `main` --rutas de
fichero, funciones sustituidas-- sigue mandando. `main` re-exporta estos nombres.
"""
import time


def match_log_display_name(profile_id, profile=None):
    import main
    if isinstance(profile, dict) and profile.get("display_name"):
        return main._as_str(profile.get("display_name"))
    return main._as_str(profile_id)


def match_log_record(event_type, user, payload=None, severity=None, client_created_at=None, profile=None, active=None):
    """Anota una entrada del Registro de partida si la misión está activa."""
    import main
    activo = main.match_log_is_active() if active is None else active
    return main._match_log.record(
        main.MATCH_LOG_DB,
        active=activo,
        event_type=event_type,
        user=user,
        display_name=main.match_log_display_name(user, profile),
        payload=payload,
        severity=severity,
        client_created_at=client_created_at,
    )


def match_log_record_many(entries, active=None):
    """Varias entradas del Registro en UNA transacción (ver match_log.record_many)."""
    import main
    activo = main.match_log_is_active() if active is None else active
    return main._match_log.record_many(main.MATCH_LOG_DB, active=activo, entries=entries)


def match_log_record_position(user, position, now_s, profile=None, active=None):
    import main
    activo = main.match_log_is_active() if active is None else active
    position = position if isinstance(position, dict) else {}
    return main._match_log.record_position_sample(
        main.MATCH_LOG_DB,
        active=activo,
        user=user,
        display_name=main.match_log_display_name(user, profile),
        lat=position.get("lat"),
        lon=position.get("lon"),
        accuracy=position.get("accuracy"),
        source=position.get("source") or "real",
        now=now_s,
    )


def match_log_record_session_open(user, profile=None, active=None, now_s=None, payload=None):
    import main
    activo = main.match_log_is_active() if active is None else active
    return main._match_log.record_session_open(
        main.MATCH_LOG_DB,
        active=activo,
        user=user,
        display_name=main.match_log_display_name(user, profile),
        now=now_s,
        payload=payload,
    )


def match_log_list_timeline(
    user=None, date_from=None, date_to=None, event_type=None, limit=None,
    only_suspicions=False, only_offline=False, by_occurrence=False,
):
    import main
    return main._match_log.list_timeline(
        main.MATCH_LOG_DB, user=user, date_from=date_from, date_to=date_to, event_type=event_type, limit=limit,
        only_suspicions=only_suspicions, only_offline=only_offline, by_occurrence=by_occurrence,
    )


def match_log_count(user=None):
    import main
    return main._match_log.count_entries(main.MATCH_LOG_DB, user=user)


def match_log_purge(user=None):
    import main
    return main._match_log.purge(main.MATCH_LOG_DB, user=user)


def match_log_to_csv(entries):
    import main
    return main._match_log.to_csv(entries)


def match_log_offline_sync_delay_ms(raw_events):
    """Retraso, en ms, entre el evento MÁS VIEJO de la tanda y ahora.

    Busca `local_created_at` (ISO) o `local_created_at_ms` en el payload de
    cada evento crudo -lo que ya manda missionPack.ts para node_completed-.
    Sin ninguna fecha reconocible, no hay nada que medir.
    """
    import main
    if not isinstance(raw_events, list):
        return None

    momentos_ms = []
    for raw in raw_events:
        payload = raw.get("payload") if isinstance(raw, dict) else None
        payload = payload if isinstance(payload, dict) else {}
        candidato = payload.get("local_created_at")
        ms = main._iso_a_ms(candidato) if candidato else None
        if ms is None:
            try:
                ms = int(payload.get("local_created_at_ms")) if payload.get("local_created_at_ms") else None
            except (TypeError, ValueError):
                ms = None
        if ms:
            momentos_ms.append(ms)

    if not momentos_ms:
        return None

    return max(0, int(time.time() * 1000) - min(momentos_ms))


def _clamp_penalty_ms(valor):
    try:
        return max(0, min(3_600_000, int(valor or 0)))
    except (TypeError, ValueError):
        return 0


def match_log_offline_context(payload, now_ms=None):
    """Lo que el Registro de partida necesita saber de un evento que llegó por
    la cola: hora original del móvil, retraso hasta llegar y si se creó sin
    cobertura. `offline` es verdad si el móvil lo declaró al encolar o si
    tardó más de minuto y medio en llegar (una cola que sube al momento no es
    un tramo sin cobertura)."""
    import main
    payload = payload if isinstance(payload, dict) else {}
    ahora = now_ms if now_ms is not None else int(time.time() * 1000)
    creado = main._iso_a_ms(payload.get("local_created_at"))
    retraso = max(0, ahora - creado) if creado else None
    declarado = bool(payload.get("offline_at_creation"))
    contexto = {"offline": bool(declarado or (retraso is not None and retraso > 90_000))}
    if retraso is not None:
        contexto["sync_delay_ms"] = retraso
    if payload.get("seq") is not None:
        contexto["seq"] = payload.get("seq")
    return contexto


def _match_log_anti_cheat_sink(user, reason, evidence, severity):
    """Puente entre el motor antitrampas y el Registro de partida.

    Cada `record_suspicion` (sospecha real o nota "info" neutra) también
    queda anotada en la línea de tiempo del jugador, para no tener que
    cruzar dos paneles a mano al revisar una partida.
    """
    import main
    try:
        main.match_log_record(
            "suspicion" if severity != "info" else "info_note",
            user,
            payload={"reason": reason, **(evidence if isinstance(evidence, dict) else {})},
            severity=severity,
        )
    except Exception:
        pass

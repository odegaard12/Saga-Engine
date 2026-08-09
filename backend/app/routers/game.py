import time
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from backend.app.runtime.core_engine import _as_str, _as_bool

router = APIRouter()

@router.get("/api/state/{user}")
async def get_state(user: str):
    import main
    stages = main.load_stages(main.STAGES_DB)
    profile = main.get_player_profile(user)
    profile_id = profile.get("id") or _as_str(user).strip() or "PLAYER 1"
    lvl = main.get_player_progress_level(profile_id, main.get_player_progress_level(user, 0))
    return {"user": profile_id, "level": lvl, "finished": lvl >= len(stages)}


@router.get("/api/game/{user}")
async def get_game_payload(user: str, request: Request, offline_pack: bool = False):
    import main
    runtime_stages = main.get_runtime_stages()
    profile = main.get_player_profile(user)
    profile_id = profile.get("id") or user
    live_positions = main.load_live_positions()

    lvl = main.get_player_progress_level(profile_id, main.get_player_progress_level(user, 0))
    finished = lvl >= len(runtime_stages)

    current_stage = None
    if not finished and 0 <= lvl < len(runtime_stages):
        current_stage = main.project_stage_for_player(runtime_stages[lvl], include_runtime=True)

    stages = [
        main.project_stage_for_player(stage, include_runtime=(offline_pack or (i == lvl and not finished)))
        for i, stage in enumerate(runtime_stages)
    ]

    inventory_state = main.load_inventory_state()
    inventory_snapshot = inventory_state.get(profile_id, {"items": []})

    payload = {
        "user": profile_id,
        "display_name": profile.get("display_name", profile_id),
        "session_mode": profile.get("mode", "solo"),
        "profile": main.aligerar_avatar(profile),
        "live_status": main.aligerar_avatar(
            main.project_live_profile_status(profile, live_positions.get(profile_id))
        ),
        "level": lvl,
        "finished": finished,
        "stages": stages,
        "current_stage": current_stage,
        "inventory_snapshot": inventory_snapshot,
    }
    response = JSONResponse(payload)
    if main.resolve_known_player_profile(profile_id):
        main.set_player_session_cookie(response, request, profile_id)
    return response


@router.get("/api/team/{user}")
async def get_team_payload(user: str):
    import main
    cfg = main.load_config()
    current_profile = main.get_player_profile(user, cfg)
    current_profile_id = current_profile.get("id") or _as_str(user).strip() or "PLAYER 1"
    live_positions = main.load_live_positions()
    now = int(time.time())

    total_nodes = len(main.get_runtime_stages())
    # Una sola lectura de cada fichero para toda la tabla, no una por jugador.
    timers = main.load_player_timers()
    progress = main.load_player_progress()

    profiles = []
    for profile in main.get_player_profiles(cfg):
        projected = main.project_live_profile_status(
            profile,
            live_positions.get(profile.get("id")),
            now,
            total_nodes=total_nodes,
            timers=timers,
            progress=progress,
        )
        projected["is_self"] = _as_str(profile.get("id")).strip() == _as_str(current_profile_id).strip()
        # Las fotos van por su propio endpoint cacheable: aquí sólo la referencia.
        # Esta respuesta se pide cada 5 segundos y era 87% foto repetida.
        profiles.append(main.aligerar_avatar(projected))

    return {
        "status": "ok",
        "user": current_profile_id,
        "total_nodes": total_nodes,
        # La pantalla final espera a que acabe el grupo entero, así que
        # necesita saber cuántos son y cuántos van terminados.
        "finished_count": sum(1 for item in profiles if item.get("finished")),
        "profiles": profiles
    }


@router.post("/api/events/sync")
async def sync_player_events(request: Request):
    import main
    data = await request.json()
    user = _as_str(data.get("user")).strip()
    main.require_player_session(request, user)
    main.enforce_player_rate_limit("events_sync", request, user, main.EVENT_SYNC_RATE_LIMIT_MAX)

    profile = main.resolve_known_player_profile(user)
    if not profile:
        raise HTTPException(status_code=403, detail="unknown player")

    events = data.get("events")
    if not isinstance(events, list):
        raise HTTPException(status_code=400, detail="events must be a list")

    if len(events) > 100:
        raise HTTPException(status_code=400, detail="too many events")

    inventory_snapshot = data.get("inventory_snapshot")
    if isinstance(inventory_snapshot, dict):
        main.save_player_inventory(user, inventory_snapshot)

    stored = []
    seen_client_events = {}
    for raw_event in events:
        normalized = main.normalize_player_event(raw_event, user, profile)
        client_event_id = _as_str(normalized.get("client_event_id")).strip()

        if client_event_id:
            payload = normalized.get("payload") if isinstance(normalized.get("payload"), dict) else {}
            normalized["payload"] = {
                **payload,
                "client_event_id": client_event_id,
            }

            existing = seen_client_events.get(client_event_id) or main.find_existing_player_client_event(user, client_event_id)
            if existing:
                duplicate = {
                    **existing,
                    "status": existing.get("status") or "synced",
                    "duplicate": True,
                }
                stored.append(duplicate)
                seen_client_events[client_event_id] = duplicate
                continue

        stored_event = main.apply_synced_player_event(normalized, user, profile)
        stored.append(stored_event)

        if client_event_id:
            seen_client_events[client_event_id] = stored_event

    main.append_event(
        main.EVENT_LOG_DB,
        {
            "type": "offline_sync_received",
            "status": "synced",
            "source": "server",
            "user": user,
            "team_id": _as_str(profile.get("id")),
            "payload": {
                "event_count": len(stored),
            },
        },
    )

    return {
        "status": "ok",
        "accepted": len(stored),
        "events": [
            {
                "id": event.get("id"),
                "type": event.get("type"),
                "status": event.get("status"),
                "client_event_id": event.get("client_event_id") or (
                    event.get("payload", {}).get("client_event_id")
                    if isinstance(event.get("payload"), dict)
                    else None
                ),
                "node_id": event.get("node_id"),
                "error": event.get("error"),
                "duplicate": bool(event.get("duplicate")),
            }
            for event in stored
        ],
    }


@router.post("/api/heartbeat")
async def heartbeat(request: Request):
    import main
    data = await request.json()

    user = _as_str(data.get("user")).strip()
    if not user:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "user required"}
        )

    cfg = main.load_config()
    profile = main.resolve_known_player_profile(user, cfg)
    if not profile:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "detail": "unknown profile"}
        )

    profile_id = profile.get("id") or user

    now = time.time()
    ip = main.get_heartbeat_client_ip(request)
    rate_key = f"{ip}:{profile_id}"

    main.prune_heartbeat_rate_state(now)
    last_seen_for_key = float(main.HEARTBEAT_LAST_SEEN_BY_KEY.get(rate_key) or 0)
    if last_seen_for_key and (now - last_seen_for_key) < main.HEARTBEAT_MIN_INTERVAL_SECONDS:
        retry_after = max(1, int(main.HEARTBEAT_MIN_INTERVAL_SECONDS - (now - last_seen_for_key)))
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": str(retry_after)},
            content={"status": "error", "detail": f"heartbeat too frequent; retry in {retry_after}s"}
        )

    lat_present = data.get("lat") is not None
    lon_present = data.get("lon") is not None

    if lat_present != lon_present:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "lat and lon must be sent together"}
        )

    lat = main._as_float(data.get("lat"))
    lon = main._as_float(data.get("lon"))

    if lat_present and (lat is None or lon is None):
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid coordinates"}
        )

    if lat is not None and not (-90 <= lat <= 90):
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "lat out of range"}
        )

    if lon is not None and not (-180 <= lon <= 180):
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "lon out of range"}
        )

    current = main.get_live_position(profile_id)
    if not isinstance(current, dict):
        current = {}

    if lat is not None and lon is not None:
        current["lat"] = lat
        current["lon"] = lon

    current["last_seen"] = int(now)
    current["gps_status"] = main.normalize_heartbeat_gps_status(
        data.get("gps_status") or current.get("gps_status") or "unknown"
    )
    current["source"] = main.normalize_heartbeat_source(
        data.get("source") or current.get("source") or "player"
    )

    # Public heartbeat must not be able to toggle debug state remotely.
    current["debug_enabled"] = False

    main.upsert_live_position_for_user(profile_id, current)
    main.HEARTBEAT_LAST_SEEN_BY_KEY[rate_key] = now

    return {
        "status": "ok",
        "user": profile_id,
        "live_status": main.project_live_profile_status(profile, current)
    }



@router.post("/api/advance")
async def advance(request: Request):
    import main
    data = await request.json()
    user = data.get("user")
    code = (data.get("code") or "").strip().upper()
    time_spent_ms = data.get("time_spent_ms")
    # Lo marca el cliente cuando el código lo ha TECLEADO el jugador. El aviso
    # interno con el que los minijuegos dicen "superado" lo acepta cualquier
    # nodo, así que escrito a mano saltaba el que fuera sin jugar ni penalizar.
    codigo_a_mano = _as_bool(data.get("manual"))
    # Penalización que pide el cliente: código de respaldo, fallos en el reto...
    # Va aparte del tiempo del nodo porque se suma al total de la travesía.
    try:
        penalty_ms = max(0, min(3_600_000, int(data.get("penalty_ms") or 0)))
    except (TypeError, ValueError):
        penalty_ms = 0

    main.require_player_session(request, user)
    main.enforce_player_rate_limit("advance", request, user, main.ADVANCE_RATE_LIMIT_MAX)

    profile = main.get_player_profile(user)
    profile_id = profile.get("id") or _as_str(user).strip() or "PLAYER 1"

    stages = main.get_runtime_stages()
    lvl = main.get_player_progress_level(profile_id, main.get_player_progress_level(user, 0))

    # ¿Desde qué nodo cree el jugador que está avanzando?
    #
    # Con cobertura mala una petición puede tardar más que el corte del móvil:
    # el móvil la da por perdida y la vuelve a mandar, pero la primera SÍ había
    # llegado. Sin esto la segunda avanzaba otro nodo, y el jugador se saltaba
    # uno entero sin enterarse —medido: mandando dos veces el nodo 1 se acababa
    # en el 3—.
    #
    # Los móviles viejos que no manden el número siguen funcionando igual que
    # antes: sin él no se puede distinguir nada y se procesa la petición.
    try:
        nivel_de_partida = data.get("level_before")
        nivel_de_partida = int(nivel_de_partida) if nivel_de_partida is not None else None
    except (TypeError, ValueError):
        nivel_de_partida = None

    # Va por DETRÁS del servidor: es el eco de algo que ya llegó. Se contesta
    # que sí, con el nivel real, y no se toca nada.
    if nivel_de_partida is not None and nivel_de_partida < lvl:
        return {
            "status": "ok",
            "user": profile_id,
            "level": lvl,
            "duplicate": True,
        }

    # Va por DELANTE del servidor, que es un caso muy distinto: el móvil
    # completó nodos sin cobertura y esos avances siguen en su cola sin
    # sincronizar. Antes esto contestaba "ok" con el nivel del servidor: el
    # móvil lo daba por bueno —sólo mira `status`—, el nodo no quedaba anotado
    # en ninguna parte, y a la siguiente lectura el jugador aparecía varios
    # nodos atrás. Eso es el "lo completé y me mandó a repetirlo".
    #
    # Ahora se dice la verdad: no he avanzado, voy por aquí. El móvil vacía su
    # cola contra /api/events/sync y lo vuelve a intentar.
    if nivel_de_partida is not None and nivel_de_partida > lvl:
        return {
            "status": "behind",
            "user": profile_id,
            "level": lvl,
            "server_level": lvl,
            "level_before": nivel_de_partida,
        }

    if lvl < len(stages):
        current_node = stages[lvl]

        if main.stage_accepts_code(current_node, code, manual=codigo_a_mano):
            requirement_status = main.evaluate_stage_item_requirement(current_node, profile_id)

            if not requirement_status["ok"]:
                return {
                    "status": "fail",
                    "user": profile_id,
                    "level": lvl,
                    "reason": "missing_required_item",
                    "requirement": requirement_status,
                }

            if requirement_status["required"] and requirement_status["consume"]:
                main.append_inventory_item_used_event(user, profile_id, current_node, requirement_status)

            if time_spent_ms is not None:
                main.record_player_stage_time(profile_id, lvl, int(time_spent_ms))

            # El cronómetro de la travesía arranca al superar el primer nodo y
            # para al superar el último: lo que cuenta es el reloj, no los
            # segundos que se pasan mirando cada pantalla.
            main.mark_player_started(profile_id)
            main.add_player_penalty(profile_id, penalty_ms)

            main.set_player_progress_level(profile_id, lvl + 1)

            if lvl + 1 >= len(stages):
                main.mark_player_finished(profile_id)

            return {
                "status": "ok",
                "user": profile_id,
                "requirement": requirement_status,
                "level": lvl + 1,
            }

    # El nivel va también en el fallo: el móvil lo necesita para saber si el
    # rechazo es "ese código no vale" o "estamos en nodos distintos".
    return {"status": "fail", "user": profile_id, "level": lvl}

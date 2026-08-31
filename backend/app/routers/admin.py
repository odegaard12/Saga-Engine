import time
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from backend.app.runtime.core_engine import _as_str, _as_bool

router = APIRouter()


def reiniciar_jugador_por_completo(main, profile_id: str) -> None:
    """Todo lo que significa «reiniciar a este jugador», en un solo sitio.

    Había DOS reinicios y no hacían lo mismo:

        /api/admin/profile-action  nivel + relojes + mochila con reset_at + posición
        /api/reset                 sólo el nivel

    Medido en el banco de ensayo con el segundo: el servidor se ponía a 0 y el
    móvil seguía marcando 2/10, con su IndexedDB en el nivel 1. El organizador
    reiniciaba a alguien y esa persona seguía jugando como si nada.

    La razón es `reset_at`. El móvil manda sobre su propio progreso -tiene que
    ser así, porque en el monte avanza sin cobertura-, y la ÚNICA señal que le
    hace ceder es esa marca dentro del inventario. Sin ella no hay reinicio que
    valga: el cliente da por buena su copia y sigue.

    Los cronómetros y la posición van aquí por lo mismo: un jugador reiniciado
    volvía al nodo 1 con el reloj de la partida anterior corriendo, y su última
    coordenada seguía en el mapa de los demás como si ya estuviera en la ruta.
    """
    main.clear_all_player_timers(profile_id)

    # La mochila de verdad vive en el móvil: el cliente compara su marca con
    # ésta y se vacía solo. Sin esto sólo se limpia el servidor y el jugador
    # sigue viendo sus objetos viejos -llegaba al nodo final con el Sello ya
    # forjado y se saltaba media misión-.
    main.save_player_inventory(
        profile_id,
        {
            "user": profile_id,
            "updated_at": "",
            "items": [],
            "reset_at": int(time.time() * 1000),
        },
    )

    main.clear_live_position(profile_id)


MAX_PERFILES = 60
MAX_AVATAR_CHARS = 400_000  # ~300 KB de foto ya comprimida en data URI


def _normalize_incoming_profiles(raw):
    """Valida las fichas de jugador que llegan del panel.

    Devuelve None si no venían (para no pisar las guardadas) y una lista limpia
    si venían. Los ids se deduplican porque son la clave con la que el jugador
    entra: dos iguales harían que compartiesen partida sin saberlo.
    """
    if not isinstance(raw, list):
        return None

    perfiles = []
    vistos = set()

    for index, item in enumerate(raw[:MAX_PERFILES]):
        if not isinstance(item, dict):
            continue

        pid = _as_str(item.get("id")).strip()[:120] or f"PLAYER {index + 1}"
        if pid in vistos:
            continue
        vistos.add(pid)

        avatar = _as_str(item.get("avatar_url")).strip()
        if len(avatar) > MAX_AVATAR_CHARS:
            # Mejor sin foto que romper el fichero de configuración entero.
            avatar = ""

        miembros = item.get("members")
        miembros = (
            [_as_str(m).strip()[:120] for m in miembros if _as_str(m).strip()]
            if isinstance(miembros, list)
            else []
        )

        perfiles.append(
            {
                "id": pid,
                "display_name": _as_str(item.get("display_name")).strip()[:120] or pid,
                "mode": "team" if _as_str(item.get("mode")).strip() == "team" else "solo",
                "members": miembros,
                "status": _as_str(item.get("status")).strip()[:40] or "active",
                "color": _as_str(item.get("color")).strip()[:40],
                "avatar_url": avatar,
                "avatar_initials": _as_str(item.get("avatar_initials")).strip()[:3].upper(),
            }
        )

    return perfiles


def _engine_version(main) -> str:
    """Versión del motor, para saber con qué se generó una copia."""
    try:
        return (main.APP_DIR / "VERSION").read_text().strip()
    except Exception:
        return "dev"


@router.post("/api/admin/export")
async def admin_export(request: Request):
    """Copia de respaldo de la misión entera, en un solo fichero.

    El botón de administración exportaba sólo un GPX con el trazado, que no
    sirve para recuperar nada: si se pierde la tarjeta de la Raspberry se van
    con ella los nodos, la configuración de cada juego, los textos de la
    historia, los jugadores y sus fotos. Esto se lo lleva todo.
    """
    import main

    data = await request.json()

    if not main.admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    cfg = main.load_config()
    raw_stages = main.load_stages(main.STAGES_DB)
    if not isinstance(raw_stages, list):
        raw_stages = []

    progress = main.load_player_progress()
    timers = main.load_player_timers()
    inventories = main.load_inventory_state()

    perfiles = []
    for profile in main.get_player_profiles(cfg):
        profile_id = profile.get("id")
        perfiles.append(
            {
                **profile,
                "level": main.get_player_progress_level(profile_id, 0),
                "total_time_ms": main.get_player_total_time_ms(profile_id),
                "stage_times_ms": (timers.get(str(profile_id)) or {}).get("stage_times_ms", {}),
                "inventory": inventories.get(profile_id, {"items": []}),
            }
        )

    # El trazado va aparte además de dentro de cada nodo, para poder
    # reconstruir el GPX sin tener que recorrer la ruta entera.
    trazado = []
    for stage in raw_stages:
        for punto in stage.get("route_track") or []:
            if isinstance(punto, (list, tuple)) and len(punto) >= 2:
                trazado.append([punto[0], punto[1]])
            elif isinstance(punto, dict) and "lat" in punto and "lon" in punto:
                trazado.append([punto["lat"], punto["lon"]])

    return {
        "status": "ok",
        "format": "saga-backup",
        "format_version": 1,
        "exported_at": int(time.time()),
        "engine_version": _engine_version(main),
        "config": cfg,
        "stages": raw_stages,
        "route_track": trazado,
        "profiles": perfiles,
        "progress": progress,
        "counts": {
            "stages": len(raw_stages),
            "profiles": len(perfiles),
            "route_points": len(trazado),
        },
    }


@router.post("/api/admin/react-overview")
async def admin_react_overview(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if main.admin_password_change_required():
        return {
            "status": "password_change_required",
            "message": "Admin password change required before using the React admin overview.",
        }

    cfg = main.load_config()
    stages = main.get_runtime_stages()
    profiles = main.get_player_profiles(cfg)

    gamestate = main.load_player_progress()
    positions = main.load_live_positions()
    inventory_state = main.load_inventory_state()

    stage_summaries = [
        main._admin_react_stage_summary(stage, idx)
        for idx, stage in enumerate(stages)
    ]

    family_counts = {
        "signal_hunt": 0,
        "bearing_hunt": 0,
        "circuit_matrix": 0,
    }
    for stage in stage_summaries:
        stage_type = stage.get("type")
        if stage_type in family_counts:
            family_counts[stage_type] += 1

    profile_summaries = [
        main._admin_react_profile_summary(profile, gamestate, positions, inventory_state)
        for profile in profiles
    ]

    return {
        "status": "ok",
        "config": {
            "site_name": cfg.get("site_name"),
            "admin_title": cfg.get("admin_title"),
            "admin_subtitle": cfg.get("admin_subtitle"),
            "player_theme": cfg.get("player_theme"),
            "map_center": cfg.get("map_center"),
            "map_zoom": cfg.get("map_zoom"),
            "login_title": cfg.get("login_title"),
            "login_subtitle": cfg.get("login_subtitle"),
            "login_instructions": cfg.get("login_instructions"),
            "prologue_title": cfg.get("prologue_title"),
            "prologue_subtitle": cfg.get("prologue_subtitle"),
            "prologue_image_url": cfg.get("prologue_image_url"),
            "prologue_body": cfg.get("prologue_body"),
            "mapbox_token": cfg.get("mapbox_token"),
            "mapbox_style": cfg.get("mapbox_style"),
        },
        "counts": {
            "players": len(cfg.get("players", [])) if isinstance(cfg.get("players"), list) else 0,
            "profiles": len(profiles),
            "stages": len(stage_summaries),
            "finished_profiles": sum(1 for item in profile_summaries if item.get("finished")),
            "family_counts": family_counts,
        },
        "families": [
            {"id": "signal_hunt", "label": "Signal Hunt"},
            {"id": "bearing_hunt", "label": "Bearing Hunt"},
            {"id": "circuit_matrix", "label": "Circuit Matrix"},
        ],
        "stages": stage_summaries,
        "profiles": profile_summaries,
        # Los perfiles completos, con la foto incrustada.
        #
        # El panel las sacaba de /api/config, que es público. Dos motivos para
        # traerlas por aquí: allí eran 134 KB de los 135 KB que el jugador se
        # bajaba cada 30 segundos —16 MB por hora y por móvil mandando las
        # mismas caras—, y además dejaban los retratos de los catorce al alcance
        # de cualquiera que pidiese la URL.
        #
        # El panel las necesita enteras para editarlas: si le llegan vacías,
        # guardar borra las fotos de todo el mundo.
        "player_profiles": profiles,
    }


@router.post("/api/admin/mission-status")
async def admin_mission_status(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    cfg = main.load_config()
    runtime_stages = main.get_runtime_stages()
    state = main.load_player_progress()
    positions = main.load_live_positions()
    now = int(time.time())

    items = []
    for profile in main.get_player_profiles(cfg):
        profile_id = profile.get("id")
        lvl = state.get(profile_id, 0)
        finished = lvl >= len(runtime_stages)

        current_stage = ""
        if not finished and 0 <= lvl < len(runtime_stages):
            current_stage = runtime_stages[lvl]["presentation"]["title"]

        items.append({
            **main.project_live_profile_status(profile, positions.get(profile_id), now),
            "level": lvl,
            "finished": finished,
            "current_stage": current_stage,
        })

    return {
        "status": "ok",
        "server_ts": now,
        "profiles": items
    }


@router.post("/api/admin/stages")
async def get_stages(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if main.admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"}
        )

    return main.load_stages(main.STAGES_DB)


@router.post("/api/admin/save-config")
async def save_config_endpoint(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if main.admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    incoming = data.get("config") or {}
    cfg = main.load_config()

    updated = {
        **cfg,
        "site_name": _as_str(incoming.get("site_name") if "site_name" in incoming else cfg.get("site_name")).strip() or "SAGA Engine",
        "admin_title": _as_str(incoming.get("admin_title") if "admin_title" in incoming else cfg.get("admin_title")).strip() or "Mission Control",
        "admin_subtitle": _as_str(incoming.get("admin_subtitle") if "admin_subtitle" in incoming else cfg.get("admin_subtitle")).strip() or "Map-first control panel",
        "login_title": _as_str(incoming.get("login_title") if "login_title" in incoming else cfg.get("login_title", "")).strip(),
        "login_subtitle": _as_str(incoming.get("login_subtitle") if "login_subtitle" in incoming else cfg.get("login_subtitle", "Protected access")).strip(),
        "login_instructions": _as_str(incoming.get("login_instructions") if "login_instructions" in incoming else cfg.get("login_instructions", "")).strip(),
        "story_title": _as_str(incoming.get("story_title") if "story_title" in incoming else cfg.get("story_title", "")).strip(),
        "story_text": _as_str(incoming.get("story_text") if "story_text" in incoming else cfg.get("story_text", "")).strip(),
        "prologue_title": _as_str(incoming.get("prologue_title") if "prologue_title" in incoming else cfg.get("prologue_title", "")).strip(),
        "prologue_subtitle": _as_str(incoming.get("prologue_subtitle") if "prologue_subtitle" in incoming else cfg.get("prologue_subtitle", "")).strip(),
        "prologue_body": _as_str(incoming.get("prologue_body") if "prologue_body" in incoming else cfg.get("prologue_body", "")).strip(),
        "prologue_image_url": _as_str(incoming.get("prologue_image_url") if "prologue_image_url" in incoming else cfg.get("prologue_image_url", "")).strip(),
        "mapbox_token": _as_str(incoming.get("mapbox_token") if "mapbox_token" in incoming else cfg.get("mapbox_token", "")).strip(),
        "mapbox_style": _as_str(incoming.get("mapbox_style") if "mapbox_style" in incoming else cfg.get("mapbox_style", "")).strip(),
    }

    raw_center = incoming.get("map_center")
    if isinstance(raw_center, list) and len(raw_center) == 2:
        try:
            lat = float(raw_center[0])
            lon = float(raw_center[1])
            updated["map_center"] = [lat, lon]
        except (ValueError, TypeError):
            pass

    if incoming.get("map_zoom") is not None:
        try:
            updated["map_zoom"] = int(incoming["map_zoom"])
        except (ValueError, TypeError):
            pass

    if incoming.get("player_theme") is not None:
        updated["player_theme"] = main.normalize_player_theme(incoming["player_theme"])

    # Jugadores y sus fichas.
    #
    # Esto NO estaba: la respuesta se armaba campo a campo y ni "players" ni
    # "player_profiles" se copiaban nunca, así que {**cfg} devolvía siempre la
    # lista vieja. El panel enviaba los cambios, el servidor contestaba "ok" y
    # los descartaba: los jugadores nuevos desaparecían al recargar y las fotos
    # subidas desde administración no llegaban a guardarse, por eso no salían
    # ni en el login, ni en el mapa, ni en la clasificación.
    perfiles = _normalize_incoming_profiles(incoming.get("player_profiles"))
    if perfiles is not None:
        updated["player_profiles"] = perfiles
        updated["players"] = [p["id"] for p in perfiles]
    elif isinstance(incoming.get("players"), list):
        ids = []
        for item in incoming["players"]:
            texto = _as_str(item).strip()[:120]
            if texto and texto not in ids:
                ids.append(texto)
        if ids:
            updated["players"] = ids

    main.save_config(updated)
    return {"status": "ok"}


@router.post("/api/reset")
async def reset(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    user = _as_str(data.get("user")).strip()
    if not user:
        raise HTTPException(status_code=400, detail="user is required")

    # El mismo reinicio que el del panel de perfiles, no una versión corta.
    # Aquí sólo se bajaba el nivel, y eso no llega al móvil: ver
    # `reiniciar_jugador_por_completo`.
    main.set_player_progress_level(user, 0)
    reiniciar_jugador_por_completo(main, user)
    return {"status": "ok"}


@router.post("/api/admin/profile-action")
async def admin_profile_action(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if main.admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"}
        )

    profile_id = _as_str(data.get("profile_id")).strip()
    action = _as_str(data.get("action")).strip().lower()

    allowed_actions = {
        "reset_profile",
        "level_prev",
        "level_next",
        "mark_finished",
        "clear_inventory",
        "restore_node",
    }

    if action not in allowed_actions and not action.startswith("give_item:") and not action.startswith("remove_item:"):
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid action"}
        )

    cfg = main.load_config()
    profiles = {
        _as_str((p or {}).get("id")).strip(): (p or {})
        for p in main.get_player_profiles(cfg)
    }

    if not profile_id or profile_id not in profiles:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "detail": "unknown profile"}
        )

    runtime_stages = main.get_runtime_stages()
    max_level = len(runtime_stages)

    previous_level = max(0, min(main.get_player_progress_level(profile_id, 0), max_level))

    if action == "reset_profile":
        new_level = 0
        reiniciar_jugador_por_completo(main, profile_id)
    elif action == "level_prev":
        new_level = max(0, previous_level - 1)
    elif action == "restore_node":
        new_level = max(0, previous_level - 1)
        main.clear_player_stage_time(profile_id, new_level)
    elif action == "level_next":
        new_level = min(max_level, previous_level + 1)
        # Automatically award any collectible from the node being skipped
        if previous_level < len(runtime_stages):
            skipped_stage = runtime_stages[previous_level]
            if skipped_stage.get("physical_node_kind") == "collectible" and skipped_stage.get("physical_item_id"):
                item_id = skipped_stage.get("physical_item_id")
                item_label = skipped_stage.get("physical_item_label") or item_id
                
                inventory_state = main.load_inventory_state()
                inventory = inventory_state.get(profile_id, {"user": profile_id, "updated_at": "", "items": []})
                existing = next((i for i in inventory["items"] if i.get("item_id") == item_id), None)
                
                if existing:
                    existing["quantity"] = existing.get("quantity", 0) + 1
                else:
                    inventory["items"].append({"item_id": item_id, "label": item_label, "state": "collected", "quantity": 1})
                
                main.save_player_inventory(profile_id, inventory)
    elif action == "mark_finished":
        new_level = max_level
    else:
        new_level = previous_level

    if action.startswith("give_item:") or action.startswith("remove_item:") or action == "clear_inventory":
        inventory_state = main.load_inventory_state()
        inventory = inventory_state.get(profile_id, {"user": profile_id, "updated_at": "", "items": []})
        
        if action == "clear_inventory":
            inventory["items"] = []
        elif action.startswith("give_item:"):
            item_id = action.replace("give_item:", "")

            # ¿De qué nodo sale este objeto? Sirve para dos cosas: poner la
            # etiqueta bonita en vez del id crudo, y dar el nodo por hecho.
            source_index = None
            source_label = item_id
            for index, stage in enumerate(runtime_stages):
                if _stage_item_id(stage) == item_id:
                    source_index = index
                    source_label = _stage_item_label(stage) or item_id
                    break

            existing = next((i for i in inventory["items"] if i.get("item_id") == item_id), None)
            if existing:
                existing["quantity"] = existing.get("quantity", 0) + 1
                if not existing.get("label") or existing.get("label") == item_id:
                    existing["label"] = source_label
            else:
                inventory["items"].append({
                    "item_id": item_id,
                    "label": source_label,
                    "state": "collected",
                    "quantity": 1,
                })

            # Entregar a mano el objeto de un nodo equivale a haberlo hecho: si
            # no, el jugador se quedaba con el objeto en la mochila y el nodo
            # seguía bloqueado delante de él.
            if source_index is not None and previous_level <= source_index:
                new_level = min(max_level, source_index + 1)
                main.set_player_progress_level(profile_id, new_level, 0, desde_admin=True)
        elif action.startswith("remove_item:"):
            item_id = action.replace("remove_item:", "")
            inventory["items"] = [i for i in inventory["items"] if i.get("item_id") != item_id]
        
        main.save_player_inventory(profile_id, inventory)
    else:
        penalty_ms = 0
        if action in ("level_next", "mark_finished"):
            if previous_level < len(runtime_stages):
                skipped_stage = runtime_stages[previous_level]
                penalty_ms = skipped_stage.get("time_limit_ms") or 300000
            else:
                penalty_ms = 300000
        main.set_player_progress_level(profile_id, new_level, penalty_ms, desde_admin=True)

    return {
        "status": "ok",
        "profile_id": profile_id,
        "action": action,
        "previous_level": previous_level,
        "level": new_level,
        "finished": new_level >= max_level,
        "total_stages": max_level,
    }


def _stage_item_id(stage):
    """id del coleccionable de un nodo, mire donde mire la forma del nodo."""
    if not isinstance(stage, dict):
        return None
    config = stage.get("config") if isinstance(stage.get("config"), dict) else {}
    physical = stage.get("physical_qr") if isinstance(stage.get("physical_qr"), dict) else {}
    for value in (
        stage.get("physical_item_id"),
        config.get("physical_item_id"),
        physical.get("item_id"),
    ):
        if value:
            return str(value)
    return None


def _stage_item_label(stage):
    if not isinstance(stage, dict):
        return None
    config = stage.get("config") if isinstance(stage.get("config"), dict) else {}
    physical = stage.get("physical_qr") if isinstance(stage.get("physical_qr"), dict) else {}
    for value in (
        stage.get("physical_item_label"),
        config.get("physical_item_label"),
        physical.get("label"),
    ):
        if value:
            return str(value)
    return None


@router.post("/api/admin/save")
async def save_stages_endpoint(request: Request):
    import main
    data = await request.json()
    if not main.admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error"})
    if main.admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    stages = data.get("stages")
    errors = main.validate_stages(stages)
    if errors:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid stages", "errors": errors}
        )

    # El nivel guardado de cada jugador es un índice en esta lista, no un id
    # de nodo: hay que leer la lista VIEJA antes de pisarla, para poder decir
    # a qué nodo apuntaba cada jugador antes del cambio. Ver
    # backend/app/runtime/mision_reindex.py.
    old_stages = main.load_stages(main.STAGES_DB)

    main.save_stages(main.STAGES_DB, stages)
    main.reindex_player_levels_on_save(old_stages, stages)
    return {"status": "ok"}


@router.post("/api/admin/login")
async def admin_login(request: Request):
    import main
    data = await request.json()
    now = time.time()
    ip = main.get_client_ip(request)

    remaining = main.get_admin_lock_remaining_seconds(ip, now)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail=f"too many failed attempts; retry in {remaining}s"
        )

    if main.verify_admin_password(data.get("password")):
        main.clear_admin_login_state(ip)
        expires_at = int(time.time()) + main.ADMIN_SESSION_TTL_SECONDS
        response = JSONResponse(
            {
                "status": "ok",
                "must_change": main.admin_password_change_required(),
                "session_expires_at": expires_at,
            }
        )
        main.set_admin_session_cookie(response, request, main.create_admin_session())
        return response

    main.register_admin_login_failure(ip, now)
    raise HTTPException(status_code=401, detail="invalid admin password")


@router.post("/api/admin/logout")
async def admin_logout(request: Request):
    import main
    token = request.cookies.get(main.ADMIN_SESSION_COOKIE)
    if token:
        main.ADMIN_SESSIONS.pop(token, None)
        main.admin_auth_security.clear_persistent_admin_session(main.ADMIN_SESSIONS_DB, token)

    response = JSONResponse({"status": "ok"})
    main.clear_admin_session_cookie(response, request)
    main.clear_player_session_cookie(response, request)
    return response


@router.post("/api/admin/change-password")
async def admin_change_password(request: Request):
    import main
    data = await request.json()
    if not main.admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    current_password = (data.get("password") or "").strip()
    new_password = (data.get("new_password") or "").strip()
    confirm_password = (data.get("confirm_password") or "").strip()

    if not main.verify_admin_password(current_password):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if not new_password:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "new password required"})

    if len(new_password) < 10:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "detail": "Password must be at least 10 characters long.",
            },
        )

    if main.is_weak_admin_password(new_password):
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "detail": "Password is too weak. Avoid common words or simple patterns.",
            },
        )

    if new_password != confirm_password:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "New passwords do not match."},
        )

    main.set_admin_password(new_password)
    return {"status": "ok"}


@router.post("/api/admin/events")
async def admin_events(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    limit = data.get("limit", 100)
    try:
        limit = max(1, min(500, int(limit)))
    except (TypeError, ValueError):
        limit = 100

    status = main.sanitize_event_text(data.get("status"), 80) or None
    user = main.sanitize_event_text(data.get("user"), 120) or None
    event_type = main.sanitize_event_text(data.get("type"), 80) or None

    return {
        "status": "ok",
        "events": main.list_events(
            main.EVENT_LOG_DB,
            status=status,
            user=user,
            event_type=event_type,
            limit=limit,
        ),
    }

@router.post("/api/admin/events/mark")
async def admin_mark_event(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    event_id = main.sanitize_event_text(data.get("event_id"), 120)
    next_status = main.sanitize_event_text(data.get("status"), 40)

    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required")

    updated = main.mark_event_status(
        main.EVENT_LOG_DB,
        event_id,
        next_status,
        error=main.sanitize_event_text(data.get("error"), 300) or None,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="event not found")

    return {
        "status": "ok",
        "event": updated,
    }


@router.post("/api/admin/player/restore-node")
async def admin_restore_node(request: Request):
    import main
    data = await request.json()

    if not main.admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    user_target = main.sanitize_event_text(data.get("user"), 120)
    if not user_target:
        raise HTTPException(status_code=400, detail="user is required")

    profile = main.get_player_profile(user_target)
    profile_id = profile.get("id") or user_target
    
    current_level = main.get_player_progress_level(profile_id)
    if current_level > 0:
        new_level = current_level - 1
        main.set_player_progress_level(profile_id, new_level, desde_admin=True)
        main.clear_player_stage_time(profile_id, new_level)
        return {"status": "ok", "new_level": new_level, "restored_node_index": new_level}
    
    return {"status": "fail", "reason": "already_at_start"}


CONFIRMACION_BORRADO = "BORRAR"


def _contar_datos_personales():
    """Qué hay guardado de personas ahora mismo.

    Se cuenta antes de borrar para que el panel pueda decir exactamente qué se
    va a perder. Un borrado que no dice lo que se lleva no se usa nunca, o se
    usa una vez y da un susto.
    """
    import main
    from backend.app.routers import field_proofs as fotos

    fotos.init_field_proof_schema()
    conn = fotos.connect_runtime_sqlite()
    try:
        total_fotos = conn.execute("SELECT COUNT(*) AS n FROM field_proofs").fetchone()["n"]
    finally:
        conn.close()

    posiciones = main.load_live_positions()
    n_posiciones = sum(
        1 for v in (posiciones or {}).values()
        if isinstance(v, dict) and (v.get("lat") is not None or v.get("lon") is not None)
    )

    ficheros = 0
    base = fotos.resolve_field_proofs_dir()
    if base.exists():
        ficheros = sum(1 for f in base.iterdir() if f.is_file())

    return {
        "fotos": int(total_fotos),
        "ficheros_de_imagen": ficheros,
        "posiciones_gps": n_posiciones,
    }


@router.post("/api/admin/datos-personales")
async def admin_datos_personales(request: Request):
    """Ver y borrar lo que SAGA guarda de personas.

    SAGA guarda nombres, fotos hechas por los jugadores y rastros GPS: la
    posición de cada latido y las coordenadas exactas de cada foto con su hora
    y su nodo. Todo eso se quedaba para siempre y no había forma de limpiarlo.

    Contra los datos de personas, lo que protege de verdad no es el permiso
    firmado —que cubre hacer la foto, no guardarla dos años— sino no tener lo
    que no hace falta. Esto es lo que permite pasar una ruta con menores y
    dejarlo limpio al acabar.

    NO toca la misión: los nodos, la configuración y las fichas de jugador se
    quedan. Tampoco los tiempos ni el progreso, que son el resultado del juego
    y no llevan nada que no sea el nombre; para eso está el reseteo de siempre.

    Sin `confirmacion` sólo cuenta, no borra.
    """
    import main
    from backend.app.routers import field_proofs as fotos

    data = await request.json()

    if not main.admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    antes = _contar_datos_personales()

    if _as_str(data.get("confirmacion")).strip() != CONFIRMACION_BORRADO:
        return {
            "status": "ok",
            "accion": "contar",
            "datos": antes,
            "para_borrar": (
                "Repite la llamada con confirmacion='%s'. Se borran las fotos y "
                "las posiciones GPS. La misión y los tiempos se quedan."
                % CONFIRMACION_BORRADO
            ),
        }

    borrar_fotos = _as_bool(data.get("fotos", True))
    borrar_posiciones = _as_bool(data.get("posiciones", True))

    imagenes_borradas = 0
    filas_borradas = 0

    if borrar_fotos:
        fotos.init_field_proof_schema()
        conn = fotos.connect_runtime_sqlite()
        try:
            nombres = [
                _as_str(row["image_filename"]).strip()
                for row in conn.execute("SELECT image_filename FROM field_proofs").fetchall()
            ]
            filas_borradas = conn.execute("DELETE FROM field_proofs").rowcount or 0
            conn.commit()
        finally:
            conn.close()

        base = fotos.resolve_field_proofs_dir().resolve()
        for nombre in nombres:
            if not nombre:
                continue
            destino = (base / nombre).resolve()
            # Sin salirse del directorio de fotos, por si un nombre viniera con
            # sorpresa desde una versión antigua.
            if not str(destino).startswith(str(base)):
                continue
            try:
                if destino.is_file():
                    destino.unlink()
                    imagenes_borradas += 1
            except OSError:
                pass

        # Y las que quedaran sueltas sin fila que las nombre.
        if base.exists():
            for suelto in base.iterdir():
                try:
                    if suelto.is_file():
                        suelto.unlink()
                        imagenes_borradas += 1
                except OSError:
                    pass

    posiciones_borradas = 0
    if borrar_posiciones:
        posiciones = main.load_live_positions() or {}
        posiciones_borradas = len(posiciones)
        main.save_live_positions({})

    main.append_event(
        main.EVENT_LOG_DB,
        {
            "type": "personal_data_purged",
            "status": "synced",
            "source": "admin",
            "user": "admin",
            "payload": {
                "fotos_borradas": filas_borradas,
                "imagenes_borradas": imagenes_borradas,
                "posiciones_borradas": posiciones_borradas,
            },
        },
    )

    return {
        "status": "ok",
        "accion": "borrar",
        "antes": antes,
        "borrado": {
            "fotos": filas_borradas,
            "imagenes": imagenes_borradas,
            "posiciones_gps": posiciones_borradas,
        },
        "queda": _contar_datos_personales(),
    }

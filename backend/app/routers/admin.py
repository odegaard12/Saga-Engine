import time
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from backend.app.runtime.core_engine import _as_str, _as_bool

router = APIRouter()

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
        "site_name": _as_str(incoming.get("site_name") or cfg.get("site_name")).strip() or "SAGA Engine",
        "admin_title": _as_str(incoming.get("admin_title") or cfg.get("admin_title")).strip() or "Mission Control",
        "admin_subtitle": _as_str(incoming.get("admin_subtitle") or cfg.get("admin_subtitle")).strip() or "Map-first control panel",
        "login_subtitle": _as_str(incoming.get("login_subtitle") or cfg.get("login_subtitle", "Protected access")).strip(),
        "story_title": _as_str(incoming.get("story_title") or "").strip(),
        "story_text": _as_str(incoming.get("story_text") or "").strip(),
        "prologue_title": _as_str(incoming.get("prologue_title") or "").strip(),
        "prologue_subtitle": _as_str(incoming.get("prologue_subtitle") or "").strip(),
        "prologue_body": _as_str(incoming.get("prologue_body") or "").strip(),
        "mapbox_token": _as_str(incoming.get("mapbox_token") or "").strip(),
        "mapbox_style": _as_str(incoming.get("mapbox_style") or "").strip(),
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

    main.reset_player_level(main.GAME_DB, user)
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
    elif action == "level_prev":
        new_level = max(0, previous_level - 1)
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

    if action.startswith("give_item:") or action.startswith("remove_item:"):
        inventory_state = main.load_inventory_state()
        inventory = inventory_state.get(profile_id, {"user": profile_id, "updated_at": "", "items": []})
        
        if action.startswith("give_item:"):
            item_id = action.replace("give_item:", "")
            existing = next((i for i in inventory["items"] if i.get("item_id") == item_id), None)
            if existing:
                existing["quantity"] = existing.get("quantity", 0) + 1
            else:
                inventory["items"].append({"item_id": item_id, "label": item_id, "state": "collected", "quantity": 1})
        elif action.startswith("remove_item:"):
            item_id = action.replace("remove_item:", "")
            inventory["items"] = [i for i in inventory["items"] if i.get("item_id") != item_id]
        
        main.save_player_inventory(profile_id, inventory)
    else:
        main.set_player_progress_level(profile_id, new_level)

    return {
        "status": "ok",
        "profile_id": profile_id,
        "action": action,
        "previous_level": previous_level,
        "level": new_level,
        "finished": new_level >= max_level,
        "total_stages": max_level,
    }


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

    main.save_stages(main.STAGES_DB, stages)
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


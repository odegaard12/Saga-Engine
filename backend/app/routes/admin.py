"""Route module extracted from main.py.

This module intentionally delegates to helpers/state still defined in main.py.
It is a mechanical route split, not a behavior rewrite.
"""

from __future__ import annotations

from fastapi import APIRouter

import main as _main

globals().update({key: value for key, value in vars(_main).items() if key != "app"})

router = APIRouter()

@router.post("/api/admin/react-overview")
async def admin_react_overview(request: Request):
    data = await request.json()

    if not admin_request_authorized(request, data):
        return {
            "status": "fail",
            "message": "Invalid admin password",
        }

    if admin_password_change_required():
        return {
            "status": "password_change_required",
            "message": "Admin password change required before using the React admin overview.",
        }

    cfg = load_config()
    stages = get_runtime_stages()
    profiles = get_player_profiles(cfg)

    gamestate = load_player_progress()
    positions = load_live_positions()

    stage_summaries = [
        _admin_react_stage_summary(stage, idx)
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
        _admin_react_profile_summary(profile, gamestate, positions)
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
    data = await request.json()

    if not admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    cfg = load_config()
    runtime_stages = get_runtime_stages()
    state = load_player_progress()
    positions = load_live_positions()
    now = int(time.time())

    items = []
    for profile in get_player_profiles(cfg):
        profile_id = profile.get("id")
        lvl = state.get(profile_id, 0)
        finished = lvl >= len(runtime_stages)

        current_stage = ""
        if not finished and 0 <= lvl < len(runtime_stages):
            current_stage = runtime_stages[lvl]["presentation"]["title"]

        items.append({
            **project_live_profile_status(profile, positions.get(profile_id), now),
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
    data = await request.json()

    if not admin_request_authorized(request, data):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"}
        )

    return load_json(_main.STAGES_DB, [])

@router.post("/api/admin/save-config")
async def save_config_endpoint(request: Request):
    data = await request.json()

    if not admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    incoming = data.get("config") or {}
    cfg = load_config()

    if "players" in incoming:
        players = parse_player_entries(incoming.get("players"))
    else:
        players = parse_player_entries(cfg.get("players", ["PLAYER 1", "PLAYER 2"]))

    ui_lang = str(incoming.get("ui_lang", cfg.get("ui_lang", "en"))).strip().lower()
    if ui_lang not in {"en"}:
        ui_lang = "en"

    player_theme = normalize_player_theme(incoming.get("player_theme", cfg.get("player_theme", "classic")))

    cfg["site_name"] = incoming.get("site_name", cfg.get("site_name", "PUT TITLE HERE")).strip() or "PUT TITLE HERE"
    cfg["admin_title"] = incoming.get("admin_title", cfg.get("admin_title", "PUT ADMIN TITLE HERE")).strip() or "PUT ADMIN TITLE HERE"
    cfg["admin_subtitle"] = incoming.get("admin_subtitle", cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE")).strip()
    cfg["ui_lang"] = ui_lang
    cfg["player_theme"] = player_theme
    cfg["story_title"] = incoming.get("story_title", cfg.get("story_title", "")).strip()
    cfg["story_text"] = incoming.get("story_text", cfg.get("story_text", "")).strip()
    cfg["prologue_title"] = incoming.get("prologue_title", cfg.get("prologue_title", "PUT PROLOGUE TITLE HERE")).strip()
    cfg["prologue_subtitle"] = incoming.get("prologue_subtitle", cfg.get("prologue_subtitle", "")).strip()
    cfg["prologue_body"] = incoming.get("prologue_body", cfg.get("prologue_body", "")).strip()

    map_center = incoming.get("map_center", cfg.get("map_center", [40.4168, -3.7038]))
    if isinstance(map_center, list) and len(map_center) == 2:
        try:
            cfg["map_center"] = [float(map_center[0]), float(map_center[1])]
        except Exception:
            pass

    try:
        cfg["map_zoom"] = int(incoming.get("map_zoom", cfg.get("map_zoom", 13)))
    except Exception:
        pass

    cfg["players"] = players

    save_json("config.json", cfg)
    return {"status": "ok", "config": cfg}

@router.post("/api/admin/profile-action")
async def admin_profile_action(request: Request):
    data = await request.json()

    if not admin_request_authorized(request, data):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if admin_password_change_required():
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

    if action not in allowed_actions:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid action"}
        )

    cfg = load_config()
    profiles = {
        _as_str((p or {}).get("id")).strip(): (p or {})
        for p in get_player_profiles(cfg)
    }

    if not profile_id or profile_id not in profiles:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "detail": "unknown profile"}
        )

    runtime_stages = get_runtime_stages()
    max_level = len(runtime_stages)

    previous_level = _clamp_game_level(get_player_progress_level(profile_id, 0), max_level)

    if action == "reset_profile":
        new_level = 0
    elif action == "level_prev":
        new_level = max(0, previous_level - 1)
    elif action == "level_next":
        new_level = min(max_level, previous_level + 1)
    else:  # mark_finished
        new_level = max_level

    set_player_progress_level(profile_id, new_level)

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
    data = await request.json()
    if not admin_request_authorized(request, data):
        return JSONResponse(status_code=403, content={"status": "error"})
    if admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    stages = data.get("stages")
    errors = validate_stages(stages)
    if errors:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid stages", "errors": errors}
        )

    save_json(_main.STAGES_DB, stages)
    return {"status": "ok"}

@router.post("/api/admin/login")
async def admin_login(request: Request):
    data = await request.json()
    now = time.time()
    ip = get_client_ip(request)

    remaining = get_admin_lock_remaining_seconds(ip, now)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail=f"too many failed attempts; retry in {remaining}s"
        )

    if verify_admin_password(data.get("password")):
        clear_admin_login_state(ip)
        response = JSONResponse({"status": "ok", "must_change": admin_password_change_required()})
        set_admin_session_cookie(response, request, create_admin_session())
        return response

    register_admin_login_failure(ip, now)
    raise HTTPException(status_code=401, detail="invalid admin password")

@router.post("/api/admin/logout")
async def admin_logout(request: Request):
    token = request.cookies.get(ADMIN_SESSION_COOKIE)
    if token:
        ADMIN_SESSIONS.pop(token, None)

    response = JSONResponse({"status": "ok"})
    clear_admin_session_cookie(response, request)
    return response

@router.post("/api/admin/change-password")
async def admin_change_password(request: Request):
    data = await request.json()
    current_password = (data.get("password") or "").strip()
    new_password = (data.get("new_password") or "").strip()
    confirm_password = (data.get("confirm_password") or "").strip()

    if not verify_admin_password(current_password):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if not new_password:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "new password required"})

    if new_password != confirm_password:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "passwords do not match"})

    if is_weak_admin_password(new_password):
        return JSONResponse(status_code=400, content={"status": "error", "detail": "choose a stronger password (minimum 10 chars, avoid temporary/default values)"})

    set_admin_password(new_password, must_change=False, source="web_change")
    return {"status": "ok"}



ROUTE_FUNCTIONS = ['admin_react_overview', 'admin_mission_status', 'get_stages', 'save_config_endpoint', 'admin_profile_action', 'save_stages_endpoint', 'admin_login', 'admin_logout', 'admin_change_password']

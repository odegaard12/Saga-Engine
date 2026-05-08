"""Route module extracted from main.py.

This module intentionally delegates to helpers/state still defined in main.py.
It is a mechanical route split, not a behavior rewrite.
"""

from __future__ import annotations

from fastapi import APIRouter

import main as _main

globals().update({key: value for key, value in vars(_main).items() if key != "app"})

router = APIRouter()

@router.get("/api/config")
async def get_config():
    cfg = load_config()
    return {
        "site_name": cfg.get("site_name", "PUT TITLE HERE"),
        "admin_title": cfg.get("admin_title", "PUT ADMIN TITLE HERE"),
        "admin_subtitle": cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE"),
        "ui_lang": cfg.get("ui_lang", "en"),
        "player_theme": normalize_player_theme(cfg.get("player_theme", "classic")),
        "story_title": cfg.get("story_title", ""),
        "story_text": cfg.get("story_text", ""),
        "prologue_title": cfg.get("prologue_title", "PUT PROLOGUE TITLE HERE"),
        "prologue_subtitle": cfg.get("prologue_subtitle", ""),
        "prologue_body": cfg.get("prologue_body", ""),
        "map_center": cfg.get("map_center", [40.4168, -3.7038]),
        "map_zoom": cfg.get("map_zoom", 13),
        "players": cfg.get("players", ["PLAYER 1", "PLAYER 2"]),
        "player_profiles": get_player_profiles(cfg)
    }

@router.get("/api/state/{user}")
async def get_state(user: str):
    stages = load_json(_main.STAGES_DB, [])
    profile = get_player_profile(user)
    profile_id = profile.get("id") or _as_str(user).strip() or "PLAYER 1"
    lvl = get_player_progress_level(profile_id, get_player_progress_level(user, 0))
    return {"user": profile_id, "level": lvl, "finished": lvl >= len(stages)}

@router.get("/api/game/{user}")
async def get_game_payload(user: str):
    runtime_stages = get_runtime_stages()
    profile = get_player_profile(user)
    profile_id = profile.get("id") or user
    live_positions = load_live_positions()

    lvl = get_player_progress_level(profile_id, get_player_progress_level(user, 0))
    finished = lvl >= len(runtime_stages)

    current_stage = None
    if not finished and 0 <= lvl < len(runtime_stages):
        current_stage = project_stage_for_player(runtime_stages[lvl], include_runtime=True)

    stages = [
        project_stage_for_player(stage, include_runtime=(i == lvl and not finished))
        for i, stage in enumerate(runtime_stages)
    ]

    return {
        "user": profile_id,
        "display_name": profile.get("display_name", profile_id),
        "session_mode": profile.get("mode", "solo"),
        "profile": profile,
        "live_status": project_live_profile_status(profile, live_positions.get(profile_id)),
        "level": lvl,
        "finished": finished,
        "stages": stages,
        "current_stage": current_stage
    }

@router.get("/api/team/{user}")
async def get_team_payload(user: str):
    cfg = load_config()
    current_profile = get_player_profile(user, cfg)
    current_profile_id = current_profile.get("id") or _as_str(user).strip() or "PLAYER 1"
    live_positions = load_live_positions()
    now = int(time.time())

    profiles = []
    for profile in get_player_profiles(cfg):
        projected = project_live_profile_status(profile, live_positions.get(profile.get("id")), now)
        projected["is_self"] = _as_str(profile.get("id")).strip() == _as_str(current_profile_id).strip()
        profiles.append(projected)

    return {
        "status": "ok",
        "user": current_profile_id,
        "profiles": profiles
    }


PLAYER_EVENT_TYPES = {
    "node_opened",
    "node_completed",
    "qr_scanned",
    "nfc_url_opened",
    "team_ready",
    "team_proof_created",
    "team_proof_accepted",
    "inventory_item_collected",
    "offline_sync_received",
}

EVENT_PAYLOAD_MAX_KEYS = 32
EVENT_PAYLOAD_MAX_TEXT_LENGTH = 500

@router.post("/api/heartbeat")
async def heartbeat(request: Request):
    data = await request.json()

    user = _as_str(data.get("user")).strip()
    if not user:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "user required"}
        )

    cfg = load_config()
    profile = resolve_known_player_profile(user, cfg)
    if not profile:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "detail": "unknown profile"}
        )

    profile_id = profile.get("id") or user

    now = time.time()
    ip = get_heartbeat_client_ip(request)
    rate_key = f"{ip}:{profile_id}"

    prune_heartbeat_rate_state(now)
    last_seen_for_key = float(HEARTBEAT_LAST_SEEN_BY_KEY.get(rate_key) or 0)
    if last_seen_for_key and (now - last_seen_for_key) < HEARTBEAT_MIN_INTERVAL_SECONDS:
        retry_after = max(1, int(HEARTBEAT_MIN_INTERVAL_SECONDS - (now - last_seen_for_key)))
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

    lat = _as_float(data.get("lat"))
    lon = _as_float(data.get("lon"))

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

    current = get_live_position(profile_id)
    if not isinstance(current, dict):
        current = {}

    if lat is not None and lon is not None:
        current["lat"] = lat
        current["lon"] = lon

    current["last_seen"] = int(now)
    current["gps_status"] = normalize_heartbeat_gps_status(
        data.get("gps_status") or current.get("gps_status") or "unknown"
    )
    current["source"] = normalize_heartbeat_source(
        data.get("source") or current.get("source") or "player"
    )

    # Public heartbeat must not be able to toggle debug state remotely.
    current["debug_enabled"] = False

    upsert_live_position_for_user(profile_id, current)
    HEARTBEAT_LAST_SEEN_BY_KEY[rate_key] = now

    return {
        "status": "ok",
        "user": profile_id,
        "live_status": project_live_profile_status(profile, current)
    }



@router.post("/api/advance")
async def advance(request: Request):
    data = await request.json()
    user = data.get("user")
    code = (data.get("code") or "").strip().upper()

    profile = get_player_profile(user)
    profile_id = profile.get("id") or _as_str(user).strip() or "PLAYER 1"

    stages = get_runtime_stages()
    lvl = get_player_progress_level(profile_id, get_player_progress_level(user, 0))

    if lvl < len(stages):
        current_node = stages[lvl]

        if stage_accepts_code(current_node, code):
            set_player_progress_level(profile_id, lvl + 1)
            return {"status": "ok", "user": profile_id}

    return {"status": "fail", "user": profile_id}



ROUTE_FUNCTIONS = ['get_config', 'get_state', 'get_game_payload', 'get_team_payload', 'heartbeat', 'advance']

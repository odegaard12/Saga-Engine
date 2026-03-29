from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import json
import os
import hashlib
import hmac
import secrets

app = FastAPI()

def load_json(file, default):
    try:
        if not os.path.exists(file):
            return default
        with open(file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else default
    except Exception as e:
        print(f"Error cargando {file}: {e}")
        return default

def save_json(file, data):
    try:
        parent = os.path.dirname(file)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
    except Exception as e:
        print(f"Error guardando {file}: {e}")

def load_config():
    return load_json("config.json", {
        "site_name": "PUT TITLE HERE",
        "admin_title": "PUT ADMIN TITLE HERE",
        "admin_subtitle": "PUT ADMIN SUBTITLE HERE",
        "story_title": "",
        "story_text": "",
        "map_center": [42.26, -8.86],
        "map_zoom": 13,
        "players": ["PLAYER 1", "PLAYER 2"],
        "data_dir": "data"
    })

CONFIG = load_config()
DATA_DIR = CONFIG.get("data_dir", "data")
GAME_DB = os.path.join(DATA_DIR, "gamestate.json")
STAGES_DB = os.path.join(DATA_DIR, "stages.json")
POSITIONS_DB = os.path.join(DATA_DIR, "positions.json")
ADMIN_AUTH_DB = os.path.join(DATA_DIR, "admin_auth.json")

BOOTSTRAP_ADMIN_PASS = (os.getenv("ADMIN_PASS") or "").strip()
ALLOW_DEFAULT_ADMIN = (os.getenv("ALLOW_DEFAULT_ADMIN") or "0").strip() == "1"
ADMIN_RESET = (os.getenv("ADMIN_RESET") or "0").strip() == "1"

PLAYERS = CONFIG.get("players", ["PLAYER 1", "PLAYER 2"])

def hash_password(password, salt=None, iterations=200000):
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    return {
        "salt": salt,
        "password_hash": dk.hex(),
        "iterations": iterations
    }

def load_admin_auth():
    return load_json(ADMIN_AUTH_DB, {})

def save_admin_auth(data):
    save_json(ADMIN_AUTH_DB, data)

def verify_admin_password(password):
    auth = load_admin_auth()
    salt = auth.get("salt")
    expected = auth.get("password_hash")
    iterations = int(auth.get("iterations") or 200000)

    if not salt or not expected:
        return False

    dk = hashlib.pbkdf2_hmac(
        "sha256",
        (password or "").encode("utf-8"),
        salt.encode("utf-8"),
        iterations
    ).hex()

    return hmac.compare_digest(dk, expected)

def is_weak_admin_password(password):
    p = (password or "").strip()
    weak = {
        "",
        "CHANGE_ME",
        "admin",
        "password",
        "12345678",
        "Pelochito13"
    }
    return len(p) < 10 or p in weak

def set_admin_password(password, must_change=False, source="manual"):
    data = hash_password(password)
    auth = {
        "salt": data["salt"],
        "password_hash": data["password_hash"],
        "iterations": data["iterations"],
        "must_change": bool(must_change),
        "source": source
    }
    save_admin_auth(auth)
    return auth

def admin_password_change_required():
    auth = load_admin_auth()
    return bool(auth.get("must_change"))

def ensure_admin_auth():
    auth = load_admin_auth()

    if ADMIN_RESET:
        if not BOOTSTRAP_ADMIN_PASS:
            raise RuntimeError("ADMIN_RESET=1 requires ADMIN_PASS.")
        set_admin_password(
            BOOTSTRAP_ADMIN_PASS,
            must_change=is_weak_admin_password(BOOTSTRAP_ADMIN_PASS),
            source="reset"
        )
        print("[WARN] Admin password reset from environment.")
        return

    if auth.get("password_hash") and auth.get("salt"):
        return

    if BOOTSTRAP_ADMIN_PASS:
        set_admin_password(
            BOOTSTRAP_ADMIN_PASS,
            must_change=is_weak_admin_password(BOOTSTRAP_ADMIN_PASS),
            source="bootstrap"
        )
        print("[INFO] Admin password initialized from ADMIN_PASS.")
        return

    if ALLOW_DEFAULT_ADMIN:
        set_admin_password("CHANGE_ME", must_change=True, source="fallback")
        print("[WARN] ADMIN_PASS not set. Using development fallback CHANGE_ME because ALLOW_DEFAULT_ADMIN=1")
        return

    raise RuntimeError("ADMIN_PASS is required. Set ADMIN_PASS, or enable ALLOW_DEFAULT_ADMIN=1 only for local development.")

ensure_admin_auth()


MINIGAME_OK_CODE = "OK"

SUPPORTED_MINIGAME_TYPES = {
    "digital_tuner",
    "circuit_hack",
    "cryptex",
    "radio_azimuth",
    "gyro_storm",
    "simon_says",
    "switchboard",
    "compass_blow",
}

def _as_str(value, default=""):
    if value is None:
        return default
    return str(value)

def _clean_code(value):
    return _as_str(value).strip().upper()

def _as_float(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default

def _as_radius(value, default=0):
    num = _as_float(value, default)
    if num is None:
        return default
    if float(num).is_integer():
        return int(num)
    return num

def _as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default

def _build_success_conditions(raw):
    conditions = [{"kind": "minigame_ok", "value": MINIGAME_OK_CODE}]

    answer = _clean_code(raw.get("answer"))
    rune = _clean_code(raw.get("rune"))

    if answer:
        conditions.append({"kind": "answer", "value": answer})
    if rune:
        conditions.append({"kind": "rune", "value": rune})

    return conditions

def normalize_stage(raw):
    raw = raw or {}

    cfg = raw.get("config")
    if not isinstance(cfg, dict):
        cfg = {}

    raw_entry = raw.get("entry")
    if not isinstance(raw_entry, dict):
        raw_entry = {}

    raw_messages = raw.get("messages")
    if not isinstance(raw_messages, dict):
        raw_messages = {}

    raw_debug = raw.get("debug")
    if not isinstance(raw_debug, dict):
        raw_debug = {}

    entry_mode = _as_str(
        raw_entry.get("mode") or raw.get("entry_mode") or "gps"
    ).strip().lower() or "gps"

    require_proximity = _as_bool(
        raw_entry.get("require_proximity", raw.get("require_proximity")),
        default=(entry_mode != "free")
    )

    return {
        "id": raw.get("id"),
        "version": 2,
        "enabled": _as_bool(raw.get("enabled", True), True),
        "presentation": {
            "title": _as_str(raw.get("title")).strip(),
            "content": _as_str(raw.get("content")).strip(),
        },
        "location": {
            "lat": _as_float(raw.get("lat")),
            "lon": _as_float(raw.get("lon")),
            "radius_m": _as_radius(raw.get("radius", 0), 0),
        },
        "entry": {
            "mode": entry_mode,
            "require_proximity": require_proximity,
            "allow_debug_bypass": _as_bool(
                raw_entry.get("allow_debug_bypass", raw.get("allow_debug_bypass")),
                True
            ),
            "allow_manual_fallback_without_gps": _as_bool(
                raw_entry.get(
                    "allow_manual_fallback_without_gps",
                    raw.get("allow_manual_fallback_without_gps")
                ),
                True
            ),
        },
        "interaction": {
            "type": _as_str(raw.get("type") or "circuit_hack").strip() or "circuit_hack",
            "config": cfg,
        },
        "success": {
            "mode": "any_of",
            "conditions": _build_success_conditions(raw),
            "case_sensitive": False,
        },
        "messages": {
            "locked": _as_str(
                raw_messages.get("locked") or raw.get("locked_message")
            ).strip(),
            "gps_unavailable": _as_str(
                raw_messages.get("gps_unavailable") or raw.get("gps_unavailable_message")
            ).strip(),
            "hint": _as_str(
                raw_messages.get("hint") or raw.get("hint")
            ).strip(),
        },
        "debug": {
            "force_unlock": _as_bool(
                raw_debug.get("force_unlock", raw.get("force_unlock")),
                False
            ),
        },
    }

def stage_has_manual_fallback(node):
    for condition in node["success"]["conditions"]:
        if condition.get("kind") in {"answer", "rune"} and _clean_code(condition.get("value")):
            return True
    return False

def evaluate_entry(node, distance_m=None, gps_available=True, debug_enabled=False):
    entry = node.get("entry") or {}
    debug = node.get("debug") or {}
    location = node.get("location") or {}

    if not node.get("enabled", True):
        return {
            "can_enter": False,
            "can_submit_manual_code": False,
            "reason": "disabled",
        }

    if debug_enabled and (entry.get("allow_debug_bypass") or debug.get("force_unlock")):
        return {
            "can_enter": True,
            "can_submit_manual_code": True,
            "reason": "debug_bypass",
        }

    require_proximity = bool(entry.get("require_proximity", True))
    mode = _as_str(entry.get("mode") or "gps").strip().lower()

    if mode == "free" or not require_proximity:
        return {
            "can_enter": True,
            "can_submit_manual_code": True,
            "reason": "free_entry",
        }

    if not gps_available:
        return {
            "can_enter": False,
            "can_submit_manual_code": bool(entry.get("allow_manual_fallback_without_gps")) and stage_has_manual_fallback(node),
            "reason": "gps_unavailable",
        }

    if distance_m is None:
        return {
            "can_enter": False,
            "can_submit_manual_code": stage_has_manual_fallback(node),
            "reason": "distance_unknown",
        }

    radius = location.get("radius_m") or 0
    if distance_m <= radius:
        return {
            "can_enter": True,
            "can_submit_manual_code": True,
            "reason": "within_radius",
        }

    return {
        "can_enter": False,
        "can_submit_manual_code": stage_has_manual_fallback(node),
        "reason": "out_of_range",
    }

def validate_stage(raw_stage, idx=None):
    node = normalize_stage(raw_stage)
    errors = []

    def add(field, detail):
        errors.append({
            "index": idx,
            "field": field,
            "detail": detail,
        })

    title = node["presentation"]["title"]
    if not title:
        add("title", "title is required")

    interaction_type = node["interaction"]["type"]
    if interaction_type not in SUPPORTED_MINIGAME_TYPES:
        add("type", f"unsupported minigame type: {interaction_type}")

    if not isinstance(node["interaction"]["config"], dict):
        add("config", "config must be an object")

    entry_mode = node["entry"]["mode"]
    if entry_mode not in {"gps", "free"}:
        add("entry.mode", f"unsupported entry mode: {entry_mode}")

    location = node["location"]
    if node["entry"]["mode"] == "gps" and node["entry"]["require_proximity"]:
        if location["lat"] is None:
            add("lat", "lat is required for gps entry")
        if location["lon"] is None:
            add("lon", "lon is required for gps entry")
        if location["radius_m"] is None or location["radius_m"] <= 0:
            add("radius", "radius must be > 0 for gps entry")

    conditions = node["success"]["conditions"]
    if not isinstance(conditions, list) or not conditions:
        add("success.conditions", "at least one success condition is required")

    for i, condition in enumerate(conditions):
        kind = _as_str(condition.get("kind")).strip()
        value = _clean_code(condition.get("value"))

        if kind not in {"minigame_ok", "answer", "rune"}:
            add(f"success.conditions[{i}].kind", f"unsupported success condition kind: {kind}")
        if not value:
            add(f"success.conditions[{i}].value", "success condition value is required")

    return errors

def validate_stages(raw_stages):
    if not isinstance(raw_stages, list):
        return [{"index": None, "field": "stages", "detail": "stages payload must be a list"}]

    errors = []
    for idx, stage in enumerate(raw_stages):
        if not isinstance(stage, dict):
            errors.append({"index": idx, "field": "node", "detail": "each node must be an object"})
            continue
        errors.extend(validate_stage(stage, idx=idx))
    return errors

def get_runtime_stages():
    raw_stages = load_json(STAGES_DB, [])
    if not isinstance(raw_stages, list):
        return []
    return [normalize_stage(stage) for stage in raw_stages]

def project_stage_for_player(raw_stage, include_runtime=False):
    node = raw_stage if isinstance(raw_stage, dict) and raw_stage.get("version") == 2 else normalize_stage(raw_stage)

    out = {
        "id": node["id"],
        "title": node["presentation"]["title"],
        "lat": node["location"]["lat"],
        "lon": node["location"]["lon"],
        "radius": node["location"]["radius_m"],
    }

    if include_runtime:
        out.update({
            "content": node["presentation"]["content"],
            "type": node["interaction"]["type"],
            "config": node["interaction"]["config"],
            "entry": node["entry"],
            "messages": node["messages"],
        })

    return out

def stage_accepts_code(raw_stage, code):
    node = raw_stage if isinstance(raw_stage, dict) and raw_stage.get("version") == 2 else normalize_stage(raw_stage)
    submitted = _clean_code(code)

    if not submitted:
        return False

    for condition in node["success"]["conditions"]:
        expected = _clean_code(condition.get("value"))
        if expected and submitted == expected:
            return True

    return False

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.middleware("http")
async def saga_no_cache_html(request, call_next):
    response = await call_next(request)
    path = request.url.path or ""

    if path == "/admin" or path.startswith("/admin/") or path.startswith("/api/admin"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["CDN-Cache-Control"] = "no-store"
        response.headers["Surrogate-Control"] = "no-store"

        if request.method == "GET" and path == "/admin":
            cookie = request.headers.get("cookie", "") or ""
            if "saga_csd=1" not in cookie:
                response.headers["Clear-Site-Data"] = '"cache", "storage", "executionContexts"'
                response.headers["Set-Cookie"] = "saga_csd=1; Max-Age=600; Path=/; SameSite=Lax"
        return response

    ct = (response.headers.get("content-type") or "").lower()
    if request.method == "GET" and ("text/html" in ct):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["CDN-Cache-Control"] = "no-store"
        response.headers["Surrogate-Control"] = "no-store"

    return response

@app.get("/", response_class=HTMLResponse)
async def login(request: Request):
    cfg = load_config()
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={
            "request": request,
            "players": cfg.get("players", ["PLAYER 1", "PLAYER 2"]),
            "config": cfg
        }
    )

@app.get("/player/{name}", response_class=HTMLResponse)
async def game(request: Request, name: str):
    cfg = load_config()
    return templates.TemplateResponse(
        request=request,
        name="game.html",
        context={
            "request": request,
            "user": name,
            "config": cfg
        }
    )

@app.get("/admin", response_class=HTMLResponse)
async def admin(request: Request):
    cfg = load_config()
    return templates.TemplateResponse(
        request=request,
        name="admin.html",
        context={
            "request": request,
            "config": cfg
        }
    )

@app.get("/api/config")
async def get_config():
    cfg = load_config()
    return {
        "site_name": cfg.get("site_name", "PUT TITLE HERE"),
        "admin_title": cfg.get("admin_title", "PUT ADMIN TITLE HERE"),
        "admin_subtitle": cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE"),
        "story_title": cfg.get("story_title", ""),
        "story_text": cfg.get("story_text", ""),
        "prologue_title": cfg.get("prologue_title", "PUT PROLOGUE TITLE HERE"),
        "prologue_subtitle": cfg.get("prologue_subtitle", ""),
        "prologue_body": cfg.get("prologue_body", ""),
        "map_center": cfg.get("map_center", [40.4168, -3.7038]),
        "map_zoom": cfg.get("map_zoom", 13),
        "players": cfg.get("players", ["PLAYER 1", "PLAYER 2"])
    }

@app.get("/api/state/{user}")
async def get_state(user: str):
    stages = load_json(STAGES_DB, [])
    state = load_json(GAME_DB, {})
    lvl = state.get(user, 0)
    return {"level": lvl, "finished": lvl >= len(stages)}

@app.get("/api/game/{user}")
async def get_game_payload(user: str):
    runtime_stages = get_runtime_stages()
    state = load_json(GAME_DB, {})
    lvl = state.get(user, 0)
    finished = lvl >= len(runtime_stages)

    stages = [
        project_stage_for_player(stage, include_runtime=(i == lvl and not finished))
        for i, stage in enumerate(runtime_stages)
    ]

    return {
        "level": lvl,
        "finished": finished,
        "stages": stages
    }

@app.get("/api/admin/stages")
@app.get("/api/admin/stages")
async def get_stages():
    return load_json(STAGES_DB, [])

@app.post("/api/admin/save-config")
async def save_config_endpoint(request: Request):
    data = await request.json()

    if not verify_admin_password(data.get("password")):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    incoming = data.get("config") or {}
    cfg = load_config()

    players = incoming.get("players", [])
    if isinstance(players, str):
        players = [p.strip() for p in players.split("\n") if p.strip()]
    elif isinstance(players, list):
        players = [str(p).strip() for p in players if str(p).strip()]
    else:
        players = cfg.get("players", ["PLAYER 1", "PLAYER 2"])

    cfg["site_name"] = incoming.get("site_name", cfg.get("site_name", "PUT TITLE HERE")).strip() or "PUT TITLE HERE"
    cfg["admin_title"] = incoming.get("admin_title", cfg.get("admin_title", "PUT ADMIN TITLE HERE")).strip() or "PUT ADMIN TITLE HERE"
    cfg["admin_subtitle"] = incoming.get("admin_subtitle", cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE")).strip()
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

@app.post("/api/advance")
async def advance(request: Request):
    data = await request.json()
    user = data.get("user")
    code = (data.get("code") or "").strip().upper()

    stages = get_runtime_stages()
    state = load_json(GAME_DB, {})
    lvl = state.get(user, 0)

    if lvl < len(stages):
        current_node = stages[lvl]

        if stage_accepts_code(current_node, code):
            state[user] = lvl + 1
            save_json(GAME_DB, state)
            return {"status": "ok"}

    return {"status": "fail"}

@app.post("/api/reset")
@app.post("/api/reset")
async def reset(request: Request):
    data = await request.json()
    user = data.get("user")
    state = load_json(GAME_DB, {})
    state[user] = 0
    save_json(GAME_DB, state)
    return {"status": "ok"}

@app.post("/api/admin/save")
async def save_stages_endpoint(request: Request):
    data = await request.json()
    if not verify_admin_password(data.get("password")):
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

    save_json(STAGES_DB, stages)
    return {"status": "ok"}

@app.post("/api/admin/login")
@app.post("/api/admin/login")
async def admin_login(request: Request):
    data = await request.json()
    if verify_admin_password(data.get("password")):
        return {"status": "ok", "must_change": admin_password_change_required()}
    return JSONResponse(status_code=403, content={"status": "fail"})

@app.post("/api/admin/change-password")
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

@app.get("/sw.js")
async def saga_sw_block():
    return Response("", media_type="application/javascript", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Service-Worker-Allowed": "/",
    })

@app.get("/service-worker.js")
async def saga_sw_block2():
    return Response("", media_type="application/javascript", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Service-Worker-Allowed": "/",
    })

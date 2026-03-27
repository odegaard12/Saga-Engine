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

@app.get("/api/admin/stages")
async def get_stages():
    return load_json(STAGES_DB, [])

@app.post("/api/admin/save-config")
async def save_config_endpoint(request: Request):
    data = await request.json()
    if data.get("password") != ADMIN_PASS:
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

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

    stages = load_json(STAGES_DB, [])
    state = load_json(GAME_DB, {})
    lvl = state.get(user, 0)

    if lvl < len(stages):
        current_node = stages[lvl]
        rune = (current_node.get("rune") or "").strip().upper()
        ans = (current_node.get("answer") or "").strip().upper()

        if code == "OK" or (ans and code == ans) or (rune and code == rune):
            state[user] = lvl + 1
            save_json(GAME_DB, state)
            return {"status": "ok"}

    return {"status": "fail"}

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
    save_json(STAGES_DB, data.get("stages"))
    return {"status": "ok"}

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

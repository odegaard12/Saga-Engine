"""Route module extracted from main.py.

This module intentionally delegates to helpers/state still defined in main.py.
It is a mechanical route split, not a behavior rewrite.
"""

from __future__ import annotations

from fastapi import APIRouter

import main as _main

globals().update({key: value for key, value in vars(_main).items() if key != "app"})

router = APIRouter()

@router.get("/", response_class=HTMLResponse)
async def react_entry():
    return react_index_or_missing()

@router.get("/admin-react", response_class=HTMLResponse)
async def react_admin_shell():
    return react_index_or_missing()

@router.get("/admin-react/{path:path}", response_class=HTMLResponse)
async def react_admin_shell_path(path: str):
    return react_index_or_missing()

@router.get("/player/{name}", response_class=HTMLResponse)
async def react_player(name: str):
    # Serve the React app directly. The frontend derives the player from /player/{name}.
    # Avoid RedirectResponse here: user-controlled redirect targets trigger CodeQL open-redirect checks.
    return react_index_or_missing()

@router.get("/admin")
async def admin_redirect_to_react():
    return Response(status_code=307, headers={"Location": "/admin-react"})


@router.post("/api/reset")
async def reset(request: Request):
    data = await request.json()

    # /api/reset mutates player progress. Keep it admin-only.
    if not admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    user = _as_str(data.get("user")).strip()
    if not user:
        raise HTTPException(status_code=400, detail="user is required")

    reset_player_level(_main.GAME_DB, user)
    return {"status": "ok"}

@router.get("/sw.js")
async def saga_sw_block():
    return Response("", media_type="application/javascript", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Service-Worker-Allowed": "/",
    })

@router.get("/service-worker.js")
async def saga_sw_block2():
    return Response("", media_type="application/javascript", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Service-Worker-Allowed": "/",
    })



ROUTE_FUNCTIONS = ['react_entry', 'react_admin_shell', 'react_admin_shell_path', 'react_player', 'admin_redirect_to_react', 'reset', 'saga_sw_block', 'saga_sw_block2']

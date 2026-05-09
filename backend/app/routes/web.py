"""Web/static route module.

This module keeps browser-facing routes explicit instead of relying on the
mechanical splitter output. Runtime helpers still live in main.py for now.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

import main as _main

router = APIRouter()




@router.get("/admin-react", response_class=_main.HTMLResponse)
async def react_admin_shell():
    return _main.react_index_or_missing()


@router.get("/admin-react/{path:path}", response_class=_main.HTMLResponse)
async def react_admin_shell_path(path: str):
    return _main.react_index_or_missing()


@router.get("/player/{name}", response_class=_main.HTMLResponse)
async def react_player(name: str):
    # Serve the React app directly. The frontend derives the player from /player/{name}.
    # Avoid RedirectResponse here: user-controlled redirect targets trigger CodeQL open-redirect checks.
    return _main.react_index_or_missing()


@router.get("/admin")
async def admin_redirect_to_react():
    return Response(status_code=307, headers={"Location": "/admin-react"})


@router.post("/api/reset")
async def reset(request: Request):
    data = await request.json()

    # /api/reset mutates player progress. Keep it admin-only.
    if not _main.admin_request_authorized(request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    user = _main._as_str(data.get("user")).strip()
    if not user:
        raise HTTPException(status_code=400, detail="user is required")

    _main.reset_player_level(_main.GAME_DB, user)
    return {"status": "ok"}


@router.get("/sw.js")
async def saga_sw_block():
    return Response(
        "",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "Service-Worker-Allowed": "/",
        },
    )


@router.get("/service-worker.js")
async def saga_sw_block2():
    return Response(
        "",
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "Service-Worker-Allowed": "/",
        },
    )


ROUTE_FUNCTIONS = [
    "react_admin_shell",
    "react_admin_shell_path",
    "react_player",
    "admin_redirect_to_react",
    "reset",
    "saga_sw_block",
    "saga_sw_block2",
]

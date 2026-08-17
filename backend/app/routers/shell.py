"""Las pantallas: lo que devuelve HTML.

Tercera y última tajada de rutas de `main.py`. Todas sirven la misma página
—la aplicación de React— y lo único que cambia entre ellas es qué sesión dejan
puesta al entregarla.

`/player/{name}` es la que hace algo de verdad: entrega la página y, si ese
jugador existe en la misión, le deja su pase en una cookie. Es el único sitio
donde se reparte ese pase, así que es también lo que separa a un jugador de
alguien que sólo conoce la dirección.
"""
from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.head("/", response_class=HTMLResponse, include_in_schema=False)
@router.get("/", response_class=HTMLResponse)
async def entrada():
    import main

    return main.react_index_or_missing()


@router.head("/admin-react", response_class=HTMLResponse, include_in_schema=False)
@router.get("/admin-react", response_class=HTMLResponse)
async def panel():
    import main

    return main.react_index_or_missing()


@router.head("/admin-react/{path:path}", response_class=HTMLResponse, include_in_schema=False)
@router.get("/admin-react/{path:path}", response_class=HTMLResponse)
async def panel_con_ruta(path: str):
    # Cualquier ruta dentro del panel devuelve la misma página: la navegación
    # la lleva el frontend. Sin esto, recargar dentro del panel da un 404.
    import main

    return main.react_index_or_missing()


@router.head("/player", response_class=HTMLResponse, include_in_schema=False)
@router.get("/player", response_class=HTMLResponse)
@router.head("/player/", response_class=HTMLResponse, include_in_schema=False)
@router.get("/player/", response_class=HTMLResponse)
@router.head("/player/{name}", response_class=HTMLResponse, include_in_schema=False)
@router.get("/player/{name}", response_class=HTMLResponse)
async def jugador(request: Request, name: str = ""):
    """La página del jugador, con su pase puesto si es de la misión.

    Se sirve la aplicación directamente en vez de redirigir: un destino de
    redirección que viene de la URL es una puerta abierta a mandar a la gente
    a otro sitio, y CodeQL lo marca con razón.
    """
    import main

    respuesta = main.react_index_or_missing()
    perfil = main.resolve_known_player_profile(name)

    if perfil:
        main.set_player_session_cookie(respuesta, request, perfil.get("id") or name)
    else:
        # Un nombre que no está en la misión no sólo no recibe pase: se le
        # retira el que llevara, por si viene de otra partida.
        main.clear_player_session_cookie(respuesta, request)

    return respuesta


@router.head("/admin", response_class=HTMLResponse, include_in_schema=False)
@router.get("/admin")
async def admin_a_panel():
    # /admin es la dirección que la gente escribe de memoria; el panel vive en
    # /admin-react.
    return Response(status_code=307, headers={"Location": "/admin-react"})

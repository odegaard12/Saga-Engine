"""Las pantallas: lo que devuelve HTML.

Tercera y última tajada de rutas de `main.py`. Todas sirven la misma página
—la aplicación de React— y lo único que cambia entre ellas es qué sesión dejan
puesta al entregarla.

`/player/{name}` es la que hace algo de verdad: entrega la página y, si ese
jugador existe en la misión, le deja su pase en una cookie. Es el único sitio
donde se reparte ese pase, así que es también lo que separa a un jugador de
alguien que sólo conoce la dirección.
"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.head("/", response_class=HTMLResponse, include_in_schema=False)
@router.get("/", response_class=HTMLResponse)
async def entrada():
    import main

    return main.react_index_or_missing()


@router.head("/banco-mapa", response_class=HTMLResponse, include_in_schema=False)
@router.get("/banco-mapa", response_class=HTMLResponse)
async def banco_de_mapa():
    """
    Banco de pruebas del mapa.

    La pantalla del jugador sólo se abre en vertical y en un escritorio
    enseña el aviso de girar el móvil, así que el mapa no llega a montarse y
    no había forma de revisarlo. Esto sirve la misma página de React, que al
    ver esta ruta monta el mapa solo, a pantalla completa y con los números
    a la vista.
    """
    import main

    return main.react_index_or_missing()


@router.head("/admin-react", response_class=HTMLResponse, include_in_schema=False)
@router.get("/admin-react", response_class=HTMLResponse)
async def panel(request: Request):
    import main

    return main.react_index_or_missing(panel=True, request=request)


@router.head("/admin-react/{path:path}", response_class=HTMLResponse, include_in_schema=False)
@router.get("/admin-react/{path:path}", response_class=HTMLResponse)
async def panel_con_ruta(request: Request, path: str):
    # Cualquier ruta dentro del panel devuelve la misma página: la navegación
    # la lleva el frontend. Sin esto, recargar dentro del panel da un 404.
    import main

    return main.react_index_or_missing(panel=True, request=request)


@router.head("/player", response_class=HTMLResponse, include_in_schema=False)
@router.get("/player", response_class=HTMLResponse)
@router.head("/player/", response_class=HTMLResponse, include_in_schema=False)
@router.get("/player/", response_class=HTMLResponse)
@router.head("/player/{name}", response_class=HTMLResponse, include_in_schema=False)
@router.get("/player/{name}", response_class=HTMLResponse)
async def jugador(request: Request, name: str = ""):
    from backend.app.runtime import pines_jugador

    """La página del jugador, con su pase puesto si es de la misión.

    Se sirve la aplicación directamente en vez de redirigir: un destino de
    redirección que viene de la URL es una puerta abierta a mandar a la gente
    a otro sitio, y CodeQL lo marca con razón.
    """
    import main

    respuesta = main.react_index_or_missing()
    # Revisión 22/10: con la clave de misión puesta y sin abrir, la página sale tal cual, sin tocar cookies. Antes
    # repartía el pase de jugador sin la clave, y la respuesta distinta (pase o borrado) decía qué nombres existen.
    # La puerta de la app pide la clave y recarga esta misma dirección, que ya con la misión abierta deja el pase.
    # El panel pasa con su sesión, como en la puerta de /api.
    if not main.mission_unlocked(request) and not main.admin_request_authorized(request, None):
        return respuesta
    perfil = main.resolve_known_player_profile(name)

    if perfil:
        # Con PINs puestos (fase 2, auditoría 15/10) la sesión sólo sale de POST /api/jugador/entrar.
        if not pines_jugador.activos():
            main.set_player_session_cookie(respuesta, request, perfil.get("id") or name)
    else:
        # Un nombre que no está en la misión no sólo no recibe pase: se le
        # retira el que llevara, por si viene de otra partida.
        main.clear_player_session_cookie(respuesta, request)

    return respuesta


@router.head("/admin", response_class=HTMLResponse, include_in_schema=False)
@router.get("/admin", response_class=HTMLResponse)
async def admin_a_panel(request: Request):
    # /admin es la dirección que la gente escribe de memoria. Era un 307 a /admin-react: con Slow 3G, 2 s de ida y
    # vuelta antes de empezar a bajar nada (24/11). Ahora da la misma página del panel. El `Clear-Site-Data: "cache"`
    # de esta dirección (main.saga_no_cache_html, una vez cada 10 min) sigue saliendo en esta respuesta; mientras sale
    # no se contesta 304, que apuntaría a la copia que esa misma cabecera borra.
    import main

    limpia = "saga_csd=1" not in (request.headers.get("cookie") or "")
    return main.react_index_or_missing(panel=True, request=None if limpia else request)

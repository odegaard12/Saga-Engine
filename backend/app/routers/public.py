"""Lo que el móvil pide sin haber entrado todavía: versión, configuración,
fotos de jugador, teselas del mapa y el service worker.

Segunda tajada de sacar las rutas de `main.py`. Estas ya no son sólo ficheros
—leen la configuración de la misión y las fichas de jugador— pero siguen sin
tocar la partida de nadie: ninguna cambia el estado del juego.
"""
import base64

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse

router = APIRouter()


@router.get("/api/version")
async def get_version():
    import main

    return main.get_runtime_version_payload()


@router.get("/api/config")
async def get_config():
    """La configuración pública de la misión.

    Sin las fotos de los jugadores dentro. Iban incrustadas en base64 y eran
    134 KB de los 135 KB de esta respuesta, que el móvil pedía cada 30 segundos:
    16 MB por hora y por móvil mandando una y otra vez las mismas caras. Y este
    endpoint es público, así que ahí estaban los retratos de los catorce al
    alcance de cualquiera. Ahora va la URL de /api/player-avatar, que se cachea.
    """
    import main

    cfg = main.load_config()

    return {
        "site_name": cfg.get("site_name", "PUT TITLE HERE"),
        "admin_title": cfg.get("admin_title", "PUT ADMIN TITLE HERE"),
        "admin_subtitle": cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE"),
        "ui_lang": main.normalize_ui_lang(cfg.get("ui_lang", "es")),
        "player_theme": main.normalize_player_theme(cfg.get("player_theme", "glass")),
        "story_title": cfg.get("story_title", ""),
        "story_text": cfg.get("story_text", ""),
        "prologue_title": cfg.get("prologue_title", "PUT PROLOGUE TITLE HERE"),
        "prologue_subtitle": cfg.get("prologue_subtitle", ""),
        "prologue_body": cfg.get("prologue_body", ""),
        "map_center": cfg.get("map_center", [40.4168, -3.7038]),
        "map_zoom": cfg.get("map_zoom", 13),
        "mapbox_style": cfg.get("mapbox_style", ""),
        "players": cfg.get("players", ["PLAYER 1", "PLAYER 2"]),
        "player_profiles": [
            main.aligerar_avatar(perfil) for perfil in main.get_player_profiles(cfg)
        ],
    }


@router.api_route("/api/player-avatar/{profile_id}", methods=["GET", "HEAD"])
def player_avatar(profile_id: str, request: Request):
    """La foto de un jugador, como imagen y cacheable.

    Va aparte de la tabla de equipo a propósito: esa se pide cada 5 segundos y
    llevaba las fotos dentro, repitiéndolas enteras cada vez. Aquí se descargan
    una vez y el navegador —y el service worker— se las quedan. La URL trae el
    hash de la imagen, así que cambiar una foto en administración invalida la
    caché sola.
    """
    import main

    foto = main.buscar_avatar_de(profile_id)
    if not foto:
        raise HTTPException(status_code=404, detail="sin foto")

    try:
        cabecera, datos = foto.split(",", 1)
        tipo = cabecera.split(";")[0].removeprefix("data:") or "image/png"
        binario = base64.b64decode(datos)
    except (ValueError, TypeError, base64.binascii.Error):
        raise HTTPException(status_code=404, detail="foto ilegible")

    etag = '"%s"' % main._hash_corto(foto)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})

    return Response(
        content=binario,
        media_type=tipo,
        headers={
            # Inmutable: la URL cambia si cambia la foto, así que el móvil puede
            # quedarse ésta para siempre.
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": etag,
        },
    )


# ---------------------------------------------------------------------------
# Teselas del mapa
# ---------------------------------------------------------------------------
_BASE_TESELAS = (
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile"
)
_CABECERAS_TESELAS = {"User-Agent": "SAGA-Engine/2.x tile-proxy"}


@router.get("/map-tiles/{z}/{x}/{y}.png", include_in_schema=False)
async def map_tile_proxy(z: int, x: int, y: int):
    """Sirve las teselas desde el mismo origen que la página.

    Sin esto, Safari en iOS bloquea la mezcla de contenidos cuando la página va
    por HTTP y la tesela por HTTPS. Además, al ser del mismo origen, el service
    worker puede cachearlas para el monte.
    """
    import main

    if z < 0 or z > 19:
        raise HTTPException(status_code=400, detail="Invalid zoom")

    if not main._HTTPX_AVAILABLE:
        raise HTTPException(status_code=500, detail="httpx not available for proxying")

    # ESRI las quiere como /tile/nivel/fila/columna, no /z/x/y.
    url = "%s/%s/%s/%s" % (_BASE_TESELAS, z, y, x)

    try:
        async with main._httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers=_CABECERAS_TESELAS, follow_redirects=True)
    except main._httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Tile proxy error: %s" % exc)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="Tile not found upstream")

    return Response(
        content=resp.content,
        media_type=resp.headers.get("Content-Type", "image/jpeg"),
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.api_route("/sw.js", methods=["GET", "HEAD"])
def player_service_worker():
    """El service worker, tal cual está en el disco.

    Aquí se le reescribía el nombre de la caché para meterle la versión, de
    modo que cada despliegue estrenase caché. El efecto real era el contrario
    del buscado: al activarse, el service worker tiraba la caché anterior en el
    mismo instante en que estrenaba la nueva, vacía. Con red no se nota; sin
    red, el jugador que abría la aplicación después de un despliegue se quedaba
    sin nada.

    El nombre es fijo ahora, y los ficheros de la aplicación llevan su hash en
    la URL, así que dos versiones conviven en la misma caché sin pisarse. No
    hay nada que reescribir.
    """
    import main

    cabeceras = {
        # Sin caché: es el fichero que decide si el jugador recibe una versión
        # nueva. Si se cachea, un cambio puede tardar días en llegar.
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Service-Worker-Allowed": "/",
    }

    for fichero in (main.REACT_DIST_DIR / "sw.js", Path("frontend/public/sw.js")):
        if fichero.exists():
            return FileResponse(
                fichero, media_type="application/javascript", headers=cabeceras
            )

    return JSONResponse({"status": "missing_service_worker"}, status_code=404)


@router.get("/service-worker.js")
def player_service_worker_alias():
    return player_service_worker()

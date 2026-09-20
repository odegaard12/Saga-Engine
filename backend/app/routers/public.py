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


@router.post("/api/mission/unlock")
async def mission_unlock(request: Request):
    """Valida la contraseña de misión y deja la cookie que abre la entrada.

    Apagado mientras MISSION_PASS esté vacía: responde ok sin pedir nada.
    """
    import main

    if not main.mission_gate_enabled():
        return {"status": "ok", "required": False}

    ip = main.get_client_ip(request)
    remaining = main.mission_unlock_lock_remaining_seconds(ip)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail="too many attempts; retry in %ds" % remaining,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    if not main.check_mission_password((data or {}).get("password")):
        main.register_mission_unlock_failure(ip)
        raise HTTPException(status_code=403, detail="wrong mission password")

    main.clear_mission_unlock_state(ip)
    response = JSONResponse({"status": "ok", "required": True})
    main.set_mission_cookie(response, request)
    return response


@router.get("/api/config")
async def get_config(request: Request):
    """La configuración pública de la misión.

    Sin las fotos de los jugadores dentro. Iban incrustadas en base64 y eran
    134 KB de los 135 KB de esta respuesta, que el móvil pedía cada 30 segundos:
    16 MB por hora y por móvil mandando una y otra vez las mismas caras. Y este
    endpoint es público, así que ahí estaban los retratos de los catorce al
    alcance de cualquiera. Ahora va la URL de /api/player-avatar, que se cachea.

    La lista de jugadores (`players` / `player_profiles`) sólo viaja si la
    misión está abierta: con MISSION_PASS puesta hay que desbloquear antes con
    /api/mission/unlock. Sin ella, todo sigue como estaba.
    """
    import main
    import time

    cfg = main.load_config()
    mission_open = main.mission_unlocked(request)

    payload = {
        "site_name": cfg.get("site_name", "PUT TITLE HERE"),
        # La hora del SERVIDOR, no la del móvil: para la cuenta atrás de
        # mission_launch_at hace falta un reloj que no se cambie en dos
        # toques de ajustes. Ver runtime/mission_schedule.py.
        "server_time_ms": int(time.time() * 1000),
        "mission_launch_at": cfg.get("mission_launch_at", ""),
        "admin_title": cfg.get("admin_title", "PUT ADMIN TITLE HERE"),
        "admin_subtitle": cfg.get("admin_subtitle", "PUT ADMIN SUBTITLE HERE"),
        "ui_lang": main.normalize_ui_lang(cfg.get("ui_lang", "es")),
        "player_theme": main.normalize_player_theme(cfg.get("player_theme", "glass")),
        # Qué motor dibuja el mapa. Ver VALID_MAP_ENGINES en main.py: mientras
        # dure la migración a WebGL conviven dos, y se elige por misión.
        "map_engine": main.normalize_map_engine(cfg.get("map_engine", "leaflet")),
        "story_title": cfg.get("story_title", ""),
        "story_text": cfg.get("story_text", ""),
        "prologue_title": cfg.get("prologue_title", "PUT PROLOGUE TITLE HERE"),
        "prologue_subtitle": cfg.get("prologue_subtitle", ""),
        "prologue_body": cfg.get("prologue_body", ""),
        "map_center": cfg.get("map_center", [40.4168, -3.7038]),
        "map_zoom": cfg.get("map_zoom", 13),
        "mapbox_style": cfg.get("mapbox_style", ""),
        "mission_pass_required": main.mission_gate_enabled(),
    }

    if mission_open:
        payload["players"] = cfg.get("players", ["PLAYER 1", "PLAYER 2"])
        payload["player_profiles"] = [
            main.aligerar_avatar(perfil) for perfil in main.get_player_profiles(cfg)
        ]
    else:
        payload["players"] = []
        payload["player_profiles"] = []

    return payload


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


def _tile_cache_paths(z: int, x: int, y: int) -> tuple[Path, Path]:
    import main

    carpeta = Path(main.DATA_DIR) / "tile_cache" / str(z) / str(x)
    return carpeta / f"{y}.bin", carpeta / f"{y}.ct"


@router.get("/map-tiles/{z}/{x}/{y}.png", include_in_schema=False)
async def map_tile_proxy(z: int, x: int, y: int):
    """Sirve las teselas desde el mismo origen que la página.

    Sin esto, Safari en iOS bloquea la mezcla de contenidos cuando la página va
    por HTTP y la tesela por HTTPS. Además, al ser del mismo origen, el service
    worker puede cachearlas para el monte.

    ⚠️ Antes de la caché en disco, CADA tesela era un viaje Esri de verdad,
    para CADA jugador, cada vez -aunque otro ya hubiera pisado la misma zona
    un minuto antes-. Al desampliar el mapa se piden muchas teselas nuevas de
    golpe, así que ese viaje se notaba como parpadeo/hueco en blanco: no era
    CSS ni la animación, era la red Pi→Esri. Con la caché en disco, la
    primera petición de cada tesela paga ese viaje; las siguientes -de ese
    jugador o de cualquier otro- se sirven del disco de la Pi, que es local.
    """
    import main

    if z < 0 or z > 19:
        raise HTTPException(status_code=400, detail="Invalid zoom")

    ruta_binario, ruta_tipo = _tile_cache_paths(z, x, y)

    if ruta_binario.exists():
        try:
            contenido = ruta_binario.read_bytes()
            tipo = ruta_tipo.read_text(encoding="utf-8").strip() if ruta_tipo.exists() else "image/jpeg"
            return Response(
                content=contenido,
                media_type=tipo or "image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            )
        except OSError:
            pass  # Caché corrupta o no legible: se pide de nuevo como si no existiera.

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

    tipo_respuesta = resp.headers.get("Content-Type", "image/jpeg")

    # Guardar en disco es un extra: si falla -disco lleno, permisos- la
    # tesela se sirve igual, solo que no queda cacheada para la próxima vez.
    try:
        ruta_binario.parent.mkdir(parents=True, exist_ok=True)
        ruta_binario.write_bytes(resp.content)
        ruta_tipo.write_text(tipo_respuesta, encoding="utf-8")
    except OSError:
        pass

    return Response(
        content=resp.content,
        media_type=tipo_respuesta,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ---------------------------------------------------------------------------
# Teselas de elevación (relieve del mapa 3D)
# ---------------------------------------------------------------------------
#
# Terrarium, de AWS Open Data: elevación abierta, sin clave ni registro. Es
# el origen que usa media comunidad de MapLibre para relieve.
#
# Va por el mismo camino que las teselas normales -proxy propio con caché en
# disco- y no directo desde el móvil, por tres motivos que ya costaron caro
# con el satélite: mismo origen (sin CORS), una sola descarga por zona para
# TODOS los jugadores en vez de una por móvil, y sobre todo que el service
# worker pueda guardarlas para el monte. Un origen externo directo no se
# puede cachear para jugar sin cobertura, que es innegociable aquí.
_BASE_RELIEVE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"


def _dem_cache_paths(z: int, x: int, y: int) -> tuple[Path, Path]:
    import main

    carpeta = Path(main.DATA_DIR) / "dem_cache" / str(z) / str(x)
    return carpeta / f"{y}.bin", carpeta / f"{y}.ct"


@router.get("/dem-tiles/{z}/{x}/{y}.png", include_in_schema=False)
async def dem_tile_proxy(z: int, x: int, y: int):
    """Elevación del terreno para el relieve del mapa 3D."""
    import main

    # Terrarium no pasa de 15: pedir más alto devuelve 404 y MapLibre deja
    # de dibujar relieve en esa zona. Se recorta aquí.
    if z < 0 or z > 15:
        raise HTTPException(status_code=404, detail="Zoom fuera del rango de elevación")

    ruta_binario, ruta_tipo = _dem_cache_paths(z, x, y)

    if ruta_binario.exists():
        try:
            contenido = ruta_binario.read_bytes()
            tipo = ruta_tipo.read_text(encoding="utf-8").strip() if ruta_tipo.exists() else "image/png"
            return Response(
                content=contenido,
                media_type=tipo or "image/png",
                headers={
                    "Cache-Control": "public, max-age=604800",
                    "Access-Control-Allow-Origin": "*",
                },
            )
        except OSError:
            pass

    if not main._HTTPX_AVAILABLE:
        raise HTTPException(status_code=500, detail="httpx not available for proxying")

    url = "%s/%s/%s/%s.png" % (_BASE_RELIEVE, z, x, y)

    try:
        async with main._httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers=_CABECERAS_TESELAS, follow_redirects=True)
    except main._httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="DEM proxy error: %s" % exc)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="DEM tile not found upstream")

    tipo_respuesta = resp.headers.get("Content-Type", "image/png")

    try:
        ruta_binario.parent.mkdir(parents=True, exist_ok=True)
        ruta_binario.write_bytes(resp.content)
        ruta_tipo.write_text(tipo_respuesta, encoding="utf-8")
    except OSError:
        pass

    return Response(
        content=resp.content,
        media_type=tipo_respuesta,
        headers={
            "Cache-Control": "public, max-age=604800",
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

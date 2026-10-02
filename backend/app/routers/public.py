"""Lo que el móvil pide sin haber entrado todavía: versión, configuración,
fotos de jugador, teselas del mapa y el service worker.

Segunda tajada de sacar las rutas de `main.py`. Estas ya no son sólo ficheros
—leen la configuración de la misión y las fichas de jugador— pero siguen sin
tocar la partida de nadie: ninguna cambia el estado del juego.
"""
import asyncio
import base64
import os
import re
import struct

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse

from backend.app.runtime import teselas as _teselas
from backend.app.security import client_ip as _client_ip

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

    # El bloqueo por intentos cuenta por /64 en IPv6: quien ataca desde una
    # dirección IPv6 cambia de dirección dentro de su /64 cuando quiere.
    ip = _client_ip.lockout_key(main.get_client_ip(request))
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
    if not isinstance(data, dict):
        data = {}

    # PBKDF2 con 200 000 vueltas son décimas de segundo de CPU (más en la
    # Raspberry): en un hilo, no en el bucle que atiende a todos los jugadores.
    valida = await run_in_threadpool(main.check_mission_password, data.get("password"))
    if not valida:
        main.register_mission_unlock_failure(ip)
        raise HTTPException(status_code=403, detail="wrong mission password")

    main.clear_mission_unlock_state(ip)
    response = JSONResponse({"status": "ok", "required": True})
    main.set_mission_cookie(response, request)
    return response


@router.get("/api/config")
def get_config(request: Request):
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
        # Para que la pantalla de carga sepa si la red de caminos guardada es la
        # de ahora (ver version_red_de_caminos).
        "road_graph_version": version_red_de_caminos(),
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
        # Huella de TODO lo que el móvil se baja de la misión (nodos con sus
        # coordenadas, fotos, mapa, red de caminos): cambia cuando algo de eso
        # cambia. La pantalla de carga la compara con la que guardó (ver
        # runtime/revisiones.py).
        "mission_revision": main.mission_revision(cfg),
    }

    if mission_open:
        payload["players"] = cfg.get("players", ["PLAYER 1", "PLAYER 2"])
        personajes, defectos = main.personajes_de_la_mision(cfg)
        payload["player_profiles"] = [
            main.con_personaje(main.aligerar_avatar(perfil), personajes, defectos)
            for perfil in main.get_player_profiles(cfg)
        ]
    else:
        payload["players"] = []
        payload["player_profiles"] = []

    return payload


def _puede_ver_retratos(main, request: Request) -> bool:
    """¿Quien pide una foto de jugador es de la misión?

    Es la MISMA puerta que la lista de jugadores de `/api/config`: sin
    MISSION_PASS la lista es pública y las fotos también (la pantalla de login las
    enseña antes de que nadie tenga pase); con MISSION_PASS hace falta la cookie
    de misión. Además vale el pase de cualquier jugador y la sesión del panel.
    `SAGA_AVATARS_REQUIRE_SESSION=1` exige siempre sesión de jugador o de panel.
    """
    if main.hay_sesion_de_algun_jugador(request):
        return True
    if main.verify_admin_session_token(request.cookies.get(main.ADMIN_SESSION_COOKIE)):
        return True
    if (os.getenv("SAGA_AVATARS_REQUIRE_SESSION") or "0").strip() == "1":
        return False
    return main.mission_unlocked(request)


@router.api_route("/api/player-avatar/{profile_id}", methods=["GET", "HEAD"])
def player_avatar(profile_id: str, request: Request):
    """La foto de un jugador, como imagen y cacheable.

    Va aparte de la tabla de equipo a propósito: esa se pide cada 5 segundos y
    llevaba las fotos dentro, repitiéndolas enteras cada vez. Aquí se descargan
    una vez y el navegador —y el service worker— se las quedan. La URL trae el
    hash de la imagen, así que cambiar una foto en administración invalida la
    caché sola.

    Tiene puerta (ver `_puede_ver_retratos`): antes bastaba conocer el id de un
    jugador -un nombre- para bajarse su retrato (caza de fallos S9).
    """
    import main

    if not _puede_ver_retratos(main, request):
        raise HTTPException(status_code=403, detail="player session required")

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
            # quedarse ésta para siempre. `private`, no `public`: es la foto de una
            # persona detrás de una puerta, y un caché compartido (Cloudflare) no
            # puede guardarla y servírsela a quien no pasó por ella.
            "Cache-Control": "private, max-age=31536000, immutable",
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


def _es_imagen(respuesta) -> bool:
    """Sólo se guarda en la caché lo que de verdad es una imagen y no está vacío.

    Una página de error de Esri con un 200 no puede quedarse en disco como
    «tesela» y servirse durante un día a todos los jugadores.
    """
    tipo = str(respuesta.headers.get("Content-Type", "") or "").lower()
    # `octet-stream` también: algunos orígenes de teselas no declaran el tipo.
    return bool(getattr(respuesta, "content", b"")) and tipo.startswith(("image/", "application/octet-stream"))


@router.get("/map-tiles/{z}/{x}/{y}.png", include_in_schema=False)
async def map_tile_proxy(z: int, x: int, y: int, request: Request):
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

    La ruta es pública, así que sólo se sirve la zona de la misión (más el margen
    del paquete offline) y la caché tiene tope de disco: ver runtime/teselas.py.
    """
    import main

    if z < 0 or z > 19:
        raise HTTPException(status_code=400, detail="Invalid zoom")

    await _exigir_zona(request, z, x, y)

    ruta_binario, ruta_tipo = _tile_cache_paths(z, x, y)

    en_cache = _teselas.leer_de_cache(ruta_binario, ruta_tipo, "image/jpeg")
    if en_cache:
        contenido, tipo = en_cache
        return Response(
            content=contenido,
            media_type=tipo,
            headers={
                "Cache-Control": "public, max-age=86400",
                "Access-Control-Allow-Origin": "*",
            },
        )

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
    if _es_imagen(resp):
        await run_in_threadpool(
            _teselas.guardar_en_cache,
            ruta_binario,
            ruta_tipo,
            resp.content,
            tipo_respuesta,
            _teselas.limite_cache_mapa(),
        )

    return Response(
        content=resp.content,
        media_type=tipo_respuesta,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


async def _exigir_zona(request: Request, z: int, x: int, y: int) -> None:
    """404 si la tesela cae fuera de la zona de la misión (salvo para el panel)."""
    # En línea, sin saltar a un hilo por cada tesela: es aritmética sobre una caja
    # que está en memoria (sólo se relee, unos milisegundos, cada 30 s).
    if _teselas.tesela_permitida(z, x, y):
        return

    import main

    # El panel puede mirar cualquier sitio: también es quien diseña una misión
    # nueva antes de guardar los nodos que definirían su zona.
    if await run_in_threadpool(
        main.verify_admin_session_token, request.cookies.get(main.ADMIN_SESSION_COOKIE)
    ):
        return

    raise HTTPException(status_code=404, detail="Tile outside the mission area")


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
async def dem_tile_proxy(z: int, x: int, y: int, request: Request):
    """Elevación del terreno para el relieve del mapa 3D."""
    import main

    # Terrarium no pasa de 15: pedir más alto devuelve 404 y MapLibre deja
    # de dibujar relieve en esa zona. Se recorta aquí.
    if z < 0 or z > 15:
        raise HTTPException(status_code=404, detail="Zoom fuera del rango de elevación")

    await _exigir_zona(request, z, x, y)

    ruta_binario, ruta_tipo = _dem_cache_paths(z, x, y)

    en_cache = _teselas.leer_de_cache(ruta_binario, ruta_tipo, "image/png")
    if en_cache:
        contenido, tipo = en_cache
        return Response(
            content=contenido,
            media_type=tipo,
            headers={
                "Cache-Control": "public, max-age=604800",
                "Access-Control-Allow-Origin": "*",
            },
        )

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

    if _es_imagen(resp):
        await run_in_threadpool(
            _teselas.guardar_en_cache,
            ruta_binario,
            ruta_tipo,
            resp.content,
            tipo_respuesta,
            _teselas.limite_cache_relieve(),
        )

    return Response(
        content=resp.content,
        media_type=tipo_respuesta,
        headers={
            "Cache-Control": "public, max-age=604800",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ---------------------------------------------------------------------------
# Teselas en lote: el paquete offline de una vez, no tesela a tesela
# ---------------------------------------------------------------------------
_RE_TESELA_LOTE = re.compile(r"^/(map-tiles|dem-tiles)/(\d{1,2})/(\d{1,7})/(\d{1,7})\.png$")
_MAX_TESELAS_LOTE = 200


async def _tesela_para_lote(cliente, tipo: str, z: int, x: int, y: int):
    """(bytes, tipo) de la caché en disco de la Pi o del origen; None si no hay."""
    if tipo == "map-tiles":
        if z < 0 or z > 19:
            return None
        ruta_binario, ruta_tipo = _tile_cache_paths(z, x, y)
        url = "%s/%s/%s/%s" % (_BASE_TESELAS, z, y, x)
        tipo_defecto = "image/jpeg"
        limite = _teselas.limite_cache_mapa()
    else:
        if z < 0 or z > 15:
            return None
        ruta_binario, ruta_tipo = _dem_cache_paths(z, x, y)
        url = "%s/%s/%s/%s.png" % (_BASE_RELIEVE, z, x, y)
        tipo_defecto = "image/png"
        limite = _teselas.limite_cache_relieve()

    en_cache = _teselas.leer_de_cache(ruta_binario, ruta_tipo, tipo_defecto)
    if en_cache:
        return en_cache

    if cliente is None:
        return None
    resp = await cliente.get(url, headers=_CABECERAS_TESELAS, follow_redirects=True)
    if resp.status_code != 200:
        return None
    tipo_respuesta = resp.headers.get("Content-Type", tipo_defecto)
    if _es_imagen(resp):
        await run_in_threadpool(
            _teselas.guardar_en_cache, ruta_binario, ruta_tipo, resp.content, tipo_respuesta, limite
        )
    return resp.content, tipo_respuesta


@router.post("/api/teselas/lote", include_in_schema=False)
async def teselas_en_lote(request: Request):
    """Hasta 200 teselas (imagen o relieve) en UNA respuesta.

    El paquete offline son unas 3.000 teselas y cada una, pedida suelta por
    el túnel de Cloudflare, tarda ~0,7 s en ir y volver: medido en
    sagagia.es, más de 20 minutos la primera vez en un móvil nuevo, aunque la
    Pi las sirve de su disco en 60 ms. En lote son unas 25 peticiones.

    Formato binario, little-endian: b"SAGT", u32 número de teselas, y por
    cada una: u16 + ruta, u16 + tipo, u32 + datos (0 bytes si no hay).

    Sólo se sirven las teselas de la zona de la misión (ver runtime/teselas.py):
    las de fuera llegan vacías, como las que no existen.
    """
    import main

    try:
        datos = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    lista = datos.get("teselas") if isinstance(datos, dict) else None
    if not isinstance(lista, list) or len(lista) > _MAX_TESELAS_LOTE:
        raise HTTPException(status_code=400, detail="teselas: lista de hasta %d rutas" % _MAX_TESELAS_LOTE)

    es_panel = None
    caja = await run_in_threadpool(_teselas.caja_de_la_mision)

    pedidas = []
    for ruta in lista:
        trozos = _RE_TESELA_LOTE.match(str(ruta))
        if not trozos:
            continue
        z, x, y = int(trozos.group(2)), int(trozos.group(3)), int(trozos.group(4))
        if not _teselas.tesela_permitida(z, x, y, caja):
            if es_panel is None:
                es_panel = bool(
                    await run_in_threadpool(
                        main.verify_admin_session_token, request.cookies.get(main.ADMIN_SESSION_COOKIE)
                    )
                )
            if not es_panel:
                pedidas.append((str(ruta), None, z, x, y))  # fuera de zona: vacía
                continue
        pedidas.append((str(ruta), trozos.group(1), z, x, y))

    semaforo = asyncio.Semaphore(8)

    async def una(cliente, pedida):
        if pedida[1] is None:
            return pedida[0], None
        async with semaforo:
            try:
                return pedida[0], await _tesela_para_lote(cliente, *pedida[1:])
            except Exception:
                return pedida[0], None

    if main._HTTPX_AVAILABLE:
        async with main._httpx.AsyncClient(timeout=10.0) as cliente:
            resultados = await asyncio.gather(*(una(cliente, pedida) for pedida in pedidas))
    else:
        resultados = await asyncio.gather(*(una(None, pedida) for pedida in pedidas))

    partes = [b"SAGT", struct.pack("<I", len(resultados))]
    for ruta, resultado in resultados:
        ruta_b = ruta.encode("utf-8")
        tipo_b = (resultado[1] if resultado else "").encode("utf-8")
        cuerpo = resultado[0] if resultado else b""
        partes += [struct.pack("<H", len(ruta_b)), ruta_b, struct.pack("<H", len(tipo_b)), tipo_b, struct.pack("<I", len(cuerpo)), cuerpo]
    return Response(content=b"".join(partes), media_type="application/octet-stream", headers={"Cache-Control": "no-store"})


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


def version_red_de_caminos():
    """Huella del fichero de la red de caminos ("" si no hay).

    Cambia cuando el panel la reconstruye aunque la ruta no se haya movido: el
    móvil la compara con la cabecera de su copia guardada para saber si debe
    bajarla otra vez en la pantalla de carga.
    """
    import hashlib
    import main
    from backend.app.runtime import road_graph

    fichero = road_graph.ruta_fichero(main.DATA_DIR)
    try:
        estado = fichero.stat()
    except OSError:
        return ""
    return hashlib.sha1(f"{estado.st_mtime_ns}:{estado.st_size}".encode()).hexdigest()[:12]


@router.get("/api/road-graph")
async def road_graph_publico():
    """
    La red de caminos de la zona, para el móvil.

    Público como las teselas: no lleva nada personal, es OpenStreetMap
    recortado. Un día de caché en el navegador; el service worker la sirve
    sin cobertura desde el paquete offline.
    """
    import main
    from backend.app.runtime import road_graph

    fichero = road_graph.ruta_fichero(main.DATA_DIR)
    if not fichero.exists():
        raise HTTPException(status_code=404, detail="no road graph")
    return Response(
        content=fichero.read_bytes(),
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=86400", "X-Road-Graph-Version": version_red_de_caminos()},
    )

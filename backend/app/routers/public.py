"""Lo que el móvil pide sin haber entrado todavía: versión, configuración,
fotos de jugador, teselas del mapa y el service worker.

Segunda tajada de sacar las rutas de `main.py`. Estas ya no son sólo ficheros
—leen la configuración de la misión y las fichas de jugador— pero siguen sin
tocar la partida de nadie: ninguna cambia el estado del juego.
"""
import asyncio
import os
import re
import struct

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse

from backend.app.runtime import mapa3d as _mapa3d
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
        # Versión del relieve y los edificios preparados en el panel: va en la URL
        # de /dem-tiles y /api/edificios (`?v=`) y en la firma del mapa guardado.
        "mapa3d_version": _mapa3d.version(main.DATA_DIR),
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
        # false = hay clave y este móvil no la ha tecleado: el cliente enseña la pantalla del código.
        "mission_unlocked": bool(mission_open),
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

    # El tipo sale del contenido (firma + Pillow), no de la cabecera del `data:`:
    # una «foto» que sea SVG o HTML no se sirve desde este origen.
    from backend.app.security import imagenes as _imagenes

    leida = _imagenes.decodificar_data_url_de_imagen(foto)
    if leida is None:
        raise HTTPException(status_code=404, detail="foto ilegible")
    tipo, binario = leida

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
#: Satélite: PNOA del IGN en España (z11+), Esri de respaldo a zoom bajo, fuera
#: de España o si el IGN falla. Ver `teselas.origen_satelite`.
_CABECERAS_TESELAS = {"User-Agent": "SAGA-Engine/2.x tile-proxy"}

#: Un cliente HTTP para todas las teselas, en vez de uno por tesela. Abrir un
#: `AsyncClient` por petición era una conexión TLS nueva con Esri/AWS por cada
#: tesela que no estaba en el disco (auditoría M5): al desampliar el mapa, decenas
#: de apretones de manos seguidos desde la Raspberry. Va atado a su bucle de
#: eventos: si el bucle cambia (las pruebas abren uno por cliente), se crea otro.
_cliente_teselas = {"bucle": None, "cliente": None}


def _cliente_de_teselas(main):
    bucle = asyncio.get_running_loop()
    cliente = _cliente_teselas["cliente"]
    if (
        cliente is None
        or _cliente_teselas["bucle"] is not bucle
        or getattr(cliente, "is_closed", False)
        # Otra clase de cliente (las pruebas lo sustituyen por uno falso).
        or not isinstance(cliente, main._httpx.AsyncClient)
    ):
        cliente = main._httpx.AsyncClient(
            # Esperar turno de conexión NO cuenta como fallo: con 16 conexiones y
            # varios lotes en frío (IGN ~3,7 s por tesela) la espera pasaba de 12 s,
            # saltaba PoolTimeout y la tesela volvía vacía: el móvil la repetía suelta.
            timeout=main._httpx.Timeout(12.0, pool=120.0),
            follow_redirects=True,
            limits=main._httpx.Limits(max_connections=16, max_keepalive_connections=8),
        )
        _cliente_teselas["bucle"] = bucle
        _cliente_teselas["cliente"] = cliente
    return cliente


async def _leer_de_cache(ruta_binario, ruta_tipo, tipo_defecto):
    """La tesela del disco de la Pi, leída en un hilo y no en el bucle (auditoría M5)."""
    return await run_in_threadpool(_teselas.leer_de_cache, ruta_binario, ruta_tipo, tipo_defecto)


def _tile_cache_paths(z: int, x: int, y: int, origen: str | None = None) -> tuple[Path, Path]:
    import main

    origen = origen or _teselas.origen_satelite(z, x, y)
    carpeta = Path(main.DATA_DIR) / _teselas.carpeta_satelite(origen) / str(z) / str(x)
    return carpeta / f"{y}.bin", carpeta / f"{y}.ct"


async def _tesela_satelite(main, cliente, z: int, x: int, y: int):
    """(bytes, tipo) de la tesela de satélite: disco de la Pi primero, después el origen.

    PNOA primero (dentro de España, z11+); si el IGN no la da -caída, error, algo
    que no es una imagen-, Esri. Cada origen guarda en su carpeta. Devuelve None si
    no hay cliente y no estaba en disco; lanza `RequestError` si no hay red, o
    `HTTPException` con el estado del último origen si ninguno la tiene.
    """
    origen = _teselas.origen_satelite(z, x, y)
    origenes = ("pnoa", "esri") if origen == "pnoa" else ("esri",)
    fallo_de_red = None
    for indice, actual in enumerate(origenes):
        ultimo = indice == len(origenes) - 1
        ruta_binario, ruta_tipo = _tile_cache_paths(z, x, y, actual)
        en_cache = await _leer_de_cache(ruta_binario, ruta_tipo, "image/jpeg")
        if en_cache:
            return en_cache
        if cliente is None:
            continue
        try:
            resp = await cliente.get(
                _teselas.url_satelite(actual, z, x, y), headers=_CABECERAS_TESELAS, timeout=8.0
            )
        except main._httpx.RequestError as exc:
            fallo_de_red = exc
            continue
        if resp.status_code != 200:
            if ultimo:
                raise HTTPException(status_code=resp.status_code, detail="Tile not found upstream")
            continue
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
        elif not ultimo:
            continue  # una página de error del IGN con un 200: se prueba Esri
        return resp.content, tipo_respuesta
    if fallo_de_red is not None:
        raise fallo_de_red
    return None


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

    cliente = _cliente_de_teselas(main) if main._HTTPX_AVAILABLE else None
    try:
        tesela = await _tesela_satelite(main, cliente, z, x, y)
    except main._httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Tile proxy error: %s" % exc)
    if tesela is None:
        raise HTTPException(status_code=500, detail="httpx not available for proxying")
    contenido, tipo_respuesta = tesela

    return Response(
        content=contenido,
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


def _ruta_relieve_propio(z: int, x: int, y: int) -> Path:
    """La tesela terrain-RGB pregenerada del IGN (ver runtime/mapa3d.py)."""
    import main

    return Path(main.DATA_DIR) / "dem_ign" / str(z) / str(x) / f"{y}.png"


@router.get("/dem-tiles/{z}/{x}/{y}.png", include_in_schema=False)
async def dem_tile_proxy(z: int, x: int, y: int, request: Request):
    """Elevación del terreno para el relieve del mapa 3D."""
    import main

    # Terrarium no pasa de 15: pedir más alto devuelve 404 y MapLibre deja
    # de dibujar relieve en esa zona. Se recorta aquí.
    if z < 0 or z > 15:
        raise HTTPException(status_code=404, detail="Zoom fuera del rango de elevación")

    await _exigir_zona(request, z, x, y)

    # Primero el relieve del IGN (MDT05/MDT25) preparado desde el panel; si esa
    # tesela no está -fuera de la zona preparada o sin preparar-, Terrarium.
    propia = await run_in_threadpool(_teselas.leer_relieve_propio, _ruta_relieve_propio(z, x, y))
    if propia is not None:
        return Response(
            content=propia,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=604800", "Access-Control-Allow-Origin": "*"},
        )

    ruta_binario, ruta_tipo = _dem_cache_paths(z, x, y)

    en_cache = await _leer_de_cache(ruta_binario, ruta_tipo, "image/png")
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
        resp = await _cliente_de_teselas(main).get(url, headers=_CABECERAS_TESELAS, timeout=12.0)
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
# El relieve puede llevar la versión del mapa 3D (`?v=`, ver mapa3d.version): la
# ruta vuelve tal cual, con su `?v=`, para que el móvil la guarde con esa clave.
_RE_TESELA_LOTE = re.compile(r"^/(map-tiles|dem-tiles)/(\d{1,2})/(\d{1,7})/(\d{1,7})\.png(?:\?v=[A-Za-z0-9_-]{1,40})?$")
_MAX_TESELAS_LOTE = 200


async def _tesela_para_lote(cliente, tipo: str, z: int, x: int, y: int):
    """(bytes, tipo) de la caché en disco de la Pi o del origen; None si no hay."""
    if tipo == "map-tiles":
        if z < 0 or z > 19:
            return None
        import main

        try:
            return await _tesela_satelite(main, cliente, z, x, y)
        except HTTPException:
            return None

    if z < 0 or z > 15:
        return None
    propia = await run_in_threadpool(_teselas.leer_relieve_propio, _ruta_relieve_propio(z, x, y))
    if propia is not None:
        return propia, "image/png"
    ruta_binario, ruta_tipo = _dem_cache_paths(z, x, y)
    url = "%s/%s/%s/%s.png" % (_BASE_RELIEVE, z, x, y)
    tipo_defecto = "image/png"
    limite = _teselas.limite_cache_relieve()

    en_cache = await _leer_de_cache(ruta_binario, ruta_tipo, tipo_defecto)
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

    # 16, no 8: con la caché de la Pi fría el IGN tarda ~3,7 s por tesela y un lote
    # de 120 con 8 a la vez pasaba de 55 s; el móvil lo daba por fallido y repetía
    # cientos de teselas de una en una. «Preparar mapa 3D» calienta la caché antes
    # (fase satélite, ver mapa3d.py), así que esto sólo cuenta para lo que falte.
    semaforo = asyncio.Semaphore(16)

    async def una(cliente, pedida):
        if pedida[1] is None:
            return pedida[0], None
        async with semaforo:
            try:
                return pedida[0], await _tesela_para_lote(cliente, *pedida[1:])
            except Exception:
                return pedida[0], None

    if main._HTTPX_AVAILABLE:
        cliente = _cliente_de_teselas(main)
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
    # Se manda en trozos desde el disco: `read_bytes()` metía 7-21 MB en memoria
    # y los leía dentro del bucle de eventos, con todos los jugadores esperando.
    return FileResponse(
        fichero,
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=86400", "X-Road-Graph-Version": version_red_de_caminos()},
    )


@router.get("/api/edificios")
async def edificios_publico():
    """
    Los edificios del Catastro de la zona de la misión, para el mapa 3D.

    Públicos como las teselas (datos abiertos del Catastro, nada personal),
    recortados a la caja de la misión de AHORA y sin ninguna casa encima de un
    nodo. Van ya comprimidos con gzip (~170 KB para un pueblo); el móvil los
    guarda con el paquete offline. Sin preparar, una colección vacía: el mapa no
    tiene que distinguir nada.
    """
    import main
    from backend.app.runtime import mapa3d
    from backend.app.storage import runtime_store

    def _calcular():
        caja = _teselas.caja_de_la_mision()
        clave = (main.STAGES_DB, runtime_store.stages_signature(main.STAGES_DB), caja)
        nodos = []
        if (Path(main.DATA_DIR) / mapa3d.FICHERO_EDIFICIOS).exists():
            for nodo in runtime_store.load_stages(main.STAGES_DB):
                if isinstance(nodo, dict):
                    lat, lon = _teselas._numero(nodo.get("lat")), _teselas._numero(nodo.get("lon"))
                    if lat is not None and lon is not None:
                        nodos.append((lat, lon))
        return mapa3d.edificios_para_servir(main.DATA_DIR, clave, caja, nodos)

    cuerpo, version = await run_in_threadpool(_calcular)
    return Response(
        content=cuerpo,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "Cache-Control": "public, max-age=3600",
            "X-Edificios-Version": version,
        },
    )

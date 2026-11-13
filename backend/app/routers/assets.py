"""Iconos, manifiesto y marcas de la aplicación.

Primera tajada de sacar las rutas de `main.py`, que tenía 2 270 líneas y 32
rutas mezcladas con toda la lógica del juego. Se empieza por éstas porque son
las más independientes: no tocan la partida, ni la sesión, ni la base de datos.
Sólo buscan un fichero en dos sitios y lo devuelven.

Dónde buscan, y por qué en ese orden: primero en el build del frontend
(`frontend/dist`), que es lo que se sirve en producción, y si no está, en
`frontend/public`, que es lo que hay en desarrollo antes de compilar.
"""
import gzip
import hashlib
import os
import re
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, Response

router = APIRouter()

# Sin caché para los iconos: son pocos kilobytes y cambian con la marca. Que un
# navegador se quede con un icono viejo un año es más molesto que volver a
# pedirlo.
SIN_CACHE = {"Cache-Control": "no-cache, max-age=0"}


# Los modelos de los avatares 3D (Mixamo) NO están en el repositorio ni en la imagen: su licencia
# no permite redistribuirlos. Se copian a las Pis (scripts/desplegar_avatares.ps1) y se montan en
# el contenedor (`-v /home/<usuario>/saga_avatares:/app/avatares:ro`). Los nombres llevan la
# huella del contenido, así que se pueden guardar para siempre.
_NOMBRE_DE_AVATAR = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(glb|webp)$")
_TIPO_DE_AVATAR = {"glb": "model/gltf-binary", "webp": "image/webp"}
_CACHE_PARA_SIEMPRE = {"Cache-Control": "public, max-age=31536000, immutable"}

# 14/11 (medido a 4G): los modelos .glb (12,4 MB, ya con meshopt) comprimen un 33 % con gzip y el middleware global NO los
# toca (gasta CPU de la Pi en cada petición). Aquí se comprimen UNA vez por modelo y por arranque (nivel 9, ya que se
# guarda) y se sirve la copia en memoria: ~8 MB de RAM en total, y cero CPU en las siguientes peticiones.
# ponytail: sin brotli (no es dependencia) ni precompresión en el build (los modelos no están en la imagen).
_GLB_COMPRIMIDOS: dict[str, tuple[int, int, bytes, str]] = {}
_TOPE_DE_GLB_COMPRIMIDOS = 64 * 1024 * 1024
_MARGEN_MINIMO = 0.95  # si gzip no ahorra al menos un 5 %, se sirve el original


def _acepta_gzip(cabecera: str) -> bool:
    """`Accept-Encoding` pide gzip (y no con q=0)."""
    for trozo in cabecera.lower().split(","):
        nombre, _, parametros = trozo.partition(";")
        if nombre.strip() not in ("gzip", "*"):
            continue
        q = 1.0
        for parte in parametros.split(";"):
            clave, _, valor = parte.strip().partition("=")
            if clave == "q":
                try:
                    q = float(valor)
                except ValueError:
                    q = 0.0
        return q > 0
    return False


def _comprimir(fichero: Path) -> bytes:
    return gzip.compress(fichero.read_bytes(), compresslevel=9, mtime=0)


async def _glb_comprimido(fichero: Path, nombre: str) -> tuple[bytes, str] | None:
    """La copia gzip (cuerpo y ETag) de un modelo, o `None` si no compensa o no cabe."""
    try:
        estado = fichero.stat()
    except OSError:
        return None
    guardado = _GLB_COMPRIMIDOS.get(nombre)
    if guardado is not None and guardado[0] == estado.st_mtime_ns and guardado[1] == estado.st_size:
        return (guardado[2], guardado[3]) if guardado[2] else None
    cuerpo = await run_in_threadpool(_comprimir, fichero)
    if len(cuerpo) >= estado.st_size * _MARGEN_MINIMO:
        cuerpo = b""  # no compensa: se recuerda para no volver a intentarlo
    usado = sum(len(v[2]) for k, v in _GLB_COMPRIMIDOS.items() if k != nombre)
    if usado + len(cuerpo) > _TOPE_DE_GLB_COMPRIMIDOS:
        return None
    etag = '"%s"' % hashlib.blake2s(cuerpo, digest_size=8).hexdigest() if cuerpo else ""
    _GLB_COMPRIMIDOS[nombre] = (estado.st_mtime_ns, estado.st_size, cuerpo, etag)
    return (cuerpo, etag) if cuerpo else None


def carpeta_de_avatares() -> Path:
    """Dónde están los activos de los avatares: `SAGA_AVATAR_DIR`, o el primer sitio que exista.

    Por orden: `<app>/avatares` (el volumen montado en producción), `<datos>/avatares` y
    `<app>/assets_privados/avatares` (el árbol de trabajo de desarrollo).
    """
    import main

    de_entorno = (os.getenv("SAGA_AVATAR_DIR") or "").strip()
    if de_entorno:
        return Path(de_entorno)
    candidatos = (
        main.APP_DIR / "avatares",
        Path(main.DATA_DIR) / "avatares",
        main.APP_DIR / "assets_privados" / "avatares",
    )
    for candidato in candidatos:
        if candidato.is_dir():
            return candidato
    return candidatos[-1]


@router.api_route("/assets/avatares/{nombre}", methods=["GET", "HEAD"], include_in_schema=False)
async def activo_de_avatar(nombre: str, request: Request):
    """Un modelo, animación o retrato de los avatares. 404 si no está: la app sigue sin él."""
    if not _NOMBRE_DE_AVATAR.match(nombre):
        return JSONResponse({"status": "error", "detail": "nombre no válido"}, status_code=404)
    fichero = carpeta_de_avatares() / nombre
    if not fichero.is_file():
        return JSONResponse({"status": "error", "detail": "%s not found" % nombre}, status_code=404)
    if (
        nombre.endswith(".glb")
        and "range" not in request.headers
        and _acepta_gzip(request.headers.get("accept-encoding", ""))
    ):
        comprimido = await _glb_comprimido(fichero, nombre)
        if comprimido is not None:
            cuerpo, etag = comprimido
            cabeceras = {**_CACHE_PARA_SIEMPRE, "Content-Encoding": "gzip", "Vary": "Accept-Encoding", "ETag": etag}
            if request.headers.get("if-none-match") == etag:
                return Response(status_code=304, headers=cabeceras)
            return Response(cuerpo, media_type=_TIPO_DE_AVATAR["glb"], headers=cabeceras)
    return FileResponse(
        fichero, media_type=_TIPO_DE_AVATAR[nombre.rsplit(".", 1)[1]], headers=_CACHE_PARA_SIEMPRE
    )


def _publico() -> Path:
    import main

    return main.APP_DIR / "frontend" / "public"


def _servir(nombre: str, tipo: str, cabeceras=None):
    """Devuelve un fichero del frontend, esté compilado o no."""
    import main

    for candidato in (main.REACT_DIST_DIR / nombre, _publico() / nombre):
        if candidato.exists():
            return FileResponse(candidato, media_type=tipo, headers=cabeceras or SIN_CACHE)

    return JSONResponse(
        {"status": "error", "detail": "%s not found" % nombre}, status_code=404
    )


@router.api_route("/player-precache.json", methods=["GET", "HEAD"], include_in_schema=False)
async def lista_de_paquetes_del_jugador():
    """Todos los paquetes (.js/.css) que puede necesitar el móvil del jugador.

    Los genera el build (`frontend/vite.config.ts`) recorriendo el grafo desde
    la entrada del jugador, con los imports dinámicos incluidos (mapa,
    minijuegos, paneles) y SIN lo del panel de administración. `pwaShell.ts` la
    lee al preparar el modo offline para guardar hasta lo que aún no se ha
    abierto. Sin caché: cada despliegue trae paquetes con otro hash.
    """
    import main

    fichero = main.REACT_DIST_DIR / "player-precache.json"
    if fichero.exists():
        return FileResponse(
            fichero,
            media_type="application/json",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )
    return JSONResponse({"status": "error", "detail": "player-precache.json not found"}, status_code=404)


@router.api_route("/robots.txt", methods=["GET", "HEAD"], include_in_schema=False)
async def robots():
    """Nada que indexar: es un juego privado (auditoría 15/10, fase 4)."""
    from fastapi.responses import PlainTextResponse

    return PlainTextResponse("User-agent: *\nDisallow: /\n")


@router.api_route("/login-fondo.jpg", methods=["GET", "HEAD"], include_in_schema=False)
async def fondo_del_login():
    """La foto de la portada: estaba en el build pero ninguna ruta la servía (404)."""
    import main

    respuesta = main.saga_asset_file_response("login-fondo.jpg", "image/jpeg")
    if respuesta.status_code == 200:
        respuesta.headers["Cache-Control"] = "public, max-age=86400"
    return respuesta


@router.api_route("/saga-app-icon.svg", methods=["GET", "HEAD"], include_in_schema=False)
async def icono_svg():
    import main

    return main.saga_asset_file_response("saga-app-icon.svg", "image/svg+xml")


@router.api_route("/favicon.ico", methods=["GET", "HEAD"], include_in_schema=False)
async def favicon():
    """El icono de la pestaña.

    Había DOS manejadores para esta ruta en main.py, los dos con el mismo
    nombre de función. Sólo respondía el primero —el que registra la ruta gana—
    y el segundo era código muerto con toda la pinta de estar vivo. Se conserva
    el que estaba vivo.
    """
    import main

    return main.saga_asset_file_response("saga-app-icon-192.png", "image/png")


@router.api_route("/saga-app-icon-180.png", methods=["GET", "HEAD"], include_in_schema=False)
async def icono_180():
    return _servir("saga-app-icon-180.png", "image/png")


@router.api_route("/saga-app-icon-192.png", methods=["GET", "HEAD"], include_in_schema=False)
async def icono_192():
    return _servir("saga-app-icon-192.png", "image/png")


@router.api_route("/saga-app-icon-512.png", methods=["GET", "HEAD"], include_in_schema=False)
async def icono_512():
    return _servir("saga-app-icon-512.png", "image/png")


@router.api_route("/apple-touch-icon.png", methods=["GET", "HEAD"], include_in_schema=False)
async def icono_apple():
    # iOS usa el de 180 para la pantalla de inicio.
    return _servir("saga-app-icon-180.png", "image/png")


@router.api_route(
    "/apple-touch-icon-precomposed.png", methods=["GET", "HEAD"], include_in_schema=False
)
async def icono_apple_precompuesto():
    return _servir("saga-app-icon-180.png", "image/png")


@router.api_route("/saga-brand-final.svg", methods=["GET", "HEAD"], include_in_schema=False)
async def marca_final():
    return _servir("saga-brand-final.svg", "image/svg+xml")


@router.api_route("/saga-header-mark.svg", methods=["GET", "HEAD"], include_in_schema=False)
async def marca_cabecera():
    # Ésta sí se cachea: va en la cabecera de todas las pantallas y no cambia.
    return _servir(
        "saga-header-mark.svg", "image/svg+xml", {"Cache-Control": "public, max-age=86400"}
    )


@router.api_route("/manifest.webmanifest", methods=["GET", "HEAD"])
def manifiesto():
    """Lo que convierte esto en una aplicación instalable.

    Sin caché a propósito: si el navegador se queda con un manifiesto viejo, la
    aplicación instalada arranca con la configuración anterior —orientación,
    pantalla de inicio, iconos— y no hay forma de que se entere del cambio.
    """
    import main

    for candidato in (main.REACT_MANIFEST_FILE, main.REACT_PUBLIC_MANIFEST_FILE):
        if candidato.exists():
            # 30/10: el color de la barra y de la pantalla de arranque de la app INSTALADA es el del tema de la misión
            # (el mismo que la etiqueta theme-color del index): el fijo verde no casaba con la pizarra.
            import json as _json

            from backend.app import build_frontend as _bf

            datos = _json.loads(candidato.read_text(encoding="utf-8"))
            color = _bf.COLOR_DE_BARRA.get(_bf.tema_de_la_mision())
            if color:
                datos["theme_color"] = datos["background_color"] = color
            return JSONResponse(
                datos,
                media_type="application/manifest+json",
                headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
            )

    return JSONResponse({"status": "missing_manifest"}, status_code=404)

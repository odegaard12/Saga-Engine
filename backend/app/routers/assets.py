"""Iconos, manifiesto y marcas de la aplicación.

Primera tajada de sacar las rutas de `main.py`, que tenía 2 270 líneas y 32
rutas mezcladas con toda la lógica del juego. Se empieza por éstas porque son
las más independientes: no tocan la partida, ni la sesión, ni la base de datos.
Sólo buscan un fichero en dos sitios y lo devuelven.

Dónde buscan, y por qué en ese orden: primero en el build del frontend
(`frontend/dist`), que es lo que se sirve en producción, y si no está, en
`frontend/public`, que es lo que hay en desarrollo antes de compilar.
"""
import os
import re
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse

router = APIRouter()

# Sin caché para los iconos: son pocos kilobytes y cambian con la marca. Que un
# navegador se quede con un icono viejo un año es más molesto que volver a
# pedirlo.
SIN_CACHE = {"Cache-Control": "no-cache, max-age=0"}


# Los modelos de los avatares 3D (Mixamo) NO están en el repositorio ni en la imagen: su licencia
# no permite redistribuirlos. Se copian a las Pis (scripts/desplegar_avatares.ps1) y se montan en
# el contenedor (`-v /home/odegaard12/saga_avatares:/app/avatares:ro`). Los nombres llevan la
# huella del contenido, así que se pueden guardar para siempre.
_NOMBRE_DE_AVATAR = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(glb|webp)$")
_TIPO_DE_AVATAR = {"glb": "model/gltf-binary", "webp": "image/webp"}
_CACHE_PARA_SIEMPRE = {"Cache-Control": "public, max-age=31536000, immutable"}


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
async def activo_de_avatar(nombre: str):
    """Un modelo, animación o retrato de los avatares. 404 si no está: la app sigue sin él."""
    if not _NOMBRE_DE_AVATAR.match(nombre):
        return JSONResponse({"status": "error", "detail": "nombre no válido"}, status_code=404)
    fichero = carpeta_de_avatares() / nombre
    if not fichero.is_file():
        return JSONResponse({"status": "error", "detail": "%s not found" % nombre}, status_code=404)
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
            return FileResponse(
                candidato,
                media_type="application/manifest+json",
                headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
            )

    return JSONResponse({"status": "missing_manifest"}, status_code=404)

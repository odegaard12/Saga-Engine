"""Iconos, manifiesto y marcas de la aplicación.

Primera tajada de sacar las rutas de `main.py`, que tenía 2 270 líneas y 32
rutas mezcladas con toda la lógica del juego. Se empieza por éstas porque son
las más independientes: no tocan la partida, ni la sesión, ni la base de datos.
Sólo buscan un fichero en dos sitios y lo devuelven.

Dónde buscan, y por qué en ese orden: primero en el build del frontend
(`frontend/dist`), que es lo que se sirve en producción, y si no está, en
`frontend/public`, que es lo que hay en desarrollo antes de compilar.
"""
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, JSONResponse

router = APIRouter()

# Sin caché para los iconos: son pocos kilobytes y cambian con la marca. Que un
# navegador se quede con un icono viejo un año es más molesto que volver a
# pedirlo.
SIN_CACHE = {"Cache-Control": "no-cache, max-age=0"}


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

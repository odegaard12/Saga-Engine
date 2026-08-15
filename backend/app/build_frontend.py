"""Dónde está el frontend compilado, y qué versión corre.

Todo esto vivía suelto en `main.py`, entre la lógica del juego. No tiene nada
que ver con la partida: son rutas de ficheros y la etiqueta de la versión, y lo
usan los tres routers que sirven páginas y estáticos.

Sacarlo aquí quita cinco símbolos de la superficie que los routers piden a
`main`, que son 77 y hay que ir bajándolos uno a uno para poder romper el
import circular.
"""
import os
import subprocess
from pathlib import Path

from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

# La raíz del proyecto: este fichero está en backend/app/, así que dos arriba.
APP_DIR = Path(__file__).resolve().parent.parent.parent

REACT_DIST_DIR = APP_DIR / "frontend" / "dist"
REACT_INDEX_FILE = REACT_DIST_DIR / "index.html"
REACT_ASSETS_DIR = REACT_DIST_DIR / "assets"
REACT_MANIFEST_FILE = REACT_DIST_DIR / "manifest.webmanifest"
REACT_PUBLIC_MANIFEST_FILE = APP_DIR / "frontend" / "public" / "manifest.webmanifest"

# Sin caché en lo que decide qué versión ve el jugador. Los ficheros de
# /assets/ llevan su hash en el nombre y ésos sí se cachean para siempre.
SIN_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}


def saga_asset_file_response(filename: str, media_type: str):
    """Un fichero del frontend, esté compilado o no.

    Primero en el build, que es lo que se sirve en producción; si no, en
    `frontend/public`, que es lo que hay en desarrollo antes de compilar.
    """
    for candidato in (REACT_DIST_DIR / filename, APP_DIR / "frontend" / "public" / filename):
        if candidato.exists():
            return FileResponse(candidato, media_type=media_type, headers=SIN_CACHE)

    return JSONResponse(
        {"status": "error", "message": "%s not found" % filename}, status_code=404
    )


def tema_de_la_mision() -> str:
    """La clase de tema que lleva esta misión, para el `<body>`.

    Se pregunta al servidor porque la configuración es suya. Si algo falla se
    devuelve cadena vacía y la página sale sin clase: los valores por defecto
    del CSS son los de siempre, así que no se rompe nada.
    """
    try:
        import main

        tema = main.normalize_player_theme((main.load_config() or {}).get("player_theme"))
        limpio = "".join(c for c in str(tema) if c.isalnum() or c == "-")
        return "theme-%s" % limpio if limpio else ""
    except Exception:
        return ""


def react_index_or_missing():
    """La aplicación, o una página que explica que falta compilarla.

    La página sale del servidor CON EL TEMA PUESTO en el `<body>`.

    Antes se entregaba el fichero tal cual y la clase la ponía JavaScript al
    arrancar. Eso dejaba un hueco: la pantalla de carga -el anillo y la barra de
    "Primera vez: se guarda el mapa"- se pinta antes de que exista ninguna
    configuración, así que salía siempre con los colores por defecto dijera lo
    que dijera la misión. Y cuando por fin llegaba el tema, se veía cambiar: el
    parpadeo.

    Poniéndolo aquí no hay ningún instante sin tema.
    """
    if REACT_INDEX_FILE.exists():
        html = REACT_INDEX_FILE.read_text(encoding="utf-8")
        clase = tema_de_la_mision()

        if clase:
            if "<body" in html and 'class="' not in html.split("<body", 1)[1][:120]:
                html = html.replace("<body", '<body class="%s"' % clase, 1)

        return HTMLResponse(
            html,
            headers={**SIN_CACHE, "Pragma": "no-cache", "Expires": "0"},
        )

    return HTMLResponse(
        """
        <!doctype html>
        <html>
          <head><title>Falta compilar el frontend de SAGA</title></head>
          <body style="font-family: system-ui; padding: 24px;">
            <h1>Falta compilar el frontend</h1>
            <p>Ejecuta <code>cd frontend &amp;&amp; npm run build</code> y vuelve a arrancar.</p>
          </body>
        </html>
        """,
        status_code=503,
    )


def _leer_env_de_build() -> dict:
    """Lo que dejó escrito el despliegue, si dejó algo.

    Formato CLAVE=valor, una por línea. Manda sobre las variables de entorno
    porque refleja el despliegue de verdad: las del contenedor pueden haberse
    quedado con el valor del día que se creó.
    """
    valores: dict[str, str] = {}

    try:
        fichero = APP_DIR / ".saga_build_env"
        if fichero.exists():
            for linea in fichero.read_text().splitlines():
                if "=" in linea:
                    clave, _, valor = linea.partition("=")
                    valores[clave.strip()] = valor.strip()
    except OSError:
        pass

    return valores


def get_runtime_version_payload():
    """Qué versión está corriendo. Lo pide el móvil para saber si hay una nueva."""
    del_build = _leer_env_de_build()

    def leer(clave: str, defecto: str = "") -> str:
        return del_build.get(clave, "").strip() or os.getenv(clave, "").strip() or defecto

    version = leer("SAGA_VERSION")
    if not version:
        try:
            version = (APP_DIR / "VERSION").read_text().strip()
        except OSError:
            version = "dev"

    commit = leer("SAGA_COMMIT", "unknown")
    if commit == "unknown":
        try:
            resultado = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=str(APP_DIR),
                capture_output=True,
                text=True,
                timeout=2,
            )
            if resultado.returncode == 0:
                commit = resultado.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            pass

    return {
        "status": "ok",
        "version": version or "dev",
        "commit": commit or "unknown",
        "built_at": leer("SAGA_BUILD_TIME"),
    }

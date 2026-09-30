"""La clave con la que se firman los pases de jugador, guardada en un fichero.

Sin `SECRET_KEY` en el entorno (producción no la tiene), los pases se firmaban
con `sal:hash` de la contraseña del administrador. Cambiar esa contraseña en
plena ruta invalidaba el pase de TODOS los jugadores: un 403 en cada avance
(caza de fallos S18).

Ahora, mientras no haya `SECRET_KEY`, la clave vive en un fichero del directorio
de datos que se crea UNA vez con el valor que ya estaba en uso -el `sal:hash`
del momento-. Así los pases y las cookies que ya llevan los móviles siguen
valiendo, y a partir de ahí cambiar la contraseña del administrador no toca a
los jugadores.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time

_log = logging.getLogger("saga.security")
_LOCK = threading.RLock()
_CACHE: dict[str, tuple[tuple[int, int], str]] = {}


def leer_clave(ruta: str) -> str | None:
    """La clave guardada, o None si no hay fichero o no es válido."""
    try:
        estado = os.stat(ruta)
    except OSError:
        return None

    firma = (estado.st_mtime_ns, estado.st_size)
    en_cache = _CACHE.get(ruta)
    if en_cache and en_cache[0] == firma:
        return en_cache[1]

    try:
        with open(ruta, "r", encoding="utf-8") as f:
            datos = json.loads(f.read())
    except (OSError, ValueError):
        return None

    clave = datos.get("key") if isinstance(datos, dict) else None
    if not isinstance(clave, str) or not clave.strip():
        return None

    with _LOCK:
        _CACHE[ruta] = (firma, clave)
    return clave


def crear_clave(ruta: str, valor_inicial: str, origen: str) -> str:
    """Guarda `valor_inicial` como clave si NO había ya una, y devuelve la que rija.

    La creación es exclusiva: si dos procesos (o dos hilos) llegan a la vez,
    gana el primero y el otro lee la suya. Si el directorio no admite escritura
    devuelve `valor_inicial` sin guardarlo (es lo que se hacía antes).
    """
    existente = leer_clave(ruta)
    if existente:
        return existente

    contenido = json.dumps(
        {"key": valor_inicial, "origin": origen, "created_at": int(time.time())},
        ensure_ascii=False,
    )

    with _LOCK:
        existente = leer_clave(ruta)
        if existente:
            return existente

        carpeta = os.path.dirname(ruta) or "."
        temporal = None
        try:
            os.makedirs(carpeta, exist_ok=True)
            descriptor, temporal = tempfile.mkstemp(prefix=".session_key.", suffix=".tmp", dir=carpeta)
            with os.fdopen(descriptor, "w", encoding="utf-8") as f:
                f.write(contenido)
                f.flush()
                os.fsync(f.fileno())
            try:
                os.link(temporal, ruta)  # falla si ya existe: creación exclusiva
            except FileExistsError:
                pass
            except OSError:
                # Sin enlaces duros (algunos sistemas de ficheros): a la antigua.
                if not os.path.exists(ruta):
                    os.replace(temporal, ruta)
                    temporal = None
        except OSError as error:
            _log.warning("no se pudo guardar la clave de sesión en %s: %s", ruta, error)
            return valor_inicial
        finally:
            if temporal and os.path.exists(temporal):
                try:
                    os.unlink(temporal)
                except OSError:
                    pass

    return leer_clave(ruta) or valor_inicial

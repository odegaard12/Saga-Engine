"""La clave con la que se firman los pases de jugador, guardada en un fichero.

Sin `SECRET_KEY` en el entorno (producción no la tiene), los pases se firmaban
con `sal:hash` de la contraseña del administrador. Cambiar esa contraseña en
plena ruta invalidaba el pase de TODOS los jugadores: un 403 en cada avance
(caza de fallos S18).

Desde entonces, mientras no haya `SECRET_KEY`, la clave vive en un fichero del
directorio de datos y cambiar la contraseña del administrador no toca a los
jugadores.

23/11 (auditoría de seguridad, B3): ese fichero se creaba con el valor que ya
estaba en uso -el `sal:hash` del momento-, así que la clave de firma seguía
siendo algo derivado del fichero de la contraseña del panel: quien llegase a
leer `admin_auth` podía firmar pases de jugador y cookies de misión. Ahora la
clave es aleatoria (`nueva_clave`) y un fichero creado a la antigua (origen
`ORIGEN_DERIVADO`) se cambia por una aleatoria la primera vez que se lee.

Migración, a propósito la simple: NO se siguen aceptando los pases firmados con
la clave vieja. La primera vez que arranca esta versión, los pases de jugador,
la cookie de la clave de misión y la del dispositivo del panel dejan de valer UNA
vez: cada móvil vuelve a entrar (clave de misión y, si hay, su PIN). Aceptar las
dos claves durante una semana dejaba abierta esa semana justo lo que se cierra.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import tempfile
import threading
import time

_log = logging.getLogger("saga.security")
_LOCK = threading.RLock()
_CACHE: dict[str, tuple[tuple[int, int], str]] = {}
#: Clave de este proceso cuando el fichero no se puede escribir: la misma en cada llamada (no una aleatoria cada vez).
_SIN_FICHERO: dict[str, str] = {}

#: El `origin` de los ficheros creados antes del 23/11 con el `sal:hash` de la contraseña del panel.
ORIGEN_DERIVADO = "admin-hash-al-crearse"


def nueva_clave() -> str:
    """Una clave de firma aleatoria (384 bits)."""
    return secrets.token_urlsafe(48)


def _escribir(ruta: str, contenido: str) -> None:
    """Sustituye el fichero de una vez (temporal + rename)."""
    carpeta = os.path.dirname(ruta) or "."
    descriptor, temporal = tempfile.mkstemp(prefix=".session_key.", suffix=".tmp", dir=carpeta)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as f:
            f.write(contenido)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporal, ruta)
    finally:
        if os.path.exists(temporal):
            os.unlink(temporal)


def _independizar(ruta: str, datos: dict) -> dict:
    """Si el fichero guarda la clave derivada de la contraseña del panel, lo cambia por una aleatoria (ver arriba)."""
    if datos.get("origin") != ORIGEN_DERIVADO:
        return datos
    nuevos = {"key": nueva_clave(), "origin": "aleatoria-tras-derivada", "created_at": int(time.time())}
    try:
        _escribir(ruta, json.dumps(nuevos, ensure_ascii=False))
    except OSError as error:
        _log.warning("no se pudo independizar la clave de sesión de %s: %s", ruta, error)
        return datos
    _log.warning("clave de sesión independizada de la contraseña del panel: los jugadores vuelven a entrar una vez")
    return nuevos


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

    with _LOCK:
        try:
            with open(ruta, "r", encoding="utf-8") as f:
                datos = json.loads(f.read())
        except (OSError, ValueError):
            return None

        if isinstance(datos, dict) and datos.get("origin") == ORIGEN_DERIVADO:
            datos = _independizar(ruta, datos)
            try:
                estado = os.stat(ruta)
                firma = (estado.st_mtime_ns, estado.st_size)
            except OSError:
                pass

        clave = datos.get("key") if isinstance(datos, dict) else None
        if not isinstance(clave, str) or not clave.strip():
            return None

        _CACHE[ruta] = (firma, clave)
    return clave


def crear_clave(ruta: str, valor_inicial: str, origen: str) -> str:
    """Guarda `valor_inicial` como clave si NO había ya una, y devuelve la que rija.

    La creación es exclusiva: si dos procesos (o dos hilos) llegan a la vez,
    gana el primero y el otro lee la suya. Si el directorio no admite escritura
    devuelve `valor_inicial` sin guardarlo, y el mismo en cada llamada de este
    proceso (los pases duran entonces lo que dure el proceso).
    """
    existente = leer_clave(ruta) or _SIN_FICHERO.get(ruta)
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
            return _SIN_FICHERO.setdefault(ruta, valor_inicial)
        finally:
            if temporal and os.path.exists(temporal):
                try:
                    os.unlink(temporal)
                except OSError:
                    pass

    return leer_clave(ruta) or _SIN_FICHERO.setdefault(ruta, valor_inicial)

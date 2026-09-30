"""Recuerda qué ficheros SQLite ya tienen su esquema creado en ESTE proceso.

Cada lectura de `saga.sqlite3` empezaba por «asegurar el esquema»: abrir una
conexión, `BEGIN; INSERT ... ON CONFLICT DO UPDATE; COMMIT` y once `CREATE ...
IF NOT EXISTS`. Es decir, una ESCRITURA con fsync antes de leer una fila. Un
latido con la tabla del equipo hacía 14-15 así (caza de fallos del 30/09/2026,
S1) y todo corría en el bucle de eventos.

El esquema sólo hay que crearlo una vez por fichero y proceso. La huella del
fichero (dispositivo + inodo) hace que un fichero borrado y recreado -un test,
una restauración de copia- vuelva a inicializarse: la caché no se fía de la
ruta sola.
"""
from __future__ import annotations

import os
import threading

_LOCK = threading.Lock()
_LISTOS: dict[tuple[str, str], tuple] = {}


def _huella(ruta: str):
    try:
        estado = os.stat(ruta)
    except OSError:
        return None
    return (estado.st_dev, estado.st_ino)


def esta_listo(espacio: str, ruta: str) -> bool:
    """¿Este fichero ya tiene creado el esquema `espacio` en este proceso?"""
    clave = (espacio, os.path.abspath(ruta))
    huella = _huella(clave[1])
    return huella is not None and _LISTOS.get(clave) == huella


def marcar_listo(espacio: str, ruta: str) -> None:
    clave = (espacio, os.path.abspath(ruta))
    huella = _huella(clave[1])
    if huella is None:
        return
    with _LOCK:
        _LISTOS[clave] = huella


def olvidar(espacio: str | None = None, ruta: str | None = None) -> None:
    """Sólo para tests: fuerza a volver a crear el esquema."""
    with _LOCK:
        if espacio is None and ruta is None:
            _LISTOS.clear()
            return
        destino = os.path.abspath(ruta) if ruta else None
        for clave in list(_LISTOS):
            if (espacio is None or clave[0] == espacio) and (destino is None or clave[1] == destino):
                _LISTOS.pop(clave, None)

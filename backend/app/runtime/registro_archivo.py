"""Registro en fichero que sobrevive a los despliegues.

`docker logs` se pierde al recrear el contenedor (6.2.2 arrancó con el log en blanco). Aquí los avisos de la
familia `saga.*` (almacén, seguridad, admin, antitrampas, errores 5xx, rechazos de sincronización) van también a
`<datos>/logs/saga-eventos.log`, rotado: 512 KB x 4 ficheros (~2 MB como máximo). Sin cuerpos, sin coordenadas,
sin códigos: sólo qué pasó, dónde y a quién (nombre de jugador, que ya está en los datos del juego).
"""
import logging
import os
from logging.handlers import RotatingFileHandler

TOPE_BYTES = 512 * 1024
COPIAS = 4
_NOMBRE = "saga-eventos.log"


def instalar(data_dir):
    """Cuelga el fichero rotado del logger `saga` (idempotente). Un fallo de disco no tumba la app."""
    raiz = logging.getLogger("saga")
    if any(getattr(h, "_saga_archivo", False) for h in raiz.handlers):
        return None
    try:
        carpeta = os.path.join(str(data_dir), "logs")
        os.makedirs(carpeta, exist_ok=True)
        h = RotatingFileHandler(
            os.path.join(carpeta, _NOMBRE), maxBytes=TOPE_BYTES, backupCount=COPIAS, encoding="utf-8", delay=True
        )
    except OSError:
        return None
    h._saga_archivo = True
    h.setLevel(logging.WARNING)
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    raiz.addHandler(h)
    if raiz.level in (logging.NOTSET,) or raiz.level > logging.WARNING:
        raiz.setLevel(logging.WARNING)
    return h

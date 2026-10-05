"""¿Es esto una imagen de verdad? Por su contenido, no por lo que dice ser.

Las fotos llegan como `data:image/jpeg;base64,...` y hasta ahora se creía al
tipo de la cabecera: un SVG con `<script>` o una página HTML con la cabecera
`image/png` se guardaba y luego se servía desde el MISMO origen que la app. Con
`X-Content-Type-Options: nosniff` el navegador no la ejecuta servida como
imagen, pero el tipo con el que se sirve sale de la cabecera que mandó quien la
subió: con `data:text/html` o `image/svg+xml` sí se ejecutaba.

Aquí se decide el tipo por los primeros bytes (la «firma») y, si Pillow está,
se comprueba además que Pillow la reconoce como ESE formato. Sólo JPEG, PNG y
WebP: nada de SVG (es XML con scripts), GIF ni HTML.
"""
from __future__ import annotations

import base64
import binascii
import io
import warnings

try:  # Pillow es opcional en algunos entornos de prueba.
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

TIPOS_PERMITIDOS = ("image/jpeg", "image/png", "image/webp")

_FORMATO_DE_PILLOW = {"JPEG": "image/jpeg", "MPO": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def tipo_por_firma(datos: bytes) -> str | None:
    """El tipo real según los primeros bytes, o None si no es JPEG/PNG/WebP."""
    if not isinstance(datos, (bytes, bytearray)) or len(datos) < 12:
        return None
    if datos[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if datos[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "image/webp"
    return None


def tipo_real(datos: bytes) -> str | None:
    """Firma + Pillow (si está): el tipo verificado, o None si no es una imagen.

    Pillow sólo lee la cabecera (no decodifica la imagen entera); una bomba de
    descompresión no se resuelve aquí (ver `_comprobar_pixeles` en field_proofs).
    """
    por_firma = tipo_por_firma(datos)
    if por_firma is None:
        return None
    if Image is None:
        return por_firma
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with Image.open(io.BytesIO(bytes(datos))) as imagen:
                formato = _FORMATO_DE_PILLOW.get(str(imagen.format or "").upper())
                ancho, alto = imagen.size
    except Exception as error:
        # Demasiados píxeles: es una imagen (la decisión de tamaño es de otro).
        if Image is not None and isinstance(error, getattr(Image, "DecompressionBombError", ())):
            return por_firma
        return None
    if formato != por_firma or ancho <= 0 or alto <= 0:
        return None
    return formato


def decodificar_data_url_de_imagen(dato: str) -> tuple[str, bytes] | None:
    """(tipo real, bytes) de un `data:` URL de imagen en base64, o None.

    Lo declarado en la cabecera da igual: manda el contenido.
    """
    texto = str(dato or "").strip()
    if not texto.startswith("data:") or "," not in texto:
        return None
    cabecera, cuerpo = texto.split(",", 1)
    if ";base64" not in cabecera.lower():
        return None
    try:
        crudo = base64.b64decode(cuerpo, validate=False)
    except (binascii.Error, ValueError):
        return None
    tipo = tipo_real(crudo)
    if tipo is None:
        return None
    return tipo, crudo

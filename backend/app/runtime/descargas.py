"""Cabeceras de descarga que no rompen con un nombre raro.

`Content-Disposition: attachment; filename="{nombre}"` con el nombre de un
jugador dentro daba un 500 si el nombre tenía una tilde o una `ñ` (las cabeceras
HTTP van en latin-1) y se rompía con una comilla. La forma buena es RFC 6266 /
RFC 5987: un `filename` ASCII de reserva y un `filename*` en UTF-8 codificado
(caza de fallos A17/S15).
"""
from __future__ import annotations

import re
import unicodedata
from urllib.parse import quote


def nombre_ascii_seguro(nombre: str, por_defecto: str = "descarga") -> str:
    """El nombre pasado a ASCII sin comillas, barras, saltos de línea ni control."""
    texto = unicodedata.normalize("NFKD", str(nombre or ""))
    texto = texto.encode("ascii", "ignore").decode("ascii")
    texto = re.sub(r"[^A-Za-z0-9._-]+", "_", texto).strip("._-")
    return texto[:120] or por_defecto


def contenido_adjunto(nombre: str, extension: str = "", por_defecto: str = "descarga") -> str:
    """El valor de `Content-Disposition` para descargar `nombre` + `extension`."""
    extension = str(extension or "").strip().lstrip(".")
    sufijo = f".{extension}" if extension else ""

    reserva = nombre_ascii_seguro(nombre, por_defecto) + sufijo
    limpio = re.sub(r"[\x00-\x1f\x7f\"\\/]+", "_", str(nombre or "")).strip() or por_defecto
    completo = (limpio + sufijo)[:200]

    return f"attachment; filename=\"{reserva}\"; filename*=UTF-8''{quote(completo, safe='')}"

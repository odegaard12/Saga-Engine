"""Leer lo que llega del cliente sin que una entrada absurda dé un 500.

Caza de fallos del 30/09/2026 (S6): `/api/advance` con `penalty_ms: Infinity`,
`code: 5` o un cuerpo que es una lista respondía 500 ANTES de comprobar la
sesión; `level_before: Infinity` tumbaba `/api/events/sync` entero y la cola del
jugador se quedaba atascada para siempre. Las causas eran tres:

- `json.loads` acepta `Infinity` y `NaN` (no son JSON, pero Python los traga),
  y `int(inf)` lanza `OverflowError`, que ningún `except` esperaba;
- un cuerpo que no es un objeto (`[]`, `5`, `"x"`) llegaba a `data.get(...)`;
- `1e999` se decodifica como `inf` sin pasar por las constantes.

Todo se arregla en la entrada: el JSON se lee con las constantes no finitas
convertidas en `null`, y un cuerpo que no es un objeto es un 400 limpio.
"""
from __future__ import annotations

import json
import math
from typing import Any

from fastapi import HTTPException, Request


def _sin_constantes(nombre: str) -> None:
    # NaN, Infinity, -Infinity: no son JSON válido; se leen como null.
    return None


def _flotante_finito(texto: str) -> float | None:
    try:
        valor = float(texto)
    except (ValueError, OverflowError):
        return None
    return valor if math.isfinite(valor) else None


def cargar_json(crudo: bytes | str) -> Any:
    """`json.loads` sin `NaN`/`Infinity`: los sustituye por `None`."""
    return json.loads(
        crudo,
        parse_constant=_sin_constantes,
        parse_float=_flotante_finito,
    )


async def leer_cuerpo_acotado(request: Request, max_bytes: int) -> bytes:
    """El cuerpo entero, pero sin leer más de `max_bytes` (413 si se pasa).

    Se mira `Content-Length` ANTES de leer nada; y si el cliente no lo declara
    (`Transfer-Encoding: chunked`) se corta en cuanto el acumulado se pasa, en
    vez de tragarse el cuerpo entero para luego decir que era demasiado grande.
    """
    declarado = request.headers.get("content-length")
    if declarado is not None:
        try:
            if int(declarado) > max_bytes:
                raise HTTPException(status_code=413, detail="request body too large")
        except ValueError:
            pass

    trozos: list[bytes] = []
    total = 0
    async for trozo in request.stream():
        total += len(trozo)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail="request body too large")
        trozos.append(trozo)
    return b"".join(trozos)


async def leer_cuerpo_json(
    request: Request, *, obligatorio_dict: bool = True, max_bytes: int | None = None
) -> Any:
    """El cuerpo de la petición como objeto JSON, o un 400.

    Un cuerpo vacío, roto o que no es un objeto no es un error del servidor.
    """
    try:
        crudo = await (leer_cuerpo_acotado(request, max_bytes) if max_bytes else request.body())
        # Un cuerpo vacío es «sin datos», no un JSON roto: hay rutas del panel que
        # se llaman sin cuerpo.
        datos = cargar_json(crudo) if crudo and crudo.strip() else {}
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise HTTPException(status_code=400, detail="invalid JSON body")

    if obligatorio_dict and not isinstance(datos, dict):
        raise HTTPException(status_code=400, detail="invalid JSON body")
    return datos


def entero_seguro(valor: Any, defecto: int | None = None, *, minimo: int | None = None, maximo: int | None = None) -> int | None:
    """`int(valor)` que nunca lanza: basura, `inf`, `nan` y booleanos dan `defecto`."""
    if isinstance(valor, bool) or valor is None:
        return defecto
    try:
        if isinstance(valor, float) and not math.isfinite(valor):
            return defecto
        numero = int(valor)
    except (TypeError, ValueError, OverflowError):
        return defecto

    if minimo is not None and numero < minimo:
        numero = minimo
    if maximo is not None and numero > maximo:
        numero = maximo
    return numero


def texto_seguro(valor: Any, maximo: int = 500) -> str:
    """El valor como texto recortado; lo que no es texto ni número da ''."""
    if isinstance(valor, str):
        return valor.strip()[:maximo]
    if isinstance(valor, bool) or valor is None:
        return ""
    if isinstance(valor, (int, float)) and not (isinstance(valor, float) and not math.isfinite(valor)):
        return str(valor)[:maximo]
    return ""


def numero_finito(valor: Any, defecto: float | None = None) -> float | None:
    if isinstance(valor, bool) or valor is None:
        return defecto
    try:
        numero = float(valor)
    except (TypeError, ValueError, OverflowError):
        return defecto
    return numero if math.isfinite(numero) else defecto

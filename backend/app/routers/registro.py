"""Registro para analizar partidas: errores del móvil y «Exportar partida».

- `POST /api/client-errors`: el móvil (jugador o panel) manda errores de JS y
  fallos de red relevantes. Sin sesión también vale (un error puede pasar antes
  de entrar), pero con límite de ritmo y de tamaño, y sin guardar ni la IP ni el
  agente de usuario entero (ver runtime/registro_analisis.py).
- `POST /api/admin/partida/resumen`: recuentos para el panel.
- `POST|GET /api/admin/partida/exportar`: el ZIP (ver runtime/exportar_partida.py).
  El GET existe para bajarlo con `curl` y la cookie de la sesión de admin.
  Siempre `Cache-Control: no-store`: lleva nombres y posiciones de personas.
"""
from __future__ import annotations

import json
import os
import tempfile
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from backend.app.runtime import descargas as _descargas
from backend.app.runtime import entradas as _entradas
from backend.app.runtime import exportar_partida as _exportar
from backend.app.runtime import registro_analisis as _registro
from backend.app.runtime.core_engine import _as_bool

router = APIRouter()

SIN_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
}


def instalar(app) -> None:
    """Engancha el registro de errores del servidor a la aplicación.

    Un manejador para `Exception`: Starlette lo usa SÓLO para lo que nada más
    ha capturado (lo que antes era un 500 sin rastro). Responde lo mismo que
    antes —un 500— pero deja la fila en `errores` para el análisis.
    """

    @app.exception_handler(Exception)
    async def _error_sin_capturar(request: Request, exc: Exception):
        await run_in_threadpool(_registro.registrar_error_servidor, request.method, request.url.path, exc)
        try:
            from backend.app.runtime.integraciones import avisos as _avisos

            _avisos.error_del_servidor(request.url.path)
        except Exception:  # noqa: BLE001 - el aviso no cambia la respuesta
            pass
        return JSONResponse(status_code=500, content={"status": "error", "detail": "internal_error"})


@router.post("/api/client-errors")
async def errores_del_cliente(request: Request):
    import main

    largo = int(request.headers.get("content-length") or 0)
    if largo > _registro.MAX_CUERPO_BYTES:
        raise HTTPException(status_code=413, detail="too large")
    cuerpo = await request.body()
    if len(cuerpo) > _registro.MAX_CUERPO_BYTES:
        raise HTTPException(status_code=413, detail="too large")
    try:
        data = json.loads(cuerpo or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid json")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="invalid body")

    # El nombre del jugador sólo si su sesión lo confirma: si no, cualquiera
    # podría llenar el registro a nombre de otro.
    usuario = ""
    pedido = _entradas.texto_seguro(data.get("user"), 120).strip()
    if pedido:
        try:
            main.require_player_session(request, pedido)
            usuario = main.get_player_profile(pedido).get("id") or pedido
        except HTTPException:
            usuario = ""

    remitente = _registro.huella(main.get_client_ip(request), 12)
    resultado = await run_in_threadpool(
        lambda: _registro.registrar_errores_cliente(
            data.get("errores"),
            usuario=str(usuario),
            remitente=remitente,
            app_version=_entradas.texto_seguro(data.get("app_version"), 40),
            agente=request.headers.get("user-agent") or "",
        )
    )
    # Versión de la app y dispositivo del jugador, en su línea de tiempo (una vez
    # cada 10 minutos como mucho): para saber con qué jugó cada uno.
    version = _entradas.texto_seguro(data.get("app_version"), 40)
    if usuario and version:
        ahora = time.time()
        if ahora - _ULTIMA_INFO.get(str(usuario), 0.0) >= INTERVALO_INFO_S:
            _ULTIMA_INFO[str(usuario)] = ahora
            main.match_log_record(
                "client_info",
                str(usuario),
                payload={
                    "app_version": version,
                    "dispositivo": _registro.resumir_agente(request.headers.get("user-agent")),
                    "en_linea": True,
                },
            )
    return {"status": "ok", **resultado}


#: user -> última vez que se anotó su versión/dispositivo.
_ULTIMA_INFO: dict[str, float] = {}
INTERVALO_INFO_S = 600.0


async def _puerta(request: Request, data: dict):
    import main
    from backend.app.routers import admin as _admin

    if not await _admin._autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "forbidden"}, headers=SIN_CACHE)
    if (bloqueo := _admin._clave_por_cambiar(main)):
        return bloqueo
    return None


@router.post("/api/admin/partida/resumen")
async def resumen_de_partida(request: Request):
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if (error := await _puerta(request, data)):
        return error
    datos = await run_in_threadpool(_exportar.resumen_rapido, main)
    return JSONResponse(datos, headers=SIN_CACHE)


def _borrar(ruta: str) -> None:
    try:
        os.unlink(ruta)
    except OSError:
        pass


async def _exportar_zip(request: Request, anonimizar: bool):
    import main

    descriptor, ruta = tempfile.mkstemp(prefix="saga-partida-", suffix=".zip")
    os.close(descriptor)
    origen = f"{request.url.scheme}://{request.url.netloc}"
    try:
        await run_in_threadpool(lambda: _exportar.generar(main, ruta, anonimizar=anonimizar, origen=origen))
    except Exception:
        _borrar(ruta)
        raise
    _registro.auditar(request, "exportar_partida", detalle={"anonimizar": anonimizar})
    nombre = f"saga-partida-{datetime.now().strftime('%Y%m%d-%H%M')}{'-anonima' if anonimizar else ''}"
    return FileResponse(
        ruta,
        media_type="application/zip",
        headers={**SIN_CACHE, "Content-Disposition": _descargas.contenido_adjunto(nombre, "zip", "saga-partida")},
        background=BackgroundTask(_borrar, ruta),
    )


@router.post("/api/admin/partida/exportar")
async def exportar_partida_post(request: Request):
    data = await _entradas.leer_cuerpo_json(request)
    if (error := await _puerta(request, data)):
        return error
    return await _exportar_zip(request, _as_bool(data.get("anonimizar")))


@router.get("/api/admin/partida/exportar")
async def exportar_partida_get(request: Request, anonimizar: str = "0"):
    if (error := await _puerta(request, {})):
        return error
    return await _exportar_zip(request, _as_bool(anonimizar))

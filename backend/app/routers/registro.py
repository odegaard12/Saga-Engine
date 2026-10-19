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

import gzip
import json
import os
import tempfile
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from backend.app.runtime import bitacora as _bitacora
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

    # Fase 2 (auditoría 15/10): tope por IP, para que nadie llene el registro a chorro.
    main.enforce_player_rate_limit("client_errors", request, "", main.CLIENT_ERRORS_RATE_LIMIT_MAX)
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


#: La caja negra llega comprimida (gzip): estos son los topes de lo comprimido y de lo que sale al descomprimir.
BITACORA_MAX_BYTES = 128 * 1024
BITACORA_MAX_DESCOMPRIMIDO = 1024 * 1024


@router.post("/api/bitacora")
async def caja_negra_del_movil(request: Request):
    """Un lote de la caja negra del móvil (ver runtime/bitacora.py). Contesta cuántas entradas puede olvidar el móvil."""
    import main

    largo = int(request.headers.get("content-length") or 0)
    if largo > BITACORA_MAX_BYTES:
        raise HTTPException(status_code=413, detail="too large")
    cuerpo = await request.body()
    if len(cuerpo) > BITACORA_MAX_BYTES:
        raise HTTPException(status_code=413, detail="too large")
    if "gzip" in (request.headers.get("content-encoding") or "").lower():
        try:
            descompresor = gzip.GzipFile(fileobj=__import__("io").BytesIO(cuerpo))
            cuerpo = descompresor.read(BITACORA_MAX_DESCOMPRIMIDO + 1)
        except (OSError, EOFError):
            raise HTTPException(status_code=400, detail="invalid gzip")
        if len(cuerpo) > BITACORA_MAX_DESCOMPRIMIDO:
            raise HTTPException(status_code=413, detail="too large")
    try:
        data = json.loads(cuerpo or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid json")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="invalid body")

    pedido = _entradas.texto_seguro(data.get("user"), 120).strip()
    main.require_player_session(request, pedido)
    main.enforce_player_rate_limit("bitacora", request, pedido, main.BITACORA_RATE_LIMIT_MAX)
    perfil = main.get_player_profile(pedido)
    usuario = str(perfil.get("id") or pedido)
    entradas = data.get("entries") if isinstance(data.get("entries"), list) else []
    filas = _bitacora.filas_del_lote(
        entradas,
        usuario=usuario,
        nombre=main.match_log_display_name(usuario, perfil),
        sesion=data.get("s"),
        client_sent_at_ms=data.get("client_sent_at_ms"),
        ahora_ms=int(time.time() * 1000),
    )
    # Fuera de la partida (sin hora de salida o antes de ella) no se guarda nada, pero se contesta igual: si no, el
    # móvil reintentaría para siempre lo que no se va a guardar.
    await run_in_threadpool(main.match_log_record_many, filas)
    return {"status": "ok", "aceptadas": min(len(entradas), _bitacora.MAX_ENTRADAS_POR_LOTE)}




@router.post("/api/admin/incidencias")
async def incidencias_de_la_app(request: Request):
    """Por jugador: lo que falló de la app o del servidor, el tiempo que se sugiere devolver y lo devuelto ya."""
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if (error := await _puerta(request, data)):
        return error

    def calcular():
        timers = main.load_player_timers()
        # UNA consulta para todos (sólo las filas `app_*`), agrupada aquí: antes era la línea de tiempo entera de cada
        # jugador, posiciones incluidas.
        por_jugador: dict[str, list] = {}
        for fila in main._match_log_store.list_entries(main.MATCH_LOG_DB, type_prefix="app_"):
            por_jugador.setdefault(str(fila.get("user") or ""), []).append(fila)
        salida = []
        for perfil in main.get_player_profiles():
            pid = str(perfil.get("id") or "")
            if not pid:
                continue
            analisis = _bitacora.analizar(por_jugador.get(pid, []))
            entrada = timers.get(pid) if isinstance(timers, dict) else None
            devuelto = int((entrada or {}).get("descuento_ms") or 0)
            if not (analisis["incidencias"] or analisis["sospechas"] or analisis["cuentas"] or devuelto):
                continue
            salida.append({"user": pid, "display_name": perfil.get("display_name") or pid, "devuelto_ms": devuelto, **analisis})
        return salida

    return JSONResponse({"status": "ok", "jugadores": await run_in_threadpool(calcular)}, headers=SIN_CACHE)


@router.post("/api/admin/devolver-tiempo")
async def devolver_tiempo(request: Request):
    """Fija el tiempo devuelto a un jugador por fallos de la app (0 lo quita). Queda en el Registro y en la auditoría."""
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if (error := await _puerta(request, data)):
        return error
    usuario = _entradas.texto_seguro(data.get("user"), 120).strip()
    # Sólo jugadores de verdad: `get_player_profile` se inventa un perfil para cualquier nombre.
    perfil = next((p for p in main.get_player_profiles() if usuario and str(p.get("id") or "") == usuario), None)
    if not perfil:
        raise HTTPException(status_code=404, detail="unknown player")
    try:
        ms = int(data.get("ms") or 0)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(status_code=400, detail="invalid ms")
    ms = max(0, min(ms, _bitacora.TOPE_TOTAL_MS))
    pid = str(perfil["id"])
    await run_in_threadpool(lambda: main._player_timers.poner_descuento(main.TIMERS_DB, pid, ms))
    main.match_log_record("time_returned", pid, payload={"devuelto_ms": ms}, profile=perfil)
    _registro.auditar(request, "devolver_tiempo", detalle={"user": pid, "ms": ms})
    return JSONResponse({"status": "ok", "user": pid, "devuelto_ms": ms}, headers=SIN_CACHE)


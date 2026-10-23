"""Integraciones con servicios de fuera (ver backend/app/runtime/integraciones/).

- `GET /api/tiempo`: el tiempo en la zona de la misión (público, sin datos de nadie).
- `GET /api/salud`: para la monitorización (Uptime Kuma o un vigilante). 200 si
  todo va, 503 si la base no responde, queda poco disco o falló una escritura
  del almacén en los últimos 10 minutos. Sin datos personales.
- `POST /api/admin/avisos`, `/guardar`, `/prueba`: los avisos por ntfy del panel.
"""
from __future__ import annotations

import os
import shutil
import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from backend.app.runtime import entradas as _entradas
from backend.app.runtime import mapa3d as _mapa3d
from backend.app.runtime import registro_analisis as _registro
from backend.app.runtime import teselas as _teselas
from backend.app.runtime.integraciones import avisos as _avisos
from backend.app.runtime.integraciones import tiempo as _tiempo

router = APIRouter()

SIN_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private"}
#: Por debajo de esto el disco cuenta como lleno: SQLite y las fotos dejan de escribirse.
DISCO_MINIMO_MB = 200
DISCO_MINIMO_PCT = 3.0
#: Un fallo de escritura del almacén pone /api/salud en 503 durante este rato.
ALMACEN_VENTANA_S = 10 * 60


def instalar(app) -> None:
    """Arranca el vigilante de jugadores sin señal (sólo con ntfy configurado)."""
    _avisos.arrancar_vigilante()


@router.get("/api/tiempo")
def tiempo():
    if (os.getenv("SAGA_TIEMPO") or "1").strip() == "0":
        return JSONResponse({"disponible": False}, headers=SIN_CACHE)
    caja = _teselas.caja_de_la_mision()
    if not caja:
        return JSONResponse({"disponible": False}, headers=SIN_CACHE)
    lat_min, lat_max, lon_min, lon_max = caja
    datos = _tiempo.tiempo_para((lat_min + lat_max) / 2, (lon_min + lon_max) / 2)
    return JSONResponse(datos, headers={"Cache-Control": "private, max-age=120"})


def _base_responde(main) -> bool:
    from backend.app.storage import runtime_store

    try:
        if runtime_store.resolve_runtime_backend() != "sqlite":
            return os.access(main.DATA_DIR, os.R_OK | os.W_OK)
        ruta = Path(runtime_store.resolve_runtime_db_path(main.STAGES_DB)).resolve()
        conexion = sqlite3.connect(ruta.as_uri() + "?mode=ro", uri=True, timeout=2)
        try:
            conexion.execute("select count(*) from sqlite_master").fetchone()
        finally:
            conexion.close()
        return True
    except (OSError, sqlite3.Error, ValueError):
        return False


def _peticion_de_dentro(request: Request) -> bool:
    """¿Viene de la propia Pi o de la red de casa (Docker, keepalived, el vigilante)?

    24/10/2026: https://sagagia.es/api/salud enseñaba a cualquiera la versión
    exacta, el disco y la fecha del mapa. Por el túnel de Cloudflare toda
    petición trae `CF-Connecting-IP`: eso es «de fuera». Sin ella, una IP
    privada o local es de dentro. Un nombre que no es IP (el cliente de los
    tests) cuenta como de dentro.
    """
    import ipaddress

    if request.headers.get("cf-connecting-ip"):
        return False
    host = request.client.host if request.client else ""
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True
    return ip.is_private or ip.is_loopback


@router.get("/api/salud")
def salud(request: Request):
    import main

    base = _base_responde(main)
    try:
        uso = shutil.disk_usage(main.DATA_DIR)
        libre_mb = uso.free // (1024 * 1024)
        libre_pct = round(100.0 * uso.free / uso.total, 1) if uso.total else 0.0
        disco = {"libre_mb": int(libre_mb), "total_mb": int(uso.total // (1024 * 1024)), "libre_pct": libre_pct}
        disco_ok = libre_mb >= DISCO_MINIMO_MB and libre_pct >= DISCO_MINIMO_PCT
    except OSError:
        disco, disco_ok = None, False
    mapa = _mapa3d.estado(main.DATA_DIR)
    almacen = _escritura_fallida_reciente()
    ok = base and disco_ok and almacen is None
    cuerpo = {
        "estado": "ok" if ok else "mal",
        "version": main.get_runtime_version_payload().get("version"),
        "base_de_datos": base,
        "disco": disco,
        "disco_ok": disco_ok,
        "mapa3d": {"preparado": bool(mapa.get("hay")), "preparado_el": mapa.get("built_at") or None},
        "hora": int(time.time()),
    }
    if almacen is not None:
        # Sólo cuando falla: con todo bien el cuerpo es el de siempre.
        cuerpo["almacen"] = almacen
    if not _peticion_de_dentro(request):
        # Desde internet basta saber si está bien o mal (el código ya lo dice).
        cuerpo = {"estado": cuerpo["estado"]}
    return JSONResponse(cuerpo, status_code=200 if ok else 503, headers=SIN_CACHE)


def _escritura_fallida_reciente():
    """Por qué el almacén está mal (último dato que no se pudo guardar), o None.

    Auditoría 23/10: /api/salud decía 200 con el disco dando EIO o un
    `game_timers.json` ilegible, porque sólo miraba SQLite y el espacio libre.
    Cuenta lo de los últimos `ALMACEN_VENTANA_S`; el candado ocupado no cuenta
    (pasa con carga y se cura solo). Sólo el nombre del fichero, nada de nadie.
    """
    from backend.app.storage import json_store

    fallo = json_store.storage_health().get("ultima_escritura_fallida")
    if not isinstance(fallo, dict) or time.time() - (fallo.get("cuando") or 0) > ALMACEN_VENTANA_S:
        return None
    return {
        "motivo": "escritura_fallida",
        "tipo": fallo.get("tipo"),
        "fichero": fallo.get("fichero"),
        "cuando": fallo.get("cuando"),
    }


async def _puerta(request: Request, data: dict):
    from backend.app.routers.registro import _puerta as puerta_admin

    return await puerta_admin(request, data)


def _estado(main) -> dict:
    config = _avisos.leer_config(main.DATA_DIR)
    url, tema, token = _avisos.destino()
    return {
        "status": "ok",
        "configurado": bool(url and tema),
        "con_token": bool(token),
        "activo": config["activo"],
        "tipos": config["tipos"],
    }


@router.post("/api/admin/avisos")
async def avisos_estado(request: Request):
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if (error := await _puerta(request, data)):
        return error
    return JSONResponse(_estado(main), headers=SIN_CACHE)


@router.post("/api/admin/avisos/guardar")
async def avisos_guardar(request: Request):
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if (error := await _puerta(request, data)):
        return error
    cambios = {"activo": data.get("activo") is True}
    if isinstance(data.get("tipos"), dict):
        cambios["tipos"] = data["tipos"]
    await run_in_threadpool(_avisos.guardar_config, main.DATA_DIR, cambios)
    _registro.auditar(request, "avisos_ntfy", detalle={"activo": cambios["activo"]})
    return JSONResponse(_estado(main), headers=SIN_CACHE)


@router.post("/api/admin/avisos/prueba")
async def avisos_prueba(request: Request):
    data = await _entradas.leer_cuerpo_json(request)
    if (error := await _puerta(request, data)):
        return error
    ok, detalle = await run_in_threadpool(_avisos.prueba)
    return JSONResponse({"status": "ok" if ok else "error", "detail": detalle}, headers=SIN_CACHE)

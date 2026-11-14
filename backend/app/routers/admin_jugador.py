"""Acciones del panel sobre UN jugador que no son de nivel o mochila: sumar o restar tiempo, y la foto por URL.

Pensado para cobertura mala (14/11): cada acción lleva un `op_id` (ver runtime/operaciones_admin.py), así que un
reintento tras una respuesta perdida no la repite, y la respuesta ya trae cómo ha quedado el jugador para que el
panel no tenga que volver a pedir la vista general entera.
"""
import base64
import hashlib

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response

from backend.app.routers.admin import (
    _auditar,
    _autorizado,
    _bajo_el_candado_del_jugador,
    _clave_por_cambiar,
    _PREFIJO_FOTO,
    estado_del_jugador,
)
from backend.app.runtime import entradas as _entradas
from backend.app.runtime import operaciones_admin as _operaciones
from backend.app.runtime.core_engine import _as_str

router = APIRouter()

#: Lo máximo que se suma o resta de una vez desde el panel (6 h, en segundos).
SEGUNDOS_MAXIMOS = 6 * 3600


def _aplicar_ajuste_una_vez(main, profile_id, segundos, motivo, op_id):
    previa = _operaciones.buscar(main.ADMIN_OPS_DB, op_id, profile_id, "ajuste_de_tiempo") if op_id else None
    if previa is not None:
        return {**previa, "repetida": True}
    r = main._player_timers.ajustar_tiempo_admin(main.TIMERS_DB, profile_id, segundos * 1000, op_id=op_id, motivo=motivo)
    resultado = {
        "status": "ok",
        "profile_id": profile_id,
        "action": "ajuste_de_tiempo",
        "pedido_ms": segundos * 1000,
        "aplicado_ms": r["aplicado_ms"],
        "ajuste_admin_ms": r["ajuste_admin_ms"],
        "total_time_ms": r["total_time_ms"],
    }
    if op_id:
        _operaciones.anotar(main.ADMIN_OPS_DB, op_id, profile_id, "ajuste_de_tiempo", resultado)
    return resultado


@router.post("/api/admin/jugador/tiempo")
async def admin_jugador_tiempo(request: Request):
    """Suma (`segundos` > 0) o resta (`segundos` < 0) tiempo al total de un jugador, a mano.

    `{profile_id, segundos, motivo?, op_id?}`. No toca su nivel: sigue donde iba, y el nuevo total llega al móvil y a la
    clasificación en el siguiente latido. El total nunca baja de 0. Con el mismo `op_id` repite el resultado sin sumar.
    """
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    profile_id = _as_str(data.get("profile_id")).strip()
    ids = {_as_str((p or {}).get("id")).strip() for p in main.get_player_profiles(main.load_config())}
    if not profile_id or profile_id not in ids:
        return JSONResponse(status_code=404, content={"status": "error", "detail": "unknown profile"})

    segundos = _entradas.entero_seguro(data.get("segundos"), 0, minimo=-SEGUNDOS_MAXIMOS, maximo=SEGUNDOS_MAXIMOS)
    if not segundos:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "segundos required"})
    motivo = _entradas.texto_seguro(data.get("motivo"), 120).strip()
    op_id = _operaciones.id_valido(data.get("op_id"))

    try:
        resultado = await run_in_threadpool(
            _bajo_el_candado_del_jugador, main, profile_id, _aplicar_ajuste_una_vez, main, profile_id, segundos, motivo, op_id
        )
    except _operaciones.OperacionReutilizada:
        return JSONResponse(status_code=409, content={"status": "error", "detail": "op_id reused"})
    if not resultado.get("repetida"):
        _auditar(
            request,
            "jugador:ajuste_de_tiempo",
            profile_id,
            {"segundos": segundos, "aplicado_ms": resultado.get("aplicado_ms"), **({"motivo": motivo} if motivo else {})},
        )
        perfil = main.resolve_known_player_profile(profile_id)
        main.match_log_record(
            "ajuste_de_tiempo",
            profile_id,
            payload={"segundos": segundos, "aplicado_ms": resultado.get("aplicado_ms"), "motivo": motivo},
            profile=perfil,
        )
    return {**resultado, **(await run_in_threadpool(estado_del_jugador, main, profile_id))}


def _bytes_de_foto(avatar: str):
    """(tipo, bytes) de una foto raster en data URI, o None."""
    texto = _as_str(avatar)
    if not texto.startswith("data:image/") or ";base64," not in texto:
        return None
    cabecera, _, cuerpo = texto.partition(";base64,")
    tipo = cabecera[len("data:"):].lower()
    if tipo == "image/jpg":
        tipo = "image/jpeg"
    if tipo not in ("image/jpeg", "image/png", "image/webp"):
        return None
    try:
        return tipo, base64.b64decode(cuerpo, validate=False)
    except (ValueError, TypeError):
        return None


@router.get(_PREFIJO_FOTO + "{perfil_id:path}")
async def admin_foto_de_jugador(perfil_id: str, request: Request):
    """La foto de un jugador como imagen cacheable. Solo con sesión de administrador (las caras no son públicas)."""
    import main

    if not await _autorizado(main, request, None):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "forbidden"})
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo
    pid = perfil_id.strip()  # FastAPI ya lo ha decodificado
    perfil = next(
        (p for p in main.get_player_profiles(main.load_config()) if _as_str((p or {}).get("id")).strip() == pid), None
    )
    foto = _bytes_de_foto((perfil or {}).get("avatar_url"))
    if not foto:
        return JSONResponse(status_code=404, content={"status": "error", "detail": "no photo"})
    tipo, cuerpo = foto
    etag = '"' + hashlib.sha1(cuerpo).hexdigest()[:16] + '"'
    cabeceras = {
        "ETag": etag,
        # La URL lleva la huella de la foto (`?v=`): si cambia la foto, cambia la URL. Privada: solo el navegador del admin.
        "Cache-Control": "private, max-age=31536000, immutable",
        "CDN-Cache-Control": "no-store",  # Cloudflare no guarda caras
        "X-Content-Type-Options": "nosniff",
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=cabeceras)
    return Response(content=cuerpo, media_type=tipo, headers=cabeceras)

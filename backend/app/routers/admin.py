import copy
import hashlib
import json
import logging
import math
import os
import re
import threading
import time
from urllib.parse import quote, unquote
from fastapi import APIRouter, Request, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from backend.app.runtime import caducidad_de_rastros as _caducidad_rastros
from backend.app.runtime import descargas as _descargas
from backend.app.runtime import entradas as _entradas
from backend.app.runtime import mission_schedule as _mission_schedule
from backend.app.runtime import nodos_cercanos as _nodos_cercanos
from backend.app.runtime import operaciones_admin as _operaciones
from backend.app.runtime import purga_datos as _purga
from backend.app.runtime import revisiones as _revisiones
from backend.app.runtime import teselas as _teselas
from backend.app.runtime.textos_por_defecto import TEXTOS_POR_DEFECTO
from backend.app.runtime.core_engine import _as_str, _as_bool, normalize_stage
from backend.app.runtime.game_registry import (
    DISPLAY_FAMILIES as REGISTRY_DISPLAY_FAMILIES,
    FAMILIES as REGISTRY_FAMILIES,
    GAME_ID_DISPLAY_FAMILY as REGISTRY_GAME_ID_DISPLAY_FAMILY,
    TYPE_DISPLAY_FAMILY_FALLBACK as REGISTRY_TYPE_DISPLAY_FAMILY_FALLBACK,
)
from backend.app.security import client_ip as _client_ip
from backend.app.security import peticiones as _peticiones
from backend.app.storage import json_store as _json_store

_log = logging.getLogger("saga.admin")
router = APIRouter()


# Agrupación de PRESENTACIÓN para el admin: las mismas 5 familias claras que
# frontend/src/admin/lib/displayFamilies.ts. Solo reordena cómo se cuentan y
# muestran los nodos en el panel; no cambia ningún "type"/game_id que viaje
# en datos de misión ni la family técnica que usa el runtime del jugador.
# Familias y mapas de presentación: salen de shared/game_registry.json (la misma
# fuente que el frontend, frontend/src/admin/lib/displayFamilies.ts), no de
# listas escritas aquí. Antes había dos copias a mano y un juego llegó a estar
# en «Movimiento» en el servidor y en «Desafío» en el admin.
DISPLAY_FAMILIES = REGISTRY_DISPLAY_FAMILIES
GAME_ID_DISPLAY_FAMILY = REGISTRY_GAME_ID_DISPLAY_FAMILY
# Cuando el nodo no lleva game_id (nodos viejos), se agrupa por su family
# técnica.
TYPE_DISPLAY_FAMILY_FALLBACK = REGISTRY_TYPE_DISPLAY_FAMILY_FALLBACK

#: Lo que cuesta, en el tiempo total del jugador, que el organizador le SALTE un
#: nodo (botones «+1 nodo» y «Finalizar»). Antes se leía `time_limit_ms` del
#: nodo, un campo que ningún nodo ha tenido nunca: siempre valió 300 000 y la
#: lectura sólo engañaba. Cinco minutos, dicho con todas las letras.
PENALIZACION_SALTAR_NODO_MS = 300_000

#: Un guardado de la misión a la vez: comprobar la revisión, escribir y
#: reindexar no puede intercalarse con el de otro administrador.
_CERROJO_MISION = threading.Lock()


def _bajo_el_candado_del_jugador(main, user, accion, *args):
    """Ejecuta una acción del panel sobre un jugador con SU candado: el mismo que toman su avance y su sincronización
    (game.py). Sin él, «−1 nodo» o «Reiniciar» desde el panel podían intercalarse con un avance del móvil en curso y
    quedarse a medias (nivel bajado y el avance aplicado encima, o el reinicio pisado). Revisión 19/10."""
    from backend.app.routers.game import candado_del_jugador

    with candado_del_jugador(main.get_player_profile(user).get("id") or user):
        return accion(*args)


def display_family_for_stage(stage_type, game_id):
    key = _as_str(game_id).strip().lower()
    if key in GAME_ID_DISPLAY_FAMILY:
        return GAME_ID_DISPLAY_FAMILY[key]
    return TYPE_DISPLAY_FAMILY_FALLBACK.get(_as_str(stage_type).strip().lower(), "llegar_y_escanear")


def _clave_por_cambiar(main):
    """403 si la contraseña del administrador sigue siendo la de arranque.

    Mientras `must_change` esté puesto, NADA del panel funciona salvo cambiarla
    (y entrar/salir): ni las descargas, ni la purga, ni el reinicio. Varias rutas
    destructivas no lo miraban (caza de fallos A15).
    """
    if main.admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"},
        )
    return None


def _auditar(request: Request, accion: str, objetivo: str = "", detalle=None, resultado: str = "ok") -> None:
    """Auditoría del panel: quién (huella de la sesión), qué y cuándo.

    Ver backend/app/runtime/registro_analisis.py. Nunca lanza: anotar no puede
    tumbar un guardado.
    """
    from backend.app.runtime import registro_analisis as _registro

    _registro.auditar(request, accion, objetivo, detalle, resultado)


async def _autorizado(main, request: Request, data) -> bool:
    # En un hilo: comprobar la sesión toca SQLite (y, con el modo antiguo de
    # contraseña en el cuerpo, hace PBKDF2).
    return bool(await run_in_threadpool(main.admin_request_authorized, request, data))


def reiniciar_jugador_por_completo(main, profile_id: str) -> None:
    """Todo lo que significa «reiniciar a este jugador», en un solo sitio.

    Había DOS reinicios y no hacían lo mismo:

        /api/admin/profile-action  nivel + relojes + mochila con reset_at + posición
        /api/reset                 sólo el nivel

    Medido en el banco de ensayo con el segundo: el servidor se ponía a 0 y el
    móvil seguía marcando 2/10, con su IndexedDB en el nivel 1. El organizador
    reiniciaba a alguien y esa persona seguía jugando como si nada.

    La razón es `reset_at`. El móvil manda sobre su propio progreso -tiene que
    ser así, porque en el monte avanza sin cobertura-, y la ÚNICA señal que le
    hace ceder es esa marca dentro del inventario. Sin ella no hay reinicio que
    valga: el cliente da por buena su copia y sigue.

    Los cronómetros y la posición van aquí por lo mismo: un jugador reiniciado
    volvía al nodo 1 con el reloj de la partida anterior corriendo, y su última
    coordenada seguía en el mapa de los demás como si ya estuviera en la ruta.
    """
    main.clear_all_player_timers(profile_id)

    # La mochila de verdad vive en el móvil: el cliente compara su marca con
    # ésta y se vacía solo. Sin esto sólo se limpia el servidor y el jugador
    # sigue viendo sus objetos viejos -llegaba al nodo final con el Sello ya
    # forjado y se saltaba media misión-.
    ahora_ms = int(time.time() * 1000)
    main.save_player_inventory(
        profile_id,
        {
            "user": profile_id,
            "updated_at": "",
            "items": [],
            "reset_at": ahora_ms,
            # Un reinicio completo corta las dos cosas: la cola de avances y la
            # mochila por eventos de la partida anterior.
            "progress_reset_at": ahora_ms,
            "inventory_reset_at": ahora_ms,
        },
        desde_admin=True,
    )

    main.clear_live_position(profile_id)


MAX_PERFILES = 60
MAX_AVATAR_CHARS = 400_000  # ~300 KB de foto ya comprimida en data URI

#: 14/11: con poca cobertura el panel no puede bajarse 100 KB de fotos en base64 cada vez que entra. La vista general
#: ligera las cambia por una URL (`/api/admin/foto/<id>?v=<huella>`, cacheable para siempre porque la huella cambia
#: con la foto). Al guardar, esa misma URL vuelve y significa «déjale la foto que ya tiene».
_FOTO_RASTER = re.compile(r"^data:image/(?:jpeg|jpg|png|webp);base64,", re.IGNORECASE)
_PREFIJO_FOTO = "/api/admin/foto/"


def foto_por_url(perfil_id, avatar):
    """La foto de un perfil como URL cacheable; lo que no sea una foto raster en data URI se deja como está."""
    texto = _as_str(avatar)
    if not _FOTO_RASTER.match(texto):
        return texto
    huella = hashlib.sha1(texto.encode("utf-8")).hexdigest()[:10]
    return f"{_PREFIJO_FOTO}{quote(_as_str(perfil_id), safe='')}?v={huella}"


def _id_de_foto_por_url(avatar):
    """El id de la URL de foto, o None si `avatar` no es una."""
    texto = _as_str(avatar).strip()
    if not texto.startswith(_PREFIJO_FOTO):
        return None
    return unquote(texto[len(_PREFIJO_FOTO):].split("?", 1)[0])


def _normalize_incoming_profiles(raw, avisos=None, existentes=None, fotos=None):
    """Valida las fichas de jugador que llegan del panel.

    Devuelve None si no venían (para no pisar las guardadas) y una lista limpia
    si venían. Los ids se deduplican porque son la clave con la que el jugador
    entra: dos iguales harían que compartiesen partida sin saberlo (y el candado y el progreso van sin distinguir
    mayúsculas: «Ana» y «ana» compartían estado, así que cuentan como el mismo id).

    13/11: lo que se descarta ya no es silencioso. Si se pasa un dict en `avisos` se rellena con `perfiles_de_mas`
    (los que pasan de MAX_PERFILES), `fotos_demasiado_grandes` (ids a los que se les quitó la foto), `ids_repetidos`
    (descartados por repetirse) e `ids_parecidos` (se CONSERVAN porque ya estaban guardados así: nadie se borra,
    pero conviene renombrar uno). `existentes` = ids que ya había guardados.

    `fotos` (id -> foto guardada) resuelve las URL de foto de la vista ligera: una URL `/api/admin/foto/<id>` se
    sustituye por la foto que ya tenía ESE id (aunque se le haya cambiado el id a la ficha), y si no la tiene queda sin foto.
    """
    if not isinstance(raw, list):
        return None

    avisos = avisos if avisos is not None else {}
    ya_guardados = {str(e) for e in (existentes or ())}
    perfiles = []
    vistos = {}  # id sin mayúsculas -> el primero que llegó

    if len(raw) > MAX_PERFILES:
        avisos["perfiles_de_mas"] = len(raw) - MAX_PERFILES

    for index, item in enumerate(raw[:MAX_PERFILES]):
        if not isinstance(item, dict):
            continue

        pid = _as_str(item.get("id")).strip()[:120] or f"PLAYER {index + 1}"
        clave = pid.casefold()
        if clave in vistos:
            primero = vistos[clave]
            if pid != primero and pid in ya_guardados and primero in ya_guardados:
                # Ya estaban guardados los dos: se conservan (no se borra a nadie) y se avisa.
                avisos.setdefault("ids_parecidos", []).append(pid)
            else:
                avisos.setdefault("ids_repetidos", []).append(pid)
                continue
        else:
            vistos[clave] = pid

        avatar = _as_str(item.get("avatar_url")).strip()
        id_de_foto = _id_de_foto_por_url(avatar)
        if id_de_foto is not None:
            avatar = _as_str((fotos or {}).get(id_de_foto)).strip()
        if len(avatar) > MAX_AVATAR_CHARS:
            # Mejor sin foto que romper el fichero de configuración entero.
            avatar = ""
            avisos.setdefault("fotos_demasiado_grandes", []).append(pid)

        miembros = item.get("members")
        miembros = (
            [_as_str(m).strip()[:120] for m in miembros if _as_str(m).strip()]
            if isinstance(miembros, list)
            else []
        )

        perfiles.append(
            {
                "id": pid,
                "display_name": _as_str(item.get("display_name")).strip()[:120] or pid,
                "mode": "team" if _as_str(item.get("mode")).strip() == "team" else "solo",
                "members": miembros,
                "status": _as_str(item.get("status")).strip()[:40] or "active",
                "color": _as_str(item.get("color")).strip()[:40],
                "avatar_url": avatar,
                "avatar_initials": _as_str(item.get("avatar_initials")).strip()[:3].upper(),
            }
        )

    return perfiles


def _engine_version(main) -> str:
    """Versión del motor, para saber con qué se generó una copia."""
    try:
        return (main.APP_DIR / "VERSION").read_text().strip()
    except Exception:
        return "dev"


def _copia_de_respaldo(main):
    cfg = main.load_config()
    raw_stages = main.load_stages(main.STAGES_DB)
    if not isinstance(raw_stages, list):
        raw_stages = []

    progress = main.load_player_progress()
    timers = main.load_player_timers()
    inventories = main.load_inventory_state()

    perfiles = []
    for profile in main.get_player_profiles(cfg):
        profile_id = profile.get("id")
        perfiles.append(
            {
                **profile,
                "level": main.get_player_progress_level(profile_id, 0),
                "total_time_ms": main.get_player_total_time_ms(profile_id),
                "stage_times_ms": (timers.get(str(profile_id)) or {}).get("stage_times_ms", {}),
                "inventory": inventories.get(profile_id, {"items": []}),
            }
        )

    # El trazado va aparte además de dentro de cada nodo, para poder
    # reconstruir el GPX sin tener que recorrer la ruta entera.
    trazado = []
    for stage in raw_stages:
        for punto in stage.get("route_track") or []:
            if isinstance(punto, (list, tuple)) and len(punto) >= 2:
                trazado.append([punto[0], punto[1]])
            elif isinstance(punto, dict) and "lat" in punto and "lon" in punto:
                trazado.append([punto["lat"], punto["lon"]])

    return {
        "status": "ok",
        "format": "saga-backup",
        "format_version": 1,
        "exported_at": int(time.time()),
        "engine_version": _engine_version(main),
        "config": cfg,
        "stages": raw_stages,
        "stages_revision": _revisiones.admin_stages_revision(raw_stages),
        "route_track": trazado,
        "profiles": perfiles,
        "progress": progress,
        "counts": {
            "stages": len(raw_stages),
            "profiles": len(perfiles),
            "route_points": len(trazado),
        },
    }


@router.post("/api/admin/export")
async def admin_export(request: Request):
    """Copia de respaldo de la misión entera, en un solo fichero.

    El botón de administración exportaba sólo un GPX con el trazado, que no
    sirve para recuperar nada: si se pierde la tarjeta de la Raspberry se van
    con ella los nodos, la configuración de cada juego, los textos de la
    historia, los jugadores y sus fotos. Esto se lo lleva todo.
    """
    import main

    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    _auditar(request, "copia_de_respaldo")
    return await run_in_threadpool(_copia_de_respaldo, main)


def _resumen_del_panel(main, ligero=False):
    cfg = main.load_config()
    # Los nodos GUARDADOS (crudos) y, a partir de ellos, los normalizados: la
    # ficha del panel necesita los crudos para devolver los campos que el
    # normalizador tira (requisito de objeto, código de emergencia, premio...).
    raw_stages = main.load_stages(main.STAGES_DB)
    if not isinstance(raw_stages, list):
        raw_stages = []
    # La huella se saca ANTES de normalizar: `normalize_stage` muta el nodo que le
    # pasan (le fija el `game_id` de los tipos con alias), y entonces esta huella
    # no coincidiría con la de `/api/admin/stages` ni con la que compara el guardado.
    revision = _revisiones.admin_stages_revision(raw_stages)
    stages = [normalize_stage(copy.deepcopy(stage)) for stage in raw_stages]
    profiles = main.get_player_profiles(cfg)

    gamestate = main.load_player_progress()
    positions = main.load_live_positions()
    inventory_state = main.load_inventory_state()

    stage_summaries = [
        main._admin_react_stage_summary(stage, idx, raw_stages[idx])
        for idx, stage in enumerate(stages)
    ]

    # Las seis familias del editor (familyConfigs.ts), no sólo tres.
    family_counts = {family["id"]: 0 for family in REGISTRY_FAMILIES}
    # Las 5 familias de PRESENTACIÓN del admin (displayFamilies.ts), sobre
    # las mismas plantillas: agrupación distinta de las técnicas de arriba.
    display_family_counts = {family["id"]: 0 for family in DISPLAY_FAMILIES}
    for stage in stage_summaries:
        stage_type = stage.get("type")
        if stage_type in family_counts:
            family_counts[stage_type] += 1

        game_id = (stage.get("config") or {}).get("game_id") if isinstance(stage.get("config"), dict) else None
        display_family = display_family_for_stage(stage_type, game_id)
        display_family_counts[display_family] = display_family_counts.get(display_family, 0) + 1

    profile_summaries = [
        main._admin_react_profile_summary(profile, gamestate, positions, inventory_state)
        for profile in profiles
    ]
    # 14/11: el tiempo de cada jugador (total, penalizaciones y lo sumado a mano) para la ficha del panel; una lectura de
    # los relojes para todos.
    timers = main.load_player_timers()
    for resumen in profile_summaries:
        entrada = timers.get(str(resumen.get("id")))
        entrada = entrada if isinstance(entrada, dict) else {}
        resumen["tiempo"] = {
            "total_time_ms": main._player_timers.total_de_la_entrada(entrada),
            "penalties_ms": int(entrada.get("penalties_ms") or 0),
            "ajuste_admin_ms": int(entrada.get("ajuste_admin_ms") or 0),
        }

    return {
        "status": "ok",
        # Huella de los nodos tal como están guardados. El panel la manda de vuelta
        # en `POST /api/admin/save` (campo `stages_revision`) y el servidor
        # contesta 409 si entretanto otra pestaña u otro administrador cambió la
        # misión (caza de fallos A7).
        "stages_revision": revision,
        # Cuántas escrituras han fallado desde que arrancó el servidor (un
        # `.lock` que no se soltó, el disco lleno...): antes se tragaban.
        "storage": _json_store.storage_health(),
        "config": {
            "site_name": cfg.get("site_name"),
            "admin_title": cfg.get("admin_title"),
            "admin_subtitle": cfg.get("admin_subtitle"),
            "player_theme": cfg.get("player_theme"),
            "map_center": cfg.get("map_center"),
            "map_zoom": cfg.get("map_zoom"),
            "login_title": cfg.get("login_title"),
            "login_subtitle": cfg.get("login_subtitle"),
            "login_instructions": cfg.get("login_instructions"),
            "prologue_title": cfg.get("prologue_title"),
            "prologue_subtitle": cfg.get("prologue_subtitle"),
            "prologue_image_url": cfg.get("prologue_image_url"),
            "prologue_body": cfg.get("prologue_body"),
            "mapbox_token": cfg.get("mapbox_token"),
            "mapbox_style": cfg.get("mapbox_style"),
            # Sólo el estado, nunca la clave.
            "mission_pass_enabled": main.mission_gate_enabled(),
            # 14/11: si la clave la fija el ENTORNO (SAGA_CLAVE_TEMPORAL), cambiarla aquí se revierte en cada arranque.
            "mission_pass_from_env": bool(getattr(main, "CLAVE_TEMPORAL", "")),
            # 14/11: la caducidad de rastros GPS se decide por entorno o por el ajuste del servidor, no desde este panel.
            "position_expiry_active": bool(_caducidad_rastros.activa(cfg)),
            "ui_lang": main.normalize_ui_lang(cfg.get("ui_lang", "es")),
            "require_server_proximity": bool(cfg.get("require_server_proximity")),
            "field_proof_retention_days": main.dias_de_retencion(cfg),
        },
        "counts": {
            "players": len(cfg.get("players", [])) if isinstance(cfg.get("players"), list) else 0,
            "profiles": len(profiles),
            "stages": len(stage_summaries),
            "finished_profiles": sum(1 for item in profile_summaries if item.get("finished")),
            "family_counts": family_counts,
            # Nuevo: mismos nodos, contados por las 5 familias de admin.
            "display_family_counts": display_family_counts,
        },
        "families": [{"id": family["id"], "label": family["label"]} for family in REGISTRY_FAMILIES],
        # Nuevo: las 6 familias que ve el admin en el selector de juegos.
        # "families" (arriba) se mantiene por compatibilidad con quien ya lo
        # lea.
        "display_families": DISPLAY_FAMILIES,
        "stages": stage_summaries,
        "profiles": profile_summaries,
        # Los perfiles completos, con la foto incrustada.
        #
        # El panel las sacaba de /api/config, que es público. Dos motivos para
        # traerlas por aquí: allí eran 134 KB de los 135 KB que el jugador se
        # bajaba cada 30 segundos —16 MB por hora y por móvil mandando las
        # mismas caras—, y además dejaban los retratos de los catorce al alcance
        # de cualquiera que pidiese la URL.
        #
        # El panel las necesita enteras para editarlas: si le llegan vacías,
        # guardar borra las fotos de todo el mundo.
        "player_profiles": (
            [{**p, "avatar_url": foto_por_url(p.get("id"), p.get("avatar_url"))} for p in profiles] if ligero else profiles
        ),
    }


@router.post("/api/admin/react-overview")
async def admin_react_overview(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if main.admin_password_change_required():
        return {
            "status": "password_change_required",
            "message": "Admin password change required before using the React admin overview.",
        }

    # `ligero`: las fotos van como URL cacheable (ver `foto_por_url`) en vez de base64: con poca cobertura son 4 de cada 5 bytes.
    return await run_in_threadpool(_resumen_del_panel, main, bool(data.get("ligero")))


def _huella_de_seccion(valor) -> str:
    """Huella corta de una parte del arranque (para no repetirla si el panel ya tiene la misma)."""
    crudo = json.dumps(valor, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha1(crudo.encode("utf-8")).hexdigest()[:16]


def _arranque(main, request: Request, huellas=None):
    """TODO lo que el panel pide al entrar, en UNA respuesta (15/11, entrar con muy poca cobertura).

    Antes eran 3 rondas seguidas tras teclear la clave (entrar, vista general + nodos, configuración pública) y con
    2G (1,2 s de latencia por ronda) la latencia pesaba más que los bytes. Aquí van juntas: la vista general ligera, los
    nodos guardados enteros (con su huella), la configuración pública y el estado en vivo de los jugadores.

    `huellas` = lo que el panel ya tiene de una entrada anterior: si una parte no ha cambiado se manda
    `{"sin_cambios": true}` en vez de repetirla (recargar sin cambios no vuelve a bajar los nodos). El estado en
    vivo va siempre: es lo que cambia y es pequeño.
    """
    from backend.app.routers import public as _public

    huellas = huellas if isinstance(huellas, dict) else {}
    vista = _resumen_del_panel(main, True)
    nodos = main.load_stages(main.STAGES_DB)
    nodos_resp = {
        "status": "ok",
        "stages": nodos,
        "stages_revision": _revisiones.admin_stages_revision(nodos),
    }
    publica = _public.get_config(request)
    # La hora del servidor cambia en cada petición: fuera de la huella, o nunca habría «sin cambios».
    publica_estable = {k: v for k, v in publica.items() if k != "server_time_ms"}
    secciones = {"overview": vista, "stages": nodos_resp, "config": publica_estable}
    salida = {"status": "ok", "server_ts": int(time.time())}
    nuevas = {}
    for nombre, valor in secciones.items():
        huella = _huella_de_seccion(valor)
        nuevas[nombre] = huella
        if huellas.get(nombre) == huella:
            salida[nombre] = {"sin_cambios": True}
        else:
            # La configuración pública se manda con su hora del servidor, como la daría /api/config.
            salida[nombre] = publica if nombre == "config" else valor
    salida["huellas"] = nuevas
    salida["live"] = _estado_con_huella(main)
    return salida


@router.post("/api/admin/arranque")
async def admin_arranque(request: Request):
    """La vista general, los nodos, la configuración y el estado en vivo en una sola ida y vuelta (ver `_arranque`).

    Mismas puertas que `react-overview`: sesión de administrador (el bloqueo por intentos del login no cambia) y la
    contraseña de arranque ya cambiada."""
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if main.admin_password_change_required():
        return {
            "status": "password_change_required",
            "message": "Admin password change required before using the React admin overview.",
        }

    return await run_in_threadpool(_arranque, main, request, data.get("huellas"))


def _en_el_nodo_desde(entrada, node_id):
    """Desde cuándo (segundos) está alguien en su nodo actual, o None si no se sabe.

    Lo más reciente entre su último avance, su arranque y la primera vez que abrió ESE nodo: abrirlo es llegar, y
    el avance cubre el camino hasta él. Con eso el panel distingue a quien lleva media hora en el mismo nodo (se ha
    atascado) de quien acaba de llegar. Un «+1 nodo» (o un retroceso) del panel deja `nivel_cambiado_en_panel_ms`
    (player_timers): cuenta como llegar al nodo nuevo.
    """
    if not isinstance(entrada, dict):
        return None
    aperturas = entrada.get("aperturas") if isinstance(entrada.get("aperturas"), dict) else {}
    marcas = []
    for valor in (
        entrada.get("last_advance_at_ms"),
        entrada.get("started_at"),
        aperturas.get(str(node_id or "")),
        entrada.get("nivel_cambiado_en_panel_ms"),
    ):
        try:
            marcas.append(int(valor or 0))
        except (TypeError, ValueError):
            continue
    mayor = max(marcas, default=0)
    return mayor // 1000 if mayor > 0 else None


def _estado_de_la_mision(main):
    cfg = main.load_config()
    runtime_stages = main.get_runtime_stages()
    state = main.load_player_progress()
    positions = main.load_live_positions()
    # Una lectura de cada fichero para todos, no tres por jugador (project_live_profile_status relee la ruta, los
    # tiempos y el progreso si no se los dan). Esto lo pide el panel cada 15 s mientras mira a los jugadores.
    timers = main.load_player_timers()
    now = int(time.time())

    items = []
    for profile in main.get_player_profiles(cfg):
        profile_id = profile.get("id")
        lvl = state.get(profile_id, 0)
        finished = lvl >= len(runtime_stages)

        current_stage = ""
        node_id = ""
        if not finished and 0 <= lvl < len(runtime_stages):
            current_stage = runtime_stages[lvl]["presentation"]["title"]
            node_id = runtime_stages[lvl].get("id") or ""

        vivo = main.project_live_profile_status(
            profile, positions.get(profile_id), now, total_nodes=len(runtime_stages), timers=timers, progress=state
        )
        # Sin la foto: viaja en data URI (decenas de KB por jugador) y esto se pide una y otra vez con poca
        # cobertura. El panel ya la tiene de la vista completa.
        vivo.pop("avatar_url", None)
        items.append({
            **vivo,
            "level": lvl,
            "finished": finished,
            "current_stage": current_stage,
            "en_nodo_desde": None if finished else _en_el_nodo_desde(timers.get(str(profile_id)), node_id),
        })

    return {
        "status": "ok",
        "server_ts": now,
        "profiles": items
    }


def _estado_con_huella(main, huella_del_panel=None):
    """El estado en vivo con su huella (`etag`). Si el panel manda la que ya tiene y no ha cambiado nada, sólo se contesta
    `{"status": "sin_cambios"}` (con la hora del servidor): con poca cobertura, la mayoría de los sondeos con la
    partida quieta pasan a ser unas decenas de bytes (15/11)."""
    estado = _estado_de_la_mision(main)
    huella = _huella_de_seccion({k: v for k, v in estado.items() if k != "server_ts"})
    if huella_del_panel and huella_del_panel == huella:
        return {"status": "sin_cambios", "server_ts": estado["server_ts"], "etag": huella}
    estado["etag"] = huella
    return estado


@router.post("/api/admin/mission-status")
async def admin_mission_status(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    etag = data.get("etag")
    return await run_in_threadpool(_estado_con_huella, main, etag if isinstance(etag, str) else None)


def _sospechas_de_trampa(main):
    import backend.app.runtime.anti_cheat as _anti_cheat

    cfg = main.load_config()
    perfiles_por_id = {p.get("id"): p for p in main.get_player_profiles(cfg)}
    sospechas = main.list_anti_cheat_suspicions()

    jugadores = []
    for profile_id, lista in sospechas.items():
        if not isinstance(lista, list) or not lista:
            continue
        perfil = perfiles_por_id.get(profile_id)
        desglose = _anti_cheat.count_by_severity(lista)
        jugadores.append({
            "user": profile_id,
            "display_name": (perfil or {}).get("display_name") or profile_id,
            # Compatibilidad con paneles viejos: "count" sigue siendo el
            # total (sospechas + info neutra).
            "count": len(lista),
            "suspicion_count": desglose["suspicion_count"],
            "info_count": desglose["info_count"],
            # Las más recientes primero: son las que importa mirar primero.
            "suspicions": list(reversed(lista))[:50],
        })

    jugadores.sort(key=lambda item: item["suspicion_count"], reverse=True)

    return {
        "status": "ok",
        "server_ts": int(time.time()),
        "players": jugadores,
    }


@router.post("/api/admin/anti-cheat-flags")
async def admin_anti_cheat_flags(request: Request):
    """Sospechas de trampa anotadas por el servidor (ver runtime/anti_cheat.py).

    Sólo lectura: esto NUNCA toca la clasificación por sí solo. El organizador
    decide caso por caso, a mano, mirando el motivo y la prueba de cada
    sospecha -no hay aquí ningún botón que la aplique automáticamente-.
    """
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    return await run_in_threadpool(_sospechas_de_trampa, main)


@router.post("/api/admin/stages")
async def get_stages(request: Request):
    """Los nodos tal como están guardados, y su huella (`stages_revision`).

    La respuesta ya no es la lista a pelo sino `{status, stages, stages_revision}`
    (el cliente del panel acepta las dos formas): la huella es lo que el panel
    manda de vuelta al guardar para que el servidor detecte un guardado que
    pisaría el de otra pestaña.
    """
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if main.admin_password_change_required():
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "password change required"}
        )

    def _leer():
        nodos = main.load_stages(main.STAGES_DB)
        revision = _revisiones.admin_stages_revision(nodos)
        return JSONResponse(
            {"status": "ok", "stages": nodos, "stages_revision": revision},
            # Por si un cliente sólo mira cabeceras.
            headers={"X-Stages-Revision": revision},
        )

    return await run_in_threadpool(_leer)


def _ajuste_invalido(campo, mensaje):
    """400 que el panel enseña al organizador cuando un ajuste no se puede leer (y no se guarda nada)."""
    _log.warning("save-config rechazado: %s inválido", campo)
    return JSONResponse(
        status_code=400,
        content={"status": "error", "detail": f"invalid_{campo}", "reason": f"invalid_{campo}", "message": mensaje},
    )


@router.post("/api/admin/save-config")
async def save_config_endpoint(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    # Sólo vale `{"config": {...}}`. Antes `data.get("config") or {}` aceptaba
    # cualquier cuerpo, no cambiaba nada y contestaba «ok»: el panel probaba tres
    # formas distintas y daba por bueno el primer «ok» aunque no se hubiera
    # guardado nada (caza de fallos A3).
    incoming = data.get("config")
    if not isinstance(incoming, dict):
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "detail": "missing_config",
                "reason": "missing_config",
                "message": 'El cuerpo tiene que ser {"config": {...}}.',
            },
        )
    cfg = main.load_config()

    updated = {
        **cfg,
        "site_name": _as_str(incoming.get("site_name") if "site_name" in incoming else cfg.get("site_name")).strip() or TEXTOS_POR_DEFECTO["site_name"],
        "admin_title": _as_str(incoming.get("admin_title") if "admin_title" in incoming else cfg.get("admin_title")).strip() or TEXTOS_POR_DEFECTO["admin_title"],
        "admin_subtitle": _as_str(incoming.get("admin_subtitle") if "admin_subtitle" in incoming else cfg.get("admin_subtitle")).strip() or TEXTOS_POR_DEFECTO["admin_subtitle"],
        "login_title": _as_str(incoming.get("login_title") if "login_title" in incoming else cfg.get("login_title", "")).strip(),
        "login_subtitle": _as_str(incoming.get("login_subtitle") if "login_subtitle" in incoming else cfg.get("login_subtitle", TEXTOS_POR_DEFECTO["login_subtitle"])).strip(),
        "login_instructions": _as_str(incoming.get("login_instructions") if "login_instructions" in incoming else cfg.get("login_instructions", "")).strip(),
        "story_title": _as_str(incoming.get("story_title") if "story_title" in incoming else cfg.get("story_title", "")).strip(),
        "story_text": _as_str(incoming.get("story_text") if "story_text" in incoming else cfg.get("story_text", "")).strip(),
        "prologue_title": _as_str(incoming.get("prologue_title") if "prologue_title" in incoming else cfg.get("prologue_title", "")).strip(),
        "prologue_subtitle": _as_str(incoming.get("prologue_subtitle") if "prologue_subtitle" in incoming else cfg.get("prologue_subtitle", "")).strip(),
        "prologue_body": _as_str(incoming.get("prologue_body") if "prologue_body" in incoming else cfg.get("prologue_body", "")).strip(),
        "prologue_image_url": _as_str(incoming.get("prologue_image_url") if "prologue_image_url" in incoming else cfg.get("prologue_image_url", "")).strip(),
        "mapbox_token": _as_str(incoming.get("mapbox_token") if "mapbox_token" in incoming else cfg.get("mapbox_token", "")).strip(),
        "mapbox_style": _as_str(incoming.get("mapbox_style") if "mapbox_style" in incoming else cfg.get("mapbox_style", "")).strip(),
        # Fecha desde la que se puede completar un nodo (ver
        # runtime/mission_schedule.py). Vacío = sin bloqueo.
        "ui_lang": main.normalize_ui_lang(incoming.get("ui_lang") if "ui_lang" in incoming else cfg.get("ui_lang", "es")),
        "mission_launch_at": _as_str(incoming.get("mission_launch_at") if "mission_launch_at" in incoming else cfg.get("mission_launch_at", "")).strip(),
        # «Exigir proximidad en el servidor» (runtime/proximidad.py): apagado por
        # defecto; sin la clave en el cuerpo no se toca.
        "require_server_proximity": (
            _as_bool(incoming.get("require_server_proximity"))
            if "require_server_proximity" in incoming
            else bool(cfg.get("require_server_proximity"))
        ),
        # 13/11: caducidad de los rastros GPS (runtime/caducidad_de_rastros.py). Apagada por defecto; encenderla exige
        # la confirmación nominal (más abajo, junto a los demás rechazos), porque borra solo datos ya guardados.
        "position_expiry_enabled": bool(cfg.get("position_expiry_enabled")) if "position_expiry_enabled" not in incoming
        else _as_bool(incoming.get("position_expiry_enabled")),
        # Días que se guardan las fotos de las pruebas con sus coordenadas (fase 3; 0 = sin caducidad).
        "field_proof_retention_days": main.dias_de_retencion(
            incoming if "field_proof_retention_days" in incoming else cfg
        ),
    }

    # 14/11: una fecha de salida que no se puede leer se interpretaba como «sin bloqueo» y se decía «guardado».
    if updated["mission_launch_at"] and _mission_schedule.parse_launch_at(updated["mission_launch_at"]) is None:
        return _ajuste_invalido("mission_launch_at", "La fecha de salida no es válida (usa el selector de fecha y hora).")

    # 14/11: el token de Mapbox del ENTORNO lo copia `load_config` al cfg; guardarlo escribiría en data/config.json un secreto
    # que no es del organizador. Si es el mismo, no se guarda.
    _env_token = os.getenv("VITE_MAPBOX_TOKEN") or os.getenv("MAPBOX_TOKEN")
    if _env_token and updated.get("mapbox_token") == _env_token:
        updated.pop("mapbox_token", None)

    if updated["position_expiry_enabled"] and not cfg.get("position_expiry_enabled"):
        if _as_str(incoming.get("position_expiry_confirm")).strip() != CONFIRMACION_BORRADO:
            return _ajuste_invalido(
                "position_expiry_enabled",
                "Encender la caducidad de los rastros GPS borra datos ya guardados: escribe %s para confirmarlo."
                % CONFIRMACION_BORRADO,
            )

    raw_center = incoming.get("map_center")
    if isinstance(raw_center, list) and len(raw_center) == 2:
        try:
            lat = float(raw_center[0])
            lon = float(raw_center[1])
        except (ValueError, TypeError):
            return _ajuste_invalido("map_center", "El centro del mapa no es válido (latitud y longitud en números).")
        # Mismos rangos que el panel (adminConfigVerify.ts): una llamada directa no debe saltárselos.
        if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
            return _ajuste_invalido("map_center", "El centro del mapa no es válido (latitud entre -90 y 90, longitud entre -180 y 180).")
        updated["map_center"] = [lat, lon]

    # Vacío = «no tocar»; con algo que no es un número se avisa en vez de decir «guardado» sin haberlo guardado.
    if incoming.get("map_zoom") not in (None, ""):
        try:
            zoom = int(incoming["map_zoom"])
        except (ValueError, TypeError, OverflowError):
            return _ajuste_invalido("map_zoom", "El zoom del mapa tiene que ser un número entero.")
        if not 1 <= zoom <= 22:
            return _ajuste_invalido("map_zoom", "El zoom del mapa tiene que estar entre 1 y 22.")
        updated["map_zoom"] = zoom

    if incoming.get("player_theme") is not None:
        updated["player_theme"] = main.normalize_player_theme(incoming["player_theme"])

    # Jugadores y sus fichas.
    #
    # Esto NO estaba: la respuesta se armaba campo a campo y ni "players" ni
    # "player_profiles" se copiaban nunca, así que {**cfg} devolvía siempre la
    # lista vieja. El panel enviaba los cambios, el servidor contestaba "ok" y
    # los descartaba: los jugadores nuevos desaparecían al recargar y las fotos
    # subidas desde administración no llegaban a guardarse, por eso no salían
    # ni en el login, ni en el mapa, ni en la clasificación.
    avisos_de_perfiles = {}
    guardados = {
        _as_str(p.get("id")).strip() for p in (cfg.get("player_profiles") or []) if isinstance(p, dict)
    }
    fotos_guardadas = {
        _as_str(p.get("id")).strip(): _as_str(p.get("avatar_url"))
        for p in (cfg.get("player_profiles") or [])
        if isinstance(p, dict)
    }
    perfiles = _normalize_incoming_profiles(incoming.get("player_profiles"), avisos_de_perfiles, guardados, fotos_guardadas)
    if perfiles is not None:
        updated["player_profiles"] = perfiles
        updated["players"] = [p["id"] for p in perfiles]
    elif isinstance(incoming.get("players"), list):
        ids = []
        for item in incoming["players"]:
            texto = _as_str(item).strip()[:120]
            if texto and texto not in ids:
                ids.append(texto)
        if ids:
            updated["players"] = ids

    main.save_config(updated)
    # El centro del mapa puede haber cambiado: la zona de teselas se recalcula.
    _teselas.olvidar_area()

    # La clave de misión NO va en config.json: se guarda cifrada aparte. Sólo
    # se toca si el panel manda la llave `mission_pass` de forma explícita.
    # Cadena vacía = quitar la puerta; ausente = no tocar nada.
    if "mission_pass" in incoming:
        await run_in_threadpool(main.set_mission_password, incoming.get("mission_pass"))

    _auditar(
        request,
        "guardar_ajustes",
        detalle={
            # Sólo QUÉ campos llegaron (nunca el valor de la clave de misión).
            "campos": sorted(str(k) for k in incoming.keys())[:40],
            "inicio_programado": updated.get("mission_launch_at") or "",
            "jugadores": len(updated.get("players") or []),
        },
    )
    respuesta = {"status": "ok", "mission_pass_enabled": main.mission_gate_enabled()}
    if perfiles is not None:
        # Con los PIN puestos, quien se acaba de añadir no tiene el suyo y no puede entrar: el panel lo avisa al
        # guardar (revisión 24/10). Sólo al guardar jugadores; los demás ajustes no cambian quién falta.
        respuesta["jugadores_sin_pin"] = _estado_de_los_pines(main)["sin_pin"]
        if avisos_de_perfiles:
            # Lo que se dejó fuera al guardar (13/11): el panel lo enseña en vez de decir «guardado» sin más.
            respuesta["descartados"] = avisos_de_perfiles
    return respuesta


def _perfil_conocido(main, user):
    """¿Es `user` el id de un jugador de la ficha? (13/11: restaurar/reiniciar un id inventado dejaba estados fantasma)."""
    ids = {_as_str((p or {}).get("id")).strip() for p in main.get_player_profiles(main.load_config())}
    return user in ids


@router.post("/api/reset")
async def reset(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    user = _as_str(data.get("user")).strip()
    if not user:
        raise HTTPException(status_code=400, detail="user is required")
    if not _perfil_conocido(main, user):
        raise HTTPException(status_code=404, detail="unknown profile")

    # El mismo reinicio que el del panel de perfiles, no una versión corta.
    # Aquí sólo se bajaba el nivel, y eso no llega al móvil: ver
    # `reiniciar_jugador_por_completo`.
    def _reiniciar():
        main.set_player_progress_level(user, 0)
        reiniciar_jugador_por_completo(main, user)

    await run_in_threadpool(_bajo_el_candado_del_jugador, main, user, _reiniciar)
    _auditar(request, "jugador:reset_profile", user)
    return {"status": "ok"}


def _mochila_saneada(main, profile_id):
    """La mochila guardada de un jugador, con la forma que esperan las acciones.

    Una mochila sin `items`, con `items` que no es una lista o con elementos que
    no son objetos rompía `give_item`/`remove_item` con un 500 (caza de fallos S16).
    """
    from backend.app.runtime import mochila as _mochila

    guardada = main.load_inventory_state().get(profile_id)
    return _mochila.sanear_mochila(guardada if isinstance(guardada, dict) else {"user": profile_id})


@router.post("/api/admin/profile-action")
async def admin_profile_action(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        return JSONResponse(
            status_code=403,
            content={"status": "error", "detail": "bad password"}
        )

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    profile_id = _as_str(data.get("profile_id")).strip()
    accion_cruda = _as_str(data.get("action")).strip()
    action = accion_cruda.lower()
    # El id del objeto conserva sus mayúsculas: pasar toda la acción a
    # minúsculas entregaba «llave_Dorada» como «llave_dorada», otro objeto que
    # ningún nodo pide.
    for prefijo in ("give_item:", "remove_item:"):
        if action.startswith(prefijo):
            action = prefijo + accion_cruda[len(prefijo):].strip()
    # Cuántas unidades da «Dar objeto» (1-99). Sin decir, las que entrega el
    # nodo de donde sale el objeto.
    cantidad_pedida = _entradas.entero_seguro(data.get("quantity"), 0, minimo=0, maximo=99)

    allowed_actions = {
        "reset_profile",
        "level_prev",
        "level_next",
        "mark_finished",
        "clear_inventory",
        "restore_node",
    }

    if action not in allowed_actions and not action.startswith("give_item:") and not action.startswith("remove_item:"):
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid action"}
        )

    if action.startswith("give_item:") or action.startswith("remove_item:"):
        # 13/11: el id del objeto se acepta tal cual en «Escribir ID manualmente»; sin límite se colaban ids de
        # longitud absurda o con caracteres de control en la mochila del jugador.
        objeto = action.split(":", 1)[1]
        if not objeto or len(objeto) > 80 or any(ord(c) < 32 or ord(c) == 127 for c in objeto):
            return JSONResponse(status_code=400, content={"status": "error", "detail": "invalid item id"})

    cfg = main.load_config()
    profiles = {
        _as_str((p or {}).get("id")).strip(): (p or {})
        for p in main.get_player_profiles(cfg)
    }

    if not profile_id or profile_id not in profiles:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "detail": "unknown profile"}
        )

    # 14/11: con `op_id` (lo genera el panel UNA vez por pulsación) un reintento tras una respuesta perdida devuelve
    # lo que ya se hizo en vez de repetirlo («+1 nodo» no sube dos).
    op_id = _operaciones.id_valido(data.get("op_id"))
    try:
        resultado = await run_in_threadpool(
            _bajo_el_candado_del_jugador, main, profile_id, _aplicar_una_vez, main, profile_id, action, cantidad_pedida, op_id
        )
    except _operaciones.OperacionReutilizada:
        return JSONResponse(status_code=409, content={"status": "error", "detail": "op_id reused"})
    if not resultado.get("repetida"):
        _auditar(
            request,
            f"jugador:{action}"[:60],
            profile_id,
            {
                "nivel_antes": resultado.get("previous_level"),
                "nivel_despues": resultado.get("level"),
                **({"cantidad": cantidad_pedida} if cantidad_pedida else {}),
            },
        )
    return resultado


def estado_del_jugador(main, profile_id):
    """Cómo ha quedado un jugador tras una acción del panel: su ficha resumida (la misma de la vista general) y sus
    tiempos. Va en la respuesta para que el panel NO tenga que volver a pedir la vista general entera (con poca
    cobertura eran decenas de KB y segundos por cada pulsación)."""
    cfg = main.load_config()
    perfil = next(
        (p for p in main.get_player_profiles(cfg) if _as_str((p or {}).get("id")).strip() == profile_id), None
    )
    salida = {}
    if perfil is not None:
        resumen = main._admin_react_profile_summary(
            perfil, main.load_player_progress(), main.load_live_positions(), main.load_inventory_state()
        )
        resumen.pop("avatar_url", None)
        salida["perfil"] = resumen
    entrada = main.load_player_timers().get(profile_id)
    entrada = entrada if isinstance(entrada, dict) else {}
    salida["tiempo"] = {
        "total_time_ms": main._player_timers.total_de_la_entrada(entrada),
        "penalties_ms": int(entrada.get("penalties_ms") or 0),
        "ajuste_admin_ms": int(entrada.get("ajuste_admin_ms") or 0),
    }
    return salida


def _aplicar_una_vez(main, profile_id, action, cantidad_pedida, op_id):
    """`_aplicar_accion_de_perfil` una sola vez por `op_id`; el resto de veces, el resultado anotado."""
    previa = _operaciones.buscar(main.ADMIN_OPS_DB, op_id, profile_id, action) if op_id else None
    if previa is not None:
        resultado = {**previa, "repetida": True}
    else:
        resultado = _aplicar_accion_de_perfil(main, profile_id, action, cantidad_pedida)
        if op_id:
            _operaciones.anotar(main.ADMIN_OPS_DB, op_id, profile_id, action, resultado)
    return {**resultado, **estado_del_jugador(main, profile_id)}


def _anotar_evento_de_mochila(main, profile_id, item_id, label, cantidad, accion):
    """Lo que hace el panel con la mochila queda también en el registro de eventos.

    La copia de la mochila la reescribe el móvil cada vez que sube la suya: un
    objeto dado desde el panel sólo en la copia se perdía en la siguiente
    subida y, si el móvil ya tenía ese objeto, nunca le llegaba la unidad de
    más (sólo se incorporan ids nuevos). Como evento cuenta siempre en el
    servidor y viaja al móvil como entrega con su `grant_id`.
    """
    import secrets

    return main.append_event(
        main.EVENT_LOG_DB,
        {
            "type": "inventory_item_collected" if accion == "collected" else "inventory_item_used",
            "status": "synced",
            "source": "admin",
            "user": profile_id,
            "team_id": profile_id,
            "node_id": "",
            "payload": {
                "inventory_item_id": item_id,
                "inventory_label": label or item_id,
                "inventory_action": accion,
                "inventory_quantity": max(1, int(cantidad or 1)),
                "grant_id": f"admin:{secrets.token_hex(6)}",
            },
        },
    )


def _unidades_que_entrega(stage):
    """Cuántas unidades da el nodo del que sale un objeto (coleccionable o premio)."""
    if not isinstance(stage, dict):
        return 1
    premio = stage.get("reward") if isinstance(stage.get("reward"), dict) else {}
    for valor in (stage.get("physical_item_quantity"), premio.get("quantity")):
        try:
            numero = int(valor)
        except (TypeError, ValueError):
            continue
        if numero > 0:
            return min(99, numero)
    return 1


def _aplicar_accion_de_perfil(main, profile_id, action, cantidad_pedida=0):
    runtime_stages = main.get_runtime_stages()
    max_level = len(runtime_stages)

    previous_level = max(0, min(main.get_player_progress_level(profile_id, 0), max_level))

    if action == "reset_profile":
        new_level = 0
        reiniciar_jugador_por_completo(main, profile_id)
    elif action == "level_prev":
        new_level = max(0, previous_level - 1)
    elif action == "restore_node":
        new_level = max(0, previous_level - 1)
        main.clear_player_stage_time(profile_id, new_level)
    elif action == "level_next":
        new_level = min(max_level, previous_level + 1)
        # Automatically award any collectible from the node being skipped
        if previous_level < len(runtime_stages):
            skipped_stage = runtime_stages[previous_level]
            if skipped_stage.get("physical_node_kind") == "collectible" and skipped_stage.get("physical_item_id"):
                item_id = skipped_stage.get("physical_item_id")
                item_label = skipped_stage.get("physical_item_label") or item_id
                unidades = _unidades_que_entrega(skipped_stage)

                inventory = _mochila_saneada(main, profile_id)
                existing = next((i for i in inventory["items"] if i.get("item_id") == item_id), None)

                if existing:
                    existing["quantity"] = (existing.get("quantity", 0) if existing.get("state") != "used" else 0) + unidades
                    existing["state"] = "collected"
                else:
                    inventory["items"].append({"item_id": item_id, "label": item_label, "state": "collected", "quantity": unidades})

                main.save_player_inventory(profile_id, inventory, desde_admin=True)
                # Revisión 19/10: como give_item, también como evento. Sólo en la
                # copia, el móvil lo pisaba en su siguiente subida y quitarlo luego
                # desde el panel anotaba un gasto que nadie había recogido.
                _anotar_evento_de_mochila(main, profile_id, item_id, item_label, unidades, "collected")
    elif action == "mark_finished":
        new_level = max_level
    else:
        new_level = previous_level

    quita_objetos = False
    objeto_conocido = None

    if action.startswith("give_item:") or action.startswith("remove_item:") or action == "clear_inventory":
        inventory = _mochila_saneada(main, profile_id)

        if action == "clear_inventory":
            inventory["items"] = []
            quita_objetos = True
        elif action.startswith("give_item:"):
            item_id = action.replace("give_item:", "")

            # ¿De qué nodo sale este objeto? Sirve para dos cosas: poner la
            # etiqueta bonita en vez del id crudo, y dar el nodo por hecho.
            source_index = None
            source_label = item_id
            unidades = 1
            for index, stage in enumerate(runtime_stages):
                premio = stage.get("reward") if isinstance(stage, dict) and isinstance(stage.get("reward"), dict) else {}
                if _stage_item_id(stage) == item_id or premio.get("item_id") == item_id:
                    source_index = index
                    if _stage_item_id(stage) == item_id:
                        source_label = _stage_item_label(stage) or item_id
                    else:
                        source_label = premio.get("label") or item_id
                    unidades = _unidades_que_entrega(stage)
                    break
            if cantidad_pedida:
                unidades = cantidad_pedida
            # 13/11: ningún nodo da ese objeto (id escrito a mano): se entrega igual, pero el panel lo avisa.
            objeto_conocido = source_index is not None

            existing = next((i for i in inventory["items"] if i.get("item_id") == item_id), None)
            if existing:
                actuales = existing.get("quantity", 0) if existing.get("state") != "used" else 0
                existing["quantity"] = actuales + unidades
                existing["state"] = "collected"
                if not existing.get("label") or existing.get("label") == item_id:
                    existing["label"] = source_label
            else:
                inventory["items"].append({
                    "item_id": item_id,
                    "label": source_label,
                    "state": "collected",
                    "quantity": unidades,
                })
            _anotar_evento_de_mochila(main, profile_id, item_id, source_label, unidades, "collected")

            # Entregar a mano el objeto de un nodo equivale a haberlo hecho: si
            # no, el jugador se quedaba con el objeto en la mochila y el nodo
            # seguía bloqueado delante de él.
            if source_index is not None and previous_level <= source_index:
                new_level = min(max_level, source_index + 1)
                main.set_player_progress_level(profile_id, new_level, 0, desde_admin=True)
        elif action.startswith("remove_item:"):
            item_id = action.replace("remove_item:", "")
            # Lo que quedaba por eventos también se gasta: si no, el servidor lo
            # seguía contando para abrir nodos y volvía al móvil al recargar.
            # Revisión 19/10: sólo lo recogido por eventos menos lo ya gastado; lo
            # que estaba sólo en la copia se va al borrarlo de la copia (abajo).
            eventos, copia = main._eventos_y_copia_de_mochila(profile_id)
            unidades = main._mochila.pendiente_por_eventos(eventos, copia, item_id)
            if unidades > 0:
                _anotar_evento_de_mochila(main, profile_id, item_id, item_id, unidades, "used")
            inventory["items"] = [i for i in inventory["items"] if i.get("item_id") != item_id]
            quita_objetos = True

        main.save_player_inventory(profile_id, inventory, desde_admin=True)
    else:
        # Saltar un nodo cuesta cinco minutos, y sólo si de verdad se avanza:
        # «Finalizar» a quien ya había terminado no suma otros cinco.
        penalty_ms = 0
        if action in ("level_next", "mark_finished") and new_level > previous_level:
            penalty_ms = PENALIZACION_SALTAR_NODO_MS
        main.set_player_progress_level(profile_id, new_level, penalty_ms, desde_admin=True)
        # Revisión 19/10: llevarlo al final desde el panel es acabar, igual que
        # en /api/advance; sin finished_at no desempataba. Sólo si de verdad
        # avanza: «Finalizar» dos veces no le cambia la hora.
        if new_level >= max_level > previous_level:
            main.mark_player_finished(profile_id)

    # Lo que BAJA el nivel de alguien o le QUITA objetos tiene que llegar al
    # móvil: éste ignora los niveles más bajos que el suyo y vuelve a subir su
    # mochila vieja. La única señal que le hace ceder es la marca `reset_at`
    # (`inventory_snapshot.reset_at`, ms desde la época), que se sube aquí. Así
    # el «✓ Aplicado» del panel deja de ser mentira (caza de fallos A11).
    marca = None
    if action == "reset_profile":
        marca = main.player_reset_at(profile_id)  # el reinicio ya la dejó puesta
    elif new_level < previous_level or quita_objetos:
        # Sólo se mueve lo que esta acción toca: bajar de nivel corta la cola
        # de avances viejos; vaciar la mochila corta los eventos de mochila.
        # Quitar UN objeto no corta nada (ya se anotó como gastado arriba).
        marca = main.bump_reset_marker(
            profile_id,
            progreso=new_level < previous_level,
            inventario=action == "clear_inventory",
        )

    return {
        "status": "ok",
        "profile_id": profile_id,
        "action": action,
        "previous_level": previous_level,
        "level": new_level,
        "finished": new_level >= max_level,
        "total_stages": max_level,
        "reset_at": marca,
        **({"objeto_conocido": objeto_conocido} if objeto_conocido is not None else {}),
    }


def _stage_item_id(stage):
    """id del coleccionable de un nodo, mire donde mire la forma del nodo."""
    if not isinstance(stage, dict):
        return None
    config = stage.get("config") if isinstance(stage.get("config"), dict) else {}
    physical = stage.get("physical_qr") if isinstance(stage.get("physical_qr"), dict) else {}
    for value in (
        stage.get("physical_item_id"),
        config.get("physical_item_id"),
        physical.get("item_id"),
    ):
        if value:
            return str(value)
    return None


def _stage_item_label(stage):
    if not isinstance(stage, dict):
        return None
    config = stage.get("config") if isinstance(stage.get("config"), dict) else {}
    physical = stage.get("physical_qr") if isinstance(stage.get("physical_qr"), dict) else {}
    for value in (
        stage.get("physical_item_label"),
        config.get("physical_item_label"),
        physical.get("label"),
    ):
        if value:
            return str(value)
    return None


def _guardar_mision(main, data, stages):
    """Guarda (o simula guardar) la misión. Un solo guardado a la vez.

    Devuelve la respuesta ya hecha: 409 si la huella que manda el panel no es la
    de lo guardado, la lista de afectados si es un ensayo (`dry_run`), o `ok`.
    """
    with _CERROJO_MISION:
        # El nivel guardado de cada jugador es un índice en esta lista, no un id
        # de nodo: hay que leer la lista VIEJA antes de pisarla, para poder decir
        # a qué nodo apuntaba cada jugador antes del cambio. Ver
        # backend/app/runtime/mision_reindex.py.
        # 13/11: si un guardado anterior se cortó antes de reindexar los niveles, se termina AHORA: si no, `old_stages`
        # ya sería la misión nueva, el reindexado no vería diferencias y los niveles quedarían desalineados para siempre.
        main.reparar_reindex_pendiente()
        old_stages = main.load_stages(main.STAGES_DB)
        actual = _revisiones.admin_stages_revision(old_stages)

        # Si el panel dice de qué versión partió y no es la actual, alguien ha
        # cambiado la misión entretanto: guardar la pisaría sin avisar (A7).
        esperada = _entradas.texto_seguro(data.get("stages_revision"), 64)
        if esperada and esperada != actual:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "conflict",
                    "reason": "stages_changed",
                    "current_revision": actual,
                },
            )

        # 26/10: nodos encima o demasiado pegados (ver runtime/nodos_cercanos.py). Viajan en el ensayo y en el
        # guardado; dejar dos nodos a menos de 3 m que antes no lo estaban pide que el organizador lo acepte
        # (`aceptar_nodos_encima`).
        cercanos = _nodos_cercanos.pares_cercanos(stages)

        if _as_bool(data.get("dry_run")):
            niveles = main.load_player_progress()
            perfiles = main.get_player_profiles()
            afectados = _revisiones.calcular_afectados(old_stages, stages, niveles, perfiles)
            return {
                "status": "ok",
                "dry_run": True,
                "afectados": afectados,
                # Nodos añadidos al final con gente ya terminada: no los jugarán
                # (no se reabre a nadie). El panel lo avisa y pide confirmar.
                "terminados_sin_nodos_nuevos": _revisiones.terminados_sin_nodos_nuevos(
                    old_stages, stages, niveles, perfiles
                ),
                "stages_revision": actual,
                "nodos_cercanos": cercanos,
            }

        if _nodos_cercanos.encima_nuevos(old_stages, stages) and not _as_bool(data.get("aceptar_nodos_encima")):
            return JSONResponse(
                status_code=422,
                content={
                    "status": "nodos_encima",
                    "detail": "Hay nodos uno encima de otro (a menos de 3 m).",
                    "nodos_cercanos": cercanos,
                },
            )

        # Con los candados de TODOS los jugadores (en orden fijo, para no cruzarse): la reindexación cambia el nivel de
        # cada uno y no puede intercalarse con un avance en curso (revisión 19/10).
        from contextlib import ExitStack

        from backend.app.routers.game import candado_del_jugador

        with ExitStack() as pila:
            for pid in sorted({str(p.get("id") or "").strip().casefold() for p in main.get_player_profiles()} - {""}):
                pila.enter_context(candado_del_jugador(pid))
            main.save_stages(
                main.STAGES_DB, stages,
                reindexar_desde=[_as_str(s.get("id")) for s in old_stages if isinstance(s, dict)],
            )
            main.reindex_player_levels_on_save(old_stages, stages)
        # Los nodos definen la zona de teselas que se sirve: se recalcula.
        _teselas.olvidar_area()

        return {
            "status": "ok",
            "stages_revision": _revisiones.admin_stages_revision(main.load_stages(main.STAGES_DB)),
            "nodos_cercanos": cercanos,
        }


@router.post("/api/admin/save")
async def save_stages_endpoint(request: Request):
    """Guarda los nodos de la misión.

    - `stages_revision` (opcional): la huella con la que el panel cargó los
      nodos. Si no es la actual, 409 `{status: "conflict", reason:
      "stages_changed", current_revision}`. Sin él, se guarda como siempre.
    - `dry_run: true`: valida y calcula a quién movería la reindexación SIN
      escribir nada: `{status: "ok", dry_run: true, afectados: [...],
      terminados_sin_nodos_nuevos: N}` (N = ya terminados que no jugarán los
      nodos añadidos detrás del último).
    - `nodos_cercanos` (ensayo y guardado): pares de nodos a menos de 15 m. Si
      el guardado deja a menos de 3 m nodos que antes no lo estaban, 422
      `{status: "nodos_encima"}` salvo con `aceptar_nodos_encima: true`.
    """
    import main
    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error"})
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    stages = data.get("stages")
    errors = main.validate_stages(stages)
    if errors:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "invalid stages", "errors": errors}
        )

    respuesta = await run_in_threadpool(_guardar_mision, main, data, stages)
    if isinstance(respuesta, JSONResponse) and respuesta.status_code == 409:
        _auditar(request, "guardar_nodos", detalle={"nodos": len(stages)}, resultado="conflicto_409")
    elif isinstance(respuesta, dict) and not respuesta.get("dry_run"):
        _auditar(
            request,
            "guardar_nodos",
            detalle={"nodos": len(stages), "revision": respuesta.get("stages_revision")},
        )
    return respuesta


@router.post("/api/admin/login")
async def admin_login(request: Request):
    import main
    # Sin sesión y sin clave: una contraseña cabe en 4 KB. Con el tope del panel (64 MB) cualquiera hacía leer y
    # parsear 64 MB antes de llegar al bloqueo (revisión 22/10).
    data = await _entradas.leer_cuerpo_json(request, max_bytes=_peticiones.MAX_CUERPO_ENTRADA)
    now = time.time()
    # Los intentos fallidos se cuentan por /64 en IPv6 (quien ataca desde una
    # dirección IPv6 cambia de dirección dentro de su /64 cuando quiere).
    ip = _client_ip.lockout_key(main.get_client_ip(request))
    # 13/11: el móvil que ya entró bien lleva una cookie firmada y se cuenta aparte (10 fallos, espera corta creciente,
    # tope de 1 h); quien no la lleva sigue con 5 por IP y bloqueo progresivo. Encima hay un techo por IP que la
    # cookie no se salta (admin_auth.IP_TOTAL_MAX_ATTEMPTS).
    device_id = main.admin_device_id(request)

    remaining = main.admin_login_lock_remaining(ip, device_id, now)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail=f"too many failed attempts; retry in {remaining}s"
        )

    # PBKDF2 (200 000 vueltas: décimas de segundo, más en la Raspberry) en un
    # hilo: hecho aquí, cada intento de login paraba a todos los jugadores.
    if await run_in_threadpool(main.verify_admin_password, data.get("password")):
        main.limpiar_login_admin_ok(ip, device_id)
        # «Mantener la sesión» (casilla del login): hasta 6 h sin usarla en vez de 1 h. Siempre con tope de 12 h.
        token = main.create_admin_session(remember=bool(data.get("remember")))
        sesion = main.ADMIN_SESSIONS.get(token) or {}
        expires_at = int(sesion.get("expires_at") or (int(time.time()) + main.ADMIN_SESSION_TTL_SECONDS))
        cuerpo_login = {
            "status": "ok",
            "must_change": main.admin_password_change_required(),
            "session_expires_at": expires_at,
            # Sin usarla aguanta esto; el panel avisa 5 min antes y puede renovarla (/api/admin/session/ping).
            "session_idle_seconds": int(sesion.get("idle_ttl") or main.ADMIN_SESSION_TTL_SECONDS),
            "session_absolute_expires_at": int(sesion.get("abs_expires_at") or expires_at),
        }
        # 15/11: con `arranque: true` la respuesta del login trae ya lo que el panel pide al entrar (una ronda menos con
        # 2G). La contraseña acaba de comprobarse en esta misma petición; si algo falla, el panel lo pide aparte.
        if data.get("arranque") is True and not cuerpo_login["must_change"]:
            try:
                cuerpo_login["arranque"] = await run_in_threadpool(_arranque, main, request, None)
            except Exception:  # noqa: BLE001 - entrar no puede fallar por esto
                _log.warning("arranque en el login: no se pudo preparar", exc_info=True)
        response = JSONResponse(cuerpo_login)
        main.set_admin_session_cookie(response, request, token)
        main.set_admin_device_cookie(response, request, device_id)
        from backend.app.runtime import registro_analisis as _registro

        try:
            _registro._store.anadir_auditoria(
                _registro.ruta_db(),
                {
                    "sesion": _registro.huella(token),
                    "accion": "login",
                    "dispositivo": _registro.resumir_agente(request.headers.get("user-agent")),
                },
            )
        except Exception:
            pass
        return response

    fallo = main.registrar_fallo_de_login_admin(ip, device_id, now)
    _auditar(request, "login", resultado="contraseña_incorrecta")
    return JSONResponse(
        status_code=401,
        content={
            "status": "error",
            "detail": "invalid admin password",
            # Cuántos intentos quedan antes del bloqueo (el panel dice «te quedan N») y, si este fallo ya bloquea,
            # cuántos segundos esperar.
            "remaining_attempts": fallo["remaining_attempts"],
            "retry_in": fallo["retry_in"],
        },
    )


@router.post("/api/admin/session/ping")
async def admin_session_ping(request: Request):
    """Renueva la sesión del panel (la sesión deslizante ya se renueva con cualquier petición) y dice cuándo caduca.
    El panel lo usa para el aviso «tu sesión caduca» y su botón «Seguir»."""
    import main
    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")
    sesion = main.ADMIN_SESSIONS.get(request.cookies.get(main.ADMIN_SESSION_COOKIE) or "") or {}
    return {
        "status": "ok",
        "session_expires_at": int(sesion.get("expires_at") or 0),
        "session_idle_seconds": int(sesion.get("idle_ttl") or main.ADMIN_SESSION_TTL_SECONDS),
        "session_absolute_expires_at": int(sesion.get("abs_expires_at") or 0),
    }


@router.post("/api/admin/logout")
async def admin_logout(request: Request):
    import main
    token = request.cookies.get(main.ADMIN_SESSION_COOKIE)
    if token:
        main.ADMIN_SESSIONS.pop(token, None)
        main.admin_auth_security.clear_persistent_admin_session(main.ADMIN_SESSIONS_DB, token)

    response = JSONResponse({"status": "ok"})
    main.clear_admin_session_cookie(response, request)
    # 13/11: ya no se borra la cookie de JUGADOR: un organizador que prueba como jugador en el mismo móvil perdía su
    # pase al cerrar la sesión del panel (son sesiones distintas).
    return response


@router.post("/api/admin/change-password")
async def admin_change_password(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    current_password = _entradas.texto_seguro(data.get("password"), 500)
    new_password = _entradas.texto_seguro(data.get("new_password"), 500)
    confirm_password = _entradas.texto_seguro(data.get("confirm_password"), 500)

    # 13/11: probar la contraseña actual desde un móvil con la sesión abierta no tenía límite: ahora cuenta los
    # fallos y respeta el bloqueo, igual que el login.
    ip = _client_ip.lockout_key(main.get_client_ip(request))
    device_id = main.admin_device_id(request)
    restante = main.admin_login_lock_remaining(ip, device_id, time.time())
    if restante > 0:
        raise HTTPException(status_code=429, detail=f"too many failed attempts; retry in {restante}s")

    if not await run_in_threadpool(main.verify_admin_password, current_password):
        fallo = main.registrar_fallo_de_login_admin(ip, device_id)
        return JSONResponse(
            status_code=403,
            content={
                "status": "error",
                "detail": "bad password",
                "remaining_attempts": fallo["remaining_attempts"],
                "retry_in": fallo["retry_in"],
            },
        )

    if not new_password:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "new password required"})

    if len(new_password) < 10:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "detail": "Password must be at least 10 characters long.",
            },
        )

    if main.is_weak_admin_password(new_password):
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "detail": "Password is too weak. Avoid common words or simple patterns.",
            },
        )

    if new_password != confirm_password:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "New passwords do not match."},
        )

    await run_in_threadpool(main.set_admin_password, new_password)

    # Cambiar la contraseña cierra TODAS las demás sesiones del panel (un
    # portátil olvidado, alguien que ya la conocía); la de quien la cambia sigue
    # abierta. Antes seguían valiendo hasta que caducaban (caza de fallos A15).
    cerradas = await run_in_threadpool(
        main.invalidate_other_admin_sessions, request.cookies.get(main.ADMIN_SESSION_COOKIE)
    )
    _auditar(request, "cambiar_contrasena", detalle={"sesiones_cerradas": cerradas})
    return {"status": "ok", "closed_sessions": cerradas}


@router.post("/api/admin/events")
async def admin_events(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    limit = _entradas.entero_seguro(data.get("limit"), 100, minimo=1, maximo=500)

    status = main.sanitize_event_text(data.get("status"), 80) or None
    user = main.sanitize_event_text(data.get("user"), 120) or None
    event_type = main.sanitize_event_text(data.get("type"), 80) or None

    # Los `limit` eventos MÁS RECIENTES, de viejo a nuevo. Antes eran los más
    # viejos (`ORDER BY ... ASC LIMIT`) y el panel de Actividad nunca enseñaba lo
    # último (caza de fallos A8).
    def _leer():
        eventos = main.list_events(
            main.EVENT_LOG_DB,
            status=status,
            user=user,
            event_type=event_type,
            limit=limit,
        )
        # Los totales salen de un COUNT, no de lo que cabe en `limit`: el panel
        # contaba «N pendientes» sobre los 200 que trae (caza de fallos A17).
        return {
            "status": "ok",
            "events": eventos,
            "total_count": main.count_events(main.EVENT_LOG_DB, status=status, user=user, event_type=event_type),
            "pending_count": main.count_events(main.EVENT_LOG_DB, status="pending", user=user, event_type=event_type),
        }

    return await run_in_threadpool(_leer)


@router.post("/api/admin/events/mark")
async def admin_mark_event(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    event_id = main.sanitize_event_text(data.get("event_id"), 120)
    next_status = main.sanitize_event_text(data.get("status"), 40)

    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required")

    updated = main.mark_event_status(
        main.EVENT_LOG_DB,
        event_id,
        next_status,
        error=main.sanitize_event_text(data.get("error"), 300) or None,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="event not found")

    _auditar(request, "marcar_evento", event_id, {"estado": next_status})
    return {
        "status": "ok",
        "event": updated,
    }


def _filtros_del_registro(main, data):
    user = main.sanitize_event_text(data.get("user"), 120) or None
    date_from = main.sanitize_event_text(data.get("desde"), 40) or None
    date_to = main.sanitize_event_text(data.get("hasta"), 40) or None
    return user, date_from, date_to


@router.post("/api/admin/match-log")
async def admin_match_log(request: Request):
    """Registro de partida: línea de tiempo de un jugador entre dos fechas.

    Sólo lectura -esto no decide nada por sí solo, es la bitácora completa
    para que el organizador revise después de la ruta-. Ver
    backend/app/runtime/match_log.py para qué se anota y cuándo.
    """
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    user, date_from, date_to = _filtros_del_registro(main, data)
    event_type = main.sanitize_event_text(data.get("type"), 80) or None
    limit = _entradas.entero_seguro(data.get("limit"), 5000, minimo=1, maximo=20000)

    # Filtros de revisión: sólo sospechas / sólo lo hecho sin cobertura. Las
    # filas salen ordenadas por CUÁNDO OCURRIERON (hora del móvil), no por
    # cuándo se subieron, y con `occurred_at` para poder agruparlas. Con `limit`
    # se devuelven las más RECIENTES (por ocurrencia), y `desde`/`hasta` filtran
    # por cuándo pasó, no por cuándo se subió.
    entries = await run_in_threadpool(
        lambda: main.match_log_list_timeline(
            user=user,
            date_from=date_from,
            date_to=date_to,
            event_type=event_type,
            limit=limit,
            only_suspicions=bool(data.get("solo_sospechas")),
            only_offline=bool(data.get("solo_sin_cobertura")),
            by_occurrence=True,
        )
    )

    return {
        "status": "ok",
        "entries": entries,
        "count": len(entries),
    }


@router.post("/api/admin/match-log/export")
async def admin_match_log_export(request: Request):
    """Igual que /api/admin/match-log, pero para descargar: JSON o CSV.

    El CSV lleva BOM UTF-8 y `;` como separador: así Excel en castellano lo abre
    en columnas y con las tildes bien (y sigue escapando las fórmulas).
    """
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    user, date_from, date_to = _filtros_del_registro(main, data)
    formato = (main.sanitize_event_text(data.get("formato"), 10) or "json").lower()

    entries = await run_in_threadpool(
        lambda: main.match_log_list_timeline(
            user=user,
            date_from=date_from,
            date_to=date_to,
            limit=20000,
            only_suspicions=bool(data.get("solo_sospechas")),
            only_offline=bool(data.get("solo_sin_cobertura")),
            by_occurrence=True,
        )
    )

    nombre_jugador = user or "todos"
    nombre_fichero = f"registro-de-partida-{nombre_jugador}"

    # El nombre de un jugador puede llevar tildes o comillas: en una cabecera
    # `filename="..."` a pelo eso daba un 500 (latin-1) o rompía la cabecera.
    if formato == "csv":
        cuerpo = main.match_log_to_csv(entries)
        return Response(
            content=cuerpo,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": _descargas.contenido_adjunto(nombre_fichero, "csv", "registro-de-partida")},
        )

    return JSONResponse(
        {"status": "ok", "entries": entries, "count": len(entries)},
        headers={"Content-Disposition": _descargas.contenido_adjunto(nombre_fichero, "json", "registro-de-partida")},
    )


@router.post("/api/admin/player/restore-node")
async def admin_restore_node(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    user_target = main.sanitize_event_text(data.get("user"), 120)
    if not user_target:
        raise HTTPException(status_code=400, detail="user is required")
    if not _perfil_conocido(main, user_target):
        raise HTTPException(status_code=404, detail="unknown profile")

    def _restaurar():
        profile = main.get_player_profile(user_target)
        profile_id = profile.get("id") or user_target

        current_level = main.get_player_progress_level(profile_id)
        if current_level > 0:
            new_level = current_level - 1
            main.set_player_progress_level(profile_id, new_level, desde_admin=True)
            main.clear_player_stage_time(profile_id, new_level)
            # Bajó el nivel: el móvil tiene que enterarse (ver profile-action).
            marca = main.bump_reset_marker(profile_id)
            return {"status": "ok", "new_level": new_level, "restored_node_index": new_level, "reset_at": marca}

        return {"status": "fail", "reason": "already_at_start"}

    resultado = await run_in_threadpool(_bajo_el_candado_del_jugador, main, user_target, _restaurar)
    _auditar(
        request,
        "jugador:restore_node",
        user_target,
        {"nivel_despues": resultado.get("new_level")},
        resultado=resultado.get("status") or "",
    )
    return resultado


CONFIRMACION_BORRADO = "BORRAR"


def _contar_datos_personales():
    """Qué hay guardado de personas ahora mismo.

    Se cuenta antes de borrar para que el panel pueda decir exactamente qué se
    va a perder. Un borrado que no dice lo que se lleva no se usa nunca, o se
    usa una vez y da un susto. Ver runtime/purga_datos.py.
    """
    return _purga.contar()


@router.post("/api/admin/field-proofs/delete")
async def admin_borrar_prueba(request: Request):
    """El panel borra UNA prueba concreta (foto, miniatura, coordenadas y nota). Fase 3 de la auditoría del 15/10."""
    import main
    from backend.app.routers import field_proofs

    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="Admin auth required")
    # Borra una foto sin vuelta atrás: con la contraseña de arranque puesta, no (caza A15; revisión 23/10).
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo
    prueba = _as_str(data.get("id")).strip()
    if not prueba or not await run_in_threadpool(field_proofs.borrar_prueba, prueba):
        raise HTTPException(status_code=404, detail="proof not found")
    _auditar(request, "borrar_prueba", objetivo=prueba)
    return {"status": "ok", "id": prueba}


@router.post("/api/admin/player-pins")
async def admin_player_pins(request: Request):
    """PIN por jugador (fase 2, auditoría 15/10/2026).

    `accion`: "estado" (quién tiene PIN), "generar" (a los que no lo tienen; con `todos: true`, a todos: tira sus
    sesiones), "quitar" (vuelve la entrada por nombre). Los PIN en claro salen SÓLO en la respuesta de "generar".
    """
    import main
    from backend.app.runtime import pines_jugador

    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="Admin auth required")
    # Revisión 23/10: los PIN se ven UNA vez; con la contraseña de arranque puesta, nada del panel (caza A15).
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo
    accion = _as_str(data.get("accion")).strip()
    nuevos = {}
    if accion == "generar":
        ids = [_as_str(p.get("id")).strip() for p in main.get_player_profiles(main.load_config())]
        # Quién tiene ya PIN lo decide `generar`, bajo su candado (dos pulsaciones seguidas se pisaban).
        nuevos = await run_in_threadpool(pines_jugador.generar, ids, not data.get("todos"))
    elif accion == "quitar":
        pines_jugador.quitar()
    elif accion != "estado":
        raise HTTPException(status_code=400, detail="accion: estado | generar | quitar")
    if accion != "estado":
        _auditar(request, "pines_jugador", detalle={"accion": accion, "jugadores": len(nuevos)})
    return {"status": "ok", **_estado_de_los_pines(main), "nuevos": nuevos}


def _estado_de_los_pines(main):
    """Quién tiene PIN y quién NO, entre los jugadores que hay ahora (revisión 24/10).

    `con_pin` contaba también a los jugadores ya borrados (su PIN se queda guardado) y el panel decía «Activo: 12
    jugadores con PIN» con 10 en la lista. Y nadie avisaba de lo contrario: un jugador añadido con los PIN puestos
    no tiene el suyo, en la portada sólo ve «PIN incorrecto» y no entra. `sin_pin` es esa lista.
    """
    from backend.app.runtime import pines_jugador

    ids = [main.normalize_player_session_user(_as_str(p.get("id")).strip()) for p in main.get_player_profiles(main.load_config())]
    ids = [i for i in ids if i]
    guardados = set(pines_jugador.con_pin())
    return {
        "activos": bool(guardados),
        "con_pin": [i for i in ids if i in guardados],
        "sin_pin": [i for i in ids if i not in guardados] if guardados else [],
    }


@router.post("/api/admin/rastros-caducidad")
async def admin_rastros_caducidad(request: Request):
    """Qué borraría la caducidad de los rastros GPS con el plazo de ahora. SOLO cuenta, no borra nunca.

    Para enseñarle el número a Óscar antes de encenderla (ver runtime/caducidad_de_rastros.py).
    """
    import main
    from backend.app.runtime import caducidad_de_rastros

    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    cfg = main.load_config()
    dias = main.dias_de_retencion(cfg)
    se_borraria = await run_in_threadpool(lambda: caducidad_de_rastros.contar(dias))
    return {
        "status": "ok",
        "activa": caducidad_de_rastros.activa(cfg),
        "dias": dias,
        "se_borraria": se_borraria,
    }


@router.post("/api/admin/coherencia")
async def admin_coherencia(request: Request):
    """Revisa la coherencia de la partida (nivel contra nodos, jugadores sin perfil, `superados`).

    13/11 (auditoría de integridad). `{"corregir": true}` arregla sólo lo seguro (un nivel por encima del número de
    nodos baja al número de nodos); por defecto SOLO informa. Lo mismo corre solo al arrancar el servidor.
    """
    import main
    from backend.app.runtime import integridad

    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    corregir = _as_bool(data.get("corregir"))

    def revisar():
        perfiles = [_as_str(p.get("id")) for p in main.get_player_profiles() if isinstance(p, dict)]
        return integridad.comprobar_coherencia(
            main.resolve_game_state_db_path(main.GAME_DB),
            [_as_str(s.get("id")) for s in main.get_runtime_stages()],
            perfiles,
            corregir=corregir,
        )

    resultado = await run_in_threadpool(revisar)
    if corregir and resultado["corregidos"]:
        _auditar(request, "coherencia_corregida", detalle={"corregidos": len(resultado["corregidos"])})
    return {"status": "ok", "corregir": corregir, **resultado}


@router.post("/api/admin/datos-personales")
async def admin_datos_personales(request: Request):
    """Ver y borrar lo que SAGA guarda de personas.

    SAGA guarda nombres, fotos hechas por los jugadores y rastros GPS: la
    posición de cada latido y las coordenadas exactas de cada foto con su hora
    y su nodo. Todo eso se quedaba para siempre y no había forma de limpiarlo.

    Contra los datos de personas, lo que protege de verdad no es el permiso
    firmado —que cubre hacer la foto, no guardarla dos años— sino no tener lo
    que no hace falta. Esto es lo que permite pasar una ruta con menores y
    dejarlo limpio al acabar.

    NO toca la misión: los nodos, la configuración y las fichas de jugador se
    quedan (sin la foto del retrato). Tampoco los tiempos ni el progreso, que son
    el resultado del juego y no llevan nada que no sea el nombre; para eso está
    el reseteo de siempre.

    Borra de verdad, y lo cuenta: fotos y sus miniaturas (en cualquier
    subcarpeta), retratos de las fichas, rastros GPS, el Registro de partida, el
    rastro de posiciones de los eventos, las coordenadas de las sospechas del
    antitrampas y, al final, compacta las bases SQLite para que los bytes borrados
    no queden dentro del fichero. Ver runtime/purga_datos.py.

    Sin `confirmacion` sólo cuenta, no borra.
    """
    import main

    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        raise HTTPException(status_code=403, detail="forbidden")

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    antes = await run_in_threadpool(_contar_datos_personales)

    if _as_str(data.get("confirmacion")).strip() != CONFIRMACION_BORRADO:
        return {
            "status": "ok",
            "accion": "contar",
            "datos": antes,
            "para_borrar": (
                "Repite la llamada con confirmacion='%s'. Se borran las fotos y "
                "las posiciones GPS. La misión y los tiempos se quedan."
                % CONFIRMACION_BORRADO
            ),
        }

    borrar_fotos = _as_bool(data.get("fotos", True))
    borrar_posiciones = _as_bool(data.get("posiciones", True))

    # En un hilo: borrar ficheros y compactar SQLite (VACUUM) no puede parar a
    # los jugadores más de lo imprescindible.
    borrado = await run_in_threadpool(
        lambda: _purga.ejecutar(borrar_fotos=borrar_fotos, borrar_posiciones=borrar_posiciones)
    )
    queda = await run_in_threadpool(_contar_datos_personales)
    # Después de borrar, a propósito: la purga se lleva la auditoría anterior (lleva
    # nombres) y queda constancia de que hubo purga, sin datos de nadie.
    _auditar(request, "purga_datos_personales", detalle={"fotos": borrar_fotos, "posiciones": borrar_posiciones})

    return {
        "status": "ok",
        "accion": "borrar",
        "antes": antes,
        "borrado": borrado,
        "queda": queda,
    }


@router.post("/api/admin/simulation/run")
async def run_simulation_endpoint(request: Request):
    """El banco de pruebas del panel: N jugadores simulados recorriendo la
    misión real -no una de mentira-. Ver backend/app/runtime/simulation_bench.py
    para el cómo y el porqué."""
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error"})
    if main.admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    stages = main.get_runtime_stages()
    if not stages:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "no hay nodos guardados: no hay ruta que simular"},
        )

    forzar = _as_bool(data.get("force"))
    if not forzar:
        en_marcha = main.simulation_bench_jugadores_reales_en_marcha()
        if en_marcha:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "error",
                    "detail": "hay jugadores de verdad con la ruta empezada",
                    "players_in_progress": en_marcha,
                },
            )

    jugadores = _entradas.entero_seguro(data.get("player_count"), 3)
    dispositivo = _as_str(data.get("device") or "mixed").strip().lower()
    red = _as_str(data.get("network") or "mala").strip().lower()

    informe = await main.run_simulation_bench(jugadores, dispositivo, red)
    _auditar(request, "simulacion", detalle={"jugadores": jugadores, "red": red, "forzado": forzar})
    return {"status": "ok", "report": informe}


@router.post("/api/admin/simulation/long-session")
async def run_long_session_pause_endpoint(request: Request):
    """"¿Se guarda bien todo?": un jugador de mentira juega hasta la mitad
    de la ruta, cierra esa sesión, y retoma con un token nuevo desde donde
    dice el SERVIDOR que se quedó. Ver
    backend/app/runtime/simulation_bench.py::simular_partida_larga_con_pausa."""
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error"})
    if main.admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    stages = main.get_runtime_stages()
    if not stages:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "detail": "no hay nodos guardados: no hay ruta que simular"},
        )

    forzar = _as_bool(data.get("force"))
    if not forzar:
        en_marcha = main.simulation_bench_jugadores_reales_en_marcha()
        if en_marcha:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "error",
                    "detail": "hay jugadores de verdad con la ruta empezada",
                    "players_in_progress": en_marcha,
                },
            )

    dispositivo = _as_str(data.get("device") or "mixed").strip().lower()
    punto_de_pausa = data.get("pause_at", 0.5)
    try:
        punto_de_pausa = max(0.1, min(0.9, float(punto_de_pausa)))
    except (TypeError, ValueError):
        punto_de_pausa = 0.5

    informe = await main.run_long_session_pause_bench(dispositivo, punto_de_pausa)
    return {"status": "ok", "report": informe}


@router.post("/api/admin/simulation/cleanup")
async def cleanup_simulation_endpoint(request: Request):
    """Borra el rastro (SIM_*) que deja el banco de pruebas: nivel, cronómetros
    y posición en vivo. Nunca toca jugadores de verdad -sólo mira el prefijo-."""
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error"})
    if main.admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    borrados = main.limpiar_rastro_de_simulacion()
    _auditar(request, "limpiar_simulacion")
    return {"status": "ok", "cleaned": borrados}


@router.post("/api/admin/simulation/browser-session/start")
async def start_browser_simulation_session_endpoint(request: Request):
    """Abre la puerta para un navegador DE VERDAD -Playwright u otra
    herramienta externa, no el banco httpx-en-proceso-: registra N SIM_XX
    como perfiles conocidos y devuelve un token de sesión de jugador ya
    firmado para cada uno, listo para meter como cookie `saga_player_session`
    en un contexto de navegador real. A diferencia de .../run, aquí no se
    ejecuta ni se mueve nada -solo se entregan las llaves-. Ver
    `main.registrar_jugadores_de_simulacion`. Hay que llamar a .../stop al
    terminar, o los SIM_XX se quedan como perfiles conocidos."""
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error"})
    if main.admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    jugadores = _entradas.entero_seguro(data.get("player_count"), 1)

    nombres = main.registrar_jugadores_de_simulacion(jugadores)
    tokens = main.mint_simulation_player_tokens(nombres)
    return {
        "status": "ok",
        "cookie_name": main.PLAYER_SESSION_COOKIE,
        "players": [{"name": nombre, "token": tokens[nombre]} for nombre in nombres],
    }


@router.post("/api/admin/simulation/browser-session/stop")
async def stop_browser_simulation_session_endpoint(request: Request):
    """Cierra lo que abrió .../start: quita los SIM_XX de la lista de
    perfiles conocidos. No borra progreso ni posición -para eso sigue
    haciendo falta /api/admin/simulation/cleanup-."""
    import main

    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error"})
    if main.admin_password_change_required():
        return JSONResponse(status_code=403, content={"status": "error", "detail": "password change required"})

    main.quitar_jugadores_de_simulacion()
    return {"status": "ok"}


async def _cuerpo_o_vacio(request: Request) -> dict:
    try:
        datos = await _entradas.leer_cuerpo_json(request)
    except HTTPException:
        return {}
    return datos if isinstance(datos, dict) else {}


@router.post("/api/admin/road-graph/status")
async def road_graph_status(request: Request):
    """¿Hay red de caminos preparada? De cuándo, cuánto pesa, cuántos tramos."""
    import main
    from backend.app.runtime import road_graph

    data = await _cuerpo_o_vacio(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo
    return {"status": "ok", **road_graph.estado(main.DATA_DIR)}


@router.post("/api/admin/road-graph/build")
async def road_graph_build(request: Request):
    """
    Descarga de OpenStreetMap la red de caminos alrededor de la ruta y la
    guarda como grafo para el paquete offline.

    Tarda entre medio minuto y dos: Overpass es un servicio público y
    compartido. Se hace desde el panel, una vez por ruta (y otra si la ruta
    cambia de zona), nunca desde el móvil del jugador.
    """
    import main
    from backend.app.runtime import road_graph

    data = await _cuerpo_o_vacio(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo
    if main._httpx is None:
        return JSONResponse(status_code=500, content={"status": "error", "detail": "httpx not available"})

    puntos = []
    for stage in main.get_runtime_stages():
        lat, lon = stage.get("lat"), stage.get("lon")
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            puntos.append((float(lat), float(lon)))
        for p in stage.get("route_track") or []:
            if isinstance(p, (list, tuple)) and len(p) >= 2:
                try:
                    puntos.append((float(p[0]), float(p[1])))
                except (TypeError, ValueError):
                    pass
            elif isinstance(p, dict):
                try:
                    puntos.append((float(p.get("lat")), float(p.get("lon", p.get("lng")))))
                except (TypeError, ValueError):
                    pass
    if not puntos:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "la ruta no tiene nodos con posición"})

    try:
        margen = float((data or {}).get("margen_km") or 12)
    except (TypeError, ValueError):
        margen = 12.0
    # Hasta 45 km: la red tiene que cubrir desde donde la gente LLEGA a la
    # ruta (el pueblo de al lado, el aparcamiento), no sólo la ruta. Con 12
    # km, quien probaba desde casa a 35 km veía la guía recta y creía que
    # no funcionaba. A 40 km el grafo ronda los 15-20 MB en el paquete.
    margen = max(3.0, min(45.0, margen))

    # En segundo plano. Con 40 km son unas 25 baldosas con pausas entre
    # ellas: cinco o seis minutos. Una petición HTTP tan larga caduca por el
    # camino (túnel, navegador); el panel arranca la construcción y va
    # preguntando por ella con /road-graph/status.
    if road_graph.construccion.get("en_curso"):
        return {"status": "ok", "arrancada": False, **road_graph.estado(main.DATA_DIR)}

    import asyncio

    async def _construir():
        try:
            await road_graph.descargar_y_construir(main._httpx, puntos, margen, main.DATA_DIR)
        except Exception:
            pass  # el error queda en road_graph.construccion["error"]

    asyncio.create_task(_construir())
    road_graph.construccion.update({"en_curso": True, "hechas": 0, "total": 0, "error": "", "margen_km": margen})
    return {"status": "ok", "arrancada": True, **road_graph.estado(main.DATA_DIR)}


#: El proceso que prepara el mapa 3D (relieve del IGN + edificios del Catastro).
#: Va en un proceso aparte, no en un hilo: son minutos de cálculo en Python puro
#: que, en el mismo proceso, frenarían a todos los jugadores (GIL).
_PROCESO_MAPA3D: dict = {"p": None}


def _mapa3d_en_curso() -> bool:
    proceso = _PROCESO_MAPA3D["p"]
    return proceso is not None and proceso.poll() is None


@router.post("/api/admin/mapa3d/status")
async def mapa3d_status(request: Request):
    """¿Está preparado el mapa 3D de la zona? Y, si se está preparando, por dónde va."""
    import main
    from backend.app.runtime import mapa3d

    data = await _cuerpo_o_vacio(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo
    return {"status": "ok", **mapa3d.estado(main.DATA_DIR, en_curso=_mapa3d_en_curso())}


@router.post("/api/admin/mapa3d/build")
async def mapa3d_build(request: Request):
    """
    Prepara el relieve del IGN (MDT05/MDT25 → teselas z11-z15) y los edificios del
    Catastro de la caja de la misión. Tarda unos minutos (el WCS del IGN tarda
    ~25 s por petición): arranca y se pregunta por el progreso con /status.
    """
    import os
    import subprocess
    import sys
    from pathlib import Path

    import main
    from backend.app.runtime import mapa3d

    data = await _cuerpo_o_vacio(request)
    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})
    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo
    if _mapa3d_en_curso():
        return {"status": "ok", "arrancada": False, **mapa3d.estado(main.DATA_DIR, en_curso=True)}
    caja = await run_in_threadpool(_teselas.caja_de_la_mision)
    if caja is None:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "la ruta no tiene nodos con posición"})
    solo = (data or {}).get("solo")
    raiz = Path(__file__).resolve().parents[3]
    orden = [sys.executable, "-m", "backend.app.runtime.mapa3d",
             "--caja", ",".join("%.6f" % v for v in caja), "--data-dir", str(main.DATA_DIR)]
    if solo in ("relieve", "edificios", "satelite"):
        orden += ["--solo", solo]
    mapa3d.escribir_json(Path(main.DATA_DIR) / mapa3d.FICHERO_PROGRESO,
                         {"fase": "arrancando", "hechas": 0, "total": 0, "error": "", "avisos": []})
    _PROCESO_MAPA3D["p"] = subprocess.Popen(
        orden, cwd=str(raiz), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=dict(os.environ)
    )
    return {"status": "ok", "arrancada": True, **mapa3d.estado(main.DATA_DIR, en_curso=True)}

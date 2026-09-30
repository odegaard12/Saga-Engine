import copy
import threading
import time
from fastapi import APIRouter, Request, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from backend.app.runtime import descargas as _descargas
from backend.app.runtime import entradas as _entradas
from backend.app.runtime import purga_datos as _purga
from backend.app.runtime import revisiones as _revisiones
from backend.app.runtime import teselas as _teselas
from backend.app.runtime.core_engine import _as_str, _as_bool, normalize_stage
from backend.app.runtime.game_registry import (
    DISPLAY_FAMILIES as REGISTRY_DISPLAY_FAMILIES,
    FAMILIES as REGISTRY_FAMILIES,
    GAME_ID_DISPLAY_FAMILY as REGISTRY_GAME_ID_DISPLAY_FAMILY,
    TYPE_DISPLAY_FAMILY_FALLBACK as REGISTRY_TYPE_DISPLAY_FAMILY_FALLBACK,
)
from backend.app.security import client_ip as _client_ip
from backend.app.storage import json_store as _json_store

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
    main.save_player_inventory(
        profile_id,
        {
            "user": profile_id,
            "updated_at": "",
            "items": [],
            "reset_at": int(time.time() * 1000),
        },
    )

    main.clear_live_position(profile_id)


MAX_PERFILES = 60
MAX_AVATAR_CHARS = 400_000  # ~300 KB de foto ya comprimida en data URI


def _normalize_incoming_profiles(raw):
    """Valida las fichas de jugador que llegan del panel.

    Devuelve None si no venían (para no pisar las guardadas) y una lista limpia
    si venían. Los ids se deduplican porque son la clave con la que el jugador
    entra: dos iguales harían que compartiesen partida sin saberlo.
    """
    if not isinstance(raw, list):
        return None

    perfiles = []
    vistos = set()

    for index, item in enumerate(raw[:MAX_PERFILES]):
        if not isinstance(item, dict):
            continue

        pid = _as_str(item.get("id")).strip()[:120] or f"PLAYER {index + 1}"
        if pid in vistos:
            continue
        vistos.add(pid)

        avatar = _as_str(item.get("avatar_url")).strip()
        if len(avatar) > MAX_AVATAR_CHARS:
            # Mejor sin foto que romper el fichero de configuración entero.
            avatar = ""

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

    return await run_in_threadpool(_copia_de_respaldo, main)


def _resumen_del_panel(main):
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
        "player_profiles": profiles,
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

    return await run_in_threadpool(_resumen_del_panel, main)


def _estado_de_la_mision(main):
    cfg = main.load_config()
    runtime_stages = main.get_runtime_stages()
    state = main.load_player_progress()
    positions = main.load_live_positions()
    now = int(time.time())

    items = []
    for profile in main.get_player_profiles(cfg):
        profile_id = profile.get("id")
        lvl = state.get(profile_id, 0)
        finished = lvl >= len(runtime_stages)

        current_stage = ""
        if not finished and 0 <= lvl < len(runtime_stages):
            current_stage = runtime_stages[lvl]["presentation"]["title"]

        items.append({
            **main.project_live_profile_status(profile, positions.get(profile_id), now),
            "level": lvl,
            "finished": finished,
            "current_stage": current_stage,
        })

    return {
        "status": "ok",
        "server_ts": now,
        "profiles": items
    }


@router.post("/api/admin/mission-status")
async def admin_mission_status(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)

    if not await _autorizado(main, request, data):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

    if (bloqueo := _clave_por_cambiar(main)):
        return bloqueo

    return await run_in_threadpool(_estado_de_la_mision, main)


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
        "site_name": _as_str(incoming.get("site_name") if "site_name" in incoming else cfg.get("site_name")).strip() or "SAGA Engine",
        "admin_title": _as_str(incoming.get("admin_title") if "admin_title" in incoming else cfg.get("admin_title")).strip() or "Mission Control",
        "admin_subtitle": _as_str(incoming.get("admin_subtitle") if "admin_subtitle" in incoming else cfg.get("admin_subtitle")).strip() or "Map-first control panel",
        "login_title": _as_str(incoming.get("login_title") if "login_title" in incoming else cfg.get("login_title", "")).strip(),
        "login_subtitle": _as_str(incoming.get("login_subtitle") if "login_subtitle" in incoming else cfg.get("login_subtitle", "Protected access")).strip(),
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
        "mission_launch_at": _as_str(incoming.get("mission_launch_at") if "mission_launch_at" in incoming else cfg.get("mission_launch_at", "")).strip(),
    }

    raw_center = incoming.get("map_center")
    if isinstance(raw_center, list) and len(raw_center) == 2:
        try:
            lat = float(raw_center[0])
            lon = float(raw_center[1])
            updated["map_center"] = [lat, lon]
        except (ValueError, TypeError):
            pass

    if incoming.get("map_zoom") is not None:
        try:
            updated["map_zoom"] = int(incoming["map_zoom"])
        except (ValueError, TypeError, OverflowError):
            pass

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
    perfiles = _normalize_incoming_profiles(incoming.get("player_profiles"))
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

    return {"status": "ok", "mission_pass_enabled": main.mission_gate_enabled()}


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

    # El mismo reinicio que el del panel de perfiles, no una versión corta.
    # Aquí sólo se bajaba el nivel, y eso no llega al móvil: ver
    # `reiniciar_jugador_por_completo`.
    main.set_player_progress_level(user, 0)
    reiniciar_jugador_por_completo(main, user)
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
    action = _as_str(data.get("action")).strip().lower()

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

    return await run_in_threadpool(_aplicar_accion_de_perfil, main, profile_id, action)


def _aplicar_accion_de_perfil(main, profile_id, action):
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

                inventory = _mochila_saneada(main, profile_id)
                existing = next((i for i in inventory["items"] if i.get("item_id") == item_id), None)

                if existing:
                    existing["quantity"] = existing.get("quantity", 0) + 1
                else:
                    inventory["items"].append({"item_id": item_id, "label": item_label, "state": "collected", "quantity": 1})

                main.save_player_inventory(profile_id, inventory, desde_admin=True)
    elif action == "mark_finished":
        new_level = max_level
    else:
        new_level = previous_level

    quita_objetos = False

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
            for index, stage in enumerate(runtime_stages):
                if _stage_item_id(stage) == item_id:
                    source_index = index
                    source_label = _stage_item_label(stage) or item_id
                    break

            existing = next((i for i in inventory["items"] if i.get("item_id") == item_id), None)
            if existing:
                existing["quantity"] = existing.get("quantity", 0) + 1
                if not existing.get("label") or existing.get("label") == item_id:
                    existing["label"] = source_label
            else:
                inventory["items"].append({
                    "item_id": item_id,
                    "label": source_label,
                    "state": "collected",
                    "quantity": 1,
                })

            # Entregar a mano el objeto de un nodo equivale a haberlo hecho: si
            # no, el jugador se quedaba con el objeto en la mochila y el nodo
            # seguía bloqueado delante de él.
            if source_index is not None and previous_level <= source_index:
                new_level = min(max_level, source_index + 1)
                main.set_player_progress_level(profile_id, new_level, 0, desde_admin=True)
        elif action.startswith("remove_item:"):
            item_id = action.replace("remove_item:", "")
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

    # Lo que BAJA el nivel de alguien o le QUITA objetos tiene que llegar al
    # móvil: éste ignora los niveles más bajos que el suyo y vuelve a subir su
    # mochila vieja. La única señal que le hace ceder es la marca `reset_at`
    # (`inventory_snapshot.reset_at`, ms desde la época), que se sube aquí. Así
    # el «✓ Aplicado» del panel deja de ser mentira (caza de fallos A11).
    marca = None
    if action == "reset_profile":
        marca = main.player_reset_at(profile_id)  # el reinicio ya la dejó puesta
    elif new_level < previous_level or quita_objetos:
        marca = main.bump_reset_marker(profile_id)

    return {
        "status": "ok",
        "profile_id": profile_id,
        "action": action,
        "previous_level": previous_level,
        "level": new_level,
        "finished": new_level >= max_level,
        "total_stages": max_level,
        "reset_at": marca,
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

        if _as_bool(data.get("dry_run")):
            afectados = _revisiones.calcular_afectados(
                old_stages,
                stages,
                main.load_player_progress(),
                main.get_player_profiles(),
            )
            return {
                "status": "ok",
                "dry_run": True,
                "afectados": afectados,
                "stages_revision": actual,
            }

        main.save_stages(main.STAGES_DB, stages)
        main.reindex_player_levels_on_save(old_stages, stages)
        # Los nodos definen la zona de teselas que se sirve: se recalcula.
        _teselas.olvidar_area()

        return {
            "status": "ok",
            "stages_revision": _revisiones.admin_stages_revision(main.load_stages(main.STAGES_DB)),
        }


@router.post("/api/admin/save")
async def save_stages_endpoint(request: Request):
    """Guarda los nodos de la misión.

    - `stages_revision` (opcional): la huella con la que el panel cargó los
      nodos. Si no es la actual, 409 `{status: "conflict", reason:
      "stages_changed", current_revision}`. Sin él, se guarda como siempre.
    - `dry_run: true`: valida y calcula a quién movería la reindexación SIN
      escribir nada: `{status: "ok", dry_run: true, afectados: [...]}`.
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

    return await run_in_threadpool(_guardar_mision, main, data, stages)


@router.post("/api/admin/login")
async def admin_login(request: Request):
    import main
    data = await _entradas.leer_cuerpo_json(request)
    now = time.time()
    # Los intentos fallidos se cuentan por /64 en IPv6 (quien ataca desde una
    # dirección IPv6 cambia de dirección dentro de su /64 cuando quiere).
    ip = _client_ip.lockout_key(main.get_client_ip(request))

    remaining = main.get_admin_lock_remaining_seconds(ip, now)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail=f"too many failed attempts; retry in {remaining}s"
        )

    # PBKDF2 (200 000 vueltas: décimas de segundo, más en la Raspberry) en un
    # hilo: hecho aquí, cada intento de login paraba a todos los jugadores.
    if await run_in_threadpool(main.verify_admin_password, data.get("password")):
        main.clear_admin_login_state(ip)
        expires_at = int(time.time()) + main.ADMIN_SESSION_TTL_SECONDS
        response = JSONResponse(
            {
                "status": "ok",
                "must_change": main.admin_password_change_required(),
                "session_expires_at": expires_at,
            }
        )
        main.set_admin_session_cookie(response, request, main.create_admin_session())
        return response

    main.register_admin_login_failure(ip, now)
    raise HTTPException(status_code=401, detail="invalid admin password")


@router.post("/api/admin/logout")
async def admin_logout(request: Request):
    import main
    token = request.cookies.get(main.ADMIN_SESSION_COOKIE)
    if token:
        main.ADMIN_SESSIONS.pop(token, None)
        main.admin_auth_security.clear_persistent_admin_session(main.ADMIN_SESSIONS_DB, token)

    response = JSONResponse({"status": "ok"})
    main.clear_admin_session_cookie(response, request)
    main.clear_player_session_cookie(response, request)
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

    if not await run_in_threadpool(main.verify_admin_password, current_password):
        return JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})

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

    return await run_in_threadpool(_restaurar)


CONFIRMACION_BORRADO = "BORRAR"


def _contar_datos_personales():
    """Qué hay guardado de personas ahora mismo.

    Se cuenta antes de borrar para que el panel pueda decir exactamente qué se
    va a perder. Un borrado que no dice lo que se lleva no se usa nunca, o se
    usa una vez y da un susto. Ver runtime/purga_datos.py.
    """
    return _purga.contar()


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

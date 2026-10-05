"""Vestuario desbloqueable (jugador y panel) y revisión de tiempos del panel.

Contrato completo de la API en backend/app/runtime/desbloqueos.py. Las rutas
del jugador piden la sesión firmada de ESE jugador (igual que /api/personaje);
las del panel, la sesión de administrador y la contraseña ya cambiada, como el
resto de /api/admin/*.
"""
import time

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from backend.app.routers.admin import _autorizado, _clave_por_cambiar
from backend.app.runtime import desbloqueables_catalogo as _catalogo
from backend.app.runtime import desbloqueos as _reglas
from backend.app.runtime import entradas as _entradas
from backend.app.runtime.core_engine import _as_str

from backend.app.runtime import registro_analisis as _registro  # auditoría del panel
router = APIRouter()


# ---------------------------------------------------------------------------
# Jugador
# ---------------------------------------------------------------------------

@router.get("/api/desbloqueos/{user}")
async def desbloqueos_del_jugador(user: str, request: Request):
    import main

    main.require_player_session(request, user)
    profile = main.resolve_known_player_profile(user)
    if not profile:
        return JSONResponse(status_code=404, content={"status": "error", "detail": "unknown profile"})
    return await run_in_threadpool(main._desbloqueos_glue.estado_para_jugador, _as_str(profile.get("id") or user))


@router.post("/api/desbloqueos/visto")
async def desbloqueos_vistos(request: Request):
    """Marca como vistas piezas nuevas (`claves`) y avisos (`avisos`, ids). Sin nada: todo."""
    import main

    data = await _entradas.leer_cuerpo_json(request)
    user = _as_str(data.get("user")).strip()
    if not user:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "user required"})
    main.require_player_session(request, user)
    profile = main.resolve_known_player_profile(user)
    if not profile:
        return JSONResponse(status_code=404, content={"status": "error", "detail": "unknown profile"})
    claves = data.get("claves") if isinstance(data.get("claves"), list) else None
    avisos = data.get("avisos") if isinstance(data.get("avisos"), list) else None
    claves = [_as_str(c)[:60] for c in claves[:100]] if claves is not None else None
    return await run_in_threadpool(
        main._desbloqueos_glue.marcar_visto, _as_str(profile.get("id") or user), claves, avisos
    )


# ---------------------------------------------------------------------------
# Panel
# ---------------------------------------------------------------------------

async def _puerta_admin(main, request: Request):
    data = await _entradas.leer_cuerpo_json(request)
    if not await _autorizado(main, request, data):
        return data, JSONResponse(status_code=403, content={"status": "error", "detail": "bad password"})
    if (bloqueo := _clave_por_cambiar(main)):
        return data, bloqueo
    return data, None


def _resumen_desbloqueables(main):
    glue = main._desbloqueos_glue
    cfg = glue.config()
    bloq = _reglas.bloqueadas(cfg)
    stages = main.get_runtime_stages()
    titulos = glue._titulos_de_nodos(stages)
    pistas = _reglas.pistas(cfg["reglas"], sorted(bloq), titulos)
    catalogo = []
    for pieza in _catalogo.catalogo(bloq):
        if not pieza["libre"]:
            pieza["se_consigue"] = pistas.get(pieza["clave"], "")
            pieza["sin_regla"] = not any(pieza["clave"] in r["da"] for r in cfg["reglas"])
        catalogo.append(pieza)

    filas = glue._store.listar(glue.db_path(), incluir_retirados=True)
    jugadores = []
    for perfil in main.get_player_profiles(main.load_config()):
        pid = _as_str(perfil.get("id"))
        if not pid:
            continue
        piezas = {
            f["clave"]: {
                "por": f["por"], "fuente": f["fuente"], "sospecha": bool(f["sospecha"]),
                "concedido_ms": f["concedido_ms"], "retirado": f["retirado_ms"] is not None,
            }
            for f in filas if f["jugador"] == pid
        }
        jugadores.append({"user": pid, "display_name": perfil.get("display_name") or pid, "piezas": piezas,
                          "metros": glue._store.metros(glue.db_path(), pid)})

    return {
        "status": "ok",
        "config": cfg,
        "catalogo": catalogo,
        "reglas": [{**r, "texto": _reglas.texto_de_regla(r, titulos)} for r in cfg["reglas"]],
        "propuesta": _reglas.propuesta_de_reglas(),
        "tipos": [{"tipo": t, **d} for t, d in _reglas.TIPOS.items()],
        "nodos": [{"id": k, "title": v} for k, v in titulos.items()],
        "jugadores": jugadores,
        "eventos": glue._store.registro(glue.db_path(), 150),
        "combinaciones_libres": _catalogo.combinaciones_libres(bloq),
    }


@router.post("/api/admin/desbloqueables")
async def admin_desbloqueables(request: Request):
    """Catálogo (libre/bloqueado), reglas, matriz jugador×pieza y eventos."""
    import main

    _, error = await _puerta_admin(main, request)
    if error:
        return error
    return await run_in_threadpool(_resumen_desbloqueables, main)


@router.post("/api/admin/desbloqueables/guardar")
async def admin_desbloqueables_guardar(request: Request):
    """`{revision, activos?, reglas?, bloqueados?, aplicar_a_lo_jugado?}`.

    409 si la revisión cambió entretanto. Encender el interruptor sustituye las
    piezas bloqueadas que lleve alguien (sin legado) y aplica las reglas a lo
    ya jugado: conviene llamar antes a `/ensayar` para enseñar a quién.
    """
    import main

    data, error = await _puerta_admin(main, request)
    if error:
        return error
    resultado = await run_in_threadpool(
        main._desbloqueos_glue.guardar_config, data, aplicar_a_lo_jugado=data.get("aplicar_a_lo_jugado") is True
    )
    if resultado["status"] == "conflict":
        return JSONResponse(status_code=409, content={"status": "error", "detail": "revision_conflict", **resultado})
    if resultado["status"] == "invalid":
        return JSONResponse(status_code=400, content={"status": "error", "detail": "invalid_rules", **resultado})
    _registro.auditar(request, "vestuario:guardar_reglas", detalle={"aplicar_a_lo_jugado": data.get("aplicar_a_lo_jugado") is True})
    return resultado


@router.post("/api/admin/desbloqueables/ensayar")
async def admin_desbloqueables_ensayar(request: Request):
    """¿A quién se le daría qué? `{reglas?: [...], bloqueados?: [...], activar?: bool}`. No escribe nada.

    Sin `reglas`, las guardadas. Con `activar` (o con otras `bloqueados`), además
    las sustituciones de avatar que haría la migración sin legado.
    """
    import main

    data, error = await _puerta_admin(main, request)
    if error:
        return error
    glue = main._desbloqueos_glue

    def _ensayar():
        cfg = glue.config()
        reglas, errores = (_reglas.normalizar_reglas(data["reglas"]) if "reglas" in data else (cfg["reglas"], []))
        if errores:
            return JSONResponse(status_code=400, content={"status": "error", "detail": "invalid_rules", "errores": errores})
        respuesta = {"status": "ok", "concederia": glue.ensayar(reglas), "sustituciones": []}
        if data.get("activar") is True or "bloqueados" in data:
            simulada = {**cfg, "reglas": reglas}
            if "bloqueados" in data:
                simulada["bloqueados"] = data.get("bloqueados") if isinstance(data.get("bloqueados"), list) else None
            respuesta["sustituciones"] = glue.sustituciones(simulada, simular=True)
        return respuesta

    return await run_in_threadpool(_ensayar)


@router.post("/api/admin/desbloqueos/conceder")
async def admin_desbloqueos_conceder(request: Request):
    """Regalo del organizador: `{jugadores: [...] | todos: true, claves: [...], motivo}`."""
    import main

    data, error = await _puerta_admin(main, request)
    if error:
        return error
    claves = [_as_str(c) for c in (data.get("claves") or []) if _as_str(c) in _catalogo.CLAVES] if isinstance(data.get("claves"), list) else []
    if not claves:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "claves required"})
    if data.get("todos") is True:
        jugadores = [_as_str(p.get("id")) for p in main.get_player_profiles(main.load_config()) if p.get("id")]
    else:
        conocidos = {_as_str(p.get("id")) for p in main.get_player_profiles(main.load_config())}
        jugadores = [_as_str(j) for j in (data.get("jugadores") or []) if _as_str(j) in conocidos] if isinstance(data.get("jugadores"), list) else []
    if not jugadores:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "jugadores required"})
    concedidos = await run_in_threadpool(main._desbloqueos_glue.conceder_admin, jugadores, claves, _as_str(data.get("motivo")))
    _registro.auditar(request, "vestuario:conceder", ", ".join(jugadores)[:160], {"claves": claves[:20]})
    return {"status": "ok", "concedidos": concedidos}


@router.post("/api/admin/desbloqueos/retirar")
async def admin_desbloqueos_retirar(request: Request):
    """`{jugador, clave, motivo}`. Si la llevaba puesta, su avatar pasa a un sustituto libre."""
    import main

    data, error = await _puerta_admin(main, request)
    if error:
        return error
    jugador = _as_str(data.get("jugador")).strip()
    clave = _as_str(data.get("clave")).strip()
    if not jugador or clave not in _catalogo.CLAVES:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "jugador y clave required"})
    resultado = await run_in_threadpool(main._desbloqueos_glue.retirar_admin, jugador, clave, _as_str(data.get("motivo")))
    _registro.auditar(request, "vestuario:retirar", jugador, {"clave": clave})
    return {"status": "ok", **resultado}


# ---------------------------------------------------------------------------
# Revisión de tiempos antes de dar el premio
# ---------------------------------------------------------------------------

def _tiempos_para_revisar(main):
    """Por jugador y nodo: declarado, observado, aplicado, penalización y sospechas."""
    cfg = main.load_config()
    stages = main.get_runtime_stages()
    titulos = main._desbloqueos_glue._titulos_de_nodos(stages)
    timers = main.load_player_timers()
    progreso = main.load_player_progress()
    sospechas = main.list_anti_cheat_suspicions()
    jugadores = []
    for perfil in main.get_player_profiles(cfg):
        pid = _as_str(perfil.get("id"))
        if not pid:
            continue
        entrada = timers.get(pid) if isinstance(timers.get(pid), dict) else {}
        lista_sospechas = sospechas.get(pid) if isinstance(sospechas.get(pid), list) else []
        registros = entrada.get("nodos") if isinstance(entrada.get("nodos"), dict) else {}
        tiempos = entrada.get("stage_times_ms") if isinstance(entrada.get("stage_times_ms"), dict) else {}
        nivel = int(progreso.get(pid, 0) or 0) if isinstance(progreso, dict) else 0
        nodos = []
        for lvl in range(min(nivel, len(stages))):
            node_id = _as_str(stages[lvl].get("id"))
            registro = registros.get(str(lvl)) if isinstance(registros.get(str(lvl)), dict) else None
            if registro and registro.get("node_id"):
                node_id = _as_str(registro.get("node_id"))
            de_este = [s for s in lista_sospechas if _as_str((s.get("evidence") or {}).get("node_id")) == node_id]
            nodos.append({
                "level": lvl,
                "node_id": node_id,
                "title": titulos.get(node_id, node_id),
                "declared_ms": (registro or {}).get("declared_ms"),
                "observed_ms": (registro or {}).get("observed_ms"),
                "applied_ms": (registro or {}).get("applied_ms", tiempos.get(str(lvl), 0)),
                "fuente": (registro or {}).get("fuente", "sin_registro"),
                "penalty_ms": (registro or {}).get("penalty_ms"),
                "manual": (registro or {}).get("manual"),
                "origen": (registro or {}).get("origen"),
                "opened_at_ms": (registro or {}).get("opened_at_ms"),
                "completed_at_ms": (registro or {}).get("completed_at_ms"),
                # Cómo se comprobó la proximidad (modo_prueba / sin_gps / cerca /
                # lejos) y si el nodo se hizo en modo prueba: para que el
                # organizador lo valore en la clasificación. No penaliza nada.
                "proximidad": (registro or {}).get("proximidad"),
                "prueba": bool((registro or {}).get("prueba")),
                "sospechas": [
                    {"reason": s.get("reason"), "severity": s.get("severity"), "at": s.get("at")}
                    for s in de_este
                ],
            })
        total = sum(int(v or 0) for v in tiempos.values()) + int(entrada.get("penalties_ms") or 0)
        jugadores.append({
            "user": pid,
            "display_name": perfil.get("display_name") or pid,
            "level": nivel,
            "finished": len(stages) > 0 and nivel >= len(stages),
            "finished_at": entrada.get("finished_at") if len(stages) > 0 and nivel >= len(stages) else None,
            "total_time_ms": total,
            "penalties_ms": int(entrada.get("penalties_ms") or 0),
            "suspicion_count": sum(1 for s in lista_sospechas if s.get("severity") != "info"),
            # Nodos (ids) hechos en modo prueba o sin GPS: a la vista, sin castigo.
            "nodos_modo_prueba": [n["node_id"] for n in nodos if n["prueba"] or n["proximidad"] == "modo_prueba"],
            "nodos_sin_gps": [n["node_id"] for n in nodos if n["proximidad"] == "sin_gps"],
            "nodos": nodos,
        })

    def _orden(j):
        return (0 if j["finished"] else 1, -j["level"], j["total_time_ms"] or 10**15, j["finished_at"] or 10**15, j["display_name"])

    jugadores.sort(key=_orden)
    return {"status": "ok", "server_ts": int(time.time()), "total_nodes": len(stages), "jugadores": jugadores}


@router.post("/api/admin/tiempos")
async def admin_tiempos(request: Request):
    """Sólo lectura: el tiempo de cada nodo tal como lo calculó el servidor."""
    import main

    _, error = await _puerta_admin(main, request)
    if error:
        return error
    return await run_in_threadpool(_tiempos_para_revisar, main)

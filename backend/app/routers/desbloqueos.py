"""Vestuario desbloqueable (jugador y panel) y revisión de tiempos del panel.

Contrato completo de la API en backend/app/runtime/desbloqueos.py. Las rutas
del jugador piden la sesión firmada de ESE jugador (igual que /api/personaje);
las del panel, la sesión de administrador y la contraseña ya cambiada, como el
resto de /api/admin/*.
"""
import hashlib
import json
import threading
import time

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from backend.app.routers.admin import _autorizado, _clave_por_cambiar
from backend.app.runtime import desbloqueables_catalogo as _catalogo
from backend.app.runtime import player_timers as _player_timers
from backend.app.runtime import desbloqueos as _reglas
from backend.app.runtime import entradas as _entradas
from backend.app.runtime import operaciones_admin as _operaciones
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


@router.post("/api/desbloqueos/comprar")
async def desbloqueos_comprar(request: Request):
    """Compra una pieza bloqueada con estrellas: `{user, clave}`. Devuelve el estado nuevo de la tienda."""
    import main
    from backend.app.routers.game import candado_del_jugador

    data = await _entradas.leer_cuerpo_json(request)
    user = _as_str(data.get("user")).strip()
    clave = _as_str(data.get("clave")).strip()[:60]
    if not user or not clave:
        return JSONResponse(status_code=400, content={"status": "error", "detail": "user y clave required"})
    main.require_player_session(request, user)
    profile = main.resolve_known_player_profile(user)
    if not profile:
        return JSONResponse(status_code=404, content={"status": "error", "detail": "unknown profile"})
    pid = _as_str(profile.get("id") or user)

    def _hacer():
        # Con el candado del jugador, el mismo que su avance: dos toques seguidos no gastan la misma estrella.
        with candado_del_jugador(pid):
            resultado = main._desbloqueos_glue.comprar(pid, clave)
            return resultado, main._desbloqueos_glue.estado_para_jugador(pid)

    resultado, estado = await run_in_threadpool(_hacer)
    if resultado.get("status") != "ok":
        return JSONResponse(status_code=409, content={**resultado, "estado": estado})
    main.match_log_record("estrellas_gastadas", pid, payload={"clave": clave, "precio": resultado.get("precio")}, profile=profile)
    return {**resultado, "estado": estado}


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

#: Las operaciones del panel que tocan a VARIOS jugadores (regalar piezas, estrellas) se identifican por `op_id` y por lo
#: que se pidió; dos peticiones iguales a la vez no se aplican las dos (15/11: con poca cobertura, repetir «+5
#: estrellas» tras una respuesta perdida podía sumarlas dos veces).
_CERROJO_OPERACIONES = threading.Lock()


def _error(status, detail, mensaje):
    """`detail` es el código para los clientes; `mensaje`, el texto en castellano para el organizador."""
    return JSONResponse(status_code=status, content={"status": "error", "detail": detail, "mensaje": mensaje})


def _una_vez(main, op_id, accion, cuerpo, aplicar):
    """(resultado, repetida): `aplicar()` una sola vez por `op_id`. El mismo `op_id` con otro cuerpo no es un
    reintento: lanza `OperacionReutilizada`."""
    if not op_id:
        return aplicar(), False
    huella = hashlib.sha1(json.dumps(cuerpo, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()[:10]
    clave = f"{accion}|{huella}"[:60]
    with _CERROJO_OPERACIONES:
        previa = _operaciones.buscar(main.ADMIN_OPS_DB, op_id, "*panel*", clave)
        if previa is not None:
            return previa, True
        resultado = aplicar()
        _operaciones.anotar(main.ADMIN_OPS_DB, op_id, "*panel*", clave, resultado)
        return resultado, False


def _huella_en_el_registro(main, jugadores, accion, payload):
    """Cada regalo o retirada del organizador queda en el Registro de partida del jugador (15/11). Nunca lanza."""
    for pid in list(jugadores)[:30]:
        try:
            main.match_log_record(
                "accion_de_admin", pid, payload={"accion": accion, **payload}, profile=main.resolve_known_player_profile(pid)
            )
        except Exception:  # noqa: BLE001 - anotar no puede tumbar el regalo
            pass


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
                          "metros": glue._store.metros(glue.db_path(), pid),
                          "estrellas": glue.estrellas_de(pid, cfg, stages=stages)})

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
        return _error(400, "claves required", "Elige al menos una pieza.")
    if data.get("todos") is True:
        jugadores = [_as_str(p.get("id")) for p in main.get_player_profiles(main.load_config()) if p.get("id")]
    else:
        conocidos = {_as_str(p.get("id")) for p in main.get_player_profiles(main.load_config())}
        jugadores = [_as_str(j) for j in (data.get("jugadores") or []) if _as_str(j) in conocidos] if isinstance(data.get("jugadores"), list) else []
    if not jugadores:
        return _error(400, "jugadores required", "Elige al menos un jugador.")
    motivo = _entradas.texto_seguro(data.get("motivo"), 120).strip()
    glue = main._desbloqueos_glue

    def _aplicar():
        concedidos = glue.conceder_admin(jugadores, claves, motivo)
        return {
            "status": "ok",
            "concedidos": concedidos,
            # Lo concedido con su nombre, y el saldo de estrellas de cada uno (para que el panel no tenga que volver
            # a pedir la tabla de 28 KB).
            "etiquetas": {c: _catalogo.nombre_de(c) for c in claves},
            "saldos": {pid: glue.estrellas_de(pid)["saldo"] for pid in concedidos},
        }

    try:
        resultado, repetida = await run_in_threadpool(
            _una_vez, main, _operaciones.id_valido(data.get("op_id")), "vestuario:conceder",
            {"jugadores": sorted(jugadores), "claves": sorted(claves), "motivo": motivo}, _aplicar
        )
    except _operaciones.OperacionReutilizada:
        return _error(409, "op_id reused", "Esa operación ya se había enviado con otros datos. Comprueba el estado antes de repetirla.")
    if not repetida:
        _registro.auditar(request, "vestuario:conceder", ", ".join(jugadores)[:160], {"claves": claves[:20]})
        for pid, nuevas in (resultado.get("concedidos") or {}).items():
            _huella_en_el_registro(main, [pid], "vestuario:conceder", {"claves": list(nuevas)[:10], **({"motivo": motivo} if motivo else {})})
    return {**resultado, **({"repetida": True} if repetida else {})}


@router.post("/api/admin/estrellas")
async def admin_estrellas(request: Request):
    """Regalo del organizador: `{jugadores: [...] | todos: true, cantidad}` (negativa = quitar). Devuelve el saldo nuevo."""
    import main

    data, error = await _puerta_admin(main, request)
    if error:
        return error
    # Sólo enteros: un 2,5 se daba como 2 (y el panel avisaba de +2,5) y un `true` como 1. Acotada a lo que guarda el
    # monedero, para que lo auditado sea lo dado.
    crudo = data.get("cantidad")
    if isinstance(crudo, float) and crudo.is_integer():
        crudo = int(crudo)
    if isinstance(crudo, bool) or not isinstance(crudo, (int, str)):
        crudo = None
    try:
        cantidad = max(-1000, min(1000, int(crudo)))
    except (TypeError, ValueError):
        return _error(400, "cantidad required", "Indica cuántas estrellas: un número entero distinto de 0.")
    conocidos = {_as_str(p.get("id")) for p in main.get_player_profiles(main.load_config())}
    if data.get("todos") is True:
        jugadores = sorted(c for c in conocidos if c)
    else:
        jugadores = [_as_str(j) for j in (data.get("jugadores") or []) if _as_str(j) in conocidos] if isinstance(data.get("jugadores"), list) else []
    if not jugadores or not cantidad:
        return _error(400, "jugadores y cantidad required", "Elige al menos un jugador e indica cuántas estrellas.")
    glue = main._desbloqueos_glue

    def _aplicar():
        antes = {pid: glue.estrellas_de(pid)["saldo"] for pid in jugadores}
        saldos = glue.regalar_estrellas(jugadores, cantidad)
        # Lo que de verdad cambió (quitar no deja deuda: a quien tenía 5 un -50 le quita 5).
        return {"status": "ok", "saldos": saldos, "aplicadas": {pid: saldos[pid] - antes[pid] for pid in saldos}, "cantidad": cantidad}

    try:
        resultado, repetida = await run_in_threadpool(
            _una_vez, main, _operaciones.id_valido(data.get("op_id")), "vestuario:estrellas",
            {"jugadores": sorted(jugadores), "cantidad": cantidad}, _aplicar
        )
    except _operaciones.OperacionReutilizada:
        return _error(409, "op_id reused", "Esa operación ya se había enviado con otros datos. Comprueba el saldo antes de repetirla.")
    if not repetida:
        _registro.auditar(request, "vestuario:estrellas", ", ".join(jugadores)[:160], {"cantidad": cantidad})
        for pid, aplicada in (resultado.get("aplicadas") or {}).items():
            _huella_en_el_registro(main, [pid], "vestuario:estrellas", {"estrellas": aplicada, "saldo": resultado["saldos"].get(pid)})
    return {**resultado, **({"repetida": True} if repetida else {})}


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
        return _error(400, "jugador y clave required", "Elige un jugador y una pieza.")
    motivo = _entradas.texto_seguro(data.get("motivo"), 120).strip()
    glue = main._desbloqueos_glue

    def _aplicar():
        r = glue.retirar_admin(jugador, clave, motivo)
        return {"status": "ok", **r, "etiqueta": _catalogo.nombre_de(clave), "saldo": glue.estrellas_de(jugador)["saldo"]}

    try:
        resultado, repetida = await run_in_threadpool(
            _una_vez, main, _operaciones.id_valido(data.get("op_id")), "vestuario:retirar",
            {"jugador": jugador, "clave": clave, "motivo": motivo}, _aplicar
        )
    except _operaciones.OperacionReutilizada:
        return _error(409, "op_id reused", "Esa operación ya se había enviado con otros datos. Comprueba el estado antes de repetirla.")
    if not repetida:
        _registro.auditar(request, "vestuario:retirar", jugador, {"clave": clave})
        _huella_en_el_registro(main, [jugador], "vestuario:retirar", {"clave": clave, **({"motivo": motivo} if motivo else {})})
    return {**resultado, **({"repetida": True} if repetida else {})}


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
                "sospechoso": bool((registro or {}).get("sospechoso")),
                "sospechas": [
                    {"reason": s.get("reason"), "severity": s.get("severity"), "at": s.get("at")}
                    for s in de_este
                ],
            })
        total = _player_timers.total_de_la_entrada({**entrada, "stage_times_ms": tiempos})
        jugadores.append({
            "user": pid,
            "display_name": perfil.get("display_name") or pid,
            "level": nivel,
            "finished": len(stages) > 0 and nivel >= len(stages),
            "finished_at": _player_timers.fin_de_la_entrada(entrada) if len(stages) > 0 and nivel >= len(stages) else None,
            "total_time_ms": total,
            "penalties_ms": int(entrada.get("penalties_ms") or 0),
            "descuento_ms": int(entrada.get("descuento_ms") or 0),
            # 14/11: lo que el organizador ha sumado o restado a mano (con signo) y las últimas anotaciones.
            "ajuste_admin_ms": int(entrada.get("ajuste_admin_ms") or 0),
            "ajustes_admin": [a for a in (entrada.get("ajustes_admin") or []) if isinstance(a, dict)][-10:],
            "suspicion_count": sum(1 for s in lista_sospechas if s.get("severity") != "info"),
            # Nodos (ids) hechos en modo prueba o sin GPS: a la vista, sin castigo.
            "nodos_modo_prueba": [n["node_id"] for n in nodos if n["prueba"] or n["proximidad"] == "modo_prueba"],
            "nodos_sin_gps": [n["node_id"] for n in nodos if n["proximidad"] == "sin_gps"],
            "nodos": nodos,
        })
        # 25/10 (auditoría): el modo prueba lo puede declarar el propio móvil (latido con GPS manual) y entonces la
        # proximidad no bloquea. No se le quita al organizador, pero quien tenga nodos en modo prueba o marcados como
        # sospechosos (p. ej. un minijuego sin ninguna apertura) queda «no apto para premio» a la vista del panel.
        ultimo = jugadores[-1]
        ultimo["apto_premio"] = not ultimo["nodos_modo_prueba"] and not any(n["sospechoso"] for n in nodos)

    # El mismo orden que la clasificación del móvil (23/10): un terminado con
    # total 0 va DETRÁS de los terminados con tiempo, no primero. La exportación
    # (exportar_partida.py) lee esta misma lista y hereda el orden.
    jugadores.sort(key=_player_timers.clave_de_clasificacion)
    return {"status": "ok", "server_ts": int(time.time()), "total_nodes": len(stages), "jugadores": jugadores}


@router.post("/api/admin/tiempos")
async def admin_tiempos(request: Request):
    """Sólo lectura: el tiempo de cada nodo tal como lo calculó el servidor."""
    import main

    _, error = await _puerta_admin(main, request)
    if error:
        return error
    return await run_in_threadpool(_tiempos_para_revisar, main)

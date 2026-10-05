"""Desbloqueables: lo que necesita a `main` (configuración, jugadores, tiempos, fotos).

La lógica pura vive en desbloqueos.py (reglas y evaluación) y
desbloqueables_catalogo.py (claves, kit libre, sustitutos); lo guardado, en
storage/desbloqueos_store.py. Aquí se juntan: igual que los otros `*_glue`,
todo lo de `main` se pide como `main.NOMBRE` al llamar, así los tests que
cambian rutas o funciones de `main` siguen mandando.

Nada de esto hace nada con el interruptor apagado (`activos: false`, el valor
por defecto): ni concede, ni cuenta metros, ni bloquea el guardado del avatar.
"""
from __future__ import annotations

import logging
import os
import threading

from backend.app.runtime import desbloqueables_catalogo as _catalogo
from backend.app.runtime import desbloqueos as _reglas
from backend.app.storage import desbloqueos_store as _store

_log = logging.getLogger("saga.desbloqueos")
_CERROJO_CONFIG = threading.Lock()

#: Metros por tramo de latido: más que esto es un salto de GPS, no un paseo.
TOPE_METROS_POR_TRAMO = 250
#: Velocidad máxima de un tramo que cuenta (andar o trotar).
VELOCIDAD_MAXIMA_MS = 12 / 3.6
#: Precisión mínima del GPS (metros) en los dos extremos del tramo.
PRECISION_MAXIMA_M = 30
#: Segundos mínimos entre dos puntos de un tramo.
INTERVALO_MINIMO_S = 3
#: Los metros se escriben en SQLite de cien en cien, no en cada latido.
METROS_POR_ESCRITURA = 100

_METROS_PENDIENTES: dict[str, float] = {}
_CERROJO_METROS = threading.Lock()


def db_path() -> str:
    import main
    from backend.app.storage.event_store import resolve_event_db_path, resolve_event_storage_backend

    if resolve_event_storage_backend() == "sqlite":
        return resolve_event_db_path(main.EVENT_LOG_DB)
    return os.path.join(os.path.dirname(os.path.abspath(main.EVENT_LOG_DB)), "desbloqueos.sqlite3")


def config(cfg=None) -> dict:
    import main

    cfg = cfg if isinstance(cfg, dict) else main.load_config()
    return _reglas.normalizar_config(cfg.get("desbloqueables"))


def activos(cfg=None) -> bool:
    return bool(config(cfg)["activos"])


def _titulos_de_nodos(stages=None) -> dict:
    import main

    stages = stages if stages is not None else main.get_runtime_stages()
    titulos = {}
    for stage in stages:
        if not isinstance(stage, dict):
            continue
        presentacion = stage.get("presentation") if isinstance(stage.get("presentation"), dict) else {}
        titulos[str(stage.get("id"))] = str(presentacion.get("title") or stage.get("title") or stage.get("id"))
    return titulos


def _fotos_de(profile_id: str) -> int:
    import main
    from backend.app.storage.event_store import list_events

    eventos = list_events(main.EVENT_LOG_DB, user=str(profile_id), event_type="team_proof_created")
    return sum(1 for e in eventos if str(e.get("source") or "") == "player")


def hechos_de(profile_id: str, stages=None, timers=None) -> dict:
    import main

    stages = stages if stages is not None else main.get_runtime_stages()
    timers = timers if timers is not None else main.load_player_timers()
    entrada = timers.get(str(profile_id)) if isinstance(timers, dict) else None
    registros = list((entrada or {}).get("nodos", {}).values()) if isinstance(entrada, dict) else []
    nivel = main.get_player_progress_level(str(profile_id), 0)
    return _reglas.hechos(
        registros,
        nivel=int(nivel or 0),
        total_nodos=len(stages),
        ids_por_nivel=[str(s.get("id")) for s in stages if isinstance(s, dict)],
        fotos=_fotos_de(profile_id),
        metros=_store.metros(db_path(), profile_id),
    )


def _conceder_cumplidas(profile_id, cumplidas, evento_ref, por="sistema") -> list[str]:
    nuevas = []
    for cumplida in cumplidas:
        nuevas += _store.conceder(
            db_path(),
            profile_id,
            cumplida["claves"],
            fuente=f"regla:{cumplida['regla']}",
            regla=cumplida["regla"],
            evento_ref=str(evento_ref or ""),
            sospecha=cumplida["sospecha"],
            por=por,
        )
    return list(dict.fromkeys(nuevas))


def desbloqueos_tras_evento(profile_id, evento_ref="") -> list[str]:
    """Evalúa las reglas tras un evento ya ACEPTADO y concede lo que falte.

    Devuelve las claves ganadas ahora (vacía si nada). Nunca rompe el evento
    que la llama: un fallo aquí se anota y se devuelve una lista vacía.
    Con sospecha se concede igual (marcado ⚠ en el panel); en modo prueba no se
    concede nada.
    """
    import main

    try:
        cfg = config()
        if not cfg["activos"] or main.es_modo_prueba(profile_id):
            return []
        cumplidas = _reglas.evaluar(hechos_de(profile_id), cfg["reglas"])
        return _conceder_cumplidas(str(profile_id), cumplidas, evento_ref)
    except Exception:  # pragma: no cover - el avance manda; esto no puede tirarlo
        _log.exception("desbloqueos: fallo al evaluar %s", profile_id)
        return []


def estado_para_jugador(profile_id, stages=None) -> dict:
    """Lo que necesita la tienda (contrato en desbloqueos.py).

    `stages` (los nodos normalizados) los pasa quien ya los tiene, para no
    volver a leer la misión entera.
    """
    import main

    cfg = config()
    pid = str(profile_id)
    if not cfg["activos"]:
        return {
            "status": "ok", "activos": False, "revision": cfg["revision"],
            "libres": _catalogo.todas_las_claves(), "bloqueados": [], "mios": [], "nuevos": [],
            "reglas": [], "progreso": {}, "pistas": {}, "avisos": [],
        }
    bloq = _reglas.bloqueadas(cfg)
    stages = stages if stages is not None else main.get_runtime_stages()
    titulos = _titulos_de_nodos(stages)
    filas = _store.listar(db_path(), pid)
    reglas = [r for r in cfg["reglas"]]
    return {
        "status": "ok",
        "activos": True,
        "revision": cfg["revision"],
        "libres": [c for c in _catalogo.todas_las_claves() if c not in bloq],
        "bloqueados": [c for c in _catalogo.todas_las_claves() if c in bloq],
        "mios": [f["clave"] for f in filas],
        "nuevos": [f["clave"] for f in filas if f.get("visto_ms") is None],
        "reglas": [{**r, "texto": _reglas.texto_de_regla(r, titulos)} for r in reglas],
        "progreso": _reglas.progreso(hechos_de(pid, stages), reglas),
        "pistas": _reglas.pistas(reglas, sorted(bloq), titulos),
        "avisos": _store.avisos_pendientes(db_path(), pid),
    }


def marcar_visto(profile_id, claves=None, avisos=None) -> dict:
    vistos = _store.marcar_vistos(db_path(), str(profile_id), claves)
    avisados = _store.marcar_avisos_vistos(db_path(), str(profile_id), avisos) if avisos is not None or claves is None else 0
    return {"status": "ok", "claves": vistos, "avisos": avisados}


def piezas_no_permitidas(profile_id, avatar) -> list[str]:
    """Las piezas bloqueadas que lleva `avatar` y el jugador no ha ganado (vacía si todo vale)."""
    cfg = config()
    if not cfg["activos"]:
        return []
    usadas = _catalogo.claves_de_avatar(avatar)
    prohibidas = (usadas & _reglas.bloqueadas(cfg)) - _store.claves_de(db_path(), str(profile_id))
    return sorted(prohibidas)


# ---------------------------------------------------------------------------
# Organizador: ensayar, aplicar, conceder, retirar, activar
# ---------------------------------------------------------------------------

def _perfiles():
    import main

    return [p for p in main.get_player_profiles(main.load_config()) if isinstance(p, dict) and p.get("id")]


def ensayar(reglas) -> dict:
    """A quién se le daría qué AHORA con estas reglas (sin escribir nada)."""
    import main

    stages = main.get_runtime_stages()
    timers = main.load_player_timers()
    salida = {}
    for perfil in _perfiles():
        pid = str(perfil["id"])
        if pid.upper().startswith("SIM_"):
            continue
        tiene = _store.claves_de(db_path(), pid) | _store.retiradas_de(db_path(), pid)
        claves = []
        sospecha = False
        for cumplida in _reglas.evaluar(hechos_de(pid, stages, timers), reglas):
            for clave in cumplida["claves"]:
                if clave not in tiene and clave not in claves:
                    claves.append(clave)
                    sospecha = sospecha or cumplida["sospecha"]
        if claves:
            salida[pid] = {"display_name": perfil.get("display_name") or pid, "claves": claves, "sospecha": sospecha}
    return salida


def aplicar(reglas, evento_ref="admin:aplicar") -> dict:
    """Aplica las reglas a lo ya jugado (decisión: sí, enseñando antes a quién)."""
    import main

    stages = main.get_runtime_stages()
    timers = main.load_player_timers()
    salida = {}
    for perfil in _perfiles():
        pid = str(perfil["id"])
        if pid.upper().startswith("SIM_"):
            continue
        nuevas = _conceder_cumplidas(pid, _reglas.evaluar(hechos_de(pid, stages, timers), reglas), evento_ref)
        if nuevas:
            salida[pid] = nuevas
    return salida


def conceder_admin(jugadores, claves, motivo="") -> dict:
    claves = [c for c in claves if c in _catalogo.CLAVES]
    salida = {}
    for pid in jugadores:
        nuevas = _store.conceder(db_path(), str(pid), claves, fuente="admin", por="admin", motivo=str(motivo or "")[:200])
        if nuevas:
            salida[str(pid)] = nuevas
    return salida


def _guardar_sustituto(profile_id, avatar, prohibidas) -> dict | None:
    """Pone al jugador el primer sustituto libre que nadie más lleve (unicidad por hash)."""
    import main
    from backend.app.runtime import personajes as _pj

    for candidato in _catalogo.sustitutos(avatar, prohibidas):
        try:
            return _pj.guardar_elegido(main.PERSONAJES_DB, str(profile_id), candidato)
        except _pj.AvatarOcupado:
            continue
    return None


def _texto_aviso(claves, cfg) -> str:
    pistas = _reglas.pistas(cfg["reglas"], claves, _titulos_de_nodos())
    partes = [f"«{_catalogo.nombre_de(c)}» ahora se gana jugando ({pistas[c][0].lower()}{pistas[c][1:]})" for c in claves]
    return "; ".join(partes) + ". Te hemos puesto otra pieza parecida."


def sustituciones(cfg=None, *, simular: bool) -> list[dict]:
    """Migración SIN legado: cada pieza bloqueada (no ganada) que lleve alguien
    se cambia por una libre equivalente, sin repetir combinación de nadie.

    Con `simular=True` sólo se calcula (para enseñarlo antes de activar); si no,
    se guarda el avatar nuevo y se deja un aviso pendiente para el jugador.
    """
    import main
    from backend.app.runtime import personajes as _pj

    cfg = cfg if cfg is not None else config()
    bloq = _reglas.bloqueadas(cfg)
    configs = _pj.cargar_configs(main.PERSONAJES_DB)
    hashes = {pid: _pj.hash_de_avatar(av) for pid, av in configs.items()}
    salida = []
    for pid in sorted(configs):
        avatar = configs[pid]
        prohibidas = (_catalogo.claves_de_avatar(avatar) & bloq) - _store.claves_de(db_path(), pid)
        if not prohibidas:
            continue
        cambio = {"jugador": pid, "quita": sorted(prohibidas), "antes": avatar, "despues": None}
        if simular:
            ocupados = {h for otro, h in hashes.items() if otro != pid}
            for candidato in _catalogo.sustitutos(avatar, bloq - _store.claves_de(db_path(), pid)):
                if _pj.hash_de_avatar(candidato) not in ocupados:
                    cambio["despues"] = candidato
                    hashes[pid] = _pj.hash_de_avatar(candidato)
                    break
        else:
            nuevo = _guardar_sustituto(pid, avatar, bloq - _store.claves_de(db_path(), pid))
            cambio["despues"] = nuevo
            if nuevo is not None:
                _store.anadir_aviso(db_path(), pid, "sustituido", _texto_aviso(sorted(prohibidas), cfg), sorted(prohibidas))
        salida.append(cambio)
    return salida


def retirar_admin(profile_id, clave, motivo="") -> dict:
    """Retira una pieza; si la llevaba puesta, su avatar pasa a un sustituto libre."""
    import main
    from backend.app.runtime import personajes as _pj

    pid = str(profile_id)
    hecho = _store.retirar(db_path(), pid, str(clave), motivo=str(motivo or "")[:200])
    avatar_nuevo = None
    if hecho:
        cfg = config()
        avatar = _pj.cargar_configs(main.PERSONAJES_DB).get(pid)
        if avatar is not None and clave in _catalogo.claves_de_avatar(avatar) and cfg["activos"]:
            prohibidas = _reglas.bloqueadas(cfg) - _store.claves_de(db_path(), pid)
            avatar_nuevo = _guardar_sustituto(pid, avatar, prohibidas)
            if avatar_nuevo is not None:
                _store.anadir_aviso(
                    db_path(), pid, "retirado",
                    f"La organización ha retirado «{_catalogo.nombre_de(clave)}». Te hemos puesto otra pieza.", [clave],
                )
    return {"retirado": hecho, "avatar": avatar_nuevo}


def guardar_config(entrada: dict, *, aplicar_a_lo_jugado: bool) -> dict:
    """Guarda `desbloqueables` en la configuración de la misión con control de revisión.

    Devuelve `{status, config, sustituciones, concedidos}` o `{status: "conflict"}`
    si la revisión no coincide, o `{status: "invalid", errores}`.
    Al ENCENDER el interruptor se hace la migración sin legado y se aplican las
    reglas a lo ya jugado. Con el interruptor encendido y
    `aplicar_a_lo_jugado`, las reglas se aplican a todos.
    """
    import main

    with _CERROJO_CONFIG:
        cfg_mision = main.load_config()
        actual = _reglas.normalizar_config(cfg_mision.get("desbloqueables"))
        try:
            revision_pedida = int(entrada.get("revision"))
        except (TypeError, ValueError):
            revision_pedida = -1
        if revision_pedida != actual["revision"]:
            return {"status": "conflict", "revision": actual["revision"]}

        nuevo = dict(actual)
        errores: list[str] = []
        if "reglas" in entrada:
            nuevo["reglas"], errores = _reglas.normalizar_reglas(entrada.get("reglas"))
        if errores:
            return {"status": "invalid", "errores": errores}
        if "bloqueados" in entrada:
            bloqueados = entrada.get("bloqueados")
            nuevo["bloqueados"] = None if bloqueados is None else sorted(
                _catalogo.bloqueadas_efectivas(str(c) for c in (bloqueados if isinstance(bloqueados, list) else []))
            )
        if "activos" in entrada:
            nuevo["activos"] = entrada.get("activos") is True
        encendido_ahora = nuevo["activos"] and not actual["activos"]
        if encendido_ahora:
            nuevo["activado_ms"] = main._now_ms()
        nuevo["revision"] = actual["revision"] + 1
        main.save_config({**cfg_mision, "desbloqueables": nuevo})

    cambios, concedidos = [], {}
    if nuevo["activos"]:
        if encendido_ahora or "bloqueados" in entrada:
            cambios = sustituciones(nuevo, simular=False)
        if encendido_ahora or aplicar_a_lo_jugado:
            concedidos = aplicar(nuevo["reglas"])
    return {"status": "ok", "config": nuevo, "sustituciones": cambios, "concedidos": concedidos}


# ---------------------------------------------------------------------------
# Kilómetros (sólo GPS real, con la misión en marcha y jugando)
# ---------------------------------------------------------------------------

def _tramo_valido(prev: dict, nuevo: dict) -> float:
    """Metros de un tramo que cuentan, o 0."""
    import main
    from backend.app.runtime.anti_cheat import MANUAL_POSITION_SOURCE

    for punto in (prev, nuevo):
        if str(punto.get("source") or "").lower() == MANUAL_POSITION_SOURCE or punto.get("debug_enabled"):
            return 0.0
        precision = main._as_float(punto.get("accuracy"))
        if precision is None or precision > PRECISION_MAXIMA_M:
            return 0.0
    try:
        lat1, lon1, t1 = float(prev["lat"]), float(prev["lon"]), float(prev["t"])
        lat2, lon2, t2 = float(nuevo["lat"]), float(nuevo["lon"]), float(nuevo["t"])
    except (KeyError, TypeError, ValueError):
        return 0.0
    dt = t2 - t1
    if dt < INTERVALO_MINIMO_S:
        return 0.0
    metros = main.haversine_m(lat1, lon1, lat2, lon2)
    if metros / dt > VELOCIDAD_MAXIMA_MS or metros > TOPE_METROS_POR_TRAMO:
        return 0.0
    return metros


def _jugando(profile_id) -> bool:
    import main

    if main.mission_is_locked() or main.es_modo_prueba(profile_id):
        return False
    total = main.count_runtime_stages()
    return total > 0 and int(main.get_player_progress_level(str(profile_id), 0) or 0) < total


def _sumar(profile_id, metros: float, evento_ref: str) -> list[str]:
    pid = str(profile_id)
    with _CERROJO_METROS:
        pendiente = _METROS_PENDIENTES.get(pid, 0.0) + metros
        if pendiente < METROS_POR_ESCRITURA:
            _METROS_PENDIENTES[pid] = pendiente
            return []
        _METROS_PENDIENTES[pid] = pendiente - int(pendiente)
    _store.sumar_metros(db_path(), pid, int(pendiente))
    return desbloqueos_tras_evento(pid, evento_ref)


#: Último punto de latido de cada jugador, en memoria: la posición guardada no
#: conserva ni la precisión ni la fuente `manual`, y hacen falta las dos.
_ULTIMO_PUNTO: dict[str, dict] = {}


def sumar_latido(profile_id, actual: dict, ahora_s: float) -> list[str]:
    """Latido: suma el tramo entre el punto anterior y éste si es un paseo creíble."""
    try:
        pid = str(profile_id)
        punto = {**(actual if isinstance(actual, dict) else {}), "t": float(ahora_s)}
        with _CERROJO_METROS:
            prev = _ULTIMO_PUNTO.get(pid)
            _ULTIMO_PUNTO[pid] = punto
        if not isinstance(prev, dict) or not activos() or not _jugando(pid):
            return []
        metros = _tramo_valido(prev, punto)
        return _sumar(pid, metros, "latido") if metros > 0 else []
    except Exception:  # pragma: no cover - el latido manda
        _log.exception("desbloqueos: fallo al sumar metros de %s", profile_id)
        return []


def sumar_track(profile_id, muestras) -> list[str]:
    """Muestras de posición subidas desde la cola sin cobertura (`position_track`)."""
    try:
        if not isinstance(muestras, list) or not activos() or not _jugando(profile_id):
            return []
        puntos = []
        for m in muestras[:60]:
            if not isinstance(m, dict):
                continue
            try:
                t = float(m.get("t")) / 1000.0
            except (TypeError, ValueError):
                continue
            puntos.append({"lat": m.get("lat"), "lon": m.get("lon"), "accuracy": m.get("acc"),
                           "source": m.get("src") or "real", "t": t})
        puntos.sort(key=lambda p: p["t"])
        metros = sum(_tramo_valido(a, b) for a, b in zip(puntos, puntos[1:]))
        return _sumar(profile_id, metros, "track") if metros > 0 else []
    except Exception:  # pragma: no cover
        _log.exception("desbloqueos: fallo al sumar el rastro de %s", profile_id)
        return []


def olvidar_pendientes() -> None:
    """Sólo para tests."""
    with _CERROJO_METROS:
        _METROS_PENDIENTES.clear()
        _ULTIMO_PUNTO.clear()

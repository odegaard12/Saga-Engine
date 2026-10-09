"""Desbloqueables del vestuario: reglas, hechos y evaluación (lógica pura).

Qué es: parte de la tienda de avatares (ver desbloqueables_catalogo.py) se gana
JUGANDO. Lo ganado se guarda por jugador (id de perfil) y PARA SIEMPRE en la
tabla `desbloqueos` de SQLite (clave primaria jugador+clave: conceder dos veces
es imposible por construcción, así que reprocesar la cola offline no duplica).

El servidor no se fía del móvil: concede a partir de lo que él mismo aceptó
(avances, fotos subidas, metros andados con GPS real). Este módulo es PURO: no
lee ficheros. La parte que habla con `main` está en desbloqueos_glue.py.

Configuración (dentro de la de la misión, clave `desbloqueables`):

    {"activos": false,                 # interruptor global; APAGADO por defecto
     "revision": 3,                    # sube con cada guardado (409 si cambió)
     "bloqueados": ["item:casco", …],  # null = reparto inicial del catálogo
     "reglas": [{"id": "r1", "cuando": {"tipo": "nodos", "n": 3}, "da": ["item:zocas"]}, …]}

Tipos de disparador CERRADOS (nada de expresiones libres):

    primer_nodo                    completar el primer nodo
    nodo        {nodo: "<id>"}     completar ESE nodo (por id, nunca por índice)
    nodos       {n}                completar n nodos
    minijuego_perfecto {n}         n minijuegos perfectos (sin penalización, sin
                                   código a mano y sin sospecha; lo calcula el servidor)
    racha_perfecta {n}             n minijuegos perfectos seguidos
    mitad_mision                   la mitad de los nodos de la misión
    final_mision                   terminar la misión
    final_sin_emergencia           terminar sin código de emergencia en ningún nodo
    primera_foto                   subir la primera foto de campo
    km          {km}               andar km con GPS real (ni manual ni depuración)
    regalo_admin                   nunca automático: lo aplica el organizador

CONTRATO DE LA API (para la tienda; ver routers/desbloqueos.py):

    GET  /api/desbloqueos/{user}   (sesión firmada del jugador, como /api/personaje)
      {status, activos, revision,
       libres: [clave], bloqueados: [clave],      # con activos=false, todo libre
       mios: [clave],                             # ganado y vigente
       nuevos: [clave],                           # ganado y sin ver (punto rojo)
       reglas: [{id, cuando, da: [clave], texto}],
       progreso: {id_regla: {actual, meta}},
       pistas: {clave: "Se consigue: …"},
       avisos: [{id, tipo, texto, claves, creado_ms}]}   # p. ej. «sustituido» al activar
    POST /api/desbloqueos/visto    {user, claves?: [clave], avisos?: [id]}
    POST /api/personaje            409 {status:"error", detail:"bloqueado",
                                        error:"bloqueado", claves:[…]}
                                   si se guarda una pieza bloqueada no ganada
    POST /api/advance              añade `desbloqueos: [clave]` si el avance ganó algo
    POST /api/events/sync          cada evento lleva `desbloqueos: [clave]` (vacía si nada)
    GET  /api/game/{user}          añade `desbloqueos` (lo mismo que el GET de arriba):
                                   viaja en el paquete de la misión de la pantalla de carga
"""
from __future__ import annotations

import math
import re
from typing import Any, Iterable

from backend.app.runtime import desbloqueables_catalogo as _catalogo

TIPOS: dict[str, dict] = {
    "primer_nodo": {"etiqueta": "Completar el primer nodo", "parametros": []},
    "nodo": {"etiqueta": "Completar un nodo concreto", "parametros": ["nodo"]},
    "nodos": {"etiqueta": "Completar N nodos", "parametros": ["n"]},
    "minijuego_perfecto": {"etiqueta": "N minijuegos perfectos", "parametros": ["n"]},
    "racha_perfecta": {"etiqueta": "Racha de N minijuegos perfectos seguidos", "parametros": ["n"]},
    "mitad_mision": {"etiqueta": "Llegar a la mitad de la misión", "parametros": []},
    "final_mision": {"etiqueta": "Terminar la misión", "parametros": []},
    "final_sin_emergencia": {"etiqueta": "Terminar sin código de emergencia", "parametros": []},
    "primera_foto": {"etiqueta": "Subir la primera foto", "parametros": []},
    "km": {"etiqueta": "Andar N km (GPS real)", "parametros": ["km"]},
    "regalo_admin": {"etiqueta": "Regalo de la organización (manual)", "parametros": []},
}

MAX_REGLAS = 80
MAX_CLAVES_POR_REGLA = 12
_ID_VALIDO = re.compile(r"^[A-Za-z0-9_\-]{1,40}$")


def config_por_defecto() -> dict:
    return {"activos": False, "revision": 0, "bloqueados": None, "reglas": [], "activado_ms": 0}


def _entero(valor: Any, defecto: int, minimo: int = 1, maximo: int = 1000) -> int:
    if isinstance(valor, bool):
        return defecto
    try:
        numero = int(valor)
    except (TypeError, ValueError, OverflowError):
        return defecto
    return max(minimo, min(maximo, numero))


def normalizar_regla(raw: Any, indice: int = 0) -> tuple[dict | None, str | None]:
    """(regla limpia, None) o (None, motivo) si no vale."""
    if not isinstance(raw, dict):
        return None, "la regla no es un objeto"
    cuando = raw.get("cuando") if isinstance(raw.get("cuando"), dict) else {}
    tipo = str(cuando.get("tipo") or "").strip()
    if tipo not in TIPOS:
        return None, f"tipo de disparador desconocido: {tipo or 'vacío'}"
    rid = str(raw.get("id") or "").strip() or f"r{indice + 1}"
    if not _ID_VALIDO.match(rid):
        return None, f"id de regla no válido: {rid}"
    limpio: dict[str, Any] = {"tipo": tipo}
    if tipo == "nodo":
        nodo = str(cuando.get("nodo") or "").strip()[:120]
        if not nodo:
            return None, "falta el id del nodo"
        limpio["nodo"] = nodo
    elif tipo in ("nodos", "minijuego_perfecto", "racha_perfecta"):
        limpio["n"] = _entero(cuando.get("n"), 1)
    elif tipo == "km":
        try:
            km = float(cuando.get("km"))
        except (TypeError, ValueError):
            km = 0.0
        if not math.isfinite(km) or km <= 0:
            return None, "los km tienen que ser un número positivo"
        limpio["km"] = round(min(km, 500.0), 2)
    da = []
    for clave in raw.get("da") if isinstance(raw.get("da"), list) else []:
        # Una regla guardada con un gesto ya quitado da su sustituto (no se pierde la regla).
        clave = _catalogo.clave_vigente(str(clave or "").strip())
        if clave in _catalogo.CLAVES and clave not in da:
            da.append(clave)
    if not da:
        return None, "la regla no da ninguna pieza válida"
    regla = {"id": rid, "cuando": limpio, "da": da[:MAX_CLAVES_POR_REGLA]}
    nota = str(raw.get("nota") or "").strip()[:160]
    if nota:
        regla["nota"] = nota
    return regla, None


def normalizar_reglas(raw: Any) -> tuple[list[dict], list[str]]:
    reglas: list[dict] = []
    errores: list[str] = []
    vistos: set[str] = set()
    for indice, item in enumerate(raw[:MAX_REGLAS] if isinstance(raw, list) else []):
        regla, error = normalizar_regla(item, indice)
        if error:
            errores.append(f"regla {indice + 1}: {error}")
            continue
        if regla["id"] in vistos:
            errores.append(f"regla {indice + 1}: id repetido ({regla['id']})")
            continue
        vistos.add(regla["id"])
        reglas.append(regla)
    return reglas, errores


def normalizar_config(raw: Any) -> dict:
    """La configuración `desbloqueables` saneada (lo inválido se descarta en silencio)."""
    base = config_por_defecto()
    if not isinstance(raw, dict):
        return base
    base["activos"] = raw.get("activos") is True
    base["revision"] = _entero(raw.get("revision"), 0, minimo=0, maximo=10**9)
    base["activado_ms"] = _entero(raw.get("activado_ms"), 0, minimo=0, maximo=10**15)
    if isinstance(raw.get("bloqueados"), list):
        base["bloqueados"] = sorted(_catalogo.bloqueadas_efectivas(str(c) for c in raw["bloqueados"]))
    base["reglas"], _ = normalizar_reglas(raw.get("reglas"))
    return base


def bloqueadas(config: dict) -> frozenset[str]:
    return _catalogo.bloqueadas_efectivas(config.get("bloqueados"))


# ---------------------------------------------------------------------------
# Hechos: lo que el servidor sabe del jugador
# ---------------------------------------------------------------------------

def hechos(
    registros: Iterable[dict],
    *,
    nivel: int,
    total_nodos: int,
    ids_por_nivel: list[str] | None = None,
    fotos: int = 0,
    metros: int = 0,
) -> dict:
    """Los hechos de un jugador a partir de sus registros por nodo.

    `registros` son los de player_timers (`nodos`), uno por nivel superado. Un
    nivel superado sin registro (partida de antes de esto, o un nodo saltado
    desde el panel) cuenta como nodo completado normal, no perfecto: así una
    regla nueva se puede aplicar a lo ya jugado. Lo jugado en MODO PRUEBA no
    cuenta para nada.
    """
    por_nivel: dict[int, dict] = {}
    for registro in registros:
        if isinstance(registro, dict):
            try:
                por_nivel[int(registro.get("level"))] = registro
            except (TypeError, ValueError):
                continue
    ids_por_nivel = ids_por_nivel or []
    nodos = []
    hubo_prueba = False
    for lvl in range(max(0, int(nivel or 0))):
        registro = por_nivel.get(lvl)
        if registro is None:
            if lvl < len(ids_por_nivel):
                nodos.append({"id": str(ids_por_nivel[lvl]), "perfecto": False, "manual": False,
                              "es_minijuego": False, "sospechoso": False})
            continue
        if registro.get("prueba"):
            hubo_prueba = True
            continue
        nodos.append({
            "id": str(registro.get("node_id") or ""),
            "perfecto": bool(registro.get("perfecto")),
            "manual": bool(registro.get("manual")),
            "es_minijuego": bool(registro.get("es_minijuego")),
            "sospechoso": bool(registro.get("sospechoso")),
        })
    return {
        "nodos": nodos,
        "total_nodos": max(0, int(total_nodos or 0)),
        "terminada": int(total_nodos or 0) > 0 and int(nivel or 0) >= int(total_nodos) and not hubo_prueba,
        "fotos": max(0, int(fotos or 0)),
        "metros": max(0, int(metros or 0)),
    }


def _mejor_racha(nodos: list[dict]) -> tuple[int, list[dict]]:
    mejor: list[dict] = []
    actual: list[dict] = []
    for nodo in nodos:
        if not nodo.get("es_minijuego"):
            continue  # un punto de control o un QR ni suma ni corta la racha
        if nodo.get("perfecto"):
            actual.append(nodo)
            if len(actual) > len(mejor):
                mejor = list(actual)
        else:
            actual = []
    return len(mejor), mejor


def _medir(cuando: dict, h: dict) -> tuple[float, float, list[dict]]:
    """(actual, meta, nodos que lo justifican) de un disparador."""
    tipo = cuando.get("tipo")
    nodos = h["nodos"]
    if tipo == "primer_nodo":
        return min(1, len(nodos)), 1, nodos[:1]
    if tipo == "nodo":
        hechos_nodo = [n for n in nodos if n["id"] == str(cuando.get("nodo"))]
        return (1 if hechos_nodo else 0), 1, hechos_nodo[:1]
    if tipo == "nodos":
        n = int(cuando.get("n") or 1)
        return min(n, len(nodos)), n, nodos[:n]
    if tipo == "minijuego_perfecto":
        n = int(cuando.get("n") or 1)
        perfectos = [x for x in nodos if x["perfecto"]]
        return min(n, len(perfectos)), n, perfectos[:n]
    if tipo == "racha_perfecta":
        n = int(cuando.get("n") or 1)
        largo, racha = _mejor_racha(nodos)
        return min(n, largo), n, racha
    if tipo == "mitad_mision":
        meta = max(1, math.ceil(h["total_nodos"] / 2)) if h["total_nodos"] else 1
        if not h["total_nodos"]:
            return 0, 1, []
        return min(meta, len(nodos)), meta, nodos[:meta]
    if tipo == "final_mision":
        return (1 if h["terminada"] else 0), 1, nodos
    if tipo == "final_sin_emergencia":
        limpio = h["terminada"] and not any(n["manual"] for n in nodos)
        return (1 if limpio else 0), 1, nodos
    if tipo == "primera_foto":
        return min(1, h["fotos"]), 1, []
    if tipo == "km":
        meta = float(cuando.get("km") or 0)
        return round(min(meta, h["metros"] / 1000.0), 2), meta, []
    return 0, 1, []  # regalo_admin: nunca automático


def evaluar(h: dict, reglas: Iterable[dict]) -> list[dict]:
    """Las reglas que se cumplen: `[{regla, claves, sospecha}]`.

    `sospecha` dice si alguno de los nodos que justifican la regla quedó
    marcado por el antitrampas: se concede igual (decisión del usuario) y el
    panel lo enseña con ⚠ para que el organizador pueda retirarlo.
    """
    cumplidas = []
    for regla in reglas:
        cuando = regla.get("cuando") or {}
        if cuando.get("tipo") == "regalo_admin":
            continue
        actual, meta, justifican = _medir(cuando, h)
        if meta and actual >= meta:
            cumplidas.append({
                "regla": regla["id"],
                "claves": list(regla.get("da") or []),
                "sospecha": any(n.get("sospechoso") for n in justifican),
            })
    return cumplidas


def progreso(h: dict, reglas: Iterable[dict]) -> dict:
    salida = {}
    for regla in reglas:
        cuando = regla.get("cuando") or {}
        if cuando.get("tipo") == "regalo_admin":
            continue
        actual, meta, _ = _medir(cuando, h)
        salida[regla["id"]] = {"actual": actual, "meta": meta}
    return salida


def texto_de_regla(regla: dict, titulos_de_nodos: dict[str, str] | None = None) -> str:
    """La regla en castellano llano: «Completa 3 nodos»."""
    cuando = regla.get("cuando") or {}
    tipo = cuando.get("tipo")
    if tipo == "primer_nodo":
        return "Completa tu primer nodo"
    if tipo == "nodo":
        titulo = (titulos_de_nodos or {}).get(str(cuando.get("nodo")))
        return f"Completa el nodo «{titulo}»" if titulo else "Completa un nodo concreto de la ruta"
    if tipo == "nodos":
        return f"Completa {cuando.get('n')} nodos"
    if tipo == "minijuego_perfecto":
        n = cuando.get("n") or 1
        return "Haz un minijuego perfecto" if n == 1 else f"Haz {n} minijuegos perfectos"
    if tipo == "racha_perfecta":
        return f"Encadena {cuando.get('n')} minijuegos perfectos seguidos"
    if tipo == "mitad_mision":
        return "Llega a la mitad de la misión"
    if tipo == "final_mision":
        return "Termina la misión"
    if tipo == "final_sin_emergencia":
        return "Termina la misión sin usar ningún código de emergencia"
    if tipo == "primera_foto":
        return "Sube tu primera foto de campo"
    if tipo == "km":
        return f"Anda {cuando.get('km')} km durante la partida"
    if tipo == "regalo_admin":
        return "Regalo de la organización"
    return "Jugando"


def pistas(reglas: Iterable[dict], bloqueadas_: Iterable[str], titulos_de_nodos: dict[str, str] | None = None) -> dict:
    """«Se consigue: …» para cada pieza bloqueada (o «Lo regala la organización»)."""
    reglas = list(reglas)
    salida = {}
    for clave in bloqueadas_:
        textos = [texto_de_regla(r, titulos_de_nodos) for r in reglas if clave in (r.get("da") or [])]
        salida[clave] = "Se consigue: " + " · ".join(textos) if textos else "Lo regala la organización"
    return salida


def propuesta_de_reglas() -> list[dict]:
    """El reparto inicial propuesto (sin reglas de nodo concreto: esas dependen
    de la ruta y se ponen desde el cajón del nodo)."""
    return [
        {"id": "primer-nodo", "cuando": {"tipo": "primer_nodo"}, "da": ["gesto:ge__clapping"]},
        {"id": "tres-nodos", "cuando": {"tipo": "nodos", "n": 3}, "da": ["item:zocas"]},
        {"id": "seis-nodos", "cuando": {"tipo": "nodos", "n": 6}, "da": ["item:monteira"]},
        {"id": "perfecto", "cuando": {"tipo": "minijuego_perfecto", "n": 1}, "da": ["gesto:ge__happy_hand_gesture"]},
        {"id": "racha-3", "cuando": {"tipo": "racha_perfecta", "n": 3}, "da": ["ropa:15"]},
        {"id": "racha-5", "cuando": {"tipo": "racha_perfecta", "n": 5}, "da": ["ropa:14"]},
        {"id": "mitad", "cuando": {"tipo": "mitad_mision"}, "da": ["item:sombrero", "item:mochilaP"]},
        {"id": "final", "cuando": {"tipo": "final_mision"}, "da": ["item:bordon", "item:cabaza"]},
        {"id": "final-limpio", "cuando": {"tipo": "final_sin_emergencia"}, "da": ["item:gaita"]},
        {"id": "primera-foto", "cuando": {"tipo": "primera_foto"}, "da": ["gesto:ge__dismissing_gesture"]},
        {"id": "km-3", "cuando": {"tipo": "km", "km": 3}, "da": ["item:paraguas"]},
        {"id": "km-5", "cuando": {"tipo": "km", "km": 5}, "da": ["ropa:9"]},
        {"id": "regalo", "cuando": {"tipo": "regalo_admin"}, "da": ["ropa:16", "hair:7"]},
    ]

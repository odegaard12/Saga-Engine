"""«Exportar partida»: un ZIP para revisar después si hubo mala clasificación,
trampas o fallos.

No inventa registros nuevos donde ya los había: junta lo que el motor ya guarda
—Registro de partida (`match_log`), cola de eventos, sospechas del antitrampas,
tiempos por nodo (declarado/observado/aplicado), vestuario, fotos— con lo nuevo
de `registro_analisis` (errores y auditoría del panel), y escribe encima un
INFORME.md con un primer análisis.

Contenido del ZIP:

    resumen.json            qué hay, de cuándo, versión, recuentos
    clasificacion.csv       posición y desglose (nodos + penalizaciones), empates
    nodos_por_jugador.csv   declarado / observado / aplicado por nodo
    eventos.jsonl           Registro de partida completo, por orden de ocurrencia
    cola_eventos.jsonl      la cola offline-first (estado y error de cada evento)
    sospechas.csv           motor antitrampas
    errores.jsonl           errores del servidor y de los móviles
    auditoria_admin.jsonl   cambios del panel (quién, qué, cuándo)
    desbloqueos.csv         vestuario concedido / retirado
    fotos.csv               metadatos de las fotos (sin las imágenes; no va si se anonimiza)
    config_mision.json      configuración y nodos (sin secretos ni imágenes)
    INFORME.md              análisis automático

Se escribe en un fichero TEMPORAL, entrada a entrada y fila a fila: la Raspberry
es pequeña y el Registro puede tener 20 000 filas.

Anonimizar: los nombres pasan a J01, J02… (también dentro de los textos), las
posiciones se redondean a dos decimales (~1 km) y no van las fotos.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import statistics
import time
import zipfile
from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

FORMATO = "saga-partida"
VERSION_FORMATO = 1

#: Tope de eventos de la cola que se exportan (los más recientes).
MAX_COLA_EVENTOS = 20_000

_CLAVES_COORD = {"lat", "lon", "lng", "latitude", "longitude"}
_CLAVES_SECRETAS = re.compile(r"pass|secret|token|clave|key", re.IGNORECASE)
_CLAVES_PERSONA = {"user", "display_name", "usuario", "objetivo", "jugador", "profile_id", "team_id", "name"}
_CLAVES_FUERA_SI_ANONIMO = {"avatar_url", "members", "note", "nota", "avatar_initials"}

_UMBRAL_DIFERENCIA_MS = 60_000


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def iso_de_ms(ms: Any) -> str:
    try:
        valor = int(ms)
    except (TypeError, ValueError, OverflowError):
        return ""
    if valor <= 0:
        return ""
    return datetime.fromtimestamp(valor / 1000.0, tz=timezone.utc).isoformat(timespec="seconds")


def duracion(ms: Any) -> str:
    try:
        total = int(ms or 0) // 1000
    except (TypeError, ValueError, OverflowError):
        return ""
    signo = "-" if total < 0 else ""
    total = abs(total)
    return f"{signo}{total // 3600}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def _entero(valor: Any) -> int | None:
    if valor is None or isinstance(valor, bool):
        return None
    try:
        numero = int(valor)
    except (TypeError, ValueError, OverflowError):
        return None
    return numero


class Anonimizador:
    """Cambia personas por J01, J02… y redondea posiciones. Sin `activo`, no toca nada."""

    def __init__(self, activo: bool, perfiles: Iterable[dict] = ()):
        self.activo = activo
        self._alias: dict[str, str] = {}
        self._nombres: dict[str, str] = {}
        self._patron: re.Pattern | None = None
        for perfil in perfiles:
            if not isinstance(perfil, dict):
                continue
            pid = str(perfil.get("id") or "").strip()
            if not pid:
                continue
            alias = self.alias(pid)
            for nombre in [perfil.get("display_name"), *(perfil.get("members") or [])]:
                texto = str(nombre or "").strip()
                if len(texto) >= 2:
                    self._nombres.setdefault(texto, alias)

    def alias(self, usuario: Any) -> str:
        texto = str(usuario or "").strip()
        if not texto:
            return ""
        if texto not in self._alias:
            self._alias[texto] = f"J{len(self._alias) + 1:02d}"
            self._nombres.setdefault(texto, self._alias[texto])
            self._patron = None
        return self._alias[texto]

    def persona(self, usuario: Any) -> str:
        if not self.activo:
            return str(usuario or "")
        texto = str(usuario or "").strip()
        if not texto:
            return ""
        if texto in self._nombres:
            return self._nombres[texto]
        return self.texto(texto)

    def texto(self, valor: Any) -> str:
        texto = "" if valor is None else str(valor)
        if not self.activo or not texto or not self._nombres:
            return texto
        if self._patron is None:
            nombres = sorted(self._nombres, key=len, reverse=True)
            self._patron = re.compile(
                r"(?<!\w)(" + "|".join(re.escape(n) for n in nombres) + r")(?!\w)", re.IGNORECASE
            )
            self._minusculas = {n.lower(): a for n, a in self._nombres.items()}
        return self._patron.sub(lambda m: self._minusculas.get(m.group(0).lower(), "J??"), texto)

    def valor(self, obj: Any, clave: str = "") -> Any:
        if not self.activo:
            return obj
        if isinstance(obj, dict):
            limpio = {}
            for k, v in obj.items():
                if k in _CLAVES_FUERA_SI_ANONIMO:
                    continue
                limpio[k] = self.valor(v, k)
            return limpio
        if isinstance(obj, list):
            return [self.valor(v, clave) for v in obj]
        if clave in _CLAVES_COORD and isinstance(obj, (int, float)) and not isinstance(obj, bool):
            return round(float(obj), 2) if math.isfinite(float(obj)) else None
        if isinstance(obj, str):
            return self.persona(obj) if clave in _CLAVES_PERSONA else self.texto(obj)
        return obj


def _celda(valor: Any) -> str:
    from backend.app.runtime.match_log import _celda_csv_segura

    return _celda_csv_segura(valor)


class _Zip:
    """Escribe entradas de texto en el ZIP sin montarlas enteras en memoria."""

    def __init__(self, destino: str):
        self.zf = zipfile.ZipFile(destino, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6)
        self.recuentos: dict[str, int] = {}

    def texto(self, nombre: str, contenido: str) -> None:
        self.zf.writestr(nombre, contenido)

    def json(self, nombre: str, datos: Any) -> None:
        self.texto(nombre, json.dumps(datos, ensure_ascii=False, indent=2, default=str))

    def jsonl(self, nombre: str, filas: Iterable[dict]) -> int:
        n = 0
        with self.zf.open(nombre, "w", force_zip64=True) as crudo:
            salida = io.TextIOWrapper(crudo, encoding="utf-8", newline="\n")
            for fila in filas:
                salida.write(json.dumps(fila, ensure_ascii=False, default=str))
                salida.write("\n")
                n += 1
            salida.flush()
            salida.detach()
        self.recuentos[nombre] = n
        return n

    def csv(self, nombre: str, columnas: list[str], filas: Iterable[dict]) -> int:
        from backend.app.runtime.match_log import CSV_BOM, CSV_DELIMITER

        n = 0
        with self.zf.open(nombre, "w", force_zip64=True) as crudo:
            salida = io.TextIOWrapper(crudo, encoding="utf-8", newline="")
            salida.write(CSV_BOM)
            escritor = csv.writer(salida, delimiter=CSV_DELIMITER)
            escritor.writerow(columnas)
            for fila in filas:
                escritor.writerow([_celda(fila.get(c, "")) for c in columnas])
                n += 1
            salida.flush()
            salida.detach()
        self.recuentos[nombre] = n
        return n

    def cerrar(self) -> None:
        self.zf.close()


# ---------------------------------------------------------------------------
# Datos
# ---------------------------------------------------------------------------

def _version_motor(main) -> str:
    try:
        return (main.APP_DIR / "VERSION").read_text().strip()
    except Exception:
        return "dev"


def _clasificacion(main) -> dict:
    """La misma tabla que «Tiempos» del panel (ver routers/desbloqueos.py)."""
    from backend.app.routers.desbloqueos import _tiempos_para_revisar

    return _tiempos_para_revisar(main)


def _con_posiciones(jugadores: list[dict]) -> list[dict]:
    """Posición, empates y desglose de cada jugador (en el orden de la clasificación)."""
    filas = []
    posicion = 0
    previo = None
    for indice, jugador in enumerate(jugadores):
        clave = (jugador.get("finished"), jugador.get("level"), jugador.get("total_time_ms"))
        if clave != previo:
            posicion = indice + 1
            previo = clave
        suma_nodos = sum(int(n.get("applied_ms") or 0) for n in jugador.get("nodos") or [])
        filas.append({**jugador, "posicion": posicion, "suma_nodos_ms": suma_nodos})
    # Empate: mismo estado, mismo nivel y mismo tiempo total (el desempate por
    # hora de llegada lo decide el orden, pero se avisa igual).
    grupos: dict[tuple, list[dict]] = defaultdict(list)
    for fila in filas:
        if fila.get("level"):
            grupos[(fila.get("finished"), fila.get("level"), fila.get("total_time_ms"))].append(fila)
    for grupo in grupos.values():
        if len(grupo) > 1:
            for fila in grupo:
                fila["empate_con"] = [otro["user"] for otro in grupo if otro is not fila]
    return filas


def _config_segura(cfg: dict, perfiles: list[dict], anon: Anonimizador) -> dict:
    claves = (
        "site_name", "admin_title", "admin_subtitle", "mission_launch_at", "map_center", "map_zoom",
        "player_theme", "map_engine", "ui_lang", "story_title",
    )
    salida = {clave: cfg.get(clave) for clave in claves if clave in cfg}
    if anon.activo:
        centro = cfg.get("map_center")
        if isinstance(centro, list):
            salida["map_center"] = [round(float(c), 2) if isinstance(c, (int, float)) else None for c in centro]
        salida["jugadores"] = [{"id": anon.alias(p.get("id")), "modo": p.get("mode")} for p in perfiles]
    else:
        salida["jugadores"] = [
            {
                "id": p.get("id"),
                "display_name": p.get("display_name"),
                "modo": p.get("mode"),
                "miembros": len(p.get("members") or []),
            }
            for p in perfiles
        ]
    return salida


def _nodo_seguro(nodo: Any) -> Any:
    """Un nodo sin imágenes incrustadas ni campos que parezcan secretos."""
    if isinstance(nodo, dict):
        limpio = {}
        for clave, valor in nodo.items():
            if _CLAVES_SECRETAS.search(str(clave)):
                continue
            limpio[clave] = _nodo_seguro(valor)
        return limpio
    if isinstance(nodo, list):
        return [_nodo_seguro(v) for v in nodo]
    if isinstance(nodo, str) and nodo.startswith("data:"):
        return f"[imagen omitida: {len(nodo) // 1024} KB]"
    return nodo


class _Analisis:
    """Lo que se va contando mientras se escriben los eventos, para el INFORME."""

    def __init__(self):
        self.sin_cobertura = Counter()
        self.lotes_offline = Counter()
        self.retraso_max_ms: dict[str, int] = defaultdict(int)
        self.rechazos = Counter()
        self.rechazos_por_nodo = Counter()
        self.rechazos_por_jugador: dict[str, Counter] = defaultdict(Counter)
        self.tipos = Counter()
        self.dispositivos: dict[str, set] = defaultdict(set)
        self.versiones: dict[str, set] = defaultdict(set)
        self.primero = ""
        self.ultimo = ""
        self.total = 0

    def mirar(self, entrada: dict) -> None:
        from backend.app.runtime.match_log import es_sin_cobertura

        self.total += 1
        usuario = entrada.get("user") or ""
        tipo = entrada.get("type") or ""
        payload = entrada.get("payload") if isinstance(entrada.get("payload"), dict) else {}
        self.tipos[tipo] += 1
        momento = entrada.get("occurred_at") or ""
        if momento:
            self.primero = self.primero or momento
            self.ultimo = momento
        if es_sin_cobertura(entrada):
            self.sin_cobertura[usuario] += 1
        if tipo == "offline_sync_batch":
            self.lotes_offline[usuario] += 1
        retraso = _entero(payload.get("sync_delay_ms") or payload.get("delay_ms"))
        if retraso and retraso > self.retraso_max_ms[usuario]:
            self.retraso_max_ms[usuario] = retraso
        if tipo == "advance_rejected":
            motivo = str(payload.get("error") or "desconocido")
            self.rechazos[motivo] += 1
            self.rechazos_por_nodo[str(payload.get("node_id") or "?")] += 1
            self.rechazos_por_jugador[usuario][motivo] += 1
        if tipo in ("session_open", "client_info"):
            if payload.get("dispositivo"):
                self.dispositivos[usuario].add(str(payload["dispositivo"]))
            if payload.get("app_version"):
                self.versiones[usuario].add(str(payload["app_version"]))


# ---------------------------------------------------------------------------
# Generación
# ---------------------------------------------------------------------------

def resumen_rapido(main) -> dict:
    """Recuentos para el panel, sin generar nada."""
    from backend.app.runtime import registro_analisis as _registro

    sospechas = main.list_anti_cheat_suspicions() or {}
    recuentos = _registro.contar()
    return {
        "status": "ok",
        "registro_activo": bool(main.match_log_is_active()),
        "jugadores": len(main.get_player_profiles(main.load_config())),
        "nodos": len(main.get_runtime_stages()),
        "filas_registro": main.match_log_count(),
        "sospechas": sum(
            1 for lista in sospechas.values() if isinstance(lista, list)
            for s in lista if isinstance(s, dict) and s.get("severity") != "info"
        ),
        "errores": recuentos["errores"],
        "auditoria": recuentos["auditoria"],
    }


def generar(main, destino: str, *, anonimizar: bool = False, origen: str = "") -> dict:
    """Escribe el ZIP en `destino` y devuelve el resumen (lo mismo que resumen.json)."""
    from backend.app.runtime import registro_analisis as _registro
    from backend.app.storage import match_log_store as _match_store
    from backend.app.storage import registro_analisis_store as _analisis_store

    inicio = time.time()
    cfg = main.load_config()
    perfiles = [p for p in main.get_player_profiles(cfg) if isinstance(p, dict)]
    anon = Anonimizador(anonimizar, perfiles)
    stages = main.get_runtime_stages()
    try:
        titulos = {str(k): str(v) for k, v in main._desbloqueos_glue._titulos_de_nodos(stages).items()}
    except Exception:
        titulos = {}
    for s in stages:
        if isinstance(s, dict):
            titulos.setdefault(str(s.get("id")), str(s.get("title") or s.get("id")))

    clasif = _clasificacion(main)
    jugadores = _con_posiciones(clasif.get("jugadores") or [])
    for jugador in jugadores:
        anon.alias(jugador.get("user"))

    z = _Zip(destino)
    analisis = _Analisis()
    try:
        # clasificacion.csv
        z.csv(
            "clasificacion.csv",
            [
                "posicion", "jugador", "nombre", "terminado", "nodos_superados", "nodos_totales",
                "tiempo_total", "tiempo_total_ms", "suma_nodos_ms", "penalizaciones_ms", "terminado_a",
                "sospechas", "empate_con",
            ],
            (
                {
                    "posicion": j["posicion"],
                    "jugador": anon.persona(j.get("user")),
                    "nombre": anon.persona(j.get("display_name")) if anon.activo else j.get("display_name"),
                    "terminado": "si" if j.get("finished") else "no",
                    "nodos_superados": j.get("level"),
                    "nodos_totales": clasif.get("total_nodes"),
                    "tiempo_total": duracion(j.get("total_time_ms")),
                    "tiempo_total_ms": j.get("total_time_ms"),
                    "suma_nodos_ms": j.get("suma_nodos_ms"),
                    "penalizaciones_ms": j.get("penalties_ms"),
                    "terminado_a": iso_de_ms(j.get("finished_at")),
                    "sospechas": j.get("suspicion_count"),
                    "empate_con": ", ".join(anon.persona(u) for u in j.get("empate_con") or []),
                }
                for j in jugadores
            ),
        )

        # nodos_por_jugador.csv
        diferencias = []

        def _filas_nodos():
            for j in jugadores:
                for n in j.get("nodos") or []:
                    declarado = _entero(n.get("declared_ms"))
                    observado = _entero(n.get("observed_ms"))
                    diferencia = observado - declarado if declarado is not None and observado is not None else None
                    if diferencia is not None and abs(diferencia) >= _UMBRAL_DIFERENCIA_MS and abs(diferencia) >= 0.5 * max(
                        declarado or 0, observado or 0, 1
                    ):
                        diferencias.append((j.get("user"), n, diferencia))
                    yield {
                        "jugador": anon.persona(j.get("user")),
                        "nivel": n.get("level"),
                        "nodo": n.get("node_id"),
                        "titulo": n.get("title"),
                        "declarado_ms": declarado if declarado is not None else "",
                        "observado_ms": observado if observado is not None else "",
                        "aplicado_ms": n.get("applied_ms"),
                        "aplicado": duracion(n.get("applied_ms")),
                        "diferencia_ms": diferencia if diferencia is not None else "",
                        "fuente": n.get("fuente"),
                        "penalizacion_ms": n.get("penalty_ms") or 0,
                        "codigo_a_mano": "si" if n.get("manual") else "no",
                        "proximidad": n.get("proximidad") or "",
                        "prueba": "si" if n.get("prueba") else "no",
                        "origen": n.get("origen") or "",
                        "abierto_a": iso_de_ms(n.get("opened_at_ms")),
                        "completado_a": iso_de_ms(n.get("completed_at_ms")),
                        "sospechas": " | ".join(str(s.get("reason")) for s in n.get("sospechas") or []),
                    }

        z.csv(
            "nodos_por_jugador.csv",
            [
                "jugador", "nivel", "nodo", "titulo", "declarado_ms", "observado_ms", "aplicado_ms", "aplicado",
                "diferencia_ms", "fuente", "penalizacion_ms", "codigo_a_mano", "proximidad", "prueba", "origen", "abierto_a",
                "completado_a", "sospechas",
            ],
            _filas_nodos(),
        )

        # eventos.jsonl (Registro de partida, por ocurrencia)
        def _eventos():
            for entrada in _match_store.iterar_entradas(main.MATCH_LOG_DB):
                analisis.mirar(entrada)
                yield anon.valor(entrada)

        z.jsonl("eventos.jsonl", _eventos())

        # cola_eventos.jsonl (la cola offline-first: estado y error)
        cola = main.list_events(main.EVENT_LOG_DB, limit=MAX_COLA_EVENTOS) or []
        z.jsonl("cola_eventos.jsonl", (anon.valor(e) for e in cola if isinstance(e, dict)))
        del cola

        # sospechas.csv
        sospechas = main.list_anti_cheat_suspicions() or {}
        sospechas_por_jugador: dict[str, Counter] = defaultdict(Counter)

        def _filas_sospechas():
            for usuario, lista in sospechas.items():
                if not isinstance(lista, list):
                    continue
                for s in lista:
                    if not isinstance(s, dict):
                        continue
                    evidencia = s.get("evidence") if isinstance(s.get("evidence"), dict) else {}
                    if s.get("severity") != "info":
                        sospechas_por_jugador[usuario][str(s.get("reason"))] += 1
                    yield {
                        "jugador": anon.persona(usuario),
                        "cuando": iso_de_ms(s.get("at")),
                        "gravedad": s.get("severity") or "suspicion",
                        "motivo": s.get("reason"),
                        "nodo": evidencia.get("node_id") or "",
                        "evidencia": json.dumps(anon.valor(evidencia), ensure_ascii=False, default=str),
                    }

        z.csv("sospechas.csv", ["jugador", "cuando", "gravedad", "motivo", "nodo", "evidencia"], _filas_sospechas())

        # errores.jsonl y auditoria_admin.jsonl
        ruta_analisis = _registro.ruta_db()
        errores_frecuentes = Counter()
        errores_por_jugador = Counter()

        def _errores():
            for fila in _analisis_store.iterar(ruta_analisis, "errores"):
                errores_frecuentes[(fila.get("origen"), fila.get("tipo"), str(fila.get("mensaje") or "")[:90])] += 1
                if fila.get("usuario"):
                    errores_por_jugador[fila["usuario"]] += 1
                yield anon.valor(fila)

        z.jsonl("errores.jsonl", _errores())

        auditoria_reciente: list[dict] = []

        def _auditoria():
            for fila in _analisis_store.iterar(ruta_analisis, "auditoria"):
                limpia = anon.valor(fila)
                auditoria_reciente.append(limpia)
                del auditoria_reciente[:-25]
                yield limpia

        z.jsonl("auditoria_admin.jsonl", _auditoria())

        # desbloqueos.csv
        try:
            from backend.app.storage import desbloqueos_store

            vestuario = desbloqueos_store.listar(main._desbloqueos_glue.db_path(), incluir_retirados=True)
        except Exception:
            vestuario = []
        z.csv(
            "desbloqueos.csv",
            ["jugador", "clave", "por", "fuente", "regla", "sospecha", "concedido_a", "retirado"],
            (
                {
                    "jugador": anon.persona(d.get("jugador")),
                    "clave": d.get("clave"),
                    "por": anon.texto(d.get("por")),
                    "fuente": anon.texto(d.get("fuente")),
                    "regla": d.get("regla") or "",
                    "sospecha": "si" if d.get("sospecha") else "no",
                    "concedido_a": iso_de_ms(d.get("concedido_ms")),
                    "retirado": iso_de_ms(d.get("retirado_ms")) or "no",
                }
                for d in vestuario
                if isinstance(d, dict)
            ),
        )

        # fotos.csv (sólo metadatos; nunca si se anonimiza)
        if not anon.activo:
            z.csv(
                "fotos.csv",
                ["id", "jugador", "nodo", "titulo_nodo", "creada_a", "lat", "lon", "estado"],
                _fotos(),
            )

        # config_mision.json
        crudos = main.load_stages(main.STAGES_DB)
        z.json(
            "config_mision.json",
            {
                "config": _config_segura(cfg, perfiles, anon),
                "nodos": anon.valor(_nodo_seguro(crudos if isinstance(crudos, list) else [])),
            },
        )

        resumen = {
            "formato": FORMATO,
            "version_formato": VERSION_FORMATO,
            "generado_a": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "version_motor": _version_motor(main),
            "mision": cfg.get("site_name") or "",
            "inicio_programado": cfg.get("mission_launch_at") or "",
            "registro_activo": bool(main.match_log_is_active()),
            "anonimizado": anon.activo,
            "jugadores": len(perfiles),
            "nodos": len(stages),
            "primer_evento": analisis.primero,
            "ultimo_evento": analisis.ultimo,
            "eventos_por_tipo": dict(analisis.tipos.most_common()),
            "ficheros": dict(z.recuentos),
            "notas": [
                "Horas en UTC (ISO 8601). Los tiempos *_ms son milisegundos.",
                "eventos.jsonl va por orden de OCURRENCIA (hora del móvil corregida), no de subida.",
                "Los CSV usan ';' y BOM UTF-8 (Excel en castellano).",
                f"cola_eventos.jsonl: como mucho los {MAX_COLA_EVENTOS} eventos más recientes.",
            ],
        }

        z.texto(
            "INFORME.md",
            _informe(
                resumen, clasif, jugadores, diferencias, sospechas_por_jugador, analisis,
                errores_frecuentes, errores_por_jugador, auditoria_reciente, titulos, anon, origen, stages,
            ),
        )
        resumen["segundos"] = round(time.time() - inicio, 2)
        z.json("resumen.json", resumen)
    finally:
        z.cerrar()
    return resumen


def _fotos():
    from backend.app.routers import field_proofs as fotos

    fotos.init_field_proof_schema()
    conn = fotos.connect_runtime_sqlite()
    try:
        cursor = conn.execute(
            "SELECT id, user, stage_id, stage_title, created_at, lat, lon, status FROM field_proofs ORDER BY created_at"
        )
        while True:
            filas = cursor.fetchmany(500)
            if not filas:
                break
            for f in filas:
                creada = f["created_at"]
                yield {
                    "id": f["id"],
                    "jugador": f["user"],
                    "nodo": f["stage_id"],
                    "titulo_nodo": f["stage_title"],
                    "creada_a": iso_de_ms(creada * 1000 if creada and creada < 10**11 else creada),
                    "lat": f["lat"],
                    "lon": f["lon"],
                    "estado": f["status"],
                }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# INFORME.md
# ---------------------------------------------------------------------------

def _tabla(cabecera: list[str], filas: list[list[Any]]) -> str:
    if not filas:
        return "_Nada que señalar._\n"

    def limpia(valor: Any) -> str:
        return str("" if valor is None else valor).replace("|", "/").replace("\n", " ")

    lineas = ["| " + " | ".join(cabecera) + " |", "|" + "---|" * len(cabecera)]
    lineas += ["| " + " | ".join(limpia(v) for v in fila) + " |" for fila in filas]
    return "\n".join(lineas) + "\n"


def _informe(
    resumen, clasif, jugadores, diferencias, sospechas_por_jugador, analisis,
    errores_frecuentes, errores_por_jugador, auditoria, titulos, anon, origen, stages,
) -> str:
    p = anon.persona
    total_nodos = clasif.get("total_nodes") or 0
    partes = [
        f"# Informe de partida — {anon.texto(resumen['mision']) or 'SAGA'}\n",
        f"Generado {resumen['generado_a']} (UTC) con SAGA {resumen['version_motor']}. "
        f"{resumen['jugadores']} jugadores, {resumen['nodos']} nodos. "
        + ("**Anonimizado** (J01, J02…; posiciones redondeadas; sin fotos). " if anon.activo else "")
        + ("" if resumen["registro_activo"] else "**Ojo: el Registro de partida estaba APAGADO al exportar** "
           "(sin fecha de inicio o aún no ha llegado): la línea de tiempo puede estar vacía.")
        + "\n",
        f"Primer evento: {resumen['primer_evento'] or '—'} · último: {resumen['ultimo_evento'] or '—'}.\n",
        "Este análisis es automático y sólo SEÑALA: nada de aquí cambia la clasificación. "
        "Para decidir, mira el detalle en los CSV y en eventos.jsonl.\n",
    ]

    # Podio
    terminados = [j for j in jugadores if j.get("finished")]
    partes.append("\n## Podio y desglose\n")
    podio = (terminados or jugadores)[:3]
    partes.append(
        _tabla(
            ["Pos.", "Jugador", "Nodos", "Total", "Suma de nodos", "Penalizaciones", "Llegada", "Sospechas"],
            [
                [
                    j["posicion"], p(j.get("user")), f"{j.get('level')}/{total_nodos}", duracion(j.get("total_time_ms")),
                    duracion(j.get("suma_nodos_ms")), duracion(j.get("penalties_ms")),
                    iso_de_ms(j.get("finished_at")) or "sin terminar", j.get("suspicion_count") or 0,
                ]
                for j in podio
            ],
        )
    )
    if not terminados:
        partes.append("\nNadie ha terminado todavía: el «podio» es quien va por delante.\n")

    # Empates
    empates = [j for j in jugadores if j.get("empate_con")]
    partes.append("\n## Empates\n")
    partes.append(
        _tabla(
            ["Jugador", "Total", "Empata con", "Llegada (desempate)"],
            [[p(j.get("user")), duracion(j.get("total_time_ms")), ", ".join(p(u) for u in j["empate_con"]),
              iso_de_ms(j.get("finished_at"))] for j in empates],
        )
    )
    cerca = []
    for a, b in zip(terminados, terminados[1:]):
        hueco = int(b.get("total_time_ms") or 0) - int(a.get("total_time_ms") or 0)
        if 0 < hueco <= 5_000:
            cerca.append([p(a.get("user")), p(b.get("user")), f"{hueco / 1000:.1f} s"])
    if cerca:
        partes.append("\nCasi empates (menos de 5 s):\n\n" + _tabla(["Delante", "Detrás", "Diferencia"], cerca))

    # Declarado frente a observado
    partes.append("\n## Declarado frente a observado (diferencias grandes)\n")
    partes.append(
        "El tiempo que cuenta es el MAYOR de los dos. Observado ≫ declarado: el móvil dijo menos de lo que el "
        "servidor vio (reloj raro, pausa larga o intento de rebajar). Declarado ≫ observado: sin apertura fiable "
        "o reloj adelantado.\n\n"
    )
    diferencias.sort(key=lambda d: abs(d[2]), reverse=True)
    partes.append(
        _tabla(
            ["Jugador", "Nodo", "Declarado", "Observado", "Diferencia", "Fuente"],
            [
                [p(u), n.get("title") or n.get("node_id"), duracion(n.get("declared_ms")), duracion(n.get("observed_ms")),
                 duracion(dif), n.get("fuente")]
                for u, n, dif in diferencias[:20]
            ],
        )
    )

    # Sospechas
    partes.append("\n## Sospechas por jugador\n")
    partes.append(
        _tabla(
            ["Jugador", "Total", "Motivos"],
            sorted(
                [
                    [p(u), sum(c.values()), ", ".join(f"{m} ×{n}" for m, n in c.most_common())]
                    for u, c in sospechas_por_jugador.items()
                ],
                key=lambda fila: fila[1],
                reverse=True,
            ),
        )
    )

    # Proximidad: modo prueba, sin GPS y avances lejos del nodo (sólo se señala)
    partes.append("\n## Modo prueba, sin GPS y avances lejos del nodo\n")
    partes.append(
        "Sólo informativo: nada de esto penaliza. «Lejos» = avance con GPS real lejos del nodo; «modo prueba» = "
        "posición manual o simulada; «sin GPS» = rescate o GPS denegado.\n\n"
    )
    filas_prox = []
    for j in jugadores:
        por_tipo: dict[str, list[str]] = defaultdict(list)
        for n in j.get("nodos") or []:
            tipo = "modo_prueba" if (n.get("prueba") and n.get("proximidad") != "lejos") else n.get("proximidad")
            if tipo in ("lejos", "modo_prueba", "sin_gps"):
                por_tipo[tipo].append(str(titulos.get(str(n.get("node_id")), n.get("node_id"))))
        if por_tipo:
            filas_prox.append(
                [p(j.get("user")), ", ".join(por_tipo["modo_prueba"]), ", ".join(por_tipo["sin_gps"]), ", ".join(por_tipo["lejos"])]
            )
    partes.append(_tabla(["Jugador", "Modo prueba en", "Sin GPS en", "Lejos del nodo en"], filas_prox))

    # Nodos donde más se atascó la gente
    partes.append("\n## Nodos donde más se atascó la gente\n")
    tiempos_por_nodo: dict[str, list[int]] = defaultdict(list)
    for j in jugadores:
        for n in j.get("nodos") or []:
            tiempos_por_nodo[str(n.get("node_id"))].append(int(n.get("applied_ms") or 0))
    parados = Counter()
    for j in jugadores:
        nivel = int(j.get("level") or 0)
        if not j.get("finished") and 0 <= nivel < len(stages):
            parados[str(stages[nivel].get("id"))] += 1
    filas_nodos = []
    for indice, nodo in enumerate(stages):
        nid = str(nodo.get("id"))
        tiempos = tiempos_por_nodo.get(nid, [])
        filas_nodos.append(
            [
                indice + 1, titulos.get(nid, nid), len(tiempos),
                duracion(statistics.median(tiempos)) if tiempos else "—",
                duracion(max(tiempos)) if tiempos else "—",
                analisis.rechazos_por_nodo.get(nid, 0), parados.get(nid, 0),
                statistics.median(tiempos) if tiempos else 0,
            ]
        )
    filas_nodos.sort(key=lambda f: (f[7], f[5], f[6]), reverse=True)
    partes.append(
        _tabla(
            ["#", "Nodo", "Superado por", "Mediana", "Máximo", "Avances rechazados", "Parados ahí ahora"],
            [f[:7] for f in filas_nodos[:8]],
        )
    )

    # Avances rechazados
    partes.append("\n## Avances rechazados\n")
    partes.append(
        _tabla(
            ["Jugador", "Total", "Motivos"],
            sorted(
                [[p(u), sum(c.values()), ", ".join(f"{m} ×{n}" for m, n in c.most_common())]
                 for u, c in analisis.rechazos_por_jugador.items()],
                key=lambda f: f[1], reverse=True,
            ),
        )
    )

    # Errores
    partes.append("\n## Errores más frecuentes\n")
    partes.append(
        _tabla(
            ["Veces", "Origen", "Tipo", "Mensaje"],
            [[n, o, t, anon.texto(m)] for (o, t, m), n in errores_frecuentes.most_common(10)],
        )
    )
    if errores_por_jugador:
        partes.append(
            "\nJugadores con más errores en el móvil: "
            + ", ".join(f"{p(u)} ({n})" for u, n in errores_por_jugador.most_common(8))
            + "\n"
        )

    # Sin cobertura
    partes.append("\n## Jugadores con mucha cola sin cobertura\n")
    usuarios = set(analisis.sin_cobertura) | set(analisis.retraso_max_ms) | set(analisis.lotes_offline)
    filas_offline = [
        [p(u), analisis.sin_cobertura.get(u, 0), analisis.lotes_offline.get(u, 0), duracion(analisis.retraso_max_ms.get(u, 0))]
        for u in usuarios
        if analisis.sin_cobertura.get(u, 0) >= 5 or analisis.retraso_max_ms.get(u, 0) >= 5 * 60_000
    ]
    filas_offline.sort(key=lambda f: f[1], reverse=True)
    partes.append(_tabla(["Jugador", "Eventos sin cobertura", "Tandas subidas", "Mayor retraso"], filas_offline))

    # Dispositivos
    if analisis.dispositivos or analisis.versiones:
        partes.append("\n## Dispositivos y versiones vistos\n")
        partes.append(
            _tabla(
                ["Jugador", "Dispositivo", "Versión de la app"],
                [[p(u), ", ".join(sorted(analisis.dispositivos.get(u, []))), ", ".join(sorted(analisis.versiones.get(u, [])))]
                 for u in sorted(set(analisis.dispositivos) | set(analisis.versiones))],
            )
        )

    # Admin
    partes.append("\n## Cambios del panel (los últimos)\n")
    partes.append(
        _tabla(
            ["Cuándo", "Sesión", "Acción", "Sobre", "Resultado"],
            [[a.get("creado_at"), a.get("sesion"), a.get("accion"), a.get("objetivo"), a.get("resultado")]
             for a in auditoria[-25:]],
        )
    )

    # Ficheros y descarga
    partes.append("\n## Ficheros\n")
    partes.append(_tabla(["Fichero", "Filas"], [[n, c] for n, c in sorted(resumen["ficheros"].items())]))
    servidor = origen or "http://SERVIDOR:PUERTO"
    partes.append(
        "\n## Descargarlo otra vez por línea de comandos\n\n"
        "La contraseña del panel se teclea (no queda en el historial ni en este informe):\n\n"
        "```sh\n"
        "read -rs SAGA_ADMIN_PASS && export SAGA_ADMIN_PASS\n"
        f"curl -s -c /tmp/saga.cookies -H 'Content-Type: application/json' \\\n"
        f"  -d \"{{\\\"password\\\":\\\"$SAGA_ADMIN_PASS\\\"}}\" {servidor}/api/admin/login\n"
        f"curl -s -b /tmp/saga.cookies -o partida.zip \"{servidor}/api/admin/partida/exportar?anonimizar=0\"\n"
        "rm /tmp/saga.cookies; unset SAGA_ADMIN_PASS\n"
        "```\n\n"
        "Con `anonimizar=1` sale anonimizado. Sin sesión de administración el servidor contesta 403.\n"
    )
    return "\n".join(partes)

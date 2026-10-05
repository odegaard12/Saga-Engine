"""Almacén SQLite de lo que hace falta para ANALIZAR una partida y no tenía sitio.

Dos tablas en un fichero propio (`registro_analisis.sqlite3`, al lado de
`match_log.sqlite3`, ya cubierto por `data/*.sqlite3` en el .gitignore):

- `errores`: errores del servidor (excepciones sin capturar) y del cliente
  (errores de JavaScript y fallos de red relevantes que manda el móvil).
- `auditoria`: cambios hechos desde el panel de administración —quién (una
  huella corta de la sesión, nunca la cookie), qué y cuándo—.

Por qué aparte del Registro de partida (`match_log`): aquel sólo escribe con la
misión programada y en marcha, y poda por su cuenta; un error del servidor o un
guardado del admin interesan SIEMPRE (también el día antes, preparando la ruta).

Retención: cada tabla tiene un tope de filas (se van las más viejas) y el
fichero un tope de tamaño; así una Raspberry con una tarjeta pequeña no se llena
por un móvil que repite el mismo error toda la tarde.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from backend.app.storage import schema_cache

NOMBRE_FICHERO = "registro_analisis.sqlite3"

#: Filas como mucho por tabla (las más viejas se van primero).
MAX_ERRORES = 5_000
MAX_AUDITORIA = 5_000
#: Si el fichero pasa de esto (bytes), se poda la mitad más vieja y se compacta.
MAX_BYTES = 16 * 1024 * 1024

_ESQUEMA = "registro_analisis"
_CERROJO = threading.Lock()
_TABLAS = {"errores": MAX_ERRORES, "auditoria": MAX_AUDITORIA}


def ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def ruta(data_dir: str) -> str:
    base = os.path.abspath(str(data_dir or ".").strip() or ".")
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, NOMBRE_FICHERO)


@contextmanager
def _conexion(path: str):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema(path: str) -> None:
    if schema_cache.esta_listo(_ESQUEMA, path):
        return
    with _CERROJO:
        if schema_cache.esta_listo(_ESQUEMA, path):
            return
        with _conexion(path) as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS errores (
                    id TEXT PRIMARY KEY,
                    creado_at TEXT NOT NULL,
                    origen TEXT NOT NULL,
                    tipo TEXT NOT NULL DEFAULT '',
                    mensaje TEXT NOT NULL DEFAULT '',
                    usuario TEXT NOT NULL DEFAULT '',
                    ruta TEXT NOT NULL DEFAULT '',
                    app_version TEXT NOT NULL DEFAULT '',
                    dispositivo TEXT NOT NULL DEFAULT '',
                    ocurrido_at TEXT,
                    detalle_json TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_errores_creado ON errores(creado_at)")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS auditoria (
                    id TEXT PRIMARY KEY,
                    creado_at TEXT NOT NULL,
                    sesion TEXT NOT NULL DEFAULT '',
                    accion TEXT NOT NULL,
                    objetivo TEXT NOT NULL DEFAULT '',
                    resultado TEXT NOT NULL DEFAULT '',
                    dispositivo TEXT NOT NULL DEFAULT '',
                    detalle_json TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_auditoria_creado ON auditoria(creado_at)")
        schema_cache.marcar_listo(_ESQUEMA, path)


def _json(valor: Any) -> str:
    return json.dumps(valor if isinstance(valor, dict) else {}, ensure_ascii=False, default=str)


def _cargar(texto: str) -> dict[str, Any]:
    try:
        valor = json.loads(texto or "{}")
    except (TypeError, ValueError):
        return {}
    return valor if isinstance(valor, dict) else {}


def _recortar(conn: sqlite3.Connection, tabla: str) -> None:
    tope = _TABLAS[tabla]
    total = conn.execute(f"SELECT COUNT(*) AS n FROM {tabla}").fetchone()["n"]
    if total > tope:
        conn.execute(
            f"DELETE FROM {tabla} WHERE id IN (SELECT id FROM {tabla} ORDER BY creado_at ASC, id ASC LIMIT ?)",
            (total - tope,),
        )


def _vigilar_tamano(path: str) -> None:
    """Si el fichero se pasa de `MAX_BYTES`, fuera la mitad más vieja de cada tabla."""
    try:
        tamano = os.path.getsize(path) + (os.path.getsize(path + "-wal") if os.path.exists(path + "-wal") else 0)
    except OSError:
        return
    if tamano <= MAX_BYTES:
        return
    with _conexion(path) as conn:
        for tabla in _TABLAS:
            total = conn.execute(f"SELECT COUNT(*) AS n FROM {tabla}").fetchone()["n"]
            if total:
                conn.execute(
                    f"DELETE FROM {tabla} WHERE id IN (SELECT id FROM {tabla} ORDER BY creado_at ASC LIMIT ?)",
                    (max(1, total // 2),),
                )
    compactar(path)


def compactar(path: str) -> bool:
    try:
        conn = sqlite3.connect(path, timeout=10.0)
        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("VACUUM")
        finally:
            conn.close()
        return True
    except sqlite3.Error:
        return False


def anadir_errores(path: str, filas: list[dict[str, Any]]) -> int:
    """Varias filas de error en UNA transacción. Devuelve cuántas."""
    if not filas:
        return 0
    init_schema(path)
    valores = [
        (
            f"er_{uuid.uuid4().hex}",
            fila.get("creado_at") or ahora_iso(),
            str(fila.get("origen") or "cliente")[:20],
            str(fila.get("tipo") or "")[:60],
            str(fila.get("mensaje") or "")[:500],
            str(fila.get("usuario") or "")[:120],
            str(fila.get("ruta") or "")[:200],
            str(fila.get("app_version") or "")[:40],
            str(fila.get("dispositivo") or "")[:80],
            fila.get("ocurrido_at"),
            _json(fila.get("detalle")),
        )
        for fila in filas
    ]
    with _conexion(path) as conn:
        conn.executemany(
            """
            INSERT INTO errores (id, creado_at, origen, tipo, mensaje, usuario, ruta, app_version,
                                 dispositivo, ocurrido_at, detalle_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            valores,
        )
        _recortar(conn, "errores")
    _vigilar_tamano(path)
    return len(valores)


def anadir_auditoria(path: str, fila: dict[str, Any]) -> dict[str, Any]:
    init_schema(path)
    entrada = {
        "id": f"au_{uuid.uuid4().hex}",
        "creado_at": fila.get("creado_at") or ahora_iso(),
        "sesion": str(fila.get("sesion") or "")[:16],
        "accion": str(fila.get("accion") or "desconocida")[:60],
        "objetivo": str(fila.get("objetivo") or "")[:160],
        "resultado": str(fila.get("resultado") or "")[:40],
        "dispositivo": str(fila.get("dispositivo") or "")[:80],
        "detalle": fila.get("detalle") if isinstance(fila.get("detalle"), dict) else {},
    }
    with _conexion(path) as conn:
        conn.execute(
            """
            INSERT INTO auditoria (id, creado_at, sesion, accion, objetivo, resultado, dispositivo, detalle_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entrada["id"],
                entrada["creado_at"],
                entrada["sesion"],
                entrada["accion"],
                entrada["objetivo"],
                entrada["resultado"],
                entrada["dispositivo"],
                _json(entrada["detalle"]),
            ),
        )
        _recortar(conn, "auditoria")
    _vigilar_tamano(path)
    return entrada


def _fila_a_dict(tabla: str, fila: sqlite3.Row) -> dict[str, Any]:
    datos = {clave: fila[clave] for clave in fila.keys() if clave != "detalle_json"}
    datos["detalle"] = _cargar(fila["detalle_json"])
    return datos


def iterar(path: str, tabla: str, *, lote: int = 500) -> Iterator[dict[str, Any]]:
    """Las filas de `tabla`, de la más vieja a la más nueva, sin cargarlas todas."""
    if tabla not in _TABLAS:
        raise ValueError(tabla)
    init_schema(path)
    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute(f"SELECT * FROM {tabla} ORDER BY creado_at ASC, id ASC")
        while True:
            filas = cursor.fetchmany(lote)
            if not filas:
                break
            for fila in filas:
                yield _fila_a_dict(tabla, fila)
    finally:
        conn.close()


def contar(path: str, tabla: str) -> int:
    if tabla not in _TABLAS:
        raise ValueError(tabla)
    init_schema(path)
    with _conexion(path) as conn:
        return int(conn.execute(f"SELECT COUNT(*) AS n FROM {tabla}").fetchone()["n"] or 0)


def borrar_todo(path: str) -> dict[str, int]:
    """Purga: se van las dos tablas (llevan nombres de jugadores) y se compacta."""
    init_schema(path)
    borrado = {}
    with _conexion(path) as conn:
        for tabla in _TABLAS:
            borrado[tabla] = conn.execute(f"DELETE FROM {tabla}").rowcount or 0
    compactar(path)
    return borrado

"""Almacén SQLite del Registro de partida (auditoría por jugador).

Tabla propia (`match_log`), separada de `events` a propósito: los eventos de
`event_log.py` son la cola de sincronización offline-first y tienen su propio
ciclo de vida (pending/synced/failed). El Registro de partida es sólo
lectura para el organizador -qué hizo cada jugador y cuándo-, con su propio
límite de tamaño y su propio borrado (purga de datos personales).

Vive en el mismo directorio de datos que `saga.sqlite3` (ver
backend/app/storage/sqlite_store.py) pero en su propio fichero
`match_log.sqlite3`, ya cubierto por `data/*.sqlite3` en el .gitignore: así
un despliegue sin SQLite para eventos (SAGA_STORAGE_BACKEND=json) sigue
teniendo Registro de partida.

Caza de fallos del 30/09/2026 (S2, S12, A8):

- `occurred_at`: cuándo PASÓ de verdad (la hora del móvil, normalizada a UTC con
  un formato fijo) en una columna con índice. Los listados y los filtros por
  fecha usan ésta, no la de subida: una cola sin cobertura llega horas después.
- Los listados devuelven las filas MÁS RECIENTES (antes `ORDER BY ... ASC LIMIT`
  enseñaba el principio de la ruta y nunca el final).
- Al pasar del tope se podan primero las muestras de posición; los avances y las
  sospechas no se podan nunca.
- `append_entries`: todas las muestras de un evento en UNA transacción.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterable
import json
import os
import sqlite3
import threading
import uuid

from backend.app.storage import schema_cache


DEFAULT_MATCH_LOG_FILENAME = "match_log.sqlite3"

# Tope por partida. Pensado para una travesía de un día con varios jugadores,
# no para acumular temporadas.
MAX_ROWS_PER_MATCH = 20_000

#: Nunca se podan al llegar al tope: son el resultado de la partida.
TIPOS_PROTEGIDOS = ("advance", "advance_rejected", "suspicion")

_ESQUEMA = "match_log"
_CERROJO_ESQUEMA = threading.Lock()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalizar_instante(valor: Any) -> str | None:
    """Una fecha ISO cualquiera como UTC con formato FIJO, o None.

    Con un formato fijo (`AAAA-MM-DDTHH:MM:SS.ffffff+00:00`) el orden alfabético
    es el cronológico, que es lo que necesitan el índice y los filtros. Con
    `Z`, con `+02:00` o con distinta precisión, no lo era.
    """
    texto = str(valor or "").strip()
    if not texto:
        return None
    try:
        fecha = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return fecha.astimezone(timezone.utc).isoformat(timespec="microseconds")


def calcular_occurred_at(client_created_at: Any, created_at: Any) -> str:
    return normalizar_instante(client_created_at) or normalizar_instante(created_at) or str(created_at or "")


def new_row_id() -> str:
    return f"ml_{uuid.uuid4().hex}"


def resolve_match_log_path(data_dir: str, filename: str = DEFAULT_MATCH_LOG_FILENAME) -> str:
    base = str(data_dir or ".").strip() or "."
    if not os.path.isabs(base):
        base = os.path.abspath(base)
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, filename)


@contextmanager
def _connection(path: str):
    parent = os.path.dirname(path) or "."
    os.makedirs(parent, exist_ok=True)
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

    with _CERROJO_ESQUEMA:
        if schema_cache.esta_listo(_ESQUEMA, path):
            return
        _crear_esquema(path)
        schema_cache.marcar_listo(_ESQUEMA, path)


def _crear_esquema(path: str) -> None:
    with _connection(path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS match_log (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                user TEXT NOT NULL DEFAULT '',
                display_name TEXT NOT NULL DEFAULT '',
                severity TEXT,
                created_at TEXT NOT NULL,
                client_created_at TEXT,
                payload_json TEXT NOT NULL DEFAULT '{}',
                occurred_at TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_match_log_user_created ON match_log(user, created_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_match_log_created ON match_log(created_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_match_log_type ON match_log(type)"
        )

        columnas = {fila[1] for fila in conn.execute("PRAGMA table_info(match_log)").fetchall()}
        if "occurred_at" not in columnas:
            conn.execute("ALTER TABLE match_log ADD COLUMN occurred_at TEXT")
            _rellenar_occurred_at(conn)

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_match_log_occurred ON match_log(occurred_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_match_log_user_occurred ON match_log(user, occurred_at)"
        )


def _rellenar_occurred_at(conn: sqlite3.Connection) -> None:
    """Calcula `occurred_at` de las filas que ya había (una sola vez)."""
    filas = conn.execute("SELECT id, created_at, client_created_at FROM match_log").fetchall()
    cambios = [
        (calcular_occurred_at(fila[2], fila[1]), fila[0])
        for fila in filas
    ]
    if cambios:
        conn.executemany("UPDATE match_log SET occurred_at = ? WHERE id = ?", cambios)


def _dumps(payload: Any) -> str:
    return json.dumps(payload if isinstance(payload, dict) else {}, ensure_ascii=False)


def _loads(text: str) -> dict[str, Any]:
    try:
        decoded = json.loads(text or "{}")
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}


def _row_to_entry(row: sqlite3.Row) -> dict[str, Any]:
    entry = {
        "id": row["id"],
        "type": row["type"],
        "user": row["user"],
        "display_name": row["display_name"],
        "created_at": row["created_at"],
        "payload": _loads(row["payload_json"]),
    }
    if row["severity"]:
        entry["severity"] = row["severity"]
    if row["client_created_at"]:
        entry["client_created_at"] = row["client_created_at"]
    return entry


def _fila_a_insertar(
    *,
    event_type: str,
    user: str,
    display_name: str = "",
    payload: dict[str, Any] | None = None,
    severity: str | None = None,
    client_created_at: str | None = None,
    created_at: str | None = None,
) -> tuple[tuple, dict[str, Any]]:
    row_id = new_row_id()
    when = created_at or utc_now_iso()
    tipo = str(event_type or "").strip() or "info"
    nombre = str(user or "").strip()
    visible = str(display_name or "").strip()

    fila = (
        row_id,
        tipo,
        nombre,
        visible,
        severity,
        when,
        client_created_at,
        _dumps(payload),
        calcular_occurred_at(client_created_at, when),
    )
    devuelto = {
        "id": row_id,
        "type": event_type,
        "user": user,
        "display_name": display_name,
        "created_at": when,
        "client_created_at": client_created_at,
        "severity": severity,
        "payload": payload or {},
    }
    return fila, devuelto


_INSERTAR = """
    INSERT INTO match_log (
        id, type, user, display_name, severity, created_at, client_created_at, payload_json, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def _recortar(conn: sqlite3.Connection) -> None:
    """Deja la tabla en `MAX_ROWS_PER_MATCH` filas como mucho.

    Orden de poda: las muestras de posición más viejas primero (son las más
    numerosas y las que menos importan), luego lo demás que no sea protegido.
    Los avances y las sospechas no se podan nunca, aunque la tabla se pase del
    tope: perder el principio de una partida por culpa de miles de muestras de
    GPS fue justo el fallo que esto corrige.
    """
    total = conn.execute("SELECT COUNT(*) AS n FROM match_log").fetchone()["n"]
    exceso = total - MAX_ROWS_PER_MATCH
    if exceso <= 0:
        return

    borradas = conn.execute(
        """
        DELETE FROM match_log WHERE id IN (
            SELECT id FROM match_log WHERE type = 'position_sample'
            ORDER BY occurred_at ASC, id ASC LIMIT ?
        )
        """,
        (exceso,),
    ).rowcount or 0
    exceso -= borradas
    if exceso <= 0:
        return

    marcas = ", ".join("?" for _ in TIPOS_PROTEGIDOS)
    conn.execute(
        f"""
        DELETE FROM match_log WHERE id IN (
            SELECT id FROM match_log
            WHERE type NOT IN ({marcas}) AND COALESCE(severity, '') != 'suspicion'
            ORDER BY occurred_at ASC, id ASC LIMIT ?
        )
        """,
        (*TIPOS_PROTEGIDOS, exceso),
    )


def append_entry(
    path: str,
    *,
    event_type: str,
    user: str,
    display_name: str = "",
    payload: dict[str, Any] | None = None,
    severity: str | None = None,
    client_created_at: str | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    init_schema(path)

    fila, devuelto = _fila_a_insertar(
        event_type=event_type,
        user=user,
        display_name=display_name,
        payload=payload,
        severity=severity,
        client_created_at=client_created_at,
        created_at=created_at,
    )

    with _connection(path) as conn:
        conn.execute(_INSERTAR, fila)
        _recortar(conn)

    return devuelto


def append_entries(path: str, entries: Iterable[dict[str, Any]]) -> int:
    """Varias filas en UNA transacción (un commit, una comprobación del tope).

    Cada elemento lleva las mismas claves que `append_entry`. Sirve para
    volcar el rastro de posiciones de un evento sin cincuenta commits.
    """
    filas = []
    for entrada in entries:
        fila, _ = _fila_a_insertar(
            event_type=entrada.get("event_type"),
            user=entrada.get("user"),
            display_name=entrada.get("display_name") or "",
            payload=entrada.get("payload"),
            severity=entrada.get("severity"),
            client_created_at=entrada.get("client_created_at"),
            created_at=entrada.get("created_at"),
        )
        filas.append(fila)

    if not filas:
        return 0

    init_schema(path)
    with _connection(path) as conn:
        conn.executemany(_INSERTAR, filas)
        _recortar(conn)
    return len(filas)


def list_entries(
    path: str,
    *,
    user: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
    only_suspicions: bool = False,
) -> list[dict[str, Any]]:
    """Las entradas, de más antigua a más reciente.

    Los filtros de fecha se aplican a CUÁNDO PASÓ (`occurred_at`), no a cuándo se
    subió. Con `limit` se devuelven las N más recientes (por ocurrencia) y luego
    se reordenan cronológicamente.
    """
    init_schema(path)

    clauses = []
    params: list[Any] = []

    if user:
        clauses.append("user = ?")
        params.append(user)

    if date_from:
        clauses.append("occurred_at >= ?")
        params.append(normalizar_instante(date_from) or str(date_from))

    if date_to:
        clauses.append("occurred_at <= ?")
        params.append(normalizar_instante(date_to) or str(date_to))

    if event_type:
        clauses.append("type = ?")
        params.append(event_type)

    if only_suspicions:
        clauses.append("(severity = 'suspicion' OR type = 'suspicion')")

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""

    if limit is not None:
        sql = (
            f"SELECT * FROM (SELECT * FROM match_log{where} ORDER BY occurred_at DESC, id DESC LIMIT ?) "
            "ORDER BY created_at ASC, id ASC"
        )
        params.append(max(1, min(20_000, int(limit))))
    else:
        sql = f"SELECT * FROM match_log{where} ORDER BY created_at ASC, id ASC"

    with _connection(path) as conn:
        rows = conn.execute(sql, params).fetchall()

    entradas = []
    for fila in rows:
        entrada = _row_to_entry(fila)
        entrada["occurred_at"] = fila["occurred_at"] or calcular_occurred_at(
            fila["client_created_at"], fila["created_at"]
        )
        entradas.append(entrada)
    return entradas


def iterar_entradas(path: str, *, lote: int = 500):
    """Todas las entradas por orden de OCURRENCIA, de `lote` en `lote`.

    Para exportar una partida sin cargar las 20 000 filas en memoria a la vez
    (la Raspberry es pequeña): un cursor y `fetchmany`.
    """
    init_schema(path)
    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute("SELECT * FROM match_log ORDER BY occurred_at ASC, created_at ASC, id ASC")
        while True:
            filas = cursor.fetchmany(max(1, int(lote)))
            if not filas:
                break
            for fila in filas:
                entrada = _row_to_entry(fila)
                entrada["occurred_at"] = fila["occurred_at"] or calcular_occurred_at(
                    fila["client_created_at"], fila["created_at"]
                )
                yield entrada
    finally:
        conn.close()


def count_entries(path: str, *, user: str | None = None) -> int:
    init_schema(path)
    with _connection(path) as conn:
        if user:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM match_log WHERE user = ?", (user,)
            ).fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) AS n FROM match_log").fetchone()
    return int(row["n"] or 0)


def delete_all(path: str, *, user: str | None = None) -> int:
    """Borra el registro (o sólo el de `user`). Devuelve cuántas filas se han ido."""
    init_schema(path)
    with _connection(path) as conn:
        if user:
            cursor = conn.execute("DELETE FROM match_log WHERE user = ?", (user,))
        else:
            cursor = conn.execute("DELETE FROM match_log")
    return cursor.rowcount or 0

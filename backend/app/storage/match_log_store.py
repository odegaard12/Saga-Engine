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
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any
import json
import os
import sqlite3
import uuid


DEFAULT_MATCH_LOG_FILENAME = "match_log.sqlite3"

# Tope por partida: la fila más antigua se poda al superarlo. Pensado para
# una travesía de un día con varios jugadores, no para acumular temporadas.
MAX_ROWS_PER_MATCH = 20_000


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
                payload_json TEXT NOT NULL DEFAULT '{}'
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

    row_id = new_row_id()
    when = created_at or utc_now_iso()

    with _connection(path) as conn:
        conn.execute(
            """
            INSERT INTO match_log (
                id, type, user, display_name, severity, created_at, client_created_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row_id,
                str(event_type or "").strip() or "info",
                str(user or "").strip(),
                str(display_name or "").strip(),
                severity,
                when,
                client_created_at,
                _dumps(payload),
            ),
        )

        total = conn.execute("SELECT COUNT(*) AS n FROM match_log").fetchone()["n"]
        if total > MAX_ROWS_PER_MATCH:
            exceso = total - MAX_ROWS_PER_MATCH
            conn.execute(
                """
                DELETE FROM match_log WHERE id IN (
                    SELECT id FROM match_log ORDER BY created_at ASC, id ASC LIMIT ?
                )
                """,
                (exceso,),
            )

    return {
        "id": row_id,
        "type": event_type,
        "user": user,
        "display_name": display_name,
        "created_at": when,
        "client_created_at": client_created_at,
        "severity": severity,
        "payload": payload or {},
    }


def list_entries(
    path: str,
    *,
    user: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    init_schema(path)

    clauses = []
    params: list[Any] = []

    if user:
        clauses.append("user = ?")
        params.append(user)

    if date_from:
        clauses.append("created_at >= ?")
        params.append(date_from)

    if date_to:
        clauses.append("created_at <= ?")
        params.append(date_to)

    if event_type:
        clauses.append("type = ?")
        params.append(event_type)

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = f"SELECT * FROM match_log{where} ORDER BY created_at ASC, id ASC"

    if limit is not None:
        sql += " LIMIT ?"
        params.append(max(1, min(20_000, int(limit))))

    with _connection(path) as conn:
        rows = conn.execute(sql, params).fetchall()

    return [_row_to_entry(row) for row in rows]


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

"""Lo ganado del vestuario, en SQLite (junto a los eventos, `saga.sqlite3`).

Tablas:

    desbloqueos (jugador, clave) PK      lo ganado; retirar no borra (deja rastro)
    desbloqueos_registro                 historial para el panel: concedido / retirado
    contadores_jugador (jugador) PK      metros andados con GPS válido
    desbloqueos_avisos                   avisos pendientes para el móvil («X ahora se gana…»)

Conceder es idempotente por construcción (`INSERT … ON CONFLICT DO NOTHING`):
da igual cuántas veces se reprocese un evento o se sincronice la cola. Lo
retirado por el organizador NO lo vuelve a dar el sistema: sólo el admin.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Iterable

from backend.app.storage import schema_cache

_ESQUEMA = "desbloqueos"
_CERROJO = threading.Lock()


def _ahora_ms() -> int:
    return int(time.time() * 1000)


@contextmanager
def _conexion(path: str):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
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
            # WAL, como el resto de bases: con 15 móviles sincronizando a la vez
            # los lectores no esperan al que escribe. Era la única sin él.
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute(
                """CREATE TABLE IF NOT EXISTS desbloqueos (
                    jugador TEXT NOT NULL,
                    clave TEXT NOT NULL,
                    fuente TEXT NOT NULL,
                    regla TEXT NOT NULL DEFAULT '',
                    evento_ref TEXT NOT NULL DEFAULT '',
                    por TEXT NOT NULL DEFAULT 'sistema',
                    sospecha INTEGER NOT NULL DEFAULT 0,
                    motivo TEXT NOT NULL DEFAULT '',
                    concedido_ms INTEGER NOT NULL,
                    visto_ms INTEGER,
                    retirado_ms INTEGER,
                    PRIMARY KEY (jugador, clave)
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS desbloqueos_registro (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    jugador TEXT NOT NULL,
                    clave TEXT NOT NULL,
                    accion TEXT NOT NULL,
                    fuente TEXT NOT NULL DEFAULT '',
                    por TEXT NOT NULL DEFAULT 'sistema',
                    sospecha INTEGER NOT NULL DEFAULT 0,
                    motivo TEXT NOT NULL DEFAULT '',
                    creado_ms INTEGER NOT NULL
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS contadores_jugador (
                    jugador TEXT PRIMARY KEY,
                    metros_validos INTEGER NOT NULL DEFAULT 0,
                    actualizado_ms INTEGER
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS desbloqueos_avisos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    jugador TEXT NOT NULL,
                    tipo TEXT NOT NULL,
                    texto TEXT NOT NULL,
                    claves_json TEXT NOT NULL DEFAULT '[]',
                    creado_ms INTEGER NOT NULL,
                    visto_ms INTEGER
                )"""
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_desbloqueos_registro_creado ON desbloqueos_registro(creado_ms)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_desbloqueos_avisos_jugador ON desbloqueos_avisos(jugador)")
        schema_cache.marcar_listo(_ESQUEMA, path)


def _fila(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def conceder(
    path: str,
    jugador: str,
    claves: Iterable[str],
    *,
    fuente: str,
    por: str = "sistema",
    regla: str = "",
    evento_ref: str = "",
    sospecha: bool = False,
    motivo: str = "",
) -> list[str]:
    """Concede las claves que falten y devuelve las NUEVAS.

    `por="admin"` vuelve a dar lo retirado; el sistema no (lo retirado por el
    organizador se queda retirado aunque la regla se siga cumpliendo).
    """
    init_schema(path)
    jugador = str(jugador or "").strip()
    nuevas: list[str] = []
    if not jugador:
        return nuevas
    ahora = _ahora_ms()
    with _conexion(path) as conn:
        for clave in dict.fromkeys(str(c) for c in claves if c):
            existente = conn.execute(
                "SELECT retirado_ms FROM desbloqueos WHERE jugador = ? AND clave = ?", (jugador, clave)
            ).fetchone()
            if existente is not None:
                if existente["retirado_ms"] is None or por != "admin":
                    continue
                conn.execute(
                    """UPDATE desbloqueos SET retirado_ms = NULL, fuente = ?, por = ?, regla = ?, evento_ref = ?,
                       sospecha = ?, motivo = ?, concedido_ms = ?, visto_ms = NULL WHERE jugador = ? AND clave = ?""",
                    (fuente, por, regla, evento_ref, int(bool(sospecha)), motivo, ahora, jugador, clave),
                )
            else:
                cursor = conn.execute(
                    """INSERT INTO desbloqueos (jugador, clave, fuente, regla, evento_ref, por, sospecha, motivo, concedido_ms)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(jugador, clave) DO NOTHING""",
                    (jugador, clave, fuente, regla, evento_ref, por, int(bool(sospecha)), motivo, ahora),
                )
                if cursor.rowcount == 0:
                    continue
            conn.execute(
                """INSERT INTO desbloqueos_registro (jugador, clave, accion, fuente, por, sospecha, motivo, creado_ms)
                   VALUES (?, ?, 'concedido', ?, ?, ?, ?, ?)""",
                (jugador, clave, fuente, por, int(bool(sospecha)), motivo, ahora),
            )
            nuevas.append(clave)
    return nuevas


def retirar(path: str, jugador: str, clave: str, *, motivo: str = "", por: str = "admin") -> bool:
    init_schema(path)
    ahora = _ahora_ms()
    with _conexion(path) as conn:
        cursor = conn.execute(
            "UPDATE desbloqueos SET retirado_ms = ?, motivo = ? WHERE jugador = ? AND clave = ? AND retirado_ms IS NULL",
            (ahora, motivo, str(jugador), str(clave)),
        )
        if cursor.rowcount == 0:
            return False
        conn.execute(
            """INSERT INTO desbloqueos_registro (jugador, clave, accion, fuente, por, motivo, creado_ms)
               VALUES (?, ?, 'retirado', 'admin', ?, ?, ?)""",
            (str(jugador), str(clave), por, motivo, ahora),
        )
    return True


def listar(path: str, jugador: str | None = None, *, incluir_retirados: bool = False) -> list[dict]:
    init_schema(path)
    consulta = "SELECT * FROM desbloqueos"
    condiciones, args = [], []
    if jugador is not None:
        condiciones.append("jugador = ?")
        args.append(str(jugador))
    if not incluir_retirados:
        condiciones.append("retirado_ms IS NULL")
    if condiciones:
        consulta += " WHERE " + " AND ".join(condiciones)
    with _conexion(path) as conn:
        return [_fila(r) for r in conn.execute(consulta + " ORDER BY concedido_ms", args).fetchall()]


def claves_de(path: str, jugador: str) -> set[str]:
    return {fila["clave"] for fila in listar(path, jugador)}


def retiradas_de(path: str, jugador: str) -> set[str]:
    return {f["clave"] for f in listar(path, jugador, incluir_retirados=True) if f["retirado_ms"] is not None}


def marcar_vistos(path: str, jugador: str, claves: Iterable[str] | None = None) -> int:
    init_schema(path)
    ahora = _ahora_ms()
    with _conexion(path) as conn:
        if claves is None:
            return conn.execute(
                "UPDATE desbloqueos SET visto_ms = ? WHERE jugador = ? AND visto_ms IS NULL", (ahora, str(jugador))
            ).rowcount
        total = 0
        for clave in claves:
            total += conn.execute(
                "UPDATE desbloqueos SET visto_ms = ? WHERE jugador = ? AND clave = ? AND visto_ms IS NULL",
                (ahora, str(jugador), str(clave)),
            ).rowcount
        return total


def registro(path: str, limite: int = 200) -> list[dict]:
    init_schema(path)
    with _conexion(path) as conn:
        filas = conn.execute(
            "SELECT * FROM desbloqueos_registro ORDER BY id DESC LIMIT ?", (max(1, min(2000, int(limite))),)
        ).fetchall()
    return [_fila(r) for r in filas]


# --- contadores ---------------------------------------------------------------

def metros(path: str, jugador: str) -> int:
    init_schema(path)
    with _conexion(path) as conn:
        fila = conn.execute("SELECT metros_validos FROM contadores_jugador WHERE jugador = ?", (str(jugador),)).fetchone()
    return int(fila["metros_validos"]) if fila else 0


def sumar_metros(path: str, jugador: str, metros_: int) -> int:
    """Suma metros válidos y devuelve el total nuevo."""
    init_schema(path)
    metros_ = max(0, int(metros_ or 0))
    with _conexion(path) as conn:
        conn.execute(
            """INSERT INTO contadores_jugador (jugador, metros_validos, actualizado_ms) VALUES (?, ?, ?)
               ON CONFLICT(jugador) DO UPDATE SET metros_validos = metros_validos + excluded.metros_validos,
               actualizado_ms = excluded.actualizado_ms""",
            (str(jugador), metros_, _ahora_ms()),
        )
        fila = conn.execute("SELECT metros_validos FROM contadores_jugador WHERE jugador = ?", (str(jugador),)).fetchone()
    return int(fila["metros_validos"]) if fila else 0


def borrar_contadores(path: str) -> int:
    """Purga de datos personales: los metros son rastro de movimiento."""
    init_schema(path)
    with _conexion(path) as conn:
        return conn.execute("DELETE FROM contadores_jugador").rowcount


# --- avisos ---------------------------------------------------------------------

def anadir_aviso(path: str, jugador: str, tipo: str, texto: str, claves: Iterable[str] = ()) -> None:
    init_schema(path)
    with _conexion(path) as conn:
        conn.execute(
            "INSERT INTO desbloqueos_avisos (jugador, tipo, texto, claves_json, creado_ms) VALUES (?, ?, ?, ?, ?)",
            (str(jugador), tipo, texto[:400], json.dumps(list(claves)), _ahora_ms()),
        )


def avisos_pendientes(path: str, jugador: str) -> list[dict]:
    init_schema(path)
    with _conexion(path) as conn:
        filas = conn.execute(
            "SELECT * FROM desbloqueos_avisos WHERE jugador = ? AND visto_ms IS NULL ORDER BY id", (str(jugador),)
        ).fetchall()
    salida = []
    for fila in filas:
        try:
            claves = json.loads(fila["claves_json"] or "[]")
        except ValueError:
            claves = []
        salida.append({"id": fila["id"], "tipo": fila["tipo"], "texto": fila["texto"],
                       "claves": claves, "creado_ms": fila["creado_ms"]})
    return salida


def marcar_avisos_vistos(path: str, jugador: str, ids: Iterable[int] | None = None) -> int:
    init_schema(path)
    ahora = _ahora_ms()
    with _conexion(path) as conn:
        if ids is None:
            return conn.execute(
                "UPDATE desbloqueos_avisos SET visto_ms = ? WHERE jugador = ? AND visto_ms IS NULL", (ahora, str(jugador))
            ).rowcount
        total = 0
        for aviso in ids:
            try:
                aviso = int(aviso)
            except (TypeError, ValueError):
                continue
            total += conn.execute(
                "UPDATE desbloqueos_avisos SET visto_ms = ? WHERE jugador = ? AND id = ? AND visto_ms IS NULL",
                (ahora, str(jugador), aviso),
            ).rowcount
        return total

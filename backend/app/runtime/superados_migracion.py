"""Migración única: rellenar `superados` desde los niveles guardados.

Para cada (jugador, nivel) de `game_state` se marcan como superados los ids de
`ids[:nivel]` (origen 'migracion', con la hora de `nodos[i].completed_at_ms` de
los tiempos si existe). Después se comprueba que el puntero derivado coincide
con el nivel de CADA jugador: si alguno no cuadra, ROLLBACK y no se toca nada.

La llama igual el script (`scripts/migrar_superados.py`) que el arranque del
servidor. Es idempotente: la marca `superados_migrado` vive en `schema_meta`,
dentro de la propia base y de la misma transacción que las filas. Mientras no
esté, el servidor no escribe en `superados` (modo antiguo).

Todo va en UN `BEGIN IMMEDIATE`: toma el candado de escritura de SQLite, así que
espera a quien esté escribiendo un nivel y nadie escribe uno a mitad; los niveles
se leen ya dentro, y por eso la comprobación es sobre datos coherentes.
"""

import json
import os
import shutil
import sqlite3
import time

from backend.app.runtime import superados as _superados
from backend.app.storage import sqlite_store as _sql

FICHEROS_A_COPIAR = ("game_timers.json", "inventory.json", "rechazos_de_avance.json")


class MigracionIncoherente(Exception):
    """Un jugador no cuadra tras migrar: se deshace todo."""


def ids_de_la_mision(db_path, data_dir):
    """Ids de la misión: la tabla `stages` de SQLite o, si está vacía, `stages.json`."""
    nodos = _sql.load_sqlite_stages(db_path)
    if not nodos:
        ruta = os.path.join(data_dir, "stages.json")
        try:
            with open(ruta, encoding="utf-8") as f:
                crudo = json.load(f)
            nodos = crudo if isinstance(crudo, list) else []
        except (OSError, ValueError):
            nodos = []
    return [str(n.get("id")) for n in nodos if isinstance(n, dict)]


def hacer_copias(db_path, data_dir, destino=None):
    """Copia previa: la base con la API de backup de SQLite (coherente aunque haya
    escritores; no vale copiar el fichero con el WAL abierto) y los JSON con marca
    de tiempo. Devuelve la carpeta."""
    marca = time.strftime("%Y%m%d-%H%M%S")
    destino = destino or os.path.join(data_dir, "copias_superados")
    os.makedirs(destino, exist_ok=True)

    origen = sqlite3.connect(db_path, timeout=10.0)
    try:
        copia = sqlite3.connect(os.path.join(destino, f"saga.{marca}.sqlite3"))
        try:
            origen.backup(copia)
        finally:
            copia.close()
    finally:
        origen.close()

    for nombre in FICHEROS_A_COPIAR:
        ruta = os.path.join(data_dir, nombre)
        if os.path.exists(ruta):
            base, ext = os.path.splitext(nombre)
            shutil.copy2(ruta, os.path.join(destino, f"{base}.{marca}{ext}"))
    return destino


def _hora_de(timers, user, indice):
    entrada = (timers or {}).get(user)
    nodos = entrada.get("nodos") if isinstance(entrada, dict) else None
    registro = nodos.get(str(indice)) if isinstance(nodos, dict) else None
    try:
        return int((registro or {}).get("completed_at_ms") or 0)
    except (TypeError, ValueError, AttributeError):
        return 0


def migrar(db_path, ids, timers=None):
    """Devuelve {'estado': 'migrada'|'ya_hecha', 'jugadores': n, 'filas': n}.

    Lanza `MigracionIncoherente` (tras hacer ROLLBACK) si algún jugador no cuadra.
    """
    ids = [str(i) for i in ids]
    _sql.init_sqlite_schema(db_path)
    conn = _sql.connect_sqlite(db_path)
    conn.isolation_level = None  # transacción manual
    try:
        conn.execute("BEGIN IMMEDIATE")
        try:
            if _sql.superados_activos(conn):
                conn.execute("ROLLBACK")
                return {"estado": "ya_hecha", "jugadores": 0, "filas": 0}

            niveles = {
                fila["user"]: int(fila["level"] or 0)
                for fila in conn.execute("SELECT user, level FROM game_state").fetchall()
            }
            if not ids and any(n > 0 for n in niveles.values()):
                # Sin misión legible no hay con qué comprobar nada (¿fallo al leerla?).
                raise MigracionIncoherente("hay jugadores con progreso y la misión no tiene nodos")

            filas = 0
            for user, nivel in niveles.items():
                hasta = min(nivel, len(ids))  # nivel > nodos = terminado
                for indice in range(hasta):
                    cur = conn.execute(
                        "INSERT OR IGNORE INTO superados (user, node_id, ts, origen, retirado)"
                        " VALUES (?, ?, ?, 'migracion', 0)",
                        (user, ids[indice], _hora_de(timers, user, indice)),
                    )
                    filas += cur.rowcount
                derivado = _superados.nivel_derivado(ids, _sql.leer_superados(conn, user))
                if derivado != hasta:
                    raise MigracionIncoherente(
                        f"jugador {user!r}: nivel {hasta} y puntero derivado {derivado}"
                    )

            conn.execute(
                "INSERT INTO schema_meta (key, value) VALUES (?, ?)",
                (_sql.MARCA_SUPERADOS, _sql.utc_now_iso()),
            )
            conn.execute("COMMIT")
        except BaseException:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        return {"estado": "migrada", "jugadores": len(niveles), "filas": filas}
    finally:
        conn.close()

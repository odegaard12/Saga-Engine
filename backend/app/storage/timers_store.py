"""Los relojes de los jugadores (lo que era `game_timers.json`) en SQLite.

22/11 (mejora 8): `game_timers.json` se reescribía ENTERO en cada avance, bajo un cerrojo de fichero único para
todos: con 15 jugadores a la vez, cola; y un corte de luz a mitad (las Pis los tienen) dejaba un fichero vacío o
roto que había que recuperar del `.bak`. Ahora cada jugador es una fila de `player_timers` (su entrada tal cual,
en JSON) en la base de la partida, con la misma transacción `BEGIN IMMEDIATE` que los niveles: dos avances a la
vez se ponen en cola y ninguno pisa al otro, y `asegurar_durabilidad` (un fsync por avance) también los cubre.

La forma de los datos NO cambia: `cargar` devuelve el mismo `{jugador: entrada}` que daba el JSON y `actualizar`
recibe el mismo updater que `update_json`, así que player_timers.py y la clasificación no notan nada.

Importación, UNA vez por base: la primera vez que se usa una base sin la marca `timers_importados`, se copian
a ella los jugadores del JSON (los que la base no tenga ya) y se pone la marca, en la misma transacción. El JSON
no se toca ni se borra: queda como copia. Si el JSON existe pero no se puede leer (ni de su `.bak`), no se
marca nada: las escrituras fallan como antes (`ErrorDeAlmacen`, 503) y las lecturas dan lo que haya, hasta que
se arregle el fichero. Con `SAGA_STORAGE_BACKEND=json` todo sigue en el JSON de siempre.
"""

from __future__ import annotations

import json
import time
from typing import Any, Callable

from backend.app.storage import json_store
from backend.app.storage.runtime_store import resolve_runtime_backend, resolve_runtime_db_path
from backend.app.storage.sqlite_store import init_sqlite_schema, sqlite_connection, utc_now_iso

MARCA = "timers_importados"


def _usa_sqlite() -> bool:
    return resolve_runtime_backend() == "sqlite"


def _volcar(entrada: Any) -> str:
    return json.dumps(entrada, ensure_ascii=False, separators=(",", ":"))


def _marcada(conn) -> bool:
    return conn.execute("SELECT 1 FROM schema_meta WHERE key = ?", (MARCA,)).fetchone() is not None


def _asegurar_importado(path: str, db: str) -> None:
    """Importa `path` (el JSON) a `db` si la base aún no tiene la marca. Lanza `ErrorDeAlmacen` si no se lee."""
    init_sqlite_schema(db)
    with sqlite_connection(db) as conn:
        if _marcada(conn):
            return
        if not conn.in_transaction:
            conn.execute("BEGIN IMMEDIATE")
        if _marcada(conn):  # otro hilo o proceso la importó mientras esperábamos el cerrojo
            return
        # Lo mismo que leía `update_json`: «no existe» o vacío = {}; ilegible se aparta y lanza, salvo `.bak` bueno.
        _texto, viejos = json_store._leer_texto_y_valor(path, {})
        viejos = viejos if isinstance(viejos, dict) else {}
        for user, entrada in viejos.items():
            conn.execute(
                "INSERT OR IGNORE INTO player_timers (user, entrada_json, updated_at) VALUES (?, ?, ?)",
                (str(user), _volcar(entrada), utc_now_iso()),
            )
        conn.execute(
            "INSERT INTO schema_meta (key, value) VALUES (?, ?)",
            (MARCA, json.dumps({"ms": int(time.time() * 1000), "jugadores": len(viejos)})),
        )
    if viejos:
        print(f"[INFO] relojes de {len(viejos)} jugadores importados a SQLite; {path} queda como copia", flush=True)


def json_en_uso(path: str) -> bool:
    """¿El JSON sigue siendo la fuente de los relojes? (backend json, o la importación aún pendiente)."""
    if not _usa_sqlite():
        return True
    db = resolve_runtime_db_path(path)
    try:
        init_sqlite_schema(db)
        with sqlite_connection(db) as conn:
            return not _marcada(conn)
    except Exception:  # noqa: BLE001 - si no se sabe, se sigue vigilando el JSON
        return True


def _filas(conn) -> dict[str, str]:
    return {fila["user"]: fila["entrada_json"] for fila in conn.execute("SELECT user, entrada_json FROM player_timers")}


def cargar(path: str) -> dict:
    if not _usa_sqlite():
        return json_store.load_json(path, {})
    db = resolve_runtime_db_path(path)
    try:
        _asegurar_importado(path, db)
    except json_store.ErrorDeAlmacen:
        pass  # como `load_json`: una lectura no tumba los GET; las escrituras sí lanzan
    with sqlite_connection(db) as conn:
        return {user: json.loads(texto) for user, texto in _filas(conn).items()}


def _escribir(conn, antes: dict[str, str], nuevo: dict) -> int:
    """Escribe sólo las filas que cambian (sin cambios, ni escritura ni fsync). Devuelve cuántas."""
    cambios = 0
    textos = {str(user): _volcar(entrada) for user, entrada in nuevo.items()}
    for user, texto in textos.items():
        if antes.get(user) != texto:
            conn.execute(
                """
                INSERT INTO player_timers (user, entrada_json, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(user) DO UPDATE SET entrada_json = excluded.entrada_json, updated_at = excluded.updated_at
                """,
                (user, texto, utc_now_iso()),
            )
            cambios += 1
    for user in antes.keys() - textos.keys():
        conn.execute("DELETE FROM player_timers WHERE user = ?", (user,))
        cambios += 1
    return cambios


def actualizar(path: str, updater: Callable[[dict], Any]) -> Any:
    """Como `update_json(path, {}, updater)`: leer, cambiar y escribir en UNA transacción de escritura."""
    if not _usa_sqlite():
        return json_store.update_json(path, {}, updater)
    db = resolve_runtime_db_path(path)
    _asegurar_importado(path, db)
    with sqlite_connection(db) as conn:
        if not conn.in_transaction:
            conn.execute("BEGIN IMMEDIATE")  # el cerrojo ANTES de leer: dos avances a la vez se ponen en cola
        antes = _filas(conn)
        nuevo = updater({user: json.loads(texto) for user, texto in antes.items()})
        if not isinstance(nuevo, dict):
            # El JSON guardaba cualquier cosa; aquí sería borrar a todos. Ningún updater lo hace: no se escribe.
            raise TypeError(f"los relojes son un dict, no {type(nuevo).__name__}")
        _escribir(conn, antes, nuevo)
    return nuevo


def guardar(path: str, timers: dict) -> None:
    actualizar(path, lambda _actuales: timers)

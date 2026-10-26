"""SQLite storage foundation for SAGA Engine.

This module is not the active production storage backend yet.

It creates the first SQLite schema and helper functions for the data that will
eventually replace high-churn JSON files:

- event log
- player game state
- live positions

The current runtime can continue using JSON while this foundation is tested.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any
import json
import marshal
import os
import sqlite3
import threading
import weakref

from backend.app.storage import schema_cache
from backend.app.storage.event_log import normalize_event
from backend.app.storage.positions import normalize_live_position


DEFAULT_SQLITE_FILENAME = "saga.sqlite3"
SQLITE_SCHEMA_VERSION = 1

_ESQUEMA = "saga"
_CERROJO_ESQUEMA = threading.Lock()

#: Claves del payload de un evento que llevan coordenadas o muestras de GPS.
#: La purga de datos personales las quita de los eventos que se conservan.
CLAVES_CON_GPS = ("samples", "evidence", "lat", "lon", "accuracy")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_CARPETAS_HECHAS: set[str] = set()


def resolve_sqlite_path(data_dir: str, filename: str = DEFAULT_SQLITE_FILENAME) -> str:
    base = str(data_dir or ".").strip() or "."
    if not os.path.isabs(base):
        base = os.path.abspath(base)

    # Una vez por carpeta y proceso: se llama varias veces en cada petición y
    # `makedirs` es un `mkdir` que falla con EEXIST más un `stat` (en el PC,
    # 0,8 ms por llamada). Si la carpeta desaparece después, la vuelve a crear
    # quien abre la conexión (`connect_sqlite` / `_conexion_del_hilo`).
    if base not in _CARPETAS_HECHAS:
        os.makedirs(base, exist_ok=True)
        _CARPETAS_HECHAS.add(base)
    return os.path.join(base, filename)


def connect_sqlite(path: str) -> sqlite3.Connection:
    """Conexión nueva, de usar y cerrar (arranque, migraciones, crear el esquema)."""
    return _abrir(path)


# ---------------------------------------------------------------------------
# Una conexión por hilo y por fichero, reutilizada
# ---------------------------------------------------------------------------
#
# Auditoría 23/10: `sqlite_connection` abría y cerraba una conexión en CADA
# llamada, y un latido hace unas veinte. En WAL, cerrar la última conexión de un
# fichero hace un checkpoint (con fsync) y borra el `-wal` y el `-shm`, que la
# siguiente apertura vuelve a crear: medido en el PC, 9 ms por lectura de una
# fila; en la SD de la Pi, más. Ahora cada hilo guarda su conexión abierta por
# fichero y la reutiliza.
#
# - Por hilo, porque una conexión de sqlite3 no se puede usar a la vez desde dos
#   hilos, y el servidor atiende cada petición `def` en un hilo del pool.
# - Por ruta, porque los tests cambian de base entre casos: cada fichero tiene
#   su conexión y nunca se mezclan.
# - Con la huella del fichero (dispositivo + inodo), igual que schema_cache.py:
#   la réplica recibe la base nueva cada 5 min con un `mv` encima de la vieja
#   (y una restauración de copia hace lo mismo). Una conexión abierta seguiría
#   leyendo el fichero viejo, borrado pero vivo mientras alguien lo tenga
#   abierto; si la huella cambia se cierra y se abre otra.
# - `cerrar_conexiones()` las cierra todas (al apagar el servidor y en tests).
#
# EL `mv` DE LA RÉPLICA, CON CONEXIONES ABIERTAS. Antes, entre petición y
# petición no quedaba ninguna conexión, y la última al cerrarse borraba el
# `-wal` y el `-shm`: el `mv` dejaba la base sola. Ahora siguen ahí, y son del
# fichero VIEJO. Dos trampas, las dos de SQLite y no de Python:
#
# 1. Si la base nueva se abre con el `-wal` y el `-shm` del fichero viejo,
#    SQLite los da por buenos y lee páginas de la base vieja sobre la nueva.
#    Antes de abrir se comprueba: si la base cambió de inodo y el `-wal`/`-shm`
#    son EXACTAMENTE los que había al abrir la vieja, se quitan
#    (`_quitar_wal_de_otra_base`).
# 2. Cerrar una conexión hace checkpoint y borra el `-wal` POR NOMBRE: el de una
#    conexión vieja borraría el `-wal` vivo de la base nueva. Las que se cierran
#    con el fichero ya cambiado se cierran sin checkpoint (`_cerrar`).

_POR_HILO = threading.local()
#: Todas las entradas vivas, para cerrarlas al apagar. Débil: si un hilo muere,
#: su `threading.local` se va, y la entrada con él (su `cierre` cierra la conexión).
_ENTRADAS = weakref.WeakSet()
#: Guarda `_ENTRADAS` y las aperturas: la comprobación del `-wal` ajeno y la
#: apertura no se pueden cruzar con las de otro hilo.
_CERROJO_CONEXIONES = threading.Lock()
#: Sube con cada `cerrar_conexiones()`: una entrada de otra generación ya está
#: cerrada y se descarta sin usarla.
_GENERACION = 0
#: {base: (huella de la base, del -wal, del -shm)} al abrir la última conexión.
_FICHEROS_DE_LA_BASE: dict[str, tuple] = {}


class _Entrada:
    __slots__ = ("conn", "huella", "generacion", "profundidad", "cierre", "__weakref__")

    def __init__(self, conn, ruta, huella, generacion):
        self.conn = conn
        self.huella = huella
        self.generacion = generacion
        # Anidar `sqlite_connection` del mismo fichero en el mismo hilo da la
        # misma conexión: sólo el bloque de fuera hace commit o rollback (si no,
        # el de dentro confirmaría a medias la transacción del de fuera).
        self.profundidad = 0
        # Se llama una vez: a mano, o sola cuando el hilo muere y la entrada se va.
        self.cierre = weakref.finalize(self, _cerrar, conn, ruta, huella)


def _huella_fichero(ruta: str):
    try:
        estado = os.stat(ruta)
    except OSError:
        return None
    return (estado.st_dev, estado.st_ino)


def _cerrar(conn, ruta: str, huella) -> None:
    """Cierra; si el fichero ya no es el que se abrió, sin checkpoint (trampa 2)."""
    try:
        if _huella_fichero(ruta) != huella:
            conn.setconfig(sqlite3.SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, True)
        conn.close()
    except sqlite3.Error:
        pass


def _quitar_wal_de_otra_base(ruta: str) -> None:
    """Trampa 1: el `-wal`/`-shm` que quedó de la base a la que le hicieron `mv` encima."""
    antes = _FICHEROS_DE_LA_BASE.get(ruta)
    if not antes or _huella_fichero(ruta) == antes[0]:
        return
    for sufijo, huella in (("-wal", antes[1]), ("-shm", antes[2])):
        if huella is not None and _huella_fichero(ruta + sufijo) == huella:
            try:
                os.unlink(ruta + sufijo)
            except OSError:
                pass  # Windows no deja (ni deja hacer el `mv` con la base abierta)


def _abrir(path: str, *, entre_hilos: bool = False) -> sqlite3.Connection:
    ruta = os.path.abspath(path)
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    with _CERROJO_CONEXIONES:
        _quitar_wal_de_otra_base(ruta)
        conn = sqlite3.connect(ruta, timeout=10.0, check_same_thread=not entre_hilos)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA busy_timeout = 5000")
            # 25/10 (auditoría): en WAL basta NORMAL (un corte de luz puede perder la última transacción, nunca
            # corromper); FULL hacía un fsync por commit y los avances se encolaban.
            conn.execute("PRAGMA synchronous = NORMAL")
            # Una lectura de la cabecera: en WAL abre el `-wal` y el `-shm`, y así
            # su huella queda apuntada como «los de esta base».
            conn.execute("PRAGMA schema_version").fetchone()
        except BaseException:
            conn.close()
            raise
        _FICHEROS_DE_LA_BASE[ruta] = (
            _huella_fichero(ruta),
            _huella_fichero(ruta + "-wal"),
            _huella_fichero(ruta + "-shm"),
        )
    return conn


def _conexion_del_hilo(path: str) -> _Entrada:
    clave = os.path.abspath(path)
    entradas = getattr(_POR_HILO, "entradas", None)
    if entradas is None:
        entradas = _POR_HILO.entradas = {}

    entrada = entradas.get(clave)
    if entrada is not None:
        if entrada.profundidad:
            return entrada  # anidada: la misma conexión, aunque el fichero cambie a mitad
        if entrada.generacion == _GENERACION and entrada.huella == _huella_fichero(clave):
            return entrada
        # Fichero sustituido o borrado (réplica, restauración, test) o conexiones
        # cerradas por `cerrar_conexiones()`: fuera la vieja.
        entradas.pop(clave, None)
        entrada.cierre()

    # `entre_hilos`: la usa sólo este hilo, pero `cerrar_conexiones()` la cierra
    # desde el que apaga el servidor.
    conn = _abrir(clave, entre_hilos=True)
    entrada = _Entrada(conn, clave, _huella_fichero(clave), _GENERACION)
    entradas[clave] = entrada
    with _CERROJO_CONEXIONES:
        _ENTRADAS.add(entrada)
    return entrada


def cerrar_conexiones() -> int:
    """Cierra todas las conexiones reutilizadas de todos los hilos. Devuelve cuántas.

    Al apagar el servidor (la última conexión de un fichero en WAL hace el
    checkpoint y deja la base en un solo fichero) y en tests que necesitan
    borrar la base: en Windows no se puede borrar un fichero abierto.
    """
    global _GENERACION
    with _CERROJO_CONEXIONES:
        _GENERACION += 1
        entradas = list(_ENTRADAS)
        _ENTRADAS.clear()
    for entrada in entradas:
        entrada.cierre()
    propias = getattr(_POR_HILO, "entradas", None)
    if propias:
        propias.clear()
    return len(entradas)


@contextmanager
def sqlite_connection(path: str):
    entrada = _conexion_del_hilo(path)
    conn = entrada.conn
    entrada.profundidad += 1
    try:
        yield conn
        if entrada.profundidad == 1:
            conn.commit()
    except BaseException:
        # BaseException también: una transacción abierta en una conexión que se
        # reutiliza dejaría el cerrojo de escritura cogido para siempre.
        if entrada.profundidad == 1:
            try:
                conn.rollback()
            except sqlite3.Error:
                _descartar(path, entrada)
        raise
    finally:
        entrada.profundidad -= 1


def _descartar(path: str, entrada: _Entrada) -> None:
    """Una conexión que no pudo ni deshacer: se cierra y la próxima vez se abre otra."""
    entradas = getattr(_POR_HILO, "entradas", None) or {}
    if entradas.get(os.path.abspath(path)) is entrada:
        entradas.pop(os.path.abspath(path), None)
    entrada.cierre()


def init_sqlite_schema(path: str) -> None:
    """Crea el esquema UNA vez por fichero y proceso (ver schema_cache.py).

    Antes cada llamada abría una conexión y hacía una escritura con fsync
    (`INSERT INTO schema_meta ... ON CONFLICT DO UPDATE`) más once DDL: una sola
    lectura de posiciones costaba 2 conexiones y un commit de escritura.
    """
    if schema_cache.esta_listo(_ESQUEMA, path):
        return

    with _CERROJO_ESQUEMA:
        if schema_cache.esta_listo(_ESQUEMA, path):
            return
        _crear_esquema(path)
        schema_cache.marcar_listo(_ESQUEMA, path)


@contextmanager
def _conexion_suelta(path: str):
    """Conexión de usar y tirar, para lo que pasa una vez (crear el esquema)."""
    conn = connect_sqlite(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _crear_esquema(path: str) -> None:
    with _conexion_suelta(path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            INSERT INTO schema_meta (key, value)
            VALUES ('schema_version', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            WHERE schema_meta.value != excluded.value
            """,
            (str(SQLITE_SCHEMA_VERSION),),
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL,
                user TEXT NOT NULL DEFAULT '',
                team_id TEXT NOT NULL DEFAULT '',
                node_id TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                synced_at TEXT,
                error TEXT,
                client_event_id TEXT
            )
            """
        )

        # `client_event_id` (idempotencia de la cola offline) vivía sólo dentro
        # del JSON del payload, así que para saber si un evento ya estaba
        # guardado había que leer y decodificar TODOS los eventos del jugador:
        # 1,7 s por evento y creciendo (caza de fallos S2). Ahora es una
        # columna con índice; las bases viejas la ganan aquí y se rellena una vez.
        columnas = {fila[1] for fila in conn.execute("PRAGMA table_info(events)").fetchall()}
        if "client_event_id" not in columnas:
            conn.execute("ALTER TABLE events ADD COLUMN client_event_id TEXT")
            _rellenar_client_event_id(conn)

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_events_user_client_event
            ON events(user, client_event_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_events_status_created
            ON events(status, created_at)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_events_user_created
            ON events(user, created_at)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_events_type_created
            ON events(type, created_at)
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS game_state (
                user TEXT PRIMARY KEY,
                level INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS positions (
                user TEXT PRIMARY KEY,
                last_seen INTEGER NOT NULL DEFAULT 0,
                gps_status TEXT NOT NULL DEFAULT 'unknown',
                lat REAL,
                lon REAL,
                source TEXT NOT NULL DEFAULT 'player',
                debug_enabled INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                pos_at INTEGER NOT NULL DEFAULT 0
            )
            """
        )

        # Revisión 19/10: la hora de las COORDENADAS, aparte de `last_seen` (que
        # renueva cualquier latido, también sin GPS). Las bases viejas la ganan aquí.
        columnas_pos = {fila[1] for fila in conn.execute("PRAGMA table_info(positions)").fetchall()}
        if "pos_at" not in columnas_pos:
            conn.execute("ALTER TABLE positions ADD COLUMN pos_at INTEGER NOT NULL DEFAULT 0")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_documents (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stages (
                idx INTEGER PRIMARY KEY,
                stage_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        # Nodos superados por jugador, por ID de nodo (entrega 1 de «progreso por
        # id», ver runtime/superados.py). Aditiva: `game_state.level` sigue
        # mandando y nada la lee todavía. `retirado=1` archiva (no borra) un nodo
        # que ya no está en la misión; la fila con `user=''` es el registro
        # global de ids retirados, para reconocer un evento de la cola de un
        # nodo borrado aunque este jugador no tuviera fila.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS superados (
                user TEXT NOT NULL,
                node_id TEXT NOT NULL,
                ts INTEGER NOT NULL DEFAULT 0,
                origen TEXT NOT NULL DEFAULT 'avance',
                retirado INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (user, node_id)
            )
            """
        )


def _json_dumps(value: Any) -> str:
    return json.dumps(value if isinstance(value, dict) else {}, ensure_ascii=False)


def _json_loads(value: str) -> dict[str, Any]:
    try:
        decoded = json.loads(value or "{}")
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}


def _client_event_id_de(payload: Any) -> str | None:
    """El `client_event_id` que el móvil puso en el payload, o None."""
    if not isinstance(payload, dict):
        return None
    valor = payload.get("client_event_id")
    if isinstance(valor, str) and valor.strip():
        return valor.strip()[:160]
    return None


def _rellenar_client_event_id(conn: sqlite3.Connection) -> None:
    """Rellena la columna en las filas anteriores a que existiera (una sola vez)."""
    filas = conn.execute(
        "SELECT id, payload_json FROM events WHERE payload_json LIKE '%client_event_id%'"
    ).fetchall()
    cambios = []
    for fila in filas:
        cliente = _client_event_id_de(_json_loads(fila[1]))
        if cliente:
            cambios.append((cliente, fila[0]))
    if cambios:
        conn.executemany("UPDATE events SET client_event_id = ? WHERE id = ?", cambios)


def append_sqlite_event(path: str, event: dict[str, Any]) -> dict[str, Any]:
    init_sqlite_schema(path)
    normalized = normalize_event(event)

    with sqlite_connection(path) as conn:
        conn.execute(
            """
            INSERT INTO events (
                id,
                type,
                status,
                source,
                created_at,
                user,
                team_id,
                node_id,
                payload_json,
                synced_at,
                error,
                client_event_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized["id"],
                normalized["type"],
                normalized["status"],
                normalized["source"],
                normalized["created_at"],
                normalized.get("user", ""),
                normalized.get("team_id", ""),
                normalized.get("node_id", ""),
                _json_dumps(normalized.get("payload")),
                normalized.get("synced_at"),
                normalized.get("error"),
                _client_event_id_de(normalized.get("payload")),
            ),
        )

    return normalized


def find_sqlite_event_by_client_id(path: str, user: str, client_event_id: str) -> dict[str, Any] | None:
    """El evento más reciente de `user` con ese `client_event_id`, por índice.

    Sustituye a recorrer y decodificar todos los eventos del jugador para ver
    si uno ya estaba guardado (idempotencia de la cola offline).
    """
    cliente = str(client_event_id or "").strip()[:160]
    if not cliente:
        return None

    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        fila = conn.execute(
            """
            SELECT * FROM events
            WHERE user = ? AND client_event_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (str(user or "").strip(), cliente),
        ).fetchone()

    return _row_to_event(fila) if fila else None


def _row_to_event(row: sqlite3.Row) -> dict[str, Any]:
    event = {
        "id": row["id"],
        "type": row["type"],
        "status": row["status"],
        "source": row["source"],
        "created_at": row["created_at"],
        "user": row["user"],
        "team_id": row["team_id"],
        "node_id": row["node_id"],
        "payload": _json_loads(row["payload_json"]),
    }

    if row["synced_at"]:
        event["synced_at"] = row["synced_at"]

    if row["error"]:
        event["error"] = row["error"]

    return event


#: Tope de filas que devuelve un listado con `limit`.
MAX_LISTADO_EVENTOS = 20000


def list_sqlite_events(
    path: str,
    *,
    status: str | None = None,
    user: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
    exclude_types: tuple[str, ...] | list[str] | None = None,
) -> list[dict[str, Any]]:
    """Los eventos, de más viejo a más nuevo.

    Con `limit` devuelve los N MÁS RECIENTES (y luego los reordena de viejo a
    nuevo). Antes era `ORDER BY created_at ASC ... LIMIT n`: con miles de filas
    el panel de Actividad enseñaba el principio de la ruta y nunca lo último
    (caza de fallos A8/S12).
    """
    init_sqlite_schema(path)

    clauses = []
    params: list[Any] = []

    if status:
        clauses.append("status = ?")
        params.append(status)

    if user:
        clauses.append("user = ?")
        params.append(user)

    if event_type:
        clauses.append("type = ?")
        params.append(event_type)

    excluidos = [str(tipo) for tipo in (exclude_types or ()) if str(tipo)]
    if excluidos:
        clauses.append(f"type NOT IN ({', '.join('?' for _ in excluidos)})")
        params.extend(excluidos)

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""

    if limit is not None:
        sql = (
            f"SELECT * FROM (SELECT * FROM events{where} ORDER BY created_at DESC, id DESC LIMIT ?) "
            "ORDER BY created_at ASC, id ASC"
        )
        params.append(max(1, min(MAX_LISTADO_EVENTOS, int(limit))))
    else:
        sql = f"SELECT * FROM events{where} ORDER BY created_at ASC, id ASC"

    with sqlite_connection(path) as conn:
        rows = conn.execute(sql, params).fetchall()

    return [_row_to_event(row) for row in rows]


def count_sqlite_events(
    path: str,
    *,
    status: str | None = None,
    user: str | None = None,
    event_type: str | None = None,
) -> int:
    """Cuántos eventos hay con esos filtros (sin traerlos): para el «N pendientes» del panel."""
    init_sqlite_schema(path)

    clauses = []
    params: list[Any] = []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if user:
        clauses.append("user = ?")
        params.append(user)
    if event_type:
        clauses.append("type = ?")
        params.append(event_type)

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with sqlite_connection(path) as conn:
        fila = conn.execute(f"SELECT COUNT(*) AS n FROM events{where}", params).fetchone()
    return int(fila["n"] or 0)


def count_sqlite_personal_event_data(path: str) -> dict[str, int]:
    """Cuántos eventos guardan rastro de posiciones (lo que la purga borraría)."""
    init_sqlite_schema(path)

    condiciones = " OR ".join(f"payload_json LIKE '%\"{clave}\"%'" for clave in CLAVES_CON_GPS)
    with sqlite_connection(path) as conn:
        pistas = conn.execute("SELECT COUNT(*) AS n FROM events WHERE type = 'position_track'").fetchone()["n"]
        filas = conn.execute(
            f"SELECT payload_json FROM events WHERE type != 'position_track' AND ({condiciones})"
        ).fetchall()

    con_coordenadas = sum(
        1 for fila in filas
        if any(clave in _json_loads(fila["payload_json"]) for clave in CLAVES_CON_GPS)
    )
    return {"eventos_con_posiciones": int(pistas), "eventos_con_coordenadas": int(con_coordenadas)}


def purge_sqlite_personal_event_data(path: str) -> dict[str, int]:
    """Quita de los eventos lo que sea rastro de posiciones de personas.

    - Los `position_track` (el rastro que sube el móvil tras un tramo sin
      cobertura) se borran enteros: no son más que muestras de GPS.
    - En el resto se conserva el evento -el historial de avances y la
      idempotencia por `client_event_id` no se tocan- pero se le quitan las
      claves con coordenadas (`samples`, `evidence`, `lat`, `lon`, `accuracy`).

    Devuelve cuántos se borraron y cuántos se limpiaron.
    """
    init_sqlite_schema(path)
    borrados = 0
    limpiados = 0

    with sqlite_connection(path) as conn:
        borrados = conn.execute("DELETE FROM events WHERE type = 'position_track'").rowcount or 0

        condiciones = " OR ".join(f"payload_json LIKE '%\"{clave}\"%'" for clave in CLAVES_CON_GPS)
        filas = conn.execute(f"SELECT id, payload_json FROM events WHERE {condiciones}").fetchall()

        cambios = []
        for fila in filas:
            payload = _json_loads(fila["payload_json"])
            if not any(clave in payload for clave in CLAVES_CON_GPS):
                continue
            for clave in CLAVES_CON_GPS:
                payload.pop(clave, None)
            cambios.append((_json_dumps(payload), fila["id"]))

        if cambios:
            conn.executemany("UPDATE events SET payload_json = ? WHERE id = ?", cambios)
            limpiados = len(cambios)

    return {"eventos_borrados": int(borrados), "eventos_limpiados": int(limpiados)}


def compact_sqlite(path: str) -> bool:
    """Devuelve al disco lo borrado: checkpoint del WAL + VACUUM.

    Borrar filas no borra su contenido del fichero: las páginas libres y el WAL
    conservan los bytes viejos, o sea, las coordenadas que la purga acaba de
    prometer haber quitado. Devuelve False si no se pudo (p. ej. otra conexión
    con una transacción abierta); la purga sigue siendo válida a nivel de filas.
    """
    if not os.path.exists(path):
        return False

    try:
        conn = sqlite3.connect(path, timeout=10.0, isolation_level=None)
        try:
            conn.execute("PRAGMA busy_timeout = 5000")
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.execute("VACUUM")
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            conn.close()
        return True
    except sqlite3.Error:
        return False


MARCA_SUPERADOS = "superados_migrado"


def superados_activos(conn: sqlite3.Connection) -> bool:
    """¿Ya se migró `superados`? Hasta entonces no se escribe (modo antiguo)."""
    fila = conn.execute("SELECT 1 FROM schema_meta WHERE key = ?", (MARCA_SUPERADOS,)).fetchone()
    return fila is not None


def leer_superados(conn: sqlite3.Connection, user: str) -> dict[str, dict[str, Any]]:
    filas = conn.execute(
        "SELECT node_id, ts, origen, retirado FROM superados WHERE user = ?", (user,)
    ).fetchall()
    return {
        fila["node_id"]: {"ts": int(fila["ts"] or 0), "origen": fila["origen"], "retirado": int(fila["retirado"] or 0)}
        for fila in filas
    }


def escribir_superados(conn: sqlite3.Connection, user: str, altas=None, bajas=None, retirar=None) -> None:
    """Altas ({id: (ts, origen)}), bajas (se borra la fila) y retirados (se archivan)."""
    for id_nodo, (ts, origen) in (altas or {}).items():
        conn.execute(
            """
            INSERT INTO superados (user, node_id, ts, origen, retirado)
            VALUES (?, ?, ?, ?, 0)
            ON CONFLICT(user, node_id) DO UPDATE SET
                ts = excluded.ts, origen = excluded.origen, retirado = 0
            """,
            (user, str(id_nodo), int(ts or 0), origen),
        )
    for id_nodo in bajas or []:
        conn.execute("DELETE FROM superados WHERE user = ? AND node_id = ?", (user, str(id_nodo)))
    for id_nodo in retirar or []:
        conn.execute(
            "UPDATE superados SET retirado = 1 WHERE user = ? AND node_id = ?", (user, str(id_nodo))
        )


def _ahora_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def avisar_si_diverge(user: str, ids, filas, nivel: int, donde: str) -> bool:
    """WARN si el puntero derivado de `superados` no coincide con el nivel guardado."""
    from backend.app.runtime import superados as _superados

    esperado = min(max(0, int(nivel or 0)), len(ids))
    derivado = _superados.nivel_derivado(ids, filas)
    if derivado != esperado:
        print(
            f"[WARN] superados diverge del nivel ({donde}): jugador={user!r} nivel={esperado} derivado={derivado}",
            flush=True,
        )
        return True
    return False


def _doble_escritura_de_avance(conn, user, ids, nivel_antes, nivel_nuevo, desde_admin, ts_ms) -> None:
    from backend.app.runtime import superados as _superados

    if not superados_activos(conn):
        return
    ids = [str(i) for i in ids]
    filas = leer_superados(conn, user)
    avisar_si_diverge(user, ids, filas, nivel_antes, "antes del avance")
    altas, bajas = _superados.aplicar_nivel_numerico(ids, filas, nivel_nuevo, desde_admin, ts=ts_ms or _ahora_ms())
    escribir_superados(conn, user, altas, bajas)
    despues = {k: v for k, v in filas.items() if k not in bajas}
    despues.update({k: {"retirado": 0} for k in altas})
    avisar_si_diverge(user, ids, despues, nivel_nuevo, "después del avance")


def set_sqlite_player_level(
    path: str, user: str, level: int, ids=None, desde_admin: bool = False, ts_ms: int | None = None
) -> None:
    """Guarda el nivel. Con `ids` (los de la misión) actualiza también `superados`
    EN LA MISMA transacción: o quedan las dos cosas o ninguna."""
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    next_level = max(0, int(level or 0))
    now = utc_now_iso()

    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        antes = conn.execute("SELECT level FROM game_state WHERE user = ?", (user_key,)).fetchone()
        conn.execute(
            """
            INSERT INTO game_state (user, level, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user) DO UPDATE SET
                level = excluded.level,
                updated_at = excluded.updated_at
            """,
            (user_key, next_level, now),
        )
        if ids is not None:
            _doble_escritura_de_avance(
                conn, user_key, ids, int(antes["level"] or 0) if antes else 0, next_level, desde_admin, ts_ms
            )


def load_sqlite_game_state(path: str) -> dict[str, int]:
    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        rows = conn.execute("SELECT user, level FROM game_state ORDER BY user ASC").fetchall()

    return {row["user"]: int(row["level"] or 0) for row in rows}


def upsert_sqlite_position(path: str, user: str, position: dict[str, Any]) -> None:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    normalized = normalize_live_position(position)
    now = utc_now_iso()

    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        conn.execute(
            """
            INSERT INTO positions (
                user,
                last_seen,
                gps_status,
                lat,
                lon,
                source,
                debug_enabled,
                updated_at,
                pos_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user) DO UPDATE SET
                pos_at = excluded.pos_at,
                last_seen = excluded.last_seen,
                gps_status = excluded.gps_status,
                lat = excluded.lat,
                lon = excluded.lon,
                source = excluded.source,
                debug_enabled = excluded.debug_enabled,
                updated_at = excluded.updated_at
            """,
            (
                user_key,
                normalized["last_seen"],
                normalized["gps_status"],
                normalized["lat"],
                normalized["lon"],
                normalized["source"],
                1 if normalized["debug_enabled"] else 0,
                now,
                normalized.get("pos_at", 0),
            ),
        )



def get_sqlite_position(path: str, user: str) -> dict[str, Any]:
    user_key = str(user or "").strip()
    if not user_key:
        return {}

    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        row = conn.execute(
            """
            SELECT user, last_seen, gps_status, lat, lon, source, debug_enabled, pos_at
            FROM positions
            WHERE user = ?
            """,
            (user_key,),
        ).fetchone()

    if not row:
        return {}

    return {
        "last_seen": int(row["last_seen"] or 0),
        "gps_status": row["gps_status"],
        "lat": row["lat"],
        "lon": row["lon"],
        "source": row["source"],
        "debug_enabled": bool(row["debug_enabled"]),
        **({"pos_at": int(row["pos_at"])} if row["pos_at"] else {}),
    }

def load_sqlite_positions(path: str) -> dict[str, dict[str, Any]]:
    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        rows = conn.execute(
            """
            SELECT user, last_seen, gps_status, lat, lon, source, debug_enabled, pos_at
            FROM positions
            ORDER BY user ASC
            """
        ).fetchall()

    return {
        row["user"]: {
            "last_seen": int(row["last_seen"] or 0),
            "gps_status": row["gps_status"],
            "lat": row["lat"],
            "lon": row["lon"],
            "source": row["source"],
            "debug_enabled": bool(row["debug_enabled"]),
            **({"pos_at": int(row["pos_at"])} if row["pos_at"] else {}),
        }
        for row in rows
    }

def mark_sqlite_event_status(
    path: str,
    event_id: str,
    status: str,
    *,
    error: str | None = None,
) -> dict[str, Any] | None:
    init_sqlite_schema(path)

    event_key = str(event_id or "").strip()
    if not event_key:
        return None

    next_status = str(status or "pending").strip() or "pending"
    synced_at = utc_now_iso() if next_status == "synced" else None

    with sqlite_connection(path) as conn:
        existing = conn.execute(
            "SELECT * FROM events WHERE id = ?",
            (event_key,),
        ).fetchone()

        if not existing:
            return None

        conn.execute(
            """
            UPDATE events
            SET status = ?,
                synced_at = COALESCE(?, synced_at),
                error = COALESCE(?, error)
            WHERE id = ?
            """,
            (next_status, synced_at, error, event_key),
        )

        updated = conn.execute(
            "SELECT * FROM events WHERE id = ?",
            (event_key,),
        ).fetchone()

    return _row_to_event(updated)

def save_sqlite_game_state(path: str, state: dict[str, int], mision=None) -> dict[str, int]:
    """Guarda todos los niveles. Con `mision` = (ids_viejos, ids_nuevos, niveles_antes)
    reindexa también `superados` en la misma transacción (ver `reindexar_superados`)."""
    normalized: dict[str, int] = {}

    for user, level in (state or {}).items():
        user_key = str(user or "").strip()
        if not user_key:
            continue
        try:
            normalized[user_key] = max(0, int(level or 0))
        except (TypeError, ValueError):
            normalized[user_key] = 0

    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        conn.execute("DELETE FROM game_state")
        for user, level in normalized.items():
            conn.execute(
                """
                INSERT INTO game_state (user, level, updated_at)
                VALUES (?, ?, ?)
                """,
                (user, level, utc_now_iso()),
            )
        if mision is not None:
            reindexar_superados(conn, normalized, *mision)

    return normalized


def get_sqlite_player_level(path: str, user: str, default: int = 0) -> int:
    user_key = str(user or "").strip()
    if not user_key:
        return int(default or 0)

    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        row = conn.execute(
            "SELECT level FROM game_state WHERE user = ?",
            (user_key,),
        ).fetchone()

    if not row:
        return int(default or 0)

    return int(row["level"] or 0)


def reset_sqlite_player_level(path: str, user: str) -> dict[str, int]:
    set_sqlite_player_level(path, user, 0)
    return load_sqlite_game_state(path)


def advance_sqlite_player_level(path: str, user: str, step: int = 1) -> dict[str, int]:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    current = get_sqlite_player_level(path, user_key, default=0)
    try:
        delta = int(step or 1)
    except (TypeError, ValueError):
        delta = 1

    set_sqlite_player_level(path, user_key, max(0, current + delta))
    return load_sqlite_game_state(path)

def save_sqlite_positions_state(path: str, state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    normalized: dict[str, dict[str, Any]] = {}
    for user, position in (state or {}).items():
        user_key = str(user or "").strip()
        if not user_key:
            continue
        normalized[user_key] = normalize_live_position(position)

    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        conn.execute("DELETE FROM positions")
        for user, position in normalized.items():
            conn.execute(
                "INSERT INTO positions (user, last_seen, gps_status, lat, lon, source, debug_enabled, updated_at, pos_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    user,
                    position["last_seen"],
                    position["gps_status"],
                    position["lat"],
                    position["lon"],
                    position["source"],
                    1 if position["debug_enabled"] else 0,
                    utc_now_iso(),
                    position.get("pos_at", 0),
                ),
            )
    return normalized


def remove_sqlite_position(path: str, user: str) -> dict[str, dict[str, Any]]:
    user_key = str(user or "").strip()
    if not user_key:
        raise ValueError("user is required")

    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        conn.execute("DELETE FROM positions WHERE user = ?", (user_key,))
    return load_sqlite_positions(path)

def _json_dumps_any(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_loads_any(value: str, default: Any) -> Any:
    try:
        return json.loads(value or "null")
    except Exception:
        return default


#: Copia en memoria de cada documento ya leído: {(base, clave): (versión, updated_at, valor en marshal)}.
#:
#: Auditoría 23/10: la configuración (con las fotos de los jugadores, cientos de
#: KB) se leía y decodificaba unas diez veces por latido, y la clave de misión
#: cuatro veces por cada petición /api/*. Ahora se pregunta sólo por la fecha
#: de la fila (`updated_at`, una lectura de índice) y si no cambió se devuelve
#: la copia. La fecha la pone `save_sqlite_document` en cada cambio, así que
#: también se nota un cambio hecho por OTRO proceso (un script, la réplica). La
#: versión, que sube en cada guardado de este proceso, cubre dos guardados en
#: el mismo microsegundo.
#:
#: Se guarda en `marshal`, no el objeto: quien llama puede modificar lo que
#: recibe (`load_config` lo hace) y así cada llamada devuelve un objeto nuevo,
#: como antes. Decodificar `marshal` cuesta ~25 veces menos que `json.loads`.
_DOCUMENTOS: dict[tuple[str, str], tuple[int, str, bytes | None]] = {}
_VERSION_DOCUMENTOS = 0
#: Sólo para el banco de medida (comparar con y sin copia).
USAR_COPIA_DE_DOCUMENTOS = True


def load_sqlite_document(path: str, key: str, default: Any) -> Any:
    init_sqlite_schema(path)
    document_key = str(key or "").strip()
    if not document_key:
        return default

    clave = (os.path.abspath(path), document_key)
    version = _VERSION_DOCUMENTOS
    guardada = _DOCUMENTOS.get(clave) if USAR_COPIA_DE_DOCUMENTOS else None

    with sqlite_connection(path) as conn:
        if guardada is not None and guardada[0] == version:
            fila = conn.execute(
                "SELECT updated_at FROM app_documents WHERE key = ?",
                (document_key,),
            ).fetchone()
            if fila is not None and fila["updated_at"] == guardada[1]:
                return default if guardada[2] is None else marshal.loads(guardada[2])

        # Valor y fecha en la MISMA consulta: la copia nunca junta un valor con
        # la fecha de otro.
        row = conn.execute(
            "SELECT value_json, updated_at FROM app_documents WHERE key = ?",
            (document_key,),
        ).fetchone()

    if not row:
        _DOCUMENTOS.pop(clave, None)
        return default

    valor = _json_loads_any(row["value_json"], _SIN_VALOR)
    if USAR_COPIA_DE_DOCUMENTOS:
        _DOCUMENTOS[clave] = (version, row["updated_at"], None if valor is _SIN_VALOR else marshal.dumps(valor))
    return default if valor is _SIN_VALOR else valor


_SIN_VALOR = object()


def save_sqlite_document(path: str, key: str, value: Any) -> None:
    global _VERSION_DOCUMENTOS
    init_sqlite_schema(path)
    document_key = str(key or "").strip()
    if not document_key:
        raise ValueError("document key is required")

    try:
        with sqlite_connection(path) as conn:
            # Si el documento no cambió no se toca la fila: sin cambio no hay
            # páginas sucias, y el commit no cuesta un fsync.
            conn.execute(
                """
                INSERT INTO app_documents (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                WHERE app_documents.value_json != excluded.value_json
                """,
                (document_key, _json_dumps_any(value), utc_now_iso()),
            )
    finally:
        # DESPUÉS del commit (o del fallo): una lectura que empezó antes con la
        # versión vieja no puede dejar guardado el valor de antes como bueno.
        _VERSION_DOCUMENTOS += 1


def load_sqlite_stages(path: str) -> list[dict[str, Any]]:
    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        rows = conn.execute(
            "SELECT stage_json FROM stages ORDER BY idx ASC"
        ).fetchall()

    stages: list[dict[str, Any]] = []
    for row in rows:
        decoded = _json_loads_any(row["stage_json"], {})
        if isinstance(decoded, dict):
            stages.append(decoded)

    return stages


def sqlite_stages_signature(path: str) -> tuple[int, str]:
    """(cuántos nodos, fecha del último guardado): cambia con CUALQUIER guardado.

    `save_sqlite_stages` reescribe todas las filas con la fecha del momento, así
    que basta para saber si la misión cambió sin leerla, también cuando el fichero
    llega por fuera (la réplica recibe los datos por rsync).
    """
    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        fila = conn.execute(
            "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS ultimo FROM stages"
        ).fetchone()

    return int(fila["n"] or 0), str(fila["ultimo"] or "")


def count_sqlite_stages(path: str) -> int:
    """Cuántos nodos hay, sin decodificar ninguno (una fila por nodo)."""
    init_sqlite_schema(path)

    with sqlite_connection(path) as conn:
        fila = conn.execute("SELECT COUNT(*) AS n FROM stages").fetchone()

    return int(fila["n"] or 0)


def save_sqlite_stages(path: str, stages: list[dict[str, Any]]) -> None:
    init_sqlite_schema(path)
    safe_stages = stages if isinstance(stages, list) else []

    with sqlite_connection(path) as conn:
        conn.execute("DELETE FROM stages")
        for index, stage in enumerate(safe_stages):
            if not isinstance(stage, dict):
                continue
            conn.execute(
                """
                INSERT INTO stages (idx, stage_json, updated_at)
                VALUES (?, ?, ?)
                """,
                (index, _json_dumps_any(stage), utc_now_iso()),
            )



def reindexar_superados(conn, niveles_nuevos, ids_viejos, ids_nuevos, niveles_antes) -> None:
    """Al guardar la misión: archiva los ids que salen y regala los que entran.

    `niveles_nuevos` son los que acaba de calcular `reindex_player_levels` (los que
    mandan); aquí sólo se recoloca `superados` para que su puntero coincida con
    ellos. Si no coincide por sí solo se avisa (WARN) y se fuerza al nivel.
    """
    from backend.app.runtime import superados as _superados

    if not superados_activos(conn):
        return
    ids_viejos = [str(i) for i in ids_viejos]
    ids_nuevos = [str(i) for i in ids_nuevos]
    ahora = _ahora_ms()
    salen = [i for i in ids_viejos if i not in set(ids_nuevos)]
    # Registro global de retirados (user=''): ver el esquema.
    for id_nodo in salen:
        conn.execute(
            "INSERT OR REPLACE INTO superados (user, node_id, ts, origen, retirado) VALUES ('', ?, ?, 'retirado', 1)",
            (id_nodo, ahora),
        )
    for id_nodo in ids_nuevos:
        conn.execute("DELETE FROM superados WHERE user = '' AND node_id = ?", (id_nodo,))

    for user in set(niveles_nuevos) | set(niveles_antes):
        altas, bajas, retirar, diverge = _superados.reindexar_al_guardar(
            ids_viejos,
            ids_nuevos,
            leer_superados(conn, user),
            terminado=int(niveles_antes.get(user, 0) or 0) >= len(ids_viejos),
            nivel_nuevo=int(niveles_nuevos.get(user, 0) or 0),
            ts=ahora,
        )
        if diverge:
            print(
                f"[WARN] superados diverge del nivel al guardar la misión: jugador={user!r}; se fuerza al nivel",
                flush=True,
            )
        escribir_superados(conn, user, altas, bajas, retirar)


def id_retirado(path: str, node_id: str) -> bool:
    """¿Es `node_id` un nodo que estuvo en la misión y ya no está? (registro global)"""
    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        if not superados_activos(conn):
            return False
        fila = conn.execute(
            "SELECT 1 FROM superados WHERE node_id = ? AND retirado = 1 LIMIT 1", (str(node_id),)
        ).fetchone()
    return fila is not None


def superados_del_jugador(path: str, user: str) -> dict[str, dict[str, Any]] | None:
    """Filas de `superados` del jugador, o None si la migración aún no se hizo."""
    init_sqlite_schema(path)
    with sqlite_connection(path) as conn:
        if not superados_activos(conn):
            return None
        return leer_superados(conn, str(user or "").strip())

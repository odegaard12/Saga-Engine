"""Runtime document and stage storage adapter.

SQLite is the production runtime source of truth.
JSON is used only when SAGA_STORAGE_BACKEND=json is explicitly selected.
"""

from __future__ import annotations

import json
import os
from typing import Any

from backend.app.storage.json_store import load_json, save_json
from backend.app.storage.sqlite_store import (
    count_sqlite_stages,
    load_sqlite_document,
    sqlite_stages_signature,
    load_sqlite_stages,
    resolve_sqlite_path,
    save_sqlite_document,
    save_sqlite_stages,
)


VALID_RUNTIME_BACKENDS = {"json", "sqlite"}


def resolve_runtime_backend() -> str:
    backend = str(os.getenv("SAGA_STORAGE_BACKEND") or "sqlite").strip().lower()
    return backend if backend in VALID_RUNTIME_BACKENDS else "sqlite"


def resolve_runtime_db_path(json_path: str) -> str:
    if resolve_runtime_backend() != "sqlite":
        return json_path

    explicit = str(os.getenv("SAGA_SQLITE_DB") or "").strip()
    if explicit:
        return explicit

    data_dir = os.path.dirname(os.path.abspath(json_path)) or "."
    return resolve_sqlite_path(data_dir)


def _legacy_file_exists(path: str) -> bool:
    try:
        return bool(path) and os.path.exists(path) and os.path.isfile(path)
    except OSError:
        return False


def load_document(path: str, key: str, default: Any) -> Any:
    if resolve_runtime_backend() == "json":
        return load_json(path, default)

    return load_sqlite_document(resolve_runtime_db_path(path), key, default)


def save_document(path: str, key: str, value: Any) -> None:
    if resolve_runtime_backend() == "sqlite":
        save_sqlite_document(resolve_runtime_db_path(path), key, value)

    save_json(path, value)


def load_stages(path: str) -> list[dict[str, Any]]:
    if resolve_runtime_backend() == "json":
        raw = load_json(path, [])
        return raw if isinstance(raw, list) else []

    db_path = resolve_runtime_db_path(path)
    sqlite_stages = load_sqlite_stages(db_path)
    if sqlite_stages:
        # Lo normal: los nodos ya viven en SQLite. Antes se leía y decodificaba
        # además `stages.json` (200 KB con las fotos) en CADA llamada sólo para
        # comprobar si había que migrarlo, y esta función se llama en cada
        # latido (caza de fallos S1).
        return sqlite_stages

    raw = load_json(path, [])
    if isinstance(raw, list) and raw:
        save_sqlite_stages(db_path, raw)
        return raw

    return sqlite_stages


def count_stages(path: str) -> int:
    """Cuántos nodos tiene la misión, sin leer ni decodificar sus fotos.

    Lo piden los latidos (¿ha terminado ya la ruta?) cada pocos segundos de cada
    móvil, y para eso se cargaba y normalizaba la misión entera (caza de fallos S1).
    """
    if resolve_runtime_backend() == "sqlite":
        cuantos = count_sqlite_stages(resolve_runtime_db_path(path))
        if cuantos:
            return cuantos

    return len(load_stages(path))


def stages_signature(path: str):
    """Algo que cambia cada vez que cambian los nodos guardados, sin leerlos.

    Con SQLite, (cuántos, fecha del último guardado): también detecta un fichero que
    llega por rsync. Con el backend JSON, el contador de guardados de este proceso y
    la fecha del fichero. Sirve de clave de las copias en memoria derivadas de la
    misión (huella para el móvil, zona de las teselas).
    """
    if resolve_runtime_backend() == "sqlite":
        return ("sqlite", *sqlite_stages_signature(resolve_runtime_db_path(path)), _VERSION_DE_NODOS)

    try:
        fecha = os.path.getmtime(path)
    except OSError:
        fecha = 0.0
    return ("json", _VERSION_DE_NODOS, fecha)


#: Se incrementa en cada guardado de nodos: sirve para invalidar cachés
#: derivadas de la misión sin tener que releerla.
_VERSION_DE_NODOS = 0


def stages_version() -> int:
    return _VERSION_DE_NODOS


def save_stages(path: str, stages: list[dict[str, Any]]) -> None:
    global _VERSION_DE_NODOS
    safe_stages = stages if isinstance(stages, list) else []

    if resolve_runtime_backend() == "sqlite":
        save_sqlite_stages(resolve_runtime_db_path(path), safe_stages)

    save_json(path, safe_stages)
    _VERSION_DE_NODOS += 1

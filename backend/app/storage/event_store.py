"""Event storage adapter.

JSON remains the default event backend.

When SAGA_STORAGE_BACKEND=sqlite, event writes/reads use the SQLite
foundation. This lets SAGA migrate the high-churn event log first without
changing route code or frontend behavior.
"""

from __future__ import annotations

import os
from typing import Any

from backend.app.storage.event_log import (
    append_event as append_json_event,
    list_events as list_json_events,
    list_pending_events as list_json_pending_events,
    mark_event_status as mark_json_event_status,
)
from backend.app.storage.json_store import update_json
from backend.app.storage.sqlite_store import (
    CLAVES_CON_GPS,
    append_sqlite_event,
    count_sqlite_events,
    count_sqlite_personal_event_data,
    find_sqlite_event_by_client_id,
    list_sqlite_events,
    mark_sqlite_event_status,
    purge_sqlite_personal_event_data,
    resolve_sqlite_path,
)


VALID_EVENT_BACKENDS = {"json", "sqlite"}


def resolve_event_storage_backend() -> str:
    backend = str(os.getenv("SAGA_STORAGE_BACKEND") or "sqlite").strip().lower()
    return backend if backend in VALID_EVENT_BACKENDS else "sqlite"


def resolve_event_db_path(json_event_path: str) -> str:
    backend = resolve_event_storage_backend()

    if backend != "sqlite":
        return json_event_path

    explicit = str(os.getenv("SAGA_SQLITE_DB") or "").strip()
    if explicit:
        return explicit

    data_dir = os.path.dirname(os.path.abspath(json_event_path)) or "."
    return resolve_sqlite_path(data_dir)


def append_event(path: str, event: dict[str, Any]) -> dict[str, Any]:
    if resolve_event_storage_backend() == "sqlite":
        return append_sqlite_event(resolve_event_db_path(path), event)
    return append_json_event(path, event)


def list_events(
    path: str,
    *,
    status: str | None = None,
    user: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
    exclude_types: tuple[str, ...] | list[str] | None = None,
) -> list[dict[str, Any]]:
    if resolve_event_storage_backend() == "sqlite":
        return list_sqlite_events(
            resolve_event_db_path(path),
            status=status,
            user=user,
            event_type=event_type,
            limit=limit,
            exclude_types=exclude_types,
        )

    eventos = list_json_events(
        path,
        status=status,
        user=user,
        event_type=event_type,
        limit=None if exclude_types else limit,
    )
    if exclude_types:
        excluidos = {str(tipo) for tipo in exclude_types}
        eventos = [evento for evento in eventos if evento.get("type") not in excluidos]
        if limit is not None:
            eventos = eventos[-max(0, int(limit)):]
    return eventos


def count_events(
    path: str,
    *,
    status: str | None = None,
    user: str | None = None,
    event_type: str | None = None,
) -> int:
    """Cuántos eventos hay con esos filtros, sin traerlos."""
    if resolve_event_storage_backend() == "sqlite":
        return count_sqlite_events(
            resolve_event_db_path(path), status=status, user=user, event_type=event_type
        )

    return len(list_json_events(path, status=status, user=user, event_type=event_type))


def find_event_by_client_id(path: str, user: str, client_event_id: str) -> dict[str, Any] | None:
    """El evento de `user` con ese `client_event_id`, o None.

    Con SQLite es una consulta por índice; con el backend JSON (sólo pruebas y
    despliegues sin SQLite) se recorre la lista como antes.
    """
    cliente = str(client_event_id or "").strip()
    if not cliente:
        return None

    if resolve_event_storage_backend() == "sqlite":
        return find_sqlite_event_by_client_id(resolve_event_db_path(path), user, cliente)

    for evento in reversed(list_json_events(path, user=user)):
        payload = evento.get("payload") if isinstance(evento.get("payload"), dict) else {}
        existente = str(evento.get("client_event_id") or payload.get("client_event_id") or "").strip()
        if existente == cliente:
            return evento
    return None


def count_personal_event_data(path: str) -> dict[str, int]:
    """Cuántos eventos guardan rastro de posiciones de personas."""
    if resolve_event_storage_backend() == "sqlite":
        return count_sqlite_personal_event_data(resolve_event_db_path(path))

    pistas = 0
    con_coordenadas = 0
    for evento in list_json_events(path):
        if evento.get("type") == "position_track":
            pistas += 1
            continue
        payload = evento.get("payload")
        if isinstance(payload, dict) and any(clave in payload for clave in CLAVES_CON_GPS):
            con_coordenadas += 1
    return {"eventos_con_posiciones": pistas, "eventos_con_coordenadas": con_coordenadas}


def purge_personal_event_data(path: str) -> dict[str, int]:
    """Borra el rastro de posiciones que guardan los eventos (ver la purga)."""
    if resolve_event_storage_backend() == "sqlite":
        return purge_sqlite_personal_event_data(resolve_event_db_path(path))

    contadores = {"eventos_borrados": 0, "eventos_limpiados": 0}

    def _limpiar(actual):
        if not isinstance(actual, list):
            return []
        salida = []
        for evento in actual:
            if not isinstance(evento, dict):
                continue
            if evento.get("type") == "position_track":
                contadores["eventos_borrados"] += 1
                continue
            payload = evento.get("payload")
            if isinstance(payload, dict) and any(clave in payload for clave in CLAVES_CON_GPS):
                evento = {**evento, "payload": {k: v for k, v in payload.items() if k not in CLAVES_CON_GPS}}
                contadores["eventos_limpiados"] += 1
            salida.append(evento)
        return salida

    update_json(path, [], _limpiar)
    return contadores


def list_pending_events(path: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    if resolve_event_storage_backend() == "sqlite":
        return list_sqlite_events(
            resolve_event_db_path(path),
            status="pending",
            limit=limit,
        )

    return list_json_pending_events(path, limit=limit)


def mark_event_status(
    path: str,
    event_id: str,
    status: str,
    *,
    error: str | None = None,
) -> dict[str, Any] | None:
    if resolve_event_storage_backend() == "sqlite":
        return mark_sqlite_event_status(
            resolve_event_db_path(path),
            event_id,
            status,
            error=error,
        )

    return mark_json_event_status(path, event_id, status, error=error)

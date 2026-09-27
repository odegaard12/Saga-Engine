"""Registro de partida: qué hizo cada jugador, para revisar después.

Pensado para que el organizador pueda mirar, al terminar la ruta, la
línea de tiempo de un jugador concreto y decidir si algo no encaja
-trampas, pero también incidencias normales-. No es el motor antitrampas
-eso sigue en anti_cheat.py y decide "sospechoso o no"-, es la bitácora
completa: heartbeats, nodos, minijuegos, QR, mochila, sincronización
offline y las sospechas que el motor antitrampas ya anota.

Sólo escribe mientras la misión está PROGRAMADA (tiene
`mission_launch_at` en la configuración) y ACTIVA (esa hora ya ha
llegado: ver runtime/mission_schedule.py). Antes de la hora de salida, o
sin fecha programada, no se escribe nada -no hay partida que auditar
todavía-.

Ligero a propósito: cada escritura es un INSERT suelto en SQLite (ver
storage/match_log_store.py), sin bloqueos de fichero completo como el
JSON de events.json, y las posiciones de heartbeat se limitan a como
mucho una por jugador cada 30 segundos -igual que el latido en sí no deja
pasar más de una petición por ese intervalo, pero aquí es a propósito una
regla propia: si el intervalo del heartbeat cambiara, el Registro de
partida no debe ponerse a escribir más rápido sin que alguien lo decida-.
"""

from __future__ import annotations

import csv
import io
import time
from typing import Any

from backend.app.runtime import mission_schedule as _mission_schedule
from backend.app.storage import match_log_store as _store


# Una entrada de posición por jugador como mucho cada 30 segundos.
POSITION_SAMPLE_MIN_INTERVAL_S = 30.0

# user -> último "time.time()" en que se guardó una muestra de posición.
_LAST_POSITION_SAMPLE_AT: dict[str, float] = {}

# user -> última vez que se anotó "session_open" (para no repetirlo en cada
# carga de /api/game/{user}, que un cliente pide cada pocos segundos).
_LAST_SESSION_OPEN_AT: dict[str, float] = {}
SESSION_OPEN_MIN_INTERVAL_S = 300.0


def is_active(cfg: dict[str, Any] | None = None, *, mission_locked: bool | None = None) -> bool:
    """¿Hay que anotar ahora mismo?

    Programada: `mission_launch_at` tiene un valor que se entiende como
    fecha. Activa: esa fecha ya ha llegado (no está bloqueada).
    """
    cfg = cfg or {}
    launch_at = cfg.get("mission_launch_at")
    if not str(launch_at or "").strip():
        return False

    if mission_locked is None:
        mission_locked = _mission_schedule.mission_is_locked(launch_at)

    return not mission_locked


def record(
    db_path: str,
    *,
    active: bool,
    event_type: str,
    user: str,
    display_name: str = "",
    payload: dict[str, Any] | None = None,
    severity: str | None = None,
    client_created_at: str | None = None,
) -> dict[str, Any] | None:
    """Anota una entrada si `active` es verdad. Si no, no hace nada."""
    if not active:
        return None

    user_key = str(user or "").strip()
    if not user_key:
        return None

    return _store.append_entry(
        db_path,
        event_type=event_type,
        user=user_key,
        display_name=display_name or user_key,
        payload=payload,
        severity=severity,
        client_created_at=client_created_at,
    )


def record_position_sample(
    db_path: str,
    *,
    active: bool,
    user: str,
    display_name: str = "",
    lat: float | None,
    lon: float | None,
    accuracy: float | None,
    source: str,
    now: float | None = None,
) -> dict[str, Any] | None:
    """Muestra de posición de un heartbeat, con tope de una cada 30 s por jugador."""
    if not active:
        return None

    user_key = str(user or "").strip()
    if not user_key:
        return None

    instante = now if now is not None else time.time()
    anterior = _LAST_POSITION_SAMPLE_AT.get(user_key)
    if anterior is not None and (instante - anterior) < POSITION_SAMPLE_MIN_INTERVAL_S:
        return None

    _LAST_POSITION_SAMPLE_AT[user_key] = instante

    return record(
        db_path,
        active=active,
        event_type="position_sample",
        user=user_key,
        display_name=display_name,
        payload={
            "lat": lat,
            "lon": lon,
            "accuracy": accuracy,
            "source": source or "real",
        },
    )


def record_session_open(
    db_path: str,
    *,
    active: bool,
    user: str,
    display_name: str = "",
    now: float | None = None,
) -> dict[str, Any] | None:
    """Apertura de sesión de un jugador, como mucho una vez cada 5 minutos."""
    if not active:
        return None

    user_key = str(user or "").strip()
    if not user_key:
        return None

    instante = now if now is not None else time.time()
    anterior = _LAST_SESSION_OPEN_AT.get(user_key)
    if anterior is not None and (instante - anterior) < SESSION_OPEN_MIN_INTERVAL_S:
        return None

    _LAST_SESSION_OPEN_AT[user_key] = instante

    return record(
        db_path,
        active=active,
        event_type="session_open",
        user=user_key,
        display_name=display_name,
    )


def reset_rate_state() -> None:
    """Sólo para tests: limpia los relojes de la muestra de posición/sesión."""
    _LAST_POSITION_SAMPLE_AT.clear()
    _LAST_SESSION_OPEN_AT.clear()


def list_timeline(
    db_path: str,
    *,
    user: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    return _store.list_entries(
        db_path,
        user=user,
        date_from=date_from,
        date_to=date_to,
        event_type=event_type,
        limit=limit,
    )


def count_entries(db_path: str, *, user: str | None = None) -> int:
    return _store.count_entries(db_path, user=user)


def purge(db_path: str, *, user: str | None = None) -> int:
    return _store.delete_all(db_path, user=user)


_CSV_COLUMNS = [
    "created_at",
    "client_created_at",
    "user",
    "display_name",
    "type",
    "severity",
    "payload",
]


#: Excel/Sheets/LibreOffice tratan una celda que EMPIEZA por cualquiera de
#: estos caracteres como una fórmula, no como texto -aunque el CSV la
#: cite entre comillas-. `user`/`display_name` los escribe el propio
#: jugador (nombre de perfil) y `payload` puede llevar texto libre suyo
#: (p.ej. `stage_title`), así que sin escapar esto un nombre como
#: `=cmd|'/c calc'!A1` exporta un CSV que ejecuta algo al abrirlo en el
#: ordenador del organizador. Ver CVE-2019-1010192 / OWASP "CSV Injection".
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _celda_csv_segura(valor: Any) -> str:
    """`valor` como texto de celda, sin dejar que arranque una fórmula.

    Antepone una comilla simple si el primer carácter es de los que un
    lector de hojas de cálculo interpreta como inicio de fórmula. La
    comilla no se ve al abrir el CSV como texto: Excel/Sheets la usan
    como marca de "esto es texto", no como parte del valor.
    """
    texto = "" if valor is None else str(valor)
    if texto.startswith(_CSV_FORMULA_PREFIXES):
        return f"'{texto}"
    return texto


def to_csv(entries: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=_CSV_COLUMNS)
    writer.writeheader()
    for entry in entries:
        writer.writerow(
            {
                "created_at": _celda_csv_segura(entry.get("created_at", "")),
                "client_created_at": _celda_csv_segura(entry.get("client_created_at", "")),
                "user": _celda_csv_segura(entry.get("user", "")),
                "display_name": _celda_csv_segura(entry.get("display_name", "")),
                "type": _celda_csv_segura(entry.get("type", "")),
                "severity": _celda_csv_segura(entry.get("severity", "")),
                "payload": _celda_csv_segura(_stringify_payload(entry.get("payload"))),
            }
        )
    return buffer.getvalue()


def _stringify_payload(payload: Any) -> str:
    if not isinstance(payload, dict) or not payload:
        return ""
    return "; ".join(f"{key}={value}" for key, value in payload.items())

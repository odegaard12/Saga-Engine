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
from datetime import datetime, timezone
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


def _parse_iso(value: Any):
    """Fecha ISO (con `Z` o con `+00:00`) como datetime UTC, o None."""
    texto = str(value or "").strip()
    if not texto:
        return None
    try:
        fecha = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return fecha.astimezone(timezone.utc)


def occurred_at(entry: dict[str, Any]) -> str:
    """Cuándo PASÓ de verdad: la hora del móvil si la trae, si no la del servidor.

    Un evento creado sin cobertura llega minutos u horas después de ocurrir.
    Para revisar la partida en casa importa el orden en que pasaron las cosas,
    no el orden en que se subieron.
    """
    fecha = _parse_iso(entry.get("client_created_at")) or _parse_iso(entry.get("created_at"))
    return fecha.isoformat() if fecha else str(entry.get("created_at") or "")


def es_sospecha(entry: dict[str, Any]) -> bool:
    return entry.get("severity") == "suspicion" or entry.get("type") == "suspicion"


def es_sin_cobertura(entry: dict[str, Any]) -> bool:
    payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else {}
    return bool(payload.get("offline")) or entry.get("type") == "offline_sync_batch"


def list_timeline(
    db_path: str,
    *,
    user: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    event_type: str | None = None,
    limit: int | None = None,
    only_suspicions: bool = False,
    only_offline: bool = False,
    by_occurrence: bool = False,
) -> list[dict[str, Any]]:
    """La línea de tiempo, con filtros de revisión.

    `by_occurrence` ordena por cuándo ocurrió (hora del móvil) y añade
    `occurred_at` a cada fila; sin él el orden es el de registro, como siempre.
    """
    entradas = _store.list_entries(
        db_path,
        user=user,
        date_from=date_from,
        date_to=date_to,
        event_type=event_type,
        limit=limit,
    )

    if only_suspicions:
        entradas = [e for e in entradas if es_sospecha(e)]
    if only_offline:
        entradas = [e for e in entradas if es_sin_cobertura(e)]

    if by_occurrence:
        for entrada in entradas:
            entrada["occurred_at"] = occurred_at(entrada)
        entradas.sort(key=lambda e: (e["occurred_at"], e.get("created_at") or "", e.get("id") or ""))

    return entradas


def count_entries(db_path: str, *, user: str | None = None) -> int:
    return _store.count_entries(db_path, user=user)


def purge(db_path: str, *, user: str | None = None) -> int:
    return _store.delete_all(db_path, user=user)


_CSV_COLUMNS = [
    "created_at",
    "client_created_at",
    "occurred_at",
    "offline",
    "sync_delay_ms",
    "node_id",
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
                "occurred_at": _celda_csv_segura(entry.get("occurred_at") or occurred_at(entry)),
                "offline": _celda_csv_segura(_campo_de_payload(entry, "offline")),
                "sync_delay_ms": _celda_csv_segura(_campo_de_payload(entry, "sync_delay_ms")),
                "node_id": _celda_csv_segura(_campo_de_payload(entry, "node_id")),
                "user": _celda_csv_segura(entry.get("user", "")),
                "display_name": _celda_csv_segura(entry.get("display_name", "")),
                "type": _celda_csv_segura(entry.get("type", "")),
                "severity": _celda_csv_segura(entry.get("severity", "")),
                "payload": _celda_csv_segura(_stringify_payload(entry.get("payload"))),
            }
        )
    return buffer.getvalue()


def _campo_de_payload(entry: dict[str, Any], clave: str) -> Any:
    payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else {}
    valor = payload.get(clave)
    return "" if valor is None else valor


def _stringify_payload(payload: Any) -> str:
    if not isinstance(payload, dict) or not payload:
        return ""
    return "; ".join(f"{key}={value}" for key, value in payload.items())

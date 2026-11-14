"""Caducidad de los rastros GPS (13/11/2026, decisión de Óscar).

Las fotos de campo ya caducan a los 30 días (`field_proofs.caducar_pruebas`), pero los rastros de posición no:
`position_track` y las coordenadas que llevan otros eventos (tabla `events`), y `position_track` / `position_sample`
del Registro de partida (`match_log`). Aquí caducan con el MISMO plazo que las fotos (`main.dias_de_retencion`).

Regla de la casa («caducidad = purga»): un borrado automático nuevo que alcanza datos ya guardados exige que Óscar
escriba BORRAR antes. Por eso:

- está APAGADO por defecto; se enciende con la variable de entorno `SAGA_CADUCAR_RASTROS=1` o con el ajuste
  `position_expiry_enabled` del panel, que sólo se acepta con la confirmación nominal (ver routers/admin.py);
- `contar()` dice qué se borraría SIN borrar nada, para enseñarle el número antes de encenderlo.

No toca la misión, los tiempos ni el progreso, y de los eventos que no son rastros (los avances) sólo quita las
coordenadas, no el evento: la idempotencia por `client_event_id` y el historial se quedan.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any

from backend.app.storage import event_store, match_log_store
from backend.app.storage.sqlite_store import (
    CLAVES_CON_GPS,
    _json_dumps,
    _json_loads,
    init_sqlite_schema,
    sqlite_connection,
)

VARIABLE_DE_ENTORNO = "SAGA_CADUCAR_RASTROS"
CLAVE_DE_AJUSTE = "position_expiry_enabled"
TIPOS_DE_POSICION = ("position_track", "position_sample")
_VALORES_QUE_ENCIENDEN = {"1", "true", "si", "sí", "yes", "on"}


def activa(cfg: dict[str, Any] | None = None) -> bool:
    """¿Está encendida la caducidad? Variable de entorno o ajuste del panel; apagada por defecto."""
    if (os.getenv(VARIABLE_DE_ENTORNO) or "").strip().lower() in _VALORES_QUE_ENCIENDEN:
        return True
    return (cfg or {}).get(CLAVE_DE_AJUSTE) is True


def _corte(dias: int, ahora: float | None) -> str:
    """El instante límite en el formato fijo del registro (el orden alfabético es el cronológico)."""
    instante = (ahora if ahora is not None else time.time()) - int(dias) * 86400
    return datetime.fromtimestamp(instante, tz=timezone.utc).isoformat(timespec="microseconds")


def _es_viejo(creado: Any, corte: str) -> bool:
    normal = match_log_store.normalizar_instante(creado)
    return normal is not None and normal < corte


def _rutas(eventos: str | None, registro: str | None) -> tuple[str, str]:
    import main

    return (
        eventos or event_store.resolve_event_db_path(main.EVENT_LOG_DB),
        registro or main.MATCH_LOG_DB,
    )


def _condiciones_gps() -> str:
    return " OR ".join(f"payload_json LIKE '%\"{clave}\"%'" for clave in CLAVES_CON_GPS)


def _eventos_viejos(conn, corte: str) -> tuple[list[str], list[tuple[str, dict[str, Any]]]]:
    """(ids de `position_track` viejos, [(id, payload)] de otros eventos viejos que llevan coordenadas)."""
    pistas = [
        fila["id"]
        for fila in conn.execute("SELECT id, created_at FROM events WHERE type = 'position_track'").fetchall()
        if _es_viejo(fila["created_at"], corte)
    ]
    con_coordenadas = []
    for fila in conn.execute(
        f"SELECT id, created_at, payload_json FROM events WHERE type != 'position_track' AND ({_condiciones_gps()})"
    ).fetchall():
        payload = _json_loads(fila["payload_json"])
        if _es_viejo(fila["created_at"], corte) and any(clave in payload for clave in CLAVES_CON_GPS):
            con_coordenadas.append((fila["id"], payload))
    return pistas, con_coordenadas


def contar(dias: int, ahora: float | None = None, *, eventos: str | None = None, registro: str | None = None) -> dict[str, int]:
    """Qué se borraría con `dias` días de plazo, SIN borrar nada. 0 días = sin caducidad (todo a 0)."""
    vacio = {"dias": int(dias or 0), "eventos_position_track": 0, "eventos_con_coordenadas": 0,
             "registro_position_track": 0, "registro_position_sample": 0, "total": 0}
    if not dias or dias <= 0:
        return vacio
    ruta_eventos, ruta_registro = _rutas(eventos, registro)
    corte = _corte(dias, ahora)

    init_sqlite_schema(ruta_eventos)
    with sqlite_connection(ruta_eventos) as conn:
        pistas, con_coordenadas = _eventos_viejos(conn, corte)

    match_log_store.init_schema(ruta_registro)
    with match_log_store._connection(ruta_registro) as conn:
        por_tipo = {
            tipo: int(conn.execute(
                "SELECT COUNT(*) AS n FROM match_log WHERE type = ? AND occurred_at < ?", (tipo, corte)
            ).fetchone()["n"] or 0)
            for tipo in TIPOS_DE_POSICION
        }

    vacio.update(
        eventos_position_track=len(pistas),
        eventos_con_coordenadas=len(con_coordenadas),
        registro_position_track=por_tipo["position_track"],
        registro_position_sample=por_tipo["position_sample"],
    )
    vacio["total"] = sum(v for k, v in vacio.items() if k not in {"dias", "total"})
    return vacio


def caducar(dias: int, ahora: float | None = None, *, eventos: str | None = None, registro: str | None = None) -> dict[str, int]:
    """Borra los rastros con más de `dias` días. Devuelve lo mismo que `contar`, ya hecho. 0 días = nada."""
    if not dias or dias <= 0:
        return contar(0)
    ruta_eventos, ruta_registro = _rutas(eventos, registro)
    corte = _corte(dias, ahora)
    hecho = contar(dias, ahora, eventos=ruta_eventos, registro=ruta_registro)

    with sqlite_connection(ruta_eventos) as conn:
        pistas, con_coordenadas = _eventos_viejos(conn, corte)
        for id_ in pistas:
            conn.execute("DELETE FROM events WHERE id = ?", (id_,))
        for id_, payload in con_coordenadas:
            for clave in CLAVES_CON_GPS:
                payload.pop(clave, None)
            conn.execute("UPDATE events SET payload_json = ? WHERE id = ?", (_json_dumps(payload), id_))

    with match_log_store._connection(ruta_registro) as conn:
        conn.execute(
            "DELETE FROM match_log WHERE type IN (?, ?) AND occurred_at < ?", (*TIPOS_DE_POSICION, corte)
        )
    return hecho

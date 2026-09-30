"""Por qué el servidor no aceptó un evento, en una frase que el móvil pueda enseñar.

`/api/events/sync` devolvía sólo el código interno (`invalid_completion_code`),
así que el jugador nunca se enteraba de que un nodo suyo no había contado
(caza de fallos J3): el móvil daba el hueco por resuelto y seguía. Ahora cada
evento rechazado o ignorado lleva además `motivo`, un texto corto en castellano,
y `stage_id`, el nodo de que se trata.
"""
from __future__ import annotations

from typing import Any

MOTIVOS = {
    "invalid_completion_code": "El código de este nodo no era válido.",
    "missing_required_item": "Te faltaba un objeto necesario para este nodo.",
    "already_advanced": "Este nodo ya constaba como completado.",
    "stale_before_reset": "El organizador reinició tu partida: este avance era anterior al reinicio.",
    "mission_already_complete": "La misión ya estaba terminada.",
    "mission_not_started_yet": "La misión aún no ha empezado.",
}

MOTIVO_GENERICO = "El servidor no aceptó este evento."

ESTADOS_DE_RECHAZO = ("failed", "ignored")


def motivo_de(evento: Any) -> str | None:
    """Frase para el jugador si el evento NO se aplicó; None si se aceptó."""
    if not isinstance(evento, dict):
        return None
    error = str(evento.get("error") or "").strip()
    estado = str(evento.get("status") or "").strip()
    if not error and estado not in ESTADOS_DE_RECHAZO:
        return None
    return MOTIVOS.get(error, MOTIVO_GENERICO)

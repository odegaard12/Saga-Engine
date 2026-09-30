"""El reloj del móvil no es de fiar: corregirlo con el del servidor.

Los eventos de la cola sin cobertura llevan la hora del MÓVIL
(`payload.local_created_at`, y la `t` de cada muestra de posición). El servidor
la compara con el momento del último reinicio del organizador para descartar
avances «de la partida anterior» (`stale_before_reset`), la usa para ordenar el
Registro de partida y para cazar fechas en el futuro. Con un reloj de móvil
adelantado o atrasado cualquiera de las tres cosas salía mal: un avance legítimo
descartado como anterior al reinicio, o uno viejo que resucitaba (caza de
fallos S17/J17).

Contrato con el móvil: `POST /api/events/sync` acepta, opcionalmente, en el
nivel superior del cuerpo, `client_sent_at_ms` -la hora del móvil (ms desde la
época) justo antes de enviar-. El servidor calcula

    desfase = hora_del_servidor - client_sent_at_ms

y suma ese desfase a la hora de cada evento de la tanda. Sin `client_sent_at_ms`
no se toca nada: el comportamiento es el de siempre.
"""
from __future__ import annotations

import copy
import math
import time
from datetime import datetime, timezone
from typing import Any

#: Por debajo de esto se considera que el reloj está en hora (el tiempo de red
#: ya mete unos cientos de ms) y no se toca nada.
DESFASE_MINIMO_MS = 5_000
#: Por encima de esto el dato es basura (un `client_sent_at_ms` de 1970, de una
#: década en el futuro...) y se ignora.
DESFASE_MAXIMO_MS = 365 * 24 * 3600 * 1000


def calcular_desfase_ms(client_sent_at_ms: Any, ahora_ms: int | None = None) -> int:
    """`hora_del_servidor - client_sent_at_ms`, o 0 si no hay que corregir nada."""
    if isinstance(client_sent_at_ms, bool) or client_sent_at_ms is None:
        return 0
    try:
        enviado = float(client_sent_at_ms)
    except (TypeError, ValueError, OverflowError):
        return 0
    if not math.isfinite(enviado) or enviado <= 0:
        return 0

    ahora = int(ahora_ms if ahora_ms is not None else time.time() * 1000)
    desfase = int(ahora - enviado)
    if abs(desfase) < DESFASE_MINIMO_MS or abs(desfase) > DESFASE_MAXIMO_MS:
        return 0
    return desfase


def _iso_a_ms(valor: Any) -> int | None:
    texto = str(valor or "").strip()
    if not texto:
        return None
    try:
        fecha = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return int(fecha.timestamp() * 1000)


def _ms_a_iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def corregir_hora(ms: int, desfase_ms: int, ahora_ms: int) -> int:
    """Una hora del móvil, corregida. Nunca en el futuro del servidor."""
    return min(int(ms) + int(desfase_ms), int(ahora_ms))


def corregir_evento(raw_event: Any, desfase_ms: int, ahora_ms: int) -> Any:
    """Copia del evento crudo con las horas del móvil corregidas.

    Se corrige `payload.local_created_at` (y `local_created_at_ms` si viene) y la
    `t` de cada muestra de `payload.samples`. La hora original se conserva en
    `payload.local_created_at_device` y el desfase aplicado en
    `payload.clock_offset_ms`, para poder auditarlo. Con desfase 0 devuelve el
    evento tal cual.
    """
    if not desfase_ms or not isinstance(raw_event, dict):
        return raw_event
    payload = raw_event.get("payload")
    if not isinstance(payload, dict):
        return raw_event

    evento = dict(raw_event)
    nuevo = copy.copy(payload)
    tocado = False

    original = nuevo.get("local_created_at")
    en_ms = _iso_a_ms(original)
    if en_ms is not None:
        nuevo["local_created_at_device"] = original
        nuevo["local_created_at"] = _ms_a_iso(corregir_hora(en_ms, desfase_ms, ahora_ms))
        tocado = True

    ms_crudo = nuevo.get("local_created_at_ms")
    if isinstance(ms_crudo, (int, float)) and not isinstance(ms_crudo, bool) and math.isfinite(ms_crudo):
        nuevo["local_created_at_ms"] = corregir_hora(int(ms_crudo), desfase_ms, ahora_ms)
        tocado = True

    muestras = nuevo.get("samples")
    if isinstance(muestras, list):
        corregidas = []
        for muestra in muestras:
            if isinstance(muestra, dict) and isinstance(muestra.get("t"), (int, float)) and not isinstance(muestra.get("t"), bool):
                t = muestra["t"]
                if math.isfinite(t):
                    muestra = {**muestra, "t": corregir_hora(int(t), desfase_ms, ahora_ms)}
                    tocado = True
            corregidas.append(muestra)
        nuevo["samples"] = corregidas

    if not tocado:
        return raw_event

    nuevo["clock_offset_ms"] = int(desfase_ms)
    evento["payload"] = nuevo
    return evento

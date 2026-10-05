"""El tiempo de cada nodo, decidido por el servidor.

La clasificación decide un premio de verdad, así que el tiempo que cuenta no
puede ser sólo el que declara el móvil. La regla, en llano:

    tiempo del nodo = el MAYOR entre
        · lo que dice el móvil que tardó (`time_spent_ms`), y
        · lo que el servidor VIO pasar entre que el jugador abrió el nodo
          (evento `node_opened`) y el avance aceptado,
      con el observado acotado a `TOPE_OBSERVADO_MS`.
    tiempo total = suma de los nodos + penalizaciones (las mínimas del servidor
      —código a mano 2 min, modo alternativo 1 min— siempre sumadas).

El tiempo de CAMINAR entre nodos no cuenta, a propósito: todos hacen la ruta
juntos. Por eso el observado empieza al ABRIR el nodo y no en el avance
anterior. Sin apertura conocida no hay observado y vale lo declarado (el panel
lo enseña como «sin apertura»).

Por qué el máximo: bajar el tiempo es lo que le interesa a un tramposo, y lo
único que puede tocar es lo que manda su móvil. Si declara 5 s en un nodo que el
servidor vio abierto 4 min, cuentan los 4 min. Declarar MÁS de lo observado sólo
le perjudica a él (y ya deja la sospecha `declared_time_exceeds_observed`).

Sin cobertura (cola offline) las dos marcas son la hora del móvil
(`payload.local_created_at`), corregida con el desfase de `client_sent_at_ms`
(ver reloj_del_movil.py) antes de llegar aquí. Salvaguardas:

* nada en el futuro del servidor: una marca posterior a «ahora» se recorta a
  ahora (y `check_future_timestamp` ya deja la sospecha);
* la apertura nunca antes del avance anterior (no se puede abrir el nodo N sin
  haber superado el N-1) ni antes del último reinicio;
* apertura posterior al avance = dato incoherente: no hay observado;
* el observado se acota a `TOPE_OBSERVADO_MS` (un móvil que se queda con el
  nodo abierto mientras el grupo come no hunde a nadie), y lo declarado a
  `TOPE_DECLARADO_MS`.
"""
from __future__ import annotations

from typing import Any

#: Lo máximo que el servidor añade por su cuenta a un nodo.
TOPE_OBSERVADO_MS = 30 * 60 * 1000
#: Lo máximo que se acepta como declarado (igual que el tope de las penalizaciones).
TOPE_DECLARADO_MS = 2 * 60 * 60 * 1000


def _ms(valor: Any) -> int | None:
    if valor is None or isinstance(valor, bool):
        return None
    try:
        numero = int(valor)
    except (TypeError, ValueError, OverflowError):
        return None
    return numero if numero > 0 else None


def tiempo_de_nodo(
    declarado_ms: Any,
    abierto_ms: Any,
    completado_ms: Any,
    *,
    anterior_ms: Any = None,
    ahora_ms: Any = None,
    reinicio_ms: Any = None,
) -> dict:
    """Declarado, observado y aplicado de un nodo.

    Devuelve `{declared_ms, observed_ms, applied_ms, fuente, opened_at_ms,
    completed_at_ms}`. `fuente` es «observado» si manda lo que vio el servidor,
    «declarado» si manda lo del móvil, y «sin_apertura»/«sin_hora» cuando no
    hubo con qué observar.
    """
    try:
        declarado = max(0, min(TOPE_DECLARADO_MS, int(declarado_ms or 0)))
    except (TypeError, ValueError, OverflowError):
        declarado = 0

    ahora = _ms(ahora_ms)
    completado = _ms(completado_ms)
    if completado and ahora and completado > ahora:
        completado = ahora

    abierto = _ms(abierto_ms)
    if abierto and ahora and abierto > ahora:
        abierto = ahora
    for suelo in (_ms(anterior_ms), _ms(reinicio_ms)):
        if abierto and suelo and abierto < suelo:
            abierto = suelo

    observado = None
    if not completado:
        fuente = "sin_hora"
    elif not abierto:
        fuente = "sin_apertura"
    elif abierto > completado:
        fuente = "sin_apertura"
        abierto = None
    else:
        observado = min(TOPE_OBSERVADO_MS, completado - abierto)
        fuente = "observado" if observado > declarado else "declarado"

    return {
        "declared_ms": declarado,
        "observed_ms": observado,
        "applied_ms": max(declarado, observado or 0),
        "fuente": fuente,
        "opened_at_ms": abierto,
        "completed_at_ms": completado,
    }

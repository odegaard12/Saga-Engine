"""¿Estaba el jugador cerca del nodo al completarlo? Comprobado en el SERVIDOR.

Hasta ahora sólo el móvil miraba la distancia: `/api/advance` y la cola offline
aceptaban un nodo con su código esté uno donde esté. Aquí el servidor vuelve a
mirarlo con lo que ya tiene:

- las muestras de GPS que el móvil manda en la evidencia del avance
  (`evidence.gps`, las de los últimos 15 min; ver `avance/evidencia.ts`);
- y, sólo para un avance EN LÍNEA, la última posición en vivo del latido si es
  de hace menos de `EDAD_MAXIMA_EN_VIVO_S`. Un avance que llega por la cola
  offline se juzga sólo con las muestras que trae: la posición en vivo de ahora
  no dice dónde estaba cuando lo completó.

La regla, en llano
------------------

Un nodo «con GPS» es uno con coordenadas, radio > 0, entrada `gps` y
`require_proximity`. Para los demás (QR, entrada libre, lógica) no se mira nada.

Para cada muestra se calcula una tolerancia:

    radio del nodo + precisión declarada (entre 15 y 100 m; 50 si no la trae) + 40 m

(la misma que «mapa mudo»; en mapa mudo el radio es como mínimo 15 m). Basta UNA
muestra dentro de su tolerancia para que cuente como «cerca».

Veredictos:

- `modo_prueba`: alguna muestra es manual o el jugador está en modo prueba. Se
  deja SIEMPRE pasar (el modo prueba existe para quien tiene el GPS roto) y se
  anota una nota neutra con el nodo, para que el organizador lo vea en el panel
  y en la exportación y lo valore. No penaliza nada.
- `sin_gps`: ninguna muestra real (rescate de 45 s, GPS denegado, móvil viejo).
  Se deja pasar SIEMPRE y queda la nota neutra «sin GPS» con el nodo.
- `cerca`: alguna muestra real dentro de su tolerancia. Nada que anotar.
- `lejos`: hay muestras reales y todas fuera. Se anota la sospecha
  «lejos del nodo» (con la distancia, nunca las coordenadas).

Por defecto NADA bloquea: se anota y el jugador sigue, igual que el resto del
antitrampas, para no dejar a nadie atascado en el monte por un GPS malo. Con el
interruptor de la misión `require_server_proximity` encendido (apagado por
defecto) se RECHAZA sólo el caso `lejos` con al menos una muestra real de
precisión fiable (≤ 100 m): ni el modo prueba ni el rescate sin GPS se bloquean
nunca, y un GPS que declara una precisión peor se anota pero no se bloquea.

Funciones puras: reciben el nodo, la evidencia y la posición, y devuelven el
veredicto. Quién lo anota y quién rechaza lo decide `main.py`.
"""
from __future__ import annotations

import math
import time
from typing import Any

from backend.app.runtime.evidencia import (
    MAPA_MUDO_TOLERANCIA_M,
    _PRECISION_MAXIMA_M,
    _PRECISION_MINIMA_M,
    _PRECISION_POR_DEFECTO_M,
    _haversine_m,
    _num,
    muestras_gps,
)
from backend.app.runtime.mision import MAPA_MUDO_RADIO_MINIMO_M, kind_del_nodo

#: Margen fijo sobre radio + precisión. El mismo que «mapa mudo».
TOLERANCIA_EXTRA_M = MAPA_MUDO_TOLERANCIA_M

#: Una posición del latido más vieja que esto no dice dónde está ahora.
EDAD_MAXIMA_EN_VIVO_S = 300

#: Clave de la configuración de la misión (config.json) que activa el bloqueo.
CLAVE_EXIGIR = "require_server_proximity"

NO_APLICA = "no_aplica"
CERCA = "cerca"
LEJOS = "lejos"
MODO_PRUEBA = "modo_prueba"
SIN_GPS = "sin_gps"

#: Motivo del rechazo cuando el interruptor está encendido (móvil y cola).
MOTIVO_RECHAZO = "too_far_from_node"

#: Nombres de las notas/sospechas que se anotan en el antitrampas.
RAZON_LEJOS = "proximity_far_from_node"
RAZON_MODO_PRUEBA = "proximity_test_mode"
RAZON_SIN_GPS = "proximity_no_gps"

_FUENTES_MANUALES = {"manual", "debug", "simulated", "simulation", "test"}


def exigir_proximidad(cfg: Any) -> bool:
    """¿Está encendido «exigir proximidad en servidor» en la misión?"""
    if not isinstance(cfg, dict):
        return False
    valor = cfg.get(CLAVE_EXIGIR)
    if isinstance(valor, str):
        return valor.strip().lower() in {"1", "true", "si", "sí", "yes", "on"}
    return valor is True or valor == 1


def nodo_con_gps(node: Any) -> bool:
    """¿Se entra a este nodo por GPS y tiene sitio en el mapa?"""
    if not isinstance(node, dict):
        return False
    entrada = node.get("entry") if isinstance(node.get("entry"), dict) else {}
    modo = str(entrada.get("mode") or "gps").strip().lower()
    if modo != "gps" or entrada.get("require_proximity") is False:
        return False
    ubicacion = node.get("location") if isinstance(node.get("location"), dict) else {}
    lat, lon = _num(ubicacion.get("lat")), _num(ubicacion.get("lon"))
    radio = _num(ubicacion.get("radius_m"), 0.0) or 0.0
    return lat is not None and lon is not None and radio > 0


def radio_del_nodo(node: dict) -> float:
    ubicacion = node.get("location") if isinstance(node.get("location"), dict) else {}
    radio = _num(ubicacion.get("radius_m"), 0.0) or 0.0
    if kind_del_nodo(node) == "mapa_mudo":
        radio = max(radio, MAPA_MUDO_RADIO_MINIMO_M)
    return radio


def margen_de_precision(precision: Any) -> float:
    valor = _num(precision)
    if valor is None or valor < 0:
        valor = _PRECISION_POR_DEFECTO_M
    return min(max(valor, _PRECISION_MINIMA_M), _PRECISION_MAXIMA_M)


def precision_fiable(precision: Any) -> bool:
    """Una muestra con precisión conocida y no peor que el tope (100 m)."""
    valor = _num(precision)
    return valor is not None and 0 <= valor <= _PRECISION_MAXIMA_M


def muestra_en_vivo(posicion: Any, ahora_s: float | None = None) -> dict | None:
    """La última posición del latido como muestra, si es reciente."""
    if not isinstance(posicion, dict):
        return None
    lat, lon = _num(posicion.get("lat")), _num(posicion.get("lon"))
    if lat is None or lon is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None
    visto = _num(posicion.get("last_seen"), 0.0) or 0.0
    ahora = time.time() if ahora_s is None else ahora_s
    if visto <= 0 or ahora - visto > EDAD_MAXIMA_EN_VIVO_S:
        return None
    fuente = str(posicion.get("source") or "").strip().lower()
    manual = fuente in _FUENTES_MANUALES or posicion.get("debug_enabled") is True
    return {
        "lat": lat,
        "lon": lon,
        "acc": _num(posicion.get("accuracy")),
        "src": "manual" if manual else "real",
        "t": visto * 1000.0,
        "origen": "en_vivo",
    }


def evaluar_proximidad(
    node: Any,
    evidence: Any,
    *,
    posicion_en_vivo: Any = None,
    modo_prueba: bool = False,
    exigir: bool = False,
    ahora_s: float | None = None,
) -> dict:
    """El veredicto de proximidad de un avance. Nunca lanza.

    Devuelve `{"veredicto", "bloquea", ...}` con, según el caso, la distancia
    mínima, la tolerancia aplicada y cuántas muestras se miraron. Sin
    coordenadas de nadie: sólo distancias.
    """
    try:
        return _evaluar(node, evidence, posicion_en_vivo, modo_prueba, exigir, ahora_s)
    except Exception as error:  # pragma: no cover - defensa: no debe tirar el avance
        return {"veredicto": NO_APLICA, "bloquea": False, "error": type(error).__name__}


def _evaluar(node, evidence, posicion_en_vivo, modo_prueba, exigir, ahora_s):
    if not nodo_con_gps(node):
        return {"veredicto": NO_APLICA, "bloquea": False}

    muestras = [{**m, "origen": "evidencia"} for m in muestras_gps(evidence)]
    en_vivo = muestra_en_vivo(posicion_en_vivo, ahora_s)
    if en_vivo:
        muestras.append(en_vivo)

    manuales = sum(1 for m in muestras if m["src"] == "manual")
    if modo_prueba or manuales:
        return {
            "veredicto": MODO_PRUEBA,
            "bloquea": False,
            "muestras": len(muestras),
            "muestras_manuales": manuales,
        }

    reales = [m for m in muestras if m["src"] == "real"]
    if not reales:
        return {"veredicto": SIN_GPS, "bloquea": False, "muestras": 0}

    ubicacion = node["location"]
    lat, lon = float(ubicacion["lat"]), float(ubicacion["lon"])
    radio = radio_del_nodo(node)

    mejor = None
    for muestra in reales:
        distancia = _haversine_m(lat, lon, muestra["lat"], muestra["lon"])
        tolerancia = radio + margen_de_precision(muestra["acc"]) + TOLERANCIA_EXTRA_M
        exceso = distancia - tolerancia
        if mejor is None or exceso < mejor["exceso"]:
            mejor = {"exceso": exceso, "distancia": distancia, "tolerancia": tolerancia, "muestra": muestra}

    base = {
        "muestras": len(reales),
        "distancia_minima_m": round(min(_haversine_m(lat, lon, m["lat"], m["lon"]) for m in reales), 1),
        "tolerancia_m": round(mejor["tolerancia"], 1),
        "radio_m": round(radio, 1),
        "origen": mejor["muestra"]["origen"],
    }
    if mejor["exceso"] <= 0:
        return {"veredicto": CERCA, "bloquea": False, **base}

    fiable = any(precision_fiable(m["acc"]) for m in reales)
    precision = mejor["muestra"]["acc"]
    return {
        "veredicto": LEJOS,
        "bloquea": bool(exigir and fiable),
        "precision_fiable": fiable,
        "precision_m": None if precision is None or not math.isfinite(precision) else round(precision, 1),
        **base,
    }


def nota_para_el_antitrampas(veredicto: dict, node: Any) -> tuple[str, dict, str] | None:
    """(motivo, evidencia, gravedad) a anotar, o None si no hay nada que anotar.

    En «mapa mudo» la lejanía y la falta de GPS ya las anota la revisión de la
    evidencia (`evidence_gps_far_mapa_mudo` / `evidence_gps_missing`): no se
    duplican. El modo prueba sí, porque allí no se anotaba por nodo.
    """
    if not isinstance(veredicto, dict):
        return None
    tipo = veredicto.get("veredicto")
    node_id = node.get("id") if isinstance(node, dict) else None
    mapa_mudo = isinstance(node, dict) and kind_del_nodo(node) == "mapa_mudo"

    if tipo == MODO_PRUEBA:
        return (
            RAZON_MODO_PRUEBA,
            {"node_id": node_id, "muestras_manuales": veredicto.get("muestras_manuales", 0)},
            "info",
        )
    if tipo == SIN_GPS and not mapa_mudo:
        return RAZON_SIN_GPS, {"node_id": node_id}, "info"
    if tipo == LEJOS and (not mapa_mudo or veredicto.get("bloquea")):
        evidencia = {
            "node_id": node_id,
            "distancia_minima_m": veredicto.get("distancia_minima_m"),
            "tolerancia_m": veredicto.get("tolerancia_m"),
            "precision_m": veredicto.get("precision_m"),
            "precision_fiable": veredicto.get("precision_fiable"),
            "muestras": veredicto.get("muestras"),
            "origen": veredicto.get("origen"),
            "bloqueado": bool(veredicto.get("bloquea")),
        }
        return RAZON_LEJOS, evidencia, "suspicion"
    return None


def resumen_para_el_registro(veredicto: dict) -> dict:
    """Lo que va al Registro de partida y al tiempo del nodo (sin coordenadas)."""
    if not isinstance(veredicto, dict) or veredicto.get("veredicto") in (None, NO_APLICA):
        return {}
    resumen = {"proximidad": veredicto.get("veredicto")}
    if veredicto.get("distancia_minima_m") is not None:
        resumen["proximidad_distancia_m"] = veredicto["distancia_minima_m"]
    if veredicto.get("bloquea"):
        resumen["proximidad_bloqueado"] = True
    return resumen

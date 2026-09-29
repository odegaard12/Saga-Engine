"""Evidencia de partida: lo que el móvil aporta al completar un nodo, y cómo
lo revisa el servidor.

Hasta ahora el servidor aceptaba un nodo con la palabra «OK» y nada más: el
móvil decidía si el jugador había ganado el minijuego y el servidor se fiaba.
No se puede quitar esa comprobación del móvil -sin cobertura es la única que
hay-, así que se hace doble: el móvil sigue validando en local y, al
completar, manda la EVIDENCIA de lo que pasó (respuestas dadas, rondas con su
opción y su tiempo, muestras de GPS, texto del QR leído). El servidor -en el
momento si hay red, al sincronizar si no- lo vuelve a comprobar contra la
configuración real del nodo.

Política, igual que en anti_cheat.py: FLAG, no bloqueo. Lo que no cuadra
queda anotado como sospecha en el motor antitrampas y en el Registro de
partida, con un nombre en español en el panel; el progreso se conserva y la
clasificación no se toca. Y el modo prueba (posición manual) jamás se
restringe: sólo se deja nota.

Todo lo de aquí son funciones puras: reciben el nodo, el jugador y la
evidencia, y devuelven hallazgos. Quién los anota lo decide main.py.
"""
from __future__ import annotations

import math
from typing import Any

from backend.app.runtime.minigames import (
    WORD_TRAP_MAX_EXTRA_ROUNDS,
    WORD_TRAP_PENALTY_MS,
    _clamp_int,
    cuenta_senales_accepted_values,
    word_trap_server_rounds,
)
from backend.app.runtime.mision import (
    MAPA_MUDO_RADIO_MINIMO_M,
    kind_del_nodo,
    stage_qr_payloads,
)

#: Versión del formato que manda el móvil. Un móvil viejo -sin evidencia- no
#: manda `v`: se le anota una nota neutra. Uno que manda `v` pero ningún
#: cuerpo para un juego que sí lo necesita está modificado: sospecha.
EVIDENCE_VERSION = 1

SEVERITY_SUSPICION = "suspicion"
SEVERITY_INFO = "info"

# Topes del saneado: la evidencia viene de un cliente que puede ser hostil.
_MAX_DEPTH = 4
_MAX_LIST = 60
_MAX_KEYS = 24
_MAX_TEXT = 200

#: Rango máximo de un tiempo por ronda que se da por bueno (1 h). Fuera de
#: esto es basura, no un dato.
_MAX_ROUND_MS = 3_600_000

#: Ni leyendo la pregunta y las cuatro opciones se contesta antes de esto.
MIN_HUMAN_ANSWER_MS = 250

#: Cuánto se perdona sobre el radio real en "mapa mudo" al mirar las muestras
#: de GPS: además de la precisión de cada muestra. Deliberadamente generoso
#: -ver la cabecera de anti_cheat.py sobre GPS de monte-.
MAPA_MUDO_TOLERANCIA_M = 40.0
_PRECISION_POR_DEFECTO_M = 50.0
_PRECISION_MAXIMA_M = 100.0
_PRECISION_MINIMA_M = 15.0

_RADIO_TIERRA_M = 6371000.0


# ---------------------------------------------------------------------------
# Saneado
# ---------------------------------------------------------------------------

def sanitize_evidence(value: Any, _depth: int = 0) -> Any:
    """Copia acotada de la evidencia: sólo JSON simple, con topes de tamaño.

    No es una lista blanca de claves -cada juego manda las suyas-, sino un
    recorte: profundidad, nº de elementos y longitud de texto.
    """
    if _depth > _MAX_DEPTH:
        return None
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, str):
        return value.strip()[:_MAX_TEXT]
    if isinstance(value, list):
        return [sanitize_evidence(item, _depth + 1) for item in value[:_MAX_LIST]]
    if isinstance(value, dict):
        limpio = {}
        for indice, (clave, valor) in enumerate(value.items()):
            if indice >= _MAX_KEYS:
                break
            texto = str(clave).strip()[:64]
            if texto:
                limpio[texto] = sanitize_evidence(valor, _depth + 1)
        return limpio
    return None


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * _RADIO_TIERRA_M * math.asin(min(1.0, math.sqrt(a)))


def _num(valor, defecto=None):
    if isinstance(valor, bool):
        return defecto
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return defecto
    return numero if math.isfinite(numero) else defecto


def _config_del_nodo(node: dict) -> dict:
    if not isinstance(node, dict):
        return {}
    interaccion = node.get("interaction") if isinstance(node.get("interaction"), dict) else {}
    config = interaccion.get("config") if isinstance(interaccion.get("config"), dict) else {}
    if not config and isinstance(node.get("config"), dict):
        config = node["config"]
    return config or {}


def _game_id(node: dict) -> str:
    return str(_config_del_nodo(node).get("game_id") or "").strip().lower()


def _hallazgo(reason: str, evidence: dict, severity: str = SEVERITY_SUSPICION) -> dict:
    return {"reason": reason, "severity": severity, "evidence": evidence}


def muestras_gps(evidence: Any) -> list[dict]:
    """Las muestras de GPS válidas de la evidencia: {lat, lon, acc, src, t}."""
    if not isinstance(evidence, dict) or not isinstance(evidence.get("gps"), list):
        return []
    salida = []
    for bruta in evidence["gps"]:
        if not isinstance(bruta, dict):
            continue
        lat, lon = _num(bruta.get("lat")), _num(bruta.get("lon"))
        if lat is None or lon is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            continue
        salida.append(
            {
                "lat": lat,
                "lon": lon,
                "acc": _num(bruta.get("acc")),
                "src": "manual" if str(bruta.get("src") or "").lower() == "manual" else "real",
                "t": _num(bruta.get("t")),
            }
        )
    return salida


def _distancia_minima_m(node: dict, muestras: list[dict]):
    ubicacion = node.get("location") if isinstance(node.get("location"), dict) else {}
    lat, lon = _num(ubicacion.get("lat")), _num(ubicacion.get("lon"))
    if lat is None or lon is None or not muestras:
        return None
    return min(_haversine_m(lat, lon, m["lat"], m["lon"]) for m in muestras)


# ---------------------------------------------------------------------------
# Comprobaciones por juego
# ---------------------------------------------------------------------------

def _revisar_cuenta_senales(node, player_id, evidence):
    respuestas = evidence.get("answers")
    if not isinstance(respuestas, list) or not respuestas:
        return [_hallazgo("evidence_missing", {"game_id": "cuenta_senales", "motivo": "sin respuestas"})]

    validas = []
    for bruta in respuestas:
        numero = _num(bruta)
        if numero is not None:
            validas.append(int(numero))

    aceptadas = cuenta_senales_accepted_values(_config_del_nodo(node), node.get("id"), player_id)
    ultima = validas[-1] if validas else None
    if ultima is None or ultima not in aceptadas:
        return [
            _hallazgo(
                "evidence_answer_mismatch",
                {
                    "game_id": "cuenta_senales",
                    "answers": validas[:10],
                    "accepted": [aceptadas[0], aceptadas[-1]] if aceptadas else [],
                },
            )
        ]
    return []


def _revisar_trampa_palabras(node, player_id, evidence, penalty_ms):
    rondas = evidence.get("rondas")
    if not isinstance(rondas, list) or not rondas:
        return [_hallazgo("evidence_missing", {"game_id": "trampa_palabras", "motivo": "sin rondas"})]

    config = _config_del_nodo(node)
    del_servidor = word_trap_server_rounds(config, node.get("id"), player_id)
    n_base = _clamp_int(config.get("n_rounds"), 8, 4, 12)
    hallazgos: list[dict] = []

    permitidas = n_base
    extras_usadas = 0
    fallos = 0
    demasiado_rapidas = 0
    orden_roto = None

    for posicion, ronda in enumerate(rondas):
        ronda = ronda if isinstance(ronda, dict) else {}
        indice = _num(ronda.get("r"))
        if indice is None or int(indice) != posicion or posicion >= len(del_servidor):
            orden_roto = {"posicion": posicion, "r": indice}
            break

        elegida = _num(ronda.get("c"))
        correcta = del_servidor[posicion]["correct_index"]
        acierto = elegida is not None and int(elegida) == correcta
        if not acierto:
            fallos += 1
            if extras_usadas < WORD_TRAP_MAX_EXTRA_ROUNDS:
                extras_usadas += 1
                permitidas += 1

        ms = _num(ronda.get("ms"))
        if ms is not None and 0 <= ms < MIN_HUMAN_ANSWER_MS and elegida is not None:
            demasiado_rapidas += 1

    if orden_roto is not None:
        hallazgos.append(_hallazgo("evidence_rounds_mismatch", {"game_id": "trampa_palabras", **orden_roto}))
    elif len(rondas) != permitidas:
        hallazgos.append(
            _hallazgo(
                "evidence_rounds_mismatch",
                {
                    "game_id": "trampa_palabras",
                    "rondas_jugadas": len(rondas),
                    "rondas_esperadas": permitidas,
                    "fallos": fallos,
                },
            )
        )

    declarados = _num(evidence.get("fallos"))
    if declarados is not None and int(declarados) != fallos:
        hallazgos.append(
            _hallazgo(
                "evidence_rounds_mismatch",
                {"game_id": "trampa_palabras", "fallos_declarados": int(declarados), "fallos_reales": fallos},
            )
        )

    minimo_penalizacion = fallos * WORD_TRAP_PENALTY_MS
    if penalty_ms is not None and minimo_penalizacion > 0 and penalty_ms < minimo_penalizacion:
        hallazgos.append(
            _hallazgo(
                "evidence_penalty_short",
                {
                    "game_id": "trampa_palabras",
                    "penalty_ms": penalty_ms,
                    "penalty_minima_ms": minimo_penalizacion,
                    "fallos": fallos,
                },
            )
        )

    if demasiado_rapidas >= max(2, len(rondas) // 2):
        hallazgos.append(
            _hallazgo(
                "evidence_too_fast",
                {"game_id": "trampa_palabras", "rondas_bajo_250ms": demasiado_rapidas, "rondas": len(rondas)},
            )
        )

    return hallazgos


def _revisar_conteo(node, evidence, game_id):
    """Pulso de hierro / Rumbo doble: cuántas rondas u objetivos se dieron."""
    config = _config_del_nodo(node)
    if game_id == "rumbo_doble":
        targets = config.get("targets")
        # Menos de 2 objetivos = el cliente lo juega como rumbo simple (uno).
        esperado = len(targets) if isinstance(targets, list) and len(targets) >= 2 else 1
        clave = "objetivos_ok"
    else:
        # Mismo tope que el cliente (PulsoHierroRuntimeScreen: clampInt 3..10).
        esperado = _clamp_int(config.get("pulso_target_rounds"), 6, 3, 10)
        clave = "rondas_ok"

    conseguido = _num(evidence.get(clave))
    if conseguido is None:
        return [_hallazgo("evidence_missing", {"game_id": game_id, "motivo": f"sin {clave}"})]
    if int(conseguido) < esperado:
        return [
            _hallazgo(
                "evidence_rounds_mismatch",
                {"game_id": game_id, clave: int(conseguido), "esperado": esperado},
            )
        ]
    return []


def _revisar_qr(node, evidence):
    qr = evidence.get("qr") if isinstance(evidence.get("qr"), dict) else {}
    leido = str(qr.get("raw") or "").strip().upper()
    if not leido:
        return []
    validos = {valor for valor in stage_qr_payloads(node) if valor}
    if validos and leido not in validos:
        return [_hallazgo("evidence_qr_mismatch", {"leido": leido[:60], "validos": len(validos)})]
    return []


def _revisar_mapa_mudo(node, evidence):
    muestras = muestras_gps(evidence)
    if not muestras:
        return [_hallazgo("evidence_gps_missing", {"game_id": "mapa_mudo"}, severity=SEVERITY_INFO)]

    ubicacion = node.get("location") if isinstance(node.get("location"), dict) else {}
    lat, lon = _num(ubicacion.get("lat")), _num(ubicacion.get("lon"))
    if lat is None or lon is None:
        return []
    radio = max(_num(ubicacion.get("radius_m"), 0.0) or 0.0, MAPA_MUDO_RADIO_MINIMO_M)

    mejor = None
    for muestra in muestras:
        precision = muestra["acc"] if muestra["acc"] is not None else _PRECISION_POR_DEFECTO_M
        margen = min(max(precision, _PRECISION_MINIMA_M), _PRECISION_MAXIMA_M)
        distancia = _haversine_m(lat, lon, muestra["lat"], muestra["lon"])
        exceso = distancia - (radio + margen + MAPA_MUDO_TOLERANCIA_M)
        if mejor is None or exceso < mejor["exceso"]:
            mejor = {"exceso": exceso, "distancia": distancia, "src": muestra["src"]}
        if exceso <= 0:
            return []

    return [
        _hallazgo(
            "evidence_gps_far_mapa_mudo",
            {
                "game_id": "mapa_mudo",
                "muestras": len(muestras),
                "distancia_minima_m": round(mejor["distancia"], 1),
                "radio_m": round(radio, 1),
                "origen": mejor["src"],
            },
        )
    ]


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------

def resumen_de_evidencia(node: dict, evidence: Any) -> dict:
    """Resumen corto para el Registro de partida: qué se aportó, sin la masa
    de datos. La evidencia completa vive en el evento; esto es lo que se lee
    de un vistazo al revisar la partida en casa."""
    if not isinstance(evidence, dict) or not evidence:
        return {"evidencia": "ninguna"}

    resumen: dict[str, Any] = {"evidencia": "v%s" % evidence.get("v", "?")}

    # `via` de la evidencia (cómo se ganó: juego, qr, código de respaldo) se
    # llama `gano_por` en el registro: `via` a secas es por dónde LLEGÓ el
    # evento al servidor (en línea, cola, segundo plano).
    if evidence.get("via") is not None:
        resumen["gano_por"] = evidence["via"]
    for clave in ("juego_ms", "fallos", "rondas_ok", "objetivos_ok"):
        if evidence.get(clave) is not None:
            resumen[clave] = evidence[clave]

    if isinstance(evidence.get("answers"), list):
        resumen["respuestas"] = evidence["answers"][:10]
    if isinstance(evidence.get("rondas"), list):
        resumen["rondas_n"] = len(evidence["rondas"])
    if isinstance(evidence.get("qr"), dict) and evidence["qr"].get("raw"):
        resumen["qr_leido"] = str(evidence["qr"]["raw"])[:60]

    muestras = muestras_gps(evidence)
    if muestras:
        resumen["gps_n"] = len(muestras)
        resumen["gps_manual_n"] = sum(1 for m in muestras if m["src"] == "manual")
        distancia = _distancia_minima_m(node, muestras)
        if distancia is not None:
            resumen["gps_distancia_minima_m"] = round(distancia, 1)

    return resumen


def verificar_evidencia(
    node: dict,
    player_id: str,
    evidence: Any,
    *,
    penalty_ms: int | None = None,
    manual: bool = False,
) -> list[dict]:
    """Los hallazgos de revisar la evidencia contra el nodo real. Lista vacía
    = todo cuadra (o no hay nada que revisar). Nunca lanza: una evidencia rota
    es, como mucho, un hallazgo."""
    try:
        return _verificar(node, player_id, evidence, penalty_ms=penalty_ms, manual=manual)
    except Exception as error:  # pragma: no cover - defensa: no debe tirar el avance
        return [_hallazgo("evidence_unreadable", {"error": type(error).__name__}, severity=SEVERITY_INFO)]


def _verificar(node, player_id, evidence, *, penalty_ms, manual):
    game_id = _game_id(node)
    kind = kind_del_nodo(node)

    necesita_cuerpo = game_id in ("cuenta_senales", "trampa_palabras", "pulso_hierro", "rumbo_doble")

    if not isinstance(evidence, dict) or not evidence:
        # Un código escrito a mano en la casilla de respaldo no es una partida
        # jugada: no trae evidencia de juego y no se le pide.
        if manual or not necesita_cuerpo:
            return []
        return [
            _hallazgo(
                "evidence_legacy_client",
                {"game_id": game_id},
                severity=SEVERITY_INFO,
            )
        ]

    hallazgos: list[dict] = []

    if manual:
        # El código de respaldo salta el juego: no hay partida que revisar.
        return hallazgos

    if game_id == "cuenta_senales":
        hallazgos += _revisar_cuenta_senales(node, player_id, evidence)
    elif game_id == "trampa_palabras":
        hallazgos += _revisar_trampa_palabras(node, player_id, evidence, penalty_ms)
    elif game_id in ("pulso_hierro", "rumbo_doble"):
        hallazgos += _revisar_conteo(node, evidence, game_id)

    if kind == "mapa_mudo":
        hallazgos += _revisar_mapa_mudo(node, evidence)

    hallazgos += _revisar_qr(node, evidence)

    return hallazgos

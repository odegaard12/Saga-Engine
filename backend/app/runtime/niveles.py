"""Niveles 1-5 de los minijuegos (26/10/2026).

Un solo mando por nodo, `nivel` en la config del minijuego. La tabla de parámetros de cada juego y nivel vive en UN
sitio, `niveles_minijuegos.json` (el panel la lee de `frontend/src/player/minigames/core/niveles.generado.ts`, que sale
de ese JSON con `node frontend/scripts/generar-niveles.mjs`; una prueba comprueba que están sincronizados).

Reglas:

* **Sin `nivel` en la config no cambia nada**: las misiones que ya existen se juegan exactamente igual que antes.
* **El nivel 2 es lo de hoy**: sus parámetros son los valores por defecto del normalizador de cada juego.
* Con `nivel` (y sin `nivel_a_mano`) el nivel MANDA sobre los parámetros que lista la tabla. Con `nivel_a_mano: true` el
  organizador ha retocado algún número a mano y se respeta lo que haya escrito (el nivel queda como etiqueta).
* **El mismo nivel para todos los jugadores de un nodo**: la clasificación premia el tiempo, así que no hay dificultad
  adaptativa por jugador. Lo que sí puede variar por jugador es el CONTENIDO (semillas, orden de preguntas), no la
  dificultad. Un fallo cuesta tiempo, nunca bloquea.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

NIVEL_MINIMO = 1
NIVEL_MAXIMO = 5
NIVEL_POR_DEFECTO = 2

_RUTA = Path(__file__).with_name("niveles_minijuegos.json")


@lru_cache(maxsize=1)
def tabla() -> dict:
    """La tabla completa (`estimacion`, `nombres_de_nivel`, `juegos`). Se lee una sola vez."""
    return json.loads(_RUTA.read_text(encoding="utf-8"))


def nivel_de(raw: Any) -> int:
    """El nivel de una config en bruto: entero 1..5; sin valor, ilegible o fuera de rango = el de hoy (2) o el tope."""
    valor = raw.get("nivel") if isinstance(raw, dict) else raw
    if valor is None or isinstance(valor, bool):
        return NIVEL_POR_DEFECTO
    try:
        numero = int(float(valor))
    except (TypeError, ValueError, OverflowError):
        return NIVEL_POR_DEFECTO
    return max(NIVEL_MINIMO, min(NIVEL_MAXIMO, numero))


def _a_mano(raw: dict) -> bool:
    valor = raw.get("nivel_a_mano")
    if isinstance(valor, str):
        return valor.strip().lower() in ("1", "true", "si", "sí", "yes")
    return bool(valor)


def clave_de_juego(minigame_type: Any, raw: dict) -> str:
    """La clave del juego en la tabla (su `game_id`), a partir del tipo técnico y la config."""
    tipo = str(minigame_type or "").strip().lower()
    gid = str(raw.get("game_id") or "").strip().lower()
    if tipo == "audio_challenge":
        return "audio_challenge"
    if tipo == "word_trap":
        return "trampa_palabras"
    if tipo == "circuit_matrix":
        return gid or "logic_circuit"
    if tipo == "motion_challenge":
        return gid or "shake_charge"
    return gid


def soporta_nivel(clave: str) -> bool:
    return clave in tabla()["juegos"]


def parametros_de_nivel(clave: str, nivel: int) -> dict:
    """Los parámetros que fija `nivel` en el juego `clave` (copia; vacío si el juego no tiene niveles)."""
    juego = tabla()["juegos"].get(clave)
    if not juego:
        return {}
    return dict(juego["niveles"][str(max(NIVEL_MINIMO, min(NIVEL_MAXIMO, int(nivel))))]["params"])


def aplicar_nivel(minigame_type: Any, raw: dict) -> tuple[dict, dict | None]:
    """Devuelve `(config con el nivel aplicado, info)`.

    `info` es `{"nivel": n, "nivel_a_mano": bool}` si la config usa niveles y el juego los tiene; `None` si no
    (entonces `raw` vuelve tal cual).
    """
    if not isinstance(raw, dict) or raw.get("nivel") is None:
        return raw, None
    clave = clave_de_juego(minigame_type, raw)
    if not soporta_nivel(clave):
        return raw, None
    nivel = nivel_de(raw)
    a_mano = _a_mano(raw)
    if a_mano:
        return raw, {"nivel": nivel, "nivel_a_mano": True}
    mezclada = dict(raw)
    mezclada.update(parametros_de_nivel(clave, nivel))
    return mezclada, {"nivel": nivel, "nivel_a_mano": False}

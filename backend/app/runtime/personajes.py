"""El personaje que cada jugador elige para verse en el mapa.

En el mapa cada jugador es un muñeco dibujado en el propio móvil (ver
frontend/src/player/avatares/): nada de caras ni de fotos. Aquí vive sólo lo
que tiene que saber el servidor: cuáles hay, cuál le toca a cada uno mientras no
elija y dónde se guarda lo elegido.

Por qué hay una lista también aquí: el servidor NO se fía de lo que manda el
móvil. Un personaje que no esté en `PERSONAJES` se rechaza, y un fichero
tocado a mano con uno inventado se ignora al leerlo.

El personaje por defecto sale del id del jugador con una cuenta que el móvil
repite igual (FNV-1a sobre los bytes UTF-8), así que todos tienen uno desde el
primer segundo y el mismo en los dos lados, sin que nadie haya elegido nada.
La prueba `test_personajes_del_jugador` fija unos valores concretos: si se
toca la cuenta aquí hay que tocarla en `personajes.ts`, y al revés.
"""
from __future__ import annotations

from typing import Any

from backend.app.storage.json_store import load_json, update_json

#: Orden fijo: el defecto es un índice en esta lista. Cuatro personajes de cada
#: género y dos animales; si se añade uno, AL FINAL, o todos cambian de defecto.
PERSONAJES: tuple[str, ...] = (
    "explorador",
    "exploradora",
    "vikingo",
    "vikinga",
    "peregrino",
    "bruxa",
    "marinheira",
    "gaiteiro",
    "can",
    "raposo",
)

_FNV_BASE = 0x811C9DC5
_FNV_PRIMO = 0x01000193


def personaje_por_defecto(jugador_id: Any) -> str:
    """El personaje que le toca a un jugador que aún no ha elegido."""
    hash_ = _FNV_BASE
    for byte in str(jugador_id or "").strip().encode("utf-8"):
        hash_ = ((hash_ ^ byte) * _FNV_PRIMO) & 0xFFFFFFFF
    return PERSONAJES[hash_ % len(PERSONAJES)]


def es_personaje(valor: Any) -> bool:
    return isinstance(valor, str) and valor in PERSONAJES


def cargar_elegidos(ruta: str) -> dict[str, str]:
    """{id de jugador: personaje} sólo con lo válido."""
    crudo = load_json(ruta, {})
    if not isinstance(crudo, dict):
        return {}
    return {str(k): v for k, v in crudo.items() if es_personaje(v)}


def guardar_elegido(ruta: str, jugador_id: str, personaje: str) -> None:
    if not es_personaje(personaje):
        raise ValueError("personaje no válido")
    clave = str(jugador_id)

    def poner(actual):
        nuevo = dict(actual) if isinstance(actual, dict) else {}
        nuevo[clave] = personaje
        return nuevo

    update_json(ruta, {}, poner)


def con_personaje(perfil: dict, elegidos: dict[str, str]) -> dict:
    """La ficha del jugador con `character` (el de ahora) y `character_chosen`.

    `character_chosen` dice si lo eligió él: el móvil abre el selector la
    primera vez que está en falso.
    """
    if not isinstance(perfil, dict):
        return perfil
    jugador_id = str(perfil.get("id") or perfil.get("user") or "")
    elegido = elegidos.get(jugador_id)
    resultado = dict(perfil)
    resultado["character"] = elegido or personaje_por_defecto(jugador_id)
    resultado["character_chosen"] = bool(elegido)
    return resultado

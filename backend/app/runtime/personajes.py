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

import hashlib
import json
from typing import Any, Iterable

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


# ---------------------------------------------------------------------------
# El avatar como CONFIGURACIÓN, no como un nombre suelto.
#
# Hoy es `{"character": "can"}`. Mañana habrá piel, pelo, ropa, accesorios y
# colores: irán dentro de `parts` (`{"skin": "3", "hair": "trenzas", ...}`) sin
# tocar el formato de disco ni la unicidad. Dos jugadores no pueden tener la
# misma configuración EXACTA: se compara por el hash de la forma canónica.
# ---------------------------------------------------------------------------

_MAX_PARTES = 32
_MAX_VALOR = 40


def normalizar_avatar(valor: Any) -> dict | None:
    """La forma canónica de un avatar, o None si no es válido.

    Acepta el formato antiguo (el nombre a secas) y el nuevo (objeto).
    `parts` sólo admite claves y valores cortos (texto o entero): el servidor
    no se fía de lo que manda el móvil.
    """
    if isinstance(valor, str):
        valor = {"character": valor}
    if not isinstance(valor, dict) or not es_personaje(valor.get("character")):
        return None
    resultado: dict[str, Any] = {"character": valor["character"]}
    partes = valor.get("parts")
    if partes:
        if not isinstance(partes, dict) or len(partes) > _MAX_PARTES:
            return None
        limpias: dict[str, Any] = {}
        for clave, parte in partes.items():
            if not isinstance(clave, str) or not clave or len(clave) > _MAX_VALOR:
                return None
            if isinstance(parte, bool) or not isinstance(parte, (str, int)):
                return None
            if isinstance(parte, str) and len(parte) > _MAX_VALOR:
                return None
            limpias[clave] = parte
        resultado["parts"] = dict(sorted(limpias.items()))
    return resultado


def hash_de_avatar(avatar: Any) -> str:
    """Hash estable de la forma canónica. Sin `parts` no entra en la cuenta,
    así añadir partes algún día no cambia el hash de quien ya eligió."""
    canon = normalizar_avatar(avatar)
    if canon is None:
        raise ValueError("avatar no válido")
    texto = json.dumps(canon, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()[:16]


class AvatarOcupado(Exception):
    """Otro jugador ya tiene exactamente esta configuración."""


def cargar_configs(ruta: str) -> dict[str, dict]:
    """{id de jugador: configuración canónica} sólo con lo válido (lee los dos formatos)."""
    crudo = load_json(ruta, {})
    if not isinstance(crudo, dict):
        return {}
    salida: dict[str, dict] = {}
    for k, v in crudo.items():
        canon = normalizar_avatar(v)
        if canon is not None:
            salida[str(k)] = canon
    return salida


def cargar_elegidos(ruta: str) -> dict[str, str]:
    """{id de jugador: personaje} sólo con lo válido (vista plana de `cargar_configs`)."""
    return {k: v["character"] for k, v in cargar_configs(ruta).items()}


def ocupados_por_otros(configs: dict[str, dict], jugador_id: str) -> list[dict]:
    """Las configuraciones elegidas por los DEMÁS (sin ids: nada personal)."""
    clave = str(jugador_id)
    vistos: dict[str, dict] = {}
    for otro, cfg in configs.items():
        if otro != clave:
            vistos[hash_de_avatar(cfg)] = cfg
    return [{"hash": h, "avatar": c} for h, c in vistos.items()]


def guardar_elegido(ruta: str, jugador_id: str, avatar: Any) -> dict:
    """Guarda el avatar de un jugador, de forma atómica y única.

    La comprobación y la escritura van dentro del MISMO ciclo bloqueado de
    `update_json`: dos móviles eligiendo a la vez lo mismo no pueden ganar los
    dos. Lanza `ValueError` si no es válido y `AvatarOcupado` si otro jugador ya
    lo tiene. Los duplicados antiguos no estorban: sólo se miran los demás.
    """
    canon = normalizar_avatar(avatar)
    if canon is None:
        raise ValueError("personaje no válido")
    clave = str(jugador_id)
    quiero = hash_de_avatar(canon)
    choque: list[bool] = []

    def poner(actual):
        nuevo = dict(actual) if isinstance(actual, dict) else {}
        propio = normalizar_avatar(nuevo.get(clave))
        if propio is not None and hash_de_avatar(propio) == quiero:
            return actual  # ya es suyo (también si es un duplicado antiguo)
        for otro, valor in nuevo.items():
            cfg = normalizar_avatar(valor)
            if str(otro) != clave and cfg is not None and hash_de_avatar(cfg) == quiero:
                choque.append(True)
                return actual if isinstance(actual, dict) else {}
        nuevo[clave] = canon
        return nuevo

    update_json(ruta, {}, poner)
    if choque:
        raise AvatarOcupado(quiero)
    return canon


def calcular_defectos(jugadores: Iterable[Any], configs: dict[str, dict]) -> dict[str, str]:
    """El personaje por defecto de quien aún no eligió, sin repetir ninguno libre.

    Parte del que le sale por su id y pasa al siguiente de la lista si ya está
    cogido (por alguien que eligió o por un defecto anterior). Recorre los ids
    en orden, así que con los mismos jugadores sale siempre lo mismo. Si no
    queda ninguno libre se queda el suyo (con 10 personajes y más jugadores,
    repetir es inevitable).
    """
    cogidos = {cfg["character"] for cfg in configs.values() if "parts" not in cfg}
    resultado: dict[str, str] = {}
    for jugador in sorted({str(j) for j in jugadores}):
        if jugador in configs:
            continue
        inicio = PERSONAJES.index(personaje_por_defecto(jugador))
        elegido = PERSONAJES[inicio]
        for paso in range(len(PERSONAJES)):
            candidato = PERSONAJES[(inicio + paso) % len(PERSONAJES)]
            if candidato not in cogidos:
                elegido = candidato
                break
        cogidos.add(elegido)
        resultado[jugador] = elegido
    return resultado


def con_personaje(perfil: dict, elegidos: dict, defectos: dict[str, str] | None = None) -> dict:
    """La ficha del jugador con `character` (el de ahora), `avatar` y `character_chosen`.

    `character_chosen` dice si lo eligió él: el móvil le enseña el selector
    antes de la carga mientras esté en falso. `elegidos` admite el valor plano
    (el nombre) o la configuración completa. `defectos` es lo que devuelve
    `calcular_defectos`; sin él vale el defecto por id.
    """
    if not isinstance(perfil, dict):
        return perfil
    jugador_id = str(perfil.get("id") or perfil.get("user") or "")
    canon = normalizar_avatar(elegidos.get(jugador_id))
    resultado = dict(perfil)
    if canon:
        resultado["character"] = canon["character"]
        resultado["avatar"] = canon
    else:
        defecto = (defectos or {}).get(jugador_id) or personaje_por_defecto(jugador_id)
        resultado["character"] = defecto
        resultado["avatar"] = {"character": defecto}
    resultado["character_chosen"] = bool(canon)
    return resultado

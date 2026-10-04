"""El personaje que cada jugador elige para verse en el mapa.

En el mapa cada jugador es un personaje 3D de Mixamo (ver
frontend/src/player/avatares3d/mixamo/), o su retrato redondo cuando no se
dibuja en 3D (en la vista 2D, la foto de perfil que cada jugador ya tiene en el
sistema: ver `retratoDeMapa.ts`). `character` es el valor de siempre
(los diez nombres de `PERSONAJES`): lo tienen los jugadores de la versión 2D
—que pasan a un personaje 3D con `MIXAMO_DE_PERSONAJE`— y lo exige el formato.
Aquí vive sólo lo que tiene que saber el servidor: cuáles hay, cuál le toca a cada uno mientras no
elija y dónde se guarda lo elegido.

Por qué hay una lista también aquí: el servidor NO se fía de lo que manda el
móvil. Un personaje que no esté en `PERSONAJES` se rechaza, y un fichero
tocado a mano con uno inventado se ignora al leerlo.

El personaje por defecto (`personaje_por_defecto`) sale del id del jugador con
FNV-1a sobre los bytes UTF-8. El móvil ya no lo usa: quien no ha elegido se ve
con el personaje 3D que le toca por su id (`aspectoPorDefecto`, catalogo.ts, que
usa la misma cuenta), y la lista de aquí es la de `personajes.ts`.
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

# ---------------------------------------------------------------------------
# Avatares 3D (Mixamo). Van DENTRO de `parts`, sin tocar `PERSONAJES` (si se
# alargara esa lista cambiaría el personaje por defecto de todo el mundo):
#
#   {"character": "peregrino",                    <- el valor «character» de siempre (ver más abajo)
#    "parts": {"mx": "Ch01",                      <- cuál de los 10 personajes
#              "top": 0, "pants": 10, "hair": 4,  <- índices de las paletas
#              "cabeza": "boina", "manoD": "bordon", ...}}   <- complementos
#
# Los índices y los nombres son los de
# frontend/src/player/avatares3d/mixamo/catalogo.ts; la prueba
# `test_el_catalogo_mixamo_es_el_mismo_en_servidor_y_movil` los compara. El
# servidor no se fía del móvil: un `mx` que no existe, un color fuera de la
# paleta, un complemento inventado o dos cosas en la misma mano se rechazan.
# ---------------------------------------------------------------------------

MIXAMO_IDS: tuple[str, ...] = (
    "Ch01", "Ch02", "Ch08", "Ch21", "Ch22", "Ch23", "Ch26", "Ch28", "Ch31", "Ch37",
)
#: Cuántos colores de ropa y de pelo hay (índices 0..n-1).
MIXAMO_COLORES_ROPA = 17
MIXAMO_COLORES_PELO = 8
#: Complementos por hueco. `manoD`/`manoI` ocupan una mano; `dos`, las dos.
MIXAMO_COMPLEMENTOS: dict[str, tuple[str, ...]] = {
    "cabeza": ("casco", "boina", "sombrero"),
    "espalda": ("mochila", "mochilaP"),
    "manoD": ("bordon", "paraguas"),
    "manoI": ("cesta",),
    "dos": ("gaita",),
    "pies": ("zocas",),
}
_MIXAMO_CLAVES = {"mx", "top", "pants", "hair", *MIXAMO_COMPLEMENTOS}


def _entero_en_rango(valor: Any, n: int) -> bool:
    return isinstance(valor, int) and not isinstance(valor, bool) and 0 <= valor < n


def mixamo_valido(partes: dict) -> bool:
    """¿Son `parts` de un avatar Mixamo bien formado? (sólo se llama si hay `mx`)."""
    if partes.get("mx") not in MIXAMO_IDS:
        return False
    if not set(partes) <= _MIXAMO_CLAVES:
        return False
    for clave, n in (("top", MIXAMO_COLORES_ROPA), ("pants", MIXAMO_COLORES_ROPA), ("hair", MIXAMO_COLORES_PELO)):
        if clave in partes and not _entero_en_rango(partes[clave], n):
            return False
    for hueco, permitidos in MIXAMO_COMPLEMENTOS.items():
        if hueco in partes and partes[hueco] not in permitidos:
            return False
    if "dos" in partes and ("manoD" in partes or "manoI" in partes):
        return False
    return True


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
        if "mx" in limpias and not mixamo_valido(limpias):
            return None
        resultado["parts"] = dict(sorted(limpias.items()))
    return resultado


#: A qué personaje 3D pasa quien eligió uno de los diez en la versión 2D (inyectiva).
MIXAMO_DE_PERSONAJE: dict[str, str] = {
    "explorador": "Ch23",
    "exploradora": "Ch22",
    "vikingo": "Ch31",
    "vikinga": "Ch26",
    "peregrino": "Ch01",
    "bruxa": "Ch21",
    "marinheira": "Ch02",
    "gaiteiro": "Ch08",
    "can": "Ch28",
    "raposo": "Ch37",
}
#: Colores de serie de un personaje 3D (los de `ASPECTO_BASE` en catalogo.ts).
_MIXAMO_BASE = {"top": 0, "pants": 10, "hair": 4}


def _forma_para_comparar(canon: dict) -> dict:
    """Lo que cuenta para decir «es el mismo aspecto».

    Un jugador de la versión 2D (sólo `character`) ES su personaje 3D con los colores de serie,
    así que compite con quien elija ese mismo aspecto. Con `mx`, `character` es sólo un nombre
    de reserva y no entra en la cuenta."""
    partes = canon.get("parts")
    if partes and "mx" in partes:
        return {"parts": partes}
    if not partes and canon["character"] in MIXAMO_DE_PERSONAJE:
        return {"parts": {"mx": MIXAMO_DE_PERSONAJE[canon["character"]], **_MIXAMO_BASE}}
    return canon


def hash_de_avatar(avatar: Any) -> str:
    """Hash estable de la forma canónica (ver `_forma_para_comparar`). Sin `parts` no entra
    en la cuenta, así añadir partes algún día no cambia el hash de quien ya eligió."""
    canon = normalizar_avatar(avatar)
    if canon is None:
        raise ValueError("avatar no válido")
    texto = json.dumps(_forma_para_comparar(canon), sort_keys=True, separators=(",", ":"), ensure_ascii=True)
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
    return [{"hash": h, "avatar": _a_forma_3d(c)} for h, c in vistos.items()]


def cuenta_por_personaje(configs: dict[str, dict], jugador_id: str) -> dict[str, int]:
    """Cuántos jugadores (los DEMÁS, no tú) llevan cada personaje 3D: `{"Ch01": 2, ...}`.

    Es sólo informativo para el selector («lo lleva 1»): no bloquea nada (dos jugadores
    pueden llevar el mismo personaje con distinto aspecto) y no lleva ni ids ni nombres,
    sólo el recuento. Un jugador de la versión 2D cuenta en su personaje 3D equivalente.
    Los personajes que nadie lleva no salen.
    """
    clave = str(jugador_id)
    cuenta: dict[str, int] = {}
    for otro, cfg in configs.items():
        if str(otro) == clave:
            continue
        mx = _forma_para_comparar(cfg).get("parts", {}).get("mx")
        if mx in MIXAMO_IDS:
            cuenta[mx] = cuenta.get(mx, 0) + 1
    return dict(sorted(cuenta.items()))


def _a_forma_3d(canon: dict) -> dict:
    """Un jugador de la versión 2D, tal como lo ve el móvil: su personaje 3D con los colores de serie."""
    forma = _forma_para_comparar(canon)
    if forma is canon:
        return canon
    return {"character": canon["character"], "parts": forma["parts"]}


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

"""Catálogo de claves del vestuario: qué piezas hay, cuáles son libres y cuáles se ganan.

Cada pieza de la tienda tiene una CLAVE estable:

    mx:Ch01 … mx:Ch37      personaje 3D (los 10 son SIEMPRE libres: decisión del usuario)
    ropa:N                 color de ropa N (vale para camiseta y pantalón: misma paleta)
    hair:N                 color de pelo N
    item:<id>              complemento (boina, casco, gaita…)
    gesto:<clip>           gesto del menú (ge__clapping…)

Las listas son espejo de frontend/src/player/avatares3d/mixamo/catalogo.ts (que
edita el agente de la tienda; aquí sólo se LEE). La prueba
`test_el_catalogo_de_claves_es_el_mismo_que_el_del_movil` las compara con Node,
igual que la paridad del catálogo Mixamo de personajes.py.

`KIT_LIBRE` es el reparto inicial: lo que se puede llevar sin ganar nada. El
organizador puede cambiarlo desde el panel (`bloqueados` en la configuración de
la misión), salvo los personajes, que no se bloquean nunca.
"""
from __future__ import annotations

from typing import Any, Iterable

from backend.app.runtime import personajes as _pj

#: Los gestos del menú (clips `ge__*`), en el orden de `GESTOS` de catalogo.ts.
GESTOS: tuple[str, ...] = (
    "ge__salute",
    "ge__clapping",
    "ge__head_nod_yes",
    "ge__happy_hand_gesture",
    "ge__acknowledging",
    "ge__look_away_gesture",
    "ge__dismissing_gesture",
    "ge__being_cocky",
    "ge__relieved_sigh",
    "ge__thoughtful_head_shake",
    "ge__shaking_head_no",
    "ge__weight_shift",
)

NOMBRES_MX = {
    "Ch01": "Xoán", "Ch02": "Antía", "Ch08": "Brais", "Ch21": "Uxía", "Ch22": "Iria",
    "Ch23": "Martiño", "Ch26": "Carme", "Ch28": "Breixo", "Ch31": "Pelayo", "Ch37": "Noa",
}
NOMBRES_ROPA = (
    "Azul Galicia", "Blanco lino", "Verde pino", "Rojo teja", "Mostaza", "Granate",
    "Gris pizarra", "Marrón tierra", "Arena", "Amarillo chubasquero", "Azul marino",
    "Negro", "Naranja", "Rosa palo", "Tartán verde", "Tartán rojo", "Tartán Galicia",
)
NOMBRES_PELO = ("Negro", "Castaño oscuro", "Castaño", "Rubio", "Pelirrojo", "Canoso", "Blanco", "Azul fantasía")
NOMBRES_ITEMS = {
    "casco": "Casco vikingo", "boina": "Boina", "sombrero": "Sombrero de peregrino",
    "monteira": "Monteira", "pano": "Pañuelo de cabeza", "sueste": "Sueste de marinero",
    "gorra": "Gorra de ruta", "mochila": "Mochila", "mochilaP": "Mochila de peregrino",
    "coroza": "Coroza de junco", "faixa": "Faja", "cabaza": "Calabaza de peregrino",
    "bordon": "Bordón de peregrino", "paraguas": "Paraguas", "cesta": "Cesta con grelos y setas",
    "gaita": "Gaita gallega", "zocas": "Zocas",
}
NOMBRES_GESTOS = {
    "ge__salute": "Saludar", "ge__clapping": "Aplaudir", "ge__head_nod_yes": "Asentir",
    "ge__happy_hand_gesture": "Gesto feliz", "ge__acknowledging": "De acuerdo",
    "ge__look_away_gesture": "Mirar", "ge__dismissing_gesture": "Por ahí",
    "ge__being_cocky": "Encoger los hombros", "ge__relieved_sigh": "¡Uf!",
    "ge__thoughtful_head_shake": "Pensar", "ge__shaking_head_no": "Negar", "ge__weight_shift": "Esperar",
}

#: Hueco de cada complemento (sale de personajes.py: no se duplica).
HUECO_DE_ITEM: dict[str, str] = {
    item: hueco for hueco, items in _pj.MIXAMO_COMPLEMENTOS.items() for item in items
}

# ---------------------------------------------------------------------------
# Reparto inicial (decisiones del 04/10/2026: personajes libres; ropa básica
# libre; lo especial —tocados, objetos, colores especiales y gestos— se gana).
# ---------------------------------------------------------------------------

ROPA_LIBRE = (0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13)
PELO_LIBRE = (0, 1, 2, 3, 4, 5, 6)
ITEMS_LIBRES = ("boina", "gorra", "pano", "mochila", "faixa")
GESTOS_LIBRES = (
    "ge__salute", "ge__head_nod_yes", "ge__acknowledging",
    "ge__thoughtful_head_shake", "ge__shaking_head_no", "ge__weight_shift",
)

#: El color de serie de un personaje 3D (ASPECTO_BASE): tiene que ser libre.
BASE = {"top": 0, "pants": 10, "hair": 4}


def clave_mx(mx: str) -> str:
    return f"mx:{mx}"


def todas_las_claves() -> list[str]:
    """Todas las claves, en orden de tienda."""
    return (
        [clave_mx(mx) for mx in _pj.MIXAMO_IDS]
        + [f"ropa:{i}" for i in range(_pj.MIXAMO_COLORES_ROPA)]
        + [f"hair:{i}" for i in range(_pj.MIXAMO_COLORES_PELO)]
        + [f"item:{item}" for hueco in _pj.MIXAMO_COMPLEMENTOS.values() for item in hueco]
        + [f"gesto:{g}" for g in GESTOS]
    )


CLAVES = frozenset(todas_las_claves())
#: Los personajes no se bloquean nunca (con ~15 por ruta, se repetirían caras).
NUNCA_BLOQUEADAS = frozenset(clave_mx(mx) for mx in _pj.MIXAMO_IDS)

KIT_LIBRE = frozenset(
    list(NUNCA_BLOQUEADAS)
    + [f"ropa:{i}" for i in ROPA_LIBRE]
    + [f"hair:{i}" for i in PELO_LIBRE]
    + [f"item:{i}" for i in ITEMS_LIBRES]
    + [f"gesto:{g}" for g in GESTOS_LIBRES]
)
BLOQUEADAS_POR_DEFECTO = tuple(c for c in todas_las_claves() if c not in KIT_LIBRE)


def tipo_de(clave: str) -> str:
    return str(clave).split(":", 1)[0]


def nombre_de(clave: str) -> str:
    tipo, _, valor = str(clave).partition(":")
    try:
        if tipo == "mx":
            return NOMBRES_MX.get(valor, valor)
        if tipo == "ropa":
            return NOMBRES_ROPA[int(valor)]
        if tipo == "hair":
            return f"Pelo {NOMBRES_PELO[int(valor)].lower()}"
        if tipo == "item":
            return NOMBRES_ITEMS.get(valor, valor)
        if tipo == "gesto":
            return f"Gesto «{NOMBRES_GESTOS.get(valor, valor)}»"
    except (ValueError, IndexError):
        pass
    return str(clave)


def bloqueadas_efectivas(bloqueados: Iterable[str] | None) -> frozenset[str]:
    """Las bloqueadas de la configuración (o las del reparto inicial), sin personajes ni claves inventadas."""
    lista = BLOQUEADAS_POR_DEFECTO if bloqueados is None else bloqueados
    return frozenset(c for c in lista if c in CLAVES and c not in NUNCA_BLOQUEADAS)


# ---------------------------------------------------------------------------
# Avatar <-> claves
# ---------------------------------------------------------------------------

def partes_3d(avatar: Any) -> dict | None:
    """Las `parts` 3D completas de un avatar guardado (con los colores de serie si faltan)."""
    canon = _pj.normalizar_avatar(avatar, sanear=True)
    if canon is None:
        return None
    partes = dict(canon.get("parts") or {})
    if "mx" not in partes:
        mx = _pj.MIXAMO_DE_PERSONAJE.get(canon["character"])
        if not mx:
            return None
        partes = {"mx": mx}
    for clave, valor in BASE.items():
        partes.setdefault(clave, valor)
    return partes


def claves_de_avatar(avatar: Any) -> set[str]:
    """Qué piezas del catálogo usa un avatar."""
    partes = partes_3d(avatar)
    if not partes:
        return set()
    usadas = {clave_mx(partes["mx"])}
    for parte in ("top", "pants"):
        if isinstance(partes.get(parte), int):
            usadas.add(f"ropa:{partes[parte]}")
    if isinstance(partes.get("hair"), int):
        usadas.add(f"hair:{partes['hair']}")
    for hueco in _pj.MIXAMO_COMPLEMENTOS:
        if partes.get(hueco):
            usadas.add(f"item:{partes[hueco]}")
    return usadas


#: Sustituto «equivalente» de cada color especial (el más parecido de los libres).
_ROPA_EQUIVALENTE = {9: 4, 12: 3, 14: 2, 15: 3, 16: 0}
_PELO_EQUIVALENTE = {7: 0}


def _libres_de(prefijo: str, n: int, prohibidas: set[str]) -> list[int]:
    return [i for i in range(n) if f"{prefijo}:{i}" not in prohibidas]


def sustitutos(avatar: Any, prohibidas: Iterable[str]) -> list[dict]:
    """Avatares candidatos (en orden de preferencia) sin ninguna pieza de `prohibidas`.

    El primero es el «equivalente» (el color libre más parecido, el tocado
    libre del mismo hueco; los objetos de mano sin equivalente libre se quitan).
    Los siguientes varían el color de la camiseta y luego el del pantalón, para
    poder encontrar una combinación que nadie más lleve (unicidad por hash).
    Lista vacía si el avatar ya no usa nada prohibido o no es válido.
    """
    prohibidas = set(prohibidas)
    canon = _pj.normalizar_avatar(avatar, sanear=True)
    partes = partes_3d(avatar)
    if canon is None or partes is None or not (claves_de_avatar(avatar) & prohibidas):
        return []

    base = dict(partes)
    ropa_libre = _libres_de("ropa", _pj.MIXAMO_COLORES_ROPA, prohibidas) or [0]
    pelo_libre = _libres_de("hair", _pj.MIXAMO_COLORES_PELO, prohibidas) or [0]
    for parte in ("top", "pants"):
        if f"ropa:{base[parte]}" in prohibidas:
            equivalente = _ROPA_EQUIVALENTE.get(base[parte])
            base[parte] = equivalente if equivalente in ropa_libre else ropa_libre[0]
    if f"hair:{base['hair']}" in prohibidas:
        equivalente = _PELO_EQUIVALENTE.get(base["hair"])
        base["hair"] = equivalente if equivalente in pelo_libre else pelo_libre[0]
    for hueco, items in _pj.MIXAMO_COMPLEMENTOS.items():
        if base.get(hueco) and f"item:{base[hueco]}" in prohibidas:
            libres = [i for i in items if f"item:{i}" not in prohibidas]
            if libres:
                base[hueco] = libres[0]
            else:
                base.pop(hueco)

    candidatos = [base]
    for top in ropa_libre:
        if top != base["top"]:
            candidatos.append({**base, "top": top})
    for pants in ropa_libre:
        if pants != base["pants"]:
            for top in ropa_libre:
                candidatos.append({**base, "top": top, "pants": pants})

    salida = []
    for partes_candidatas in candidatos:
        nuevo = _pj.normalizar_avatar({"character": canon["character"], "parts": partes_candidatas})
        if nuevo is not None:
            salida.append(nuevo)
    return salida


def combinaciones_libres(bloqueadas: Iterable[str]) -> int:
    """Cuántos aspectos distintos se pueden montar sólo con lo libre (para calibrar el kit)."""
    bloqueadas = set(bloqueadas)
    personajes = sum(1 for mx in _pj.MIXAMO_IDS if clave_mx(mx) not in bloqueadas)
    ropa = len(_libres_de("ropa", _pj.MIXAMO_COLORES_ROPA, bloqueadas))
    pelo = len(_libres_de("hair", _pj.MIXAMO_COLORES_PELO, bloqueadas))
    total = personajes * ropa * ropa * pelo
    # Huecos independientes (las manos se cuentan como un solo grupo: o una o dos manos).
    for hueco in ("cabeza", "espalda", "cintura", "pies"):
        total *= 1 + sum(1 for i in _pj.MIXAMO_COMPLEMENTOS[hueco] if f"item:{i}" not in bloqueadas)
    derecha = sum(1 for i in _pj.MIXAMO_COMPLEMENTOS["manoD"] if f"item:{i}" not in bloqueadas)
    izquierda = sum(1 for i in _pj.MIXAMO_COMPLEMENTOS["manoI"] if f"item:{i}" not in bloqueadas)
    dos = sum(1 for i in _pj.MIXAMO_COMPLEMENTOS["dos"] if f"item:{i}" not in bloqueadas)
    return total * ((1 + derecha) * (1 + izquierda) + dos)


def catalogo(bloqueadas: Iterable[str]) -> list[dict]:
    bloqueadas = set(bloqueadas)
    return [
        {"clave": c, "tipo": tipo_de(c), "nombre": nombre_de(c), "libre": c not in bloqueadas,
         "bloqueable": c not in NUNCA_BLOQUEADAS}
        for c in todas_las_claves()
    ]

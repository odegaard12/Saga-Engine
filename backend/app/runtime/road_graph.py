"""
Red de caminos de la zona de la misión, como grafo.

El mapa del panel DIBUJA las carreteras (es la imagen de OpenStreetMap), pero
no las tiene como datos. Para que la guía del jugador pueda redirigir por
carreteras y caminos cuando se sale del trazado, hacen falta como grafo:
nodos en los cruces y tramos con su longitud y su geometría.

Se descargan de OpenStreetMap (Overpass) para un rectángulo alrededor de la
ruta, se reducen a lo que importa -cruces, extremos y la forma de cada tramo
simplificada a unos metros- y se guardan en un JSON que viaja en el paquete
offline y en el que el móvil calcula rutas sin cobertura.

Todo lo que no toca red está en funciones puras, para poder probarlo.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

# Vías por las que se puede ir a pie. Fuera: autopistas y autovías.
HIGHWAYS_A_PIE = (
    "residential|unclassified|tertiary|secondary|primary|living_street|service|"
    "track|path|footway|cycleway|pedestrian|steps|bridleway|road|"
    "tertiary_link|secondary_link|primary_link"
)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# Espejos por si el principal devuelve 504 (pasa a menudo con zonas grandes).
OVERPASS_ESPEJOS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
# Lado máximo de cada baldosa de descarga, en km. Una zona de 80x80 km de
# una sola vez tumba el servidor público (504); en baldosas de 15 km cada
# petición es pequeña y se une el resultado.
LADO_BALDOSA_KM = 25.0
# Overpass concede pocas ranuras por IP: peticiones encadenadas sin pausa
# acaban en 504 en todos los espejos. Entre baldosas se espera un poco, y
# ante un fallo se espera más antes de probar el siguiente espejo.
PAUSA_ENTRE_BALDOSAS_S = 4.0
PAUSA_TRAS_FALLO_S = 15.0

# Lo que está pasando ahora mismo, para que el panel lo enseñe: la
# construcción corre en segundo plano y el panel la consulta.
construccion = {"en_curso": False, "hechas": 0, "total": 0, "error": "", "margen_km": None}
FICHERO = "road_graph.json"
TOLERANCIA_M = 3.0  # simplificación de la forma de cada tramo


def metros_entre(a, b):
    """Distancia en metros entre (lat, lon) y (lat, lon)."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000.0 * math.asin(math.sqrt(h))


def bbox_alrededor(puntos, margen_km):
    """(sur, oeste, norte, este) que envuelve los puntos con margen."""
    lats = [p[0] for p in puntos]
    lons = [p[1] for p in puntos]
    lat_c = (min(lats) + max(lats)) / 2
    d_lat = margen_km / 111.32
    d_lon = margen_km / (111.32 * max(0.2, math.cos(math.radians(lat_c))))
    return (min(lats) - d_lat, min(lons) - d_lon, max(lats) + d_lat, max(lons) + d_lon)


def baldosas(bbox, lado_km=LADO_BALDOSA_KM):
    """Parte el rectángulo en baldosas de como mucho `lado_km` de lado."""
    sur, oeste, norte, este = bbox
    lat_c = (sur + norte) / 2
    paso_lat = lado_km / 111.32
    paso_lon = lado_km / (111.32 * max(0.2, math.cos(math.radians(lat_c))))
    filas = max(1, math.ceil((norte - sur) / paso_lat))
    columnas = max(1, math.ceil((este - oeste) / paso_lon))
    alto = (norte - sur) / filas
    ancho = (este - oeste) / columnas
    salida = []
    for i in range(filas):
        for j in range(columnas):
            salida.append((sur + i * alto, oeste + j * ancho, sur + (i + 1) * alto, oeste + (j + 1) * ancho))
    return salida


def consulta_overpass(bbox):
    sur, oeste, norte, este = bbox
    return (
        "[out:json][timeout:90];"
        'way["highway"~"^(%s)$"]["access"!~"^(private|no)$"](%.6f,%.6f,%.6f,%.6f);'
        "(._;>;);out body;" % (HIGHWAYS_A_PIE, sur, oeste, norte, este)
    )


def _distancia_a_segmento_m(p, a, b):
    """Distancia aproximada (plano local) de p al segmento a-b, en metros."""
    lat_c = math.radians((a[0] + b[0]) / 2)
    kx = 111320.0 * math.cos(lat_c)
    ky = 111320.0
    ax, ay = a[1] * kx, a[0] * ky
    bx, by = b[1] * kx, b[0] * ky
    px, py = p[1] * kx, p[0] * ky
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def simplificar(puntos, tolerancia_m=TOLERANCIA_M):
    """Douglas-Peucker: quita los vértices que no cambian la forma más de `tolerancia_m`."""
    if len(puntos) <= 2:
        return list(puntos)
    a, b = puntos[0], puntos[-1]
    indice, mayor = 0, -1.0
    for i in range(1, len(puntos) - 1):
        d = _distancia_a_segmento_m(puntos[i], a, b)
        if d > mayor:
            indice, mayor = i, d
    if mayor > tolerancia_m:
        izquierda = simplificar(puntos[: indice + 1], tolerancia_m)
        derecha = simplificar(puntos[indice:], tolerancia_m)
        return izquierda[:-1] + derecha
    return [a, b]


def construir_grafo(elementos):
    """
    De los elementos de Overpass (nodos y vías) al grafo compacto.

    Nodo del grafo = extremo de vía o cruce (nodo usado por dos o más vías).
    Tramo = trozo de vía entre dos nodos del grafo, con su longitud en metros
    y la forma intermedia simplificada.
    """
    coords = {}
    vias = []
    for el in elementos:
        if el.get("type") == "node":
            coords[el["id"]] = (float(el["lat"]), float(el["lon"]))
        elif el.get("type") == "way":
            nodos = [n for n in el.get("nodes", []) if isinstance(n, int)]
            if len(nodos) >= 2:
                vias.append(nodos)

    usos = {}
    for nodos in vias:
        for n in nodos:
            usos[n] = usos.get(n, 0) + 1

    indice = {}
    puntos = []

    def id_de(n):
        if n not in indice:
            indice[n] = len(puntos)
            lat, lon = coords[n]
            puntos.append([round(lat, 6), round(lon, 6)])
        return indice[n]

    tramos = []
    for nodos in vias:
        nodos = [n for n in nodos if n in coords]
        if len(nodos) < 2:
            continue
        inicio = 0
        for i in range(1, len(nodos)):
            es_corte = i == len(nodos) - 1 or usos.get(nodos[i], 0) >= 2
            if not es_corte:
                continue
            trozo = [coords[n] for n in nodos[inicio : i + 1]]
            longitud = sum(metros_entre(trozo[k], trozo[k + 1]) for k in range(len(trozo) - 1))
            forma = simplificar(trozo)
            intermedios = [[round(p[0], 6), round(p[1], 6)] for p in forma[1:-1]]
            a = id_de(nodos[inicio])
            b = id_de(nodos[i])
            if a != b:
                tramos.append([a, b, round(longitud, 1), intermedios])
            inicio = i

    return {"nodos": puntos, "tramos": tramos}


def ruta_fichero(data_dir):
    return Path(data_dir) / FICHERO


def guardar(data_dir, grafo, bbox, margen_km):
    destino = ruta_fichero(data_dir)
    destino.parent.mkdir(parents=True, exist_ok=True)
    cuerpo = {
        "version": 1,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "bbox": [round(v, 5) for v in bbox],
        "margen_km": margen_km,
        "nodos": grafo["nodos"],
        "tramos": grafo["tramos"],
    }
    texto = json.dumps(cuerpo, separators=(",", ":"), ensure_ascii=False)
    destino.write_text(texto, encoding="utf-8")
    return estado(data_dir)


def estado(data_dir):
    """Lo que el panel enseña: si hay grafo, de cuándo, cuánto pesa, cuántos tramos."""
    fichero = ruta_fichero(data_dir)
    if not fichero.exists():
        return {"hay": False, "construccion": dict(construccion)}
    try:
        cuerpo = json.loads(fichero.read_text(encoding="utf-8"))
    except Exception:
        return {"hay": False, "error": "fichero ilegible", "construccion": dict(construccion)}
    return {
        "hay": True,
        "construccion": dict(construccion),
        "built_at": cuerpo.get("built_at", ""),
        "bbox": cuerpo.get("bbox"),
        "margen_km": cuerpo.get("margen_km"),
        "nodos": len(cuerpo.get("nodos", [])),
        "tramos": len(cuerpo.get("tramos", [])),
        "bytes": fichero.stat().st_size,
    }


async def _pedir_baldosa(cliente, bbox):
    """Una baldosa, probando los espejos en orden con pausa tras cada fallo. Lanza si fallan todos."""
    import asyncio

    consulta = consulta_overpass(bbox)
    ultimo = None
    for vuelta in range(2):
        for url in OVERPASS_ESPEJOS:
            try:
                respuesta = await cliente.post(
                    url,
                    data={"data": consulta},
                    headers={"User-Agent": "SagaEngine/1 (grafo de caminos para la ruta)"},
                )
                respuesta.raise_for_status()
                return respuesta.json().get("elements", [])
            except Exception as exc:  # 504, red, JSON roto: esperar y al siguiente
                ultimo = exc
                await asyncio.sleep(PAUSA_TRAS_FALLO_S * (vuelta + 1))
    raise RuntimeError("Overpass no responde en ningún espejo: %s" % ultimo)


async def descargar_y_construir(httpx_modulo, puntos, margen_km, data_dir):
    """
    Overpass → grafo → fichero. Devuelve el estado. Lanza si Overpass falla.

    Por baldosas: el servidor público devuelve 504 con zonas grandes de una
    vez. Se piden trozos de 15 km, se unen y se quitan los elementos
    repetidos (una vía que cruza dos baldosas viene en las dos).
    """
    import asyncio

    bbox = bbox_alrededor(puntos, margen_km)
    trozos = baldosas(bbox)
    construccion.update({"en_curso": True, "hechas": 0, "total": len(trozos), "error": "", "margen_km": margen_km})
    vistos = set()
    elementos = []
    try:
        async with httpx_modulo.AsyncClient(timeout=120.0) as cliente:
            for indice, trozo in enumerate(trozos):
                for el in await _pedir_baldosa(cliente, trozo):
                    clave = (el.get("type"), el.get("id"))
                    if clave in vistos:
                        continue
                    vistos.add(clave)
                    elementos.append(el)
                construccion["hechas"] = indice + 1
                if indice + 1 < len(trozos):
                    await asyncio.sleep(PAUSA_ENTRE_BALDOSAS_S)
        grafo = construir_grafo(elementos)
        if not grafo["tramos"]:
            raise ValueError("OpenStreetMap no devolvió caminos en esa zona")
        return guardar(data_dir, grafo, bbox, margen_km)
    except Exception as exc:
        construccion["error"] = str(exc)[:300]
        raise
    finally:
        construccion["en_curso"] = False

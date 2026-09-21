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
PAUSA_ENTRE_BALDOSAS_S = 2.0
PAUSA_TRAS_FALLO_S = 6.0
# Si una baldosa falla (zona densa: una ciudad entera en 25 km es demasiado
# para Overpass), se parte en cuatro y se vuelve a pedir. Hasta este lado
# mínimo; por debajo, el fallo ya no es de tamaño.
LADO_MINIMO_KM = 3.0

# Lo que está pasando ahora mismo, para que el panel lo enseñe: la
# construcción corre en segundo plano y el panel la consulta.
construccion = {"en_curso": False, "hechas": 0, "total": 0, "error": "", "margen_km": None, "fase": ""}

# El extracto de OpenStreetMap de la región, de Geofabrik: UN fichero, sin
# límites por IP ni servidores compartidos. Se baja una vez a data/osm/ y se
# reutiliza; se vuelve a bajar si tiene más de 60 días.
PBF_URL = "https://download.geofabrik.de/europe/spain/galicia-latest.osm.pbf"
PBF_NOMBRE = "galicia-latest.osm.pbf"
PBF_CADUCIDAD_DIAS = 60
VIAS_A_PIE = set(HIGHWAYS_A_PIE.split("|"))
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


def _lado_km(bbox):
    sur, oeste, norte, este = bbox
    return max((norte - sur) * 111.32, (este - oeste) * 111.32 * math.cos(math.radians((sur + norte) / 2)))


def _cuartos(bbox):
    sur, oeste, norte, este = bbox
    lat_m, lon_m = (sur + norte) / 2, (oeste + este) / 2
    return [(sur, oeste, lat_m, lon_m), (sur, lon_m, lat_m, este), (lat_m, oeste, norte, lon_m), (lat_m, lon_m, norte, este)]


async def _pedir_baldosa(cliente, bbox):
    """
    Una baldosa, probando los espejos en orden. Si todos fallan y la baldosa
    aún es grande, se parte en cuatro y se piden los cuartos: el 504 de
    Overpass casi siempre es "demasiado para una petición" (una ciudad
    entera dentro), no "no funciona". Lanza sólo si falla por debajo del
    lado mínimo.
    """
    import asyncio

    consulta = consulta_overpass(bbox)
    ultimo = None
    for url in OVERPASS_ESPEJOS:
        try:
            respuesta = await cliente.post(
                url,
                data={"data": consulta},
                headers={"User-Agent": "SagaEngine/1 (grafo de caminos para la ruta)"},
            )
            respuesta.raise_for_status()
            return respuesta.json().get("elements", [])
        except Exception as exc:  # 504, red, JSON roto: al siguiente espejo
            ultimo = exc
            await asyncio.sleep(PAUSA_TRAS_FALLO_S)
    if _lado_km(bbox) > LADO_MINIMO_KM:
        elementos = []
        for cuarto in _cuartos(bbox):
            elementos.extend(await _pedir_baldosa(cliente, cuarto))
            await asyncio.sleep(PAUSA_ENTRE_BALDOSAS_S)
        return elementos
    raise RuntimeError("Overpass no responde ni con baldosas de %.0f km: %s" % (_lado_km(bbox), ultimo))


def ruta_pbf(data_dir):
    return Path(data_dir) / "osm" / PBF_NOMBRE


async def asegurar_pbf(httpx_modulo, data_dir):
    """Deja el extracto en disco (bajándolo si falta o está viejo). Devuelve su ruta."""
    import asyncio

    destino = ruta_pbf(data_dir)
    if destino.exists() and time.time() - destino.stat().st_mtime < PBF_CADUCIDAD_DIAS * 86400:
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_suffix(".parcial")
    construccion["fase"] = "descargando el extracto de OpenStreetMap"
    async with httpx_modulo.AsyncClient(timeout=httpx_modulo.Timeout(60.0, read=600.0), follow_redirects=True) as cliente:
        async with cliente.stream("GET", PBF_URL, headers={"User-Agent": "SagaEngine/1"}) as respuesta:
            respuesta.raise_for_status()
            total = int(respuesta.headers.get("content-length") or 0)
            construccion["total"] = total
            bajado = 0
            with temporal.open("wb") as f:
                async for trozo in respuesta.aiter_bytes(1 << 20):
                    f.write(trozo)
                    bajado += len(trozo)
                    construccion["hechas"] = bajado
                    await asyncio.sleep(0)
    temporal.replace(destino)
    return destino


def elementos_desde_pbf(ruta, bbox):
    """
    Del extracto local a elementos con la forma de Overpass, sólo lo que cae
    en el rectángulo. Dos pasadas: nodos dentro del rectángulo (coordenadas)
    y vías transitables que toquen alguno de esos nodos.
    """
    import osmium

    sur, oeste, norte, este = bbox
    coords = {}
    construccion["fase"] = "leyendo nodos del extracto"
    for nodo in osmium.FileProcessor(str(ruta), osmium.osm.NODE):
        loc = nodo.location
        if not loc.valid():
            continue
        lat, lon = loc.lat, loc.lon
        if sur <= lat <= norte and oeste <= lon <= este:
            coords[nodo.id] = (lat, lon)

    elementos = [{"type": "node", "id": i, "lat": c[0], "lon": c[1]} for i, c in coords.items()]
    construccion["fase"] = "leyendo caminos del extracto"
    for via in osmium.FileProcessor(str(ruta), osmium.osm.WAY).with_filter(osmium.filter.KeyFilter("highway")):
        tipo = via.tags.get("highway", "")
        if tipo not in VIAS_A_PIE:
            continue
        if via.tags.get("access", "") in ("private", "no"):
            continue
        ids = [n.ref for n in via.nodes]
        if not any(i in coords for i in ids):
            continue
        elementos.append({"type": "way", "id": via.id, "nodes": ids, "tags": {"highway": tipo}})
    return elementos


async def descargar_y_construir(httpx_modulo, puntos, margen_km, data_dir):
    """
    Extracto de Geofabrik → grafo → fichero. Overpass sólo si el extracto
    falla. Devuelve el estado; deja el error en `construccion`.

    Overpass es un servicio público y compartido: con zonas grandes
    devolvía 504, y tras varias peticiones pesadas bloqueó la IP (406 hasta
    a su página de estado). Un fichero de Geofabrik se baja una vez y se
    lee en local, sin límites.
    """
    import asyncio

    bbox = bbox_alrededor(puntos, margen_km)
    construccion.update({"en_curso": True, "hechas": 0, "total": 0, "error": "", "margen_km": margen_km, "fase": "preparando"})
    try:
        try:
            pbf = await asegurar_pbf(httpx_modulo, data_dir)
            elementos = await asyncio.to_thread(elementos_desde_pbf, pbf, bbox)
        except Exception as exc:  # sin Geofabrik o sin osmium: Overpass de reserva
            construccion["fase"] = "extracto no disponible (%s); probando Overpass" % str(exc)[:80]
            elementos = await _elementos_desde_overpass(httpx_modulo, bbox)
        construccion["fase"] = "construyendo el grafo"
        grafo = await asyncio.to_thread(construir_grafo, elementos)
        if not grafo["tramos"]:
            raise ValueError("no hay caminos en esa zona")
        construccion["fase"] = "guardando"
        return guardar(data_dir, grafo, bbox, margen_km)
    except Exception as exc:
        construccion["error"] = str(exc)[:300]
        raise
    finally:
        construccion["en_curso"] = False
        construccion["fase"] = ""


async def _elementos_desde_overpass(httpx_modulo, bbox):
    """
    Overpass por baldosas, de reserva.

    Se piden trozos de 25 km (partidos en cuatro si fallan), se unen y se
    quitan los elementos repetidos (una vía que cruza dos baldosas viene en
    las dos).
    """
    import asyncio

    trozos = baldosas(bbox)
    construccion.update({"hechas": 0, "total": len(trozos)})
    vistos = set()
    elementos = []
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
    return elementos

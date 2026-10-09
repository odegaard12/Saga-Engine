"""Proxy de teselas: qué zona se sirve, cuánto se guarda y cómo se escribe.

Las rutas `/map-tiles`, `/dem-tiles` y `/api/teselas/lote` son PÚBLICAS (el
service worker y un `<img>` no pueden llevar credenciales de otro tipo), hacían
una petición a Esri/AWS por cada tesela que no tenían y la guardaban sin límite.
Cualquiera podía pedir teselas de medio planeta y llenar el disco de la
Raspberry; con el disco lleno `save_json` traga el error y SQLite da «disk is
full»: el progreso y las sospechas se perdían sin avisar (caza de fallos S4).

Tres defensas, todas aquí:

1. **Zona.** Sólo se sirve lo que cae dentro de la caja de la misión (nodos,
   trazado y centro del mapa) más un margen que depende del zoom: el mismo que
   usa el paquete offline del móvil (continente/país/región a zoom bajo, unos
   kilómetros a zoom alto). Fuera de ahí, 404.
2. **Tope de disco.** La caché se poda por antigüedad de uso cuando pasa de su
   límite (`SAGA_TILE_CACHE_MAX_MB`, `SAGA_DEM_CACHE_MAX_MB`).
3. **Escritura atómica.** `.tmp` + `os.replace`, primero el tipo y después los
   bytes: una tesela a medias ya no se sirve para siempre.
"""
from __future__ import annotations

import math
import os
import threading
import time
from pathlib import Path
from typing import Any

#: Hasta qué distancia de la caja de la misión se sirve cada zoom (km). Copia de
#: `NIVELES` de frontend/src/player/offline/mapTileCache.ts: es lo que el móvil
#: puede pedir legítimamente al preparar el mapa.
MARGEN_KM_POR_ZOOM = {
    3: 3000.0,
    4: 3000.0,
    5: 2000.0,
    6: 1000.0,
    7: 700.0,
    8: 400.0,
    9: 260.0,
    10: 180.0,
    11: 110.0,
    12: 60.0,
}
#: Zoom medio (13-15): el paquete baja 30 km alrededor; zoom alto (16+): el
#: corredor de la ruta y el detalle de los nodos.
MARGEN_KM_ZOOM_MEDIO = 30.0
MARGEN_KM_ZOOM_ALTO = 10.0
#: Hasta este zoom (incluido) las teselas del mundo entero son pocas y se
#: sirven siempre: 1 + 4 + 16 = 21.
ZOOM_LIBRE = 2

_KM_POR_GRADO = 111.32

_CERROJO = threading.Lock()
_AREA_EN_MEMORIA: dict[str, Any] = {}
_TTL_DEL_AREA_S = 30.0


def margen_km(zoom: int) -> float:
    if zoom in MARGEN_KM_POR_ZOOM:
        return MARGEN_KM_POR_ZOOM[zoom]
    if zoom < 3:
        return 20000.0
    return MARGEN_KM_ZOOM_MEDIO if zoom <= 15 else MARGEN_KM_ZOOM_ALTO


def _numero(valor: Any):
    try:
        numero = float(valor)
    except (TypeError, ValueError, OverflowError):
        return None
    return numero if math.isfinite(numero) else None


def _puntos_de(pista: Any):
    for punto in pista if isinstance(pista, list) else []:
        if isinstance(punto, (list, tuple)) and len(punto) >= 2:
            lat, lon = _numero(punto[0]), _numero(punto[1])
        elif isinstance(punto, dict):
            lat, lon = _numero(punto.get("lat")), _numero(punto.get("lon", punto.get("lng")))
        else:
            continue
        if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
            yield lat, lon


def caja_de_los_puntos(nodos_crudos: list, cfg: dict | None) -> tuple[float, float, float, float] | None:
    """(lat_min, lat_max, lon_min, lon_max) de la misión, o None si no hay nada.

    Nodos (`lat`/`lon`) y su trazado (`route_track`, `route_via`). El centro del
    mapa de la configuración sólo cuenta si no hay nada más: suele quedarse en el
    valor de serie (Madrid) y estiraba la zona de Catoira a media España.
    """
    puntos: list[tuple[float, float]] = []

    for nodo in nodos_crudos if isinstance(nodos_crudos, list) else []:
        if not isinstance(nodo, dict):
            continue
        lat, lon = _numero(nodo.get("lat")), _numero(nodo.get("lon"))
        if lat is None or lon is None:
            ubicacion = nodo.get("location") if isinstance(nodo.get("location"), dict) else {}
            lat, lon = _numero(ubicacion.get("lat")), _numero(ubicacion.get("lon"))
        if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
            puntos.append((lat, lon))
        puntos.extend(_puntos_de(nodo.get("route_track")))
        puntos.extend(_puntos_de(nodo.get("route_via")))

    if not puntos:
        centro = (cfg or {}).get("map_center")
        puntos.extend(_puntos_de([centro] if isinstance(centro, (list, tuple)) else []))

    if not puntos:
        return None

    latitudes = [p[0] for p in puntos]
    longitudes = [p[1] for p in puntos]
    return min(latitudes), max(latitudes), min(longitudes), max(longitudes)


def caja_de_la_mision() -> tuple[float, float, float, float] | None:
    """La caja de la misión actual, con una copia en memoria.

    Se recalcula cuando cambia la firma de los nodos guardados
    (`runtime_store.stages_signature`, también si el fichero llega por rsync); el
    centro del mapa de la configuración se relee, como mucho, cada 30 s.
    """
    import main

    from backend.app.storage import runtime_store

    clave = (main.STAGES_DB, os.getenv("SAGA_SQLITE_DB") or "", runtime_store.stages_signature(main.STAGES_DB))
    ahora = time.monotonic()
    with _CERROJO:
        guardada = _AREA_EN_MEMORIA.get("v")
        if guardada and guardada[0] == clave and ahora - guardada[1] < _TTL_DEL_AREA_S:
            return guardada[2]

    caja = caja_de_los_puntos(runtime_store.load_stages(main.STAGES_DB), main.load_config())
    with _CERROJO:
        _AREA_EN_MEMORIA["v"] = (clave, ahora, caja)
    return caja


def olvidar_area() -> None:
    with _CERROJO:
        _AREA_EN_MEMORIA.clear()


def limites_de_tesela(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """(lat_min, lat_max, lon_min, lon_max) de una tesela XYZ de Web Mercator."""
    n = 2 ** z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lat_min, lat_max, lon_min, lon_max


def tesela_de(lat: float, lon: float, z: int) -> tuple[int, int]:
    """La tesela XYZ que contiene el punto (para las pruebas y el cliente)."""
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


#: Ortofoto PNOA (IGN / Xunta, CC BY 4.0): admite guardar las teselas en el móvil,
#: cosa que el World Imagery gratuito de Esri no permite. Sólo cubre España.
URL_PNOA = (
    "https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0"
    "&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg"
    "&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}"
)
URL_ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
#: 5.54: apagada, Esri en todo el mapa como en 5.51.1. Medido en WebKit (r20, perfil de
#: iPhone): a z18-z19, donde se juega, la PNOA de la zona de pruebas sale más blanda y
#: lavada que Esri (varianza del laplaciano 45/41 contra 66/53) y el dueño la veía
#: «borrosa, otro mapa» en el iPhone. Ponerla a True vuelve a la PNOA de 5.52 (y hay
#: que cambiar el nombre de la caché de teselas del móvil para que la baje).
PNOA_EN_EL_MAPA = False
#: Por debajo de este zoom, Esri: la PNOA generalizada de zoom bajo deja en negro
#: todo lo que no es España (el mar abierto, Portugal, Francia).
ZOOM_MINIMO_PNOA = 11
#: (lat_min, lat_max, lon_min, lon_max): península con Baleares, y Canarias.
_ESPANA = ((35.8, 43.9, -9.5, 4.4), (27.5, 29.5, -18.3, -13.3))


def origen_satelite(z: int, x: int, y: int) -> str:
    """'pnoa' dentro de España a partir de z11 (si `PNOA_EN_EL_MAPA`); 'esri' si no, a zoom bajo o fuera."""
    if not PNOA_EN_EL_MAPA or z < ZOOM_MINIMO_PNOA:
        return "esri"
    t_lat_min, t_lat_max, t_lon_min, t_lon_max = limites_de_tesela(z, x, y)
    for lat_min, lat_max, lon_min, lon_max in _ESPANA:
        if t_lat_min >= lat_min and t_lat_max <= lat_max and t_lon_min >= lon_min and t_lon_max <= lon_max:
            return "pnoa"
    return "esri"


def url_satelite(origen: str, z: int, x: int, y: int) -> str:
    return (URL_PNOA if origen == "pnoa" else URL_ESRI).format(z=z, x=x, y=y)


def carpeta_satelite(origen: str) -> str:
    """Cada origen en su carpeta: una tesela de Esri no se sirve nunca como PNOA."""
    return "tile_cache_pnoa" if origen == "pnoa" else "tile_cache"


def tesela_permitida(z: int, x: int, y: int, caja: tuple[float, float, float, float] | None = None) -> bool:
    """¿Esta tesela cae en la zona de la misión (más su margen de este zoom)?"""
    if z < 0 or x < 0 or y < 0:
        return False
    n = 2 ** z
    if x >= n or y >= n:
        return False
    if z <= ZOOM_LIBRE:
        return True

    caja = caja if caja is not None else caja_de_la_mision()
    if caja is None:
        return False

    lat_min, lat_max, lon_min, lon_max = caja
    km = margen_km(z)
    d_lat = km / _KM_POR_GRADO
    lat_extrema = min(89.0, max(abs(lat_min), abs(lat_max)) + d_lat)
    d_lon = km / (_KM_POR_GRADO * max(0.05, math.cos(math.radians(lat_extrema))))

    t_lat_min, t_lat_max, t_lon_min, t_lon_max = limites_de_tesela(z, x, y)
    if t_lat_max < lat_min - d_lat or t_lat_min > lat_max + d_lat:
        return False
    if d_lon >= 180.0:
        return True
    return not (t_lon_max < lon_min - d_lon or t_lon_min > lon_max + d_lon)


# ---------------------------------------------------------------------------
# Caché en disco: lectura, escritura atómica y poda
# ---------------------------------------------------------------------------

def _limite_en_bytes(variable: str, por_defecto_mb: int) -> int:
    try:
        mb = int(os.getenv(variable) or por_defecto_mb)
    except ValueError:
        mb = por_defecto_mb
    return max(16, mb) * 1024 * 1024


def limite_cache_mapa() -> int:
    return _limite_en_bytes("SAGA_TILE_CACHE_MAX_MB", 2048)


def limite_cache_relieve() -> int:
    return _limite_en_bytes("SAGA_DEM_CACHE_MAX_MB", 256)


#: Se toca la fecha de uso de una tesela servida si tiene más de esto, para que la
#: poda tire lo que hace tiempo que nadie pide (LRU aproximado, sin una escritura
#: de metadatos por cada tesela servida).
_RENOVAR_USO_TRAS_S = 3600.0


def leer_de_cache(ruta_binario: Path, ruta_tipo: Path, tipo_defecto: str):
    """(bytes, tipo) de la caché, o None si no hay, está vacía o no se puede leer."""
    try:
        if not ruta_binario.exists():
            return None
        contenido = ruta_binario.read_bytes()
        if not contenido:
            return None  # una tesela vacía de una escritura vieja a medias: se vuelve a pedir
        tipo = ruta_tipo.read_text(encoding="utf-8").strip() if ruta_tipo.exists() else ""
        try:
            if time.time() - ruta_binario.stat().st_mtime > _RENOVAR_USO_TRAS_S:
                os.utime(ruta_binario, None)
        except OSError:
            pass
        return contenido, tipo or tipo_defecto
    except OSError:
        return None


#: 5.55: apagado, relieve Terrarium como en 5.51.1. Con el MDT05 del IGN (5.52-5.54) el dueño
#: veía en su iPhone el fondo del mapa borroso aunque el jugador saliera bien; con 5.51.1
#: (Terrarium, sin casas) se veía nítido. Ponerlo a True vuelve a servir `data/dem_ign`.
RELIEVE_IGN_EN_EL_MAPA = False


def leer_relieve_propio(ruta: Path) -> bytes | None:
    """Los bytes de una tesela de `data/dem_ign`, o None si no está, está vacía o el relieve propio está apagado."""
    if not RELIEVE_IGN_EN_EL_MAPA:
        return None
    try:
        contenido = ruta.read_bytes()
    except OSError:
        return None
    return contenido or None


def _escribir_atomico(destino: Path, datos: bytes) -> None:
    temporal = destino.with_name(f"{destino.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    try:
        temporal.write_bytes(datos)
        os.replace(temporal, destino)
    finally:
        try:
            if temporal.exists():
                temporal.unlink()
        except OSError:
            pass


_ESCRITO_DESDE_LA_PODA: dict[str, int] = {}


def guardar_en_cache(ruta_binario: Path, ruta_tipo: Path, contenido: bytes, tipo: str, limite_bytes: int) -> bool:
    """Guarda una tesela de forma atómica; poda la caché si se pasa del límite.

    Primero el tipo y después los bytes: la tesela «existe» cuando existe el
    `.bin`, y para entonces su `.ct` ya está completo. Devuelve False si no se
    pudo (disco lleno, permisos): la tesela se sirve igual, sólo no queda cacheada.
    """
    try:
        ruta_binario.parent.mkdir(parents=True, exist_ok=True)
        _escribir_atomico(ruta_tipo, (tipo or "").encode("utf-8"))
        _escribir_atomico(ruta_binario, contenido)
    except OSError:
        return False

    raiz = _raiz_de_cache(ruta_binario)
    with _CERROJO:
        acumulado = _ESCRITO_DESDE_LA_PODA.get(str(raiz), 0) + len(contenido)
        toca_podar = acumulado > max(4 * 1024 * 1024, limite_bytes // 20)
        _ESCRITO_DESDE_LA_PODA[str(raiz)] = 0 if toca_podar else acumulado
    if toca_podar:
        podar_cache(raiz, limite_bytes)
    return True


def _raiz_de_cache(ruta_binario: Path) -> Path:
    """`data/tile_cache` o `data/dem_cache`: la carpeta z/x/y.bin cuelga de ahí."""
    return ruta_binario.parent.parent.parent


def podar_cache(raiz: Path, limite_bytes: int) -> int:
    """Borra las teselas menos usadas hasta dejar la caché en el 85 % del límite.

    Devuelve cuántos bytes liberó. Cuenta `.bin` + `.ct`; se ordena por la fecha
    de uso más reciente (ver `leer_de_cache`).
    """
    ficheros: list[tuple[float, int, str]] = []
    total = 0
    try:
        for carpeta, _, nombres in os.walk(raiz):
            for nombre in nombres:
                ruta = os.path.join(carpeta, nombre)
                try:
                    estado = os.stat(ruta)
                except OSError:
                    continue
                total += estado.st_size
                if nombre.endswith(".bin"):
                    ficheros.append((max(estado.st_mtime, estado.st_atime), estado.st_size, ruta))
    except OSError:
        return 0

    if total <= limite_bytes:
        return 0

    objetivo = int(limite_bytes * 0.85)
    liberado = 0
    for _, tamano, ruta in sorted(ficheros):
        if total - liberado <= objetivo:
            break
        try:
            os.unlink(ruta)
            liberado += tamano
            tipo = ruta[:-4] + ".ct"
            if os.path.exists(tipo):
                liberado += os.path.getsize(tipo)
                os.unlink(tipo)
        except OSError:
            continue
    return liberado

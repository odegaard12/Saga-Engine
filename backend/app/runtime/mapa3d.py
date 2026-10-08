"""El mapa 3D de la zona de la misión: relieve del IGN y edificios del Catastro.

Se prepara UNA vez por misión desde el panel (Ajustes → «Preparar mapa 3D de la
zona») o por línea de comandos, y deja en `data/`:

- `dem_ign/{z}/{x}/{y}.png`: teselas terrain-RGB (codificación Terrarium) de z11
  a z15. z11-z13 salen del MDT25 y z14-z15 del MDT05 del IGN (CC BY 4.0), con la
  altura redondeada a 1/8 m (pesan la mitad y no se nota). `/dem-tiles` las sirve
  antes que Terrarium.
- `edificios.geojson`: las partes de edificio del Catastro (INSPIRE, descarga
  ATOM por municipio) dentro de la caja de la misión, con la altura ya calculada
  (plantas × 3 m + 0,6). `/api/edificios` lo sirve recortado y comprimido.
- `mapa3d.json`: qué se preparó, cuándo y para qué caja.

El WCS del IGN tarda 17-28 s por petición sea cual sea su tamaño: por eso se
pregenera y nunca se pide al vuelo. Peticiones en trozos, con pausa entre ellas
y reintentos espaciados: es un servicio público.

Sin numpy (como el prototipo): Python puro y Pillow, que ya estaba. El cálculo va
en un PROCESO aparte (`python -m backend.app.runtime.mapa3d`), así que no frena
al servidor aunque tarde unos minutos en la Raspberry.

Uso por línea de comandos (en la Pi, dentro del contenedor):

    python -m backend.app.runtime.mapa3d                 # caja de la misión guardada
    python -m backend.app.runtime.mapa3d --caja 42.64,42.69,-8.76,-8.68
    python -m backend.app.runtime.mapa3d --solo relieve  # o --solo edificios
"""
from __future__ import annotations

import argparse
import gzip
import io
import json
import math
import os
import re
import shutil
import sys
import threading
import time
import zipfile
from array import array
from pathlib import Path
from typing import Any, Callable

Caja = tuple[float, float, float, float]  # (lat_min, lat_max, lon_min, lon_max)

URL_WCS_MDT = "https://servicios.idee.es/wcs-inspire/mdt"
COBERTURA_MDT05 = "Elevacion4258_5"
COBERTURA_MDT25 = "Elevacion4258_25"
URL_ATOM_CATASTRO = "https://www.catastro.hacienda.gob.es/INSPIRE/buildings/ES.SDGC.BU.atom.xml"
CABECERAS = {"User-Agent": "SagaEngine/1 (mapa 3D de una ruta; peticiones espaciadas)"}

#: Zooms del relieve propio y de qué modelo sale cada uno.
ZOOMS_MDT25 = (11, 12, 13)
ZOOMS_MDT05 = (14, 15)
#: Margen alrededor de la caja de la misión (km) para cada modelo.
MARGEN_MDT05_KM = 1.5
MARGEN_MDT25_KM = 1.0
#: Margen de los edificios alrededor de la caja (km).
MARGEN_EDIFICIOS_KM = 1.0
#: Trozo máximo por petición WCS, en grados: ~1100×1100 celdas del MDT05.
TROZO_GRADOS = {COBERTURA_MDT05: 0.05, COBERTURA_MDT25: 0.2}
PAUSA_ENTRE_PETICIONES_S = 2.0
REINTENTOS = (5.0, 15.0, 40.0)
MAX_MUNICIPIOS = 8
#: Plantas → metros. Un bajo de casa gallega ronda los 3 m; el 0,6 es el tejado.
METROS_POR_PLANTA = 3.0
METROS_DE_TEJADO = 0.6

FICHERO_EDIFICIOS = "edificios.geojson"
FICHERO_ESTADO = "mapa3d.json"
FICHERO_PROGRESO = "mapa3d.progreso.json"
CARPETA_RELIEVE = "dem_ign"


# ---------------------------------------------------------------------------
# Geometría de teselas
# ---------------------------------------------------------------------------

def tesela_de(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def limites_de_tesela(z: int, x: int, y: int) -> Caja:
    n = 2 ** z
    lat = lambda yy: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))  # noqa: E731
    return lat(y + 1), lat(y), x / n * 360.0 - 180.0, (x + 1) / n * 360.0 - 180.0


def ampliar(caja: Caja, km: float) -> Caja:
    lat_min, lat_max, lon_min, lon_max = caja
    d_lat = km / 111.32
    d_lon = km / (111.32 * max(0.05, math.cos(math.radians((lat_min + lat_max) / 2))))
    return lat_min - d_lat, lat_max + d_lat, lon_min - d_lon, lon_max + d_lon


def teselas_de_la_caja(caja: Caja, z: int) -> list[tuple[int, int]]:
    lat_min, lat_max, lon_min, lon_max = caja
    x0, y0 = tesela_de(lat_max, lon_min, z)
    x1, y1 = tesela_de(lat_min, lon_max, z)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def plan_de_relieve(caja: Caja) -> dict[str, Any]:
    """Qué teselas se generan y qué trozos de cada modelo hace falta pedir.

    Se piden BLOQUES alineados a las teselas del zoom más bajo de cada modelo
    (k×k teselas, lo que quepa en `TROZO_GRADOS`): así cada tesela generada cae
    entera dentro de un solo bloque de datos del IGN -sin bordes con ceros- y se
    muestrea de una sola rejilla, que es lo que hace rápido el cálculo.
    """
    plan: dict[str, Any] = {"teselas": [], "zonas": {}, "bloques": []}
    for cobertura, zooms, margen in (
        (COBERTURA_MDT25, ZOOMS_MDT25, MARGEN_MDT25_KM),
        (COBERTURA_MDT05, ZOOMS_MDT05, MARGEN_MDT05_KM),
    ):
        base = zooms[0]
        raiz = teselas_de_la_caja(ampliar(caja, margen), base)
        lims = [limites_de_tesela(base, x, y) for x, y in raiz]
        plan["zonas"][cobertura] = (
            min(l[0] for l in lims),
            max(l[1] for l in lims),
            min(l[2] for l in lims),
            max(l[3] for l in lims),
        )
        ancho = 360.0 / 2**base
        k = max(1, int(TROZO_GRADOS[cobertura] / ancho))
        grupos: dict[tuple[int, int], list[tuple[int, int]]] = {}
        for x, y in raiz:
            grupos.setdefault((x // k, y // k), []).append((x, y))
        for miembros in grupos.values():
            lb = [limites_de_tesela(base, x, y) for x, y in miembros]
            teselas = []
            for z in zooms:
                f = 2 ** (z - base)
                for x, y in miembros:
                    for dx in range(f):
                        for dy in range(f):
                            teselas.append((z, x * f + dx, y * f + dy))
            plan["bloques"].append({
                "cobertura": cobertura,
                "caja": (min(l[0] for l in lb), max(l[1] for l in lb), min(l[2] for l in lb), max(l[3] for l in lb)),
                "teselas": teselas,
            })
            plan["teselas"].extend((cobertura, *t) for t in teselas)
    return plan


# ---------------------------------------------------------------------------
# El MDT del IGN por WCS
# ---------------------------------------------------------------------------

class Rejilla:
    """Un trozo del MDT en lat/lon (EPSG:4258 ≈ WGS84 a esta escala)."""

    def __init__(self, ncols: int, nrows: int, xll: float, yll: float, celda: float, datos: array, celda_y: float | None = None):
        self.ncols, self.nrows = ncols, nrows
        # `celda` es el paso en longitud; `celda_y` en latitud (las rejillas con dx/dy no son cuadradas).
        self.xll, self.yll, self.celda = xll, yll, celda
        self.celda_y = celda_y if celda_y else celda
        self.ytop = yll + nrows * self.celda_y
        self.datos = datos

    def contiene(self, lon: float, lat: float) -> bool:
        return self.xll <= lon <= self.xll + self.ncols * self.celda and self.yll <= lat <= self.ytop


def leer_asc(contenido: bytes, sin_dato: float = -9999.0) -> Rejilla:
    """Una rejilla ESRI ASCII (también dentro de la respuesta multiparte del WCS)."""
    texto = contenido.decode("latin-1")
    inicio = texto.find("ncols")
    if inicio < 0:
        raise ValueError("el WCS no devolvió una rejilla: %s" % texto[:200].replace("\n", " "))
    texto = texto[inicio:]
    fin = texto.find("--wcs")
    if fin > 0:
        texto = texto[:fin]
    lineas = texto.split("\n")
    cabecera: dict[str, float] = {}
    n = 0
    for linea in lineas[:7]:
        partes = linea.split()
        if len(partes) == 2 and partes[0].lower() in (
            "ncols", "nrows", "xllcorner", "yllcorner", "xllcenter", "yllcenter", "cellsize", "dx", "dy", "nodata_value"
        ):
            cabecera[partes[0].lower()] = float(partes[1])
            n += 1
        else:
            break
    ncols, nrows = int(cabecera["ncols"]), int(cabecera["nrows"])
    nodata = cabecera.get("nodata_value", sin_dato)
    valores = array("f", (0.0 if (v := float(t)) == nodata or v < -1000 else max(0.0, v) for t in " ".join(lineas[n:]).split()))
    if len(valores) < ncols * nrows:
        raise ValueError("rejilla incompleta: %d de %d valores" % (len(valores), ncols * nrows))
    del valores[ncols * nrows :]
    # El WCS del IGN puede devolver `dx`/`dy` (celdas no cuadradas en grados) en vez de `cellsize`,
    # y la esquina como centro de celda (`xllcenter`) en vez de borde.
    dx = cabecera.get("cellsize", cabecera.get("dx"))
    dy = cabecera.get("cellsize", cabecera.get("dy", dx))
    if dx is None or dy is None:
        raise ValueError("la rejilla no trae cellsize ni dx/dy")
    xll = cabecera["xllcorner"] if "xllcorner" in cabecera else cabecera["xllcenter"] - dx / 2
    yll = cabecera["yllcorner"] if "yllcorner" in cabecera else cabecera["yllcenter"] - dy / 2
    return Rejilla(ncols, nrows, xll, yll, dx, valores, celda_y=dy)


def url_wcs(cobertura: str, trozo: Caja) -> str:
    lat_min, lat_max, lon_min, lon_max = trozo
    # Una celda de más por cada lado: el muestreo bilineal del borde de una
    # tesela necesita la celda vecina.
    m = 0.0003
    return (
        "%s?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=%s"
        "&SUBSET=Lat(%.6f,%.6f)&SUBSET=Long(%.6f,%.6f)&FORMAT=application/asc"
        % (URL_WCS_MDT, cobertura, lat_min - m, lat_max + m, lon_min - m, lon_max + m)
    )


def pedir_con_reintentos(cliente, url: str, avisar: Callable[[str], None], espera=time.sleep) -> bytes:
    ultimo: Exception | None = None
    for intento, pausa in enumerate((0.0, *REINTENTOS)):
        if pausa:
            avisar("reintento %d dentro de %.0f s (%s)" % (intento, pausa, str(ultimo)[:80]))
            espera(pausa)
        try:
            respuesta = cliente.get(url, headers=CABECERAS)
            if respuesta.status_code == 200 and respuesta.content:
                return respuesta.content
            ultimo = RuntimeError("HTTP %s" % respuesta.status_code)
        except Exception as exc:  # red, tiempo agotado
            ultimo = exc
    raise RuntimeError("el servicio no responde: %s" % ultimo)


def altura_en(r: Rejilla, lon: float, lat: float) -> float:
    """Altura bilineal en un punto (0 fuera de la rejilla)."""
    if not r.contiene(lon, lat):
        return 0.0
    c = min(max((lon - r.xll) / r.celda - 0.5, 0.0), r.ncols - 1.001)
    f = min(max((r.ytop - lat) / r.celda_y - 0.5, 0.0), r.nrows - 1.001)
    c0, f0 = int(c), int(f)
    fc, ff = c - c0, f - f0
    d, n = r.datos, r.ncols
    i = f0 * n + c0
    return (d[i] * (1 - fc) + d[i + 1] * fc) * (1 - ff) + (d[i + n] * (1 - fc) + d[i + n + 1] * fc) * ff


def codificar_terrarium(alturas: list[float]) -> bytes:
    """RGB Terrarium con la altura redondeada a 1/8 m: (R*256 + G + B/256) - 32768."""
    salida = bytearray(len(alturas) * 3)
    for i, h in enumerate(alturas):
        octavos = int(max(0.0, h) * 8.0 + 0.5) + 32768 * 8
        salida[3 * i] = octavos >> 11
        salida[3 * i + 1] = (octavos >> 3) & 255
        salida[3 * i + 2] = (octavos & 7) << 5
    return bytes(salida)


def decodificar_terrarium(rgb: bytes) -> list[float]:
    return [rgb[i] * 256 + rgb[i + 1] + rgb[i + 2] / 256 - 32768 for i in range(0, len(rgb), 3)]


def generar_tesela(r: Rejilla, z: int, x: int, y: int) -> bytes:
    """PNG terrain-RGB de 256 px de una tesela, que cae entera dentro de la rejilla.

    Las columnas y filas de la rejilla se calculan una vez por tesela, no por
    píxel: es Python puro y en la Raspberry eso es la diferencia entre segundos y
    minutos.
    """
    from PIL import Image

    n = 2 ** z
    lon0 = x / n * 360.0 - 180.0
    paso_lon = 360.0 / n / 256.0
    maxc, maxf = r.ncols - 1.001, r.nrows - 1.001
    columnas = []
    for i in range(256):
        c = min(max((lon0 + (i + 0.5) * paso_lon - r.xll) / r.celda - 0.5, 0.0), maxc)
        c0 = int(c)
        columnas.append((c0, c - c0))
    d, nc = r.datos, r.ncols
    salida = bytearray(256 * 256 * 3)
    o = 0
    for fila in range(256):
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + (fila + 0.5) / 256.0) / n))))
        f = min(max((r.ytop - lat) / r.celda_y - 0.5, 0.0), maxf)
        f0 = int(f)
        ff = f - f0
        gf = 1.0 - ff
        a0 = f0 * nc
        a1 = a0 + nc
        for c0, fc in columnas:
            gc = 1.0 - fc
            h = (d[a0 + c0] * gc + d[a0 + c0 + 1] * fc) * gf + (d[a1 + c0] * gc + d[a1 + c0 + 1] * fc) * ff
            octavos = int(h * 8.0 + 0.5) + 262144  # (h + 32768) en octavos de metro; h >= 0
            salida[o] = octavos >> 11
            salida[o + 1] = (octavos >> 3) & 255
            salida[o + 2] = (octavos & 7) << 5
            o += 3
    imagen = Image.frombytes("RGB", (256, 256), bytes(salida))
    buffer = io.BytesIO()
    imagen.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def preparar_relieve(cliente, caja: Caja, data_dir: Path, progreso: Callable[..., None], espera=time.sleep) -> dict:
    """Pide cada bloque al WCS, genera sus teselas y lo suelta (poca memoria en la Pi)."""
    plan = plan_de_relieve(caja)
    bloques = plan["bloques"]
    destino = Path(data_dir) / (CARPETA_RELIEVE + ".nuevo")
    shutil.rmtree(destino, ignore_errors=True)
    total = len(plan["teselas"])
    hechas = 0
    peso = 0
    for i, bloque in enumerate(bloques):
        progreso(fase="relieve del IGN: bloque %d de %d (~25 s cada uno)" % (i + 1, len(bloques)), hechas=hechas, total=total)
        contenido = pedir_con_reintentos(cliente, url_wcs(bloque["cobertura"], bloque["caja"]), lambda t: progreso(fase=t), espera)
        rejilla = leer_asc(contenido)
        del contenido
        for z, x, y in bloque["teselas"]:
            png = generar_tesela(rejilla, z, x, y)
            ruta = destino / str(z) / str(x) / ("%d.png" % y)
            ruta.parent.mkdir(parents=True, exist_ok=True)
            ruta.write_bytes(png)
            peso += len(png)
            hechas += 1
        del rejilla
        if i < len(bloques) - 1:
            espera(PAUSA_ENTRE_PETICIONES_S)

    final = Path(data_dir) / CARPETA_RELIEVE
    viejo = Path(data_dir) / (CARPETA_RELIEVE + ".viejo")
    shutil.rmtree(viejo, ignore_errors=True)
    if final.exists():
        final.rename(viejo)
    destino.rename(final)
    shutil.rmtree(viejo, ignore_errors=True)
    return {"teselas": total, "bytes": peso, "zonas": {k: [round(v, 5) for v in z] for k, z in plan["zonas"].items()}}


# ---------------------------------------------------------------------------
# Edificios del Catastro (INSPIRE, ATOM por municipio)
# ---------------------------------------------------------------------------

def _cajas_georss(texto: str) -> Caja | None:
    numeros = [float(v) for v in texto.split()]
    if len(numeros) < 4:
        return None
    lats, lons = numeros[0::2], numeros[1::2]
    return min(lats), max(lats), min(lons), max(lons)


def _se_tocan(a: Caja, b: Caja) -> bool:
    return not (a[1] < b[0] or a[0] > b[1] or a[3] < b[2] or a[2] > b[3])


def entradas_atom(xml: str) -> list[dict[str, Any]]:
    """(título, enlace, caja) de cada entrada de un feed ATOM del Catastro."""
    entradas = []
    for bloque in xml.split("<entry>")[1:]:
        titulo = re.search(r"<title[^>]*>([^<]*)</title>", bloque)
        enlace = re.search(r'<link[^>]*rel="enclosure"[^>]*href="([^"]+)"', bloque)
        poligono = re.search(r"<georss:polygon>([^<]+)</georss:polygon>", bloque)
        if not (titulo and enlace and poligono):
            continue
        caja = _cajas_georss(poligono.group(1))
        if caja:
            entradas.append({"titulo": titulo.group(1).strip(), "url": enlace.group(1).strip(), "caja": caja})
    return entradas


def municipios_de_la_caja(cliente, caja: Caja, avisar: Callable[[str], None]) -> list[dict[str, Any]]:
    """Los municipios cuya caja toca la de la misión: feed general → provincia → municipio."""
    general = pedir_con_reintentos(cliente, URL_ATOM_CATASTRO, avisar).decode("utf-8", "replace")
    municipios: list[dict[str, Any]] = []
    for provincia in entradas_atom(general):
        if not _se_tocan(provincia["caja"], caja):
            continue
        xml = pedir_con_reintentos(cliente, provincia["url"].replace("http://", "https://"), avisar).decode("utf-8", "replace")
        for municipio in entradas_atom(xml):
            if municipio["url"].endswith(".zip") and _se_tocan(municipio["caja"], caja):
                municipios.append(municipio)
    # Los más cercanos al centro primero, por si hay que cortar.
    centro = ((caja[0] + caja[1]) / 2, (caja[2] + caja[3]) / 2)
    municipios.sort(key=lambda m: abs((m["caja"][0] + m["caja"][1]) / 2 - centro[0]) + abs((m["caja"][2] + m["caja"][3]) / 2 - centro[1]))
    return municipios[:MAX_MUNICIPIOS]


def utm_a_geo(este: float, norte: float, huso: int) -> tuple[float, float]:
    """UTM (ETRS89) → (lon, lat). Fórmulas de Snyder; error de centímetros."""
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = f * (2 - f)
    k0 = 0.9996
    ep2 = e2 / (1 - e2)
    x = este - 500000.0
    m = norte / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    p1 = (mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
          + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
          + (151 * e1**3 / 96) * math.sin(6 * mu) + (1097 * e1**4 / 512) * math.sin(8 * mu))
    c1 = ep2 * math.cos(p1) ** 2
    t1 = math.tan(p1) ** 2
    n1 = a / math.sqrt(1 - e2 * math.sin(p1) ** 2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(p1) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = p1 - (n1 * math.tan(p1) / r1) * (
        d**2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720
    )
    lon = (d - (1 + 2 * t1 + c1) * d**3 / 6
           + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120) / math.cos(p1)
    return math.degrees(lon) + (huso * 6 - 183), math.degrees(lat)


def altura_de_plantas(plantas: int) -> float:
    return round(plantas * METROS_POR_PLANTA + METROS_DE_TEJADO, 1)


def edificios_del_gml(gml: str, caja: Caja) -> list[dict[str, Any]]:
    """Partes de edificio con plantas sobre rasante (las de 0 no se levantan) dentro de la caja."""
    huso_m = re.search(r"EPSG::258(\d\d)", gml)
    huso = int(huso_m.group(1)) if huso_m else 30
    salida = []
    for bloque in gml.split("<bu-ext2d:BuildingPart ")[1:]:
        m = re.search(r"numberOfFloorsAboveGround>(\d+)<", bloque)
        plantas = int(m.group(1)) if m else 1
        if plantas <= 0:
            continue
        anillos = []
        for pos in re.findall(r"<gml:(?:exterior|interior)>.*?<gml:posList[^>]*>([^<]+)</gml:posList>", bloque, re.S):
            v = pos.split()
            anillos.append([[round(c, 6) for c in utm_a_geo(float(v[i]), float(v[i + 1]), huso)] for i in range(0, len(v) - 1, 2)])
        if not anillos or len(anillos[0]) < 4:
            continue
        if not any(caja[0] <= lat <= caja[1] and caja[2] <= lon <= caja[3] for lon, lat in anillos[0]):
            continue
        salida.append({"type": "Feature", "properties": {"h": altura_de_plantas(plantas)},
                       "geometry": {"type": "Polygon", "coordinates": anillos}})
    return salida


def edificios_del_zip(contenido: bytes, caja: Caja) -> list[dict[str, Any]]:
    with zipfile.ZipFile(io.BytesIO(contenido)) as z:
        nombre = next((n for n in z.namelist() if n.lower().endswith("buildingpart.gml")), None)
        if not nombre:
            return []
        return edificios_del_gml(z.read(nombre).decode("utf-8", "replace"), caja)


def preparar_edificios(cliente, caja: Caja, data_dir: Path, progreso: Callable[..., None], espera=time.sleep) -> dict:
    zona = ampliar(caja, MARGEN_EDIFICIOS_KM)
    progreso(fase="buscando los municipios en el Catastro", hechas=0, total=0)
    municipios = municipios_de_la_caja(cliente, zona, lambda t: progreso(fase=t))
    if not municipios:
        raise RuntimeError("el Catastro no tiene municipios en esa zona (¿fuera de España o del territorio común?)")
    carpeta = Path(data_dir) / "catastro"
    carpeta.mkdir(parents=True, exist_ok=True)
    features: list[dict[str, Any]] = []
    for i, municipio in enumerate(municipios):
        progreso(fase="edificios de %s" % municipio["titulo"].replace(" buildings", ""), hechas=i, total=len(municipios))
        fichero = carpeta / Path(municipio["url"]).name
        # El zip se guarda: volver a preparar la misma zona no lo vuelve a pedir en 60 días.
        # Si una vez llegó una página web en vez del zip (el Catastro la sirve cuando falla), no se reutiliza.
        if fichero.exists() and time.time() - fichero.stat().st_mtime < 60 * 86400 and fichero.read_bytes()[:2] == b"PK":
            contenido = fichero.read_bytes()
        else:
            contenido = pedir_con_reintentos(cliente, municipio["url"].replace("http://", "https://"), lambda t: progreso(fase=t), espera)
            espera(PAUSA_ENTRE_PETICIONES_S)
            if contenido[:2] != b"PK":
                # Un municipio que no se puede bajar no tira toda la zona: se avisa y se sigue con los demás.
                progreso(fase="el Catastro no dio el zip de %s; se salta" % municipio["titulo"].replace(" buildings", ""))
                continue
            fichero.write_bytes(contenido)
        features.extend(edificios_del_zip(contenido, zona))
    escribir_edificios(Path(data_dir), features)
    return {"edificios": len(features), "municipios": [m["titulo"].replace(" buildings", "") for m in municipios]}


def escribir_edificios(data_dir: Path, features: list[dict[str, Any]]) -> None:
    destino = Path(data_dir) / FICHERO_EDIFICIOS
    temporal = destino.with_name(destino.name + ".tmp")
    temporal.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")
    os.replace(temporal, destino)


# ---------------------------------------------------------------------------
# Servirlos: recortados a la misión de ahora y comprimidos
# ---------------------------------------------------------------------------

#: Ni una casa encima de un nodo: tapaba el nodo con la cámara inclinada.
DESPEJE_DE_NODOS_M = 14.0
_CERROJO = threading.Lock()
_SERVIDOS: dict[str, Any] = {}
VACIO_GZ = gzip.compress(b'{"type":"FeatureCollection","features":[]}', 6)


def filtrar_edificios(features: list[dict[str, Any]], caja: Caja | None, nodos: list[tuple[float, float]]) -> list[dict[str, Any]]:
    """Sólo los de la caja de la misión (+ margen) y ninguno sobre un nodo."""
    if caja is None:
        return []
    zona = ampliar(caja, MARGEN_EDIFICIOS_KM)
    salida = []
    for f in features:
        try:
            anillo = f["geometry"]["coordinates"][0]
            lons = [p[0] for p in anillo]
            lats = [p[1] for p in anillo]
        except (KeyError, IndexError, TypeError):
            continue
        if not any(zona[0] <= la <= zona[1] and zona[2] <= lo <= zona[3] for lo, la in zip(lons, lats)):
            continue
        lat_c = (min(lats) + max(lats)) / 2
        d_lat = DESPEJE_DE_NODOS_M / 111320.0
        d_lon = DESPEJE_DE_NODOS_M / (111320.0 * max(0.05, math.cos(math.radians(lat_c))))
        sobre_nodo = any(
            min(lats) - d_lat <= la <= max(lats) + d_lat and min(lons) - d_lon <= lo <= max(lons) + d_lon
            for la, lo in nodos
        )
        if not sobre_nodo:
            salida.append(f)
    return salida


def edificios_para_servir(data_dir: str | Path, clave_mision: Any, caja: Caja | None, nodos: list[tuple[float, float]]) -> tuple[bytes, str]:
    """(GeoJSON comprimido con gzip, versión). Con caché en memoria hasta que cambie
    el fichero o la misión. Sin fichero, una colección vacía (el mapa no se queja)."""
    fichero = Path(data_dir) / FICHERO_EDIFICIOS
    try:
        estado = fichero.stat()
        huella = (estado.st_mtime_ns, estado.st_size)
    except OSError:
        return VACIO_GZ, "vacio"
    clave = (str(fichero), huella, clave_mision)
    with _CERROJO:
        guardado = _SERVIDOS.get("v")
        if guardado and guardado[0] == clave:
            return guardado[1], guardado[2]
    try:
        datos = json.loads(fichero.read_text(encoding="utf-8"))
        features = datos.get("features", []) if isinstance(datos, dict) else []
    except (OSError, ValueError):
        return VACIO_GZ, "vacio"
    crudo = json.dumps({"type": "FeatureCollection", "features": filtrar_edificios(features, caja, nodos)},
                       separators=(",", ":")).encode("utf-8")
    import hashlib

    version = hashlib.sha1(crudo).hexdigest()[:12]
    comprimido = gzip.compress(crudo, 6)
    with _CERROJO:
        _SERVIDOS["v"] = (clave, comprimido, version)
    return comprimido, version


# ---------------------------------------------------------------------------
# Estado (lo que enseña el panel) y orquestación
# ---------------------------------------------------------------------------

def leer_json(ruta: Path) -> dict[str, Any]:
    try:
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
        return datos if isinstance(datos, dict) else {}
    except (OSError, ValueError):
        return {}


def escribir_json(ruta: Path, datos: dict[str, Any]) -> None:
    ruta = Path(ruta)
    temporal = ruta.with_name(ruta.name + ".tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
    os.replace(temporal, ruta)


def estado(data_dir: str | Path, en_curso: bool = False) -> dict[str, Any]:
    data_dir = Path(data_dir)
    hecho = leer_json(data_dir / FICHERO_ESTADO)
    progreso = leer_json(data_dir / FICHERO_PROGRESO)
    progreso["en_curso"] = bool(en_curso)
    return {"hay": bool(hecho.get("built_at")), **hecho, "construccion": progreso}


def preparar(caja: Caja, data_dir: str | Path, solo: str | None = None, cliente=None, espera=time.sleep) -> dict[str, Any]:
    """Relieve y edificios para la caja. Deja el progreso y el resultado en `data/`."""
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    progreso_actual = {"fase": "preparando", "hechas": 0, "total": 0, "error": "", "avisos": []}

    def progreso(**cambios):
        progreso_actual.update(cambios)
        escribir_json(data_dir / FICHERO_PROGRESO, progreso_actual)

    progreso()
    propio = cliente is None
    if propio:
        import httpx

        cliente = httpx.Client(timeout=httpx.Timeout(30.0, read=180.0), follow_redirects=True)
    resultado: dict[str, Any] = dict(leer_json(data_dir / FICHERO_ESTADO))
    resultado["caja"] = [round(v, 5) for v in caja]
    try:
        if solo in (None, "relieve"):
            try:
                resultado["relieve"] = preparar_relieve(cliente, caja, data_dir, progreso, espera)
            except Exception as exc:
                progreso_actual["avisos"].append("relieve: %s" % str(exc)[:200])
                if solo == "relieve":
                    raise
        if solo in (None, "edificios"):
            try:
                resultado["edificios"] = preparar_edificios(cliente, caja, data_dir, progreso, espera)
            except Exception as exc:
                progreso_actual["avisos"].append("edificios: %s" % str(exc)[:200])
                if solo == "edificios":
                    raise
        if solo is None and len(progreso_actual["avisos"]) == 2:
            raise RuntimeError("; ".join(progreso_actual["avisos"]))
        resultado["built_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        resultado["avisos"] = list(progreso_actual["avisos"])
        escribir_json(data_dir / FICHERO_ESTADO, resultado)
        progreso(fase="hecho", hechas=0, total=0)
        return resultado
    except Exception as exc:
        progreso(fase="", error=str(exc)[:300])
        raise
    finally:
        if propio:
            cliente.close()


def caja_de_la_mision_guardada() -> Caja | None:
    """Para la línea de comandos: la caja de la misión de este despliegue."""
    raiz = Path(__file__).resolve().parents[3]
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from backend.app.runtime import teselas

    return teselas.caja_de_la_mision()


def main_cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prepara el relieve del IGN y los edificios del Catastro de la misión.")
    parser.add_argument("--caja", help="lat_min,lat_max,lon_min,lon_max (por defecto, la de la misión guardada)")
    parser.add_argument("--data-dir", help="carpeta data (por defecto SAGA_DATA_DIR o ./data)")
    parser.add_argument("--solo", choices=("relieve", "edificios"))
    args = parser.parse_args(argv)
    data_dir = args.data_dir or os.getenv("SAGA_DATA_DIR") or "data"
    if args.caja:
        partes = [float(v) for v in args.caja.split(",")]
        if len(partes) != 4:
            parser.error("--caja necesita cuatro números")
        caja: Caja | None = (partes[0], partes[1], partes[2], partes[3])
    else:
        caja = caja_de_la_mision_guardada()
    if caja is None:
        print("La misión no tiene nodos con posición: no hay zona que preparar.", file=sys.stderr)
        return 2
    try:
        resultado = preparar(caja, data_dir, args.solo)
    except Exception as exc:
        print("Error: %s" % exc, file=sys.stderr)
        return 1
    print(json.dumps(resultado, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main_cli())

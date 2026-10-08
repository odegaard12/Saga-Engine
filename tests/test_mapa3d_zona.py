# -*- coding: utf-8 -*-
"""Mapa 3D de la zona (5.52): ortofoto PNOA con Esri de respaldo, relieve propio
del IGN pregenerado en `data/dem_ign` y edificios del Catastro en `/api/edificios`.

Todo con datos SINTÉTICOS: ni una coordenada, rejilla o edificio reales (repo
público). La zona de pruebas es una caja inventada en el centro de la península.
"""
import gzip
import io
import json
import os
import tempfile
import zipfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mapa3d-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import public  # noqa: E402
from backend.app.runtime import mapa3d, teselas  # noqa: E402

LAT, LON = 40.0, -3.0
CAJA = (39.99, 40.01, -3.01, -2.99)


class _Respuesta:
    def __init__(self, status=200, contenido=b"", tipo="image/jpeg"):
        self.status_code = status
        self.content = contenido
        self.headers = {"Content-Type": tipo}


class _ClienteFalso:
    """Responde según la URL: PNOA, Esri o Terrarium."""

    llamadas: list = []
    pnoa = staticmethod(lambda: _Respuesta(200, b"\xff\xd8pnoa", "image/jpeg"))

    def __init__(self, *args, **kwargs):
        pass

    async def get(self, url, *args, **kwargs):
        _ClienteFalso.llamadas.append(url)
        if "ign.es" in url:
            return _ClienteFalso.pnoa()
        if "arcgisonline" in url:
            return _Respuesta(200, b"\xff\xd8esri", "image/jpeg")
        return _Respuesta(200, b"\x89PNGterrarium", "image/png")


def _cliente(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_HTTPX_AVAILABLE", True)
    monkeypatch.setattr(main._httpx, "AsyncClient", _ClienteFalso)
    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: CAJA)
    monkeypatch.setattr(main, "verify_admin_session_token", lambda token: False)
    _ClienteFalso.llamadas = []
    _ClienteFalso.pnoa = staticmethod(lambda: _Respuesta(200, b"\xff\xd8pnoa", "image/jpeg"))
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# Satélite: PNOA en España, Esri a zoom bajo, fuera o si el IGN falla
# ---------------------------------------------------------------------------

def test_el_origen_del_satelite_depende_del_zoom_y_de_si_es_espana():
    assert teselas.origen_satelite(16, *teselas.tesela_de(LAT, LON, 16)) == "pnoa"
    assert teselas.origen_satelite(8, *teselas.tesela_de(LAT, LON, 8)) == "esri"
    assert teselas.origen_satelite(16, *teselas.tesela_de(48.0, 2.0, 16)) == "esri"  # Francia
    assert teselas.origen_satelite(16, *teselas.tesela_de(28.3, -16.5, 16)) == "pnoa"  # Canarias
    assert teselas.carpeta_satelite("pnoa") != teselas.carpeta_satelite("esri")


def test_en_espana_sirve_pnoa_y_la_guarda_en_su_carpeta(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    x, y = teselas.tesela_de(LAT, LON, 17)

    r = cliente.get("/map-tiles/17/%d/%d.png" % (x, y))

    assert r.status_code == 200 and r.content == b"\xff\xd8pnoa"
    assert len(_ClienteFalso.llamadas) == 1 and "ign.es" in _ClienteFalso.llamadas[0]
    assert (tmp_path / "tile_cache_pnoa" / "17" / str(x) / ("%d.bin" % y)).exists()
    assert not (tmp_path / "tile_cache").exists(), "nada de Esri en la carpeta de PNOA ni al revés"


def test_si_el_ign_falla_tira_de_esri(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _ClienteFalso.pnoa = staticmethod(lambda: _Respuesta(500, b"caido", "text/plain"))
    x, y = teselas.tesela_de(LAT, LON, 17)

    r = cliente.get("/map-tiles/17/%d/%d.png" % (x, y))

    assert r.status_code == 200 and r.content == b"\xff\xd8esri"
    assert (tmp_path / "tile_cache" / "17" / str(x) / ("%d.bin" % y)).exists()
    assert not (tmp_path / "tile_cache_pnoa").exists()


def test_una_pagina_de_error_del_ign_con_200_tampoco_vale(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _ClienteFalso.pnoa = staticmethod(lambda: _Respuesta(200, b"<ServiceException/>", "application/xml"))
    x, y = teselas.tesela_de(LAT, LON, 17)

    assert cliente.get("/map-tiles/17/%d/%d.png" % (x, y)).content == b"\xff\xd8esri"


def test_a_zoom_bajo_va_directo_a_esri(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    x, y = teselas.tesela_de(LAT, LON, 9)

    assert cliente.get("/map-tiles/9/%d/%d.png" % (x, y)).content == b"\xff\xd8esri"
    assert not any("ign.es" in u for u in _ClienteFalso.llamadas)


# ---------------------------------------------------------------------------
# Relieve: primero lo preparado del IGN, después Terrarium
# ---------------------------------------------------------------------------

def test_el_relieve_propio_se_sirve_antes_que_terrarium(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    x, y = teselas.tesela_de(LAT, LON, 14)
    propia = tmp_path / "dem_ign" / "14" / str(x) / ("%d.png" % y)
    propia.parent.mkdir(parents=True)
    propia.write_bytes(b"\x89PNGign")

    r = cliente.get("/dem-tiles/14/%d/%d.png" % (x, y))
    assert r.status_code == 200 and r.content == b"\x89PNGign"
    assert _ClienteFalso.llamadas == [], "con la tesela del IGN en disco no se pide nada fuera"

    # La de al lado no está preparada: Terrarium.
    r = cliente.get("/dem-tiles/14/%d/%d.png" % (x + 1, y))
    assert r.content == b"\x89PNGterrarium"

    # Y el lote del paquete offline sirve la misma.
    lote = cliente.post("/api/teselas/lote", json={"teselas": ["/dem-tiles/14/%d/%d.png" % (x, y)]})
    assert b"\x89PNGign" in lote.content


def test_terrarium_a_un_octavo_de_metro():
    alturas = [0.0, 12.34, 523.06, 1999.99, -5.0]
    vuelta = mapa3d.decodificar_terrarium(mapa3d.codificar_terrarium(alturas))
    for original, leida in zip(alturas, vuelta):
        assert abs(max(0.0, original) - leida) <= 1 / 16 + 1e-9


def _asc(ncols, nrows, xll, yll, celda, valor):
    """Rejilla ASCII sintética: altura = valor(columna, fila) (fila 0 arriba)."""
    filas = [" ".join("%.3f" % valor(c, f) for c in range(ncols)) for f in range(nrows)]
    cuerpo = "ncols %d\nnrows %d\nxllcorner %.9f\nyllcorner %.9f\ncellsize %.9f\nNODATA_value -9999\n%s\n" % (
        ncols, nrows, xll, yll, celda, "\n".join(filas))
    return ("--wcs\nContent-Type: application/asc\n\n" + cuerpo + "--wcs--\n").encode("latin-1")


def test_la_rejilla_del_wcs_se_lee_y_se_muestrea():
    rejilla = mapa3d.leer_asc(_asc(4, 3, -3.0, 40.0, 0.01, lambda c, f: -9999 if (c, f) == (3, 0) else 100 + c * 10))
    assert (rejilla.ncols, rejilla.nrows) == (4, 3)
    assert rejilla.datos[3] == 0.0, "sin dato (mar) = 0"
    # Centro de la celda (1, 1) y a medio camino entre la 1 y la 2.
    assert abs(mapa3d.altura_en(rejilla, -3.0 + 0.015, 40.0 + 0.015) - 110) < 1e-3
    assert abs(mapa3d.altura_en(rejilla, -3.0 + 0.02, 40.0 + 0.015) - 115) < 1e-3
    assert mapa3d.altura_en(rejilla, 10.0, 10.0) == 0.0


def test_la_rejilla_con_dx_dy_tambien_se_lee():
    # 5.52.1: en la Pi el WCS del IGN devolvió `dx`/`dy` (celdas no cuadradas) y la preparación cascaba.
    cuerpo = (
        "ncols 2\nnrows 2\nxllcorner -3.0\nyllcorner 40.0\ndx 0.02\ndy 0.01\nNODATA_value -9999\n"
        "100 120\n200 220\n"
    )
    rejilla = mapa3d.leer_asc(cuerpo.encode("latin-1"))
    assert (rejilla.celda, rejilla.celda_y) == (0.02, 0.01)
    assert abs(rejilla.ytop - 40.02) < 1e-9
    # Centro de la celda de arriba a la izquierda (fila 0 = norte).
    assert abs(mapa3d.altura_en(rejilla, -3.0 + 0.01, 40.0 + 0.015) - 100) < 1e-3


def test_el_centro_del_mapa_de_serie_no_estira_la_zona_de_la_mision():
    # 5.52.1: el map_center de serie (Madrid) metía media España en la zona de una ruta gallega.
    nodos = [{"lat": 10.0, "lon": 20.0}, {"lat": 10.01, "lon": 20.02}]
    caja = teselas.caja_de_los_puntos(nodos, {"map_center": [40.4168, -3.7038]})
    assert caja == (10.0, 10.01, 20.0, 20.02)
    # Sin nodos, el centro sí sirve de zona.
    assert teselas.caja_de_los_puntos([], {"map_center": [10.0, 20.0]}) == (10.0, 10.0, 20.0, 20.0)


def test_la_tesela_generada_lleva_la_altura_de_la_rejilla_en_cada_pixel():
    from PIL import Image

    z = 15
    x, y = teselas.tesela_de(LAT, LON, z)
    lat0, lat1, lon0, lon1 = mapa3d.limites_de_tesela(z, x, y)
    rejilla = mapa3d.leer_asc(_asc(60, 60, lon0 - 0.001, lat0 - 0.001, (lon1 - lon0 + 0.002) / 59,
                                   lambda c, f: 300 + 2.5 * c + 1.25 * f))
    imagen = Image.open(io.BytesIO(mapa3d.generar_tesela(rejilla, z, x, y)))
    alturas = mapa3d.decodificar_terrarium(imagen.tobytes())
    import math

    for px, py in ((0, 0), (128, 77), (255, 255)):
        lon = lon0 + (px + 0.5) / 256 * (lon1 - lon0)
        n = 2**z
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + (py + 0.5) / 256) / n))))
        assert abs(alturas[py * 256 + px] - mapa3d.altura_en(rejilla, lon, lat)) <= 1 / 16 + 1e-6


def test_el_plan_cubre_la_caja_con_teselas_enteras_de_z11_a_z15():
    plan = mapa3d.plan_de_relieve(CAJA)
    zooms = {t[1] for t in plan["teselas"]}
    assert zooms == {11, 12, 13, 14, 15}
    for x, y in mapa3d.teselas_de_la_caja(CAJA, 15):
        assert (mapa3d.COBERTURA_MDT05, 15, x, y) in plan["teselas"]
    zona = plan["zonas"][mapa3d.COBERTURA_MDT05]
    assert zona[0] <= CAJA[0] and zona[1] >= CAJA[1] and zona[2] <= CAJA[2] and zona[3] >= CAJA[3]


# ---------------------------------------------------------------------------
# Edificios
# ---------------------------------------------------------------------------

def _parte(id_, plantas, este, norte, lado=10.0):
    anillo = [(este, norte), (este + lado, norte), (este + lado, norte + lado), (este, norte + lado), (este, norte)]
    pos = " ".join("%.2f %.2f" % p for p in anillo)
    return (
        '<bu-ext2d:BuildingPart gml:id="%s"><bu-ext2d:numberOfFloorsAboveGround>%d</bu-ext2d:numberOfFloorsAboveGround>'
        '<gml:Surface srsName="http://www.opengis.net/def/crs/EPSG/0/25830"><gml:exterior><gml:LinearRing>'
        '<gml:posList srsDimension="2">%s</gml:posList></gml:LinearRing></gml:exterior></gml:Surface>'
        "</bu-ext2d:BuildingPart>" % (id_, plantas, pos)
    )


def _gml(*partes):
    return '<?xml version="1.0"?><gml:FeatureCollection srsName="urn:ogc:def:crs:EPSG::25830">%s</gml:FeatureCollection>' % "".join(partes)


# UTM 30N de (40,-3): unos 500 km E, 4428 km N.
E0, N0 = 500000.0, 4427757.0


def test_el_gml_del_catastro_da_alturas_y_quita_lo_bajo_rasante():
    gml = _gml(_parte("a", 2, E0, N0), _parte("b", 0, E0 + 50, N0), _parte("c", 1, E0 + 90000, N0))
    feats = mapa3d.edificios_del_gml(gml, CAJA)
    assert [f["properties"]["h"] for f in feats] == [6.6], "dos plantas = 6,6 m; la de 0 plantas y la de fuera, no"
    lon, lat = feats[0]["geometry"]["coordinates"][0][0]
    assert abs(lat - 40.0) < 0.001 and abs(lon + 3.0) < 0.001


def test_api_edificios_vacia_sin_preparar(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    r = cliente.get("/api/edificios")
    assert r.status_code == 200 and r.json() == {"type": "FeatureCollection", "features": []}


def _cuadrado(lat, lon, h=6.6, lado=0.0001):
    anillo = [[lon, lat], [lon + lado, lat], [lon + lado, lat + lado], [lon, lat + lado], [lon, lat]]
    return {"type": "Feature", "properties": {"h": h}, "geometry": {"type": "Polygon", "coordinates": [anillo]}}


def test_api_edificios_recorta_a_la_mision_y_despeja_los_nodos(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    nodo = (40.0, -3.0)
    monkeypatch.setattr(main, "STAGES_DB", str(tmp_path / "stages.json"))
    from backend.app.storage import runtime_store

    monkeypatch.setattr(runtime_store, "load_stages", lambda _ruta: [{"lat": nodo[0], "lon": nodo[1]}])
    mapa3d.escribir_edificios(tmp_path, [
        _cuadrado(40.0, -3.00005),     # encima del nodo: fuera
        _cuadrado(40.005, -3.005),     # en la zona, lejos del nodo: se queda
        _cuadrado(41.0, -3.0),         # a 100 km: fuera
    ])

    r = cliente.get("/api/edificios")

    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"
    datos = r.json()
    assert len(datos["features"]) == 1
    assert datos["features"][0]["geometry"]["coordinates"][0][0] == [-3.005, 40.005]
    assert r.headers.get("x-edificios-version")


def test_preparar_de_punta_a_punta_con_servicios_falsos(tmp_path):
    """El WCS, el ATOM y el zip, falsos: salen las teselas, los edificios y el estado."""

    def asc_de(url):
        import re

        lat0, lat1 = map(float, re.search(r"Lat\(([^,]+),([^)]+)\)", url).groups())
        lon0, lon1 = map(float, re.search(r"Long\(([^,]+),([^)]+)\)", url).groups())
        celda = 0.002
        nc, nr = int((lon1 - lon0) / celda) + 1, int((lat1 - lat0) / celda) + 1
        return _asc(nc, nr, lon0, lat0, celda, lambda c, f: 50.0 + c * 0.5)

    zip_mem = io.BytesIO()
    with zipfile.ZipFile(zip_mem, "w") as z:
        z.writestr("A.ES.SDGC.BU.99999.buildingpart.gml", _gml(_parte("a", 3, E0, N0)))
    general = (
        '<feed><entry><title>Territorial office 99 Prueba</title>'
        '<link rel="enclosure" href="http://x.invalid/99/atom_99.xml"/>'
        "<georss:polygon>39 -4 39 -2 41 -2 41 -4 39 -4</georss:polygon></entry></feed>"
    )
    provincia = (
        "<feed><entry><title> 99999-PRUEBA buildings</title>"
        '<link rel="enclosure" href="https://x.invalid/99/A.ES.SDGC.BU.99999.zip"/>'
        "<georss:polygon>39.9 -3.1 39.9 -2.9 40.1 -2.9 40.1 -3.1 39.9 -3.1</georss:polygon></entry></feed>"
    )

    class _Sincrono:
        pedidas: list = []

        def get(self, url, headers=None):
            _Sincrono.pedidas.append(url)
            if "wcs" in url:
                return _Respuesta(200, asc_de(url), "multipart/related")
            if url.endswith(".zip"):
                return _Respuesta(200, zip_mem.getvalue(), "application/zip")
            if "atom_99" in url:
                return _Respuesta(200, provincia.encode(), "application/xml")
            return _Respuesta(200, general.encode(), "application/xml")

    resultado = mapa3d.preparar(CAJA, tmp_path, cliente=_Sincrono(), espera=lambda s: None)

    assert resultado["relieve"]["teselas"] > 0 and resultado["edificios"]["edificios"] == 1
    x, y = mapa3d.tesela_de(LAT, LON, 15)
    png = tmp_path / "dem_ign" / "15" / str(x) / ("%d.png" % y)
    from PIL import Image

    imagen = Image.open(png)
    assert imagen.size == (256, 256) and imagen.mode == "RGB"
    alturas = mapa3d.decodificar_terrarium(imagen.tobytes())
    assert 50 <= min(alturas) and max(alturas) < 200, "las alturas de la rejilla falsa, no ceros"
    assert not (tmp_path / "dem_ign.nuevo").exists()
    assert json.loads((tmp_path / "edificios.geojson").read_text())["features"][0]["properties"]["h"] == 9.6
    estado = mapa3d.estado(tmp_path)
    assert estado["hay"] and estado["construccion"]["fase"] == "hecho"
    # Pide al WCS por trozos y nunca más de lo que cabe en la zona.
    assert 2 <= sum("wcs" in u for u in _Sincrono.pedidas) <= 8


def test_el_admin_tiene_el_boton_y_los_datos_no_se_versionan():
    raiz = Path(__file__).resolve().parents[1]
    panel = (raiz / "frontend" / "src" / "admin" / "components" / "SettingsPanel.tsx").read_text(encoding="utf-8")
    assert "/api/admin/mapa3d/build" in panel and "Preparar mapa 3D de la zona" in panel
    ignorados = (raiz / ".gitignore").read_text(encoding="utf-8")
    for ruta in ("data/dem_ign/", "data/edificios.geojson", "data/catastro/", "data/tile_cache_pnoa/"):
        assert ruta in ignorados
    assert gzip.decompress(mapa3d.VACIO_GZ)

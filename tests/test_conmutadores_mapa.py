# -*- coding: utf-8 -*-
"""Conmutadores de diagnóstico del mapa (`?mapa=esri,terreno12,…`) y la sección «Mapa» de `?depurar-mapa`.

Para aislar en el iPhone del dueño qué pieza del estilo de 5.52 deja el mapa borroso. Lo que importa:
sin parámetro el estilo es EXACTAMENTE el de siempre, y cada conmutador hace sólo lo que dice. La lógica se
ejecuta en Node (tests/js/conmutadores_mapa.cjs); el cableado en React/MapLibre se comprueba por el código.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-conmutadores-"))

RAIZ = Path(__file__).resolve().parent.parent
COMP = RAIZ / "frontend" / "src" / "player" / "components"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    res = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "conmutadores_mapa.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ),
    )
    assert res.returncode == 0, res.stderr[-3000:]
    return json.loads(res.stdout)


def test_sin_parametro_el_estilo_es_el_mismo_objeto(js):
    r = js["sinNada"]
    assert r["lista"] == []
    assert r["mismoObjeto"] is True and r["igual"] is True
    assert r["guardado"] == [], "sin parámetro no se escribe nada en la sesión"
    assert r["pixelRatio"] is None, "sin pr2, MapLibre usa el pixelRatio del dispositivo"


def test_cada_conmutador_hace_solo_lo_suyo(js):
    c = js["cada"]
    assert set(js["nombres"]) == {"esri", "terreno12", "sinterreno", "sinsombra", "sincontraste", "fade", "pr2", "sinedificios"}
    for nombre, r in c.items():
        assert r["baseIntacta"], f"{nombre} no debe tocar el estilo original"

    assert c["esri"]["satTiles"] == ["https://ejemplo.test/map-tiles/esri/{z}/{x}/{y}.png"]
    assert "Esri" in c["esri"]["satAttr"]

    assert c["terreno12"]["demMaxzoom"] == 12
    assert c["terreno12"]["sombrasMaxzoom"] == 14, "el sombreado sigue en z14, como en 5.51.1"

    assert c["sinterreno"]["terreno"] is None
    assert "dem" not in c["sinterreno"]["fuentes"] and c["sinterreno"]["sky"] is True

    assert "sombras" not in c["sinsombra"]["capas"] and "demSombras" not in c["sinsombra"]["fuentes"]
    assert c["sinsombra"]["terreno"] == {"source": "dem", "exaggeration": 1.5}

    assert c["sincontraste"]["pinturaSat"] == ["raster-fade-duration"]
    assert sorted(c["fade"]["pinturaSat"]) == ["raster-brightness-min", "raster-contrast", "raster-saturation"]

    assert "casas-capa" not in c["sinedificios"]["capas"] and "casas" not in c["sinedificios"]["fuentes"]
    assert "ruta" in c["sinedificios"]["fuentes"], "las fuentes del juego no se tocan"
    assert "nodos-volumen" in c["sinedificios"]["capas"], "el volumen de los nodos también es fill-extrusion y se queda"

    assert c["pr2"]["pixelRatio"] == 2
    assert c["pr2"]["capas"] == c["esri"]["capas"] and c["pr2"]["demMaxzoom"] == 14, "pr2 no cambia el estilo"
    for nombre in ("sinterreno", "sinsombra", "sincontraste", "fade", "pr2", "sinedificios", "terreno12"):
        assert c[nombre]["satTiles"] == ["https://ejemplo.test/map-tiles/{z}/{x}/{y}.png"], nombre


def test_todos_a_la_vez(js):
    t = js["todos"]
    assert t["capas"] == ["sat-capa", "ruta-capa", "nodos-volumen"] and t["terreno"] is None
    assert t["pinturaSat"] == []


def test_la_direccion_manda_y_la_sesion_sobrevive_a_la_recarga(js):
    s = js["sesion"]
    assert s["primera"] == ["esri", "terreno12"], "sin repetir, sin desconocidos, sin importar mayúsculas"
    assert s["recarga"] == ["esri", "terreno12"], "la PWA recarga en / sin query"
    assert s["borrar"] == [] and s["tras"] == []
    assert s["vacio"] == [] and s["guardadoTrasVacio"] == []
    assert s["sinAlmacen"] == ["fade"]


def test_el_mapa_aplica_los_conmutadores_al_estilo_y_al_pixel_ratio():
    src = leer(COMP / "MapSurfaceGL.tsx")
    assert re.search(r"function estiloDelMapa\(\): maplibregl\.StyleSpecification \{\s*//[^\n]*\n\s*return aplicarConmutadores\(estiloBase\(\), conmutadoresActivos\)", src)
    assert "conmutadoresActivos = leerConmutadores(window.location.search, almacenDeSesion())" in src
    # pixelRatio sólo si pr2 lo pide: sin él, la opción ni aparece.
    assert "...(pixelRatioForzado ? { pixelRatio: pixelRatioForzado } : {})" in src
    # El panel sale con `?depurar-mapa` o con un conmutador activo (para poder quitarlo).
    assert "(!hayDepuracionDeMapa() && !conmutadoresActivos.length)" in src
    assert "textoDelMapa(mapaRef.current, conmutadoresActivos)" in src


def test_la_seccion_mapa_lee_lo_que_hace_falta_y_tiene_botones():
    d = leer(COMP / "diagnosticoDelMapa.ts")
    for clave in ("getPixelRatio()", "devicePixelRatio", "MAX_TEXTURE_SIZE", "WEBGL_debug_renderer_info",
                  "getTerrain()", "getVersion()", "tileManagers", "pendientes=", "zMaxCargada=", "isMoving()"):
        assert clave in d, clave
    assert "searchParams.delete('mapa')" in d and "location.reload()" in d
    assert "'Normal'" in d
    p = leer(RAIZ / "frontend" / "src" / "player" / "avatares3d" / "mixamo" / "panelDepuracion.ts")
    assert "ultimo += `\\n${texto}`" in p, "«Copiar» lleva también la sección Mapa"


def test_el_service_worker_no_guarda_la_esri_del_diagnostico():
    sw = leer(RAIZ / "frontend" / "public" / "sw.js")
    i = sw.index("if (url.pathname.startsWith('/map-tiles/esri/')) return")
    assert i < sw.index("url.pathname.startsWith('/map-tiles/') ||"), "antes del cacheFirst de las teselas"


# ---------------------------------------------------------------------------
# Servidor: /map-tiles/esri/{z}/{x}/{y}.png siempre Esri, en la zona
# ---------------------------------------------------------------------------

class _Respuesta:
    def __init__(self, contenido):
        self.status_code = 200
        self.content = contenido
        self.headers = {"Content-Type": "image/jpeg"}


class _ClienteFalso:
    llamadas: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def get(self, url, *args, **kwargs):
        _ClienteFalso.llamadas.append(url)
        return _Respuesta(b"\xff\xd8pnoa" if "ign.es" in url else b"\xff\xd8esri")


def test_la_ruta_esri_salta_la_pnoa_y_respeta_la_zona(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    import main
    from backend.app.runtime import teselas

    # Zona inventada en el centro de la península (repo público: nada real).
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_HTTPX_AVAILABLE", True)
    monkeypatch.setattr(main._httpx, "AsyncClient", _ClienteFalso)
    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: (39.99, 40.01, -3.01, -2.99))
    monkeypatch.setattr(main, "verify_admin_session_token", lambda token: False)
    _ClienteFalso.llamadas = []
    cliente = TestClient(main.app)
    x, y = teselas.tesela_de(40.0, -3.0, 17)

    r = cliente.get("/map-tiles/esri/17/%d/%d.png" % (x, y))
    assert r.status_code == 200 and r.content == b"\xff\xd8esri"
    assert not any("ign.es" in u for u in _ClienteFalso.llamadas)
    assert (tmp_path / "tile_cache" / "17" / str(x) / ("%d.bin" % y)).exists()
    # La de siempre sigue siendo PNOA.
    assert cliente.get("/map-tiles/17/%d/%d.png" % (x, y)).content == b"\xff\xd8pnoa"
    # Fuera de la zona, 404 como la normal.
    fx, fy = teselas.tesela_de(48.0, 2.0, 17)
    assert cliente.get("/map-tiles/esri/17/%d/%d.png" % (fx, fy)).status_code == 404

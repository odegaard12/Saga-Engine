# -*- coding: utf-8 -*-
"""Mapa más ligero mientras la cámara se mueve (23/11): menos píxeles durante el gesto, lo de siempre quieto.

La lógica (escalones, histéresis, reposo de 220 ms, un salto corto no toca nada) se ejecuta en Node con un mapa de
mentira y relojes manuales (tests/js/mapa_ligero.cjs); el cableado en React/MapLibre se comprueba por el código.
Además: las fuentes del juego se teselan sólo hasta z16 (menos teselas nuevas, y menos atlas de imágenes subidos, al girar).
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

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
        [node, str(RAIZ / "tests" / "js" / "mapa_ligero.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ),
    )
    assert res.returncode == 0, res.stderr[-3000:]
    return json.loads(res.stdout)


def test_la_densidad_por_escalon_nunca_baja_de_1(js):
    p = js["puras"]
    assert p["densidad"] == [3, 2, 1.5]
    assert p["densidad2"] == [2, 1.33, 1]
    assert p["densidadBaja"] == [1, 0.75, 1, 1], "un móvil ya en <= 1 no se toca; nunca se sube la densidad"
    assert p["densidadFueraDeRango"] == [3, 1.5], "el escalón se recorta a 0..2"


def test_histeresis_de_los_escalones(js):
    p = js["puras"]
    assert p["constantes"] == {"reposo": 220, "arranque": 150, "presupuesto": 36, "max": 2}
    assert p["mediana"] == [5, 0, 30]
    assert p["sube"] == [2, 2, 1, 1], "sube de uno en uno, con tope, y sólo por ENCIMA del presupuesto"
    assert p["siguiente"] == [1, 2, 0, 1], "un gesto holgado deja bajar un escalón al siguiente; uno justo, no"


def test_un_salto_corto_no_toca_la_densidad(js):
    c = js["corto"]
    assert c["tamanos"] == [] and c["redibujos"] == 0 and c["estado"]["gestos"] == 0, "un jumpTo de seguirte no puede parpadear"


def test_un_movil_que_va_sobrado_nunca_ve_ningun_cambio(js):
    s = js["sobrado"]
    assert s["tamanos"] == [] and s["redibujos"] == 0, "a 16 ms por fotograma el mapa se queda exactamente como está, también en movimiento"
    assert s["enGesto"]["pixelRatio"] == 3 and s["enGesto"]["gestos"] == 1 and s["enGesto"]["mediana"] == 16


def test_un_movil_justo_baja_de_uno_en_uno_y_devuelve_la_densidad_tras_el_reposo(js):
    g = js["lento"]
    assert g["antes"]["pixelRatio"] == 3 and g["antes"]["gestos"] == 0, "antes de 150 ms no se mide nada"
    assert g["aMitad"]["pixelRatio"] == 3, "con la ventana de 8 fotogramas a medias no se decide nada"
    assert (g["escalon1"]["escalon"], g["escalon1"]["pixelRatio"]) == (1, 2)
    assert (g["escalon2"]["escalon"], g["escalon2"]["pixelRatio"]) == (2, 1.5)
    assert g["tope"]["escalon"] == 2, "el escalón 2 es el tope"
    assert g["trasMenosDelReposo"]["bajado"], "se espera el reposo (220 ms) antes de devolver la densidad"
    assert g["trasElReposo"]["pixelRatio"] == 3 and not g["trasElReposo"]["bajado"]
    assert g["tamanos"] == [2, 1.5, 3] and g["redibujos"] == 3, "un redibujado síncrono por cambio: el lienzo no se queda en blanco"
    assert g["override"] is None, "se devuelve el valor original (sin forzar), no un 3 fijo"


def test_el_siguiente_gesto_empieza_donde_acabo_y_baja_un_escalon_si_fue_holgado(js):
    s = js["siguiente"]
    assert s["segundo"]["escalon"] == 2 and s["segundo"]["pixelRatio"] == 1.5, "arranca sin volver a pasar por el escalón 1"
    assert s["holgado"]["escalon"] == 2, "a mitad de gesto sólo se sube, nunca se baja por unos fotogramas buenos"
    assert s["tercero"]["escalon"] == 1 and s["tercero"]["pixelRatio"] == 2, "el gesto holgado deja bajar un escalón al siguiente"


def test_un_gesto_seguido_de_otro_no_parpadea(js):
    s = js["seguido"]
    assert s["tamanos"] == [2, 3], "una sola bajada y una sola subida para los dos gestos"
    assert s["seguido"]["bajado"] and s["final"]["pixelRatio"] == 3
    assert s["oyentesDeRender"] == 1, "el segundo gesto vuelve a medir, sin duplicar el escuchador"


def test_pausar_apaga_el_aligerado(js):
    p = js["pausa"]
    assert not p["pausado"]["bajado"] and p["pausado"]["gestos"] == 0
    assert p["bajado"]["bajado"]
    assert not p["trasPausar"]["bajado"] and p["trasPausar"]["pixelRatio"] == 3 and p["oyentesDeRender"] == 0


def test_respeta_el_ahorro_y_los_moviles_de_densidad_1(js):
    assert js["densidad1"]["tamanos"] == [], "con densidad 1 no hay nada que bajar"
    a = js["ahorro"]
    assert a["bajado"]["pixelRatio"] == 1.33 and a["override"] == 2 and a["final"]["pixelRatio"] == 2, "el tope 2 del ahorro de batería se devuelve tal cual"


def test_sin_el_privado_de_maplibre_usa_el_publico(js):
    assert js["sinPrivado"]["llamadas"] == [2]


def test_destruir_devuelve_la_densidad_y_quita_los_escuchadores(js):
    d = js["destruir"]
    assert d["override"] is None and d["tamanos"] == [2, 3]
    assert d["oyentes"] == {"movestart": 0, "moveend": 0, "render": 0}


def test_el_modulo_no_toca_el_estilo_ni_las_capas():
    """`setLayoutProperty` rehace teselas y `setPaintProperty` repinta el terreno: el aligerado sólo toca la densidad."""
    codigo = re.sub(r"/\*.*?\*/", "", leer(COMP / "mapa" / "movimientoLigero.ts"), flags=re.S)
    codigo = re.sub(r"//.*", "", codigo)
    for prohibido in ("setLayoutProperty", "setPaintProperty", "setLayerZoomRange", "setTerrain", "setFeatureState", "setData("):
        assert prohibido not in codigo, prohibido


def test_el_mapa_lo_cablea_y_lo_quita_al_desmontar():
    mapa = leer(COMP / "MapSurfaceGL.tsx")
    assert "aligerarMientrasSeMueve(mapa)" in mapa
    assert mapa.index("const ligero") < mapa.index("ligero.destruir()") < mapa.index("      mapa.remove()\n      mapaRef.current = null"), (
        "se crea tras el mapa y se destruye antes de mapa.remove()"
    )
    assert "__sagaLigero = ligero" in mapa, "asa de depuración (sólo en el bloque de ?depurar-mapa) para medir con y sin"


def test_el_privado_que_usa_existe_en_el_maplibre_instalado():
    dist = RAIZ / "frontend" / "node_modules" / "maplibre-gl" / "dist" / "maplibre-gl-dev.mjs"
    if not dist.exists():
        pytest.skip("frontend/node_modules sin instalar")
    fuente = leer(dist)
    assert re.search(r"^\t_resizeInternal\(", fuente, re.M), "MapLibre cambió: `_resizeInternal` ya no existe (ver ponerDensidad)"
    assert "this._overridePixelRatio = pixelRatio" in fuente


def test_las_fuentes_del_juego_se_tesela_solo_hasta_z16():
    """Con el mapa girando entraban ~3,5 teselas/s por fuente y cada una subía su atlas de imágenes (33 % del hilo)."""
    estilo = leer(COMP / "mapa" / "estilo.ts")
    assert "export const ZOOM_MAXIMO_GEOJSON = 16" in estilo
    fuentes = re.findall(r"\[(FUENTE_[A-Z_]+)\]: \{ type: 'geojson', data: COLECCION_VACIA[^}]*\}", estilo)
    assert set(fuentes) == {
        "FUENTE_RADIO", "FUENTE_RUTA", "FUENTE_NODOS_VOLUMEN", "FUENTE_NODOS_ICONOS", "FUENTE_FOTOS", "FUENTE_JUGADOR",
        "FUENTE_OTROS", "FUENTE_OTROS_LINEAS", "FUENTE_CELEBRACION", "FUENTE_GUIA",
    }
    for linea in re.findall(r"\[FUENTE_[A-Z_]+\]: \{ type: 'geojson', data: COLECCION_VACIA[^}]*\}", estilo):
        assert "maxzoom: ZOOM_MAXIMO_GEOJSON" in linea, linea
    # El teselado de las casas (z16) y el de los mapas base no cambian
    assert "maxzoom: 16,\r\n                tolerance: 0.5" in estilo or "maxzoom: 16,\n                tolerance: 0.5" in estilo

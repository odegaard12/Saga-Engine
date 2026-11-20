# -*- coding: utf-8 -*-
"""16/11/2026 (Óscar): «a vista de Galicia mi marcador sale muy lejos de Catoira y los nodos aparecen en otros concellos;
y los nodos no encogen con el zoom».

Causa: apartar (repartoDeNodos.ts, racimo de retratos) es mover en PÍXELES; a z8 un píxel son ~225 m y la separación de
una moneda o un retrato (decenas de px) salía a kilómetros de la coordenada real (regresión de 6.7.0). Ahora, por debajo
de ZOOM_SEPARAR sólo se agrupa (icono con número en el centroide real) y nadie se mueve; el tamaño de nodos y bolas 3D
encoge con el zoom. Simulación en tests/js/mapa_zoom_16_11.cjs.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player" / "components"


@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "mapa_zoom_16_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_marcador_y_nodos_en_su_coordenada_a_cualquier_zoom(datos):
    # zoom 6, 8, 11, 14 (y 14,9): nadie apartado de su punto (ni tú, ni los compañeros, ni los nodos).
    for z in ("6", "8", "11", "14", "14.9"):
        assert datos["desvioJugadores"][z] < 0.01, (z, datos["desvioJugadores"][z])
        assert datos["desvioNodos"][z] < 0.01, (z, datos["desvioNodos"][z])
    assert datos["aisladoZ18"] < 0.01  # a z18, sin solape, un compañero sigue en su punto


def test_lejos_solo_se_agrupa_y_es_determinista(datos):
    assert datos["determinista"]
    # A z8 los dos compañeros (a 5 y 50 m de ti) se tapan entre sí: un solo icono con el 2 (no se mueven).
    assert datos["grupos"]["8"] == [2]


def test_tamano_de_nodos_sigue_al_zoom(datos):
    t = datos["tamanos"]
    assert t["monotono"]
    assert t["z8"] < t["z11"] < t["z12"] < t["z16"] < t["z19"]
    # 20/11: suelo legible (moneda ~25 px, número ~12 px): sigue encogiendo con el zoom pero nunca por debajo de 0,7
    assert t["z4"] == t["z8"] and 0.69 < t["z8"] < t["z12"] and t["z8"] < 0.3 * t["z19"]
    f = datos["tresD"]
    assert f["monotono"] and f["z16"] == 1 and f["z18"] == 1
    assert f["z8"] == pytest.approx(0.2) and f["z8"] < f["z11"] + 1e-9 < f["z13"] < f["z16"]


def test_codigo_fuente_usa_las_curvas_nuevas():
    gl = (SRC / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "8, ['*', 0.7, SIN_ESCALON]," in gl  # 20/11: suelo legible a vista de región
    tres = (SRC / "nodosTresD.ts").read_text(encoding="utf-8")
    assert "factorTresDDeNodo(zoom)" in tres
    reparto = (SRC / "repartoDeNodos.ts").read_text(encoding="utf-8")
    assert "if (!nodos.length || lejos) return salida" in reparto
    jug = (SRC / "jugadoresEnMapa.ts").read_text(encoding="utf-8")
    assert "opciones.lejos ?? zoom < ZOOM_SEPARAR) return planLejano(" in jug


def test_modo_lejos_sin_estado_en_z16_5(datos):
    # 16/11 (2.º intento, gestos reales): sin histéresis, el modo depende SÓLO del zoom de ahora.
    h = datos["histeresis"]
    assert h["alejando"] == [True, True, True]  # 16 es el umbral: 15,1 14,9 14,7 siempre lejos
    assert h["acercando"] == [True, True, True]
    assert h["inicial"] == [True, True]


def test_principios_p1_p6_en_el_codigo():
    """P1-P6 (dueño, 16/11): el reparto no depende de la cámara ni del gesto; se rehace en vivo; apartado geográfico."""
    jug = (SRC / "jugadoresEnMapa.ts").read_text(encoding="utf-8")
    assert "export const ZOOM_SEPARAR = 16" in jug
    assert "Math.max(ZOOM_SEPARAR, Math.floor(zoom * 4) / 4)" in jug
    mapa = (SRC / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "cubetaDeZoom" in mapa  # rehace nodos y jugadores a cada cuarto de zoom, durante el gesto
    assert "planDeJugadores(otrosAnclados, zoomDeReparto(" in mapa
    assert "inclinacion: 0," in mapa and "rumbo: 0," in mapa  # girar/mover no cambia a nadie
    assert "proyeccion: undefined," in mapa
    assert "const proyeccion = undefined" in mapa  # nodos: reparto sin la proyección de la cámara
    assert "!m?.isZooming() && Boolean(m?.isMoving())" in mapa  # el zoom no se retiene hasta soltar
    assert "const k = Math.min(1, Math.max(0, (z - ZOOM_SEPARAR) / 0.5))" in mapa  # apartado en metros, sin deslizar


def test_cluster_de_nodos_lejos(datos):
    c = datos["clusters"]
    # A z8 los dos nodos a 30 m forman UN clúster con su número; Marín, Este y NO quedan sueltos.
    assert [m for m, _, _ in c["z8"]] == [["1", "2"]]
    lat = (42.6903 + 42.6905) / 2
    assert c["z8"][0][1] == pytest.approx(lat, abs=1e-9)  # centroide geográfico REAL, nada desplazado
    assert c["igual"] and c["repetido"] and c["centroideOk"]
    assert c["z18"] == 0 or c["z18"] == 1  # al acercarse se abren (a z18 30 m ya son decenas de píxeles)


def test_codigo_fuente_clusters_y_corro_en_pixeles():
    gl = (SRC / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "corroSuave(base.clave, base.corro, ahora)" in gl and "corroSuave(CLAVE_YO, corroPropioRef.current, ahora)" in gl and "corroEscalado(valor(x))" in gl
    assert "mapa.on('zoom', alZoomFotograma)" in gl
    assert "nodos-grupo-" in gl and "mapa.on('click', CAPA_NODOS_ICONOS" in gl
    assert "agruparNodosLejos(repartibles" in gl

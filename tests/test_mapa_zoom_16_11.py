# -*- coding: utf-8 -*-
"""16/11/2026 (Óscar): «a vista de región mi marcador sale muy lejos de mi sitio y los nodos aparecen en otros municipios;
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
from fuente_del_mapa import fuente_del_mapa  # noqa: E402

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
    gl = fuente_del_mapa()
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
    assert "export const ZOOM_SEPARAR = ZOOM_MINIMO_AVATARES" in jug  # un solo umbral (antes dos constantes con el 16)
    assert "export const ZOOM_DEL_REPARTO = 17.5" in jug and "return estaLejos(zoom) ? Math.floor(zoom * 4) / 4 : ZOOM_DEL_REPARTO" in jug
    mapa = fuente_del_mapa()
    # 20/11 (dueño: «que no se muevan al hacer zoom»): ya NO se rehace a cada cuarto de zoom, y si la composición del plan
    # no cambia se conservan los apartados. 21/11 (medido: aún se movían hasta 60 m): de cerca el plan se hace SIEMPRE al
    # zoom fijo del reparto, en metros, con todos contando como cuerpo (quién va en 3D cambia con el zoom).
    assert "cubetaDeZoom" not in mapa
    # 23/11 (fuente única): el plan y los nodos usan UNA definición del zoom del reparto (`zoomDeReparto`), de cerca siempre el
    # de jugar; el apartado del poste lo da la fuente de posición en metros, sin mirar el zoom ni la cámara.
    assert "const zoomN = zoomDeReparto(zoomVivo)" in mapa
    assert "planDeJugadores(otrosAnclados, lejos ? zoomDeReparto(zoom) : ZOOM_DEL_REPARTO, {" in mapa
    # Mover, inclinar o girar no cambia a nadie (el plan ya no recibe ni giro ni inclinación ni proyección ni vista).
    assert "cuadranteDeLaCamara" not in mapa and "getBearing() ?? 0, rumbo" not in mapa
    assert "proyeccion" not in mapa.split("pintarNodosRef.current = () => {", 1)[1][:900]
    assert "const proyeccion = undefined" not in mapa and "ProyeccionDelMapa" not in mapa
    # 21/11: el apartado no se reescala con el zoom de ahora; 23/11: ni se guarda por plan (corrosDelPlanRef/corroSuave: borrados).
    assert "metrosDeUnJugador" not in mapa and "corroEscalado" not in mapa and "corrosDelPlanRef" not in mapa and "corroSuave" not in mapa


def test_cluster_de_nodos_lejos(datos):
    c = datos["clusters"]
    # A z8 los dos nodos a 30 m forman UN clúster con su número; Sur, Este y NO quedan sueltos.
    assert [m for m, _, _ in c["z8"]] == [["1", "2"]]
    lat = (42.1903 + 42.1905) / 2
    assert c["z8"][0][1] == pytest.approx(lat, abs=1e-9)  # centroide geográfico REAL, nada desplazado
    assert c["igual"] and c["repetido"] and c["centroideOk"]
    assert c["z18"] == 0 or c["z18"] == 1  # al acercarse se abren (a z18 30 m ya son decenas de píxeles)


def test_codigo_fuente_clusters_y_corro_en_pixeles():
    gl = fuente_del_mapa()
    # 23/11: el apartado (en metros, animado de forma continua) lo da la fuente de posición, no un corro por plan.
    assert "fuente.dibujo(base.clave, ahora)" in gl and "corroPropioRef" not in gl and "corroSuave" not in gl
    assert "mapa.on('zoom', alZoomFotograma)" in gl
    assert "nodos-grupo-" in gl and "mapa.on('click', CAPA_NODOS_ICONOS" in gl
    assert "agruparNodosLejos(repartibles" in gl

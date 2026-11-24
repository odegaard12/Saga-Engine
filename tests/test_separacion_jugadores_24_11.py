# -*- coding: utf-8 -*-
"""24/11/2026 (Óscar, 6.12.17 en su iPhone, en casa con una compañera al lado):

1. «el de mi compañera está pegadísimo al mío»: los cuerpos y retratos se dibujan mucho más grandes que una persona y la fuente sólo
   separaba junto a los postes (1,6 m). Ahora separa a las PERSONAS en cualquier sitio con la huella que se ve a este zoom.
2. «si pongo en 2D el personaje se va esperando y el retrato se separa de la ubicación»: el racimo de retratos de la vista
   2D movía a cada uno ~26 m, y el cuerpo esperaba a que la cámara llegase a <20°. Ahora 2D y 3D usan el mismo `dibujo` y
   el cuerpo se funde con su retrato en el mismo punto en cuanto se pulsa (250 ms, de golpe con «reducir movimiento»).

Lógica en Node (tests/js/separacion_jugadores_24_11.cjs) y estáticos del camino 2D. Medido en el navegador: scratchpad
separacion-2d (separa.mjs).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


@pytest.fixture(scope="module")
def d():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "separacion_jugadores_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def leer(rel):
    return (SRC / rel).read_text(encoding="utf-8-sig")


# ---------------------------------------------------------------- 1. lógica

def test_la_separacion_es_la_huella_que_se_ve(d):
    h = {float(k): v for k, v in d["huella"].items()}
    # ~62 m a z16, ~26 m a z17,5, ~11 m a z19, ~6,5 m a z20: cuanto más lejos, más suelo ocupa un retrato.
    assert 55 < h[16] < 70 and 22 < h[17.5] < 30 and 9.5 < h[19] < 13 and 5.5 < h[20] < 7.5, h
    for z, px in d["huellaPx"].items():
        assert px["sepPx"] >= px["retratoPx"] * 1.07 and px["retratoPx"] > px["aroPx"], (z, px)
    c = d["huellaContinua"]
    # Continua con el zoom (entra entre z15 y z16, al ritmo al que se deshacen los grupos de lejos) y 0 lejos.
    assert c["z14"] == 0 and c["z15"] == 0 and c["peorSaltoPorMilesimaDeZoom"] <= 0.2, c


def test_tu_y_otro_juntos_quedan_justo_a_la_separacion_y_tu_quieto(d):
    s = d["dos"]
    assert s["casos"] == 20 and s["yoMovido"] == 0, s
    assert s["peorHueco"] >= -0.01, s   # nunca se pisan
    assert s["peorExceso"] <= 0.01, s   # y se aparta sólo lo justo (sep − distancia)


def test_cuatro_en_dos_metros_no_se_pisan(d):
    c = d["cuatro"]
    assert c["casos"] == 8 and c["yoMovido"] == 0, c
    assert c["minRel"] >= 0.98, c
    assert c["maxApartadoRel"] <= c["TOPE"] == 2, c


def test_no_depende_del_orden_de_llegada_ni_de_quien_esta_lejos(d):
    assert d["orden"] == {"casos": 200, "distintos": 0}
    assert d["lejos"]["movidos"] == 0 and d["lejos"]["porLejano"] == 0, d["lejos"]
    assert d["sinSeparacion"]["apartado"] == 0


def test_el_zoom_continuo_no_hace_saltar_a_nadie(d):
    z = d["zoomContinuo"]
    assert z["yoMovido"] == 0 and z["peorPasoRel"] <= 0.1, z


def test_el_fundido_de_vista_es_corto_y_respeta_reducir_movimiento(d):
    f = d["fundido"]
    assert f["ms"] == 250 and 240 <= f["llegaEnMs"] <= 272, f
    # A 125 ms, la mitad; si se da la vuelta a medias, sigue desde ahí.
    assert f["a125ms"] == 0.5 and f["vuelta"] == 0.5 and f["aMedias"] == 0.9 and f["pasado"] == 1 and f["reducido"] == 0, f
    v = d["vista"]
    assert v["manda2D"] is False and v["manda3DConLaCamaraAunPlana"] is True and v["lejosNunca"] is False, v
    assert v["sinVistaUmbral"] == [False, True], "sin vista, el umbral de 20° de siempre"


# ---------------------------------------------------------------- 2. estáticos del camino 2D

def test_la_vista_2d_no_tiene_racimo_propio():
    m = leer("components/MapSurfaceGL.tsx")
    assert "{ lejos, racimos: false })" in m
    assert "forzados" not in m and "forzados" not in leer("posicion/fuentePosicion.ts")
    # La separación se pone antes de CADA cálculo de la fuente (dibujo 2D, capa 3D y depuración) y sólo con zoom y tu latitud.
    assert m.count("ponerSeparacion(") == 4
    assert m.count("fuente.calcular(ahora)") == 2
    for trozo in m.split("fuente.calcular(ahora)")[:-1]:
        assert "ponerSeparacion(fuente" in trozo[-200:], "separación puesta justo antes de calcular"
    assert "separacionEntreJugadoresM(mapa.getZoom(), lat ?? mapa.getCenter().lat)" in m
    # Durante el zoom los retratos se recolocan (el bucle se para solo si nadie se aparta).
    assert "const alZoomFotograma = () => {\r\n      movilRef.current?.arrancar()" in m or "const alZoomFotograma = () => {\n      movilRef.current?.arrancar()" in m


def test_el_cambio_de_vista_empieza_al_pulsar_y_se_funde():
    m = leer("components/MapSurfaceGL.tsx")
    assert "vista3D: () => tresDRef.current," in m and "alMezclar: () => sincronizarTresDRef.current()," in m
    assert "capa ? capa.mezcla(clave) : enTresD.has(clave) ? 1 : 0" in m
    capa = leer("avatares3d/mixamo/capaAvatares.ts")
    assert "formaQuePermiteTresD(ctx.zoom, (ctx.inclinacion * 180) / Math.PI, opciones.vista3D?.())" in capa
    assert "pasoDeMezcla(e.mezcla, hacia, Math.min(MS_MAX_POR_FOTOGRAMA_DE_FUNDIDO, ctx.dt * 1000), reducido)" in capa
    assert "const MS_MAX_POR_FOTOGRAMA_DE_FUNDIDO = 40" in capa, "un atasco al pulsar no se come el fundido"
    assert "* Math.max(0.02, mezcla * mezcla * (3 - 2 * mezcla))" in capa, "el cuerpo encoge hacia sus pies (mismo punto que el retrato)"
    assert "const mc = real" in capa, "el cuerpo sigue en `dibujo`: el fundido no lo mueve"
    capas = leer("components/mapa/capas.ts")
    assert "['-', 1, ['number', ['feature-state', 'tresD'], 0]]" in capas
    estilo = leer("components/mapa/estilo.ts")
    assert "['boolean', ['feature-state', 'tresD'], false]" not in estilo + capas, "el estado ya no es un sí/no"
    assert estilo.count("VISTO_SIN_CUERPO]") == 2


def test_la_fuente_sigue_siendo_pura():
    s = leer("posicion/fuentePosicion.ts")
    for prohibido in ("maplibre", "document.", "window.", "getZoom", "getBearing", "getPitch", "project(", "unproject("):
        assert prohibido not in s, prohibido
    assert "export const TOPE_GENTE_POR_SEPARACION = 2" in s and "function separarPersonas(" in s

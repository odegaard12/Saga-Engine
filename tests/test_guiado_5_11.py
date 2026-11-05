# -*- coding: utf-8 -*-
"""Guiado hacia el nodo (5/11), probado andando con GPS simulado por una rejilla de calles con red de caminos.

Al seguir la ruta por caminos ya calculada, la línea iba de ti HACIA ATRÁS hasta donde se pidió la ruta (hasta 56 m
andando) y luego volvía. Ahora la ruta de antes se corta en tu punto, y una ruta que llega tarde sólo se tira si
cambió el destino.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
MAPA = RAIZ / "frontend" / "src" / "player" / "components" / "MapSurfaceGL.tsx"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin dependencias del frontend")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "guia_desde_aqui.cjs")], capture_output=True, text=True,
                       timeout=60, cwd=RAIZ)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_la_ruta_de_antes_empieza_en_ti(js):
    assert js["enLaRuta"]["primeroM"] <= 1, "el primer punto es tu proyección en la ruta, no su principio"
    assert js["enLaRuta"]["puntos"] == 5 and js["enLaRuta"]["ultimoIgual"]


def test_si_te_apartas_de_la_ruta_se_deja_entera(js):
    assert js["apartado"]["igual"]
    assert js["corta"] == {"vacia": 0, "uno": 1}


def test_el_mapa_pinta_la_guia_desde_aqui_y_no_tira_rutas_que_llegan_tarde():
    fuente = MAPA.read_text(encoding="utf-8")
    assert fuente.count("guiaDesdeAqui(previa.coords, playerPosition)") == 2
    assert "if (pedidaRef.current?.hastaClave !== peticion.hastaClave) return" in fuente
    assert "if (pedidaRef.current !== peticion) return" not in fuente


def test_las_cuatro_mejoras_del_guiado():
    """5/11 (Óscar, «como veas»): flechas en la guía, flechas de lejos más espaciadas, el tramo sin camino conocido
    aparte y por caminos desde 60 m."""
    fuente = MAPA.read_text(encoding="utf-8")
    # Chevrones sobre la guía a trazos (no sobre el tramo sin camino).
    assert "id: CAPA_GUIA_FLECHAS," in fuente and "source: FUENTE_GUIA," in fuente
    # Flechas también por debajo de z16, más espaciadas (la misma imagen, más ancha).
    bloque = fuente[fuente.index("id: CAPA_RUTA_FLECHAS_LEJOS,") :][:400]
    assert "minzoom: 13," in bloque and "maxzoom: 16," in bloque and "ICONO_FLECHA_LEJOS" in bloque
    assert "? dibujarFlechaDeRuta(110)" in fuente
    efectos = (RAIZ / "frontend" / "src" / "player" / "avatares" / "dibujarEfectos.ts").read_text(encoding="utf-8")
    assert "export function dibujarFlechaDeRuta(ancho = 36)" in efectos
    # El tramo de ti a la red de caminos, punteado aparte y dicho en el aviso.
    assert "properties: { tipo: 'sin_camino' }" in fuente and "id: CAPA_GUIA_SIN_CAMINO," in fuente
    assert "{sinCaminoConocido ? ' · sin camino conocido' : ''}" in fuente
    # Por caminos desde 60 m.
    assert "const GUIA_POR_CAMINOS_DESDE_M = 60" in fuente and "if (mejorMetros > 120)" not in fuente


def test_sin_camino_conocido_mira_los_tramos_y_no_solo_los_cruces():
    """En una pista larga el cruce más cercano puede estar a 500 m: no por eso estás «sin camino conocido»."""
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin dependencias del frontend")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "distancia_a_la_red.cjs")], capture_output=True, text=True,
                       timeout=60, cwd=RAIZ)
    assert r.returncode == 0, r.stderr
    assert json.loads(r.stdout) == {"enLaPista": 0, "a30": 30, "lejos": True}
    fuente = MAPA.read_text(encoding="utf-8")
    assert "alCaminoM: red.alCaminoM()," in fuente
    assert "(alCamino === null || (alCamino ?? 0) > SIN_CAMINO_DESDE_M)" in fuente
    worker = (RAIZ / "frontend" / "src" / "player" / "routing" / "roadGraph.worker.ts").read_text(encoding="utf-8")
    assert "distanciaALaRedM(grafo, m.desde, m.pegadoM)" in worker


def test_rumbo_en_cono_del_color_del_jugador():
    """5/11 (Óscar aprobó la B larga): cono del color de cada jugador que nace en el aro y se funde hacia delante, y
    chevrones suaves. Ya sin interruptor ni flecha vieja."""
    avatares = RAIZ / "frontend" / "src" / "player" / "avatares"
    assert not (avatares / "estiloRumbo.ts").exists()
    suelo = (avatares / "dibujarSuelo.ts").read_text(encoding="utf-8")
    assert "if (conRumbo) dibujarConoDeRumbo(ctx, c, color, 47)" in suelo
    assert suelo.index("dibujarConoDeRumbo(ctx, c, color") < suelo.index("// Aro del color del equipo")
    assert "fundido.addColorStop(1, color + '00')" in suelo and "estiloRumbo" not in suelo
    assert "ctx.lineTo(10.5, -24)" not in suelo, "la flecha vieja ya no está"
    efectos = (avatares / "dibujarEfectos.ts").read_text(encoding="utf-8")
    assert "rgba(255,255,255,.82)" in efectos and "estiloRumbo" not in efectos and "rgba(11,18,32,.6)" not in efectos
    # Una imagen por color (`pjs-<color>-<0|1>`) que el mapa guarda: no se redibuja cada fotograma.
    assert "/^pjs-([0-9a-f]{6})-([01])$/" in MAPA.read_text(encoding="utf-8")

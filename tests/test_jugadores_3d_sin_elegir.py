# -*- coding: utf-8 -*-
"""Caso real (5.49.0, móvil): «sale mi jugador, pero detrás pone una compañera con su icono y no sale su muñeco 3D
por mucho que amplíe». 13 de 14 perfiles reales no habían elegido personaje (`character_chosen: false`, personaje
antiguo en `character`): deben verse en 3D con su aspecto por defecto, y si hay tope de calidad el reparto ha de ser
justo (tú no gastas plaza) y explicable (`?depurar-mapa`).

La lógica pura se ejecuta en Node (tests/js/jugadores3d_r8.cjs); lo que sólo existe dentro de React/MapLibre se
comprueba por el código, como en el resto de pruebas del repo. Nombres sintéticos: nada de datos reales.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src" / "player"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "jugadores3d_r8.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)


def test_quien_no_eligio_personaje_tiene_su_aspecto_por_defecto(js):
    s = js["sinElegir"]
    assert s["valido"] and s["mx"] == s["defecto"]
    # El personaje antiguo que trae el servidor NO cambia su aspecto: sale de su id.
    assert js["sinElegirEstable"] is True


def test_con_calidad_baja_el_companero_cercano_sin_elegir_sale_en_3d(js):
    b = js["baja"]
    assert b["tope"] == 3
    assert "Jugador01" in b["tresD"]  # el 3.º más cercano al centro
    assert b["tresD"][0] == "yo" and len(b["tresD"]) == 4  # tú + 3
    assert set(b["porTope"]) == {"Jugador03", "Jugador05"}  # los dos más lejanos


def test_tu_plaza_no_gasta_el_tope(js):
    assert js["yoNoGastaPlaza"] == ["yo", "A", "B", "C"]
    assert js["yoSinModelo"] == ["A", "B", "C"]
    assert js["sinModeloNoGasta"] == ["B", "C", "D"]


def test_el_mas_cercano_al_centro_siempre_va_en_3d(js):
    assert js["siempreElMasCercano"] == ["cerca", "cerca", "cerca"]


def test_quien_ya_va_en_3d_no_parpadea_por_una_diferencia_pequena(js):
    assert "E" in js["histeresis"] and "D" not in js["histeresis"]


def test_motivos_del_diagnostico(js):
    assert js["motivos"] == {
        "tresD": None, "sinPosicion": "sin_posicion", "antigua": "presencia_antigua", "agrupado": "agrupado",
        "zoomBajo": "zoom_bajo", "plano": "mapa_plano", "fuera": "fuera_de_pantalla", "noEsta": "sin_modelo",
        "fallo": "fallo_de_carga", "cargando": "cargando_modelo", "tope": "tope_de_calidad", "sinCota": "sin_cota",
        "stale": None,
    }
    assert js["textosCompletos"] is True


def test_el_texto_para_copiar_dice_todo(js):
    t = js["texto"].split("\n")
    assert t[0] == "calidad=baja tope=3(+tú) fps=42 zoom=18.0 inclinacion=60"
    assert t[1] == "* Tú | elegido=? | Ch23 | 3D"
    assert t[2] == "Jugador03 | elegido=no | Ch08 | retrato (tope de calidad)"


# ---------------------------------------------------------------- por el código

def test_la_presencia_del_equipo_pasa_los_campos_del_personaje():
    src = leer(FRONT / "offline" / "teamMapPresence.ts")
    for campo in ("character: profile.character", "character_chosen: profile.character_chosen", "avatar: profile.avatar"):
        assert campo in src


def test_el_panel_de_depuracion_solo_sale_con_el_parametro():
    mapa = leer(FRONT / "components" / "MapSurfaceGL.tsx")
    # Con `?depurar-mapa` o con un conmutador `?mapa=` activo (para poder quitarlo): ver test_conmutadores_mapa.py.
    assert re.search(
        r"if \(sinWebGL \|\| \(!hayDepuracionDeMapa\(\) && !conmutadoresActivos\.length\)\) return undefined\s+return instalarPanelDeDepuracion",
        mapa,
    )
    assert mapa.count("instalarPanelDeDepuracion(") == 1
    panel = leer(FRONT / "avatares3d" / "mixamo" / "panelDepuracion.ts")
    assert "has('depurar-mapa')" in panel
    assert "innerHTML" not in panel  # los nombres los escribe el jugador
    assert "'Copiar'" in panel


def test_el_cuerpo_no_espera_a_una_cota_que_no_llega():
    capa = leer(FRONT / "avatares3d" / "mixamo" / "capaAvatares.ts")
    assert "sinCotaDesde" in capa and "queryTerrainElevation(centro)" in capa
    assert "modelosQueFaltan" in capa and "permitirRed" not in capa


# ---------------------------------------------------------------- créditos del mapa

def test_no_hay_boton_de_atribucion_sobre_el_mapa_y_los_creditos_estan_en_la_pantalla_de_carga():
    mapa = leer(FRONT / "components" / "MapSurfaceGL.tsx")
    assert "new maplibregl.AttributionControl" not in mapa
    assert "attributionControl: false" in mapa
    css = leer(FRONT / "components" / "map-surface.css")
    assert "maplibregl-ctrl-attrib" not in css
    carga = leer(FRONT / "components" / "PantallaDeCarga.tsx")
    assert "creditosDelMapa(locale)" in carga
    creditos = leer(FRONT / "components" / "creditosMapa.ts")
    for idioma in ("es:", "gl:", "en:"):
        assert idioma in creditos
    assert "Esri" in creditos and "Mapzen" in creditos
    # Las fuentes siguen declarando su atribución (obligación de la licencia).
    assert "Imágenes &copy; Esri" in mapa and "Terrain Tiles" in mapa
    assert "Esri" in leer(RAIZ / "README.md")

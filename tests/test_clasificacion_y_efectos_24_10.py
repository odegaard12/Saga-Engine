# -*- coding: utf-8 -*-
"""24/10/2026: lo elegido de las propuestas de clasificación, recuadros y efectos del mapa (tests/js/clasificacion_y_efectos_24_10.cjs).

- Clasificación: «tu carrera» arriba (puesto, ▲/▼, delante y detrás) y la tabla debajo. La distancia con el de
  delante sólo resta tiempos si los dos van por el mismo nodo; si no, se cuenta en nodos.
- La barra de cada fila comparaba tu tiempo con el del PRIMERO aunque fuerais por nodos distintos (el del nodo 1 con
  poco tiempo salía con la barra casi llena). Ahora son tramos: nodos hechos.
- Efectos del mapa: sello al hacer un nodo, encuadre al tocar a un compañero y la ruta entera al acabar. Con
  «reducir movimiento», la cámara salta y no hay sello ni anillo.
- Pizarra: sin las dos animaciones que no paraban (el punto «en vivo» y la estrella del coleccionable).

Sin Node o sin frontend/node_modules, lo de JS se salta.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
COMP = RAIZ / "frontend" / "src" / "player" / "components"
ARNES = RAIZ / "tests" / "js" / "clasificacion_y_efectos_24_10.cjs"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(ARNES)], capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ)
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


def _leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


# --- Distancia con el de delante ---------------------------------------------------------------------------------


def test_mismo_nodo_se_resta_el_tiempo(js):
    c = js["clasificacion"]
    assert c["mismoNodo"] == {"tipo": "tiempo", "ms": 10000}
    assert c["terminados"] == {"tipo": "tiempo", "ms": 32000}, "los dos terminados: por tiempo"
    assert c["empate"] == {"tipo": "empate"}


def test_nodos_distintos_se_cuenta_en_nodos_no_en_tiempo(js):
    c = js["clasificacion"]
    # PRUEBA07 (nodo 1, 1m 30s) tiene MENOS tiempo que PRUEBA06 (nodo 2): restar diría «-1m 25s», que no es nada.
    assert c["nodosDistintos"] == {"tipo": "nodos", "n": 1}
    assert c["dosNodos"] == {"tipo": "nodos", "n": 2}


def test_sin_dato_no_se_inventa_distancia(js):
    c = js["clasificacion"]
    assert c["sinTiempoDelante"] is None
    assert c["sinEmpezar"] is None
    assert c["primero"] is None


# --- La barra corregida ------------------------------------------------------------------------------------------


def test_la_barra_son_nodos_hechos_y_no_el_tiempo_del_primero(js):
    c = js["clasificacion"]
    assert c["tramosRapidoEnNodo1"] == 1, "el del nodo 1 con poco tiempo salía con la barra casi llena"
    assert c["tramosTerminado"] == 4
    assert c["tramosDeMas"] == 4, "nunca más tramos que nodos"
    assert c["total"] == 6 and c["totalSinDato"] == 1
    hoja = _leer(COMP / "RankingSheet.tsx")
    assert "mejorTiempo" not in hoja and "const ratio" not in hoja, "volvió la barra comparada con el primero"


# --- Puestos ganados o perdidos ----------------------------------------------------------------------------------


def test_puestos_ganados_y_perdidos(js):
    c = js["clasificacion"]
    assert c["orden"] == ["PRUEBA01", "PRUEBA02", "PRUEBA05", "PRUEBA06", "PRUEBA07", "PRUEBA09"]
    assert c["puestos"]["PRUEBA06"] == 4
    assert c["sube"] == 2
    assert c["baja"] == -1
    assert c["igual"] == 0 and c["nuevo"] == 0 and c["sinUsuario"] == 0


def test_el_orden_sigue_siendo_el_de_siempre_y_se_mira_al_abrir():
    hoja = _leer(COMP / "RankingSheet.tsx")
    assert "ordenarClasificacion(players)" in hoja
    # Lo que viste la última vez se lee al montar la tabla, que se monta al abrir (la hoja se queda montada).
    assert "function Tabla(" in hoja and "<Tabla sorted={sorted}" in hoja
    assert "usePuestosAnteriores(sorted, selfUser)" in hoja.split("function Tabla(")[1]
    # El deslizado de filas no corre con «reducir movimiento».
    assert "prefiereMenosMovimiento(window.matchMedia" in hoja


def test_los_textos_nuevos_estan_en_los_tres_idiomas():
    textos = _leer(COMP / "textosDePantallas.ts")
    for clave in ("tuPuesto", "nodosDetras", "colJugador", "colTiempo", "cambioDePuesto", "vasEnCabeza"):
        assert textos.count(f"    {clave}:") == 3, clave
    assert "'O teu posto'" in textos and "'Xogador'" in textos and "'Tempo'" in textos


# --- Efectos del mapa ------------------------------------------------------------------------------------------


def test_tocar_a_un_companero_encuadra_en_0_9_s_con_anillo(js):
    t = js["efectos"]["tocar"]
    assert t["anima"] is True and t["duracion"] == 900
    assert t["zoom"] == 18 and t["offset"] == [0, -176], "en el tercio de arriba, encima de su ficha"
    assert t["pitch"] is False, "no toca la inclinación: el 2D/3D es del jugador"
    assert t["piezas"] == 1 and t["animaciones"] == 1, "el anillo, una vez"


def test_nodo_hecho_se_sella_y_fin_de_ruta_ve_la_ruta_entera(js):
    e = js["efectos"]
    assert e["sello"]["sellado"] is True and e["sello"]["piezas"] == 1
    r = e["ruta"]
    assert r["vista"] is True and r["duracion"] == 2000
    assert r["caja"] == [[-3.7, 40.4], [-3.68, 40.42]], "todos los nodos con coordenadas"
    assert r["corta"] is False, "con un solo nodo no hay ruta que enseñar"
    assert e["constantes"]["SELLO_MS"] <= 2000 and e["constantes"]["VER_RUTA_MS"] <= 2000


def test_con_reducir_movimiento_no_hay_animacion_de_camara(js):
    r = js["efectosReducido"]
    assert r["tocar"]["anima"] is False and r["tocar"]["duracion"] == 0, "la cámara salta"
    assert r["tocar"]["piezas"] == 0, "sin anillo"
    assert r["sello"]["sellado"] is False and r["sello"]["piezas"] == 0, "sin sello animado"
    assert r["ruta"]["duracion"] == 0


def test_el_mapa_usa_los_efectos_como_toca():
    mapa = _leer(COMP / "MapSurfaceGL.tsx")
    # Como «Ver en el mapa»: deja de seguirte ANTES de encuadrar (si no, el siguiente fix del GPS la devuelve a ti).
    i = mapa.index("encuadrandoRef.current = encuadrarJugador(mapa, el)")
    assert "onUserMapMoveRef.current?.()" in mapa[i - 300 : i]
    # El sello sustituye a la insignia; sin sello (reducir movimiento) la insignia sigue.
    assert "if (!sellado) features.push(punto({ tipo: 'insignia'" in mapa
    # La vista de la ruta entera espera al festejo y se cancela si tocas el mapa.
    assert "window.clearTimeout(verRutaRef.current)" in mapa.split("cortarCelebracionRef.current = () => {")[1][:200]
    # El muñeco de la ficha se crea cuando la cámara ha llegado (crear su WebGL deja el móvil sin pintar ~1 s).
    assert "esperaMs={encuadrandoRef.current ? ENCUADRE_MS : undefined}" in mapa


# --- Pizarra: nada en bucle ----------------------------------------------------------------------------------------


def test_ni_el_punto_en_vivo_ni_la_estrella_laten_sin_fin():
    ficha = _leer(RAIZ / "frontend" / "src" / "player" / "avatares3d" / "mixamo" / "ficha.css")
    assert "animation: saga-ficha-latido 1.8s ease-out 3;" in ficha
    assert not re.search(r"saga-ficha-latido[^;]*infinite", ficha)
    hoja = _leer(COMP / "InteractionSheet.tsx")
    assert "sagaIconFloat" not in hoja


def test_la_pizarra_sale_del_tema_y_no_toca_la_mochila():
    temas = _leer(RAIZ / "frontend" / "src" / "mobile-themes.css")
    assert "--saga-pizarra-a: color-mix(in srgb, rgb(var(--theme-ink-soft" in temas
    assert "var(--saga-pizarra)" in _leer(COMP / "RankingSheet.tsx")
    assert "var(--saga-pizarra)" in _leer(COMP / "InteractionSheet.tsx")
    # La mochila se queda como estaba: ni su hoja compartida ni su panel llevan la pizarra.
    for f in ("SwipeableSheet.tsx", "InventoryPanel.tsx", "PlayerHud.tsx"):
        assert "saga-pizarra" not in _leer(COMP / f), f

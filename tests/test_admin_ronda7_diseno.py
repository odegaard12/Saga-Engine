# -*- coding: utf-8 -*-
"""Ronda 7 del admin: barra de nodos con estado, editor por secciones y paneles.

Es rediseño de interfaz: no cambia datos ni API. Lo ejecutable (el estado de cada
nodo) se ejecuta en Node con `tests/js/estado_nodo.cjs`; lo de cableado se
comprueba por texto, para que no vuelvan las tres pestañas con pila plana ni la
barra de desplazamiento tapando las tarjetas.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "frontend" / "src" / "admin"


def leer(*partes: str) -> str:
    return (ADMIN / Path(*partes)).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def estado():
    if not shutil.which("node") or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("hace falta Node y frontend/node_modules")
    proc = subprocess.run(
        ["node", str(RAIZ / "tests" / "js" / "estado_nodo.cjs")],
        capture_output=True, text=True, timeout=60, encoding="utf-8",
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_un_nodo_normal_sale_completo(estado):
    assert estado["completo"]["nivel"] == "ok"
    assert estado["completo"]["motivos"] == []


def test_sin_nombre_ni_posicion_es_incompleto_y_dice_donde_arreglarlo(estado):
    problemas = {p["seccion"]: p["texto"] for p in estado["incompleto"]["problemas"]}
    assert estado["incompleto"]["nivel"] == "incompleto"
    assert set(problemas) == {"identidad", "donde"}


def test_trampa_de_palabras_con_pocas_preguntas_apunta_a_como_se_juega(estado):
    assert estado["trampa"]["nivel"] == "incompleto"
    assert estado["trampa"]["problemas"][0]["seccion"] == "juego"
    assert "1 de 4" in estado["trampa"]["motivos"][0]


def test_el_aviso_de_ruta_solo_marca_el_nodo_que_la_rompe(estado):
    assert estado["ruta"] == ["ok", "aviso", "ok"]


def test_el_editor_mira_el_borrador_no_el_listado(estado):
    assert estado["edicion"]["nivel"] == "incompleto"


def test_la_barra_de_nodos_tiene_estado_tipo_y_reordenar_arrastrando():
    barra = leer("components", "BarraDeNodos.tsx")
    assert "estadoDeLosNodos" in barra and "saga-ficha-nodo-estado" in barra
    assert "onDragStart" in barra and "onDrop" in barra  # arrastrar para reordenar
    assert "Añadir nodo" in barra and "Imprimir QRs" in barra
    assert "textoPosicion" in barra  # «Nodo 2 de 10»


def test_la_barra_de_nodos_no_enseña_barra_de_desplazamiento():
    css = leer("styles", "admin-r7.css")
    assert "scrollbar-width: none" in css
    assert "::-webkit-scrollbar" in css


def test_los_tres_editores_usan_el_marco_con_secciones():
    for nombre in ("AdminGameEditor.tsx", "AdminQrEditor.tsx", "AdminCollectibleEditor.tsx"):
        codigo = leer("components", nombre)
        assert "<NodeEditorFrame" in codigo, nombre
        assert "RecompensaDeVestuario" in codigo, nombre  # dentro de «Recompensas»
        assert "saga-guided-v4-stepper" not in codigo, nombre


def test_el_editor_de_juego_tiene_las_seis_secciones():
    codigo = leer("components", "AdminGameEditor.tsx")
    for seccion in ("identidad", "donde", "juego", "historia", "recompensas", "avanzado"):
        assert f"id: '{seccion}'" in codigo, seccion
    assert "CampoTexto" in codigo  # contador de caracteres


def test_el_marco_tiene_cabecera_fija_guardado_y_atajos():
    marco = leer("components", "editor", "NodeEditorFrame.tsx")
    assert "Cambios sin guardar" in marco
    assert "'s'" in marco and "Escape" in marco  # Ctrl+S y Esc
    assert "aria-expanded" in marco  # secciones accesibles
    assert "MaquetaMovil" in marco


def test_guardar_del_editor_pasa_por_la_misma_validacion_que_la_barra_de_arriba():
    shell = leer("components", "AdminMissionControlShell.tsx")
    assert "onGuardar={handleSaveStages}" in shell


def test_jugadores_tiene_busqueda_filtros_menu_de_acciones_y_ficha_lateral():
    panel = leer("components", "PlayersPanel.tsx")
    assert 'aria-label="Buscar jugadores"' in panel
    assert "r7-menu" in panel and "r7-ficha" in panel
    assert "textoSinJugadores(" in panel  # estado vacío del filtro (los textos, en adminRouteGuards)


def test_ajustes_tiene_buscador():
    assert 'aria-label="Buscar ajustes"' in leer("components", "SettingsPanel.tsx")


def test_los_botones_tactiles_miden_al_menos_44_px():
    css = leer("styles", "admin-r7.css")
    assert "--r7-toque: 44px" in css

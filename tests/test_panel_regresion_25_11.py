# -*- coding: utf-8 -*-
"""25/11/2026: lo que el panel había perdido desde la 6.12.16 (antes del panel de campo).

Comparado función a función con la 6.12.16 (mismos datos inventados, Chromium a 1440x900 y 390x844): mismos endpoints,
mismos campos en cada editor de juego, QR y coleccionable, y todo se guarda y sigue tras recargar. Lo perdido:

- El mapa del editor en el PC: el 24/11 se quedó con UNA capa (la del jugador) para ahorrar datos en el móvil, y en el
  PC desaparecieron los senderos de Waymarked, las carreteras de Esri y el satélite fuera de la zona de la misión. Y los
  caminos cercanos de OpenStreetMap sólo salían con un nodo abierto.
- «Pocos datos» (un ajuste del móvil) ocupaba una fila del menú del PC y dejaba «Simular» y «Copia de respaldo» por debajo
  del borde a 1440x900.
- La entrada propia del panel (`entrada.tsx`, 24/11) dejó de marcar la página oculta: las animaciones de la vista previa
  de los minijuegos ya no se paraban con el móvil bloqueado.
"""
from pathlib import Path

FRONT = Path(__file__).resolve().parent.parent / "frontend" / "src"


def leer(*partes: str) -> str:
    return FRONT.joinpath(*partes).read_text(encoding="utf-8-sig")


def test_en_el_pc_el_mapa_del_editor_lleva_las_cuatro_capas_de_siempre():
    mapa = leer("admin", "AdminMissionMap.tsx")
    assert "window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches" in mapa
    assert "const [mapaCompleto] = useState(esPantallaDePc)" in mapa
    pc = mapa[mapa.index("if (mapTileMode === 'satellite-osm' && mapaCompleto) {"):mapa.index("} else if (mapTileMode === 'satellite-osm') {")]
    for capa in (
        "arcgisonline.com/ArcGIS/rest/services/World_Imagery",
        "/map-tiles/{z}/{x}/{y}.png",
        "tile.waymarkedtrails.org/hiking",
        "arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation",
    ):
        assert capa in pc, capa
    # El satélite de Esri va DEBAJO del del jugador (sólo asoma fuera de la zona) y los senderos y carreteras encima.
    assert pc.index("World_Imagery") < pc.index("/map-tiles/") < pc.index("waymarkedtrails") < pc.index("World_Transportation")
    assert "}, [mapTileMode, pocos, mapaCompleto])" in mapa
    # «Pocos datos» sigue mandando también en el PC: sin teselas.
    assert mapa.index("if (pocos) return") < mapa.index("if (mapTileMode === 'satellite-osm' && mapaCompleto) {")


def test_en_el_pc_los_caminos_cercanos_salen_sin_abrir_un_nodo():
    mapa = leer("admin", "AdminMissionMap.tsx")
    assert "const editandoTrazado = Boolean(freeShape || selectedStage || mapaCompleto) && !pocos" in mapa


def test_la_entrada_del_panel_marca_la_pagina_oculta_como_la_del_jugador():
    entrada = leer("admin", "entrada.tsx")
    assert "toggleAttribute('data-saga-oculta', document.visibilityState === 'hidden')" in entrada
    assert "document.addEventListener('visibilitychange', marcarOculta)" in entrada
    assert "html[data-saga-oculta] * { animation-play-state: paused !important; }" in leer("saga-lenguaje.css")


def test_en_el_pc_se_abre_el_editor_completo_y_desde_el_campo_se_llega_a_todo():
    app = leer("admin", "AdminApp.tsx")
    assert "window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches ? 'editor' : 'campo'" in app
    mas = leer("admin", "components", "campo", "MasDeCampo.tsx")
    for panel in ("'players'", "'match-log'", "'tiempos'", "'avisos'", "'exportar'", "'none'", "'mission'"):
        assert "p.onAbrirEditor(" + panel + ")" in mas, panel


def test_pocos_datos_no_empuja_fuera_de_la_pantalla_el_menu_del_pc():
    shell = leer("admin", "components", "AdminMissionControlShell.tsx")
    bloque = shell[shell.index("id: 'pocos-datos'"):shell.index("panelEntrada('simulation'")]
    assert "soloMovil: !pocosDatos," in bloque

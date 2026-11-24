# -*- coding: utf-8 -*-
"""23/11/2026: repaso del panel de administración. Un test por arreglo.

- El laberinto de equilibrio acepta hasta 25×25 (niveles 21-25 del motor); antes el editor lo marcaba «Incompleto».
- La inicial del avatar se lee (AA) sobre cualquier color; el panel se cierra con Escape; el cartel de métricas no asoma
  tras un panel; los controles de plena partida miden 44 px con el dedo; ni un fallo de red en inglés en el acceso.
- Se quitó el CSS muerto (clases que ningún componente pone).
Comportamiento en tests/js/admin_repaso_23_11.cjs.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "frontend" / "src" / "admin"


def leer(rel: str) -> str:
    return (ADMIN / rel).read_text(encoding="utf-8-sig")


@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "admin_repaso_23_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout.strip().splitlines()[-1])


def test_el_laberinto_valida_hasta_25(datos):
    assert datos["once"] and datos["veintiuno"] and datos["veinticinco"], datos
    assert not datos["veintiseis"] and not datos["cuatro"], datos
    # 23/11 (tarde): el editor ya no hace sus cuentas; las del móvil están en lib/laberintoDelJugador.ts.
    lab = leer("lib/laberintoDelJugador.ts")
    assert "entero(escrito(config.grid_rows), lado, 5, 25)" in lab and "entero(escrito(config.grid_cols), lado, 5, 25)" in lab


def test_la_inicial_del_avatar_se_lee_sobre_cualquier_fondo(datos):
    for fondo, tinta, ratio in datos["tinta"]:
        # El peor caso posible (un gris medio, ~#797979) da 4,4:1 con la mejor de las dos tintas; el resto, más de 4,5.
        assert ratio >= 4.3, (fondo, tinta, ratio)
    assert datos["tintaMala"] == "#fff"
    pj = leer("components/PlayersPanel.tsx")
    assert pj.count("tintaSobre(") == 4  # definición + avatares de la fila, la ficha y la vista previa


def test_el_boton_primario_y_el_activo_del_laberinto_tienen_contraste():
    # 23/11 (tarde): con la piel del panel, el botón activo es el acento con su tinta (la misma pareja que `r7-boton primario`).
    css = leer("components/tiltMaze/TiltMazeEditor.tsx")
    assert '.tme button.active,.tme button[aria-pressed="true"]{border-color:var(--r7-acento);background:var(--r7-acento);color:var(--je-sobre-acento)}' in css


def test_escape_cierra_el_panel_y_la_ficha():
    sh = leer("components/AdminMissionControlShell.tsx")
    assert "cerrarPanelRef.current()" in sh and "e.key !== 'Escape'" in sh
    assert "[aria-modal=\"true\"], .r7-ficha" in sh, "con una ventana o la ficha encima, esa se cierra primero"
    pj = leer("components/PlayersPanel.tsx")
    assert "if (e.key !== 'Escape' || e.defaultPrevented) return" in pj and "setExpandedPlayer(null)" in pj


def test_las_novedades_se_cierran_con_escape_y_estan_en_castellano():
    t = leer("components/ReleaseNotesModal.tsx")
    assert "e.key === 'Escape'" in t and 'aria-label="Cerrar las novedades"' in t
    assert "RELEASE NOTES" not in t and "NOVEDADES DE SAGA ENGINE" in t
    assert "width: 44" in t and "height: 44" in t


def test_la_lista_de_fotos_usa_los_botones_del_panel():
    s = leer("components/SettingsPanel.tsx")
    assert 'className="admin-btn-modern" onClick={() => void cargar()}' in s
    assert 'className="admin-inline-danger" disabled={borrando !== null}' in s


def test_las_recetas_ya_no_llevan_rotulos_de_8_px_a_media_opacidad():
    o = leer("components/ObjectsPanel.tsx")
    assert "fontSize: '8px'" not in o and "rgba(203, 213, 225, 0.5)" not in o and "rgba(203, 213, 225, 0.3)" not in o


def test_el_fallo_de_config_en_el_acceso_sale_en_castellano():
    a = leer("AdminApp.tsx")
    assert "El servidor no responde o se está reiniciando. Espera un minuto y recarga la página." in a


def test_hud_y_objetivos_tactiles_en_el_css():
    css = leer("styles/admin-r8-ficha.css")
    assert ".saga-admin-shell:has(.saga-floating-panel) .saga-centered-route-hud" in css
    bloque = css.split("@media (pointer: coarse)", 1)[1]
    assert "min-height: 44px" in bloque and ".saga-hud-play" in bloque
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(", css.split("/* Repaso del panel (23/11) */", 1)[1])
    assert "minHeight: 44" in leer("components/niveles/SelectorDeNivel.tsx")


def test_no_queda_css_muerto_de_los_redisenos_viejos():
    # Clases que ningún componente pone (ni el CSS-en-TS ni los tests): las filas de jugador y de nodo antiguas.
    muertas = ["admin-player-head-modern", "r7-presencia", "admin-note-pill", "r7-jugador-nodos", "r7-jugador-acciones",
               "saga-node-index"]
    for rel in ("styles/admin-modern-shell.css", "styles/admin-r7-paneles.css", "styles/admin-r5.css"):
        css = leer(rel)
        for c in muertas:
            assert not re.search(r"\." + re.escape(c) + r"(?![\w-])", css), (rel, c)
    assert len(leer("styles/admin-modern-shell.css")) < 220_000


def test_las_etiquetas_de_accesibilidad_del_panel_estan_en_castellano():
    sh = leer("components/AdminMissionControlShell.tsx")
    assert 'aria-label="Navegación de la misión"' in sh and 'aria-label="Panel de gestión"' in sh
    assert "Mission navigation" not in sh and "CMS panel" not in sh

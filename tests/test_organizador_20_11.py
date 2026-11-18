# -*- coding: utf-8 -*-
"""20/11/2026: modo organizador oculto (7 toques en la insignia de versión); sin él no hay modo prueba ni panel de desarrollo."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


def leer(*partes):
    return (SRC.joinpath(*partes)).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def d():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "organizador_20_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_siete_toques_seguidos(d):
    assert d["seis"] is False and d["siete"] is True
    assert d["sieteLentos"] is False and d["seisPausaYSeis"] is False  # más de 1,5 s entre toques: vuelve a empezar
    assert d["sieteTrasPausa"] is True
    assert d["antes"] is False and d["durante"] is True and d["despues"] is False and d["sinAlmacen"] is False
    assert d["clave"] == "saga:organizador"


def test_el_modo_prueba_es_de_todos_y_el_organizador_solo_gobierna_el_panel():
    hud = leer("components", "PlayerHud.tsx")
    # El modo prueba (respaldo si falla el GPS): botón normal, visible, sin gesto ni <details>, 44 px, con su explicación.
    assert "data-saga-modo-prueba" in hud and "t('player.tools.debugMode', locale)" in hud
    cuerpo = hud.split("data-saga-modo-prueba")[1].split("data-saga-organizador")[0]
    assert "minHeight: 44" in cuerpo and "onToggleDebug()" in cuerpo
    assert "Si falla el GPS: toca el mapa para colocar tu ubicación" in hud and "Se falla o GPS: toca o mapa" in hud
    assert "Avanzado: modo prueba" not in hud and "Simular ubicación (debug)" not in hud
    pre = hud.split("data-saga-modo-prueba")[0]
    assert "{organizador ? (" not in pre.split("deviceSettings")[1]  # nada condiciona el botón al organizador
    # El organizador (7 toques en la versión) sólo muestra el indicador y «Salir»; cierra de verdad.
    assert "{organizador ? (" in hud and "Salir del modo organizador" in hud and "Modo organizador activo" in hud
    assert "salirDelOrganizador()" in hud and "setOrganizador(false)" in hud
    assert "contarToque(toquesVersion.current" in hud and "activarOrganizador()" in hud
    assert hud.index("<BuildInfoBadge mode=\"inline\" />") > hud.index("contarToque(")


def test_el_modo_prueba_no_se_apaga_sin_organizador():
    app = (SRC / "PlayerApp.tsx").read_text(encoding="utf-8")
    assert "organizadorActivo" not in app and "EVENTO_ORGANIZADOR" not in app


def test_panel_solo_con_organizador_o_parametro_y_limpia_conmutadores():
    gl = leer("components", "MapSurfaceGL.tsx")
    assert "if (sinWebGL || !debeMostrarseElPanel(organizadorVista)) return undefined" in gl
    assert "!conmutadoresActivos.length" not in gl  # el ahorro añadía conmutadores y enseñaba el panel a cualquiera
    assert "guardarConmutadores([], almacenDeSesion())" in gl
    assert "organizadorActivo() || hayDepuracionDeMapa() || conParametroDeMapa" in gl
    panel = leer("avatares3d", "mixamo", "panelDepuracion.ts")
    assert "return organizador || hayDepuracionDeMapa(buscar)" in panel


def test_equis_cierra_y_quita_el_parametro():
    panel = leer("avatares3d", "mixamo", "panelDepuracion.ts")
    assert "'×'" in panel and "window.history.replaceState(" in panel and "direccionSinDepuracion(window.location.href)" in panel
    assert "u.searchParams.delete('depurar-mapa')" in panel

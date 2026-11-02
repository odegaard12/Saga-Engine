# -*- coding: utf-8 -*-
"""Revisión del 1/11/2026: previsión en «Preparando el mapa…», «Pegar el PIN», nodos y tienda de ropa (Vitrina).

El pulso dorado (base del poste, sólo suelo, piezas con posición y dibujo separados) está en test_diseno_31_10.py.
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8")


def test_la_prevision_sigue_mientras_se_prepara_el_mapa():
    app = leer("player/PlayerApp.tsx")
    velo = app.split("preparandoMapa={", 1)[1].split("</PantallaDeCarga>", 1)[0]
    # Con los permisos dados, la previsión vuelve (entrando), en vez de quedar el hueco vacío.
    assert "{permisosPendientes ? (" in velo
    resto = velo.split("{permisosPendientes ? (", 1)[1].split(") : (", 1)[1]
    assert "animation: ENTRADA_EN_SU_SITIO" in resto and "<PrevisionDePartida />" in resto
    assert "export const ENTRADA_EN_SU_SITIO = RELEVO_DE_TEXTO" in leer("player/components/PantallaDeCarga.tsx")


def test_pegar_el_pin_es_tocable_y_sin_permiso_lleva_al_campo():
    login = leer("login/LoginApp.tsx")
    boton = login.split("{!pin ? (", 1)[1].split(") : null}", 1)[0]
    assert "minHeight: 44" in boton and "padding: '10px 18px'" in boton
    assert "navigator.clipboard.readText()" in boton
    # Sin permiso o sin números: el foco va al campo (ahí sigue la pulsación larga).
    assert "campo?.focus()" in boton and boton.index("return") < boton.index("campo?.focus()")
    assert "pinPegar: 'Pegar el PIN'" in login


def test_vitrina_en_pantallas_bajas_y_margenes():
    css = leer("player/avatares3d/mixamo/tienda.css")
    bajo = css.split("@media (max-height: 760px) and (orientation: portrait) {", 1)[1].split("\n}", 1)[0]
    assert "width: 42px;" in bajo and "height: 42px;" in bajo and "gap: 6px;" in bajo
    assert ".saga-tienda-vitrina .saga-tienda-cuerpo .saga-tienda-info-bloqueo:not(.saga-tienda-info-bloqueo-compacta) {" in css
    assert "max-width: calc(100% - 28px - var(--tienda-izq) - var(--tienda-dcha));" in css


def test_vitrina_version_2_elegida():
    """2/11: Óscar elige la versión 2 (panel de pizarra abajo, en orden de uso) con el muñeco grande de la 1."""
    t = leer("player/avatares3d/mixamo/TiendaDeRopa.tsx")
    assert "propuesta-tienda" not in t and "PROPUESTA_TIENDA" not in t, "el interruptor de las propuestas se quitó"
    assert "margenLado: 0.34," in t and "peana: false," in t
    css = leer("player/avatares3d/mixamo/tienda.css")
    assert "saga-tienda-p1" not in css and "saga-tienda-p2" not in css
    v2 = css.split("2/11: Vitrina «versión 2»", 1)[1]
    assert "--tienda-escena-izq: 0px;" in v2
    assert "var(--tienda-escena-abajo, 0px) + 24px) !important;" in v2, "el lienzo sigue por detrás del panel"
    assert "background: var(--saga-pizarra" in v2 and "border-radius: 20px 20px 0 0;" in v2
    orden = [v2.index(f"order: {n};") for n in (1, 2, 3, 4)]
    assert orden == sorted(orden)
    assert ".saga-tienda-vitrina .saga-tienda-compra > b {\n  display: none;" in v2, "la compra en una línea"
    assert ".saga-tienda-compra ~ .saga-tienda-aviso[role='alert'] {\n  display: none;" in v2


# 6.2.0 (urgente): salir de la tienda llevaba al LOGIN ------------------------------------------------------------------


def test_menu_a_tienda_no_pierde_la_entrada_del_historial():
    """Menú de gestos → tienda: la hoja que se iba hacía `history.back()` (asíncrono) cuando la nueva ya había metido su
    entrada, y el `back()` se la llevaba por delante: la tienda quedaba sin entrada y al cerrarla el jugador salía de su
    partida al login. Ahora los `back()` se juntan y la hoja nueva reutiliza la entrada de la que se va."""
    import json
    import shutil
    import subprocess

    import pytest

    node = shutil.which("node")
    raiz = Path(__file__).resolve().parent.parent
    if not node or not (raiz / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin frontend/node_modules")
    p = subprocess.run([node, str(raiz / "tests" / "js" / "atras_historial_1_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(raiz))
    assert p.returncode == 0, p.stderr[-2000:]
    d = json.loads(p.stdout)
    assert "__error" not in d, d
    # Entradas del historial: 0 login, 1 jugador, 2 hoja.
    m = d["menuATienda"]
    assert m["tras1"] == 2 and m["conTienda"] == 2, "la tienda conserva su entrada"
    assert m["trasCerrar"] == 1, "cerrar la tienda con × vuelve al jugador, no al login"
    a = d["atrasCierraLaTienda"]
    assert a["con"] == 2 and a["trasAtras"] == 1 and d["atrasCierraLaTienda"]["cerradas"] == ["tienda"]
    assert d["unaSola"]["con"] == 2 and d["unaSola"]["trasCerrar"] == 1
    assert d["dosSeVan"]["con"] == 3 and d["dosSeVan"]["trasCerrar"] == 1, "lo que sobra se devuelve de una vez"


def test_el_hook_junta_los_back_y_el_lienzo_del_mapa_siempre_vuelve_a_verse():
    h = leer("player/hooks/useAtrasCierra.ts")
    assert "export function abrirHoja(" in h and "sobran += 1" in h and "if (sobran > 0) sobran -= 1" in h
    assert "window.history.go(-n)" in h and "window.history.back()" not in h
    mapa = leer("player/components/MapSurfaceGL.tsx")
    fin = mapa.split("void calentar(vivo).finally(() => {", 1)[1].split("})", 1)[0]
    # Si el calentamiento se cortaba a mitad (excepción, mapa deshecho), el lienzo se quedaba transparente: mapa «gris».
    assert "getCanvas().style.opacity = ''" in fin

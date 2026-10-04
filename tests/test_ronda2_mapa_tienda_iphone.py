# -*- coding: utf-8 -*-
"""Ronda tras probar la 5.46.0 en el iPhone del dueño (versión 5.47).

Qué se comprueba y cómo (lo que se ve en un navegador está en scratchpad/vista/r2_*):

* Halo: los jugadores en 3D ya no llevan el aro/aura de SÍMBOLO (flotaba a 3 m: a la cintura al acercarse);
  su aro de equipo es una malla tumbada EN el suelo, dentro de la escena three.js.
* Tamaño: +30 % sobre la 5.46 y retrato 2D y 3D con la misma curva.
* Transparencia: ni el motor ni el aro usan materiales translúcidos; sólo se apaga al desconectado.
* Mapa 2D: cada jugador con SU foto de perfil (la de `/api/player-avatar/`, con su puerta), con la del
  personaje de reserva, y las fotos se bajan en la pantalla de carga.
* Tienda: lienzo bajo la muesca, hoja compacta, giro con el dedo, filas de colores que se deslizan,
  punto de «ya lo lleva otro jugador».
* iPhone: al cerrar el teclado la pantalla vuelve a su sitio.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SRC = FRONT / "src" / "player"
MIXAMO = SRC / "avatares3d" / "mixamo"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (FRONT / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "ronda2.cjs")],
                       capture_output=True, text=True, timeout=120, encoding="utf-8")
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)


# ---------------------------------------------------------------- 1. halo

def test_el_jugador_en_3d_no_lleva_aro_ni_aura_de_simbolo():
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    # Tú: en 3D sólo el hueco tocable (sin aura, sin suelo, sin rumbo).
    assert "? { aura: 'ninguna', icono: ICONO_HUECO_3D }" in mapa
    # Los demás: el suelo de símbolo sólo si NO van en 3D.
    assert "if (base.color && !enTresD) {" in mapa
    assert "const enTresD = Boolean(base.aspecto) && enTresDRef.current.has(base.clave)" in mapa


def test_el_aro_del_equipo_esta_tumbado_en_el_suelo_dentro_de_la_escena_3d():
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "function crearAro(" in capa and "rotateX(-Math.PI / 2)" in capa, "plano XZ del avatar = el suelo"
    assert "m.position.y = 0.012" in capa, "pegado al suelo, no a la cintura"
    assert "e.holder.add(e.aro)" in capa
    aro = capa.split("const R_ARO_M")[1].split("function entornoDelMovil")[0]
    assert "depthWrite: false" in aro and "transparent" not in aro, "opaco: el aro no vela nada"
    # Se pinta con el color del equipo de cada jugador (tú y los demás).
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "esYo: true, color: miColorRef.current })" in mapa
    assert "esYo: false, color: base.color ?? '#3b82f6' })" in mapa


# ---------------------------------------------------------------- 2. tamaño

def test_el_avatar_crece_un_30_por_ciento_y_sigue_siendo_menor_que_un_nodo(js):
    t = js["tamano"]
    for z, antes in (("16", 34), ("17", 39), ("18", 45), ("19", 52), ("20", 59)):
        assert 1.25 <= t[z] / antes <= 1.35, (z, t[z], antes)
    assert max(t.values()) < 92, "ni siquiera a z21 llega al tamaño de un nodo (~92 px)"
    assert t["16"] == 44


# ---------------------------------------------------------------- 3. transparencia

def test_ningun_material_del_avatar_es_translucido():
    stage = leer(MIXAMO / "motor" / "stage.ts")
    assert stage.count("m.transparent = false") == 2, "pelo (recorte por alfa) y resto: opacos"
    assert "m.depthWrite = true" in stage
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "opacidad: el.presencia === 'offline' ? 0.7 : 1," in mapa, "sólo se apaga a quien está sin conexión"
    assert "'recent' ? 0.8" not in mapa


# ---------------------------------------------------------------- 8. fotos en el mapa 2D

def test_las_fotos_solo_se_piden_al_endpoint_de_retratos(js):
    f = js["fotos"]
    assert f["validas"] == [True, True]
    assert f["invalidas"] == [False] * 9, "ni direcciones externas, ni data:, ni otras rutas del servidor"
    assert f["id"].startswith("pf-") and f["leido"]["mx"] == "Ch22" and f["leido"]["color"] == "#3b82f6"
    assert f["mismoIdParaLoMismo"] and f["otraFotoOtroId"] and f["otroPersonajeOtroId"], \
        "foto nueva (otro ?v=) = imagen nueva en el mapa"
    assert f["desconocido"] is None and f["noEsFoto"] == [None, None]
    assert f["retratoNormalSigueIgual"] == {"mx": "Ch01", "color": "#3b82f6"}


def test_el_mapa_2d_pinta_la_foto_y_el_3d_el_personaje():
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "else if (base.foto && base.mx && !tresDRef.current) {" in mapa, "otros: foto sólo en la vista 2D"
    assert "const miFoto = !tresDRef.current && urlDeFotoValida(miFotoRef.current)" in mapa, "tú también"
    assert "dibujarRetratoConFoto(conFoto.url, conFoto.mx, conFoto.color" in mapa
    assert "foto: grupo ? null : urlDeFotoValida(getPlayerAvatarUrl(j))" in mapa
    assert "movilRef.current?.dibujar()" in mapa and "precargarFotos(" in mapa
    ret = leer(SRC / "avatares" / "retratoDeMapa.ts")
    assert "pintar(nuevo.ctx, mx, color, foto ?? caraDe(mx, alListo))" in ret, "sin foto (o sin red) sale el personaje"
    assert "Recorte cuadrado y centrado" in ret
    assert "reintentarFotos(repintarRetratos)" in mapa, "al volver la red se repintan las que fallaron"


def test_las_fotos_no_abren_ninguna_url_publica_nueva():
    """Se usa el endpoint que ya existía, con su puerta (ver test_o_retrato_ten_porta.py)."""
    publico = leer(RAIZ / "backend" / "app" / "routers" / "public.py")
    assert "_puede_ver_retratos(main, request)" in publico and "private, max-age=31536000, immutable" in publico
    assert "/api/player-avatar/{profile_id}" in publico


def test_las_fotos_del_grupo_se_bajan_en_la_pantalla_de_carga(js):
    assert js["caras"]["urls"] == ["/api/player-avatar/A?v=1", "/api/player-avatar/B?v=2"]
    assert js["caras"]["vacio"] == [[], [], []]
    carga = leer(SRC / "offline" / "cargaCompleta.ts")
    assert "carasDelGrupoQueFaltan(urlsDeCarasDelGrupo(ctx.config.player_profiles))" in carga, "la parte «App» lo comprueba"
    assert "cacheCarasDelGrupo(caras, { cancelado: ctx.detenido })" in carga, "y lo baja con barra a la vista"
    cache = leer(SRC / "offline" / "fieldProofCache.ts")
    assert "REINTENTO_DE_CARAS_MS" in cache, "una foto que falla no deja la carga pendiente para siempre"
    sw = leer(FRONT / "public" / "sw.js")
    assert "/api/player-avatar/" in sw and "customCacheFirst(FIELD_PROOF_ASSET_CACHE" in sw, "y el service worker las sirve sin red"


# ---------------------------------------------------------------- 4-6. tienda

def test_el_lienzo_de_la_tienda_empieza_bajo_la_muesca():
    css = leer(MIXAMO / "tienda.css")
    assert "--tienda-escena-arriba: calc(var(--tienda-arriba) + 10px);" in css
    esc = leer(MIXAMO / "escenaTienda.ts")
    assert "top:var(--tienda-escena-arriba,0px)" in esc and "height:calc(100% - var(--tienda-escena-arriba,0px))" in esc
    assert "r.domElement.clientHeight" in esc, "la cámara se encuadra en el lienzo, no en todo el escenario"


def test_la_hoja_es_compacta_y_el_escenario_se_queda_con_el_resto():
    css = leer(MIXAMO / "tienda.css")
    assert "flex: 0 1 auto;\n  max-height: 64%;" in css and "flex: 1 1 0;\n  min-height: clamp(190px, 33%, 400px);" in css
    assert "@media (max-height: 700px) and (orientation: portrait)" in css and "max-height: 66%;" in css
    assert "flex: 1;\n    max-height: none;" in css, "en horizontal la hoja vuelve a ocupar su mitad"


def test_se_gira_al_personaje_arrastrando_sin_tocar_el_scroll_de_la_hoja():
    esc = leer(MIXAMO / "escenaTienda.ts")
    for ev in ("pointerdown", "pointermove", "pointerup", "pointercancel"):
        assert f"lienzo.addEventListener('{ev}'" in esc and f"lienzo.removeEventListener('{ev}'" in esc, ev
    assert "touch-action:none" in esc, "el arrastre es del lienzo: no desplaza la hoja ni la página"
    assert "setPointerCapture" in esc
    assert "velocidad = GIRO_AUTOMATICO + (velocidad - GIRO_AUTOMATICO) * Math.exp(-dt * 2.4)" in esc, \
        "con inercia que vuelve al giro lento"
    assert "av.heading = av.goal = angulo" in esc
    css = leer(MIXAMO / "tienda.css")
    assert "touch-action: pan-y;" in css, "el cuerpo de la hoja sigue desplazándose en vertical"


def test_los_colores_se_deslizan_en_horizontal_y_el_resto_en_vertical():
    t = leer(MIXAMO / "TiendaDeRopa.tsx")
    assert t.count("<FilaDeColores") == 3, "camiseta, pantalón y pelo"
    css = leer(MIXAMO / "tienda.css")
    assert "overflow-x: auto;" in css and "scroll-snap-type: x proximity;" in css and "touch-action: pan-x pan-y;" in css


def test_no_hay_prendas_bloqueadas_todavia_y_lo_unico_deshabilitado_es_por_manos_ocupadas():
    """Sistema de desbloqueables: NO existe (ni en el servidor ni en el móvil). Todo está disponible;
    lo único que se deshabilita es un objeto cuyas manos ya están ocupadas (`bloqueadoPor`)."""
    pj = leer(RAIZ / "backend" / "app" / "runtime" / "personajes.py")
    assert not re.search(r"desbloque|unlock", pj, re.I)
    cat = leer(MIXAMO / "catalogo.ts")
    assert not re.search(r"desbloque|unlock", cat, re.I) and "export function bloqueadoPor(" in cat


# ---------------------------------------------------------------- 7. personajes en uso

def test_el_recuento_de_personajes_en_uso_llega_a_la_tienda(js):
    e = js["enUso"]
    assert e["delServidor"] == {"Ch01": 2, "Ch22": 1}, "lo que dice el servidor (descartando basura)"
    assert e["sinServidor"] == {"Ch01": 2}, "si el servidor es antiguo, se cuenta con lo que llevan los demás"
    assert e["raro"] == [{}, {}]
    assert e["estado"] == {"Ch01": 1} and e["estadoSinCampo"] == {"Ch01": 1}
    t = leer(MIXAMO / "TiendaDeRopa.tsx")
    assert "enUso={enUso[id] ?? 0}" in t and "saga-tienda-en-uso" in t
    boton = t.split('className="saga-tienda-boton-cara"')[1].split("</button>")[0]
    assert "disabled" not in boton, "informativo: no bloquea la elección"
    g = leer(SRC / "avatares" / "GestorDePersonaje.tsx")
    assert "setEnUso(estado.enUso)" in g and "enUso={enUso}" in g


# ---------------------------------------------------------------- 9. iPhone

def test_al_cerrar_el_teclado_la_pantalla_vuelve_a_su_sitio(js):
    k = js["teclado"]
    assert k["cerrado"] is False and k["barras"] is False and k["abierto"] is True
    assert k["sinMedida"] == [False, False, False]
    assert k["desplazadaPorOffset"] and k["desplazadaPorScroll"] and not k["enSuSitio"]
    assert k["reponeTrasCerrar"] is True and k["reponeScrollSuelto"] is True
    assert k["noRepone"] == [False, False, False], "con el teclado abierto, escribiendo o en su sitio no se toca nada"
    assert k["fueraDeUnCampo"] is False
    assert k["areaConTeclado"] == {}, "la altura del teclado no entra en la medida de la hoja"
    assert k["areaSinTeclado"]["--saga-area-alto"] == "800px"


def test_el_cableado_del_teclado_y_el_marco_de_la_pantalla():
    v = leer(SRC / "utils" / "vistaTrasTeclado.ts")
    for ev in ("focusout", "focusin"):
        assert f"document.addEventListener('{ev}'" in v
    assert "vv?.addEventListener('resize', alCambiarVisual)" in v and "window.scrollTo(0, 0)" in v
    assert "REINTENTOS_MS = [120, 450, 900]" in v
    app = leer(FRONT / "src" / "App.tsx")
    assert "instalarVistaTrasTeclado()" in app and "isAdmin ? undefined" in app, "sólo en el juego, no en el panel"
    marco = leer(SRC / "components" / "PlayerLayout.tsx")
    assert "height: mobile ? undefined : '100dvh'," in marco, "fixed + inset 0 ya es la ventana: sin alturas que discrepen"
    # La altura base de la app NO sale del visual viewport.
    base = leer(FRONT / "src" / "styles" / "mobile-shell.css")
    assert "visualViewport" not in base and "--saga-area-alto" not in base
    assert "font-size: 16px !important;" in base, "campos a 16 px: iOS no amplía la página"

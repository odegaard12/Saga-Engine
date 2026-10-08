# -*- coding: utf-8 -*-
"""Revisión de la versión 5.45.0 en el móvil del dueño (04/10/2026).

Cuatro quejas y lo que se comprueba de cada una:

* La tienda de ropa se quedaba «debajo» (barra de navegación, muesca): la hoja se mide con el
  área VISIBLE (`visualViewport`) y respeta los márgenes seguros arriba y abajo.
* Los avatares eran demasiado grandes: tamaño en pantalla acotado y menor que un nodo, el
  mismo número para el 3D y el retrato.
* Las animaciones de andar: el muñeco se desliza a ritmo de fixes (sin ráfagas ni parones),
  la flecha de rumbo gira suave, el paso se anima a la velocidad que se VE y no anda en el sitio.
* Sin modelos (sin red, caché a medias) la app no entra en bucle de reintentos.

La lógica pura se ejecuta en Node (tests/js/rev_avatares.cjs); el cableado de React/MapLibre,
que sólo existe en el navegador, se comprueba por el código, como el resto de pruebas del repo.
Lo que se ve en un navegador está en scratchpad/vista/rev_*.
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
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "rev_avatares.cjs")],
                       capture_output=True, text=True, timeout=120, encoding="utf-8")
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)


# ---------------------------------------------------------------- tamaño en el mapa

def test_el_avatar_mide_lo_que_un_nodo_a_z18_z19(js):
    t = js["tamano"]
    # 5.48: claramente más grandes (en el iPhone seguían siendo pequeños): 80 a z16, ~90 a z17, ~101 a z18, ~126 a z20.
    assert t["z16"] == 80 and 88 < t["z17"] < 92 and 99 < t["z18"] < 103 and 124 < t["z20"] < 130
    assert t["min"] >= 64 and t["max"] <= 136, "de z12 a z20 entre 64 y 136 px"
    assert t["z18"] > 92, "a z18 ya mide lo que un nodo (~92 px) o algo más"
    for z in ("z16", "z17", "z18", "z20"):
        antes = 44 * 2 ** (0.2 * (int(z[1:]) - 16))
        assert t[z] / antes >= 1.4, f"{z}: bastante más que en la 5.47"
    assert t["creciente"] is True and t["pasoMaxEntreMediosZooms"] < 8, "crece despacio y sin saltos"


def test_el_tamano_es_el_mismo_en_metros_y_en_pantalla_a_cualquier_latitud(js):
    t = js["tamano"]
    assert t["coherente"] is True
    assert len(set(t["latitudes"])) == 1, "en pantalla mide lo mismo en el ecuador que en Galicia"
    assert t["realMinimo"] == 1.75, "nunca por debajo de su tamaño real"
    assert t["z22"] > 100, "con el zoom tan cerca que lo real ya es mayor, manda el tamaño real (sin salto)"


def test_el_avatar_recien_aparecido_crece_en_vez_de_saltar(js):
    e = js["entrada"]
    assert e["cero"] == e["neg"] == e["nan"] == 0.72, "arranca al 72 %"
    assert 0.85 < e["mitad"] < 0.87 and e["fin"] == 1 and e["despues"] == 1
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "factorDeEntrada(ctx.ahora - e.apareceEn)" in capa and "if (crece < 1) hayMovimiento = true" in capa
    assert "function ocultar(e: Entrada) {" in capa and "e.estabaVisible = false" in capa
    assert capa.count("ocultar(e)") >= 4, "cada vez que deja de pintarse pasa por `ocultar`"


def test_se_toca_el_cuerpo_del_avatar_y_no_el_hueco_alzado_del_simbolo(js):
    t = js["tocado"]
    assert t["cuerpo"] == "a" and t["pies"] == "a", "un avatar pequeño se acierta con el dedo en el cuerpo y en los pies"
    assert t["lado"] is None and t["encima"] is None and t["debajo"] is None, "pero no a un dedo de distancia"
    assert t["grande"] == "g", "la zona crece con el cuerpo"
    assert t["yoPrimero"] == "yo", "tú primero si os pisáis"
    assert t["elDeDelante"] == "cerca", "entre los demás, el que tapa (apoya más abajo en pantalla)"
    assert t["ignoraNaN"] == "a" and t["vacio"] is None
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "tocado(x, y) {" in capa and "e.pantalla =" in capa and "elegirTocado(sitios, x, y)" in capa
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "avataresRef.current?.tocado(evento.point.x, evento.point.y)" in mapa
    assert mapa.count("toqueDeAvatar === evento.originalEvent") == 2, "los toques por capa se saltan el que ya atendió el avatar"
    assert "new CustomEvent(EVENTO_MENU_DE_GESTOS)" in mapa and "abrirPopupDe(el)" in mapa
    assert "{ width: 56, height: 96, data: new Uint8Array(56 * 96 * 4) }" in mapa, "el hueco del 3D, mayor para el dedo"


def test_el_retrato_y_el_3d_comparten_la_curva_de_tamano():
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert re.search(r"const TAMANO_JUGADOR[^=]*=\s*\[\s*'interpolate', \['exponential', 1\.25\], \['zoom'\],\s*12, \['\*', 0\.8, SIN_ESCALON\],\s*20, \['\*', 1\.9, SIN_ESCALON\],", mapa), \
        "retrato (5.48): 53 px en z12, ~74 en z16, ~94 en z18 y 125 en z20, la curva del 3D"
    assert "'circle-radius': ['interpolate', ['exponential', 1.25], ['zoom'], 12, 16, 20, 38]" in mapa
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "alturaVirtualM(ctx.zoom, centro.lat)" in capa, "el 3D se dimensiona con la latitud real y no con una constante"
    # 5.52: el corro ya no va en pantalla (ni retrato ni cuerpo): va en metros, en el punto que se desliza.
    assert "tamanoIcono" not in capa
    en_mapa = leer(SRC / "components" / "jugadoresEnMapa.ts")
    assert "corroEnMetros" in en_mapa and "alturaVirtualM" not in en_mapa


# ---------------------------------------------------------------- andar

def test_el_muneco_se_desliza_a_ritmo_de_fixes_sin_rafagas_ni_parones(js):
    d = js["desliz4s"]
    assert 4000 <= d["duracion"] <= 4500, "dura lo que tarda el siguiente fix (y un 10 % de margen)"
    assert d["vMax"] < 1.8 and d["vMax"] > 1.0, "va a 1,4 m/s, no a 5 m/s en 1,4 s"
    assert d["fraccionParado"] < 0.05, "ya no se queda parado 2,6 s de cada 4"
    assert 1000 <= js["desliz1s"]["duracion"] <= 1200, "un fix por segundo: ~1,1 s"
    assert js["dslizRapido"]["v"] <= 5.01 and js["dslizRapido"]["duracion"] == 8000, "tramos absurdos: tope de 8 s"
    assert js["duracionDeTramo"]["corto"] == 1100 and js["duracionDeTramo"]["lento"] == 4400
    assert js["trasPausa"]["duracion"] < 1500, "tras estar parado 40 s no se arrastra la pausa como ritmo"
    assert 4000 <= js["duplicados"]["duracion"] <= 4500, "los datos repetidos de un compañero no cuentan como fixes nuevos"
    assert js["salto"]["enMov"] is False, "un salto de más de 150 m sigue sin deslizarse"


def test_la_camara_que_te_sigue_dura_lo_mismo_que_el_muneco(js):
    assert js["camara"]["igual"] is True
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "duration: yoRef.current.duracionMs()," in mapa
    assert "duration: 1400" not in mapa


def test_la_flecha_de_rumbo_gira_suave_y_por_el_lado_corto(js):
    r = js["rumbo"]
    assert r["real"] == 54 and r["antes"] == 0
    assert 0 < r["t16"] < 15 and 30 < r["t300"] < 50 and r["t1500"] > 53, "se acerca en ~0,3 s, no salta"
    assert r["ladoCorto"]["pasaPorElLadoLargo"] is False
    assert r["desaparece"] is None, "pasados 20 s sin moverse no hay rumbo"
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert mapa.count("rumboSuave(ahora)") == 2, "la flecha del suelo (tú y los demás) usa el rumbo suave"


def test_la_velocidad_no_anda_en_el_sitio_ni_echa_a_andar_con_el_ruido(js):
    v = js["ventana"]
    assert v["andando"] == 1.4 and v["lentoYaEnMarcha"] is True
    assert v["tardaEnParar"] <= 800, "al llegar al último punto para en menos de 0,8 s (antes seguía ~3 s andando)"
    assert v["muestrasConRuido"] == 0, "un teléfono quieto con ±2 m de ruido no echa a andar"


def test_el_paso_se_anima_a_la_velocidad_que_se_ve(js):
    p = js["paso"]
    assert p["parado"] == 0 and p["ruido"] == 0 and p["sinEscala"] == 1.4
    assert p["realK1"] == 1.4, "a tamaño real, la velocidad real: ahí los pies pisan firme"
    assert p["k10"] < p["realK1"] and p["k25"] <= p["k10"], "cuanto más grande se dibuja, más despacio el ciclo"
    assert p["despacio"] == 0.3, "quien casi no se mueve no se pone a andar a paso normal"
    for z, m in p["patinaje"].items():
        assert m["ahora"] < m["antes"] or m["antes"] <= 1.0, f"z{z}: menos patinaje que antes ({m})"
    # 5.48: muñecos más grandes (más patinaje a igual paso) -> paso más pausado (mínimo 0,6 y k^0,5): sigue por debajo.
    assert p["patinaje"]["19.5"]["ahora"] < 2.4 and p["patinaje"]["18"]["ahora"] < 6.0


def test_el_cableado_del_paso_y_los_gestos():
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "av.setSpeed(v, velocidadDePaso(v, k))" in capa
    assert "velocidadPorVentana(e.muestras, ctx.ahora, undefined, e.andando)" in capa
    assert "e.avatar.gest.length > 0" in capa, "el ritmo de fotogramas sigue al gesto de verdad, no a un reloj de 4 s"
    motor = leer(MIXAMO / "motor" / "motor.ts")
    assert "setSpeed(v, vis)" in motor and "this.vi +=" in motor, "el motor distingue la velocidad real de la que se ve"
    assert "repetido: true" in motor, "el mismo gesto mientras suena no se reinicia de golpe"
    banco = leer(RAIZ / "sim" / "playwright-bench" / "harness" / "mixamo4" / "motor.js")
    assert "setSpeed(v, vis)" in banco and "repetido: true" in banco, "el cambio vive en la fuente (el motor es generado)"
    assert "intervaloDeDibujoMs(mapaRef.current.getZoom())" in leer(SRC / "components" / "MapSurfaceGL.tsx")


# ---------------------------------------------------------------- sin modelos / sin red

def test_sin_modelos_no_se_reintenta_en_bucle_y_se_reintenta_al_volver_la_red():
    cargador = leer(MIXAMO / "cargador.ts")
    # El fichero que no está en el móvil cuenta como intento fallido: si no, cada fotograma reintentaba.
    assert re.search(r"hayEnElMovil\(url\)\)\) \{\s*//[^\n]*\n\s*fallos\.set\(clave", cargador)
    assert "(fallos.get('anims') ?? 0) > 0" in cargador, "sin animaciones tampoco hay personaje, sea cual sea"
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "reintentarCarga()" in capa and "olvidarFallos()" in capa
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "window.addEventListener('online', reintentar)" in mapa and "window.setInterval(reintentar, 90000)" in mapa
    assert "window.removeEventListener('online', reintentar)" in mapa and "window.clearInterval(temporizador)" in mapa


def test_las_caras_de_los_retratos_se_precargan_y_se_reintentan_al_volver_la_red():
    ret = leer(SRC / "avatares" / "retratoDeMapa.ts")
    assert "export function precargarCaras(): void {\n  for (const mx of MX_IDS) caraDe(mx)\n}" in ret
    assert "export function reintentarCaras(alListo: () => void): void {" in ret and "caras.delete(mx)" in ret
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "    precargarCaras()\n" in mapa
    assert "window.addEventListener('online', alVolverLaRedCaras)" in mapa
    assert "window.removeEventListener('online', alVolverLaRedCaras)" in mapa, "se quita al desmontar el mapa"


# ---------------------------------------------------------------- la tienda

def test_el_area_visible_publica_dos_variables_y_descarta_medidas_absurdas(js):
    a = js["area"]
    assert a["normal"] == {"--saga-area-alto": "780px", "--saga-area-top": "0px"}
    assert a["conBarra"] == {"--saga-area-alto": "700px", "--saga-area-top": "30px"}
    assert a["sinMedida"]["--saga-area-alto"] == "667px", "sin visualViewport vale la ventana"
    assert a["absurda"] == {} and a["minima"] == {}, "una medida imposible no se publica (vale el 100dvh del CSS)"
    assert a["nan"]["--saga-area-alto"] == "600px"


def test_la_tienda_y_el_menu_respetan_el_area_visible_y_los_margenes_seguros():
    css = leer(MIXAMO / "tienda.css")
    # La hoja se mide con el área visible, con 100dvh de repuesto (y 100vh para navegadores sin dvh).
    assert "height: var(--saga-area-alto, 100dvh);" in css and "top: var(--saga-area-top, 0px);" in css
    assert css.count("var(--saga-area-alto, 100dvh)") == 2, "tienda y menú de gestos"
    # Arriba (muesca) y abajo (barra de gestos), con holgura mínima abajo.
    assert "--tienda-arriba: var(--saga-safe-top, env(safe-area-inset-top, 0px));" in css
    assert "--tienda-abajo: max(var(--saga-safe-bottom, env(safe-area-inset-bottom, 0px)), 6px);" in css
    assert "top: calc(6px + var(--tienda-arriba));" in css, "el botón de cerrar nunca bajo la muesca"
    assert "top: calc(12px + var(--tienda-arriba));" in css
    # 5.49: la zona segura va DENTRO de cada pestaña (relleno de abajo, tocable y del color de la barra).
    assert "padding-bottom: max(calc(var(--tienda-abajo) - 14px), 0px);" in css, "las pestañas no bajo la barra"
    assert "calc(10px + var(--tienda-abajo))" in css, "el menú de gestos tampoco"
    assert "inset: 0;\n  z-index: 5000;" not in css,"ni la tienda ni el menú son ya un inset: 0 (la ventana de diseño, no lo que se ve)"
    # La zona que se desplaza sigue siendo el cuerpo, y el escenario ya no se come 40 % + 210 px mínimos.
    # 5.47: el escenario se queda con lo que la hoja no necesita (hoja compacta), con un mínimo.
    assert "flex: 1 1 0;\n  min-height: clamp(190px, 33%, 400px);" in css and "min-height: 210px" not in css
    assert "@media (max-height: 700px) and (orientation: portrait)" in css
    assert ".saga-tienda-cuerpo {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;" in css


def test_la_tienda_y_el_menu_publican_el_area_visible_al_abrirse():
    for nombre in ("TiendaDeRopa.tsx", "MenuDeGestos.tsx"):
        t = leer(MIXAMO / nombre)
        assert "import { useAreaVisible } from './areaVisible'" in t and "  useAreaVisible()\n" in t, nombre
    area = leer(MIXAMO / "areaVisible.ts")
    assert "window.visualViewport" in area and "addEventListener('resize', aplicar)" in area
    assert "removeProperty" in area, "al cerrar la hoja se quitan las variables"

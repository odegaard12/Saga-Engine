# -*- coding: utf-8 -*-
"""22/11 (mejora 8): el service worker entero, ejecutado en Node con cachés, red y reloj de mentira (tests/js/sw_22_11.cjs).

La caché de mentira cuenta cuántas veces se RECORRE (`keys()` o `match`/`delete` con ignoreSearch): en 6.12.4 cada
tesela que faltaba recorría las ~10 600 guardadas y el mapa dejó de cargar al alejar.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SHELL = "saga-player-shell"
TESELAS = "saga-route-tile-coverage-v5.55-terrarium"


@pytest.fixture(scope="module")
def sw():
    node = shutil.which("node")
    if not node:
        pytest.skip("node no está disponible")
    p = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "sw_22_11.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ),
    )
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_instalar_guarda_lo_minimo_sin_pisar_la_portada(sw):
    i = sw["instalacion"]
    assert "/" not in i["red"] and i["portada"] == "PORTADA_VIEJA", "la portada guardada no se pisa"
    assert not any(r.startswith("/assets/") for r in i["red"]), "la instalación no baja paquetes"
    assert "/manifest.webmanifest" in i["guardado"] and "/sw.js" in i["guardado"]
    assert "/login-fondo.jpg" in i["red"] and "/login-fondo.jpg" not in i["guardado"], "un 404 no tumba la instalación"
    assert i["saltos"] == 1


def test_activar_muda_lo_viejo_y_borra_solo_las_cachés_caducadas(sw):
    a = sw["activacion"]
    assert a["caches"] == sorted(
        [SHELL, "saga-player-shell-previa", TESELAS, "saga-field-proof-assets-v3.9.6", "saga-road-graph-v2"]
    )
    assert "/assets/index-viejo.js" in a["shell"], "lo de la caché vieja se muda antes de borrarla"
    assert a["noPisaLoNuevo"] == "NUEVO"
    assert a["previa"] == ["/assets/index-nuevo.js"], "la copia previa: sólo /assets/, sin avatares, rehecha"
    assert a["teselas"] == ["/map-tiles/1/1/1.png"], "la red de caminos vieja sale de la caché de teselas"
    assert a["reclamado"] == 1


def test_activar_no_recorre_las_teselas(sw):
    a = sw["activacion"]
    assert a["recorridosEnTeselas"] == 0 and a["keysEnTeselas"] == 0


def test_skip_waiting_por_mensaje(sw):
    assert sw["mensajes"]["saltos"] == 1


def test_lo_de_la_app_primero_de_la_cache(sw):
    s = sw["shell"]
    assert s["guardado"]["cuerpo"] == "GUARDADO" and s["guardadoRed"] == 0
    assert s["iconoConQuery"]["cuerpo"] == "ICONO", "el icono se guardó sin query y se pide con ?v="
    assert s["nuevo"]["cuerpo"] == "BAJADO" and s["nuevoGuardado"]
    assert s["caido"]["estado"] == 502 and not s["caidoGuardado"], "un 5xx no se guarda"
    assert s["sinRedNiCopia"]["error"]
    assert s["matchEnTeselas"] == 0 and s["keysEnTeselas"] == 0, "lo de la app no se busca en las teselas"


def test_api_y_panel_no_pasan_por_el_service_worker(sw):
    # La API no tiene «red primero» en el SW: sin red, el móvil tira de su paquete y su cola (IndexedDB).
    assert not any(sw["sinInterceptar"].values()), sw["sinInterceptar"]


def test_edificios_red_primero_y_sin_red_lo_guardado(sw):
    e = sw["edificios"]
    vacio = '{"type":"FeatureCollection","features":[]}'
    assert '"features":[1]' in e["conRed"]["cuerpo"]
    assert e["sinRedCopia"]["cuerpo"] == e["conRed"]["cuerpo"] and e["caidoCopia"]["cuerpo"] == e["conRed"]["cuerpo"]
    assert e["sinRedNada"]["estado"] == 200 and e["sinRedNada"]["cuerpo"] == vacio


def test_teselas_solo_con_su_direccion_exacta(sw):
    t = sw["teselas"]
    assert t["guardada"]["cuerpo"] == "T77" and t["guardadaRed"] == 0
    assert t["faltanFallan"]
    assert t["keys"] == 0 and t["recorridos"] == 0, "con 10 600 teselas guardadas, una que falta no recorre ninguna"
    assert t["matchPorTesela"] == 1
    assert t["buenaGuardada"] and not t["fueraDeZonaGuardada"]


def test_avatares_primero_la_cache_con_su_version(sw):
    a = sw["avatares"]
    assert a["mismaVersion"]["cuerpo"] == "FOTO_V1" and a["mismaVersionRed"] == 0
    assert a["otraVersion"]["cuerpo"] == "FOTO_V2" and a["otraVersionGuardada"], "la foto cambiada va a la red"
    assert not a["htmlGuardado"], "la página de login no se guarda como foto"
    assert a["recorridos"] == 0 and a["keys"] == 0


def test_sin_red_la_foto_de_otra_version_y_con_tope(sw):
    a = sw["avatares"]
    assert a["sinRedOtraVersion"]["cuerpo"] == "FOTO_V2", "la última versión guardada, no imagen rota"
    assert a["sinRedOtroJugador"]["error"], "nunca la foto de otro"
    assert a["fotoDeCampoSinRed"]["cuerpo"] == "LIGERA"
    assert a["redColgada"] != "<<COLGADA>>" and a["redColgada"]["error"], "con una barra, la foto no pide para siempre"


def test_el_indice_sin_query_se_construye_una_vez_cada_5_min(sw):
    i = sw["indice"]
    assert i["aLaVez"] == 1, "diez fallos a la vez: una construcción"
    assert i["dentroDe5Min"] == 1
    assert i["pasados5Min"] == 2
    assert i["exactaTrasElIndice"]["cuerpo"] == "NUEVO"
    assert i["borradaTrasElIndice"]["cuerpo"] == "ICONO_RED"


def test_un_indice_viejo_no_cambia_la_pagina_por_la_portada(sw):
    assert sw["indiceViejo"] == {"antes": "VIEJA", "despues": "NUEVA"}


def test_navegacion_sin_red(sw):
    n = sw["navegacion"]
    assert "COPIA" in n["conCopia"]["cuerpo"], "la página guardada aunque se abra con otra query"
    assert n["soloPortada"]["cuerpo"] == "PORTADA"
    assert n["nada"]["estado"] == 503 and "Reintentar" in n["nada"]["cuerpo"]
    assert "COPIA" in n["caido"]["cuerpo"], "un 502 de Cloudflare: la copia, no «Bad gateway»"


def test_con_copia_una_red_colgada_no_deja_la_pantalla_en_blanco(sw):
    # 23/11: medido en el móvil, 5 s en blanco hasta el tope de la red. Ahora la copia sale a los ~0,8 s.
    n = sw["navegacion"]
    assert n["colgadaConCopia"]["cuerpo"] == "PORTADA" and n["colgadaConCopia"]["ms"] < 2500
    assert n["redRapidaConCopia"] == "<html>NUEVA", "si la red contesta antes del tope, manda la red (versiones nuevas)"
    assert n["sinCopiaLenta"]["cuerpo"] == "<html>RED" and n["sinCopiaLenta"]["ms"] >= 1400, "sin copia se espera a la red"
    assert n["lentaConCopia"] == "PORTADA_VIEJA", "la red tarda más que el tope: se enseña la copia"
    assert n["guardadaDespues"] == "<html>NUEVA", "y la página nueva se guarda por detrás para la próxima"


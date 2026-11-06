# -*- coding: utf-8 -*-
"""31/10: mapa offline sin huecos. El mapa no pide un zoom que no se haya bajado (amplía el último), el paquete cubre
la ruta con margen en cada zoom, y la pantalla de carga comprueba en la caché que está todo."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
FRONT = RAIZ / "frontend" / "src" / "player"


@pytest.fixture(scope="module")
def r():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin typescript")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "mapa_offline_31_10.cjs")], capture_output=True, text=True, timeout=120, cwd=RAIZ)
    assert p.returncode == 0, p.stderr
    return json.loads(p.stdout.strip().splitlines()[-1])


def test_el_mapa_no_pide_un_zoom_que_no_se_bajo(r):
    """Sin red, z19 sólo estaba junto a los nodos: entre nodos el mapa salía en blanco a zoom 18-19."""
    assert r["maximo"] == max(r["zooms"]) == 18, "el plan llega justo al maxzoom del mapa, ni más ni menos"
    mapa = (FRONT / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "maxzoom: ZOOM_MAXIMO_DESCARGADO," in mapa, "la fuente de satélite amplía el último zoom bajado"


def test_el_paquete_cubre_la_ruta_con_margen_en_cada_zoom(r):
    """A 500 m de la ruta a z18 (y más lejos cuanto más bajo el zoom) tiene que haber tesela guardada."""
    assert r["fuera"] == {str(z): 0 for z in range(13, 19)}, r["fuera"]


def test_la_pantalla_de_carga_comprueba_que_esta_todo(r):
    assert r["todo"] is True and r["faltaMapa"] is False and r["sinMision"] is False
    assert r["megas"] == ["150 MB", None, None]
    app = (FRONT / "PlayerApp.tsx").read_text(encoding="utf-8")
    # 7/11: en las dos pantallas, en la línea de la barra (ya no es una pastilla aparte).
    assert "resumenDe={todoListo(state.carga) ? user : null}" in app and "resumenDe={user}" in app
    resumen = (FRONT / "components" / "ResumenDeDescarga.tsx").read_text(encoding="utf-8")
    assert "Todo descargado ✓" in resumen and "formatearFalta(falta)" in resumen, "con la cuenta atrás si hay hora de inicio"


def test_la_comprobacion_final_nunca_retiene_la_pantalla(r):
    """Se quedó más de 90 s en «Comprobando lo descargado…» (cache.keys() de ~3300 teselas). Ahora va con tiempo
    máximo: si la caché no contesta, a los pocos segundos no se enseña nada y se sigue."""
    assert r["conLimite"] is None and r["msConLimite"] < 2000
    resumen = (FRONT / "components" / "ResumenDeDescarga.tsx").read_text(encoding="utf-8")
    assert "comprobarConLimite(user)" in resumen and "if (!user || c === null) return null" in resumen
    cache = (FRONT / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "async function urlsYaGuardadas(cache: Cache, urls: string[])" in cache, "keys() de miles de teselas tardaba minutos: consultas en tandas"


_TESELA_COLGADA = r"""
const fs = require('fs')
const oyentes = {}
const self = { addEventListener: (t, f) => { oyentes[t] = f }, skipWaiting: () => {}, clients: { claim: async () => {} }, registration: {} }
const cache = { match: async () => undefined, put: async () => {}, keys: async () => [] }
const caches = { open: async () => cache, keys: async () => [], match: async () => undefined, delete: async () => true }
// La red no contesta nunca (una barra), pero respeta la cancelación.
const fetch = (req, init) => new Promise((_, no) => init && init.signal && init.signal.addEventListener('abort', () => no(new Error('abort'))))
const rapido = (f) => setTimeout(f, 10) // el tope de 8 s, en 10 ms
new Function('self', 'caches', 'fetch', 'setTimeout', fs.readFileSync(process.argv[1], 'utf8'))(self, caches, fetch, rapido)
let respuesta
oyentes.fetch({ request: new Request('http://x.test/map-tiles/18/1/2.png'), respondWith: (p) => { respuesta = p } })
const t0 = Date.now()
Promise.race([respuesta.then(() => 'contesto', () => 'cortada'), new Promise((r) => setTimeout(() => r('colgada'), 2000))]).then((r) => console.log(r))
"""


def test_una_tesela_sin_red_no_se_queda_pidiendo_para_siempre():
    """Con una barra, la tesela que no estaba se quedaba pidiendo y tapaba a las guardadas: el mapa iba a saltos."""
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    sw = RAIZ / "frontend" / "public" / "sw.js"
    p = subprocess.run([node, "-e", _TESELA_COLGADA, str(sw)], capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr
    assert p.stdout.strip().splitlines()[-1] == "cortada"


def test_el_resumen_final_no_recuenta_lo_que_la_carga_acaba_de_contar():
    """Contar otra vez las ~3500 teselas con el mapa pintándose tardaba ~20 s: con el resumen de esta misma carga
    completo (mismo plan y misma ruta) basta una muestra de 200; si no, se cuentan todas."""
    final = (FRONT / "offline" / "comprobacionFinal.ts").read_text(encoding="utf-8")
    assert "teselasQueFaltan(stages, { muestra: true })" in final
    cache = (FRONT / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "resumen?.firma === firmaDelPlan()" in cache and "muestraDeTeselas(urls, 200)" in cache

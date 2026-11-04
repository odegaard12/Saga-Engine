# -*- coding: utf-8 -*-
"""Revisión offline 30/10: lo que se encontró jugando la ruta entera en modo avión."""
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SW = RAIZ / "frontend" / "public" / "sw.js"

# Ejecuta el `install` de sw.js de verdad, con una caché falsa que ya tiene la página '/' de la versión vieja.
_INSTALAR = r"""
const fs = require('fs')
const guardado = new Map([['/', 'viejo']])
const cache = {
  match: async (u) => (guardado.has(String(u)) ? new Response(guardado.get(String(u))) : undefined),
  add: async (u) => { guardado.set(String(u), 'nuevo') },
  put: async () => {},
}
const oyentes = {}
const self = { addEventListener: (t, f) => { oyentes[t] = f }, skipWaiting: () => {}, clients: { claim: async () => {} }, registration: {} }
const caches = { open: async () => cache, keys: async () => [], match: async () => undefined, delete: async () => true }
new Function('self', 'caches', 'fetch', fs.readFileSync(process.argv[1], 'utf8'))(self, caches, async () => new Response('x'))
let espera
oyentes.install({ waitUntil: (p) => { espera = p } })
espera.then(() => console.log(JSON.stringify(Object.fromEntries(guardado))))
"""


def test_un_service_worker_nuevo_no_pisa_la_pagina_guardada():
    """Cada cambio de sw.js instala un worker nuevo. Su `install` volvía a bajar '/' y guardaba el HTML de la versión
    nueva sin sus paquetes: la app instalada (start_url '/') abría en blanco sin red tras un despliegue."""
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, "-e", _INSTALAR, str(SW)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    guardado = __import__("json").loads(r.stdout.strip().splitlines()[-1])
    assert guardado["/"] == "viejo", "el worker nuevo pisó la página '/' guardada"
    assert guardado["/manifest.webmanifest"] == "nuevo", "lo demás del núcleo se sigue bajando"


def test_el_vigilante_de_version_no_baja_nada_con_la_ruta_a_medias():
    """Con la ruta a medias (nivel 14 de 16) y otra versión en el servidor, el móvil pedía '/', la lista de paquetes
    y los paquetes nuevos al arrancar: miraba si había ruta antes de que la pantalla del jugador cargase la partida."""
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin typescript")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "version_en_ruta.cjs")], capture_output=True, text=True, timeout=120, cwd=RAIZ)
    assert r.returncode == 0, r.stderr
    datos = __import__("json").loads(r.stdout.strip().splitlines()[-1])
    assert datos["enRuta"] == ["/api/version"], "con la ruta empezada no se baja nada de la versión nueva"
    assert "/player-precache.json" in datos["sinEmpezar"], "sin ruta empezada se sigue preparando la versión nueva"


def test_actualizar_no_borra_los_trozos_de_la_pagina_vieja_que_aun_esta_abierta():
    """Fallo de la primera entrada tras actualizar a 6.2.0: el service worker sirve el HTML guardado (el de la versión
    vieja) mientras la pantalla de carga baja la nueva, y al acabar se podaban los trozos perezosos de la vieja (mapa,
    ranking, mochila). Cada import() daba 404: mapa gris y botones muertos hasta salir y volver a entrar."""
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin typescript")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "poda_pagina_vieja.cjs")], capture_output=True, text=True, timeout=120, cwd=RAIZ)
    assert r.returncode == 0, r.stderr
    datos = __import__("json").loads(r.stdout.strip().splitlines()[-1])
    assert "/assets/Mapa-viejo.js" in datos["paginaVieja"] and "/assets/Ranking-viejo.js" in datos["paginaVieja"], "no se poda con la página vieja en marcha"
    assert datos["paginaNueva"] == ["/assets/Mapa-nuevo.js", "/assets/index-nueva.js"], "con la página ya nueva, sí se poda"


_ACTIVAR = r"""
const fs = require('fs')
const mapas = { 'saga-player-shell': new Map([['/assets/Mapa-viejo.js', 'm'], ['/assets/avatares/Ch01.glb', 'g'], ['/', 'h']]) }
const abrir = (n) => ({
  keys: async () => [...(mapas[n] || new Map()).keys()].map((k) => new Request('http://x.test' + k)),
  match: async (r) => { const k = new URL(typeof r === 'string' ? r : r.url, 'http://x.test').pathname; const v = (mapas[n] || new Map()).get(k); return v === undefined ? undefined : new Response(v) },
  put: async (r, res) => { mapas[n] = mapas[n] || new Map(); mapas[n].set(new URL(typeof r === 'string' ? r : r.url, 'http://x.test').pathname, await res.text()) },
  delete: async () => true,
})
const caches = { open: async (n) => abrir(n), keys: async () => Object.keys(mapas), match: async () => undefined, delete: async (n) => { delete mapas[n]; return true } }
const oyentes = {}
const self = { addEventListener: (t, f) => { oyentes[t] = f }, skipWaiting: () => {}, clients: { claim: async () => {} }, registration: {} }
new Function('self', 'caches', 'fetch', fs.readFileSync(process.argv[1], 'utf8'))(self, caches, async () => new Response('x'))
let espera
oyentes.activate({ waitUntil: (p) => { espera = p } })
espera.then(() => console.log(JSON.stringify(Object.fromEntries(Object.entries(mapas).map(([k, v]) => [k, [...v.keys()]])))))
"""


def test_el_service_worker_guarda_una_copia_de_los_paquetes_para_la_pagina_vieja():
    """La poda que borra los trozos de la versión vieja la hace el código de la página vieja (no se puede cambiar):
    el worker nuevo, que se activa antes, deja una copia de /assets/ (sin avatares) que `caches.match` encuentra."""
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, "-e", _ACTIVAR, str(SW)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    caches = __import__("json").loads(r.stdout.strip().splitlines()[-1])
    assert caches["saga-player-shell-previa"] == ["/assets/Mapa-viejo.js"], "sólo los paquetes, sin la página ni los avatares"
    assert "/assets/Mapa-viejo.js" in caches["saga-player-shell"], "la caché buena no se toca"

// Revisión del motor del 05/10/2026, lado del móvil: ejecuta los módulos TS tal
// cual en el navegador de mentira de entorno_navegador.cjs y vuelca en JSON lo
// que hacen. Lo comprueba tests/test_revision_motor_js.py.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { crearEntorno, FRONT } = require('./entorno_navegador.cjs')

/**
 * `redDeCaminos.ts` crea su worker con `new URL(…, import.meta.url)`, que el
 * transpilador a CommonJS de entorno_navegador no admite. Se copia (con su única
 * dependencia, roadGraph.ts) a una carpeta temporal cambiando sólo esa expresión:
 * sin `Worker` en el entorno, esa rama ni se ejecuta.
 */
function copiaDeRedDeCaminos() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saga-red-'))
  const origen = path.join(FRONT, 'src', 'player', 'routing')
  fs.copyFileSync(path.join(origen, 'roadGraph.ts'), path.join(dir, 'roadGraph.ts'))
  const codigo = fs
    .readFileSync(path.join(origen, 'redDeCaminos.ts'), 'utf8')
    .replace(/import\.meta\.url/g, "'http://localhost/'")
  fs.writeFileSync(path.join(dir, 'redDeCaminos.ts'), codigo)
  return path.relative(FRONT, path.join(dir, 'redDeCaminos.ts'))
}
const RED = copiaDeRedDeCaminos()

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function json(cuerpo) {
  return new Response(JSON.stringify(cuerpo), { headers: { 'content-type': 'application/json' } })
}

/* M4: la red de caminos se reintenta sola si no llega a la primera. */
async function redDeCaminos() {
  const e = crearEntorno()
  let pedidas = 0
  e.servidor = (url) => {
    if (url.pathname !== '/api/road-graph') return null
    pedidas += 1
    if (pedidas < 2) return null // la primera vez, sin cobertura
    return json({ nodos: [[40.5, -3.5], [40.501, -3.5]], tramos: [[0, 1, 111, [], 0]] })
  }
  const m = e.cargar(RED)
  const red = m.crearRedDeCaminos()
  let avisos = 0
  red.alQuedarLista(() => {
    avisos += 1
  })
  const primera = await red.cargar()
  for (let i = 0; i < 20 && !red.lista(); i += 1) await esperar(100)
  const salida = { esperas: m.ESPERAS_DE_REINTENTO_MS, primera, listaDespues: red.lista(), avisos, pedidas }

  // Cerrada: no se reintenta más.
  const e2 = crearEntorno()
  let pedidas2 = 0
  e2.servidor = (url) => {
    if (url.pathname === '/api/road-graph') pedidas2 += 1
    return null
  }
  const m2 = e2.cargar(RED)
  const red2 = m2.crearRedDeCaminos()
  await red2.cargar()
  red2.cerrar()
  await esperar(700)
  salida.trasCerrar = pedidas2

  // Siempre sin red: se rinde tras los reintentos previstos.
  const e3 = crearEntorno()
  let pedidas3 = 0
  e3.servidor = (url) => {
    if (url.pathname === '/api/road-graph') pedidas3 += 1
    return null
  }
  const red3 = e3.cargar(RED).crearRedDeCaminos()
  await red3.cargar()
  await esperar(1500)
  salida.sinRedNunca = pedidas3
  return salida
}

/* F5: las fotos borradas o purgadas salen de la caché del móvil. */
async function fotosRetiradas() {
  const e = crearEntorno()
  const m = e.cargar('src/player/offline/fieldProofCache.ts')
  const cache = await e.caches.open('saga-field-proof-assets-v3.9.6')
  const poner = (ruta) => cache.put(ruta, new Response('x', { headers: { 'content-type': 'image/jpeg' } }))
  await poner('/api/field-proofs/viva/thumb')
  await poner('/api/field-proofs/viva/image')
  await poner('/api/field-proofs/borrada/thumb')
  await poner('/api/field-proofs/borrada/image')
  await poner('/api/field-proofs/download')
  await poner('/api/player-avatar/p1?v=1')
  await poner('/media/nodo/9/abc.webp')
  const borradas = await m.olvidarFotosRetiradas([{ id: 'viva' }])
  const quedan = (await cache.keys()).map((r) => new URL(r.url, 'http://x').pathname).sort()
  return { borradas, quedan }
}

/* T1: un compañero sin latido hace rato pasa a «sin conexión». */
function presencia() {
  const e = crearEntorno()
  const m = e.cargar('src/player/offline/teamPresence.ts')
  const ahora = 1_800_000_000_000
  const s = (min) => Math.round((ahora - min * 60_000) / 1000)
  const perfiles = [
    { user: 'a', presence: 'stale', last_seen: s(30) },
    { user: 'b', presence: 'stale', last_seen: s(5) },
    { user: 'c', presence: 'live', last_seen: s(1) },
    { user: 'd', presence: 'stale', last_seen: 0 },
    { user: 'yo', presence: 'stale', last_seen: s(60), is_self: true },
  ]
  return {
    umbral: m.SIN_CONEXION_TRAS_MS,
    resultado: m.envejecerPresencia(perfiles, ahora).map((p) => [p.user, p.presence]),
  }
}

/* GPS: la posición restaurada de la sesión anterior no abre nodos. */
function posicionParaAbrir() {
  const e = crearEntorno()
  const d = e.cargar('src/player/gps/decisiones.ts')
  const ahora = 1_800_000_000_000
  return {
    maximo: d.ANTIGUEDAD_MAXIMA_PARA_ABRIR_MS,
    restaurada: d.posicionValeParaAbrir(null, ahora),
    reciente: d.posicionValeParaAbrir(ahora - 20_000, ahora),
    vieja: d.posicionValeParaAbrir(ahora - 10 * 60_000, ahora),
    delFuturo: d.posicionValeParaAbrir(ahora + 60_000, ahora),
  }
}

/* M2: la brújula de respaldo sin WebGL. */
function sinMapa() {
  const e = crearEntorno()
  const m = e.cargar('src/player/utils/sinMapa.ts')
  const o = { lat: 40.5, lon: -3.5 }
  return {
    norte: Math.round(m.rumboEntre(o, { lat: 40.51, lon: -3.5 })),
    este: Math.round(m.rumboEntre(o, { lat: 40.5, lon: -3.49 })),
    sur: Math.round(m.rumboEntre(o, { lat: 40.49, lon: -3.5 })),
    oeste: Math.round(m.rumboEntre(o, { lat: 40.5, lon: -3.51 })),
    giro: m.giroDeLaFlecha(90, 120),
    giroSinBrujula: m.giroDeLaFlecha(90, null),
    distancias: [m.formatoDistancia(84.6, 'es'), m.formatoDistancia(1234, 'gl'), m.formatoDistancia(1234, 'en'), m.formatoDistancia(null, 'es')],
    cardinales: [m.puntoCardinal(0, 'es'), m.puntoCardinal(225, 'es'), m.puntoCardinal(225, 'en'), m.puntoCardinal(359, 'en')],
  }
}

/* Mosaico: el hash del móvil es el del servidor. */
function hashDelMosaico() {
  const e = crearEntorno()
  const s = e.cargar('src/player/utils/sha256.ts')
  return { h: s.sha256Hex('9:mosaico:2') }
}

async function main() {
  const salida = {}
  const casos = { redDeCaminos, fotosRetiradas, presencia, posicionParaAbrir, sinMapa, hashDelMosaico }
  for (const [nombre, fn] of Object.entries(casos)) {
    try {
      salida[nombre] = await fn()
    } catch (error) {
      salida[nombre] = { __error: String((error && error.stack) || error) }
    }
  }
  process.stdout.write(JSON.stringify(salida))
}

main()

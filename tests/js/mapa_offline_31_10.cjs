// 31/10: el plan de teselas cubre la ruta con margen en cada zoom y no pasa del maxzoom del mapa. Ruta inventada
// (no es de ninguna misión). Imprime un JSON que comprueba tests/test_revision_mapa_offline_31_10.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')

const e = crearEntorno()
const mapa = e.cargar('src/player/offline/mapTileCache.ts')
const final = e.cargar('src/player/offline/comprobacionFinal.ts')

// ~4,5 km en zigzag
const nodos = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, lat: 41.2 + 0.0019 * i, lon: -4.1 + 0.0024 * i + (i % 2 ? 0.0012 : 0) }))
const plan = mapa.planificarTeselas(nodos)
const sat = new Set(plan.urls.filter((u) => u.startsWith('/map-tiles/')))
const zooms = [...new Set([...sat].map((u) => Number(u.split('/')[2])))]

const tesela = (lat, lon, z) => {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)]
}
// Margen pedido por zoom (km a cada lado de la ruta).
const MARGEN = { 13: 7, 14: 5, 15: 3, 16: 1.5, 17: 1, 18: 0.5 }
const fuera = {}
for (const [zs, km] of Object.entries(MARGEN)) {
  const z = Number(zs)
  fuera[z] = 0
  for (let i = 0; i + 1 < nodos.length; i += 1) {
    const a = nodos[i]
    const b = nodos[i + 1]
    const dn = (b.lat - a.lat) * 111320
    const de = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180)
    const l = Math.hypot(dn, de)
    for (let t = 0; t <= 1; t += 0.1) {
      for (const d of [-km * 1000, km * 1000]) {
        const lat = a.lat + (b.lat - a.lat) * t + ((-de / l) * d) / 111320
        const lon = a.lon + (b.lon - a.lon) * t + ((dn / l) * d) / (111320 * Math.cos((a.lat * Math.PI) / 180))
        const [x, y] = tesela(lat, lon, z)
        if (!sat.has(`/map-tiles/${z}/${x}/${y}.png`)) fuera[z] += 1
      }
    }
  }
}

// Una caché que no contesta nunca (iPhone tras segundo plano, caché saturada): la comprobación no puede retener.
e.sandbox.caches.open = () => new Promise(() => {})
e.sandbox.indexedDB.open = () => ({})
;(async () => {
const t0 = Date.now()
const conLimite = await final.comprobarConLimite('TEST', 300)
const msConLimite = Date.now() - t0
console.log(
  JSON.stringify({
    conLimite,
    msConLimite,
    maximo: mapa.ZOOM_MAXIMO_DESCARGADO,
    zooms: zooms.sort((a, b) => a - b),
    teselas: plan.urls.length,
    fuera,
    todo: final.todoDescargado({ paquetesQueFaltan: 0, teselasQueFaltan: 0, hayMision: true, bytes: 0, inicio: '' }),
    faltaMapa: final.todoDescargado({ paquetesQueFaltan: 0, teselasQueFaltan: 3, hayMision: true, bytes: 0, inicio: '' }),
    sinMision: final.todoDescargado({ paquetesQueFaltan: 0, teselasQueFaltan: 0, hayMision: false, bytes: 0, inicio: '' }),
    megas: [final.megas(150 * 1048576), final.megas(null), final.megas(0)],
  })
)
})()

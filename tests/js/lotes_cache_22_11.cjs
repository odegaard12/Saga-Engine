// Lotes de mapa 22/11: el móvil lee el lote con cuidado (largos, cuenta, rutas pedidas, cuerpo colgado) y la versión
// de los lotes lleva la caché del móvil y los datos del servidor. Imprime un JSON que comprueba
// tests/test_lotes_cache_22_11.py.
'use strict'
const { crearEntorno } = require('./entorno_navegador.cjs')
const { ServidorFalso, PNG } = require('./servidor_falso.cjs')

const CACHE = 'saga-route-tile-coverage-v5.55-terrarium'

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}
function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}
function lote(entradas, cuantas = entradas.length) {
  const partes = [Buffer.from('SAGT'), u32(cuantas)]
  for (const [ruta, tipo, datos] of entradas) {
    const r = Buffer.from(ruta)
    const t = Buffer.from(tipo)
    partes.push(u16(r.length), r, u16(t.length), t, u32(datos.length), datos)
  }
  const b = Buffer.concat(partes)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}

;(async () => {
  const res = {}
  const e = crearEntorno()
  const mapa = e.cargar('src/player/offline/mapTileCache.ts')

  // 1. El parser del lote.
  const A = '/map-tiles/15/1/1.png'
  const B = '/map-tiles/15/2/1.png'
  const rutas = (t) => (t ? t.map((x) => [x.ruta, x.largo]) : null)
  const bueno = lote([[A, 'image/png', PNG], [B, 'image/png', PNG]])
  res.parser = {
    bueno: rutas(mapa.teselasDelLote(bueno, [A, B])),
    cortado: rutas(mapa.teselasDelLote(bueno.slice(0, bueno.byteLength - 3), [A, B])),
    cortadoEnLaRuta: rutas(mapa.teselasDelLote(bueno.slice(0, 12), [A, B])),
    otraCuenta: rutas(mapa.teselasDelLote(lote([[A, 'image/png', PNG]], 1), [A, B])),
    rutaDeMas: rutas(mapa.teselasDelLote(lote([[A, 'image/png', PNG], ['/map-tiles/15/9/9.png', 'image/png', PNG]]), [A, B])),
    largoMentiroso: rutas(mapa.teselasDelLote(lote([[A, 'image/png', PNG]], 1).slice(0, 8 + 2 + A.length + 2 + 9 + 4 + 3), [A])),
    sinMagia: rutas(mapa.teselasDelLote(new ArrayBuffer(16), [A])),
  }

  // 2. Versiones: la de los lotes lleva la de las teselas; el relieve, la suya.
  mapa.fijarVersionDelMapa3d('m3d')
  const v0 = mapa.versionDeLotes('ruta')
  res.relieveServidorViejo = mapa.sufijoDelRelieve()
  mapa.fijarVersionDelMapa3d('m3d', { relieve: '', teselas: 't1' })
  const v1 = mapa.versionDeLotes('ruta')
  res.relieveTerrarium = mapa.sufijoDelRelieve()
  res.edificios = mapa.sufijoDelMapa3d()
  mapa.fijarVersionDelMapa3d('m3d', { relieve: '', teselas: 't2' })
  const v2 = mapa.versionDeLotes('ruta')
  mapa.fijarVersionDelMapa3d('m3d', { relieve: 'ign1', teselas: 't2' })
  res.relieveIgn = mapa.sufijoDelRelieve()
  res.versiones = { cambiaConTeselas: v1 !== v2, cambiaConServidorNuevo: v0 !== v1, formato: /^p[0-9a-z]+$/.test(v2) }
  res.planIgnConV = mapa.planificarTeselas([{ id: 1, lat: 42.5, lon: -8.7 }]).urls.some((u) => u.includes('?v='))
  mapa.fijarVersionDelMapa3d('m3d', { relieve: '', teselas: 't2' })
  res.planTerrariumSinV = !mapa.planificarTeselas([{ id: 1, lat: 42.5, lon: -8.7 }]).urls.some((u) => u.startsWith('/dem-tiles/') && u.includes('?v='))

  // 3. La carga entera: un lote se cuelga a mitad del cuerpo (se aborta y se reintenta), otro llega cortado, y una
  //    tesela suelta llega en blanco de fuera de la zona (no se guarda).
  const srv = new ServidorFalso()
  const stages = [
    { id: 1, lat: 42.5, lon: -8.7 },
    { id: 2, lat: 42.512, lon: -8.712 },
  ]
  let colgados = 0
  let cortados = 0
  let abortados = 0
  let fuera = null
  e.servidor = (url, init) => {
    if (url.pathname.startsWith('/api/teselas/lote/')) {
      const lista = String(url.searchParams.get('t') || '').split(',').filter(Boolean)
      if (!fuera) fuera = lista[lista.length - 1]
      if (colgados === 0) {
        colgados += 1
        const cuerpo = new ReadableStream({
          start(control) {
            control.enqueue(new Uint8Array(Buffer.from('SAGT')))
            init.signal.addEventListener('abort', () => {
              abortados += 1
              control.error(new Error('AbortError'))
            })
          },
        })
        return new Response(cuerpo, { status: 200, headers: { 'content-type': 'application/octet-stream' } })
      }
      const respuesta = srv.lote(lista)
      if (cortados === 0) {
        cortados += 1
        return respuesta.arrayBuffer().then((b) => new Response(Buffer.from(b).subarray(0, b.byteLength - 5), { status: 200 }))
      }
      if (lista.includes(fuera)) {
        // La de fuera de la zona llega vacía en el lote, como en el servidor de verdad.
        srv.loteSinDatos = (r) => r === fuera
        const r = srv.lote(lista)
        srv.loteSinDatos = () => false
        return r
      }
      return respuesta
    }
    if (fuera && url.pathname + url.search === fuera) {
      return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png', 'X-Saga-Tesela': 'fuera-de-zona' } })
    }
    return srv.manejar(url, init)
  }
  const sinCapturar = []
  process.on('unhandledRejection', (error) => sinCapturar.push(String(error)))
  const resumen = await mapa.prefetchMissionMapTiles(stages, undefined, { redDeCaminos: false })
  const guardadas = e.caches.contenido(CACHE)
  res.carga = {
    abortados,
    fueraGuardada: guardadas.includes(fuera),
    fueraFalta: (resumen.faltan || 0) >= 1,
    lotesPorGet: e.peticiones.filter((p) => p.ruta.startsWith('/api/teselas/lote/')).length,
    lotesPorPost: e.peticiones.filter((p) => p.ruta === '/api/teselas/lote').length,
    sinCapturar,
  }
  console.log(JSON.stringify(res))
})().catch((error) => {
  console.error(error)
  process.exit(1)
})

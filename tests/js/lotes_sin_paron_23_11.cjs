// 23/11 (auditoría Slow 4G): un lote sólo se aborta si se PARA; el relieve suelto va en WebP; la barra de la carga es
// una sola, sólo avanza y no dice 100 hasta el final. Imprime un JSON que comprueba tests/test_lotes_sin_paron_23_11.py.
'use strict'
const { crearEntorno, FRONT } = require('./entorno_navegador.cjs')
const { PNG } = require('./servidor_falso.cjs')

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

/** Un cuerpo que manda `trozos` (bytes) con las esperas dadas (ms reales) antes de cada uno; se corta al abortar. */
function cuerpoLento(esperas, señal) {
  let cancelado = false
  return new ReadableStream({
    async start(control) {
      señal?.addEventListener('abort', () => {
        cancelado = true
        try {
          control.error(new Error('AbortError'))
        } catch {
          // ya cerrado
        }
      })
      for (const ms of esperas) {
        await pausa(ms)
        if (cancelado) return
        control.enqueue(new Uint8Array(1000).fill(7))
      }
      if (!cancelado) control.close()
    },
    cancel() {
      cancelado = true
    },
  })
}

;(async () => {
  const res = {}

  // 1. fetchSinParon, con el tiempo a 1/100: 20 s de parón = 200 ms.
  {
    const e = crearEntorno()
    e.sandbox.setTimeout = (fn, ms, ...resto) => setTimeout(fn, ms / 100, ...resto)
    const p = e.cargar('src/player/offline/peticiones.ts')
    const pedir = async (esperas) => {
      e.servidor = (url, init) => new Response(cuerpoLento(esperas, init.signal), { status: 200 })
      const t0 = Date.now()
      try {
        const { cuerpo } = await p.fetchSinParon('/lento', {}, { esperaMs: 30000, maximoMs: 600000 })
        return { ok: true, bytes: cuerpo.byteLength, ms: Date.now() - t0 }
      } catch {
        return { ok: false, ms: Date.now() - t0 }
      }
    }
    // Seis trozos cada 10 s (60 s en total, nunca 20 s sin nada): llega entero. Con el límite fijo de 30 s, abortado.
    res.lento = await pedir([100, 100, 100, 100, 100, 100])
    // Un trozo y luego 25 s sin nada: se aborta (a los ~20 s), sin cuerpo a medias.
    res.parado = await pedir([50, 250, 50])
    // Y el seguro: sigue llegando pero no acaba nunca.
    e.servidor = (url, init) => new Response(cuerpoLento(new Array(200).fill(50), init.signal), { status: 200 })
    try {
      await p.fetchSinParon('/sin-fin', {}, { esperaMs: 30000, maximoMs: 100000 })
      res.tope = 'sin abortar'
    } catch {
      res.tope = 'abortado'
    }
  }

  // 2. Sin lotes (servidor que no los sirve), una a una: el relieve se pide en WebP y se guarda con su dirección .png.
  {
    const e = crearEntorno()
    const mapa = e.cargar('src/player/offline/mapTileCache.ts')
    const pedidasRelieve = []
    e.servidor = (url) => {
      if (url.pathname.startsWith('/api/teselas/lote')) return new Response('no', { status: 404 })
      if (url.pathname.startsWith('/dem-tiles/')) {
        pedidasRelieve.push(url.search)
        const webp = url.searchParams.get('f') === 'webp'
        return new Response(PNG, { status: 200, headers: { 'content-type': webp ? 'image/webp' : 'image/png' } })
      }
      if (url.pathname.startsWith('/map-tiles/'))
        return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
      return null
    }
    const resumen = await mapa.prefetchMissionMapTiles([{ id: 1, lat: 42.5, lon: -8.7 }], undefined, { redDeCaminos: false })
    const guardadas = []
    for (const nombre of await e.caches.keys()) guardadas.push(...e.caches.contenido(nombre))
    const relieve = guardadas.filter((k) => k.includes('/dem-tiles/'))
    res.unaAUna = {
      faltan: resumen.faltan,
      pedidas: pedidasRelieve.length,
      todasEnWebp: pedidasRelieve.length > 0 && pedidasRelieve.every((q) => /[?&]f=webp\b/.test(q)),
      guardadasRelieve: relieve.length,
      ningunaConF: relieve.every((k) => !k.includes('f=webp')),
      tipoGuardado: relieve.length
        ? (await (await e.caches.open([...(await e.caches.keys())].find((n) => e.caches.contenido(n).includes(relieve[0])))).match(relieve[0])).headers.get('content-type')
        : null,
    }
  }

  // 2b. Un lote que se para a medias: lo que llegó entero se queda y se piden sólo las demás (no el lote entero).
  {
    const e = crearEntorno()
    const { ServidorFalso } = require('./servidor_falso.cjs')
    const srv = new ServidorFalso()
    const mapa = e.cargar('src/player/offline/mapTileCache.ts')
    const pedidos = []
    let parados = 0
    e.servidor = async (url, init) => {
      if (url.pathname.startsWith('/api/teselas/lote/')) {
        const lista = String(url.searchParams.get('t') || '').split(',').filter(Boolean)
        pedidos.push(lista)
        const entero = new Uint8Array(await srv.lote(lista).arrayBuffer())
        if (parados > 0) return new Response(entero, { status: 200 })
        parados += 1
        // Manda algo más de la mitad del cuerpo y se calla (el parón lo corta).
        const mitad = entero.subarray(0, Math.floor(entero.length * 0.6))
        return new Response(
          new ReadableStream({
            start(control) {
              control.enqueue(mitad)
              init.signal.addEventListener('abort', () => control.error(new Error('AbortError')))
            },
          }),
          { status: 200 }
        )
      }
      return srv.manejar(url, init)
    }
    const resumen = await mapa.prefetchMissionMapTiles([{ id: 1, lat: 42.5, lon: -8.7 }], undefined, { redDeCaminos: false })
    const primero = pedidos[0]
    const otraVez = pedidos.slice(1).find((l) => l.some((r) => primero.includes(r))) || []
    res.aMedias = {
      faltan: resumen.faltan,
      primero: primero.length,
      repedidas: otraVez.length,
      ningunaEnteraRepetida: otraVez.length > 0 && otraVez.length < primero.length && otraVez.every((r) => primero.includes(r)),
    }
  }

  // 3. La barra: una carga entera con fases de mentira (app y mapa a la vez; el mapa con teselas, caminos y casas).
  {
    const e = crearEntorno()
    const motor = e.cargar('src/player/offline/motorDeCarga.ts')
    const mapa = e.cargar('src/player/offline/mapTileCache.ts')
    const app = {
      id: 'app',
      comprobar: async () => ({ pendiente: true, motivo: 'primera_vez', detalle: '', hecho: 2, total: 40 }),
      async descargar(avanzar) {
        for (let i = 2; i <= 40; i += 2) {
          avanzar({ hecho: i, total: 40, detalle: `${i} de 40` })
          await pausa(2)
        }
        // Las caras del grupo: el total crece (antes, la barra de la app volvía atrás).
        avanzar({ hecho: 40, total: 46, detalle: 'caras' })
        await pausa(2)
        return { ok: true }
      },
    }
    const mision = {
      id: 'mision',
      comprobar: async () => ({ pendiente: true, motivo: 'primera_vez', detalle: '' }),
      async descargar(avanzar) {
        for (let i = 0; i <= 4; i += 1) {
          avanzar({ hecho: i, total: 4, detalle: 'misión' })
          await pausa(2)
        }
        return { ok: true }
      },
    }
    const mapaFalso = {
      id: 'mapa',
      comprobar: async () => ({ pendiente: true, motivo: 'primera_vez', detalle: '' }),
      async descargar(avanzar) {
        const avance = mapa.crearAvanceDelMapa()
        const fase = async (p) => {
          avanzar(avance(p))
          await pausa(2)
        }
        await fase({ label: 'Abriendo el mapa guardado', done: 0, total: 100 })
        await fase({ label: 'Comprobando el mapa guardado', done: 1500, total: 3000 })
        await fase({ label: 'Comprobando el mapa guardado', done: 3000, total: 3000 })
        for (let i = 0; i <= 2000; i += 100) await fase({ label: 'Mapa offline', done: i, total: 2000, bytes: i * 20000 })
        for (let mb = 0; mb <= 21; mb += 3) await fase({ label: 'Red de caminos', done: 0, total: 0, bytes: mb * 1048576 })
        await fase({ label: 'Edificios', done: 0, total: 0 })
        await fase({ label: 'Mapa listo', done: 3000, total: 3000 })
        return { ok: true }
      },
    }
    // Lo que enseñaría la barra en cada aviso (la pantalla de entrada y luego la de seguir con el mapa a medias), y el
    // final con el mapa ya pintado.
    const vistas = []
    const fasesConLosDos = []
    const partes = [app, mision, mapaFalso]
    const barra = (estado, mapaHecho) => ({
      v: motor.porcentajeDeLaBarra(estado, { entrada: true, mapaHecho }),
      todo: motor.todoListo(estado),
    })
    const inicial = await motor.comprobarPartes(partes)
    vistas.push(barra(inicial, false))
    const final = await motor.descargarPartes(partes, inicial, {
      alCambiar: (estado) => {
        vistas.push(barra(estado, false))
        if (estado.app.estado === 'descargando' && estado.mapa.estado === 'descargando')
          fasesConLosDos.push(motor.faseDeCarga(estado))
      },
    })
    const terminado = motor.darPorTerminada(final)
    vistas.push(barra(terminado, false)) // preparando el mapa
    vistas.push(barra(terminado, true)) // mapa pintado
    const v = vistas.map((x) => x.v)
    let monotona = true
    for (let i = 1; i < v.length; i += 1) if (v[i] < v[i - 1]) monotona = false
    // Y la parte de la app sola (las caras hacían crecer el total y la parte volvía atrás).
    const soloApp = await motor.comprobarPartes([app])
    const pctsApp = []
    await motor.descargarPartes([app], { ...soloApp, mision: { ...soloApp.mision, estado: 'al_dia' }, mapa: { ...soloApp.mapa, estado: 'al_dia' } }, {
      alCambiar: (estado) => pctsApp.push(motor.porcentajeDeParte(estado.app)),
    })
    let appMonotona = true
    for (let i = 1; i < pctsApp.length; i += 1) if (pctsApp[i] < pctsApp[i - 1]) appMonotona = false
    res.barra = {
      monotona,
      appMonotona,
      primero: v[0],
      ultimo: v[v.length - 1],
      // El 100 sólo al final: con todo bajado y el mapa pintado.
      cienes: v.filter((x) => x === 100).length,
      maximoSinMapaPintado: Math.max(...v.slice(0, -1)),
      fasesConLosDos: [...new Set(fasesConLosDos)],
      avisos: v.length,
    }

    // 4. La pantalla de verdad (sin `continuar`): todo bajado = 97, no 100; en «Prepararse», 100.
    e.conReact = true
    delete e.sandbox.document
    const React = require(require.resolve('react', { paths: [FRONT] }))
    const { renderToStaticMarkup } = require(require.resolve('react-dom/server', { paths: [FRONT] }))
    const pantalla = e.cargar('src/player/components/PantallaDeCarga.tsx')
    const valor = (props) => {
      const html = renderToStaticMarkup(React.createElement(pantalla.PantallaDeCarga, props))
      const m = html.match(/aria-valuenow="(\d+)"/)
      return m ? Number(m[1]) : null
    }
    res.pantalla = {
      descargado: valor({ partes: terminado, modo: 'entrada' }),
      preparacion: valor({ partes: terminado, modo: 'preparacion' }),
    }
  }

  console.log(JSON.stringify(res))
})().catch((error) => {
  console.error(error)
  process.exit(1)
})

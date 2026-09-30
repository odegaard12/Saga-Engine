// El servidor de SAGA, de mentira, para las pruebas de la carga offline.
//
// Contesta lo justo de lo que pide el móvil del jugador: la partida ligera y la
// entera, la configuración, la lista de paquetes de la app, las teselas (sueltas
// y en lote), la red de caminos y las fotos. Cada cosa se puede romper o cambiar
// desde la prueba: la revisión de la misión, un nodo movido, un paquete nuevo,
// teselas que fallan.
'use strict'

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68])

function json(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  })
}

function texto(cuerpo, tipo, estado = 200) {
  return new Response(cuerpo, { status: estado, headers: { 'content-type': tipo } })
}

function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}

class ServidorFalso {
  constructor() {
    this.revision = 'R1'
    this.conRevision = true
    this.nodos = [
      { id: 1, lat: 42.5, lon: -8.7 },
      { id: 2, lat: 42.512, lon: -8.712 },
    ]
    this.nivel = 0
    this.archivos = ['/assets/index-aaa.js', '/assets/MapSurfaceGL-bbb.js', '/assets/index-ccc.css']
    this.assetsMalos = new Set() // devuelven la página de salida (HTML) con 200
    this.versionDeLaApp = '1.0.0'
    this.horaMs = 1_800_000_000_000
    this.configCae = false
    this.lanzaPartida = false // /api/game da error de red
    this.resetAt = 0
    this.items = []
    this.grafo = true
    this.fotosDeCampo = [{ id: 'p1', image_url: '/api/field-proofs/p1/image', thumbnail_url: '/api/field-proofs/p1/thumb' }]
    // Teselas
    this.teselaMala = () => false // devuelve 502
    this.teselaAusente = () => false // devuelve 404
    this.loteSinDatos = () => false // el lote la devuelve vacía
    this.loteRoto = false // el lote contesta 500
    // Sincronización de la cola: 'acepta' | 'cae' | función (evento) => respuesta
    this.sincronizacion = 'acepta'
    this.cuerposDeSync = []
    this.usuarioDeLaSesion = null
  }

  nodoLigero(n) {
    return { id: n.id, title: 'Nodo ' + n.id, lat: n.lat, lon: n.lon, radius: 25, kind: 'minijuego' }
  }

  nodoPesado(n, indice) {
    return {
      ...this.nodoLigero(n),
      content: 'Contenido ' + n.id,
      type: 'minigame',
      config: {},
      minigame: {
        type: 'signal_hunt',
        config: indice === 1 ? { image_url: '/media/nodo/foto-' + n.id + '.webp' } : {},
      },
      entry: { mode: 'gps' },
      success: { conditions: [{ kind: 'minigame_ok', value: 'OK' }] },
      requirements: { items: [] },
      messages: {},
    }
  }

  partida(pesada, usuario = 'TEST') {
    const stages = this.nodos.map((n, i) => (pesada ? this.nodoPesado(n, i) : this.nodoLigero(n)))
    const cuerpo = {
      user: usuario,
      display_name: usuario,
      level: this.nivel,
      finished: false,
      stages,
      stages_rev: 'H-' + this.revision,
      offline_pack: pesada,
      current_stage: stages[this.nivel] || null,
      inventory_snapshot: {
        user: usuario,
        items: this.items,
        ...(this.resetAt ? { reset_at: this.resetAt } : null),
      },
      live_status: { total_time_ms: 0 },
    }
    if (this.conRevision) cuerpo.mission_revision = this.revision
    return cuerpo
  }

  configuracion() {
    const cuerpo = {
      site_name: 'SAGA',
      story_text: 'Una ruta a pie con pruebas.',
      player_theme: 'flame-red',
      mission_launch_at: '',
      server_time_ms: this.horaMs,
      players: ['TEST', 'OTRO'],
      player_profiles: [
        { id: 'TEST', display_name: 'Test', mode: 'solo' },
        { id: 'OTRO', display_name: 'Otro', mode: 'solo' },
      ],
    }
    if (this.conRevision) cuerpo.mission_revision = this.revision
    return cuerpo
  }

  lote(rutas) {
    const partes = [Buffer.from('SAGT'), u32(rutas.length)]
    for (const ruta of rutas) {
      const vacia = this.loteSinDatos(ruta)
      const rutaB = Buffer.from(ruta)
      const tipoB = Buffer.from(vacia ? '' : 'image/png')
      const datos = vacia ? Buffer.alloc(0) : PNG
      partes.push(u16(rutaB.length), rutaB, u16(tipoB.length), tipoB, u32(datos.length), datos)
    }
    return new Response(Buffer.concat(partes), {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })
  }

  async manejar(url, init) {
    const ruta = url.pathname
    const metodo = ((init && init.method) || 'GET').toUpperCase()

    let coincide = /^\/api\/game\/([^/]+)$/.exec(ruta)
    if (coincide) {
      if (this.lanzaPartida) return null
      this.usuarioDeLaSesion = decodeURIComponent(coincide[1])
      return json(this.partida(url.searchParams.get('offline_pack') === 'true', this.usuarioDeLaSesion))
    }

    if (ruta === '/api/config') {
      if (this.configCae) return null
      return json(this.configuracion())
    }

    if (ruta === '/api/version') return json({ status: 'ok', version: this.versionDeLaApp })

    if (ruta === '/player-precache.json') {
      return json({ revision: 'x', files: this.archivos })
    }

    if (ruta === '/' || ruta.startsWith('/player/')) {
      const scripts = this.archivos
        .map((f) => (f.endsWith('.css') ? `<link rel="stylesheet" href="${f}">` : `<script type="module" src="${f}"></script>`))
        .join('')
      return texto(`<!doctype html><html><head>${scripts}</head><body></body></html>`, 'text/html; charset=utf-8')
    }
    if (ruta === '/manifest.webmanifest') return json({ name: 'SAGA' })
    if (ruta === '/sw.js') return texto('// sw', 'application/javascript')

    if (ruta.startsWith('/assets/')) {
      if (this.assetsMalos.has(ruta)) return texto('<!doctype html><html></html>', 'text/html')
      if (ruta.endsWith('.css')) return texto('body{}', 'text/css')
      return texto('export default 1', 'application/javascript')
    }

    if (ruta.startsWith('/map-tiles/') || ruta.startsWith('/dem-tiles/')) {
      if (this.teselaAusente(ruta)) return texto('no', 'text/plain', 404)
      if (this.teselaMala(ruta)) return texto('bad gateway', 'text/plain', 502)
      return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
    }

    if (ruta === '/api/teselas/lote' && metodo === 'POST') {
      if (this.loteRoto) return texto('error', 'text/plain', 500)
      const cuerpo = JSON.parse(String(init.body))
      return this.lote(cuerpo.teselas)
    }

    if (ruta === '/api/road-graph') {
      if (!this.grafo) return texto('no', 'text/plain', 404)
      return json({ nodes: [], edges: [] })
    }

    if (ruta === '/api/field-proofs') {
      return json({ status: 'ok', proofs: this.fotosDeCampo })
    }
    if (ruta.startsWith('/api/field-proofs/') || ruta.startsWith('/api/player-avatar/')) {
      return new Response(PNG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }
    if (ruta.startsWith('/media/nodo/')) {
      return new Response(PNG, { status: 200, headers: { 'content-type': 'image/webp' } })
    }

    if (ruta === '/api/events/sync' && metodo === 'POST') {
      const cuerpo = JSON.parse(String(init.body))
      this.cuerposDeSync.push(cuerpo)
      if (this.sincronizacion === 'cae') return null
      const respuestas = (cuerpo.events || []).map((evento) => {
        if (typeof this.sincronizacion === 'function') {
          return { client_event_id: evento.client_event_id, ...this.sincronizacion(evento) }
        }
        return { client_event_id: evento.client_event_id, status: 'synced' }
      })
      return json({ status: 'ok', events: respuestas })
    }

    return texto('no existe ' + ruta, 'text/plain', 404)
  }
}

module.exports = { ServidorFalso, PNG, json, texto }

// Un "navegador" de mentira para ejecutar los módulos TS del jugador tal cual.
//
// No hay runner de JS en el repo (ni jsdom, ni vitest, ni fake-indexeddb), así
// que las pruebas de comportamiento de la carga offline se hacen así: los
// módulos de frontend/src se transpilan al vuelo con el `typescript` de
// frontend/node_modules y se ejecutan en un contexto de `vm` que trae lo justo
// de un navegador — localStorage, Cache Storage, IndexedDB, fetch, service
// worker — todo en memoria y controlable desde la prueba.
//
// Cada `crearEntorno()` es un mundo nuevo: nada se comparte entre escenarios
// (los módulos tienen estado propio, como el candado de sincronización).
'use strict'

const path = require('path')
const vm = require('vm')

const RAIZ = path.resolve(__dirname, '..', '..')
const FRONT = path.join(RAIZ, 'frontend')
const { crearCargador } = require('./cargarTs.cjs')

const ORIGEN = 'https://saga.test'

const REACT = new Set(['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/server'])

// En un navegador `new Request('/ruta')` se resuelve contra la página; en Node
// hace falta una URL absoluta.
class RequestConBase extends Request {
  constructor(entrada, init) {
    super(typeof entrada === 'string' ? new URL(entrada, ORIGEN).href : entrada, init)
  }
}

class ErrorDeDominio extends Error {
  constructor(nombre, mensaje) {
    super(mensaje || nombre)
    this.name = nombre
  }
}

/* ---------------- Storage ---------------- */

// Las claves son propiedades propias, como en un Storage de verdad: nodeClock
// hace Object.keys(localStorage).
class AlmacenFalso {
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null
  }
  setItem(k, v) {
    this[k] = String(v)
  }
  removeItem(k) {
    delete this[k]
  }
  clear() {
    for (const k of Object.keys(this)) delete this[k]
  }
  key(i) {
    return Object.keys(this)[i] ?? null
  }
  get length() {
    return Object.keys(this).length
  }
}

/* ---------------- Cache Storage ---------------- */

function claveDe(req) {
  const url = new URL(typeof req === 'string' ? req : req.url, ORIGEN)
  return url.pathname + url.search
}

class CacheFalsa {
  constructor(entorno) {
    this.entorno = entorno
    this.mapa = new Map()
  }

  async put(req, res) {
    if (this.entorno.cuota.cachePutFalla) throw new ErrorDeDominio('QuotaExceededError')
    const buf = Buffer.from(await res.arrayBuffer())
    this.mapa.set(claveDe(req), { buf, status: res.status, headers: [...res.headers.entries()] })
  }

  _buscar(req, opts) {
    const k = claveDe(req)
    if (this.mapa.has(k)) return k
    if (opts && opts.ignoreSearch) {
      const ruta = k.split('?')[0]
      for (const otra of this.mapa.keys()) if (otra.split('?')[0] === ruta) return otra
    }
    return null
  }

  async match(req, opts) {
    const k = this._buscar(req, opts)
    if (k === null) return undefined
    const e = this.mapa.get(k)
    return new Response(e.buf, { status: e.status, headers: e.headers })
  }

  async keys() {
    return [...this.mapa.keys()].map((k) => new Request(ORIGEN + k))
  }

  async delete(req, opts) {
    const k = this._buscar(req, opts)
    if (k === null) return false
    this.mapa.delete(k)
    return true
  }

  async add(req) {
    const r = await this.entorno.sandbox.fetch(req)
    if (!r.ok) throw new TypeError('add falló')
    await this.put(req, r)
  }
}

class CachesFalso {
  constructor(entorno) {
    this.entorno = entorno
    this.cachés = new Map()
    this.borrados = []
  }
  async open(nombre) {
    if (!this.cachés.has(nombre)) this.cachés.set(nombre, new CacheFalsa(this.entorno))
    return this.cachés.get(nombre)
  }
  async keys() {
    return [...this.cachés.keys()]
  }
  async delete(nombre) {
    this.borrados.push(nombre)
    return this.cachés.delete(nombre)
  }
  async match(req, opts) {
    for (const c of this.cachés.values()) {
      const r = await c.match(req, opts)
      if (r) return r
    }
    return undefined
  }
  // Lo que hay guardado, para las pruebas.
  contenido(nombre) {
    return this.cachés.has(nombre) ? [...this.cachés.get(nombre).mapa.keys()] : []
  }
}

/* ---------------- IndexedDB mínima ---------------- */

function crearIndexedDB(entorno) {
  const bases = new Map()
  const tarde = (fn) => setImmediate(fn)

  function crearBd(base) {
    return {
      objectStoreNames: { contains: (n) => base.stores.has(n) },
      createObjectStore(nombre, opciones) {
        const almacen = { keyPath: (opciones && opciones.keyPath) || 'id', filas: new Map() }
        base.stores.set(nombre, almacen)
        return { createIndex() {} }
      },
      close() {},
      transaction(nombres) {
        const lista = Array.isArray(nombres) ? nombres : [nombres]
        const tx = { pendientes: 0, oncomplete: null, onerror: null, error: null }
        const cerrar = () => {
          if (tx.pendientes === 0 && tx.oncomplete) {
            const f = tx.oncomplete
            tx.oncomplete = null
            f()
          }
        }
        tx.objectStore = (nombre) => {
          if (!lista.includes(nombre) || !base.stores.has(nombre)) throw new ErrorDeDominio('NotFoundError')
          const almacen = base.stores.get(nombre)
          const lanzar = (accion) => {
            const req = { result: undefined, error: null, onsuccess: null, onerror: null }
            tx.pendientes += 1
            tarde(() => {
              try {
                req.result = accion()
                if (req.onsuccess) req.onsuccess()
              } catch (e) {
                req.error = e
                tx.error = e
                if (req.onerror) req.onerror()
                if (tx.onerror) tx.onerror()
              }
              tx.pendientes -= 1
              tarde(cerrar)
            })
            return req
          }
          return {
            get: (id) => lanzar(() => (almacen.filas.has(id) ? structuredClone(almacen.filas.get(id)) : undefined)),
            getAll: () => lanzar(() => [...almacen.filas.values()].map((f) => structuredClone(f))),
            put: (registro) =>
              lanzar(() => {
                if (entorno.cuota.idbPutFalla) throw new ErrorDeDominio('QuotaExceededError')
                almacen.filas.set(registro[almacen.keyPath], structuredClone(registro))
                return registro[almacen.keyPath]
              }),
            delete: (id) => lanzar(() => almacen.filas.delete(id)),
          }
        }
        // Una transacción sin peticiones también termina.
        tarde(cerrar)
        return tx
      },
    }
  }

  return {
    bases,
    open(nombre) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
      tarde(() => {
        let base = bases.get(nombre)
        const nueva = !base
        if (!base) {
          base = { stores: new Map() }
          bases.set(nombre, base)
        }
        req.result = crearBd(base)
        if (nueva && req.onupgradeneeded) req.onupgradeneeded()
        if (req.onsuccess) req.onsuccess()
      })
      return req
    },
    // Lo que hay en un almacén, para las pruebas.
    filas(base, almacen) {
      const b = bases.get(base)
      return b && b.stores.has(almacen) ? [...b.stores.get(almacen).filas.values()] : []
    },
  }
}

/* ---------------- El entorno ---------------- */

function crearEntorno() {
  const entorno = {
    cuota: { cachePutFalla: false, idbPutFalla: false },
    peticiones: [],
    recargas: 0,
    conReact: false,
    servidor: null, // (url, init) => Response | null (null = sin cobertura)
    sandbox: null,
    cache: new Map(),
  }

  const local = new AlmacenFalso()
  const sesion = new AlmacenFalso()
  const caches = new CachesFalso(entorno)
  const indexedDB = crearIndexedDB(entorno)

  const eventosDeDocumento = []

  const sandbox = {
    console,
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    AbortController,
    Request: RequestConBase,
    Response,
    Headers,
    Blob,
    CustomEvent,
    Buffer,
    structuredClone,
    setTimeout: (fn, ms, ...resto) => setTimeout(fn, ms > 100 ? 200 : ms, ...resto),
    clearTimeout,
    setInterval: (fn, ms, ...resto) => setInterval(fn, Math.min(ms, 30), ...resto),
    clearInterval,
    setImmediate,
    queueMicrotask,
    localStorage: local,
    sessionStorage: sesion,
    caches,
    indexedDB,
    isSecureContext: true,
    location: {
      origin: ORIGEN,
      pathname: '/player/TEST',
      search: '',
      reload() {
        entorno.recargas += 1
      },
    },
    navigator: {
      onLine: true,
      userAgent: 'prueba',
      platform: 'prueba',
      maxTouchPoints: 0,
      serviceWorker: {
        controller: null,
        ready: Promise.resolve({ active: {} }),
        register: async () => ({
          update: async () => undefined,
          addEventListener() {},
          waiting: null,
          installing: null,
        }),
        addEventListener() {},
        getRegistrations: async () => [],
      },
      storage: null,
      permissions: { query: async () => ({ state: 'prompt' }) },
    },
    document: {
      visibilityState: 'visible',
      addEventListener(tipo, fn) {
        eventosDeDocumento.push([tipo, fn])
      },
      removeEventListener() {},
      querySelectorAll: () => [],
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    matchMedia: () => ({ matches: false }),
    FileReader: class {
      readAsDataURL(blob) {
        blob.arrayBuffer().then((buf) => {
          this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(buf).toString('base64')
          if (this.onload) this.onload()
        })
      }
    },
    __SAGA_VERSION__: '1.0.0',
  }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox
  sandbox.self = sandbox

  sandbox.fetch = async (entrada, init) => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada.url, ORIGEN)
    const metodo = (init && init.method) || (typeof entrada !== 'string' && entrada.method) || 'GET'
    entorno.peticiones.push({
      ruta: url.pathname,
      busqueda: url.search,
      metodo,
      cuerpo: init && init.body,
      cache: init && init.cache,
    })
    if (init && init.signal && init.signal.aborted) throw new ErrorDeDominio('AbortError')
    if (!entorno.servidor) throw new TypeError('Failed to fetch')
    const respuesta = await entorno.servidor(url, init || {})
    if (respuesta === null || respuesta === undefined) throw new TypeError('Failed to fetch')
    return respuesta
  }

  const contexto = vm.createContext(sandbox)
  entorno.sandbox = sandbox
  entorno.local = local
  entorno.sesion = sesion
  entorno.caches = caches
  entorno.indexedDB = indexedDB
  entorno.eventosDeDocumento = eventosDeDocumento

  // Los imports que no son relativos se sustituyen por un objeto vacío, salvo
  // React cuando la prueba lo pide (`entorno.conReact`): así se pueden pintar
  // componentes a texto con react-dom/server y ver que no se rompen.
  const cargar = crearCargador(contexto, {
    externo: (spec) => (entorno.conReact && REACT.has(spec) ? require(require.resolve(spec, { paths: [FRONT] })) : {}),
  })

  // `cargar('src/player/offline/missionPack.ts')`, relativo a frontend/.
  entorno.cargar = cargar

  return entorno
}

module.exports = { crearEntorno, ORIGEN, RAIZ, FRONT, ErrorDeDominio }

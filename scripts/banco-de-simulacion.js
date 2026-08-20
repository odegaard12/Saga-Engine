/**
 * Banco de simulación de SAGA — jugar la ruta sin caminarla.
 *
 * Se pega entero en la consola del navegador con la pantalla del jugador
 * abierta. Deja un objeto `saga` con el que se puede mover al jugador por la
 * ruta, romperle la red de varias maneras y mirar qué hace la aplicación.
 *
 * POR QUÉ EXISTE. Todo esto se venía escribiendo a mano en cada sesión de
 * pruebas, y cada vez salía un poco distinto: una vez se interceptaba mal el
 * GPS, otra se medía con temporizadores que el navegador estrangula. Cuando la
 * herramienta cambia entre medición y medición, los números no se pueden
 * comparar.
 *
 *
 * EL TRUCO DEL GPS, que es lo único no evidente de aquí dentro
 * -----------------------------------------------------------
 * `debugGeolocationShim.ts` sustituye `navigator.geolocation` antes de que
 * arranque React, pero saca la posición de `/api/game/<user>?fresh=<ts>`: te
 * planta en el nodo actual, así que con `?debug=1` a secas NO hay movimiento
 * que observar.
 *
 * La diferencia que lo hace posible: **el shim pide con `fresh=` y la
 * aplicación pide sin él**. Interceptando `fetch` y reescribiendo sólo la
 * llamada con `fresh=`, el jugador se mueve y el nodo se queda quieto. Si se
 * reescriben las dos, jugador y nodo viajan juntos, la distancia no cambia
 * nunca y la prueba parece buena sin demostrar nada.
 *
 *
 * CÓMO SE MIDE AQUÍ
 * -----------------
 * Con un `MutationObserver`, no con temporizadores. Con la pestaña oculta el
 * navegador estrangula `setTimeout` hasta una vez por minuto, así que muestrear
 * «cada 200 ms» miente: se acaban midiendo los frenos del navegador en vez de
 * la aplicación.
 *
 *
 * ANTES DE USARLO CONTRA PRODUCCIÓN
 * ---------------------------------
 * - Usa el jugador de pruebas, no el de una persona real.
 * - `/api/heartbeat` planta la posición simulada en el mapa de los demás.
 *   Al terminar hay que limpiarla:
 *       docker exec -w /app saga_engine_app python -c \
 *         "import sys;sys.path.insert(0,'/app');import main;main.clear_live_position('<jugador>')"
 * - Elegir nodos que NO avancen por proximidad (`qr_collectible`) si no se
 *   quiere hacer avanzar a nadie de verdad. `saga.nodos()` dice el tipo.
 */
;(() => {
  const YA = '__saga_banco__'
  if (window[YA]) {
    console.log('[banco] ya estaba instalado. `saga.ayuda()` para ver qué hay.')
    return
  }

  const estado = {
    usuario: null,
    nodos: [],
    posicion: null, // {lat, lon} simulada, o null para dejar pasar el GPS real
    red: { modo: 'normal', minMs: 0, maxMs: 0, perdida: 0 },
    diario: [],
    reloj: null,
    ultimoTexto: '',
    peticiones: [],
  }

  const M_POR_GRADO = 111320

  // ---------------------------------------------------------------- utilidades

  const texto = () => (document.body.innerText || '').replace(/\s+/g, ' ').trim()

  const espera = (ms) => new Promise((r) => setTimeout(r, ms))

  function usuarioDeLaUrl() {
    const url = new URL(location.href)
    const q = url.searchParams.get('user')
    if (q) return q.trim()
    const m = url.pathname.match(/\/player\/([^/?#]+)/)
    return m ? decodeURIComponent(m[1]).trim() : ''
  }

  function metrosEntre(a, b) {
    const dLat = (a.lat - b.lat) * M_POR_GRADO
    const dLon = (a.lon - b.lon) * M_POR_GRADO * Math.cos((a.lat * Math.PI) / 180)
    return Math.round(Math.sqrt(dLat * dLat + dLon * dLon))
  }

  function botones() {
    return [...document.querySelectorAll('button,[role=button]')]
  }

  function pulsar(etiqueta) {
    const b = botones().find((x) => (x.innerText || '').trim() === etiqueta)
    if (!b) return false
    b.click()
    return true
  }

  // ---------------------------------------------------------- interceptar todo

  const fetchOriginal = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    // La llamada del shim de GPS. Se reconoce por `fresh=`, y NUNCA se degrada:
    // si se le corta la red al GPS no hay forma de mover al jugador.
    const esGps = /\/api\/game\//.test(url) && /[?&]fresh=/.test(url)

    if (!esGps && /\/api\//.test(url) && estado.red.modo !== 'normal') {
      const r = estado.red
      const retardo = r.maxMs ? Math.round(r.minMs + Math.random() * (r.maxMs - r.minMs)) : 0
      const sePierde = r.modo === 'cortada' || Math.random() < r.perdida
      estado.peticiones.push({
        ms: estado.reloj ? Date.now() - estado.reloj : null,
        url: url.split('?')[0],
        retardo,
        sePierde,
      })
      if (retardo) await espera(retardo)
      // Se lanza igual que falla la red de verdad: la aplicación distingue esto
      // de un error del servidor, y no es lo mismo.
      if (sePierde) throw new TypeError('Failed to fetch')
    }

    const respuesta = await fetchOriginal(input, init)

    if (esGps && estado.posicion) {
      try {
        const datos = await respuesta.clone().json()
        if (datos && datos.current_stage) {
          datos.current_stage.lat = estado.posicion.lat
          datos.current_stage.lon = estado.posicion.lon
        }
        return new Response(JSON.stringify(datos), {
          status: respuesta.status,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch {
        return respuesta
      }
    }
    return respuesta
  }

  // ------------------------------------------------------------- el observador

  new MutationObserver(() => {
    if (estado.reloj === null) return
    const t = texto()
    if (t === estado.ultimoTexto) return
    estado.diario.push({ ms: Date.now() - estado.reloj, texto: t })
    estado.ultimoTexto = t
  }).observe(document.body, { childList: true, subtree: true, characterData: true })

  // --------------------------------------------------------------------- la API

  const saga = {
    async arrancar() {
      estado.usuario = usuarioDeLaUrl()
      if (!estado.usuario) throw new Error('no estoy en la pantalla de un jugador')

      const r = await fetchOriginal(
        `/api/game/${encodeURIComponent(estado.usuario)}?offline_pack=true`,
        { credentials: 'same-origin', cache: 'no-store' }
      )
      const datos = await r.json()
      estado.nodos = (datos.stages || []).map((n, i) => ({
        indice: i,
        id: n.id,
        lat: n.lat,
        lon: n.lon,
        radio: n.radius,
        tipo: (n.config && n.config.game_id) || n.type || '?',
        // Los que avanzan SOLO por proximidad son los peligrosos: simular la
        // llegada les hace avanzar de verdad.
        avanzaSolo: ((n.config && n.config.game_id) || '') === 'simple_checkpoint',
      }))
      return {
        jugador: estado.usuario,
        nivel: datos.level,
        nodos: estado.nodos.length,
        aviso: 'usa `saga.nodos()` para ver cuáles avanzan por proximidad',
      }
    },

    nodos() {
      return estado.nodos.map((n) => ({
        '#': n.indice,
        tipo: n.tipo,
        radio: n.radio,
        'avanza al llegar': n.avanzaSolo ? 'SÍ — cuidado' : 'no (hay que jugarlo)',
      }))
    },

    /** Coloca al jugador a `metros` del nodo `indice`. */
    acercarse(indice, metros = 20) {
      const n = estado.nodos[indice]
      if (!n) throw new Error(`no hay nodo ${indice}`)
      estado.posicion = { lat: n.lat + metros / M_POR_GRADO, lon: n.lon }
      return { nodo: indice, aMetros: metros, dentroDelRadio: metros <= (n.radio || 50) }
    },

    /**
     * Camina del nodo `desde` al `hasta` en `pasos` posiciones.
     *
     * No es un teletransporte: la aplicación tiene que ver posiciones
     * intermedias para que la distancia del HUD cambie de verdad. Con `msPorPaso`
     * se le da tiempo al shim, que refresca cada 1,2 s.
     */
    async caminar(desde, hasta, pasos = 6, msPorPaso = 1500) {
      const a = estado.nodos[desde]
      const b = estado.nodos[hasta]
      if (!a || !b) throw new Error('nodos fuera de rango')
      const recorrido = []
      for (let i = 1; i <= pasos; i++) {
        const t = i / pasos
        estado.posicion = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }
        await espera(msPorPaso)
        recorrido.push({ paso: i, aMetrosDelDestino: metrosEntre(estado.posicion, b), pantalla: saga.distancia() })
      }
      return recorrido
    },

    /** La distancia que la aplicación está enseñando, si la enseña. */
    distancia() {
      const t = texto()
      const m = t.match(/·\s*([\d.,]+)\s*(M|KM)\b/i)
      return m ? `${m[1]} ${m[2].toUpperCase()}` : null
    },

    red: {
      normal() {
        estado.red = { modo: 'normal', minMs: 0, maxMs: 0, perdida: 0 }
        return 'red normal'
      },
      /** Sin cobertura: todo falla al instante, como en el monte. */
      cortar() {
        estado.red = { modo: 'cortada', minMs: 0, maxMs: 0, perdida: 1 }
        return 'sin cobertura'
      },
      /** Cobertura mala: llega, pero tarda. Es el caso que peor se vive. */
      lenta(minMs = 3000, maxMs = 10000, perdida = 0) {
        estado.red = { modo: 'lenta', minMs, maxMs, perdida }
        return `retardo ${minMs}-${maxMs} ms, pérdida ${Math.round(perdida * 100)} %`
      },
      /** Cobertura a ratos: unas pasan y otras no. */
      inestable(perdida = 0.3, minMs = 500, maxMs = 3000) {
        estado.red = { modo: 'lenta', minMs, maxMs, perdida }
        return `pérdida ${Math.round(perdida * 100)} %, retardo ${minMs}-${maxMs} ms`
      },
    },

    /** El móvil guardado en el bolsillo, sin que nadie mire la pantalla. */
    bolsillo(oculto = true) {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (oculto ? 'hidden' : 'visible'),
      })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculto })
      document.dispatchEvent(new Event('visibilitychange'))
      return oculto ? 'pantalla apagada' : 'mirando la pantalla'
    },

    /** Pone el cronómetro a cero y vacía el diario. Se llama antes de medir. */
    medir() {
      estado.diario = []
      estado.peticiones = []
      estado.ultimoTexto = texto()
      estado.reloj = Date.now()
      return 'midiendo desde ahora'
    },

    /** Los cambios de pantalla desde `medir()`, con su instante. */
    diario(recorte = 110) {
      return estado.diario.map((d) => ({
        ms: d.ms,
        pantalla: d.texto.replace(/^.*?CENTRAR/, '').slice(0, recorte),
      }))
    },

    /** ¿Apareció este texto en pantalla, y cuándo? */
    aparecio(patron) {
      const re = patron instanceof RegExp ? patron : new RegExp(patron, 'i')
      const dentro = estado.diario.filter((d) => re.test(d.texto))
      if (!dentro.length) return { visto: false }
      return { visto: true, desdeMs: dentro[0].ms, hastaMs: dentro[dentro.length - 1].ms }
    },

    /** Intenta superar el nodo actual pulsando lo que haya que pulsar. */
    async jugar() {
      const hecho = []
      for (const etiqueta of ['COMEZAR A TRAVESÍA', 'ABRIR NODO', 'ABRIR QR']) {
        if (pulsar(etiqueta)) {
          hecho.push(etiqueta)
          await espera(600)
        }
      }
      if (pulsar('REXISTRAR O PASO')) hecho.push('REXISTRAR O PASO')
      return { pulsado: hecho, pantalla: texto().slice(0, 120) }
    },

    /** Da los permisos que la aplicación pide antes de salir. */
    async permisos() {
      const dados = []
      for (const nombre of ['Ubicación', 'Cámara']) {
        const b = botones()
          .filter((x) => (x.innerText || '').trim() === 'Permitir')
          .find((x) => {
            let p = x
            for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
              if (new RegExp(nombre, 'i').test(p.innerText || '')) return true
            }
            return false
          })
        if (b) {
          b.click()
          dados.push(nombre)
          await espera(400)
        }
      }
      if (pulsar('ACTIVAR GPS')) dados.push('GPS')
      return dados
    },

    /** Lo que el móvil lleva sin subir. */
    async cola() {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('saga-engine-offline-v1')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const filas = await new Promise((res) => {
        if (!db.objectStoreNames.contains('event_queue')) return res([])
        const r = db.transaction('event_queue').objectStore('event_queue').getAll()
        r.onsuccess = () => res(r.result || [])
        r.onerror = () => res([])
      })
      db.close()
      return filas.map((f) => ({
        estado: f.status,
        tipo: f.type,
        niveles: `${(f.payload || {}).level_before} → ${(f.payload || {}).level_after}`,
        creado: f.created_at,
      }))
    },

    /** Deja el móvil como recién instalado. NO toca el servidor. */
    async borrarTodoLoLocal() {
      localStorage.clear()
      sessionStorage.clear()
      const bases = await indexedDB.databases()
      for (const b of bases) {
        await new Promise((res) => {
          const r = indexedDB.deleteDatabase(b.name)
          r.onsuccess = r.onerror = r.onblocked = () => res()
        })
      }
      return bases.map((b) => b.name)
    },

    async informe() {
      return {
        jugador: estado.usuario,
        pantalla: texto().slice(0, 140),
        distancia: saga.distancia(),
        red: estado.red,
        visibilidad: document.visibilityState,
        cambiosDePantalla: estado.diario.length,
        peticionesDegradadas: estado.peticiones.length,
        perdidas: estado.peticiones.filter((p) => p.sePierde).length,
        cola: await saga.cola(),
      }
    },

    ayuda() {
      console.log(`
banco de simulación de SAGA
---------------------------
  await saga.arrancar()              carga los nodos de la misión
  saga.nodos()                       tabla: tipo, radio, y si avanza al llegar
  await saga.permisos()              da ubicación y cámara
  saga.acercarse(nodo, metros)       te coloca a N metros de un nodo
  await saga.caminar(a, b, pasos)    movimiento gradual entre dos nodos
  await saga.jugar()                 pulsa lo que haga falta para superarlo

  saga.red.normal() / .cortar()
  saga.red.lenta(3000, 10000)        cobertura mala: llega pero tarda
  saga.red.inestable(0.3)            unas pasan y otras no
  saga.bolsillo(true|false)          apaga o enciende la pantalla

  saga.medir()                       pone el cronómetro a cero
  saga.diario()                      cambios de pantalla con su instante
  saga.aparecio(/texto/)             ¿salió eso, y cuándo?
  await saga.cola()                  lo que lleva sin subir
  await saga.informe()               resumen de todo

  await saga.borrarTodoLoLocal()     móvil recién instalado (no toca servidor)
`)
      return 'ver consola'
    },
  }

  window.saga = saga
  window[YA] = true
  console.log('[banco] listo. `await saga.arrancar()` y luego `saga.ayuda()`.')
})()

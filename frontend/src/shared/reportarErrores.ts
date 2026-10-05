/**
 * Errores del móvil al servidor, para analizar la partida después.
 *
 * Qué se manda: errores de JavaScript sin capturar, promesas rechazadas sin
 * manejar, los que recoge el ErrorBoundary y los fallos de red RELEVANTES
 * (peticiones a `/api/` que dan 5xx o que no llegan teniendo red). Con su
 * versión de la app; el servidor resume el dispositivo («iOS 17 · Safari»).
 *
 * Qué NO se manda: ni las consultas de las URL (`?token=…`), ni cuerpos de
 * petición, ni nada del almacenamiento local. Repetidos se agrupan
 * (`repeticiones`), hay tope por sesión y el servidor pone además su límite de
 * ritmo. Sin cobertura se queda en memoria y sale con el siguiente envío (si no
 * cabe, se pierde: es diagnóstico, no partida).
 */

export type TipoDeError = 'js' | 'promesa' | 'red' | 'recurso' | 'sincronizacion' | 'otro'

export type ErrorDelMovil = {
  tipo: TipoDeError
  mensaje: string
  ruta?: string
  pila?: string
  recurso?: string
  estado_http?: number
  metodo?: string
  en_linea?: boolean
  repeticiones?: number
  cuando?: string
  app_version?: string
}

const DESTINO = '/api/client-errors'
const MAX_EN_COLA = 40
const MAX_POR_SESION = 150
const INTERVALO_MS = 15_000
const MAX_MENSAJE = 300
const MAX_PILA = 1_200

let cola: ErrorDelMovil[] = []
let enviadosEnSesion = 0
let temporizador: number | null = null
let instalado = false
let obtenerUsuario: () => string = () => ''

function version(): string {
  try {
    return typeof __SAGA_VERSION__ === 'string' ? __SAGA_VERSION__ : ''
  } catch {
    return ''
  }
}

/** Sólo la ruta: sin dominio, sin `?consulta` ni `#ancla`. */
export function rutaSinConsulta(url: string | undefined | null): string {
  const texto = String(url || '')
  if (!texto) return ''
  try {
    return new URL(texto, 'http://x.invalid').pathname.slice(0, 200)
  } catch {
    return texto.split(/[?#]/)[0].slice(0, 200)
  }
}

function recortar(texto: unknown, largo: number): string {
  return String(texto ?? '')
    .replace(/https?:\/\/[^\s'"<>]+/g, (url) => rutaSinConsulta(url) || '[url]')
    .slice(0, largo)
}

/** El usuario de la URL del jugador (`/player/NOMBRE` o `?user=`); '' en el panel. */
export function usuarioDeLaUrl(ubicacion: { pathname: string; search: string }): string {
  const ruta = /^\/player\/([^/]+)/.exec(ubicacion.pathname || '')
  if (ruta) {
    try {
      return decodeURIComponent(ruta[1])
    } catch {
      return ruta[1]
    }
  }
  try {
    return new URLSearchParams(ubicacion.search || '').get('user') || ''
  } catch {
    return ''
  }
}

/** Mete un error en la cola (agrupando repetidos). */
export function reportarError(error: ErrorDelMovil): void {
  if (enviadosEnSesion + cola.length >= MAX_POR_SESION) return
  const limpio: ErrorDelMovil = {
    ...error,
    mensaje: recortar(error.mensaje, MAX_MENSAJE),
    pila: error.pila ? recortar(error.pila, MAX_PILA) : undefined,
    ruta: rutaSinConsulta(
      error.ruta ?? (typeof window !== 'undefined' ? window.location.pathname : '')
    ),
    recurso: error.recurso ? rutaSinConsulta(error.recurso) : undefined,
    en_linea: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
    cuando: new Date().toISOString(),
  }
  const igual = cola.find(
    (otro) =>
      otro.tipo === limpio.tipo &&
      otro.mensaje === limpio.mensaje &&
      otro.recurso === limpio.recurso
  )
  if (igual) {
    igual.repeticiones = (igual.repeticiones || 1) + 1
    return
  }
  if (cola.length >= MAX_EN_COLA) return
  cola.push(limpio)
  programar()
}

function programar() {
  if (temporizador !== null || typeof window === 'undefined') return
  temporizador = window.setTimeout(() => {
    temporizador = null
    void enviar()
  }, INTERVALO_MS)
}

async function enviar(alSalir = false): Promise<void> {
  if (!cola.length) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    programar()
    return
  }
  const lote = cola.slice(0, 20)
  const cuerpo = JSON.stringify({
    user: obtenerUsuario() || undefined,
    app_version: version(),
    errores: lote,
  })
  try {
    if (alSalir && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(DESTINO, new Blob([cuerpo], { type: 'application/json' }))
      if (!ok) return
    } else {
      const respuesta = await fetchOriginal(DESTINO, {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo,
      })
      if (!respuesta.ok && respuesta.status >= 500) {
        programar()
        return
      }
    }
    cola = cola.slice(lote.length)
    enviadosEnSesion += lote.length
    if (cola.length) programar()
  } catch {
    programar()
  }
}

let fetchOriginal: typeof fetch = (...args) => fetch(...args)

/** ¿Merece la pena contar este fallo de red? Sólo `/api/` propio y no el propio envío. */
export function esPeticionVigilada(url: string): boolean {
  const ruta = rutaSinConsulta(url)
  return ruta.startsWith('/api/') && ruta !== DESTINO && !ruta.startsWith('/api/version')
}

function vigilarFetch() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  const original = window.fetch.bind(window)
  fetchOriginal = original
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    const metodo = (
      init?.method || (entrada instanceof Request ? entrada.method : 'GET')
    ).toUpperCase()
    try {
      const respuesta = await original(entrada, init)
      if (respuesta.status >= 500 && esPeticionVigilada(url)) {
        reportarError({
          tipo: 'red',
          mensaje: `HTTP ${respuesta.status}`,
          recurso: url,
          estado_http: respuesta.status,
          metodo,
        })
      }
      return respuesta
    } catch (error) {
      // Sin red es lo normal en el monte: sólo cuenta si el móvil dice que la tiene.
      const abortada = error instanceof DOMException && error.name === 'AbortError'
      if (
        !abortada &&
        esPeticionVigilada(url) &&
        (typeof navigator === 'undefined' || navigator.onLine)
      ) {
        reportarError({
          tipo: 'red',
          mensaje: error instanceof Error ? `${error.name}: ${error.message}` : 'fallo de red',
          recurso: url,
          estado_http: 0,
          metodo,
        })
      }
      throw error
    }
  }
}

/** Instala los vigilantes una vez (llamadas repetidas no hacen nada). */
export function instalarReporteDeErrores(opciones: { usuario?: () => string } = {}): void {
  if (instalado || typeof window === 'undefined') return
  instalado = true
  obtenerUsuario = opciones.usuario || (() => usuarioDeLaUrl(window.location))

  window.addEventListener(
    'error',
    (evento) => {
      const objetivo = evento.target as (HTMLElement & { src?: string; href?: string }) | null
      if (objetivo && objetivo !== (window as unknown) && (objetivo.src || objetivo.href)) {
        // Un trozo de la app (<script>/<link>) que no carga: «Failed to fetch dynamically
        // imported module». Las imágenes (teselas del mapa) no: serían cientos y sin red es normal.
        if (navigator.onLine && (objetivo.tagName === 'SCRIPT' || objetivo.tagName === 'LINK')) {
          reportarError({
            tipo: 'recurso',
            mensaje: `No carga ${objetivo.tagName}`,
            recurso: objetivo.src || objetivo.href,
          })
        }
        return
      }
      const error = (evento as ErrorEvent).error
      reportarError({
        tipo: 'js',
        mensaje:
          (evento as ErrorEvent).message || (error instanceof Error ? error.message : 'error'),
        pila: error instanceof Error ? error.stack : undefined,
      })
    },
    true
  )
  window.addEventListener('unhandledrejection', (evento) => {
    const motivo = evento.reason
    reportarError({
      tipo: 'promesa',
      mensaje:
        motivo instanceof Error
          ? `${motivo.name}: ${motivo.message}`
          : recortar(motivo, MAX_MENSAJE),
      pila: motivo instanceof Error ? motivo.stack : undefined,
    })
  })
  vigilarFetch()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void enviar(true)
  })

  // Una vez por sesión: con qué versión juega este jugador (sin errores).
  try {
    const usuario = obtenerUsuario()
    if (usuario && !window.sessionStorage.getItem('saga_info_enviada')) {
      window.sessionStorage.setItem('saga_info_enviada', '1')
      window.setTimeout(() => {
        void fetchOriginal(DESTINO, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: usuario, app_version: version(), errores: [] }),
        }).catch(() => undefined)
      }, 8_000)
    }
  } catch {
    // modo privado sin sessionStorage: no pasa nada
  }
}

/** Sólo para pruebas. */
export function _colaParaPruebas(): ErrorDelMovil[] {
  return cola
}

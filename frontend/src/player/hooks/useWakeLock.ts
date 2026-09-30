import { useEffect } from 'react'

/**
 * Que la pantalla no se apague sola mientras se juega.
 *
 * Sin esto el móvil se autobloqueaba a los 30 s sin tocarlo: el laberinto de
 * inclinación (se juega moviendo el móvil, no tocándolo) se quedaba a oscuras a
 * media partida, y la página oculta se leía como «se ha ido a mirar otra app».
 *
 * `navigator.wakeLock.request('screen')` tiene tres particularidades, y las tres
 * están tratadas aquí:
 *
 *  - **El navegador lo suelta solo al ocultarse la página** y hay que volver a
 *    pedirlo al volver (`visibilitychange`).
 *  - **Puede rechazar la petición** (sin gesto del usuario en algunos iOS, ahorro
 *    de batería): se reintenta en el siguiente toque, sin insistir más de una vez
 *    cada pocos segundos.
 *  - **Puede no existir** (iOS < 16.4, navegadores de escritorio viejos): no pasa
 *    nada, el juego sigue igual.
 *
 * Es un gestor con cuenta: el mapa y la hoja del reto piden a la vez, y la
 * pantalla sólo se suelta cuando ninguno lo necesita. No se usa como prueba de
 * nada en el anti-trampas: ver `salidasDeLaApp.ts`.
 *
 * Sin React ni DOM al cargarse (todo entra por `EntornoWakeLock`) para poder
 * ejecutarlo en Node con un navegador de mentira: `tests/js/logica_jugador.cjs`.
 */

type Sentinel = {
  release: () => Promise<void>
  addEventListener: (tipo: 'release', oyente: () => void) => void
}

// Con la sintaxis de método (no de propiedad) para que `document` y `window`, con
// sus sobrecargas, encajen: los métodos se comparan de forma bivariante.
type ObjetivoDeEventos = {
  addEventListener(tipo: string, oyente: () => void, opciones?: unknown): void
  removeEventListener(tipo: string, oyente: () => void, opciones?: unknown): void
}

export type EntornoWakeLock = {
  wakeLock?: { request: (tipo: 'screen') => Promise<Sentinel> }
  documento: ObjetivoDeEventos & { visibilityState: string }
  ventana: ObjetivoDeEventos
  ahora: () => number
}

export type GestorDeWakeLock = {
  /** El navegador sabe de Wake Lock. */
  soportado: () => boolean
  /** Pide que la pantalla siga encendida. Devuelve la función que lo suelta. */
  pedir: () => () => void
  estado: () => { soportado: boolean; usos: number; retenido: boolean; pidiendo: boolean }
}

/** No se reintenta una petición rechazada antes de esto, salvo al volver a la app. */
export const REINTENTO_MINIMO_MS = 3_000

const EVENTOS_DE_TOQUE = ['pointerdown', 'touchend', 'click'] as const

export function crearGestorDeWakeLock(entorno: EntornoWakeLock): GestorDeWakeLock {
  let usos = 0
  let sentinel: Sentinel | null = null
  let pidiendo = false
  let ultimoIntento = -Infinity
  let escuchando = false

  const soportado = () => Boolean(entorno.wakeLock && typeof entorno.wakeLock.request === 'function')

  function adquirir(forzar: boolean) {
    if (usos <= 0 || !soportado() || sentinel || pidiendo) return
    // Con la página oculta el navegador la rechaza: se espera a `visibilitychange`.
    if (entorno.documento.visibilityState !== 'visible') return

    const ahora = entorno.ahora()
    if (!forzar && ahora - ultimoIntento < REINTENTO_MINIMO_MS) return
    ultimoIntento = ahora

    let peticion: Promise<Sentinel>
    try {
      peticion = entorno.wakeLock!.request('screen')
    } catch {
      return
    }

    pidiendo = true
    peticion
      .then((nuevo) => {
        pidiendo = false
        // Nadie lo quiere ya: se suelta en cuanto llega.
        if (usos <= 0) {
          void nuevo.release().catch(() => undefined)
          return
        }
        sentinel = nuevo
        nuevo.addEventListener('release', () => {
          // Lo soltó el sistema (página oculta, ahorro de batería). Se vuelve a
          // pedir al volver a la app o en el siguiente toque, no aquí: si el
          // sistema lo sigue soltando, esto sería un bucle.
          if (sentinel === nuevo) sentinel = null
        })
      })
      .catch(() => {
        // Rechazada (sin gesto, ahorro de batería): no es un error del juego.
        pidiendo = false
      })
  }

  const alCambiarVisibilidad = () => {
    if (entorno.documento.visibilityState === 'visible') adquirir(true)
  }
  const alToque = () => adquirir(false)

  function escuchar() {
    if (escuchando) return
    escuchando = true
    entorno.documento.addEventListener('visibilitychange', alCambiarVisibilidad)
    for (const tipo of EVENTOS_DE_TOQUE) {
      entorno.ventana.addEventListener(tipo, alToque, { capture: true, passive: true })
    }
  }

  function dejarDeEscuchar() {
    if (!escuchando) return
    escuchando = false
    entorno.documento.removeEventListener('visibilitychange', alCambiarVisibilidad)
    for (const tipo of EVENTOS_DE_TOQUE) {
      entorno.ventana.removeEventListener(tipo, alToque, { capture: true })
    }
  }

  function soltar() {
    const actual = sentinel
    sentinel = null
    if (actual) void actual.release().catch(() => undefined)
  }

  return {
    soportado,

    pedir() {
      usos += 1
      if (usos === 1) escuchar()
      adquirir(true)

      let soltado = false
      return () => {
        if (soltado) return
        soltado = true
        usos = Math.max(0, usos - 1)
        if (usos === 0) {
          dejarDeEscuchar()
          soltar()
        }
      }
    },

    estado: () => ({ soportado: soportado(), usos, retenido: sentinel !== null, pidiendo }),
  }
}

let gestorGlobal: GestorDeWakeLock | null = null

/** El gestor de esta pestaña: uno solo, con cuenta. */
export function gestorDePantalla(): GestorDeWakeLock {
  if (!gestorGlobal) {
    gestorGlobal = crearGestorDeWakeLock({
      wakeLock: (navigator as unknown as { wakeLock?: EntornoWakeLock['wakeLock'] }).wakeLock,
      documento: document,
      ventana: window,
      ahora: Date.now,
    })
  }
  return gestorGlobal
}

/** Mantiene la pantalla encendida mientras `activo` sea cierto. */
export function useWakeLock(activo: boolean) {
  useEffect(() => {
    if (!activo || typeof window === 'undefined' || typeof document === 'undefined') return undefined
    return gestorDePantalla().pedir()
  }, [activo])
}

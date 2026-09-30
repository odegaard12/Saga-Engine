/**
 * El sonido de las notas del Simón: UN solo contexto de audio.
 *
 * Antes cada nota creaba su `AudioContext`, tocaba y lo cerraba 220 ms después.
 * Un nivel de siete notas eran siete contextos, y los navegadores del móvil
 * dejan muy pocos abiertos a la vez (Safari, unos cuatro; Chrome, seis): a
 * mitad de la secuencia dejaba de sonar sin dar ningún error, y cada uno
 * despertaba el hilo de audio del teléfono. Ahora hay uno, se crea al primer
 * toque del jugador (los navegadores sólo dejan arrancar el audio desde un
 * gesto) y se reutiliza hasta que el juego se cierra.
 *
 * Sin React ni DOM al cargarse: la fábrica del contexto entra por parámetro
 * para poder ejecutarlo en Node con un audio de mentira
 * (`tests/js/logica_jugador.cjs`).
 */

type NodoDeAudio = { connect: (destino: unknown) => unknown }

type ContextoDeAudio = {
  readonly currentTime: number
  readonly destination: unknown
  readonly state: string
  createOscillator: () => NodoDeAudio & {
    type: string
    frequency: { value: number }
    start: (cuando?: number) => void
    stop: (cuando?: number) => void
  }
  createGain: () => NodoDeAudio & {
    gain: {
      value: number
      exponentialRampToValueAtTime: (valor: number, cuando: number) => void
    }
  }
  resume: () => Promise<void>
  close: () => Promise<void>
}

export type FabricaDeContexto = () => ContextoDeAudio | null

/** El `AudioContext` del navegador, o nada si no lo hay o no se deja crear. */
export function contextoDelNavegador(): ContextoDeAudio | null {
  try {
    const Clase =
      (window as unknown as { AudioContext?: new () => ContextoDeAudio }).AudioContext ||
      (window as unknown as { webkitAudioContext?: new () => ContextoDeAudio }).webkitAudioContext
    return Clase ? new Clase() : null
  } catch {
    return null
  }
}

export type ReproductorDeTonos = {
  /** Crea el contexto si hace falta y lo despierta. Llamar desde un toque del jugador. */
  preparar: () => void
  /** Una nota sinusoidal de `ms` milisegundos. Sin audio, no hace nada. */
  tono: (frecuencia: number, ms: number) => void
  /** Suelta el contexto. Se puede volver a `preparar` después. */
  cerrar: () => void
}

export function crearReproductorDeTonos(
  fabrica: FabricaDeContexto = contextoDelNavegador
): ReproductorDeTonos {
  let contexto: ContextoDeAudio | null = null
  // Si el navegador no da contexto, no se insiste en cada nota.
  let sinAudio = false

  function obtener(): ContextoDeAudio | null {
    if (contexto) return contexto
    if (sinAudio) return null
    contexto = fabrica()
    if (!contexto) sinAudio = true
    return contexto
  }

  function despertar(ctx: ContextoDeAudio) {
    // En iOS el contexto nace «suspended» hasta que un gesto lo despierta.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  }

  return {
    preparar() {
      try {
        const ctx = obtener()
        if (ctx) despertar(ctx)
      } catch {
        // sin audio, el juego sigue siendo jugable por color
      }
    },

    tono(frecuencia, ms) {
      try {
        const ctx = obtener()
        if (!ctx) return
        despertar(ctx)

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = frecuencia
        gain.gain.value = 0.0001
        osc.connect(gain)
        gain.connect(ctx.destination)

        const ahora = ctx.currentTime
        gain.gain.exponentialRampToValueAtTime(0.22, ahora + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, ahora + ms / 1000)
        osc.start(ahora)
        osc.stop(ahora + ms / 1000 + 0.05)
      } catch {
        // sin audio, el juego sigue siendo jugable por color
      }
    },

    cerrar() {
      const ctx = contexto
      contexto = null
      sinAudio = false
      if (ctx) void ctx.close().catch(() => undefined)
    },
  }
}

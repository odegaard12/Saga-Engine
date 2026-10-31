import { conexionAhorradora } from './redEstado'

/**
 * Recargar la aplicación sin cortarle nada al jugador.
 *
 * Dos sitios recargaban a ciegas: el vigilante de versión, al ver otra versión en
 * el servidor, y el registro del service worker, al cambiar de worker. El
 * segundo era el peor: al desplegar, TODOS los móviles con la aplicación abierta
 * se recargaban a la vez, a mitad de minijuego, con el intento perdido.
 *
 * Ahora la recarga se pide y se espera al primer momento seguro: que ninguna
 * hoja, minijuego, cámara o envío esté abierto (lo dice quien pinta la
 * pantalla) y, si se pide así, que la aplicación esté en segundo plano — el
 * jugador guarda el móvil y al volver ya tiene lo nuevo—. Si ese momento no
 * llega, la versión nueva se aplica en el siguiente arranque, que es lo que
 * pasaría de todas formas.
 */

type Decisor = () => boolean

let decisor: Decisor | null = null

/** La pantalla del jugador dice cuándo NO se puede recargar. `null` la quita. */
export function registrarQuienPuedeRecargar(fn: Decisor | null): void {
  decisor = fn
}

export function puedeRecargarAhora(): boolean {
  if (malMomentoParaActualizar()) return false
  try {
    return decisor ? decisor() : true
  } catch {
    return true
  }
}

let enRuta: Decisor | null = null

/** La pantalla del jugador dice si la misión está empezada y sin terminar. `null` la quita. */
export function registrarEnRuta(fn: Decisor | null): void {
  enRuta = fn
}

let avisarRutaConocida: (() => void) | null = null
const rutaConocida = new Promise<void>((resolver) => {
  avisarRutaConocida = resolver
})

/** La pantalla del jugador ya tiene la partida cargada: `registrarEnRuta` ya contesta de verdad. */
export function marcarRutaConocida(): void {
  avisarRutaConocida?.()
}

/**
 * 30/10: espera (como mucho `ms`) a saber si la misión está empezada. El vigilante de versión miraba
 * `malMomentoParaActualizar` al arrancar, antes de que la pantalla del jugador cargase la partida: con la ruta a
 * medias contestaba «no» y bajaba la versión nueva de fondo en el monte.
 */
export function esperarRutaConocida(ms: number): Promise<void> {
  return Promise.race([rutaConocida, new Promise<void>((resolver) => setTimeout(resolver, ms))])
}

/**
 * 25/10 (auditoría): ¿mal momento para cambiar de versión? Con la misión en marcha o con conexión ahorradora no se
 * baja ni se recarga nada: la versión nueva se aplica al volver a abrir, en la pantalla de carga.
 */
export function malMomentoParaActualizar(): boolean {
  try {
    return Boolean(enRuta?.()) || conexionAhorradora()
  } catch {
    return false
  }
}

export interface OpcionesDeRecarga {
  /** Sólo recargar con la aplicación en segundo plano (`document.hidden`). */
  soloOculta?: boolean
  /** Cada cuánto volver a mirar si ya es seguro. 0 = sólo al cambiar la visibilidad. */
  cadaMs?: number
  /** Cómo recargar de verdad. Se inyecta en las pruebas. */
  recargar?: () => void
  /** Para las pruebas. */
  documento?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>
}

/**
 * Pide una recarga y espera al primer momento seguro. Devuelve cómo cancelarla.
 * Recarga como mucho UNA vez por llamada.
 */
export function recargarCuandoSeaSeguro(opciones: OpcionesDeRecarga = {}): () => void {
  const doc = opciones.documento ?? (typeof document !== 'undefined' ? document : undefined)
  const recargar = opciones.recargar ?? (() => window.location.reload())
  const cadaMs = opciones.cadaMs ?? 4000

  let hecho = false
  let temporizador: ReturnType<typeof setInterval> | null = null

  const limpiar = () => {
    if (temporizador !== null) clearInterval(temporizador)
    temporizador = null
    doc?.removeEventListener('visibilitychange', intentar)
  }

  function intentar(): boolean {
    if (hecho) return true
    if (!puedeRecargarAhora()) return false
    if (opciones.soloOculta && doc && doc.visibilityState !== 'hidden') return false

    hecho = true
    limpiar()
    recargar()
    return true
  }

  if (intentar()) return () => undefined

  doc?.addEventListener('visibilitychange', intentar)
  if (cadaMs > 0 && typeof setInterval === 'function') {
    temporizador = setInterval(intentar, cadaMs)
  }

  return () => {
    hecho = true
    limpiar()
  }
}

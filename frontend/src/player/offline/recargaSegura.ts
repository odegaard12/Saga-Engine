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
  try {
    return decisor ? decisor() : true
  } catch {
    return true
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

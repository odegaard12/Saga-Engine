import { useCallback, useEffect, useRef, useState, type TransitionEvent } from 'react'

/**
 * Un solo contrato de entrada y salida para todo lo que aparece sobre el mapa.
 *
 * Cada panel tenia su propio estado `saliendo`, su propio temporizador y su
 * propia cuenta de fotogramas. Aqui vive una vez:
 *
 *   - `montada`: si hay que dibujarlo (sigue true mientras sale).
 *   - `estado`: 'entrando' (nace fuera: un fotograma pintado sin colocar, para
 *     que haya desde donde moverse), 'abierta' o 'saliendo'.
 *   - `animando`: true mientras dura el movimiento (para `will-change`).
 *   - `alTerminar`: para `onTransitionEnd` del elemento RAIZ. Quien manda es el
 *     propio navegador diciendo que acabo; el temporizador es solo la red de
 *     seguridad, y es largo a proposito (ver la nota de SwipeableSheet: uno
 *     igual de largo que la transicion la gana siempre y desmonta a medias).
 */

export type EstadoDePresencia = 'entrando' | 'abierta' | 'saliendo'

/** Red de seguridad: mucho mas que cualquier transicion (280 ms). */
export const RESPALDO_DE_SALIDA_MS = 700

const CONSULTA = '(prefers-reduced-motion: reduce)'

/** El sistema pide menos movimiento: solo fundidos. Se actualiza si cambia. */
export function usePrefiereMenosMovimiento(): boolean {
  const [reducido, setReducido] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(CONSULTA).matches
      : false
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const lista = window.matchMedia(CONSULTA)
    const alCambiar = () => setReducido(lista.matches)
    alCambiar()
    lista.addEventListener?.('change', alCambiar)
    return () => lista.removeEventListener?.('change', alCambiar)
  }, [])
  return reducido
}

export interface Presencia {
  montada: boolean
  estado: EstadoDePresencia
  animando: boolean
  /** `onTransitionEnd` del elemento raiz. */
  alTerminar: (evento: TransitionEvent<HTMLElement>) => void
}

export function usePresencia(abierta: boolean): Presencia {
  const [montada, setMontada] = useState(abierta)
  const [estado, setEstado] = useState<EstadoDePresencia>(abierta ? 'entrando' : 'saliendo')
  const [animando, setAnimando] = useState(abierta)
  const montadaRef = useRef(montada)
  useEffect(() => {
    montadaRef.current = montada
  }, [montada])

  useEffect(() => {
    if (abierta) {
      setMontada(true)
      setAnimando(true)
      setEstado('entrando')
      // Dos fotogramas: uno para que el navegador pinte el panel fuera y otro
      // para colocarlo. En uno solo los dos estados se funden en el mismo
      // repintado y no hay nada que animar.
      let segundo = 0
      const primero = window.requestAnimationFrame(() => {
        segundo = window.requestAnimationFrame(() => setEstado('abierta'))
      })
      // Sin evento de entrada garantizado (p. ej. con movimiento reducido a
      // duracion 0) el `will-change` no se queda puesto para siempre.
      const id = window.setTimeout(() => setAnimando(false), RESPALDO_DE_SALIDA_MS)
      return () => {
        window.cancelAnimationFrame(primero)
        window.cancelAnimationFrame(segundo)
        window.clearTimeout(id)
      }
    }

    if (!montadaRef.current) return undefined
    setEstado('saliendo')
    setAnimando(true)
    const id = window.setTimeout(() => {
      setMontada(false)
      setAnimando(false)
    }, RESPALDO_DE_SALIDA_MS)
    return () => window.clearTimeout(id)
  }, [abierta])

  const alTerminar = useCallback(
    (evento: TransitionEvent<HTMLElement>) => {
      // `transitionend` burbuja: solo el de la propia raiz, y solo de opacidad
      // o transformacion (las unicas que se animan aqui).
      if (evento.target !== evento.currentTarget) return
      if (evento.propertyName !== 'opacity' && evento.propertyName !== 'transform') return
      if (estado === 'saliendo') {
        setMontada(false)
        setAnimando(false)
      } else {
        setAnimando(false)
      }
    },
    [estado]
  )

  return { montada, estado, animando, alTerminar }
}

/**
 * El ultimo valor que tuvo contenido, mientras el panel se va.
 *
 * Quien abre un panel le pasa datos (la foto, el nodo) y al cerrar los borra
 * en el mismo instante: sin esto el panel se quedaria vacio mientras se
 * desliza hacia fuera.
 */
export function useValorCongelado<T>(valor: T, vivo: boolean): T {
  const [guardado, setGuardado] = useState(valor)
  if (vivo && guardado !== valor) setGuardado(valor)
  return vivo ? valor : guardado
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type TransitionEvent,
} from 'react'

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

/** Un fotograma mas largo que esto es un paron (30 fps aun cuenta como seguido). */
const FOTOGRAMA_LENTO_MS = 40
/** Como mucho se esperan estos fotogramas (un paron largo cuenta como uno solo). */
const MAX_FOTOGRAMAS_DE_ESPERA = 8

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
      // Se coloca cuando el navegador ya pinta de seguido, no antes. Montar un
      // panel cuesta (su contenido, el barrido del HUD, el mapa que se para):
      // el banco midio 300 ms de tarea larga justo al montar y, si el
      // movimiento arranca dentro de ese parón, su primer fotograma visible
      // llega con la hoja ya al 70 % (la curva de entrada corre mucho al
      // principio). Esperar dos fotogramas CORTOS seguidos lo evita; el tope
      // de fotogramas impide esperar para siempre en un movil lento.
      let cuadro = 0
      let previo = 0
      let cortos = 0
      let vistos = 0
      const paso = (ahora: number) => {
        vistos += 1
        cortos = previo && ahora - previo < FOTOGRAMA_LENTO_MS ? cortos + 1 : 0
        previo = ahora
        if (cortos >= 2 || vistos >= MAX_FOTOGRAMAS_DE_ESPERA) setEstado('abierta')
        else cuadro = window.requestAnimationFrame(paso)
      }
      cuadro = window.requestAnimationFrame(paso)
      // Sin evento de entrada garantizado (p. ej. con movimiento reducido a
      // duracion 0) el `will-change` no se queda puesto para siempre.
      const id = window.setTimeout(() => setAnimando(false), RESPALDO_DE_SALIDA_MS * 2)
      return () => {
        window.cancelAnimationFrame(cuadro)
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
 * Las hojas: lo que sube desde abajo con el mapa velado y desenfocado detras
 * (Mochila, Herramientas, Guia, Clasificacion, la hoja del nodo y el
 * minijuego). UNA forma de entrar y salir para todas, aqui.
 *
 * La hoja y su fondo van con la MISMA duracion y la misma curva, en los dos
 * sentidos: el velo funde a la vez que la hoja se mueve. Antes el fondo
 * llevaba su propia duracion (240 contra 320) y, al cerrar, salia con la curva
 * de ENTRADA (la que corre al principio): el desenfoque se iba de golpe y la
 * hoja bajaba despues sobre el mapa nitido.
 *
 * El fondo lleva el desenfoque FIJO y solo se anima su opacidad: animar
 * `backdrop-filter` obliga a rehacer el desenfoque en cada fotograma, y
 * separarlo en dos capas no sirve (una capa con opacidad < 1 encima de la que
 * desenfoca la deja sin nada que desenfocar).
 *
 * La hoja sale de debajo de la pantalla, asi que no hace falta fundirla. Con
 * «reducir movimiento» nada se desplaza: solo fundidos, con la duracion corta
 * de los tokens (mobile-themes.css).
 */
export const RITMO_ENTRA = 'var(--saga-motion-entra) var(--saga-curva-entra)'
export const RITMO_SALE = 'var(--saga-motion-sale) var(--saga-curva-sale)'

export interface MovimientoDeHoja {
  hoja: CSSProperties
  fondo: CSSProperties
}

export function movimientoDeHoja(estado: EstadoDePresencia, reducido: boolean): MovimientoDeHoja {
  const fuera = estado !== 'abierta'
  const ritmo = estado === 'saliendo' ? RITMO_SALE : RITMO_ENTRA
  return {
    hoja: {
      transform: fuera && !reducido ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)',
      opacity: fuera && reducido ? 0 : 1,
      transition: `transform ${ritmo}, opacity ${ritmo}`,
    },
    fondo: {
      // Al nacer, casi transparente pero NO cero: con cero el navegador ni lo dibuja y el primer desenfoque de toda
      // la pantalla se calculaba en el primer fotograma del movimiento (el banco: un paron de 70-100 ms justo ahi,
      // y la hoja aparecia ya a medio camino). Asi ese coste se paga antes de moverse. 0,01 no se ve.
      opacity: estado === 'entrando' ? 0.01 : fuera ? 0 : 1,
      transition: `opacity ${ritmo}`,
    },
  }
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

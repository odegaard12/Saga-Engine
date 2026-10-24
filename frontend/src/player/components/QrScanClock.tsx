import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tempoDoQr } from '../qrClock'
import { pizarra, RADIO_PIZARRA } from './PlayerShell'
import { useTextosDePantallas } from './useTextosDePantallas'

/**
 * Dónde acaba el reloj (px desde arriba) mientras se ve. Lo leen el chip del tiempo y el aviso de cobertura para
 * ponerse DEBAJO: antes el reloj tapaba el chip (24/10). Sin reloj la variable no existe y vuelven a su sitio.
 */
export const VARIABLE_BAJO_EL_RELOJ = '--saga-reloj-qr-bajo'

interface Props {
  user: string
  /** La clave del cronómetro de este nodo (la marca PlayerApp al llegar). */
  payload: string
}

/** Por si no se encuentra la barra: un sitio razonable en vez de tapar nada. */
const ALTO_POR_DEFECTO = 96

/**
 * El reloj de los nodos de pegatina, colgando de la barra de arriba.
 *
 * Primero vivió pegado encima del botón del nodo, en la barra de abajo, y ahí
 * quedaba por debajo de la de clasificación. Luego en el centro de la pantalla,
 * que no tapaba nada pero quedaba suelto en mitad del mapa. Colgado de la barra
 * de arriba se lee como parte de ella: el total de la travesía y, justo debajo,
 * lo que llevas en este nodo.
 *
 * La barra no tiene alto fijo —cambia con el área segura de cada móvil—, así
 * que se mide en vivo y se vuelve a medir al girar la pantalla.
 *
 * Va por `createPortal` al `body`, no dentro del mapa. Es a propósito: el HUD y
 * las hojas llevan `transform` y `backdrop-filter`, y cualquiera de los dos crea
 * un contexto de apilamiento del que un `z-index`, por alto que sea, no puede
 * salir. Colgándolo del `body` no hay de qué salir.
 *
 * No intercepta toques: el mapa se sigue arrastrando por debajo.
 */
export function QrScanClock({ user, payload }: Props) {
  const [arriba, setArriba] = useState(ALTO_POR_DEFECTO)
  const [ms, setMs] = useState(() => tempoDoQr(user, payload))
  const relojRef = useRef<HTMLDivElement>(null)
  const textos = useTextosDePantallas()

  // El tictac vive aquí y no en PlayerApp (auditoría 23/10): allí cada medio segundo re-pintaba la app entera,
  // mapa incluido, sólo para cambiar estos cuatro dígitos.
  useEffect(() => {
    setMs(tempoDoQr(user, payload))
    const id = window.setInterval(() => setMs(tempoDoQr(user, payload)), 500)
    return () => window.clearInterval(id)
  }, [user, payload])

  useEffect(() => {
    function medir() {
      const barra = document.querySelector('[data-saga-player-shell="top"]')
      if (!barra) {
        setArriba(ALTO_POR_DEFECTO)
        return
      }
      // Un píxel de solape para que se vea pegado a la barra, sin costura.
      setArriba(Math.max(0, Math.round(barra.getBoundingClientRect().bottom) - 1))
    }

    medir()

    window.addEventListener('resize', medir)
    window.addEventListener('orientationchange', medir)

    // La barra crece y encoge sola —el nombre del nodo ocupa una o dos líneas—,
    // así que no basta con medir al entrar.
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    const barra = document.querySelector('[data-saga-player-shell="top"]')
    if (observador && barra) observador.observe(barra)

    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('orientationchange', medir)
      observador?.disconnect()
    }
  }, [])

  // Publica su borde de abajo; se vuelve a medir si cambia de alto (el rótulo, la letra del sistema).
  useEffect(() => {
    const reloj = relojRef.current
    if (!reloj) return
    const raiz = document.documentElement
    const publicar = () => raiz.style.setProperty(VARIABLE_BAJO_EL_RELOJ, `${arriba + reloj.offsetHeight}px`)
    publicar()
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publicar) : null
    observador?.observe(reloj)
    return () => {
      observador?.disconnect()
      raiz.style.removeProperty(VARIABLE_BAJO_EL_RELOJ)
    }
  }, [arriba])

  if (typeof document === 'undefined') return null

  const minutos = Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')
  const segundos = Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, '0')

  return createPortal(
    <div
      ref={relojRef}
      aria-live="off"
      data-saga-qr-reloj=""
      style={{
        position: 'fixed',
        top: arriba,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 6500,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 18px 10px',
        // Sin esquinas arriba y sin borde superior: así se lee como algo que
        // cuelga de la barra, no como una tarjeta suelta encima del mapa. El
        // mismo material que la barra (24/10, «pizarra unificada»).
        ...pizarra,
        borderRadius: `0 0 ${RADIO_PIZARRA}px ${RADIO_PIZARRA}px`,
        borderTop: 'none',
        color: '#ffffff',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 950,
          letterSpacing: '.13em',
          color: 'rgba(255,255,255,.78)',
          textTransform: 'uppercase',
        }}
      >
        {textos.mapa.buscaPegatina}
      </span>

      <strong
        style={{
          fontSize: 22,
          lineHeight: 1,
          fontWeight: 950,
          letterSpacing: '-.02em',
          color: '#ffffff',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {minutos}:{segundos}
      </strong>
    </div>,
    document.body
  )
}

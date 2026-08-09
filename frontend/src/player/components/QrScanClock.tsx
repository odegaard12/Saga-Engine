import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  /** Milisegundos que se lleva buscando la pegatina de este nodo. */
  ms: number
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
export function QrScanClock({ ms }: Props) {
  const [arriba, setArriba] = useState(ALTO_POR_DEFECTO)

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
    const observador =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    const barra = document.querySelector('[data-saga-player-shell="top"]')
    if (observador && barra) observador.observe(barra)

    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('orientationchange', medir)
      observador?.disconnect()
    }
  }, [])

  if (typeof document === 'undefined') return null

  const minutos = Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')
  const segundos = Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, '0')

  return createPortal(
    <div
      aria-live="off"
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
        // cuelga de la barra, no como una tarjeta suelta encima del mapa.
        borderRadius: '0 0 18px 18px',
        // Mismos colores que la barra de arriba y el degradado siguiendo donde
        // ella lo deja: el tono de abajo de la barra es el de arriba de esto,
        // asi que se lee como una sola pieza y no como algo pegado encima.
        borderLeft: '1px solid rgba(255,255,255,.22)',
        borderRight: '1px solid rgba(255,255,255,.22)',
        borderBottom: '1px solid rgba(255,255,255,.22)',
        borderTop: 'none',
        background:
          'linear-gradient(180deg, rgba(110,116,128,.64) 0%, rgba(96,103,115,.58) 100%)',
        boxShadow: '0 14px 30px rgba(15,23,42,.18)',
        backdropFilter: 'blur(20px) saturate(135%)',
        WebkitBackdropFilter: 'blur(20px) saturate(135%)',
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
        📷 Busca a pegatina
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

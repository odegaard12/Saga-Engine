import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { LatLon } from '../utils/geo'
import { formatoDistancia, giroCorto, giroDeLaFlecha, rumboEntre } from '../utils/sinMapa'
import { pizarra } from './PlayerShell'
import { useTextosDePantallas } from './useTextosDePantallas'

/**
 * 22/11 «1 · Brújula bajo el tiempo» (elegida por Óscar): un cuadradito bajo el chip del tiempo con una flecha al
 * nodo de la tarjeta y los metros que faltan. La flecha va con el MAPA, no con el móvil: rumbo al nodo menos el giro
 * del mapa, y la «N» marca dónde queda el norte en el mapa. Es DOM encima del mapa, no una capa: no repinta nada.
 * Se mueve como mucho cada `CADA_MS`, y sólo gira (con transición, sin ella si se pide reducir movimiento).
 */

const CADA_MS = 250

/**
 * El ángulo a seguir, como mucho cada `CADA_MS` y por el lado corto (sin vueltas enteras al pasar por el norte).
 * También lo usa la brújula sin mapa (`BrujulaSinMapa`).
 */
export function useGiro(objetivo: number | null): number | null {
  const [giro, setGiro] = useState(objetivo)
  const ultimo = useRef(0)
  useEffect(() => {
    if (objetivo === null) return
    const id = window.setTimeout(
      () => {
        ultimo.current = Date.now()
        setGiro((previo) => (previo === null ? objetivo : giroCorto(previo, objetivo)))
      },
      Math.max(0, ultimo.current + CADA_MS - Date.now())
    )
    return () => window.clearTimeout(id)
  }, [objetivo])
  return giro
}

export interface BrujulaMiniProps {
  /** El nodo de la tarjeta; null = no se enseña (terminada, dentro del radio, mapa mudo…). */
  destino: LatLon | null
  posicion: LatLon | null
  /** Los mismos metros que dice la tarjeta. */
  metros: number | null
  /** Giro del mapa en grados (0 = norte arriba). */
  rumboMapa: number
  mobile: boolean
}

export function BrujulaMini({ destino, posicion, metros, rumboMapa, mobile }: BrujulaMiniProps) {
  const T = useTextosDePantallas().mapa
  const { locale } = useI18n()
  const rumbo = destino && posicion ? rumboEntre(posicion, destino) : null
  const flecha = useGiro(rumbo === null ? null : Math.round(giroDeLaFlecha(rumbo, rumboMapa)))
  const norte = useGiro(-rumboMapa)
  if (rumbo === null || metros === null || flecha === null) return null
  const distancia = formatoDistancia(metros, locale)

  return (
    <div data-saga-brujula="" role="img" aria-label={T.siguienteNodo(distancia)} style={estilo(mobile)}>
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" style={{ display: 'block' }}>
        <g style={{ ...giro, transform: `rotate(${norte ?? 0}deg)` }}>
          <circle cx="15" cy="15" r="13.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.4" />
          <text x="15" y="8" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="currentColor">
            N
          </text>
        </g>
        <g data-flecha="" style={{ ...giro, color: CELESTE, transform: `rotate(${flecha}deg)` }}>
          <path d="M15 9.5 L19 21 L15 18.6 L11 21 Z" fill="currentColor" />
        </g>
      </svg>
      <b style={texto}>{distancia}</b>
    </div>
  )
}

const CELESTE = 'rgb(119, 207, 251)' // no-tema: el celeste de los iconos del chip del tiempo

const giro: CSSProperties = {
  transformBox: 'view-box',
  transformOrigin: '15px 15px',
  transition: 'transform 240ms linear',
}

function estilo(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    right: mobile ? 20 : 16,
    // Bajo el chip del tiempo (78 + 30 + 6), como el de cobertura; `--saga-brujula-ajuste` (mobile-themes.css) la sube
    // si no hay chip del tiempo y la baja si se ve el de cobertura.
    top: 'calc(max(env(safe-area-inset-top) + 114px, var(--saga-reloj-qr-bajo, 0px) + 44px) + var(--saga-brujula-ajuste, 0px))',
    zIndex: 600, // como el chip del tiempo: por debajo de la barra de arriba y de todo lo que se abre
    boxSizing: 'border-box',
    minWidth: 48,
    display: 'grid',
    justifyItems: 'center',
    gap: 3,
    padding: '6px 7px 5px',
    borderRadius: 12,
    fontFamily: 'Barlow, "Barlow Semi Condensed", system-ui, sans-serif',
    color: 'rgb(155, 181, 202)', // no-tema: el gris azulado de los textos del chip del tiempo
    background: pizarra.background,
    border: pizarra.border,
    backdropFilter: pizarra.backdropFilter,
    WebkitBackdropFilter: pizarra.WebkitBackdropFilter,
    boxShadow: '0 3px 10px rgba(0,0,0,.28)', // no-tema: la sombra del chip del tiempo
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  }
}

const texto: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 800,
  lineHeight: 1,
  color: 'rgb(245, 234, 216)', // no-tema: el crema del chip del tiempo
}

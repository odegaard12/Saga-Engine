import { useEffect, useState, type CSSProperties } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { getDistanceMeters, type LatLon } from '../utils/geo'
import { formatoDistancia, giroDeLaFlecha, puntoCardinal, rumboEntre } from '../utils/sinMapa'

/**
 * Brújula de respaldo cuando el móvil no puede pintar el mapa (sin WebGL).
 *
 * El mapa avisaba «puedes seguir jugando: usa la brújula y la lista de nodos»,
 * pero esa brújula no existía: sin WebGL el jugador se quedaba sin saber hacia
 * dónde ir (auditoría M2). Esto enseña lo mínimo para llegar al nodo: cuánto
 * falta y hacia dónde. Con el sensor de orientación la flecha gira con el
 * móvil; sin él, apunta con el norte arriba y dice el punto cardinal.
 *
 * Sin red no pide nada: la posición es la del GPS y el nodo viene en el
 * paquete de la misión.
 */

const TEXTOS = {
  es: {
    titulo: 'Sin mapa: sigue la flecha',
    hacia: 'Hacia',
    sinPosicion: 'Esperando tu posición GPS…',
    norteArriba: 'Norte arriba',
    activar: 'Usar la brújula del móvil',
    llegaste: 'Estás en la zona del nodo',
  },
  gl: {
    titulo: 'Sen mapa: segue a frecha',
    hacia: 'Cara a',
    sinPosicion: 'Agardando a túa posición GPS…',
    norteArriba: 'Norte arriba',
    activar: 'Usar o compás do móbil',
    llegaste: 'Estás na zona do nodo',
  },
  en: {
    titulo: 'No map: follow the arrow',
    hacia: 'Towards',
    sinPosicion: 'Waiting for your GPS position…',
    norteArriba: 'North up',
    activar: 'Use the phone compass',
    llegaste: 'You are in the node area',
  },
} as const

type EventoDeOrientacion = DeviceOrientationEvent & { webkitCompassHeading?: number }
type ConPermiso = { requestPermission?: () => Promise<'granted' | 'denied'> }

export interface BrujulaSinMapaProps {
  destino: (LatLon & { title?: string }) | null
  posicion: LatLon | null
  radio: number | null
}

export function BrujulaSinMapa({ destino, posicion, radio }: BrujulaSinMapaProps) {
  const { locale } = useI18n()
  const t =
    TEXTOS[(locale as keyof typeof TEXTOS) in TEXTOS ? (locale as keyof typeof TEXTOS) : 'es']
  const [orientacion, setOrientacion] = useState<number | null>(null)
  const [pedirPermiso, setPedirPermiso] = useState(false)
  const [escuchar, setEscuchar] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return
    const conPermiso = DeviceOrientationEvent as unknown as ConPermiso
    // iOS pide permiso con un toque; el resto escucha directamente.
    if (typeof conPermiso.requestPermission === 'function' && !escuchar) {
      setPedirPermiso(true)
      return
    }
    const alGirar = (evento: Event) => {
      const e = evento as EventoDeOrientacion
      if (typeof e.webkitCompassHeading === 'number') {
        setOrientacion(e.webkitCompassHeading)
      } else if (e.absolute && typeof e.alpha === 'number') {
        setOrientacion((360 - e.alpha) % 360)
      }
    }
    window.addEventListener('deviceorientationabsolute', alGirar)
    window.addEventListener('deviceorientation', alGirar)
    return () => {
      window.removeEventListener('deviceorientationabsolute', alGirar)
      window.removeEventListener('deviceorientation', alGirar)
    }
  }, [escuchar])

  if (!destino) return null

  const distancia = posicion ? getDistanceMeters(posicion, destino) : null
  const rumbo = posicion ? rumboEntre(posicion, destino) : null
  const dentro = distancia !== null && radio !== null && distancia <= radio

  return (
    <div role="status" aria-live="polite" style={estiloTarjeta}>
      <div style={{ fontWeight: 900, fontSize: 13, opacity: 0.85 }}>{t.titulo}</div>
      {destino.title ? <div style={{ fontWeight: 800, marginTop: 2 }}>{destino.title}</div> : null}
      {rumbo === null ? (
        <div style={{ marginTop: 10 }}>{t.sinPosicion}</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            aria-hidden="true"
            style={{
              transform: `rotate(${giroDeLaFlecha(rumbo, orientacion)}deg)`,
              transition: 'transform 200ms linear',
              flex: '0 0 auto',
            }}
          >
            <circle
              cx="32"
              cy="32"
              r="30"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="2"
            />
            <path d="M32 6 L44 40 L32 33 L20 40 Z" fill="currentColor" />
          </svg>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
              {formatoDistancia(distancia, locale)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              {dentro
                ? t.llegaste
                : `${t.hacia} ${puntoCardinal(rumbo, locale)} · ${Math.round(rumbo)}°${orientacion === null ? ` · ${t.norteArriba}` : ''}`}
            </div>
          </div>
        </div>
      )}
      {pedirPermiso && orientacion === null ? (
        <button
          type="button"
          style={estiloBoton}
          onClick={() => {
            const conPermiso = DeviceOrientationEvent as unknown as ConPermiso
            void conPermiso
              .requestPermission?.()
              .then((estado) => {
                if (estado === 'granted') {
                  setPedirPermiso(false)
                  setEscuchar(true)
                }
              })
              .catch(() => undefined)
          }}
        >
          {t.activar}
        </button>
      ) : null}
    </div>
  )
}

const estiloTarjeta: CSSProperties = {
  position: 'fixed',
  left: 16,
  right: 16,
  // Debajo del aviso «Mapa 3D no disponible» (que va al 28 %).
  top: 'calc(28% + 150px)',
  margin: '0 auto',
  maxWidth: 360,
  padding: '14px 16px',
  borderRadius: 16,
  background: 'rgba(var(--theme-ink, 15, 23, 42), .9)',
  color: '#ffffff',
  border: '1px solid rgba(255,255,255,.35)',
  font: '700 14px/1.35 system-ui, sans-serif',
  textAlign: 'center',
  zIndex: 5,
}

const estiloBoton: CSSProperties = {
  marginTop: 10,
  minHeight: 44,
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.45)',
  background: 'rgba(255,255,255,.12)',
  color: '#ffffff',
  font: '800 14px/1.2 system-ui, sans-serif',
  cursor: 'pointer',
}

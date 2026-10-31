import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { useI18n } from '../../../../i18n/useI18n'
import { registrarEvidencia } from '../../../avance/evidencia'
import { partidasGuardadas } from '../../core/partidasGuardadas'
import { textosDeLogica } from './textos'
import './logica.css'

/** Lo que guarda cada nodo mientras se juega (fuera del componente, como `nodeClock`): cerrar y reabrir la hoja no
 * borra los fallos ni devuelve intentos gastados. Se borra al ganar. */
export type Partida = {
  empezado: boolean
  t0: number
  intento: number
  fallos: number
  /** Lo propio de cada juego (caso en curso, intentos de Mastermind, pesadas…). */
  datos: Record<string, unknown>
}
// 30/10: también sobrevive a recargar la página (antes recargar dejaba los fallos a cero).
const partidas = partidasGuardadas<Partida>('logica')

export function useTextosDeLogica() {
  const { locale } = useI18n()
  return textosDeLogica(locale)
}

export function usePartida(nodo: string | number | undefined, juego: string) {
  const clave = `${juego}:${String(nodo ?? '')}`
  const [, repintar] = useState(0)
  // La instancia se queda en el componente: al ganar, `olvidar` la quita del mapa, pero la pantalla sigue en
  // «¡Resuelto!» en vez de volver a «Empezar» mientras se cierra la hoja. ponytail: un componente = un nodo.
  const [partida] = useState<Partida>(() => {
    if (!partidas.has(clave))
      partidas.set(clave, { empezado: false, t0: 0, intento: 0, fallos: 0, datos: {} })
    return partidas.get(clave) as Partida
  })
  const cambiar = useCallback(
    (fn: (p: Partida) => void) => {
      fn(partida)
      partidas.set(clave, partida)
      repintar((n) => n + 1)
    },
    [partida, clave]
  )
  const olvidar = useCallback(() => partidas.delete(clave), [clave])
  return { partida, cambiar, olvidar }
}

/** La evidencia para el servidor (antitrampas): fallos pagados y cuánto se tardó. Nunca bloquea. */
export function anotarPartida(
  nodo: string | number | undefined,
  juego: string,
  p: Partida,
  extra: Record<string, unknown> = {}
) {
  if (nodo === undefined || nodo === null) return
  registrarEvidencia(nodo, {
    juego,
    fallos: p.fallos,
    intento: p.intento,
    ms: Math.max(0, Date.now() - p.t0),
    ...extra,
  })
}

export function Cabecera({
  titulo,
  chips,
  children,
}: {
  titulo: string
  chips?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="lg-cabecera">
      <div className="lg-titulo">
        <h2>{titulo}</h2>
        {chips ? <div className="lg-chips">{chips}</div> : null}
      </div>
      {children ? <p className="lg-intro">{children}</p> : null}
    </header>
  )
}

/** Mensaje de resultado: verde = bien, ámbar = penalización, rojo = error. */
export function Aviso({ tono, children }: { tono: 'bien' | 'pena' | 'mal'; children: ReactNode }) {
  return (
    <p className={`lg-aviso lg-aviso-${tono}`} role="status" aria-live="polite">
      {children}
    </p>
  )
}

/** Con «reducir movimiento» no se animan los vuelos hechos en JS (los de CSS los apaga la hoja de estilos). */
export const quieto = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Colores del confeti: los de las fichas de Mastermind. */
const CONFETI = ['#22d3ee', '#f472b6', '#facc15', '#4ade80', '#fb923c', '#a78bfa']

/** Confeti de acierto: va dentro de un elemento con `position: relative`. */
export function Confeti() {
  return (
    <span className="lg-confeti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--a': `${(i * 360) / 14}deg`,
              '--c': CONFETI[i % CONFETI.length],
              '--d': `${34 + (i % 3) * 12}px`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}

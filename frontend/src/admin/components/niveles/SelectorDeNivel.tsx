import type { CSSProperties } from 'react'
import {
  NIVELES,
  estimacionDeNivel,
  nombreDeNivel,
  parametrosDeNivel,
  textoDeNivel,
  tieneNiveles,
  type Nivel,
} from '../../../player/minigames/core/nivel'

/**
 * Nivel 1-5 del minijuego de un nodo (30/10/2026). Sin nivel, el juego se queda como esté escrito (lo de hoy). Al
 * elegir uno se copian sus parámetros a la config (para que el formulario de abajo los enseñe) y el servidor los
 * aplica; si luego se retoca un número a mano, la config pasa a `nivel_a_mano` y manda lo escrito (ver
 * `marcarNivelAMano`).
 */
export function SelectorDeNivel({
  juego,
  config,
  onChange,
}: {
  juego: string
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}) {
  if (!tieneNiveles(juego)) return null
  const actual = Number(config.nivel) >= 1 && Number(config.nivel) <= 5 ? (Math.trunc(Number(config.nivel)) as Nivel) : null
  const aMano = actual !== null && config.nivel_a_mano === true

  const elegir = (nivel: Nivel | null) => {
    const siguiente = { ...config }
    if (nivel === null) {
      delete siguiente.nivel
      delete siguiente.nivel_a_mano
    } else {
      Object.assign(siguiente, parametrosDeNivel(juego, nivel), { nivel, nivel_a_mano: false })
    }
    onChange(siguiente)
  }

  return (
    <div className="wide" style={caja}>
      <strong style={{ fontSize: 13 }}>Nivel de dificultad</strong>
      <div role="radiogroup" aria-label="Nivel de dificultad" style={fila}>
        <button type="button" role="radio" aria-checked={actual === null} style={pastilla(actual === null)} onClick={() => elegir(null)}>
          Como está
        </button>
        {NIVELES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={actual === n}
            style={pastilla(actual === n)}
            onClick={() => elegir(n)}
            title={textoDeNivel(juego, n)}
          >
            {n} · {nombreDeNivel(n)}
          </button>
        ))}
      </div>
      {actual === null ? (
        <small>Sin nivel: se juega con los números de abajo, como hasta ahora.</small>
      ) : (
        <small>
          <b>{textoDeNivel(juego, actual)}</b> · dura ≈ ×{estimacionDeNivel(actual).toLocaleString('es-ES')} lo de hoy
          (estimación sin calibrar)
          {aMano ? ' · Has retocado números a mano: mandan los que están escritos abajo, no los del nivel.' : ''}
        </small>
      )}
      <small style={{ color: '#fbbf24' }}>
        Todos juegan este nodo al mismo nivel. Si lo cambias con gente jugando, los que lleguen después tardarán
        distinto que los que ya pasaron: cámbialo antes de empezar.
      </small>
    </div>
  )
}

/** Un retoque a mano de un número que fija el nivel: la config pasa a «a mano» (manda lo escrito). */
export function marcarNivelAMano(
  juego: string,
  anterior: Record<string, unknown>,
  siguiente: Record<string, unknown>
): Record<string, unknown> {
  if (!tieneNiveles(juego)) return siguiente
  const nivel = Math.trunc(Number(anterior.nivel))
  if (!(nivel >= 1 && nivel <= 5) || anterior.nivel_a_mano === true || siguiente.nivel !== anterior.nivel) return siguiente
  const claves = Object.keys(parametrosDeNivel(juego, nivel as Nivel))
  const retocado = claves.some((k) => k in siguiente && String(siguiente[k]) !== String(anterior[k]))
  return retocado ? { ...siguiente, nivel_a_mano: true } : siguiente
}

const caja: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: 12,
  borderRadius: 14,
  border: '1px solid rgba(148,163,184,.25)',
  background: 'rgba(148,163,184,.08)',
}
const fila: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 }
const pastilla = (activa: boolean): CSSProperties => ({
  minHeight: 36,
  padding: '6px 12px',
  borderRadius: 999,
  border: activa ? '1px solid #38bdf8' : '1px solid rgba(148,163,184,.35)',
  background: activa ? '#38bdf8' : 'transparent',
  color: activa ? '#0b2440' : 'inherit',
  fontWeight: 800,
  cursor: 'pointer',
})

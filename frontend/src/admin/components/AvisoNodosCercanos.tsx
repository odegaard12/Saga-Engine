import { useMemo, useState } from 'react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
import { ENCIMA_M, MINIMO_M, describirPar, nodosCercanos } from '../lib/nodosCercanos'

/**
 * Aviso de nodos encima o demasiado pegados (26/10/2026), sobre el mapa del panel.
 *
 * Se recalcula con los nodos tal y como están en el panel AHORA: al crear, mover o editar uno, el aviso sale o se va
 * en el momento, antes de guardar. Rojo: a menos de 3 m (encima; el servidor no guarda sin confirmación). Ámbar: a
 * menos de 15 m (con el radio de apertura, al llegar a uno se abriría también el otro).
 */
/** Con una ruta entera apilada salen decenas de pares: se enseñan los primeros. */
const MAX_FILAS = 6

export default function AvisoNodosCercanos({
  stages,
  onSelectStage,
}: {
  stages: AdminReactOverviewStage[]
  onSelectStage: (stage: AdminReactOverviewStage) => void
}) {
  const pares = useMemo(() => nodosCercanos(stages), [stages])
  // Plegado por defecto: abierto tapaba justo la zona del mapa donde se arrastran los nodos.
  const [abierto, setAbierto] = useState(false)
  if (pares.length === 0) return null
  const hayEncima = pares.some((par) => par.encima)

  return (
    <div
      role="alert"
      className="saga-aviso-nodos-cercanos"
      style={{
        // Flota sobre el mapa, bajo la barra de la ruta: en el flujo quedaba DETRÁS del lienzo.
        position: 'absolute',
        top: 168,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        width: 'min(620px, calc(100% - 24px))',
        maxHeight: abierto ? '38vh' : undefined,
        overflowY: 'auto',
        boxSizing: 'border-box',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${hayEncima ? '#ef4444' : '#f59e0b'}`,
        background: hayEncima ? 'rgba(127, 29, 29, 0.92)' : 'rgba(120, 53, 15, 0.92)',
        color: '#fff7ed',
        fontSize: 13,
        lineHeight: 1.35,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ flex: '1 1 auto' }}>
          {hayEncima ? '⛔ Nodos uno encima de otro' : '⚠️ Nodos demasiado pegados'} ·{' '}
          {pares.length === 1 ? '1 par' : `${pares.length} pares`}
        </strong>
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => setAbierto(!abierto)}
          style={{
            border: '1px solid rgba(255,255,255,0.45)',
            background: 'rgba(0,0,0,0.25)',
            color: 'inherit',
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            minHeight: 32,
          }}
        >
          {abierto ? 'Ocultar' : 'Ver cuáles'}
        </button>
      </div>
      {abierto ? (
        <>
      <span style={{ opacity: 0.9 }}>
        Sepáralos al menos {MINIMO_M} m: en el mapa del jugador se tapan y, con el radio de
        apertura, al llegar a uno se abre también el otro. A menos de {ENCIMA_M} m no se guarda sin
        confirmarlo.
      </span>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 6 }}>
        {pares.slice(0, MAX_FILAS).map((par) => (
          <li
            key={`${par.a}-${par.b}`}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: par.encima ? '#ef4444' : '#f59e0b',
                flexShrink: 0,
              }}
            />
            <span style={{ flex: '1 1 180px' }}>{describirPar(par)}</span>
            {[par.a, par.b].map((indice) =>
              stages[indice] ? (
                <button
                  key={indice}
                  type="button"
                  onClick={() => onSelectStage(stages[indice])}
                  style={{
                    border: '1px solid rgba(255,255,255,0.45)',
                    background: 'rgba(0,0,0,0.25)',
                    color: 'inherit',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    minHeight: 32,
                  }}
                >
                  Ir al nodo {indice + 1}
                </button>
              ) : null
            )}
          </li>
        ))}
      </ul>
      {pares.length > MAX_FILAS ? (
        <p style={{ margin: '8px 0 0', opacity: 0.85 }}>… y {pares.length - MAX_FILAS} pares más.</p>
      ) : null}
        </>
      ) : null}
    </div>
  )
}

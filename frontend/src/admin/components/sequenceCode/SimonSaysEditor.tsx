import { useMemo } from 'react'

/**
 * Editor de Simón Dice.
 *
 * Sustituye al editor anterior, que configuraba un puzle de ORDENAR fichas
 * ("Solución del tríptico") mientras el jugador veía un Simón Dice de colores:
 * nada de lo que se tocaba aquí afectaba a la partida.
 *
 * Los topes son los mismos que aplican el runtime y el backend.
 */

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const PADS = [
  { name: 'Verde', color: '#22c55e' },
  { name: 'Rojo', color: '#ef4444' },
  { name: 'Azul', color: '#3b82f6' },
  { name: 'Ámbar', color: '#f59e0b' },
  { name: 'Violeta', color: '#8b5cf6' },
  { name: 'Cian', color: '#06b6d4' },
]

const LIMITS = {
  levels: { min: 3, max: 8, fallback: 5 },
  pad_count: { min: 3, max: 6, fallback: 4 },
  step_ms: { min: 260, max: 1200, fallback: 620 },
} as const

const CSS = `
.sds,.sds *{box-sizing:border-box}
.sds{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(139,92,246,.14),transparent 32%),#f8fafc;color:#172033}
.sds-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.sds-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.sds-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.sds-badge{padding:7px 10px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:900;white-space:nowrap}
.sds-layout{display:grid;grid-template-columns:minmax(260px,1fr) minmax(240px,.85fr);gap:14px}
.sds-card{display:grid;gap:12px;padding:13px;border:1px solid #dbe2ea;border-radius:17px;background:rgba(255,255,255,.94)}
.sds-card h5{margin:0;font-size:14px}
.sds-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.sds-grid label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.sds-grid input,.sds-grid select{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.sds-grid small{color:#64748b;font-size:11px;font-weight:600}
.sds-pads{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;max-width:230px;margin:0 auto}
.sds-pad{aspect-ratio:1;border-radius:16px;box-shadow:inset 0 -4px 0 rgba(0,0,0,.18)}
.sds-seq{display:flex;flex-wrap:wrap;gap:6px}
.sds-chip{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;color:#fff;font-size:11px;font-weight:900;box-shadow:inset 0 -2px 0 rgba(0,0,0,.2)}
.sds-note{padding:11px;border:1px solid #ddd6fe;border-radius:13px;background:#f5f3ff;color:#5b21b6;font-size:12px;line-height:1.45}
.sds-toggle{display:flex!important;align-items:center;gap:9px;grid-column:1/-1}
.sds-toggle input{width:18px!important;min-height:18px!important}
@media(max-width:860px){.sds-layout{grid-template-columns:1fr}}
`

function readInt(config: Record<string, unknown>, key: keyof typeof LIMITS): number {
  const value = Number(config[key])
  return Number.isFinite(value) ? value : LIMITS[key].fallback
}

function clamp(key: keyof typeof LIMITS, value: number): number {
  const { min, max, fallback } = LIMITS[key]
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

/** Mismo generador que el runtime: la vista previa enseña el patrón REAL. */
function buildPattern(seed: string, length: number, padCount: number): number[] {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const out: number[] = []
  let state = hash >>> 0
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    out.push(state % padCount)
  }
  return out
}

export function SimonSaysEditor({ config, onChange }: Props) {
  const levels = readInt(config, 'levels')
  const padCount = readInt(config, 'pad_count')
  const stepMs = readInt(config, 'step_ms')
  const soundEnabled = config.sound_enabled !== false
  const seed = String(config.seed || config.maze_seed || 'saga-simon')

  const pattern = useMemo(
    () => buildPattern(seed, levels, padCount),
    [seed, levels, padCount]
  )

  const estimate = useMemo(() => {
    // Suma de los tiempos de exhibición de cada nivel, más el turno del jugador.
    let total = 0
    for (let level = 1; level <= levels; level++) {
      const step = Math.max(300, stepMs - level * 50)
      total += level * step + 1100
    }
    return Math.round((total / 1000) * 1.9)
  }, [levels, stepMs])

  return (
    <div className="sds">
      <style>{CSS}</style>

      <div className="sds-head">
        <div>
          <h4>🎨 Simón Dice</h4>
          <p>
            El jugador ve una secuencia de cuadrados de colores y la repite. Cada nivel añade
            un color más. Si falla, vuelve al nivel 1 pero <strong>el patrón no cambia</strong>,
            así que se puede aprender por ensayo y error.
          </p>
        </div>
        <span className="sds-badge">Memoria</span>
      </div>

      <div className="sds-layout">
        <div className="sds-card">
          <h5>Reglas</h5>
          <div className="sds-grid">
            <label>
              <span>Niveles para ganar</span>
              <input
                type="number"
                min={LIMITS.levels.min}
                max={LIMITS.levels.max}
                value={levels}
                onChange={(event) => onChange({ levels: clamp('levels', Number(event.target.value)) })}
              />
              <small>El nivel N muestra N colores seguidos.</small>
            </label>

            <label>
              <span>Número de colores</span>
              <select
                value={padCount}
                onChange={(event) => onChange({ pad_count: clamp('pad_count', Number(event.target.value)) })}
              >
                <option value={3}>3 · fácil</option>
                <option value={4}>4 · clásico</option>
                <option value={5}>5 · difícil</option>
                <option value={6}>6 · muy difícil</option>
              </select>
              <small>Más colores, más difícil de memorizar.</small>
            </label>

            <label>
              <span>Velocidad de la secuencia (ms)</span>
              <input
                type="number"
                step={20}
                min={LIMITS.step_ms.min}
                max={LIMITS.step_ms.max}
                value={stepMs}
                onChange={(event) => onChange({ step_ms: clamp('step_ms', Number(event.target.value)) })}
              />
              <small>Menos milisegundos = se enseña más rápido.</small>
            </label>

            <label>
              <span>Semilla del patrón</span>
              <input
                value={seed}
                onChange={(event) => onChange({ seed: event.target.value.slice(0, 40) })}
                placeholder="saga-simon"
              />
              <small>Cambiarla genera otro patrón distinto.</small>
            </label>

            <label className="sds-toggle">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(event) => onChange({ sound_enabled: event.target.checked })}
              />
              <span>Sonido de los colores (cada color tiene su nota)</span>
            </label>
          </div>
        </div>

        <div className="sds-card">
          <h5>Vista previa</h5>

          <div className="sds-pads" style={{ gridTemplateColumns: padCount > 4 ? 'repeat(3,1fr)' : 'repeat(2,1fr)' }}>
            {PADS.slice(0, padCount).map((pad) => (
              <div key={pad.name} className="sds-pad" style={{ background: pad.color }} title={pad.name} />
            ))}
          </div>

          <div>
            <small style={{ color: '#64748b', fontWeight: 700 }}>
              Patrón real del nivel final:
            </small>
            <div className="sds-seq" style={{ marginTop: 6 }}>
              {pattern.map((padIndex, position) => (
                <span
                  key={position}
                  className="sds-chip"
                  style={{ background: PADS[padIndex].color }}
                  title={PADS[padIndex].name}
                >
                  {position + 1}
                </span>
              ))}
            </div>
          </div>

          <div className="sds-note">
            Duración estimada: <strong>~{estimate}s</strong> si acierta a la primera. Con fallos
            se alarga, porque vuelve al nivel 1.
          </div>
        </div>
      </div>
    </div>
  )
}

export default SimonSaysEditor

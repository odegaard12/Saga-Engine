/**
 * Editor de "Rumbo doble".
 *
 * Segundo game_id de la familia bearing_hunt (ver
 * frontend/src/player/minigames/families/bearingHunt/RuntimeScreen.tsx):
 * en vez de un solo rumbo objetivo, el jugador apunta a 2 (admin-configurable
 * 2-3) cosas reales visibles desde el nodo, una tras otra. Cada objetivo es
 * solo una etiqueta libre -lo que escribe el organizador, p.ej. "la torre de
 * la iglesia"- y un rumbo en grados. No hay helper de captura de brújola del
 * propio admin: bearing_hunt (el juego del que viene) tampoco lo tiene, así
 * que no se inventa uno nuevo aquí (ver target_bearing_deg en
 * guidedEditorUtils.ts, es un simple <input type="number">).
 */

type Target = { label: string; bearing_deg: number }

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const MIN_TARGETS = 2
const MAX_TARGETS = 3

const LIMITS = {
  tolerance_deg: { min: 1, max: 90, fallback: 12 },
  hold_ms: { min: 100, max: 8000, fallback: 1200 },
} as const

const CSS = `
.rdb,.rdb *{box-sizing:border-box}
.rdb{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(56,189,248,.14),transparent 32%),#f8fafc;color:#172033}
.rdb-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.rdb-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.rdb-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.rdb-badge{padding:7px 10px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:900;white-space:nowrap}
.rdb-targets{display:grid;gap:10px}
.rdb-target{display:grid;grid-template-columns:1fr 130px auto;gap:10px;align-items:end;padding:12px;border:1px solid #dbe2ea;border-radius:14px;background:rgba(255,255,255,.94)}
.rdb-target label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.rdb-target input{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.rdb-remove{min-height:42px;padding:0 12px;border:1px solid #fecaca;border-radius:11px;background:#fef2f2;color:#b91c1c;font-weight:800;cursor:pointer}
.rdb-remove:disabled{opacity:.4;cursor:not-allowed}
.rdb-add{justify-self:start;padding:9px 14px;border:1px dashed #7dd3fc;border-radius:11px;background:#f0f9ff;color:#0369a1;font-weight:800;cursor:pointer}
.rdb-add:disabled{opacity:.4;cursor:not-allowed}
.rdb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.rdb-grid label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.rdb-grid input{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.rdb-grid small{color:#64748b;font-size:11px;font-weight:600}
.rdb-note{padding:11px;border:1px solid #bae6fd;border-radius:13px;background:#f0f9ff;color:#0369a1;font-size:12px;line-height:1.45}
`

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function normalizeBearing(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 360) + 360) % 360
}

function readTargets(config: Record<string, unknown>): Target[] {
  const raw = Array.isArray(config.targets) ? config.targets : []
  const targets: Target[] = raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .slice(0, MAX_TARGETS)
    .map((item) => ({
      label: String(item.label ?? '').slice(0, 120),
      bearing_deg: normalizeBearing(Number(item.bearing_deg) || 0),
    }))

  while (targets.length < MIN_TARGETS) {
    targets.push({
      label: `Objetivo ${targets.length + 1}`,
      bearing_deg: targets.length === 0 ? 0 : 90,
    })
  }

  return targets
}

export function RumboDobleEditor({ config, onChange }: Props) {
  const targets = readTargets(config)
  const tolerance = clampNumber(
    Number(config.tolerance_deg),
    LIMITS.tolerance_deg.min,
    LIMITS.tolerance_deg.max,
    LIMITS.tolerance_deg.fallback
  )
  const holdMs = clampNumber(
    Number(config.hold_ms),
    LIMITS.hold_ms.min,
    LIMITS.hold_ms.max,
    LIMITS.hold_ms.fallback
  )

  const updateTargets = (next: Target[]) => onChange({ targets: next })

  const updateTarget = (index: number, patch: Partial<Target>) => {
    const next = targets.map((target, i) => (i === index ? { ...target, ...patch } : target))
    updateTargets(next)
  }

  const addTarget = () => {
    if (targets.length >= MAX_TARGETS) return
    updateTargets([...targets, { label: `Objetivo ${targets.length + 1}`, bearing_deg: 180 }])
  }

  const removeTarget = (index: number) => {
    if (targets.length <= MIN_TARGETS) return
    updateTargets(targets.filter((_, i) => i !== index))
  }

  return (
    <div className="rdb">
      <style>{CSS}</style>

      <div className="rdb-head">
        <div>
          <h4>🧭 Rumbo doble</h4>
          <p>
            El jugador apunta el móvil, uno tras otro, a cada objetivo de la lista y mantiene el
            rumbo el tiempo pedido. Escribe una pista corta por objetivo (lo único que ve el
            jugador para orientarse: no hay pin en el mapa) y su rumbo en grados. Perder el rumbo
            de un objetivo solo reinicia ESE objetivo, nunca los ya conseguidos.
          </p>
        </div>
        <span className="rdb-badge">Orientación</span>
      </div>

      <div className="rdb-targets">
        {targets.map((target, index) => (
          <div className="rdb-target" key={index}>
            <label>
              <span>Pista del objetivo {index + 1}</span>
              <input
                type="text"
                value={target.label}
                maxLength={120}
                placeholder="p.ej. la torre de la iglesia"
                onChange={(event) => updateTarget(index, { label: event.target.value })}
              />
            </label>
            <label>
              <span>Rumbo (0-359°)</span>
              <input
                type="number"
                min={0}
                max={359}
                value={Math.round(target.bearing_deg)}
                onChange={(event) =>
                  updateTarget(index, { bearing_deg: normalizeBearing(Number(event.target.value)) })
                }
              />
            </label>
            <button
              type="button"
              className="rdb-remove"
              disabled={targets.length <= MIN_TARGETS}
              onClick={() => removeTarget(index)}
            >
              Quitar
            </button>
          </div>
        ))}

        <button type="button" className="rdb-add" disabled={targets.length >= MAX_TARGETS} onClick={addTarget}>
          + Añadir objetivo {targets.length >= MAX_TARGETS ? '(máximo 3)' : ''}
        </button>
      </div>

      <div className="rdb-grid">
        <label>
          <span>Tolerancia de rumbo</span>
          <input
            type="number"
            min={LIMITS.tolerance_deg.min}
            max={LIMITS.tolerance_deg.max}
            value={tolerance}
            onChange={(event) =>
              onChange({
                tolerance_deg: clampNumber(
                  Number(event.target.value),
                  LIMITS.tolerance_deg.min,
                  LIMITS.tolerance_deg.max,
                  LIMITS.tolerance_deg.fallback
                ),
              })
            }
          />
          <small>Margen permitido alrededor de cada rumbo objetivo.</small>
        </label>
        <label>
          <span>Tiempo de espera (ms)</span>
          <input
            type="number"
            min={LIMITS.hold_ms.min}
            max={LIMITS.hold_ms.max}
            step={100}
            value={holdMs}
            onChange={(event) =>
              onChange({
                hold_ms: clampNumber(
                  Number(event.target.value),
                  LIMITS.hold_ms.min,
                  LIMITS.hold_ms.max,
                  LIMITS.hold_ms.fallback
                ),
              })
            }
          />
          <small>Milisegundos que hay que mantener CADA rumbo antes de pasar al siguiente.</small>
        </label>
      </div>

      <div className="rdb-note">
        2-3 objetivos, mínimo 2. El mapa de la mochila no marca ningún pin para este juego: la
        única guía del jugador es la pista de texto que escribas aquí.
      </div>
    </div>
  )
}

export default RumboDobleEditor

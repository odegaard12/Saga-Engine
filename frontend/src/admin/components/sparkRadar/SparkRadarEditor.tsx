import { useMemo } from 'react'

/**
 * Editor de Caza-Señales.
 *
 * Los topes son los mismos que aplica el backend (ver minigames.py): si aquí se
 * pudiera guardar algo fuera de rango, el servidor lo recortaría al vuelo y el
 * admin enseñaría un valor que el jugador nunca vería.
 */

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const LIMITS = {
  target_hits: { min: 3, max: 40, fallback: 12 },
  time_limit_s: { min: 15, max: 180, fallback: 45 },
  spawn_interval_ms: { min: 250, max: 2500, fallback: 700 },
  spark_life_ms: { min: 600, max: 4000, fallback: 1600 },
  echo_penalty_s: { min: 0, max: 10, fallback: 2 },
} as const

const CSS = `
.spr,.spr *{box-sizing:border-box}
.spr{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(45,212,191,.14),transparent 32%),#f8fafc;color:#172033}
.spr-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.spr-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.spr-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.spr-badge{padding:7px 10px;border-radius:999px;background:#ccfbf1;color:#115e59;font-size:11px;font-weight:900;white-space:nowrap}
.spr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.spr-grid label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.spr-grid input,.spr-grid select{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.spr-grid small{color:#64748b;font-size:11px;font-weight:600}
.spr-note{padding:11px;border:1px solid #99f6e4;border-radius:13px;background:#f0fdfa;color:#115e59;font-size:12px;line-height:1.45}
.spr-warn{border-color:#fed7aa;background:#fff7ed;color:#9a3412}
@media(max-width:860px){.spr-grid{grid-template-columns:1fr}}
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

export function SparkRadarEditor({ config, onChange }: Props) {
  const targetHits = readInt(config, 'target_hits')
  const timeLimitS = readInt(config, 'time_limit_s')
  const spawnMs = readInt(config, 'spawn_interval_ms')
  const lifeMs = readInt(config, 'spark_life_ms')
  const penaltyS = readInt(config, 'echo_penalty_s')

  const echoRatioRaw = Number(config.echo_ratio)
  const echoRatio = Number.isFinite(echoRatioRaw) ? Math.max(0, Math.min(0.6, echoRatioRaw)) : 0.28

  /**
   * Cuántas señales verdes puede llegar a ver el jugador con estos ajustes.
   * Es lo único que de verdad decide si el reto es superable, y sin enseñarlo
   * es facilísimo dejar un nodo imposible sin enterarse.
   */
  const preview = useMemo(() => {
    const spawned = Math.floor((timeLimitS * 1000) / Math.max(1, spawnMs))
    const greens = Math.floor(spawned * (1 - echoRatio))
    const ratio = greens / Math.max(1, targetHits)

    let verdict: string
    let tone: 'ok' | 'warn'
    if (ratio < 1.15) {
      verdict = 'Casi imposible: harían falta casi todos los aciertos y sin fallar ninguno.'
      tone = 'warn'
    } else if (ratio < 1.6) {
      verdict = 'Exigente: hay poco margen de error. Bien para jugadores rápidos.'
      tone = 'ok'
    } else if (ratio < 3) {
      verdict = 'Equilibrado: se supera con atención, se falla si te despistas.'
      tone = 'ok'
    } else {
      verdict = 'Muy fácil: sobran señales de sobra. Sube el objetivo o baja el tiempo.'
      tone = 'warn'
    }

    return { spawned, greens, verdict, tone }
  }, [timeLimitS, spawnMs, echoRatio, targetHits])

  function patch(values: Record<string, unknown>) {
    onChange(values)
  }

  return (
    <div className="spr">
      <style>{CSS}</style>

      <div className="spr-head">
        <div>
          <h4>📡 Caza-Señales</h4>
          <p>
            Aparecen chispas verdes durante un instante y el jugador debe tocarlas. Las rojas
            son señales falsas: restan tiempo. Sin GPS, sin sensores y sin conexión.
          </p>
        </div>
        <span className="spr-badge">Reflejos</span>
      </div>

      <div className="spr-grid">
        <label>
          <span>Señales para ganar</span>
          <input
            type="number"
            min={LIMITS.target_hits.min}
            max={LIMITS.target_hits.max}
            value={targetHits}
            onChange={(event) => patch({ target_hits: clamp('target_hits', Number(event.target.value)) })}
          />
          <small>Entre {LIMITS.target_hits.min} y {LIMITS.target_hits.max}.</small>
        </label>

        <label>
          <span>Tiempo límite (segundos)</span>
          <input
            type="number"
            min={LIMITS.time_limit_s.min}
            max={LIMITS.time_limit_s.max}
            value={timeLimitS}
            onChange={(event) => patch({ time_limit_s: clamp('time_limit_s', Number(event.target.value)) })}
          />
          <small>Entre {LIMITS.time_limit_s.min}s y {LIMITS.time_limit_s.max}s.</small>
        </label>

        <label>
          <span>Aparece una chispa cada (ms)</span>
          <input
            type="number"
            step={50}
            min={LIMITS.spawn_interval_ms.min}
            max={LIMITS.spawn_interval_ms.max}
            value={spawnMs}
            onChange={(event) =>
              patch({ spawn_interval_ms: clamp('spawn_interval_ms', Number(event.target.value)) })
            }
          />
          <small>Menos milisegundos = más frenético.</small>
        </label>

        <label>
          <span>Cada chispa dura (ms)</span>
          <input
            type="number"
            step={100}
            min={LIMITS.spark_life_ms.min}
            max={LIMITS.spark_life_ms.max}
            value={lifeMs}
            onChange={(event) =>
              patch({ spark_life_ms: clamp('spark_life_ms', Number(event.target.value)) })
            }
          />
          <small>Cuánto tiempo tiene para tocarla antes de que se apague.</small>
        </label>

        <label>
          <span>Proporción de ecos rojos</span>
          <select
            value={String(echoRatio)}
            onChange={(event) => patch({ echo_ratio: Number(event.target.value) })}
          >
            <option value="0">Ninguno (0%)</option>
            <option value="0.15">Pocos (15%)</option>
            <option value="0.28">Normal (28%)</option>
            <option value="0.4">Muchos (40%)</option>
            <option value="0.6">Caos (60%)</option>
          </select>
          <small>Los ecos rojos nunca deben ser mayoría.</small>
        </label>

        <label>
          <span>Penalización por eco (segundos)</span>
          <input
            type="number"
            min={LIMITS.echo_penalty_s.min}
            max={LIMITS.echo_penalty_s.max}
            value={penaltyS}
            onChange={(event) =>
              patch({ echo_penalty_s: clamp('echo_penalty_s', Number(event.target.value)) })
            }
          />
          <small>Segundos que pierde al tocar una chispa roja.</small>
        </label>
      </div>

      <div className={preview.tone === 'warn' ? 'spr-note spr-warn' : 'spr-note'}>
        <strong>Con estos ajustes:</strong> aparecerán unas {preview.spawned} chispas, de las que
        ~{preview.greens} serán verdes, para un objetivo de {targetHits}. {preview.verdict}
      </div>
    </div>
  )
}

export default SparkRadarEditor

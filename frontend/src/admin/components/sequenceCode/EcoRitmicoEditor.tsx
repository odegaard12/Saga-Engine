import { useMemo } from 'react'
import { generarRonda } from '../../../player/minigames/families/sequenceCode/eco'

/**
 * Editor del Eco rítmico (30/10), que sustituye al Simón Dice con su mismo id (`sequence_code`).
 *
 * Los topes son los mismos que aplican el runtime y el backend; la vista previa usa el mismo generador que el móvil.
 */

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const FICHAS = [
  { glifo: '●', color: '#22d3ee' },
  { glifo: '▲', color: '#f472b6' },
  { glifo: '■', color: '#facc15' },
  { glifo: '◆', color: '#4ade80' },
  { glifo: '★', color: '#fb923c' },
  { glifo: '✚', color: '#a78bfa' },
]

const LIMITS = {
  levels: { min: 3, max: 8, fallback: 6 },
  pad_count: { min: 3, max: 6, fallback: 4 },
  step_ms: { min: 260, max: 1200, fallback: 620 },
  long_notes: { min: 0, max: 60, fallback: 25 },
  penalty_s: { min: 5, max: 120, fallback: 20 },
} as const

const CSS = `
.sds,.sds *{box-sizing:border-box}
.sds{display:grid;gap:15px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:#f8fafc;color:#172033}
.sds-head h4{margin:0;font-size:21px;letter-spacing:-.035em}
.sds-head p{max-width:66ch;margin:5px 0 0;color:#64748b;font-size:13px;line-height:1.45}
.sds-layout{display:grid;grid-template-columns:minmax(260px,1fr) minmax(240px,.85fr);gap:14px}
.sds-card{display:grid;gap:12px;padding:13px;border:1px solid #dbe2ea;border-radius:17px;background:#fff}
.sds-card h5{margin:0;font-size:14px}
.sds-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.sds-grid label{display:grid;gap:6px;color:#334155;font-size:12px;font-weight:850}
.sds-grid input,.sds-grid select{width:100%;min-height:42px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.sds-grid small{color:#64748b;font-size:11px;font-weight:600}
.sds-seq{display:flex;gap:4px;align-items:center}
.sds-chip{display:grid;place-items:center;height:30px;border-radius:8px;color:#0b1424;font-size:15px;font-weight:900}
.sds-note{padding:11px;border:1px solid #ddd6fe;border-radius:13px;background:#f5f3ff;color:#5b21b6;font-size:12px;line-height:1.45}
.sds-toggle{display:flex!important;align-items:center;gap:9px;grid-column:1/-1}
.sds-toggle input{width:18px!important;min-height:18px!important}
@media(max-width:860px){.sds-layout{grid-template-columns:1fr}}
`

function leer(config: Record<string, unknown>, key: keyof typeof LIMITS): number {
  const { min, max, fallback } = LIMITS[key]
  const value = Number(config[key] ?? fallback)
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback
}

function Ronda({
  semilla,
  largo,
  fichas,
  largas,
}: {
  semilla: string
  largo: number
  fichas: number
  largas: number
}) {
  const r = generarRonda(semilla, largo, fichas, largas)
  return (
    <div className="sds-seq">
      {r.fichas.map((f, i) => (
        <span
          key={i}
          className="sds-chip"
          style={{ background: FICHAS[f].color, width: r.pulsos[i] === 2 ? 52 : 26 }}
          title={r.pulsos[i] === 2 ? 'largo' : 'corto'}
        >
          {FICHAS[f].glifo}
        </span>
      ))}
    </div>
  )
}

export function EcoRitmicoEditor({ config, onChange }: Props) {
  const rondas = leer(config, 'levels')
  const fichas = leer(config, 'pad_count')
  const pulso = leer(config, 'step_ms')
  const largas = leer(config, 'long_notes')
  const pena = leer(config, 'penalty_s')
  const semilla = String(config.seed || 'vista-previa')

  // Por ronda: enseñarla (pulsos × pulso) + repetirla (una vez y media eso) + leer y pulsar ~4 s.
  const estimacion = useMemo(() => {
    let ms = 0
    for (let r = 1; r <= rondas; r++)
      ms += 2.5 * (r + 2) * (1 + largas / 100) * Math.max(260, pulso - (r - 1) * 20) + 4000
    return Math.round(ms / 1000)
  }, [rondas, pulso, largas])

  const campo = (key: keyof typeof LIMITS, label: string, ayuda: string, step = 1) => (
    <label>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={LIMITS[key].min}
        max={LIMITS[key].max}
        value={leer(config, key)}
        onChange={(event) => onChange({ [key]: Number(event.target.value) })}
      />
      <small>{ayuda}</small>
    </label>
  )

  return (
    <div className="sds">
      <style>{CSS}</style>
      <div className="sds-head">
        <h4>🥁 Eco rítmico</h4>
        <p>
          El jugador ve (y oye, si quiere) una secuencia de golpes con su ritmo y la repite en orden
          y a ritmo. Cada ronda suma un golpe. Un fallo suma segundos y trae otra secuencia en la
          misma ronda: nunca bloquea. Sin micrófono ni red.
        </p>
      </div>

      <div className="sds-layout">
        <div className="sds-card">
          <h5>Reglas</h5>
          <div className="sds-grid">
            {campo('levels', 'Rondas para ganar', 'La ronda N son N + 2 golpes.')}
            <label>
              <span>Fichas</span>
              <select
                value={fichas}
                onChange={(event) => onChange({ pad_count: Number(event.target.value) })}
              >
                <option value={3}>3 · fácil</option>
                <option value={4}>4 · normal</option>
                <option value={5}>5 · difícil</option>
                <option value={6}>6 · muy difícil</option>
              </select>
              <small>Cada ficha tiene icono, color y nota.</small>
            </label>
            {campo(
              'step_ms',
              'Pulso (ms)',
              'Lo que dura un golpe corto. Cada ronda va 20 ms más rápida.',
              20
            )}
            {campo(
              'long_notes',
              'Golpes largos (%)',
              '0 = sólo memoria; con largos también cuenta el ritmo.',
              5
            )}
            {campo('penalty_s', 'Segundos por fallo', 'Se suman al tiempo del nodo.')}
            <label>
              <span>Semilla</span>
              <input
                value={String(config.seed || '')}
                onChange={(event) => onChange({ seed: event.target.value.slice(0, 40) })}
                placeholder="(vacía: una por jugador)"
              />
              <small>Vacía: cada jugador tiene la suya y cambia al fallar.</small>
            </label>
            <label className="sds-toggle">
              <input
                type="checkbox"
                checked={config.sound_enabled !== false}
                onChange={(event) => onChange({ sound_enabled: event.target.checked })}
              />
              <span>Sonido de partida encendido (el jugador puede apagarlo)</span>
            </label>
          </div>
        </div>

        <div className="sds-card">
          <h5>Vista previa</h5>
          <small style={{ color: '#64748b', fontWeight: 700 }}>Primera ronda</small>
          <Ronda semilla={`${semilla}:r1`} largo={3} fichas={fichas} largas={largas} />
          <small style={{ color: '#64748b', fontWeight: 700 }}>Última ronda (ancho = largo)</small>
          <Ronda
            semilla={`${semilla}:r${rondas}`}
            largo={rondas + 2}
            fichas={fichas}
            largas={largas}
          />
          <div className="sds-note">
            Duración estimada: <strong>~{estimacion} s</strong> sin fallos; cada fallo, +{pena} s y
            repetir la ronda.
          </div>
        </div>
      </div>
    </div>
  )
}

export default EcoRitmicoEditor

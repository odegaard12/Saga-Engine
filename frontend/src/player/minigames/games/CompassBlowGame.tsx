import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerMinigameProps } from '../types'

const DEFAULT_TARGET = ['N', 'E', 'S']
const OPTIONS = ['N', 'E', 'S', 'W']

function readTarget(config: Record<string, unknown>) {
  const raw = config.target
  if (!Array.isArray(raw)) return DEFAULT_TARGET
  const values = raw
    .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
    .filter((item) => OPTIONS.includes(item))
    .slice(0, 3)
  return values.length === 3 ? values : DEFAULT_TARGET
}

export function CompassBlowGame({
  stage,
  submitting = false,
  onWin,
}: PlayerMinigameProps) {
  const config = (stage.config && typeof stage.config === 'object'
    ? stage.config
    : {}) as Record<string, unknown>

  const target = useMemo(() => readTarget(config), [config])

  const [indices, setIndices] = useState([0, 0, 0])
  const [status, setStatus] = useState('Set the airflow directions.')
  const [tone, setTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  const values = indices.map((index) => OPTIONS[index])

  function cycle(slot: number) {
    if (submitting || working) return
    setIndices((current) =>
      current.map((value, index) => (index === slot ? (value + 1) % OPTIONS.length : value))
    )
    setStatus('Set the airflow directions.')
    setTone('idle')
  }

  async function validate() {
    if (submitting || working) return
    const ok = values.every((value, index) => value === target[index])

    if (!ok) {
      setStatus('Airflow mismatch.')
      setTone('bad')
      return
    }

    try {
      setWorking(true)
      setStatus('Flow stabilized. Syncing node…')
      setTone('ok')
      await onWin()
    } catch {
      setStatus('Flow stabilized, but sync failed.')
      setTone('bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={wrap}>
      <div style={title}>Compass blow</div>

      <div style={grid}>
        {values.map((value, index) => (
          <button
            key={index}
            type="button"
            style={cellButton}
            onClick={() => cycle(index)}
            disabled={submitting || working}
          >
            <div style={cellLabel}>FLOW {index + 1}</div>
            <div style={cellValue}>{value}</div>
            <div style={cellHint}>TAP</div>
          </button>
        ))}
      </div>

      <button type="button" style={primaryButton} onClick={validate} disabled={submitting || working}>
        {working ? 'SYNC…' : 'STABILIZE FLOW'}
      </button>

      <div style={{ ...statusBox, ...(tone === 'ok' ? okBox : tone === 'bad' ? badBox : null) }}>
        {status}
      </div>
    </section>
  )
}

const wrap: CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.04)',
  padding: 14,
  display: 'grid',
  gap: 12,
}

const title: CSSProperties = {
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
}

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
}

const cellButton: CSSProperties = {
  minHeight: 120,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'linear-gradient(180deg, rgba(30,41,59,.88), rgba(15,23,42,.96))',
  color: '#fff',
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 8,
  padding: 10,
}

const cellLabel: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.16em',
}

const cellValue: CSSProperties = {
  color: '#fff',
  fontSize: 26,
  fontWeight: 900,
  letterSpacing: '0.08em',
}

const cellHint: CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.12em',
}

const primaryButton: CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: '1px solid rgba(34,197,94,.24)',
  background: 'linear-gradient(180deg, rgba(34,197,94,.24), rgba(22,163,74,.16))',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const statusBox: CSSProperties = {
  minHeight: 40,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.42)',
  color: '#cbd5e1',
  fontSize: 13,
  lineHeight: 1.4,
  padding: '10px 12px',
}

const okBox: CSSProperties = {
  border: '1px solid rgba(34,197,94,.24)',
  background: 'rgba(20,83,45,.26)',
  color: '#dcfce7',
}

const badBox: CSSProperties = {
  border: '1px solid rgba(239,68,68,.22)',
  background: 'rgba(127,29,29,.24)',
  color: '#fecaca',
}

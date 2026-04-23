import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerMinigameProps } from '../types'

const DEFAULT_OPTIONS = ['0°', '45°', '90°', '135°', '180°', '225°', '270°', '315°']
const DEFAULT_TARGET = '135°'

function readOptions(config: Record<string, unknown>) {
  const raw = config.options
  if (!Array.isArray(raw)) return DEFAULT_OPTIONS
  const values = raw
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim().toUpperCase() : ''))
    .filter(Boolean)
  return values.length >= 4 ? values : DEFAULT_OPTIONS
}

export function RadioAzimuthGame({
  stage,
  submitting = false,
  onWin,
}: PlayerMinigameProps) {
  const config = (stage.config && typeof stage.config === 'object'
    ? stage.config
    : {}) as Record<string, unknown>

  const options = useMemo(() => readOptions(config), [config])
  const target = String(config.target_bearing ?? config.target ?? DEFAULT_TARGET).trim().toUpperCase() || DEFAULT_TARGET

  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState('Align the azimuth.')
  const [tone, setTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  function rotate(step: 1 | -1) {
    if (submitting || working) return
    setIndex((current) => {
      const next = current + step
      if (next < 0) return options.length - 1
      if (next >= options.length) return 0
      return next
    })
    setStatus('Align the azimuth.')
    setTone('idle')
  }

  async function validate() {
    if (submitting || working) return
    if (options[index] !== target) {
      setStatus('Wrong bearing.')
      setTone('bad')
      return
    }

    try {
      setWorking(true)
      setStatus('Bearing confirmed. Syncing node…')
      setTone('ok')
      await onWin()
    } catch {
      setStatus('Bearing confirmed, but sync failed.')
      setTone('bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={wrap}>
      <div style={title}>Radio azimuth</div>

      <div style={compassBox}>
        <button type="button" style={stepButton} onClick={() => rotate(-1)} disabled={submitting || working}>
          ←
        </button>

        <div style={bearingCard}>
          <div style={bearingValue}>{options[index]}</div>
          <div style={bearingHint}>CURRENT BEARING</div>
        </div>

        <button type="button" style={stepButton} onClick={() => rotate(1)} disabled={submitting || working}>
          →
        </button>
      </div>

      <button type="button" style={primaryButton} onClick={validate} disabled={submitting || working}>
        {working ? 'SYNC…' : 'CONFIRM BEARING'}
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

const compassBox: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '56px minmax(0, 1fr) 56px',
  gap: 10,
  alignItems: 'center',
}

const stepButton: CSSProperties = {
  minHeight: 78,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  fontSize: 28,
  fontWeight: 900,
}

const bearingCard: CSSProperties = {
  minHeight: 78,
  borderRadius: 18,
  border: '1px solid rgba(59,130,246,.18)',
  background: 'linear-gradient(180deg, rgba(30,41,59,.88), rgba(15,23,42,.96))',
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 6,
}

const bearingValue: CSSProperties = {
  color: '#dbeafe',
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: '0.06em',
}

const bearingHint: CSSProperties = {
  color: '#93c5fd',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.16em',
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

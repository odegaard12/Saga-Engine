import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerMinigameProps } from '../types'

const DEFAULT_OPTIONS = ['87.5', '92.3', '99.1', '104.6', '108.0']
const DEFAULT_TARGET = '104.6'

function readOptions(config: Record<string, unknown>) {
  const raw = config.options
  if (!Array.isArray(raw)) return DEFAULT_OPTIONS
  const values = raw
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
    .filter(Boolean)
  return values.length >= 3 ? values : DEFAULT_OPTIONS
}

export function DigitalTunerGame({
  stage,
  submitting = false,
  onWin,
}: PlayerMinigameProps) {
  const config = (stage.config && typeof stage.config === 'object'
    ? stage.config
    : {}) as Record<string, unknown>

  const options = useMemo(() => readOptions(config), [config])
  const target = String(config.target_frequency ?? config.target ?? DEFAULT_TARGET).trim() || DEFAULT_TARGET

  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState('Tune to the correct band.')
  const [tone, setTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  function move(step: 1 | -1) {
    if (submitting || working) return
    setIndex((current) => {
      const next = current + step
      if (next < 0) return options.length - 1
      if (next >= options.length) return 0
      return next
    })
    setStatus('Tune to the correct band.')
    setTone('idle')
  }

  async function validate() {
    if (submitting || working) return
    const current = options[index]

    if (current !== target) {
      setStatus('Wrong frequency.')
      setTone('bad')
      return
    }

    try {
      setWorking(true)
      setStatus('Signal locked. Syncing node…')
      setTone('ok')
      await onWin()
    } catch {
      setStatus('Signal locked, but sync failed.')
      setTone('bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={wrap}>
      <div style={title}>Digital tuner</div>

      <div style={dialWrap}>
        <button type="button" style={stepButton} onClick={() => move(-1)} disabled={submitting || working}>
          −
        </button>

        <div style={screen}>
          <div style={screenValue}>{options[index]}</div>
          <div style={screenLabel}>MHz</div>
        </div>

        <button type="button" style={stepButton} onClick={() => move(1)} disabled={submitting || working}>
          +
        </button>
      </div>

      <button type="button" style={primaryButton} onClick={validate} disabled={submitting || working}>
        {working ? 'SYNC…' : 'LOCK SIGNAL'}
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

const dialWrap: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '56px minmax(0, 1fr) 56px',
  gap: 10,
  alignItems: 'center',
}

const stepButton: CSSProperties = {
  minHeight: 76,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  fontSize: 28,
  fontWeight: 900,
}

const screen: CSSProperties = {
  minHeight: 76,
  borderRadius: 18,
  border: '1px solid rgba(34,197,94,.18)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.92), rgba(2,6,23,.98))',
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 4,
}

const screenValue: CSSProperties = {
  color: '#86efac',
  fontSize: 26,
  fontWeight: 900,
  letterSpacing: '0.08em',
}

const screenLabel: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.18em',
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

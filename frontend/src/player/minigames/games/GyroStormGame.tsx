import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerMinigameProps } from '../types'

const DEFAULT_SEQUENCE = ['UP', 'RIGHT', 'DOWN', 'LEFT']
const ACTIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'] as const

function readSequence(config: Record<string, unknown>) {
  const raw = config.sequence
  if (!Array.isArray(raw)) return DEFAULT_SEQUENCE
  const values = raw
    .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
    .filter((item) => ACTIONS.includes(item as (typeof ACTIONS)[number]))
  return values.length >= 3 ? values : DEFAULT_SEQUENCE
}

export function GyroStormGame({
  stage,
  submitting = false,
  onWin,
}: PlayerMinigameProps) {
  const config = (stage.config && typeof stage.config === 'object'
    ? stage.config
    : {}) as Record<string, unknown>

  const target = useMemo(() => readSequence(config), [config])

  const [input, setInput] = useState<string[]>([])
  const [status, setStatus] = useState('Repeat the tilt sequence.')
  const [tone, setTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  function press(value: string) {
    if (submitting || working) return

    const next = [...input, value]
    setInput(next)

    const prefixOk = next.every((item, index) => item === target[index])

    if (!prefixOk) {
      setInput([])
      setStatus('Wrong sequence.')
      setTone('bad')
      return
    }

    if (next.length === target.length) {
      void finish()
      return
    }

    setStatus(`${next.length}/${target.length}`)
    setTone('idle')
  }

  async function finish() {
    try {
      setWorking(true)
      setStatus('Pattern locked. Syncing node…')
      setTone('ok')
      await onWin()
    } catch {
      setStatus('Pattern locked, but sync failed.')
      setTone('bad')
    } finally {
      setWorking(false)
      setInput([])
    }
  }

  return (
    <section style={wrap}>
      <div style={title}>Gyro storm</div>

      <div style={grid}>
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            style={padButton}
            onClick={() => press(action)}
            disabled={submitting || working}
          >
            {action}
          </button>
        ))}
      </div>

      <div style={inputBox}>{input.length ? input.join(' · ') : '—'}</div>

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
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const padButton: CSSProperties = {
  minHeight: 74,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'linear-gradient(180deg, rgba(30,41,59,.88), rgba(15,23,42,.96))',
  color: '#fff',
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: '0.08em',
}

const inputBox: CSSProperties = {
  minHeight: 40,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.42)',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 800,
  padding: '10px 12px',
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

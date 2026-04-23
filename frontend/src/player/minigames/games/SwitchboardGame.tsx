import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerMinigameProps } from '../types'

const DEFAULT_TARGET = [true, false, true, true]

function readTarget(config: Record<string, unknown>) {
  const raw = config.target
  if (!Array.isArray(raw)) return DEFAULT_TARGET
  const values = raw
    .map((item) => Boolean(item))
    .slice(0, 4)
  return values.length === 4 ? values : DEFAULT_TARGET
}

export function SwitchboardGame({
  stage,
  submitting = false,
  onWin,
}: PlayerMinigameProps) {
  const config = (stage.config && typeof stage.config === 'object'
    ? stage.config
    : {}) as Record<string, unknown>

  const target = useMemo(() => readTarget(config), [config])

  const [switches, setSwitches] = useState([false, false, false, false])
  const [status, setStatus] = useState('Match the circuit pattern.')
  const [tone, setTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  function toggle(index: number) {
    if (submitting || working) return
    setSwitches((current) => current.map((value, i) => (i === index ? !value : value)))
    setStatus('Match the circuit pattern.')
    setTone('idle')
  }

  async function validate() {
    if (submitting || working) return
    const ok = switches.every((value, index) => value === target[index])

    if (!ok) {
      setStatus('Circuit mismatch.')
      setTone('bad')
      return
    }

    try {
      setWorking(true)
      setStatus('Circuit restored. Syncing node…')
      setTone('ok')
      await onWin()
    } catch {
      setStatus('Circuit restored, but sync failed.')
      setTone('bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={wrap}>
      <div style={title}>Switchboard</div>

      <div style={grid}>
        {switches.map((value, index) => (
          <button
            key={index}
            type="button"
            style={{
              ...switchCard,
              ...(value ? switchOn : switchOff),
            }}
            onClick={() => toggle(index)}
            disabled={submitting || working}
          >
            <div style={switchLabel}>SW {index + 1}</div>
            <div style={switchValue}>{value ? 'ON' : 'OFF'}</div>
          </button>
        ))}
      </div>

      <button type="button" style={primaryButton} onClick={validate} disabled={submitting || working}>
        {working ? 'SYNC…' : 'RESTORE CIRCUIT'}
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
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const switchCard: CSSProperties = {
  minHeight: 86,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 6,
  color: '#fff',
}

const switchOn: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(22,163,74,.32), rgba(21,128,61,.20))',
}

const switchOff: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(30,41,59,.88), rgba(15,23,42,.96))',
}

const switchLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.16em',
  color: '#cbd5e1',
}

const switchValue: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: '0.08em',
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

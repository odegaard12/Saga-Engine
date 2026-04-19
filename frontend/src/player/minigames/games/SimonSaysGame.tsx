import { useMemo, useState } from 'react'
import type { PlayerMinigameProps } from '../types'

const DEFAULT_SEQUENCE = ['A', 'B', 'C', 'D']

function readSequence(stage: PlayerMinigameProps['stage']) {
  const config = (stage.config && typeof stage.config === 'object'
    ? stage.config
    : {}) as Record<string, unknown>

  const raw = config.sequence
  if (!Array.isArray(raw)) return DEFAULT_SEQUENCE

  const normalized = raw
    .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
    .filter((item) => ['A', 'B', 'C', 'D'].includes(item))
    .slice(0, 8)

  return normalized.length >= 3 ? normalized : DEFAULT_SEQUENCE
}

const PAD_META = {
  A: { label: 'A', color: '#2563eb' },
  B: { label: 'B', color: '#16a34a' },
  C: { label: 'C', color: '#f59e0b' },
  D: { label: 'D', color: '#ef4444' },
} as const

export function SimonSaysGame({
  stage,
  submitting = false,
  onWin,
}: PlayerMinigameProps) {
  const targetSequence = useMemo(() => readSequence(stage), [stage])
  const [input, setInput] = useState<string[]>([])
  const [status, setStatus] = useState('Repeat the signal pattern in the correct order.')
  const [statusTone, setStatusTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  function pressPad(value: string) {
    if (submitting || working) return

    const next = [...input, value]
    setInput(next)

    const prefixOk = next.every((item, index) => item === targetSequence[index])

    if (!prefixOk) {
      setInput([])
      setStatus('Wrong input. Pattern reset.')
      setStatusTone('bad')
      return
    }

    if (next.length === targetSequence.length) {
      void validateComplete()
      return
    }

    setStatus(`Pattern progress: ${next.length}/${targetSequence.length}`)
    setStatusTone('idle')
  }

  async function validateComplete() {
    try {
      setWorking(true)
      setStatus('Pattern matched. Synchronizing node…')
      setStatusTone('ok')
      await onWin()
    } catch {
      setStatus('Pattern matched, but mission sync failed. Retry.')
      setStatusTone('bad')
    } finally {
      setWorking(false)
      setInput([])
    }
  }

  function clearInput() {
    if (submitting || working) return
    setInput([])
    setStatus('Pattern cleared.')
    setStatusTone('idle')
  }

  return (
    <section style={wrap}>
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>SIMON SAYS</div>
          <div style={title}>Repeat the signal sequence</div>
        </div>
        <div style={metaChip}>{targetSequence.length} STEPS</div>
      </div>

      <div style={sequenceBox}>
        TARGET: {targetSequence.join(' · ')}
      </div>

      <div style={padsGrid}>
        {Object.entries(PAD_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            style={{
              ...padButton,
              background: meta.color,
            }}
            onClick={() => pressPad(key)}
            disabled={submitting || working}
          >
            {meta.label}
          </button>
        ))}
      </div>

      <div style={statusRow}>
        <div style={progressBox}>
          INPUT: {input.length ? input.join(' · ') : '—'}
        </div>

        <button
          type="button"
          style={clearButton}
          onClick={clearInput}
          disabled={submitting || working || input.length === 0}
        >
          CLEAR
        </button>
      </div>

      <div
        style={{
          ...statusBox,
          ...(statusTone === 'ok'
            ? statusOk
            : statusTone === 'bad'
            ? statusBad
            : null),
        }}
      >
        {status}
      </div>
    </section>
  )
}

const wrap: React.CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.04)',
  padding: 14,
  display: 'grid',
  gap: 12,
}

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 10,
}

const eyebrow: React.CSSProperties = {
  color: 'rgba(167,243,208,.96)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const title: React.CSSProperties = {
  marginTop: 6,
  color: '#f8fafc',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
}

const metaChip: React.CSSProperties = {
  minHeight: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.06)',
  color: '#cbd5e1',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
  whiteSpace: 'nowrap',
}

const sequenceBox: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.42)',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  padding: '12px 14px',
}

const padsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const padButton: React.CSSProperties = {
  minHeight: 82,
  borderRadius: 18,
  border: '0',
  color: '#ffffff',
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1,
  boxShadow: 'inset 0 -6px 0 rgba(0,0,0,.12)',
}

const statusRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 10,
}

const progressBox: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.42)',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  padding: '12px 14px',
}

const clearButton: React.CSSProperties = {
  minHeight: 42,
  minWidth: 94,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.10em',
  padding: '0 14px',
}

const statusBox: React.CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.42)',
  color: '#cbd5e1',
  fontSize: 13,
  lineHeight: 1.45,
  padding: '12px 14px',
}

const statusOk: React.CSSProperties = {
  border: '1px solid rgba(34,197,94,.24)',
  background: 'rgba(20,83,45,.26)',
  color: '#dcfce7',
}

const statusBad: React.CSSProperties = {
  border: '1px solid rgba(239,68,68,.22)',
  background: 'rgba(127,29,29,.24)',
  color: '#fecaca',
}

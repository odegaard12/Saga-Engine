import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerMinigameProps } from '../types'
import { tokens } from '../../ui/tokens'

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
  const [status, setStatus] = useState('Repeat the pattern.')
  const [statusTone, setStatusTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  function pressPad(value: string) {
    if (submitting || working) return

    const next = [...input, value]
    setInput(next)

    const prefixOk = next.every((item, index) => item === targetSequence[index])

    if (!prefixOk) {
      setInput([])
      setStatus('Wrong pattern.')
      setStatusTone('bad')
      return
    }

    if (next.length === targetSequence.length) {
      void validateComplete()
      return
    }

    setStatus(`${next.length}/${targetSequence.length}`)
    setStatusTone('idle')
  }

  async function validateComplete() {
    try {
      setWorking(true)
      setStatus('Syncing…')
      setStatusTone('ok')
      await onWin()
    } catch {
      setStatus('Sync failed.')
      setStatusTone('bad')
    } finally {
      setWorking(false)
      setInput([])
    }
  }

  function clearInput() {
    if (submitting || working) return
    setInput([])
    setStatus('Cleared.')
    setStatusTone('idle')
  }

  return (
    <section style={wrap}>
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
          {input.length ? input.join(' · ') : '—'}
        </div>

        <button
          type="button"
          style={clearButton}
          onClick={clearInput}
          disabled={submitting || working || input.length === 0}
        >
          Clear
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

const wrap: CSSProperties = {
  borderRadius: 20,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: tokens.colors.slateSoft,
  padding: 14,
  display: 'grid',
  gap: 12,
}

const padsGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const padButton: CSSProperties = {
  minHeight: 78,
  borderRadius: 18,
  border: '0',
  color: '#ffffff',
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1,
  boxShadow: 'inset 0 -6px 0 rgba(0,0,0,.12)',
}

const statusRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 10,
}

const progressBox: CSSProperties = {
  minHeight: 40,
  borderRadius: 14,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: 'rgba(15,23,42,.42)',
  color: tokens.colors.slateMuted,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  padding: '10px 12px',
}

const clearButton: CSSProperties = {
  minHeight: 40,
  minWidth: 84,
  borderRadius: 14,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  padding: '0 12px',
}

const statusBox: CSSProperties = {
  minHeight: 40,
  borderRadius: 14,
  border: `1px solid ${tokens.colors.slateLine}`,
  background: 'rgba(15,23,42,.42)',
  color: tokens.colors.slateMuted,
  fontSize: 13,
  lineHeight: 1.4,
  padding: '10px 12px',
}

const statusOk: CSSProperties = {
  border: `1px solid ${tokens.colors.brandLine}`,
  background: 'rgba(20,83,45,.26)',
  color: '#dcfce7',
}

const statusBad: CSSProperties = {
  border: `1px solid ${tokens.colors.dangerLine}`,
  background: 'rgba(127,29,29,.24)',
  color: '#fecaca',
}

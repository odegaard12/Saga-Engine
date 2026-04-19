import { useMemo, useState } from 'react'
import type { PlayerMinigameProps } from '../types'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function readTargetWord(stage: PlayerMinigameProps['stage']) {
  const config = (stage.config && typeof stage.config === 'object'
    ? stage.config
    : {}) as Record<string, unknown>

  const candidate =
    typeof config.target_word === 'string'
      ? config.target_word
      : typeof config.word === 'string'
      ? config.word
      : 'SAGA'

  const normalized = candidate
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5)

  return normalized.length >= 3 ? normalized : 'SAGA'
}

export function CryptexGame({
  stage,
  submitting = false,
  onWin,
}: PlayerMinigameProps) {
  const targetWord = useMemo(() => readTargetWord(stage), [stage])
  const [indices, setIndices] = useState(() => targetWord.split('').map(() => 0))
  const [status, setStatus] = useState('Align the lock.')
  const [statusTone, setStatusTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  const letters = useMemo(
    () => indices.map((index) => ALPHABET[index] || 'A'),
    [indices]
  )

  function rotate(index: number, step: 1 | -1) {
    if (submitting || working) return

    setIndices((current) =>
      current.map((value, i) => {
        if (i !== index) return value
        const next = value + step
        if (next < 0) return ALPHABET.length - 1
        if (next >= ALPHABET.length) return 0
        return next
      })
    )

    setStatus('Align the lock.')
    setStatusTone('idle')
  }

  async function validate() {
    if (submitting || working) return

    const candidate = letters.join('')
    if (candidate !== targetWord) {
      setStatus('Not correct.')
      setStatusTone('bad')
      return
    }

    try {
      setWorking(true)
      setStatus('Unlocking node…')
      setStatusTone('ok')
      await onWin()
    } catch {
      setStatus('Sync failed. Retry.')
      setStatusTone('bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={wrap}>
      <div style={ringsRow}>
        {letters.map((letter, index) => (
          <div key={`${index}-${letter}`} style={ringCard}>
            <button
              type="button"
              style={stepButton}
              onClick={() => rotate(index, 1)}
              disabled={submitting || working}
            >
              +
            </button>

            <div style={ringLetter}>{letter}</div>

            <button
              type="button"
              style={stepButton}
              onClick={() => rotate(index, -1)}
              disabled={submitting || working}
            >
              −
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        style={validateButton}
        onClick={validate}
        disabled={submitting || working}
      >
        {working ? 'SYNC…' : 'UNLOCK'}
      </button>

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

const ringsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
  gap: 10,
}

const ringCard: React.CSSProperties = {
  minHeight: 132,
  borderRadius: 18,
  border: '1px solid rgba(59,130,246,.16)',
  background:
    'linear-gradient(180deg, rgba(30,41,59,.88), rgba(15,23,42,.96))',
  color: '#f8fafc',
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 10,
  padding: 10,
}

const stepButton: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const ringLetter: React.CSSProperties = {
  color: '#ffffff',
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '0.06em',
}

const validateButton: React.CSSProperties = {
  minHeight: 48,
  borderRadius: 16,
  border: '1px solid rgba(34,197,94,.24)',
  background:
    'linear-gradient(180deg, rgba(34,197,94,.24), rgba(22,163,74,.16))',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.12em',
  padding: '0 16px',
}

const statusBox: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.42)',
  color: '#cbd5e1',
  fontSize: 13,
  lineHeight: 1.4,
  padding: '10px 12px',
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

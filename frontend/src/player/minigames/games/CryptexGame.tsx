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
  const [status, setStatus] = useState('Rotate each ring until the lock matches.')
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

    setStatus('Rotate each ring until the lock matches.')
    setStatusTone('idle')
  }

  async function validate() {
    if (submitting || working) return

    const candidate = letters.join('')
    if (candidate !== targetWord) {
      setStatus('Incorrect alignment. Recheck the rings and try again.')
      setStatusTone('bad')
      return
    }

    try {
      setWorking(true)
      setStatus('Cryptex unlocked. Synchronizing node…')
      setStatusTone('ok')
      await onWin()
    } catch {
      setStatus('Unlock succeeded, but mission sync failed. Retry.')
      setStatusTone('bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={wrap}>
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>CRYPTEX</div>
          <div style={title}>Unlock the word lock</div>
        </div>
        <div style={metaChip}>{targetWord.length} RINGS</div>
      </div>

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

            <div style={ringIndex}>RING {index + 1}</div>
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
        {working ? 'SYNCING CRYPTEX…' : 'UNLOCK NODE'}
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

const ringsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
  gap: 10,
}

const ringCard: React.CSSProperties = {
  minHeight: 136,
  borderRadius: 18,
  border: '1px solid rgba(59,130,246,.16)',
  background:
    'linear-gradient(180deg, rgba(30,41,59,.88), rgba(15,23,42,.96))',
  color: '#f8fafc',
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 8,
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

const ringIndex: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
}

const ringLetter: React.CSSProperties = {
  color: '#ffffff',
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '0.06em',
}

const validateButton: React.CSSProperties = {
  minHeight: 52,
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

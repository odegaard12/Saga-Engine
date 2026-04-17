import { useMemo, useState } from 'react'
import type { PlayerMinigameProps } from '../types'

type RingDef = {
  label: string
  options: string[]
}

const DEFAULT_DIRECTION_OPTIONS = ['NORTH', 'EAST', 'SOUTH', 'WEST', 'CENTER']
const DEFAULT_GUARD_OPTIONS = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH']
const DEFAULT_TARGET = ['EAST', 'SECOND', 'SOUTH']

function readStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const items = value
    .map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
    .filter(Boolean)
  return items.length >= 2 ? items : fallback
}

function readTarget(config: Record<string, unknown> | undefined): string[] {
  if (!config) return DEFAULT_TARGET

  const target = config.target
  if (Array.isArray(target) && target.length === 3) {
    const items = target.map((item) =>
      typeof item === 'string' ? item.trim().toUpperCase() : ''
    )
    if (items.every(Boolean)) return items as string[]
  }

  const fromKeys = [
    typeof config.target_start === 'string' ? config.target_start.trim().toUpperCase() : '',
    typeof config.target_guard === 'string' ? config.target_guard.trim().toUpperCase() : '',
    typeof config.target_end === 'string' ? config.target_end.trim().toUpperCase() : '',
  ]

  if (fromKeys.every(Boolean)) return fromKeys as string[]

  return DEFAULT_TARGET
}

export function CircuitHackGame({
  stage,
  submitting = false,
  onWin,
}: PlayerMinigameProps) {
  const config = (stage.config && typeof stage.config === 'object'
    ? stage.config
    : {}) as Record<string, unknown>

  const directionOptions = readStringArray(
    config.direction_options,
    DEFAULT_DIRECTION_OPTIONS
  )
  const guardOptions = readStringArray(config.guard_options, DEFAULT_GUARD_OPTIONS)

  const rings: RingDef[] = useMemo(
    () => [
      { label: 'START', options: directionOptions },
      { label: 'GUARD', options: guardOptions },
      { label: 'END', options: directionOptions },
    ],
    [directionOptions, guardOptions]
  )

  const target = useMemo(() => readTarget(config), [config])

  const [indices, setIndices] = useState([0, 0, 0])
  const [status, setStatus] = useState('Rotate the three dials to align the node.')
  const [statusTone, setStatusTone] = useState<'idle' | 'ok' | 'bad'>('idle')
  const [working, setWorking] = useState(false)

  const values = useMemo(
    () => indices.map((idx, i) => rings[i].options[idx]),
    [indices, rings]
  )

  function rotate(index: number) {
    if (submitting || working) return

    setIndices((current) =>
      current.map((value, i) =>
        i === index ? (value + 1) % rings[i].options.length : value
      )
    )

    setStatus('Rotate the three dials to align the node.')
    setStatusTone('idle')
  }

  async function validate() {
    if (submitting || working) return

    const ok = values.every((value, i) => value === target[i])

    if (!ok) {
      setStatus('Alignment mismatch. Review the three dials and retry.')
      setStatusTone('bad')
      return
    }

    try {
      setWorking(true)
      setStatus('Alignment accepted. Synchronizing node…')
      setStatusTone('ok')
      await onWin()
    } catch {
      setStatus('Node alignment passed, but mission sync failed. Retry.')
      setStatusTone('bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={wrap}>
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>CIRCUIT HACK</div>
          <div style={title}>Align the node</div>
        </div>

        <div style={hintChip}>3 DIALS</div>
      </div>

      <div style={ringsRow}>
        {rings.map((ring, index) => (
          <button
            key={ring.label}
            type="button"
            style={dialButton}
            onClick={() => rotate(index)}
            disabled={submitting || working}
          >
            <div style={dialLabel}>{ring.label}</div>
            <div style={dialValue}>{values[index]}</div>
            <div style={dialHint}>TAP TO ROTATE</div>
          </button>
        ))}
      </div>

      <button
        type="button"
        style={validateButton}
        onClick={validate}
        disabled={submitting || working}
      >
        {working ? 'SYNCING NODE…' : 'SYNC NODE'}
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

const hintChip: React.CSSProperties = {
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
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
}

const dialButton: React.CSSProperties = {
  minHeight: 132,
  borderRadius: 18,
  border: '1px solid rgba(34,197,94,.16)',
  background:
    'linear-gradient(180deg, rgba(30,41,59,.88), rgba(15,23,42,.96))',
  color: '#f8fafc',
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 8,
  padding: 12,
  textAlign: 'center',
  cursor: 'pointer',
}

const dialLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const dialValue: React.CSSProperties = {
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 900,
  lineHeight: 1.1,
  letterSpacing: '0.08em',
  wordBreak: 'break-word',
}

const dialHint: React.CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.10em',
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

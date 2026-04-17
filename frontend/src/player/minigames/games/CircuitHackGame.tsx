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
  helperText,
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
      { label: 'DIRECTION START', options: directionOptions },
      { label: 'GUARD ORDER', options: guardOptions },
      { label: 'DIRECTION END', options: directionOptions },
    ],
    [directionOptions, guardOptions]
  )

  const target = useMemo(() => readTarget(config), [config])

  const [indices, setIndices] = useState([0, 0, 0])
  const [status, setStatus] = useState(
    stage.content?.trim() || helperText || 'Rotate each dial to align the node.'
  )
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

    setStatus('Rotate each dial to align the node.')
    setStatusTone('idle')
  }

  async function validate() {
    if (submitting || working) return

    const ok = values.every((value, i) => value === target[i])

    if (!ok) {
      setStatus('Misalignment detected. Check the three dial values and try again.')
      setStatusTone('bad')
      return
    }

    try {
      setWorking(true)
      setStatus('Alignment accepted. Synchronizing node…')
      setStatusTone('ok')
      await onWin()
    } catch {
      setStatus('Alignment succeeded, but mission advance failed. Try again.')
      setStatusTone('bad')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section style={wrap}>
      <div style={headerLabel}>NATIVE REACT MINIGAME</div>
      <div style={title}>Circuit hack</div>
      <div style={subtitle}>
        Align the three dials to restore the node handshake.
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
          </button>
        ))}
      </div>

      <button
        type="button"
        style={validateButton}
        onClick={validate}
        disabled={submitting || working}
      >
        {working ? 'SYNCING…' : 'VALIDATE ALIGNMENT'}
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
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
  display: 'grid',
  gap: 12,
}

const headerLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const title: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
}

const subtitle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: 13,
  lineHeight: 1.45,
}

const ringsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
}

const dialButton: React.CSSProperties = {
  minHeight: 128,
  borderRadius: 18,
  border: '1px solid rgba(34,197,94,.20)',
  background:
    'radial-gradient(circle at top, rgba(34,197,94,.12), rgba(2,6,23,.18))',
  color: '#f8fafc',
  display: 'grid',
  placeItems: 'center',
  padding: 12,
  textAlign: 'center',
  cursor: 'pointer',
}

const dialLabel: React.CSSProperties = {
  color: 'rgba(148,163,184,.92)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
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

const validateButton: React.CSSProperties = {
  minHeight: 50,
  borderRadius: 16,
  border: '1px solid rgba(34,197,94,.26)',
  background:
    'linear-gradient(180deg, rgba(34,197,94,.24), rgba(22,163,74,.18))',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.10em',
  padding: '0 16px',
}

const statusBox: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(2,6,23,.34)',
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

import type { CSSProperties } from 'react'
import type { PlayerStage } from '../../types/player'
import type { PrimaryActionTone } from '../runtime'

interface PlayerHudProps {
  currentStage: PlayerStage | null
  level: number
  finished: boolean
  gpsState: string
  distanceMeters: number | null
  inRange: boolean
  primaryLabel: string
  primaryTone: PrimaryActionTone
  primaryDisabled: boolean
  statusLabel: string
  summary: string
  onPrimaryAction: () => void
}

function getGpsDisplay(gpsState: string): string {
  const value = String(gpsState || 'unknown').toLowerCase()
  if (value === 'ready') return 'Live'
  if (value === 'stale') return 'Last known'
  if (value === 'searching') return 'Searching'
  if (value === 'error') return 'Error'
  return 'Unavailable'
}

function getRangeDisplay(
  finished: boolean,
  distanceMeters: number | null,
  inRange: boolean
): string {
  if (finished) return 'Complete'
  if (distanceMeters === null) return 'No range'
  if (inRange) return `${distanceMeters}m`
  return `${distanceMeters}m away`
}

export function PlayerHud({
  currentStage,
  level,
  finished,
  gpsState,
  distanceMeters,
  inRange,
  primaryLabel,
  primaryTone,
  primaryDisabled,
  statusLabel,
  summary,
  onPrimaryAction,
}: PlayerHudProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const gpsDisplay = getGpsDisplay(gpsState)
  const rangeDisplay = getRangeDisplay(finished, distanceMeters, inRange)
  const title = finished ? 'Mission complete' : currentStage?.title || 'Awaiting node'
  const eyebrow = finished ? 'ROUTE STATUS' : `STAGE ${level + 1}`

  return (
    <section
      style={{
        ...dock,
        width: compact ? 'calc(100% - 20px)' : 'min(100%, 760px)',
        padding: compact ? 12 : 14,
        gap: compact ? 10 : 12,
      }}
    >
      <div style={chipRow}>
        <StatusChip label="STATE" value={statusLabel} tone={finished ? 'success' : primaryTone} />
        <StatusChip
          label="GPS"
          value={gpsDisplay}
          tone={
            gpsState === 'ready'
              ? 'success'
              : gpsState === 'searching'
              ? 'warn'
              : 'neutral'
          }
        />
        <StatusChip label="RANGE" value={rangeDisplay} tone={inRange ? 'accent' : 'neutral'} />
      </div>

      <div style={eyebrowText}>{eyebrow}</div>
      <div style={{ ...titleText, fontSize: compact ? 22 : 28 }}>{title}</div>
      <div style={summaryText}>{summary}</div>

      <button
        type="button"
        style={getPrimaryButtonStyle(primaryTone, primaryDisabled, compact)}
        disabled={primaryDisabled}
        onClick={onPrimaryAction}
      >
        {primaryLabel}
      </button>
    </section>
  )
}

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'accent' | 'neutral' | 'warn' | 'success'
}) {
  return (
    <div
      style={{
        ...chip,
        ...(tone === 'accent'
          ? chipAccent
          : tone === 'warn'
          ? chipWarn
          : tone === 'success'
          ? chipSuccess
          : chipNeutral),
      }}
    >
      <div style={chipLabel}>{label}</div>
      <div style={chipValue}>{value}</div>
    </div>
  )
}

function getPrimaryButtonStyle(
  tone: PrimaryActionTone,
  disabled: boolean,
  compact: boolean
): CSSProperties {
  const base: CSSProperties = {
    width: '100%',
    minHeight: compact ? 52 : 56,
    borderRadius: 18,
    fontSize: compact ? 13 : 14,
    fontWeight: 900,
    letterSpacing: '0.10em',
    border: '1px solid transparent',
  }

  if (disabled) {
    return {
      ...base,
      background: 'rgba(255,255,255,.08)',
      border: '1px solid rgba(255,255,255,.10)',
      color: '#94a3b8',
    }
  }

  if (tone === 'warn') {
    return {
      ...base,
      background: 'linear-gradient(180deg, rgba(245,158,11,.26), rgba(217,119,6,.20))',
      border: '1px solid rgba(245,158,11,.24)',
      color: '#fde68a',
    }
  }

  if (tone === 'success') {
    return {
      ...base,
      background: 'linear-gradient(180deg, rgba(168,85,247,.28), rgba(126,34,206,.22))',
      border: '1px solid rgba(168,85,247,.24)',
      color: '#f3e8ff',
    }
  }

  if (tone === 'neutral') {
    return {
      ...base,
      background: 'rgba(255,255,255,.08)',
      border: '1px solid rgba(255,255,255,.10)',
      color: '#e2e8f0',
    }
  }

  return {
    ...base,
    background: 'linear-gradient(180deg, #22c55e, #15803d)',
    border: '1px solid rgba(34,197,94,.30)',
    color: '#ffffff',
    boxShadow: '0 14px 30px rgba(34,197,94,.22)',
  }
}

const dock: CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  borderRadius: 26,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(7,17,28,.92), rgba(7,17,28,.84))',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 24px 54px rgba(0,0,0,.34)',
  color: '#f8fafc',
  display: 'grid',
}

const chipRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
}

const chip: CSSProperties = {
  minHeight: 64,
  borderRadius: 16,
  padding: '10px 12px',
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.04)',
}

const chipAccent: CSSProperties = {
  border: '1px solid rgba(34,197,94,.20)',
  background: 'rgba(34,197,94,.10)',
}

const chipNeutral: CSSProperties = {
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.04)',
}

const chipWarn: CSSProperties = {
  border: '1px solid rgba(245,158,11,.20)',
  background: 'rgba(245,158,11,.10)',
}

const chipSuccess: CSSProperties = {
  border: '1px solid rgba(168,85,247,.20)',
  background: 'rgba(168,85,247,.10)',
}

const chipLabel: CSSProperties = {
  color: '#94a3b8',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
}

const chipValue: CSSProperties = {
  marginTop: 6,
  color: '#f8fafc',
  fontSize: 14,
  fontWeight: 900,
  lineHeight: 1.1,
}

const eyebrowText: CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const titleText: CSSProperties = {
  color: '#ffffff',
  fontWeight: 900,
  lineHeight: 0.98,
  letterSpacing: '-0.04em',
}

const summaryText: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.45,
}

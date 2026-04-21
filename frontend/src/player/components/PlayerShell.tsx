import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  gpsState: PlayerGpsStatus
  distanceMeters: number | null
  debugEnabled: boolean
  followPlayer: boolean
  toolsOpen?: boolean
  shellLoginHref?: string
  onOpenEntry?: () => void
  onOpenTools?: () => void
  onCloseTools?: () => void
  onToggleDebug?: () => void
  onFocusPlayer?: () => void
  onFocusNode?: () => void
  onToggleFollow?: () => void
}

function getGpsLabel(gpsState: PlayerGpsStatus): string {
  if (gpsState === 'ready') return 'GPS LIVE'
  if (gpsState === 'stale') return 'GPS LAST'
  if (gpsState === 'searching') return 'GPS SEARCH'
  if (gpsState === 'error') return 'GPS ERROR'
  return 'GPS OFF'
}

function getRangeLabel(distanceMeters: number | null): string {
  if (distanceMeters === null) return 'NO RANGE'
  return `${distanceMeters}M`
}

export function PlayerShell(props: PlayerShellProps) {
  const {
    payload,
    currentStage,
    gpsState,
    distanceMeters,
    debugEnabled,
    followPlayer,
  } = props

  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const playerName = payload.display_name || payload.profile?.display_name || payload.user
  const stageName = currentStage?.title || 'Awaiting node'
  const gpsLabel = getGpsLabel(gpsState)
  const rangeLabel = getRangeLabel(distanceMeters)

  return (
    <div style={wrap}>
      <section
        style={{
          ...card,
          width: compact ? '100%' : 'min(100%, 760px)',
          padding: compact ? 16 : 18,
          borderRadius: compact ? 28 : 30,
        }}
      >
        <div style={topRow}>
          <div style={eyebrow}>FIELD SESSION</div>
          <div style={soloPill}>{mode === 'team' ? 'TEAM' : 'SOLO'}</div>
        </div>

        <div style={{ ...playerTitle, fontSize: compact ? 17 : 19 }}>{playerName}</div>
        <div style={stageTitle}>{stageName}</div>

        <div style={chipRow}>
          <span style={chip}>{gpsLabel}</span>
          <span style={chipMuted}>{rangeLabel}</span>
          {followPlayer ? <span style={chipInfo}>FOLLOW</span> : null}
          {debugEnabled ? <span style={chipDanger}>DEBUG</span> : null}
        </div>
      </section>
    </div>
  )
}

const wrap: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'auto',
}

const card: CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(84,91,104,.72) 0%, rgba(110,116,128,.64) 100%)',
  border: '1px solid rgba(255,255,255,.22)',
  boxShadow: '0 20px 48px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.12)',
  backdropFilter: 'blur(20px) saturate(135%)',
  WebkitBackdropFilter: 'blur(20px) saturate(135%)',
  color: '#ffffff',
  display: 'grid',
  gap: 10,
}

const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const eyebrow: CSSProperties = {
  color: '#c8ffe1',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const soloPill: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.16)',
  border: '1px solid rgba(255,255,255,.18)',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const playerTitle: CSSProperties = {
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
  color: '#ffffff',
}

const stageTitle: CSSProperties = {
  color: 'rgba(255,255,255,.94)',
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.2,
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 2,
}

const chipBase: CSSProperties = {
  minHeight: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.16)',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.06em',
}

const chip: CSSProperties = {
  ...chipBase,
  background: 'rgba(255,255,255,.16)',
  color: '#ffffff',
}

const chipMuted: CSSProperties = {
  ...chipBase,
  background: 'rgba(255,255,255,.10)',
  color: 'rgba(255,255,255,.90)',
}

const chipInfo: CSSProperties = {
  ...chipBase,
  background: 'rgba(96,165,250,.22)',
  border: '1px solid rgba(96,165,250,.28)',
  color: '#dbeafe',
}

const chipDanger: CSSProperties = {
  ...chipBase,
  background: 'rgba(239,68,68,.18)',
  border: '1px solid rgba(239,68,68,.24)',
  color: '#fecaca',
}

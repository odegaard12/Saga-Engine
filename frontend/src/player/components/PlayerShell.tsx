import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../../types/player'

type MaybeAction = (() => void) | undefined

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  gpsState: PlayerGpsStatus
  distanceMeters: number | null
  debugEnabled: boolean
  followPlayer: boolean
  toolsOpen: boolean
  shellLoginHref?: string
  onOpenEntry?: () => void
  onOpenTools: () => void
  onCloseTools: () => void
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

export function PlayerShell({
  payload,
  currentStage,
  gpsState,
  distanceMeters,
  debugEnabled,
  followPlayer,
  toolsOpen,
  shellLoginHref,
  onOpenEntry,
  onOpenTools,
  onCloseTools,
  onToggleDebug,
  onFocusPlayer,
  onFocusNode,
  onToggleFollow,
}: PlayerShellProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const playerName = payload.display_name || payload.profile?.display_name || payload.user
  const stageName = currentStage?.title || 'Awaiting node'
  const gpsLabel = getGpsLabel(gpsState)
  const rangeLabel = getRangeLabel(distanceMeters)

  function runAction(action?: MaybeAction) {
    return () => {
      if (action) action()
      onCloseTools()
    }
  }

  function handleEntry() {
    if (onOpenEntry) {
      onOpenEntry()
      onCloseTools()
      return
    }
    if (shellLoginHref && typeof window !== 'undefined') {
      onCloseTools()
      window.location.href = shellLoginHref
    }
  }

  return (
    <div style={wrap}>
      <section
        style={{
          ...card,
          width: compact ? '100%' : 'min(100%, 760px)',
          padding: compact ? 14 : 16,
          borderRadius: compact ? 28 : 30,
        }}
      >
        <div style={topRow}>
          <div style={eyebrow}>FIELD SESSION</div>
          <div style={soloPill}>{mode === 'team' ? 'TEAM' : 'SOLO'}</div>
        </div>

        <div style={{ ...playerTitle, fontSize: compact ? 16 : 18 }}>{playerName}</div>
        <div style={stageTitle}>{stageName}</div>

        <div style={chipRow}>
          <span style={chip}>{gpsLabel}</span>
          <span style={chipMuted}>{rangeLabel}</span>
          {followPlayer ? <span style={chipInfo}>FOLLOW</span> : null}
          {debugEnabled ? <span style={chipDanger}>DEBUG</span> : null}
        </div>

        <div style={toolbarRow}>
          <div />
          <button
            type="button"
            onClick={toolsOpen ? onCloseTools : onOpenTools}
            style={toolsOpen ? toolsButtonActive : toolsButton}
          >
            {toolsOpen ? 'CLOSE' : 'TOOLS'}
          </button>
        </div>

        {toolsOpen ? (
          <section style={toolsPanel}>
            <div style={toolsHeader}>
              <div style={toolsTitle}>Field tools</div>
              <button type="button" style={closeButton} onClick={onCloseTools}>
                ×
              </button>
            </div>

            <div style={toolsGrid}>
              <button type="button" style={toolButton} onClick={handleEntry}>
                ← LOGIN
              </button>

              <button
                type="button"
                style={debugEnabled ? toolButtonDangerActive : toolButtonDanger}
                onClick={runAction(onToggleDebug)}
              >
                {debugEnabled ? 'DEBUG ON' : 'DEBUG'}
              </button>

              <button type="button" style={toolButton} onClick={runAction(onFocusPlayer)}>
                PLAYER
              </button>

              <button type="button" style={toolButton} onClick={runAction(onFocusNode)}>
                NODE
              </button>

              <button
                type="button"
                style={followPlayer ? toolButtonInfoActive : toolButtonInfo}
                onClick={runAction(onToggleFollow)}
              >
                {followPlayer ? 'FOLLOW ON' : 'FOLLOW'}
              </button>
            </div>
          </section>
        ) : null}
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
    'linear-gradient(180deg, rgba(37,45,61,.84) 0%, rgba(86,92,108,.78) 100%)',
  border: '1px solid rgba(255,255,255,.20)',
  boxShadow: '0 22px 60px rgba(15,23,42,.24), inset 0 1px 0 rgba(255,255,255,.16)',
  backdropFilter: 'blur(22px) saturate(150%)',
  WebkitBackdropFilter: 'blur(22px) saturate(150%)',
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
  color: '#b8ffd9',
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
  color: 'rgba(255,255,255,.92)',
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.2,
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const chipBase: CSSProperties = {
  minHeight: 28,
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
  background: 'rgba(255,255,255,.14)',
  color: '#ffffff',
}

const chipMuted: CSSProperties = {
  ...chipBase,
  background: 'rgba(255,255,255,.10)',
  color: 'rgba(255,255,255,.88)',
}

const chipInfo: CSSProperties = {
  ...chipBase,
  background: 'rgba(96,165,250,.24)',
  border: '1px solid rgba(96,165,250,.30)',
  color: '#dbeafe',
}

const chipDanger: CSSProperties = {
  ...chipBase,
  background: 'rgba(239,68,68,.20)',
  border: '1px solid rgba(239,68,68,.26)',
  color: '#fecaca',
}

const toolbarRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  marginTop: 2,
}

const toolsButtonBase: CSSProperties = {
  minHeight: 42,
  minWidth: 92,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 18px',
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const toolsButton: CSSProperties = {
  ...toolsButtonBase,
  background: 'rgba(255,255,255,.14)',
  border: '1px solid rgba(255,255,255,.18)',
  color: '#ffffff',
}

const toolsButtonActive: CSSProperties = {
  ...toolsButtonBase,
  background: 'rgba(255,255,255,.20)',
  border: '1px solid rgba(255,255,255,.24)',
  color: '#ffffff',
}

const toolsPanel: CSSProperties = {
  marginTop: 6,
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'linear-gradient(180deg, rgba(18,30,58,.82), rgba(45,58,84,.72))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)',
  padding: 14,
  display: 'grid',
  gap: 12,
}

const toolsHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const toolsTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: '#ffffff',
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const closeButton: CSSProperties = {
  width: 42,
  height: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.12)',
  color: '#ffffff',
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1,
}

const toolsGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const toolButtonBase: CSSProperties = {
  minHeight: 48,
  borderRadius: 18,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '0.06em',
  color: '#ffffff',
}

const toolButton: CSSProperties = {
  ...toolButtonBase,
  background: 'rgba(255,255,255,.12)',
  border: '1px solid rgba(255,255,255,.16)',
}

const toolButtonDanger: CSSProperties = {
  ...toolButtonBase,
  background: 'rgba(127,29,29,.24)',
  border: '1px solid rgba(239,68,68,.22)',
  color: '#fecaca',
}

const toolButtonDangerActive: CSSProperties = {
  ...toolButtonBase,
  background: 'rgba(185,28,28,.34)',
  border: '1px solid rgba(248,113,113,.30)',
  color: '#fee2e2',
}

const toolButtonInfo: CSSProperties = {
  ...toolButtonBase,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.22)',
  color: '#dbeafe',
}

const toolButtonInfoActive: CSSProperties = {
  ...toolButtonBase,
  background: 'rgba(59,130,246,.28)',
  border: '1px solid rgba(96,165,250,.30)',
  color: '#eff6ff',
}

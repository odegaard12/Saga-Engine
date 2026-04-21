import { useState, type CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  gpsState: PlayerGpsStatus
  distanceMeters: number | null
  debugEnabled: boolean
  followPlayer: boolean
  onOpenEntry: () => void
  onToggleDebug: () => void
  onFocusPlayer: () => void
  onFocusNode: () => void
  onToggleFollow: () => void
}

function getGpsDisplay(gpsState: PlayerGpsStatus): string {
  if (gpsState === 'ready') return 'GPS LIVE'
  if (gpsState === 'stale') return 'GPS LAST'
  if (gpsState === 'searching') return 'SEARCHING'
  if (gpsState === 'error') return 'GPS ERROR'
  return 'GPS OFF'
}

function getRangeDisplay(distanceMeters: number | null): string {
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
  onOpenEntry,
  onToggleDebug,
  onFocusPlayer,
  onFocusNode,
  onToggleFollow,
}: PlayerShellProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const [toolsOpen, setToolsOpen] = useState(false)

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const title = payload.display_name || payload.profile?.display_name || payload.user
  const stageTitle = currentStage?.title || 'Awaiting active node'

  return (
    <>
      <style>{shellAnimations}</style>

      <header style={wrap}>
        <section
          style={{
            ...rail,
            width: compact ? '100%' : 'min(100%, 760px)',
            padding: compact ? '14px 14px 12px' : '16px 16px 14px',
            borderRadius: compact ? 26 : 30,
          }}
        >
          <div style={topRow}>
            <div style={eyebrow}>FIELD SESSION</div>
            <div style={modePill}>{mode === 'team' ? 'TEAM' : 'SOLO'}</div>
          </div>

          <div style={{ ...name, fontSize: compact ? 19 : 24 }}>{title}</div>
          <div style={stageName}>{stageTitle}</div>

          <div style={metaRow}>
            <span style={metaPill}>{getGpsDisplay(gpsState)}</span>
            <span style={metaPill}>{getRangeDisplay(distanceMeters)}</span>
            {followPlayer ? <span style={metaPillBlue}>FOLLOW</span> : null}
            {debugEnabled ? <span style={metaPillRed}>DEBUG</span> : null}
          </div>

          <div style={toolsRow}>
            <button
              type="button"
              style={toolsOpen ? toolsButtonActive : toolsButton}
              onClick={() => setToolsOpen((v) => !v)}
            >
              {toolsOpen ? 'CLOSE' : 'TOOLS'}
            </button>
          </div>

          {toolsOpen ? (
            <div style={utilityPanel}>
              <div
                style={{
                  ...utilityGrid,
                  gridTemplateColumns: compact
                    ? 'repeat(3, minmax(0, 1fr))'
                    : 'repeat(5, minmax(0, 1fr))',
                }}
              >
                <button type="button" style={utilityButton} onClick={onOpenEntry}>
                  ← LOGIN
                </button>

                <button
                  type="button"
                  style={debugEnabled ? utilityButtonDangerActive : utilityButtonDanger}
                  onClick={onToggleDebug}
                >
                  {debugEnabled ? 'DEBUG ON' : 'DEBUG'}
                </button>

                <button type="button" style={utilityButton} onClick={onFocusPlayer}>
                  PLAYER
                </button>

                <button type="button" style={utilityButton} onClick={onFocusNode}>
                  NODE
                </button>

                <button
                  type="button"
                  style={followPlayer ? utilityButtonBlue : utilityButton}
                  onClick={onToggleFollow}
                >
                  {followPlayer ? 'FOLLOW' : 'FREE MAP'}
                </button>
              </div>

              {debugEnabled ? (
                <div style={debugHint}>
                  Debug map tap active. Tap on the map to place simulated GPS.
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </header>
    </>
  )
}

const wrap: CSSProperties = {
  pointerEvents: 'none',
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
}

const rail: CSSProperties = {
  margin: '0 auto',
  display: 'grid',
  gap: 10,
  border: '1px solid rgba(255,255,255,.14)',
  background:
    'linear-gradient(180deg, rgba(13,23,42,.72), rgba(20,32,58,.60))',
  boxShadow:
    '0 24px 60px rgba(2,6,23,.28), inset 0 1px 0 rgba(255,255,255,.10)',
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
  pointerEvents: 'auto',
  boxSizing: 'border-box',
  animation: 'sagaShellIn 240ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
}

const eyebrow: CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const modePill: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.10)',
  border: '1px solid rgba(255,255,255,.14)',
  color: '#f8fafc',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
}

const name: CSSProperties = {
  color: '#ffffff',
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.04em',
  textShadow: '0 1px 0 rgba(0,0,0,.12)',
}

const stageName: CSSProperties = {
  color: 'rgba(226,232,240,.92)',
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.2,
}

const metaRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const pillBase: CSSProperties = {
  minHeight: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 11px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
  border: '1px solid rgba(255,255,255,.12)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
}

const metaPill: CSSProperties = {
  ...pillBase,
  background: 'rgba(255,255,255,.09)',
  color: '#e2e8f0',
}

const metaPillBlue: CSSProperties = {
  ...pillBase,
  background: 'rgba(59,130,246,.22)',
  color: '#dbeafe',
  border: '1px solid rgba(96,165,250,.24)',
}

const metaPillRed: CSSProperties = {
  ...pillBase,
  background: 'rgba(220,38,38,.18)',
  color: '#fecaca',
  border: '1px solid rgba(248,113,113,.24)',
}

const toolsRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
}

const toolsButton: CSSProperties = {
  minHeight: 36,
  minWidth: 90,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.10em',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
}

const toolsButtonActive: CSSProperties = {
  ...toolsButton,
  background: 'rgba(255,255,255,.14)',
}

const utilityPanel: CSSProperties = {
  display: 'grid',
  gap: 8,
  paddingTop: 2,
}

const utilityGrid: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const utilityButton: CSSProperties = {
  minHeight: 40,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
}

const utilityButtonDanger: CSSProperties = {
  ...utilityButton,
  color: '#d1d5db',
}

const utilityButtonDangerActive: CSSProperties = {
  ...utilityButton,
  background: 'linear-gradient(180deg, rgba(220,38,38,.28), rgba(127,29,29,.24))',
  border: '1px solid rgba(248,113,113,.26)',
  color: '#fee2e2',
  boxShadow: '0 10px 24px rgba(127,29,29,.16)',
}

const utilityButtonBlue: CSSProperties = {
  ...utilityButton,
  background: 'linear-gradient(180deg, rgba(59,130,246,.24), rgba(37,99,235,.20))',
  border: '1px solid rgba(96,165,250,.24)',
  color: '#dbeafe',
}

const debugHint: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(248,113,113,.18)',
  background: 'rgba(127,29,29,.16)',
  color: '#fee2e2',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.4,
  padding: '10px 12px',
}

const shellAnimations = `
@keyframes sagaShellIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`

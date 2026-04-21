import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
}

export function PlayerShell({
  payload,
  currentStage,
}: PlayerShellProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const identity = payload.display_name || payload.profile?.display_name || payload.user
  const nodeLabel = payload.finished
    ? 'Mission complete'
    : currentStage?.title || 'Awaiting node'

  return (
    <header style={wrap}>
      <div
        style={{
          ...panel,
          width: compact ? 'calc(100% - 20px)' : 'min(100%, 760px)',
          padding: compact ? '10px 12px' : '12px 14px',
        }}
      >
        <div style={row}>
          <div style={metaBlock}>
            <div style={eyebrow}>{mode === 'team' ? 'TEAM SESSION' : 'FIELD SESSION'}</div>
            <div style={identityText}>{identity}</div>
          </div>

          <div style={modePill}>{mode === 'team' ? 'TEAM' : 'SOLO'}</div>
        </div>

        <div style={nodeLabelText}>{nodeLabel}</div>
      </div>
    </header>
  )
}

const wrap: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const panel: CSSProperties = {
  pointerEvents: 'auto',
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(7,17,28,.88), rgba(7,17,28,.76))',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 18px 46px rgba(0,0,0,.28)',
  color: '#f8fafc',
  display: 'grid',
  gap: 8,
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const metaBlock: CSSProperties = {
  minWidth: 0,
}

const eyebrow: CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const identityText: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 18,
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
}

const nodeLabelText: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const modePill: CSSProperties = {
  minHeight: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.06)',
  color: '#e2e8f0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  whiteSpace: 'nowrap',
}

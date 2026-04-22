import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  teamOpen?: boolean
  teamCount?: number
  teamLiveCount?: number
  onOpenTeam?: () => void
}

function getProgress(payload: PlayerGamePayload) {
  const stages = Array.isArray(payload.stages) ? payload.stages : []
  const total = stages.length

  if (total === 0) {
    return { total: 0, current: 0, activeIndex: -1 }
  }

  if (payload.finished) {
    return { total, current: total, activeIndex: total - 1 }
  }

  const activeIndex =
    typeof payload.level === 'number'
      ? Math.max(0, Math.min(payload.level, total - 1))
      : 0

  return {
    total,
    current: activeIndex + 1,
    activeIndex,
  }
}

export function PlayerShell({
  payload,
  currentStage,
  teamOpen = false,
  teamCount = 0,
  teamLiveCount = 0,
  onOpenTeam,
}: PlayerShellProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const playerName = payload.display_name || payload.profile?.display_name || payload.user
  const stageName = currentStage?.title || (payload.finished ? 'Mission complete' : 'Awaiting node')
  const progress = getProgress(payload)

  const nodes = Array.from({ length: progress.total })

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

          <div style={pillRow}>
            <div style={soloPill}>{mode === 'team' ? 'TEAM' : 'SOLO'}</div>

            <button
              type="button"
              style={teamOpen ? teamButtonActive : teamButton}
              onClick={onOpenTeam}
            >
              <span>PLAYERS</span>
              <span style={teamCountPill}>{teamCount}</span>
              {teamLiveCount > 0 ? <span style={teamLiveDot} /> : null}
            </button>
          </div>
        </div>

        <div style={{ ...playerTitle, fontSize: compact ? 17 : 19 }}>{playerName}</div>
        <div style={stageTitle}>{stageName}</div>

        <div style={progressRow}>
          <div style={routeWrap}>
            {nodes.length > 0 ? (
              nodes.map((_, index) => {
                const nodeDone = payload.finished || index < progress.current - 1
                const nodeActive = index === progress.activeIndex && !payload.finished
                const connectorDone = payload.finished || index < progress.current - 1

                return (
                  <div
                    key={index}
                    style={{
                      ...routeSegment,
                      flex: index === nodes.length - 1 ? '0 0 auto' : 1,
                    }}
                  >
                    <span
                      style={{
                        ...routeNode,
                        ...(nodeActive ? routeNodeActive : nodeDone ? routeNodeDone : routeNodeIdle),
                      }}
                    />

                    {index < nodes.length - 1 ? (
                      <span
                        style={{
                          ...routeConnector,
                          ...(connectorDone ? routeConnectorDone : routeConnectorIdle),
                        }}
                      />
                    ) : null}
                  </div>
                )
              })
            ) : (
              <span style={progressEmpty}>No route</span>
            )}
          </div>

          <div style={countPill}>
            {progress.total > 0 ? `${progress.current}/${progress.total}` : '0/0'}
          </div>
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

const pillRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
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

const teamButton: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(15,23,42,.26)',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
}

const teamButtonActive: CSSProperties = {
  ...teamButton,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.20)',
  color: '#dbeafe',
}

const teamCountPill: CSSProperties = {
  minWidth: 18,
  height: 18,
  padding: '0 6px',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,.16)',
  color: '#ffffff',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.04em',
}

const teamLiveDot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: '#22c55e',
  boxShadow: '0 0 0 3px rgba(34,197,94,.18)',
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

const progressRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginTop: 4,
}

const routeWrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flex: 1,
  minWidth: 0,
}

const routeSegment: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '10px minmax(10px, 1fr)',
  alignItems: 'center',
  gap: 6,
  minWidth: 10,
}

const routeNode: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.18)',
  flex: '0 0 auto',
}

const routeNodeIdle: CSSProperties = {
  background: 'rgba(255,255,255,.18)',
}

const routeNodeDone: CSSProperties = {
  background: 'rgba(34,197,94,.88)',
  border: '1px solid rgba(134,239,172,.55)',
  boxShadow: '0 0 0 3px rgba(34,197,94,.12)',
}

const routeNodeActive: CSSProperties = {
  background: '#ffffff',
  border: '1px solid rgba(255,255,255,.92)',
  boxShadow: '0 0 0 4px rgba(255,255,255,.12)',
}

const routeConnector: CSSProperties = {
  height: 3,
  borderRadius: 999,
  width: '100%',
}

const routeConnectorIdle: CSSProperties = {
  background: 'rgba(255,255,255,.16)',
}

const routeConnectorDone: CSSProperties = {
  background: 'linear-gradient(90deg, rgba(34,197,94,.88), rgba(134,239,172,.64))',
}

const countPill: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.12)',
  border: '1px solid rgba(255,255,255,.16)',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
}

const progressEmpty: CSSProperties = {
  color: 'rgba(255,255,255,.72)',
  fontSize: 11,
  fontWeight: 800,
}

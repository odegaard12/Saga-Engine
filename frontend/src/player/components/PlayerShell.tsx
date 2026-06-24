import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerStage } from '../../types/player'
import { useGyroParallax } from '../hooks/useGyroParallax'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
  teamOpen?: boolean
  teamCount?: number
  teamLiveCount?: number
  gpsState?: string
  onOpenTeam?: () => void
}

function getGpsShellLabel(gpsState?: string): string {
  const value = String(gpsState || '').toLowerCase()
  if (value === 'ready') return 'GPS activo'
  if (value === 'searching') return 'Buscando GPS'
  if (value === 'stale') return 'GPS reciente'
  if (value === 'error') return 'Error GPS'
  return 'Sin GPS'
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
  gpsState,
  onOpenTeam,
}: PlayerShellProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const playerName = payload.display_name || payload.profile?.display_name || payload.user
  const stageName = currentStage?.title || (payload.finished ? 'Misión completada' : 'Esperando nodo')
  const progress = getProgress(payload)
  const gpsLabel = getGpsShellLabel(gpsState)
  const { transform } = useGyroParallax(8)

  const nodes = Array.from({ length: progress.total })

  return (
    <div style={wrap}>
      <section
        style={{
          ...card,
          width: compact ? '100%' : 'min(100%, 760px)',
          padding: compact ? 12 : 16,
          borderRadius: compact ? 22 : 28,
          transform,
          transition: 'transform 0.1s ease-out',
        }}
      >
        <div style={topRow}>
          <div style={eyebrow}>{playerName}</div>

          {mode === 'team' ? (
            <div style={pillRow}>
              <div style={soloPill}>EQUIPO</div>
            </div>
          ) : null}
        </div>

        <div style={{ ...playerTitle, fontSize: compact ? 17 : 19 }}>{stageName}</div>

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
  gap: 8,
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
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  maxWidth: 150,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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
  letterSpacing: '0.08em',
}

const playerTitle: CSSProperties = {
  fontWeight: 900,
  lineHeight: 1.05,
  letterSpacing: '-0.03em',
  color: '#ffffff',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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

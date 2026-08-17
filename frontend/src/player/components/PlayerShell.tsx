import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
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
    typeof payload.level === 'number' ? Math.max(0, Math.min(payload.level, total - 1)) : 0

  return {
    total,
    current: activeIndex + 1,
    activeIndex,
  }
}

export function PlayerShell({ payload, currentStage }: PlayerShellProps) {
  const compact = typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const playerName = payload.display_name || payload.profile?.display_name || payload.user
  const stageName =
    currentStage?.title || (payload.finished ? 'Misión completada' : 'Esperando nodo')
  const progress = getProgress(payload)

  const totalMs = payload.live_status?.total_time_ms || 0
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  const nodes = Array.from({ length: progress.total })

  return (
    <div style={wrap}>
      <section
        // La marca la usa el reloj de los nodos de pegatina para colgarse justo
        // debajo: esta barra no tiene alto fijo -cambia con el area segura del
        // movil-, asi que hay que medirla en vivo.
        data-saga-player-shell="top"
        style={{
          ...card,
          width: compact ? '100%' : 'min(100%, 760px)',
          padding: compact ? 12 : 16,
          /**
           * El radio, del tema, con el de siempre como respaldo.
           *
           * Aqui habia un 22/28 clavado, y un numero en linea gana a la regla
           * del tema: la barra seguia redonda en un tema de esquinas duras por
           * mucho que el CSS dijese otra cosa. Es el mismo empate que ya dejo
           * muerta la regla del alfiler del mapa.
           *
           * El respaldo entre parentesis es el valor exacto de antes, asi que
           * un tema que no declare `--theme-radius-shell` -cristal- se ve
           * igual que siempre.
           */
          borderRadius: `var(--theme-radius-shell, ${compact ? 22 : 28}px)`,
        }}
      >
        <div style={topRow}>
          <div style={eyebrow}>{playerName}</div>

          <div style={pillRow}>
            <div style={{...soloPill, borderColor: 'rgba(var(--theme-info), 0.4)', color: 'rgb(var(--theme-info-soft))', background: 'rgba(var(--theme-info-mid), 0.15)' }}>
              ⏱️ {timeDisplay}
            </div>
            {mode === 'team' ? (
              <div style={soloPill}>EQUIPO</div>
            ) : null}
          </div>
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
                        ...(nodeActive
                          ? routeNodeActive
                          : nodeDone
                            ? routeNodeDone
                            : routeNodeIdle),
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
              <span style={progressEmpty}>Sin ruta</span>
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
  background: 'linear-gradient(180deg, rgba(var(--theme-shell-a), calc(.72 * var(--theme-solid))) 0%, rgba(var(--theme-shell-b), calc(.64 * var(--theme-solid))) 100%)',
  border: '1px solid rgba(255,255,255,.22)',
  boxShadow: '0 20px 48px rgba(var(--theme-ink), .18), inset 0 1px 0 rgba(255,255,255,.12)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
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
  color: 'rgb(var(--theme-ok-soft))',
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
  borderRadius: 'var(--theme-radius-pill)',
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
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(255,255,255,.18)',
  flex: '0 0 auto',
}

const routeNodeIdle: CSSProperties = {
  background: 'rgba(255,255,255,.18)',
}

const routeNodeDone: CSSProperties = {
  background: 'rgba(var(--theme-done), .88)',
  border: '1px solid rgba(var(--theme-done-soft), .55)',
  boxShadow: '0 0 0 3px rgba(var(--theme-done), .12)',
}

const routeNodeActive: CSSProperties = {
  background: '#ffffff',
  border: '1px solid rgba(255,255,255,.92)',
  boxShadow: '0 0 0 4px rgba(255,255,255,.12)',
}

const routeConnector: CSSProperties = {
  height: 3,
  borderRadius: 'var(--theme-radius-pill)',
  width: '100%',
}

const routeConnectorIdle: CSSProperties = {
  background: 'rgba(255,255,255,.16)',
}

const routeConnectorDone: CSSProperties = {
  background: 'linear-gradient(90deg, rgba(var(--theme-done), .88), rgba(var(--theme-done-soft), .64))',
}

const countPill: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(255,255,255,.12)',
  border: '1px solid rgba(255,255,255,.16)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.05em',
}

const progressEmpty: CSSProperties = {
  color: 'rgba(255,255,255,.72)',
  fontSize: 11,
  fontWeight: 800,
}

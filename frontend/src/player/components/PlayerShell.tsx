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
    typeof payload.level === 'number'
      ? Math.max(0, Math.min(payload.level, total - 1))
      : 0

  return {
    total,
    current: activeIndex + 1,
    activeIndex,
  }
}

export function PlayerShell({ payload, currentStage }: PlayerShellProps) {
  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const playerName = payload.display_name || payload.profile?.display_name || payload.user
  const stageName = currentStage?.title || (payload.finished ? 'Mission complete' : 'Awaiting node')
  const progress = getProgress(payload)

  const dots = Array.from({ length: progress.total })

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

        <div style={progressRow}>
          <div style={dotsWrap}>
            {dots.length > 0 ? (
              dots.map((_, index) => {
                const done = index < progress.current - (payload.finished ? 0 : 1)
                const active = index === progress.activeIndex && !payload.finished
                const completed = payload.finished || done

                return (
                  <span
                    key={index}
                    style={{
                      ...dot,
                      ...(active ? dotActive : completed ? dotDone : dotIdle),
                    }}
                  />
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

const progressRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginTop: 2,
}

const dotsWrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
}

const dot: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  flex: '0 0 auto',
  border: '1px solid rgba(255,255,255,.18)',
}

const dotIdle: CSSProperties = {
  background: 'rgba(255,255,255,.20)',
}

const dotDone: CSSProperties = {
  background: 'rgba(34,197,94,.88)',
  border: '1px solid rgba(134,239,172,.55)',
  boxShadow: '0 0 0 3px rgba(34,197,94,.14)',
}

const dotActive: CSSProperties = {
  background: '#ffffff',
  border: '1px solid rgba(255,255,255,.92)',
  boxShadow: '0 0 0 4px rgba(255,255,255,.12)',
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

import { useState, useEffect, type CSSProperties } from 'react'
import type { TeamProfileLiveStatus } from '../../types/player'
import {
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'
import { SwipeableSheet } from './SwipeableSheet'

interface RankingSheetProps {
  open: boolean
  players: TeamProfileLiveStatus[]
  onClose: () => void
}

function getPresenceConfig(value?: string) {
  const p = String(value || 'offline').toLowerCase()
  if (p === 'live') return { label: 'EN LÍNEA', color: '#22d3ee', glow: 'rgba(34,211,238,0.35)', dot: '#22c55e' }
  if (p === 'stale') return { label: 'RECIENTE', color: '#fbbf24', glow: 'rgba(251,191,36,0.25)', dot: '#f59e0b' }
  return { label: 'OFFLINE', color: '#64748b', glow: 'rgba(100,116,139,0.1)', dot: '#475569' }
}

function readNumericStat(player: TeamProfileLiveStatus, keys: string[]) {
  for (const key of keys) {
    const value = (player as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function readTimestamp(player: TeamProfileLiveStatus, keys: string[]) {
  for (const key of keys) {
    const value = (player as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return Number.MAX_SAFE_INTEGER
}

export function RankingSheet({ open, players, onClose }: RankingSheetProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [open])

  if (!open) return null

  const sorted = [...players].sort((a, b) => {
    const pointsA = readNumericStat(a, ['score', 'points', 'total_points'])
    const pointsB = readNumericStat(b, ['score', 'points', 'total_points'])
    if (pointsA !== pointsB) return pointsB - pointsA

    const lvlA = a.finished ? 999 : (a.level || 0)
    const lvlB = b.finished ? 999 : (b.level || 0)
    if (lvlA !== lvlB) return lvlB - lvlA

    const timeA = a.total_time_ms || 0
    const timeB = b.total_time_ms || 0
    if (timeA !== timeB && timeA > 0 && timeB > 0) return timeA - timeB

    const dateA = readTimestamp(a, ['finished_at', 'completed_at', 'updated_at', 'last_seen'])
    const dateB = readTimestamp(b, ['finished_at', 'completed_at', 'updated_at', 'last_seen'])
    if (dateA !== dateB) return dateA - dateB

    return a.display_name.localeCompare(b.display_name)
  })

  const maxTime = Math.max(1, ...sorted.map((p) => p.total_time_ms || 0))
  const liveCount = sorted.filter((p) => p.presence === 'live').length

  return (
    <SwipeableSheet
      open={open}
      onClose={onClose}
      sheetStyle={{
        background: 'linear-gradient(180deg, rgba(100,116,139,.46), rgba(71,85,105,.34))',
        border: '1px solid rgba(255,255,255,.22)',
        boxShadow: '0 22px 60px rgba(15,23,42,.18)',
        backdropFilter: 'blur(24px) saturate(1.12)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.12)',
      }}
    >
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                display: 'inline-block',
                background: liveCount > 0 ? '#22c55e' : '#475569',
                boxShadow: liveCount > 0 ? '0 0 10px #22c55e' : 'none',
                flexShrink: 0,
              }}
            />
            TABLA DE TIEMPOS
          </div>
          <div style={title}>🏆 CLASIFICACIÓN</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button type="button" aria-label="Cerrar" style={closeBtn} onClick={onClose}>
            ×
          </button>
          <div style={counterBadge}>
            <span style={{ color: '#22c55e', fontWeight: 900 }}>{liveCount}</span>
            <span style={{ color: '#94a3b8' }}> / {sorted.length} jug.</span>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={emptyState}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: 16 }}>Sin jugadores activos</div>
          <div style={{ color: '#64748b', marginTop: 4, fontSize: 13 }}>No hay datos de clasificación disponibles.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {sorted.map((player, idx) => {
            const pres = getPresenceConfig(player.presence)
            const isLive = player.presence === 'live'
            const avatarSrc = getPlayerAvatarUrl(player) || '/default-avatar.png'

            const currentMs = player.total_time_ms || 0
            const totalSecs = Math.floor(currentMs / 1000)
            const hrs = Math.floor(totalSecs / 3600)
            const mins = Math.floor((totalSecs % 3600) / 60)
            const secs = totalSecs % 60
            const timeStr =
              hrs > 0
                ? `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
                : `${mins}m ${secs.toString().padStart(2, '0')}s`

            const finished = player.finished
            const levelNum = player.level || 0
            const levelStr = finished ? '¡FINALIZADO!' : `Nodo ${levelNum}`
            const color = getPlayerColor(player)

            // Calculate progress bar percentage relative to maxTime
            const timePercent = Math.min(100, Math.max(10, Math.round((currentMs / maxTime) * 100)))
            const isFirst = idx === 0

            return (
              <article
                key={player.user}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '12px 14px',
                  borderRadius: 18,
                  border: '1px solid',
                  borderColor: isFirst
                    ? 'rgba(251,191,36,0.4)'
                    : isLive
                    ? 'rgba(34,211,238,0.25)'
                    : 'rgba(255,255,255,0.08)',
                  background: isFirst
                    ? 'linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(15,23,42,0.4) 100%)'
                    : isLive
                    ? 'rgba(34,211,238,0.05)'
                    : 'rgba(255,255,255,0.03)',
                  boxShadow: isFirst ? '0 4px 16px rgba(251,191,36,0.15)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Position Badge */}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 900,
                      color: isFirst ? '#fbbf24' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#cd7f32' : '#64748b',
                      width: 24,
                      textAlign: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isFirst ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                  </div>

                  {/* Avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: color,
                        overflow: 'hidden',
                        boxShadow: isLive ? `0 0 0 2px ${pres.color}, 0 0 10px ${pres.glow}` : '0 0 0 1px rgba(255,255,255,0.1)',
                      }}
                    >
                      <img
                        src={avatarSrc}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(event) => {
                          const target = event.currentTarget
                          if (target.src.endsWith('/default-avatar.png')) return
                          target.src = '/default-avatar.png'
                        }}
                      />
                    </div>
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: pres.dot,
                        border: '2px solid rgba(17,24,39,0.95)',
                        boxShadow: isLive ? `0 0 6px ${pres.dot}` : 'none',
                      }}
                    />
                  </div>

                  {/* Player Name and Node info */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span
                        style={{
                          color: '#f8fafc',
                          fontSize: 15,
                          fontWeight: 800,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {player.display_name || player.user}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: finished ? '#10b981' : '#38bdf8',
                          background: finished ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.12)',
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: `1px solid ${finished ? 'rgba(16,185,129,0.3)' : 'rgba(56,189,248,0.25)'}`,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {levelStr}
                      </span>
                    </div>

                    {/* Live Timer display */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
                        ⏱️ {timeStr}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: pres.color }}>{pres.label}</span>
                    </div>
                  </div>
                </div>

                {/* Relative Visual Graph / Bar Chart */}
                <div style={{ width: '100%', marginTop: 2 }}>
                  <div
                    style={{
                      width: '100%',
                      height: 7,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.06)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${timePercent}%`,
                        borderRadius: 999,
                        background: finished
                          ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                          : isFirst
                          ? 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'
                          : 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
                        boxShadow: '0 0 10px rgba(56,189,248,0.4)',
                        transition: 'width 0.8s ease-out',
                      }}
                    />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </SwipeableSheet>
  )
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 12,
}
const eyebrow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  marginBottom: 4,
}
const title: CSSProperties = {
  color: '#f8fafc',
  fontSize: 26,
  fontWeight: 900,
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
}
const closeBtn: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.08)',
  color: '#cbd5e1',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
const counterBadge: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
}
const emptyState: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '36px 16px',
  textAlign: 'center',
}

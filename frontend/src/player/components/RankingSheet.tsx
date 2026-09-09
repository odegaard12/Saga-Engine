import { useState, useEffect, type CSSProperties } from 'react'
import type { TeamProfileLiveStatus } from '../../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'
import { SwipeableSheet } from './SwipeableSheet'
import { leerMarcaDeTiempo } from '../../shared/fechas'

interface RankingSheetProps {
  open: boolean
  players: TeamProfileLiveStatus[]
  onClose: () => void
}

// "EN LÍNEA" en verde fijo, no en --theme-done: ese token es la piel de
// marca de cada tema, y en fuego --theme-done es naranja-terracota, no
// verde. "Este jugador está conectado AHORA MISMO" es una señal semántica
// -verde universal de "activo/bien"-, no una decoración de marca; ponerla
// en el color de marca del tema hacía que "conectado" se leyera como aviso,
// no como buena señal. RECIENTE/OFFLINE sí pueden variar con el tema, son
// estados neutros, no una señal de "todo va bien".
const VERDE_EN_LINEA = '#22c55e'

function getPresenceConfig(value?: string) {
  const p = String(value || 'offline').toLowerCase()
  if (p === 'live') return { label: 'EN LÍNEA', color: '#22d3ee', glow: 'rgba(34,211,238,0.35)', dot: VERDE_EN_LINEA }
  if (p === 'stale') return { label: 'RECIENTE', color: '#fbbf24', glow: 'rgba(251,191,36,0.25)', dot: '#f59e0b' }
  return { label: 'OFFLINE', color: 'rgb(var(--theme-sheen-a))', glow: 'rgba(var(--theme-sheen-a), calc(0.1 * var(--theme-solid)))', dot: 'rgb(var(--theme-sheen-b))' }
}

function readNumericStat(player: TeamProfileLiveStatus, keys: string[]) {
  const raw = player as unknown as Record<string, unknown>
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function readTimestamp(player: TeamProfileLiveStatus, keys: string[]) {
  const raw = player as unknown as Record<string, unknown>
  for (const key of keys) {
    const value = raw[key]
    const marca = leerMarcaDeTiempo(value)
    if (marca !== null) return marca
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

  const liveCount = sorted.filter((p) => p.presence === 'live').length

  return (
    <SwipeableSheet
      open={open}
      onClose={onClose}
      sheetStyle={{
        background: 'linear-gradient(180deg, rgba(var(--theme-sheen-a), calc(.46 * var(--theme-solid))), rgba(var(--theme-sheen-b), calc(.34 * var(--theme-solid))))',
        border: '1px solid rgba(255,255,255,.22)',
        boxShadow: '0 22px 60px rgba(var(--theme-ink), .18)',
        backdropFilter: 'var(--theme-blur)',
        WebkitBackdropFilter: 'var(--theme-blur)',
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
                background: liveCount > 0 ? VERDE_EN_LINEA : 'rgb(var(--theme-sheen-b))',
                boxShadow: liveCount > 0 ? `0 0 10px ${VERDE_EN_LINEA}` : 'none',
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
            <span style={{ color: VERDE_EN_LINEA, fontWeight: 900 }}>{liveCount}</span>
            <span style={{ color: 'rgb(var(--theme-line))' }}> / {sorted.length} jug.</span>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={emptyState}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: 16 }}>Sin jugadores activos</div>
          <div style={{ color: 'rgb(var(--theme-sheen-a))', marginTop: 4, fontSize: 13 }}>No hay datos de clasificación disponibles.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {sorted.map((player, idx) => {
            const pres = getPresenceConfig(player.presence)
            const isLive = player.presence === 'live'
            const avatarSrc = getPlayerAvatarUrl(player)

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

            const isFirst = idx === 0

            // El primero destaca por TAMAÑO -avatar mas grande, nombre mas
            // grande-, no por una caja de color detras. Maqueta aprobada
            // tras varias rondas: "mas fluido, mas como el login" -mismo
            // idioma que las filas del login, sin tarjeta ni degradado.
            const avatarSize = isFirst ? 46 : idx === 1 || idx === 2 ? 38 : 32
            const nameSize = isFirst ? 16 : idx === 1 || idx === 2 ? 14 : 13

            return (
              <article
                key={player.user}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isFirst ? '11px 0' : '9px 0',
                  borderBottom: '0.5px solid rgba(255,255,255,.12)',
                }}
              >
                <span
                  style={{
                    fontSize: isFirst ? 15 : 12,
                    fontWeight: 900,
                    color: isFirst
                      ? undefined
                      : idx === 1 || idx === 2
                        ? 'rgba(255,255,255,.55)'
                        : 'rgba(255,255,255,.35)',
                    width: 18,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isFirst ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </span>

                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div
                    style={{
                      width: avatarSize,
                      height: avatarSize,
                      // La CARA va redonda en los dos temas: ver
                      // --theme-radius-avatar (--theme-radius-pill es 3px
                      // en fuego a propósito, para todo lo que no sea cara).
                      borderRadius: 'var(--theme-radius-avatar)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: color,
                      overflow: 'hidden',
                    }}
                  >
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        // Sin foto se caía a /default-avatar.png, que NO existe
                        // (404): todos los jugadores sin retrato salían con una
                        // imagen rota. Las iniciales sobre su color siempre están.
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: avatarSize * 0.36, fontWeight: 900, color: '#0b1220' }}>
                        {getPlayerAvatarInitials(player)}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      right: -1,
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: pres.dot,
                      border: '2px solid var(--theme-bg)',
                    }}
                  />
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: '#f8fafc', fontSize: nameSize, fontWeight: isFirst ? 900 : 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player.display_name || player.user}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
                    {levelStr}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: isFirst ? 13 : 11, fontWeight: 800, color: finished ? 'var(--theme-primary)' : 'rgba(255,255,255,.7)' }}>
                    {timeStr}
                  </div>
                  {isLive ? (
                    <div style={{ fontSize: 9, fontWeight: 700, color: pres.color, marginTop: 2 }}>{pres.label}</div>
                  ) : null}
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
  color: 'rgb(var(--theme-line))',
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
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.08)',
  color: 'rgb(var(--theme-line-soft))',
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
  borderRadius: 'var(--theme-radius-pill)',
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

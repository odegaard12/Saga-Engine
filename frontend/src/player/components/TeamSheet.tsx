import type { CSSProperties } from 'react'
import type { TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarInitials, getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'

interface TeamSheetProps {
  open: boolean
  players: TeamProfileLiveStatus[]
  currentPosition?: { lat: number; lon: number } | null
  onClose: () => void
}

function getDistanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const earthRadius = 6371000

  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon

  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function getPresenceLabel(value?: string) {
  const presence = String(value || 'offline').toLowerCase()
  if (presence === 'live') return 'EN LÍNEA'
  if (presence === 'stale') return 'RECIENTE'
  return 'SIN CONEXIÓN'
}

function getPresenceStyle(value?: string): CSSProperties {
  const presence = String(value || 'offline').toLowerCase()
  if (presence === 'live') {
    return {
      background: 'rgba(34,197,94,.16)',
      border: '1px solid rgba(74,222,128,.20)',
      color: '#dcfce7',
    }
  }
  if (presence === 'stale') {
    return {
      background: 'rgba(245,158,11,.16)',
      border: '1px solid rgba(251,191,36,.20)',
      color: '#fef3c7',
    }
  }
  return {
    background: 'rgba(148,163,184,.16)',
    border: '1px solid rgba(203,213,225,.18)',
    color: '#e2e8f0',
  }
}

function formatDistance(
  currentPosition: { lat: number; lon: number } | null | undefined,
  player: TeamProfileLiveStatus
) {
  if (!currentPosition) return null
  if (typeof player.lat !== 'number' || typeof player.lon !== 'number') return null
  return `${Math.round(getDistanceMeters(currentPosition, { lat: player.lat, lon: player.lon }))} m`
}

export function TeamSheet({ open, players, currentPosition, onClose }: TeamSheetProps) {
  if (!open) return null

  const sorted = [...players].sort((a, b) => {
    const rank = (value?: string) => {
      const presence = String(value || 'offline').toLowerCase()
      if (presence === 'live') return 0
      if (presence === 'stale') return 1
      return 2
    }
    return rank(a.presence) - rank(b.presence) || a.display_name.localeCompare(b.display_name)
  })

  return (
    <div style={overlay}>
      <div style={backdrop} onClick={onClose} />

      <aside
        style={sheet}
        aria-modal="true"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div style={header}>
          <div>
            <div style={eyebrow}>EQUIPO</div>
            <div style={title}>Jugadores</div>
          </div>

          <button
            type="button"
            aria-label="Cerrar jugadores"
            style={closeButton}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }}
          >
            ×
          </button>
        </div>

        {sorted.length === 0 ? (
          <div style={emptyState}>Todavía no hay otros jugadores disponibles.</div>
        ) : (
          <div style={list}>
            {sorted.map((player) => {
              const distance = formatDistance(currentPosition, player)
              const gps = String(player.gps_status || 'unknown').toUpperCase()

              return (
                <article key={player.user} style={card}>
                  <div
                    style={{
                      ...avatar,
                      background: getPlayerColor(player),
                      border: '1px solid rgba(255,255,255,.20)',
                      overflow: 'hidden',
                    }}
                  >
                    {getPlayerAvatarUrl(player) ? (
                      <img src={getPlayerAvatarUrl(player)} alt="" style={avatarImage} />
                    ) : (
                      getPlayerAvatarInitials(player)
                    )}
                  </div>

                  <div style={content}>
                    <div style={rowTop}>
                      <div style={name}>{player.display_name || player.user}</div>
                      <span style={{ ...presencePill, ...getPresenceStyle(player.presence) }}>
                        {getPresenceLabel(player.presence)}
                      </span>
                    </div>

                    <div style={metaRow}>
                      <span style={metaChip}>{gps}</span>
                      {distance ? <span style={metaChip}>{distance}</span> : null}
                      {player.debug_enabled ? <span style={metaChipWarn}>DEBUG</span> : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </aside>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4100,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
}

const backdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(2,6,23,.34)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

const sheet: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 'min(100%, 520px)',
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.14)',
  background:
    'linear-gradient(180deg, rgba(13,23,42,.88), rgba(20,32,58,.80))',
  boxShadow:
    '0 26px 60px rgba(2,6,23,.32), inset 0 1px 0 rgba(255,255,255,.08)',
  padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  display: 'grid',
  gap: 14,
  color: '#f8fafc',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const eyebrow: CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  color: '#ffffff',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
  marginTop: 6,
}

const closeButton: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const emptyState: CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  padding: 16,
  color: 'rgba(226,232,240,.82)',
  fontSize: 13,
  lineHeight: 1.5,
}

const list: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const card: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '44px minmax(0, 1fr)',
  gap: 12,
  alignItems: 'center',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  padding: 12,
}

const avatar: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(59,130,246,.18)',
  border: '1px solid rgba(96,165,250,.18)',
  color: '#dbeafe',
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '0.06em',
}

const avatarImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
}

const content: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 8,
}

const rowTop: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
}

const name: CSSProperties = {
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 900,
  lineHeight: 1.1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const presencePill: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const metaRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const metaChip: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.08)',
  color: 'rgba(226,232,240,.88)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.08em',
}

const metaChipWarn: CSSProperties = {
  ...metaChip,
  background: 'rgba(127,29,29,.24)',
  border: '1px solid rgba(248,113,113,.28)',
  color: '#fecaca',
}

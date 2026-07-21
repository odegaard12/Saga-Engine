import type { CSSProperties } from 'react'
import type { TeamProfileLiveStatus } from '../../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'
import { SwipeableSheet } from './SwipeableSheet'

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
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function getPresenceConfig(value?: string) {
  const p = String(value || 'offline').toLowerCase()
  if (p === 'live') return { label: 'EN LÍNEA', color: '#22d3ee', glow: 'rgba(34,211,238,0.35)', dot: '#22c55e' }
  if (p === 'stale') return { label: 'RECIENTE', color: '#fbbf24', glow: 'rgba(251,191,36,0.25)', dot: '#f59e0b' }
  return { label: 'SIN SEÑAL', color: '#64748b', glow: 'rgba(100,116,139,0.1)', dot: '#475569' }
}

function formatDistance(pos: { lat: number; lon: number } | null | undefined, player: TeamProfileLiveStatus) {
  if (!pos) return null
  if (typeof player.lat !== 'number' || typeof player.lon !== 'number') return null
  const dist = Math.round(getDistanceMeters(pos, { lat: player.lat, lon: player.lon }))
  return dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`
}

export function TeamSheet({ open, players, currentPosition, onClose }: TeamSheetProps) {
  if (!open) return null

  const sorted = [...players].sort((a, b) => {
    const rank = (v?: string) => { const p = String(v||'offline').toLowerCase(); return p==='live'?0:p==='stale'?1:2 }
    return rank(a.presence) - rank(b.presence) || a.display_name.localeCompare(b.display_name)
  })

  const liveCount = sorted.filter(p => p.presence === 'live').length

  return (
    <SwipeableSheet open={open} onClose={onClose} sheetStyle={{
      background: 'linear-gradient(180deg, rgba(100,116,139,.52), rgba(71,85,105,.42))',
      border: '1px solid rgba(255,255,255,.22)',
      boxShadow: '0 22px 60px rgba(15,23,42,.18)',
      backdropFilter: 'blur(24px) saturate(1.12)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.12)',
    }}>
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>
            <span style={{ width:7, height:7, borderRadius:'50%', display:'inline-block', background: liveCount>0?'#22c55e':'#475569', boxShadow: liveCount>0?'0 0 6px #22c55e':'none', flexShrink:0 }} />
            CONTROL DE EQUIPO
          </div>
          <div style={title}>Jugadores</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
          <button type="button" aria-label="Cerrar" style={closeBtn} onClick={onClose}>×</button>
          <div style={counterBadge}>
            <span style={{ color:'#22c55e', fontWeight:900 }}>{liveCount}</span>
            <span style={{ color:'#64748b' }}> / {sorted.length}</span>
          </div>
        </div>
      </div>

      <div style={statusBar}>
        <div style={{ ...sPill, background:'rgba(34,211,238,0.10)', color:'#22d3ee', borderColor:'rgba(34,211,238,0.25)' }}>
          🟢 {liveCount} conectado{liveCount!==1?'s':''}
        </div>
        <div style={{ ...sPill, background:'rgba(100,116,139,0.08)', color:'#94a3b8', borderColor:'rgba(100,116,139,0.15)' }}>
          👥 {sorted.length} jugador{sorted.length!==1?'es':''}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={emptyState}>
          <div style={{ fontSize:32, marginBottom:8 }}>📡</div>
          <div style={{ fontWeight:700, color:'#f8fafc' }}>Sin señal</div>
          <div style={{ color:'#64748b', marginTop:4, fontSize:13 }}>Ningún jugador conectado aún</div>
        </div>
      ) : (
        <div style={{ display:'grid', gap:8 }}>
          {sorted.map((player) => {
            const distance = formatDistance(currentPosition, player)
            const gps = String(player.gps_status || '?').toUpperCase()
            const pres = getPresenceConfig(player.presence)
            const isLive = player.presence === 'live'
            const color = getPlayerColor(player)
            return (
              <article key={player.user} style={{
                display:'flex', flexDirection:'row', alignItems:'center', gap:12, padding:'10px 12px',
                borderRadius:16, border:'1px solid', transition:'background 0.2s, border-color 0.2s',
                borderColor: isLive ? 'rgba(34,211,238,0.22)' : 'rgba(255,255,255,0.06)',
                background: isLive ? 'rgba(34,211,238,0.04)' : 'rgba(255,255,255,0.03)',
              }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <div style={{
                    width:44, height:44, borderRadius:999, display:'inline-flex', alignItems:'center', justifyContent:'center',
                    background: color, overflow:'hidden',
                    boxShadow: isLive ? `0 0 0 2px ${pres.color}, 0 0 10px ${pres.glow}` : '0 0 0 1px rgba(255,255,255,0.1)',
                  }}>
                    {getPlayerAvatarUrl(player)
                      ? <img src={getPlayerAvatarUrl(player)} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                      : <span style={{ fontSize:14, fontWeight:900, color:'#fff', letterSpacing:'0.05em' }}>{getPlayerAvatarInitials(player)}</span>
                    }
                  </div>
                  <span style={{
                    position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:'50%',
                    background: pres.dot, border:'2px solid rgba(17,24,39,0.95)',
                    boxShadow: isLive ? `0 0 6px ${pres.dot}` : 'none',
                  }} />
                </div>

                <div style={{ minWidth:0, flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <div style={{ color:'#f8fafc', fontSize:14, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>
                      {player.display_name || player.user}
                    </div>
                    <span style={{
                      display:'inline-flex', alignItems:'center', padding:'1px 7px', borderRadius:999,
                      fontSize:9, fontWeight:900, letterSpacing:'0.12em', border:'1px solid', whiteSpace:'nowrap', flexShrink:0,
                      color: pres.color,
                      background: isLive ? 'rgba(34,211,238,0.08)' : 'rgba(100,116,139,0.06)',
                      borderColor: isLive ? 'rgba(34,211,238,0.22)' : 'rgba(100,116,139,0.14)',
                    }}>
                      {pres.label}
                    </span>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                    <span style={chip}>📡 {gps}</span>
                    {distance ? <span style={{ ...chip, color:'#7dd3fc', borderColor:'rgba(125,211,252,0.22)' }}>📍 {distance}</span> : null}
                    {player.debug_enabled ? <span style={{ ...chip, color:'#fca5a5', borderColor:'rgba(252,165,165,0.22)' }}>🛠 DEBUG</span> : null}
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

const headerRow: CSSProperties = { display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:12 }
const eyebrow: CSSProperties = { display:'flex', alignItems:'center', gap:6, color:'#94a3b8', fontSize:10, fontWeight:800, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:4 }
const title: CSSProperties = { color:'#f8fafc', fontSize:22, fontWeight:900, lineHeight:1, letterSpacing:'-0.02em' }
const closeBtn: CSSProperties = { width:34, height:34, borderRadius:999, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.06)', color:'#94a3b8', fontSize:20, fontWeight:900, lineHeight:1, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }
const counterBadge: CSSProperties = { fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:999, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)' }
const statusBar: CSSProperties = { display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }
const sPill: CSSProperties = { display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, border:'1px solid', letterSpacing:'0.04em' }
const emptyState: CSSProperties = { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 16px', textAlign:'center' }
const chip: CSSProperties = { display:'inline-flex', alignItems:'center', gap:2, padding:'1px 7px', borderRadius:999, fontSize:10, fontWeight:700, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)', color:'#94a3b8' }

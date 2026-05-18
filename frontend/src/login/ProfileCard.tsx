import { useState, type CSSProperties } from 'react'
import { getPlayerAvatarInitials, getPlayerAvatarUrl, getPlayerColor } from '../shared/playerIdentity'
import { navigateTo } from '../shared/transitions'
import type { PlayerProfile } from '../types/player'

interface Props {
  profile: PlayerProfile
  index: number
}

export default function ProfileCard({ profile, index }: Props) {
  const [pressed, setPressed]   = useState(false)
  const [leaving, setLeaving]   = useState(false)
  const isTeam   = profile.mode === 'team'
  const color    = getPlayerColor(profile)
  const avatarUrl= getPlayerAvatarUrl(profile)
  const initials = getPlayerAvatarInitials(profile)
  const members  = isTeam ? (profile.members || []).join(' · ') : ''

  function handleEnter() {
    if (leaving) return
    setLeaving(true)
    navigateTo(`/player/${encodeURIComponent(profile.id)}`, 360)
  }

  return (
    <article
      style={{
        ...card,
        animationDelay: `${80 + index * 55}ms`,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        opacity: leaving ? 0.5 : 1,
        transition: `transform var(--t-fast), opacity var(--t-fast)`,
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <div style={left}>
        <div style={{
          ...avatarWrap,
          background: `linear-gradient(135deg, ${color}cc, ${color}44)`,
          borderColor: `${color}55`,
          boxShadow: `0 0 20px ${color}33`,
        }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={avatarImg} />
            : <span style={avatarText}>{initials}</span>
          }
          <div style={onlineDot} />
        </div>
        <div style={identity}>
          <div style={nameStyle}>{profile.display_name}</div>
          <div style={metaRow}>
            <span style={pill}>{isTeam ? 'EQUIPO' : 'SOLO'}</span>
            {members && <span style={metaText}>{members}</span>}
          </div>
        </div>
      </div>
      <button
        type="button"
        style={{
          ...enterBtn,
          background: leaving ? 'var(--saga-accent-hover)' : 'var(--saga-accent)',
          animation: leaving ? 'saga-pulse-glow 0.6s ease-in-out' : 'none',
        }}
        onClick={handleEnter}
        disabled={leaving}
      >
        {leaving ? '···' : 'ENTRAR'}
      </button>
    </article>
  )
}

const card: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto',
  gap: 'var(--s3)', alignItems: 'center',
  padding: 'var(--s3) var(--s3)',
  background: 'var(--saga-glass)',
  backdropFilter: 'var(--saga-glass-blur)',
  WebkitBackdropFilter: 'var(--saga-glass-blur)',
  border: 'var(--saga-glass-border)',
  boxShadow: 'var(--shadow-md)',
  borderRadius: 'var(--r-lg)',
  animation: 'saga-rise 300ms cubic-bezier(0.16,1,0.3,1) both',
  cursor: 'pointer',
}
const left: CSSProperties = {
  display: 'grid', gridTemplateColumns: '48px minmax(0,1fr)',
  gap: 'var(--s3)', alignItems: 'center', minWidth: 0,
}
const avatarWrap: CSSProperties = {
  width: 48, height: 48, borderRadius: 'var(--r-full)',
  border: '1.5px solid', position: 'relative',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}
const avatarImg: CSSProperties = {
  width: '100%', height: '100%', objectFit: 'cover',
  borderRadius: 'var(--r-full)', display: 'block',
}
const avatarText: CSSProperties = {
  fontSize: 15, fontWeight: 700, color: '#fff',
  fontFamily: 'var(--saga-font-hud)',
}
const onlineDot: CSSProperties = {
  position: 'absolute', bottom: 1, right: 1,
  width: 11, height: 11, borderRadius: 'var(--r-full)',
  background: 'var(--saga-accent)',
  border: '2px solid var(--saga-bg)',
  boxShadow: '0 0 8px var(--saga-accent-glow)',
}
const identity: CSSProperties = { display: 'grid', gap: 4, minWidth: 0 }
const nameStyle: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)',
  fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em',
  color: 'var(--saga-text)', lineHeight: 1,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const metaRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 }
const pill: CSSProperties = {
  background: 'rgba(0,200,150,.12)', border: '1px solid rgba(0,200,150,.24)',
  color: 'var(--saga-accent)', fontSize: 9, fontWeight: 800,
  letterSpacing: '0.10em', padding: '1px 7px', borderRadius: 'var(--r-full)',
  textTransform: 'uppercase',
}
const metaText: CSSProperties = {
  fontSize: 11, color: 'var(--saga-text-muted)', fontWeight: 600,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const enterBtn: CSSProperties = {
  minHeight: 38, minWidth: 88, borderRadius: 'var(--r-md)',
  border: 0, color: 'var(--saga-text-inverse)',
  fontFamily: 'var(--saga-font-hud)',
  fontSize: 12, fontWeight: 800, letterSpacing: '0.14em',
  cursor: 'pointer',
  transition: 'background var(--t-fast), box-shadow var(--t-fast)',
  boxShadow: 'var(--shadow-accent)',
}

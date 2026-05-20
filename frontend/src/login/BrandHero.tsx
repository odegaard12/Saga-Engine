import type { CSSProperties } from 'react'

interface Props {
  title: string
  subtitle?: string
  body: string
  onAdminClick: () => void
}

export default function BrandHero({ title, subtitle, body, onAdminClick }: Props) {
  const isSaga = title.toUpperCase() === 'SAGA'
  return (
    <section style={card}>
      <div style={topBar}>
        <div />
        <button style={adminBtn} onClick={onAdminClick} type="button">Admin</button>
      </div>
      <div style={center}>
        {isSaga ? (
          <>
            <div style={wordmark}>SAGA</div>
            <div style={kicker}>MISIÓN DE CAMPO</div>
          </>
        ) : (
          <h1 style={customTitle}>{title}</h1>
        )}
        {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
        <p style={bodyStyle}>{body}</p>
      </div>
    </section>
  )
}

const card: CSSProperties = {
  background: 'var(--saga-glass)',
  backdropFilter: 'var(--saga-glass-blur)',
  WebkitBackdropFilter: 'var(--saga-glass-blur)',
  border: 'var(--saga-glass-border)',
  boxShadow: 'var(--saga-glass-shadow)',
  borderRadius: 'var(--r-xl)',
  padding: 'var(--s5) var(--s5) var(--s6)',
  animation: 'saga-rise 300ms cubic-bezier(0.16,1,0.3,1) both',
}
const topBar: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 32,
}
const adminBtn: CSSProperties = {
  background: 'rgba(255,255,255,.08)',
  border: '1px solid var(--saga-border)',
  borderRadius: 'var(--r-full)',
  color: 'var(--saga-text-muted)',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  padding: '0 var(--s3)', minHeight: 28, cursor: 'pointer',
  transition: 'color var(--t-fast), background var(--t-fast)',
}
const center: CSSProperties = {
  marginTop: 'var(--s4)', display: 'grid', justifyItems: 'center',
  textAlign: 'center', gap: 'var(--s2)',
}
const wordmark: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)',
  fontSize: 'clamp(56px,14vw,84px)',
  fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.85,
  color: 'var(--saga-text)',
  textShadow: '0 0 40px var(--saga-accent-glow)',
}
const kicker: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)',
  fontSize: 10, fontWeight: 700, letterSpacing: '0.38em',
  color: 'var(--saga-accent)', textTransform: 'uppercase', marginTop: 4,
}
const customTitle: CSSProperties = {
  fontSize: 'clamp(40px,10vw,68px)', fontWeight: 900,
  letterSpacing: '-0.05em', color: 'var(--saga-text)',
}
const subtitleStyle: CSSProperties = {
  fontSize: 12, fontWeight: 700, letterSpacing: '0.18em',
  color: 'var(--saga-accent)', textTransform: 'uppercase',
}
const bodyStyle: CSSProperties = {
  fontSize: 14, lineHeight: 1.5, color: 'rgba(232,240,244,.80)', maxWidth: '34ch',
}

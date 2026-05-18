import type { CSSProperties } from 'react'

export default function LoginBackground() {
  return (
    <>
      <div style={glowTop} />
      <div style={glowBottom} />
      <div style={scanlineWrap}>
        <div style={scanline} />
      </div>
      <div style={grid} />
    </>
  )
}

const glowTop: CSSProperties = {
  position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
  background: 'var(--saga-glow-top)',
}
const glowBottom: CSSProperties = {
  position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
  background: 'radial-gradient(circle at 50% 110%, rgba(0,100,60,.08) 0%, transparent 60%)',
}
const scanlineWrap: CSSProperties = {
  position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
}
const scanline: CSSProperties = {
  position: 'absolute', left: 0, right: 0, height: '2px',
  background: 'linear-gradient(90deg, transparent, rgba(0,200,150,.06), transparent)',
  animation: 'saga-scanline 8s linear infinite',
}
const grid: CSSProperties = {
  position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
  backgroundImage: `linear-gradient(rgba(0,200,150,.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0,200,150,.03) 1px, transparent 1px)`,
  backgroundSize: '40px 40px',
}

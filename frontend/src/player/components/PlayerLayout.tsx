import type { CSSProperties, ReactNode } from 'react'

export type OverlayState = 'activate' | 'node' | 'finish' | null

export function getMobileBrowserChromeLift(
  mobile: boolean,
): number {
  if (
    !mobile ||
    typeof window === 'undefined'
  ) {
    return 0
  }

  const navigatorWithStandalone =
    window.navigator as Navigator & {
      standalone?: boolean
    }

  const standalone =
    window.matchMedia?.(
      '(display-mode: standalone)'
    ).matches === true ||
    navigatorWithStandalone.standalone === true

  return standalone ? 0 : 22
}

export function getMapQuickControlsStyle(mobile: boolean): CSSProperties {
  const browserChromeLift = getMobileBrowserChromeLift(mobile)

  return {
    position: 'fixed',
    left: '50%',
    bottom: mobile
      ? `calc(env(safe-area-inset-bottom, 0px) + ${138 + browserChromeLift}px)`
      : 148,
    transform: 'translateX(-50%)',
    zIndex: 1600,
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: 2,
    padding: 4,
    borderRadius: 24,
    border: '1px solid rgba(255,255,255,.20)',
    background:
      'linear-gradient(180deg, rgba(84,91,104,.72) 0%, rgba(110,116,128,.64) 100%)',
    boxShadow:
      '0 16px 34px rgba(15,23,42,.20), inset 0 1px 0 rgba(255,255,255,.10)',
    backdropFilter: 'blur(8px) saturate(120%)',
    WebkitBackdropFilter: 'blur(8px) saturate(120%)',
    pointerEvents: 'auto',
  }
}

export const globalPlayerEdgeFix = `
html,
body,
#root {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  min-width: 100%;
  min-height: 100%;
  background: #020617 !important;
  overflow: hidden;
}

body {
  overscroll-behavior: none;
}

.leaflet-container {
  background: #020617 !important;
  outline: none !important;
}

.saga-player-edge-fix {
  background: #020617 !important;
}

.saga-app-fade-in {
  animation: sagaAppFadeIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  will-change: opacity, transform;
}

@keyframes sagaAppFadeIn {
  from { opacity: 0; transform: scale3d(0.995, 0.995, 1); }
  to { opacity: 1; transform: scale3d(1, 1, 1); }
}
`

export function ScreenFrame({
  children,
  mobile,
}: {
  children: ReactNode
  mobile: boolean
}) {
  return (
    <>
      <style>{globalPlayerEdgeFix}</style>
      <div
        className="saga-app-fade-in"
        style={{
          position: mobile ? 'fixed' : 'relative',
          inset: mobile ? 0 : undefined,
          width: '100vw',
          height: '100dvh',
          background: '#020617',
          overflow: 'hidden',
          fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
          color: '#ffffff',
        }}
      >
        {children}
      </div>
    </>
  )
}

function getLaunchingPlayerLabel() {
  if (typeof window === 'undefined') return ''

  try {
    const raw = window.sessionStorage.getItem('saga:player-launching')
    if (!raw) return ''

    const parsed = JSON.parse(raw) as { label?: string; at?: string }
    return parsed.label || ''
  } catch {
    return ''
  }
}

export function StatusCard({ title, body }: { title: string; body: string }) {
  const playerLabel = getLaunchingPlayerLabel()

  return (
    <section style={statusCard}>
      <style>{statusCardAnimations}</style>
      <div style={statusLoader}>
        <div style={statusLoaderRing} />
      </div>
      <div style={statusTitle}>{playerLabel ? `Entrando como ${playerLabel}` : title}</div>
      <div style={statusBody}>{body}</div>
    </section>
  )
}

export function CelebrationOverlay({ state }: { state: OverlayState }) {
  if (!state) return null

  const label =
    state === 'activate'
      ? 'Node ready'
      : state === 'node'
      ? 'Node cleared'
      : 'Mission complete'

  const toneStyle =
    state === 'activate'
      ? overlayInfo
      : state === 'node'
      ? overlaySuccess
      : overlayFinish

  return (
    <>
      <style>{overlayAnimations}</style>
      <div style={overlayWrap}>
        <div style={{ ...pulseRing, ...toneStyle }} />
        <div style={{ ...overlayPill, ...toneStyle }}>{label}</div>
      </div>
    </>
  )
}

export function getViewportStyle(mobile: boolean): CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    height: '100dvh',
    overflow: 'hidden',
    fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
    color: '#ffffff',
    background: '#020617',
  }
}

export function getTopScrimStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: mobile ? 120 : 160,
    background:
      'linear-gradient(180deg, rgba(2,6,23,.88) 0%, rgba(2,6,23,.4) 50%, transparent 100%)',
    pointerEvents: 'none',
    zIndex: 10,
  }
}

export function getTopOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: mobile ? 'env(safe-area-inset-top, 0px)' : '10px 0 0',
    zIndex: 1200,
    pointerEvents: 'auto',
  }
}

export function getToastOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: mobile ? 'calc(env(safe-area-inset-top, 0px) + 72px)' : 90,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    zIndex: 500,
    pointerEvents: 'none',
    padding: '0 16px',
  }
}

export function getBottomOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: mobile ? 10 : 12,
    right: mobile ? 10 : 12,
    bottom: mobile ? 0 : 12,
    zIndex: 1200,
    pointerEvents: 'auto',
  }
}

export function getOverlayBackdropStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    zIndex: 30,
    background: 'rgba(2,6,23,.45)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
  }
}

const statusCard: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  padding: '32px 24px',
  borderRadius: 24,
  background: 'rgba(15,23,42,.6)',
  border: '1px solid rgba(255,255,255,.1)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  textAlign: 'center',
  minWidth: 260,
  maxWidth: 320,
  animation: 'sagaStatusPulse 2s ease-in-out infinite',
}

const statusLoader: CSSProperties = {
  position: 'relative',
  width: 40,
  height: 40,
  marginBottom: 8,
}

const statusLoaderRing: CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 999,
  border: '3px solid rgba(255,255,255,.1)',
  borderTopColor: '#34d399',
  animation: 'sagaStatusSpin 1s linear infinite',
}

const statusTitle: CSSProperties = {
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: '-0.02em',
}

const statusBody: CSSProperties = {
  color: 'rgba(255,255,255,.6)',
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 500,
}

const statusCardAnimations = `
@keyframes sagaStatusPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}
@keyframes sagaStatusSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`

const overlayWrap: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1235,
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const pulseRing: CSSProperties = {
  position: 'absolute',
  width: 190,
  height: 190,
  borderRadius: '50%',
  opacity: 0.22,
  animation: 'sagaPulseRing 720ms ease-out forwards',
}

const overlayPill: CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.08em',
  boxShadow: '0 14px 30px rgba(15,23,42,.12)',
  will-change: transform, opacity;
  animation: 'sagaOverlayPop 520ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const overlayInfo: CSSProperties = {
  background: 'rgba(239,246,255,.96)',
  border: '1px solid rgba(59,130,246,.16)',
  color: '#1d4ed8',
}

const overlaySuccess: CSSProperties = {
  background: 'rgba(220,252,231,.96)',
  border: '1px solid rgba(22,163,74,.18)',
  color: '#166534',
}

const overlayFinish: CSSProperties = {
  background: 'rgba(250,245,255,.96)',
  border: '1px solid rgba(168,85,247,.18)',
  color: '#7e22ce',
}

const overlayAnimations = `
@keyframes sagaPulseRing {
  from {
    transform: scale3d(.42, .42, 1);
    opacity: .28;
  }
  to {
    transform: scale3d(1.24, 1.24, 1);
    opacity: 0;
  }
}

@keyframes sagaOverlayPop {
  from {
    transform: scale3d(.94, .94, 1);
    opacity: 0;
  }
  to {
    transform: scale3d(1, 1, 1);
    opacity: 1;
  }
}
`

export const floatingTrophyButton: CSSProperties = {
  position: 'fixed',
  left: 18,
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 176px)',
  zIndex: 4600,
  width: 44,
  height: 44,
  borderRadius: 999,
  border: '1px solid rgba(16,185,129,.34)',
  background: 'rgba(16,185,129,.18)',
  color: '#34d399',
  fontSize: 20,
  display: 'grid',
  placeItems: 'center',
  boxShadow: '0 14px 34px rgba(16,185,129,.20)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  cursor: 'pointer',
}

export const finishOverlayStyle = `
.saga-finish-overlay {
  position: fixed;
  inset: 0;
  z-index: 8000;
  display: flex;
  align-items: center;
  justifyContent: center;
  padding: 16px;
  background: radial-gradient(circle at center, rgba(16, 185, 129, 0.15), #020617 85%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  will-change: opacity;
  animation: sagaFadeIn 0.4s ease-out forwards;
}
.saga-finish-card {
  width: min(100%, 390px);
  border-radius: 28px;
  border: 1px solid rgba(52, 211, 153, 0.25);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.99));
  box-shadow: 0 0 35px rgba(52, 211, 153, 0.12), 0 24px 54px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  padding: 24px;
  text-align: center;
  display: grid;
  gap: 16px;
  position: relative;
  overflow: hidden;
  will-change: transform, opacity;
  animation: sagaFinishPop 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.saga-finish-orb {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #047857);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.35), inset 0 2px 4px rgba(255,255,255,0.2);
  margin: 0 auto;
  display: grid;
  place-items: center;
  font-size: 32px;
  will-change: transform;
  animation: sagaFinishTrophy 1.5s infinite ease-in-out;
}
.saga-finish-title {
  font-size: 24px;
  font-weight: 950;
  letter-spacing: -0.04em;
  color: #ffffff;
  margin: 0;
  text-transform: uppercase;
  background: linear-gradient(90deg, #34d399, #6ee7b7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 2px 8px rgba(52, 211, 153, 0.15));
}
.saga-finish-subtitle {
  font-size: 13px;
  color: rgba(226, 232, 240, 0.75);
  line-height: 1.45;
  margin: 0;
}
.saga-finish-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  padding: 12px;
  margin: 8px 0;
}
.saga-finish-stat-box {
  display: grid;
  gap: 2px;
}
.saga-finish-stat-val {
  font-size: 20px;
  font-weight: 900;
  color: #34d399;
}
.saga-finish-stat-lbl {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.05em;
}
.saga-finish-btn-primary {
  min-height: 46px;
  border-radius: 16px;
  border: none;
  background: linear-gradient(180deg, #10b981, #059669);
  color: #ffffff;
  font-size: 13px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(16, 185, 129, 0.2);
  transition: all 0.2s ease;
}
.saga-finish-btn-primary:hover {
  background: linear-gradient(180deg, #34d399, #10b981);
  transform: translateY(-1px);
}
.saga-finish-btn-secondary {
  min-height: 44px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s ease;
}
.saga-finish-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}
@keyframes sagaFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes sagaFinishPop {
  from { transform: scale3d(0.95, 0.95, 1); opacity: 0; }
  to { transform: scale3d(1, 1, 1); opacity: 1; }
}
@keyframes sagaFinishTrophy {
  0%, 100% { transform: translate3d(0, 0, 0) scale3d(1, 1, 1); }
  50% { transform: translate3d(0, -4px, 0) scale3d(1.05, 1.05, 1); }
}
`

import type { CSSProperties, ReactNode } from 'react'

export type OverlayState = 'success' | 'finish' | 'error' | null

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
}

@keyframes sagaAppFadeIn {
  from { opacity: 0; transform: scale(0.995); }
  to { opacity: 1; transform: scale(1); }
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
    <div
      className="saga-player-edge-fix saga-app-fade-in"
      style={{
        ...getViewportStyle(mobile),
        background: '#020617',
      }}
    >
      <style>{globalPlayerEdgeFix}</style>
      {children}
    </div>
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
      <div style={statusTitle}>{playerLabel ? \`Entrando como \${playerLabel}\` : title}</div>
      <div style={statusBody}>{body}</div>
    </section>
  )
}

export function CelebrationOverlay({ state }: { state: OverlayState }) {
  if (!state) return null

  if (state === 'error') {
    return (
      <div style={{ ...overlayBase, background: 'rgba(239,68,68,.12)' }}>
        <div style={overlayGlowError} />
        <div style={overlayCard}>ERROR DE CONEXIÓN</div>
      </div>
    )
  }

  if (state === 'finish') {
    return (
      <div style={{ ...overlayBase, background: 'rgba(52,211,153,.15)' }}>
        <div style={overlayGlowFinish} />
        <div style={overlayCard}>MISIÓN COMPLETADA</div>
      </div>
    )
  }

  return (
    <div style={{ ...overlayBase, background: 'rgba(14,165,233,.12)' }}>
      <div style={overlayGlowSuccess} />
      <div style={overlayCard}>ACCESO AUTORIZADO</div>
    </div>
  )
}

export function getViewportStyle(mobile: boolean): CSSProperties {
  return {
    position: 'relative',
    width: '100vw',
    height: '100dvh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
    color: '#ffffff',
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
    zIndex: 20,
    pointerEvents: 'none',
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
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    pointerEvents: 'none',
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

const statusCardAnimations = \`
@keyframes sagaStatusPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}
@keyframes sagaStatusSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
\`

const overlayBase: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  animation: 'sagaAppFadeIn 0.3s ease-out both',
}

const overlayGlowSuccess: CSSProperties = {
  position: 'absolute',
  width: '120vw',
  height: '120vw',
  borderRadius: 999,
  background: 'radial-gradient(circle, rgba(14,165,233,.2) 0%, transparent 70%)',
  filter: 'blur(40px)',
  animation: 'sagaOverlayPulse 2s ease-in-out infinite alternate',
}

const overlayGlowFinish: CSSProperties = {
  position: 'absolute',
  width: '120vw',
  height: '120vw',
  borderRadius: 999,
  background: 'radial-gradient(circle, rgba(52,211,153,.2) 0%, transparent 70%)',
  filter: 'blur(40px)',
  animation: 'sagaOverlayPulse 2s ease-in-out infinite alternate',
}

const overlayGlowError: CSSProperties = {
  position: 'absolute',
  width: '120vw',
  height: '120vw',
  borderRadius: 999,
  background: 'radial-gradient(circle, rgba(239,68,68,.2) 0%, transparent 70%)',
  filter: 'blur(40px)',
  animation: 'sagaOverlayPulse 0.5s ease-in-out infinite alternate',
}

const overlayCard: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  padding: '16px 24px',
  borderRadius: 999,
  background: 'rgba(15,23,42,.85)',
  border: '1px solid rgba(255,255,255,.2)',
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  boxShadow: '0 20px 40px rgba(0,0,0,.4)',
}

import type { CSSProperties, ReactNode } from 'react'
import { BloqueoVertical } from './BloqueoVertical'

export type OverlayState = 'activate' | 'node' | 'finish' | null

export function getMobileBrowserChromeLift(mobile: boolean): number {
  if (!mobile || typeof window === 'undefined') {
    return 0
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean
  }

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    navigatorWithStandalone.standalone === true

  return standalone ? 0 : 22
}

export function getMapQuickControlsStyle(mobile: boolean): CSSProperties {
  const browserChromeLift = getMobileBrowserChromeLift(mobile)

  return {
    position: 'fixed',
    left: '50%',
    bottom: mobile ? `calc(env(safe-area-inset-bottom, 0px) + ${138 + browserChromeLift}px)` : 148,
    transform: 'translateX(-50%)',
    zIndex: 1600,
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: 4,
    padding: '5px 8px',
    borderRadius: 'var(--theme-radius-panel)',
    // Exactamente el mismo estilo que la barra inferior (Mochila / Herramientas / Nodos)
    background: 'linear-gradient(180deg, rgba(var(--theme-sheen-a), calc(.52 * var(--theme-solid))), rgba(var(--theme-sheen-b), calc(.42 * var(--theme-solid))))',
    border: '1px solid rgba(255,255,255,.22)',
    boxShadow: '0 22px 60px rgba(var(--theme-ink), .18)',
    backdropFilter: 'var(--theme-blur)',
    WebkitBackdropFilter: 'var(--theme-blur)',
    pointerEvents: 'auto',
  }
}


/**
 * El CSS global de la pantalla del jugador.
 *
 * El fondo venia escrito a mano y con !important, asi que ganaba a cualquier
 * especificidad: el tema podia tener sus variables perfectas y el fondo seguia
 * saliendo azul marino. Medido en el navegador sobre produccion:
 *
 *     body.className                         = "theme-flame-red"
 *     --theme-bg                             = "#2f0a0a"
 *     getComputedStyle(body).backgroundColor = "rgb(2, 6, 23)"
 *
 * Y el color se metia reemplazando el texto del azul dentro de este bloque por
 * una prop, cuyo valor por defecto era ese mismo azul y a la que nadie le
 * pasaba otra cosa. Un reemplazo de cadenas donde tiene que haber una variable
 * de CSS.
 *
 * Los !important se quedan -estan para ganarle a estilos de Leaflet y del
 * navegador- pero ahora lo que ponen sale del tema.
 */
export const globalPlayerEdgeFix = `
html,
body,
#root {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  min-width: 100%;
  min-height: 100%;
  background: var(--theme-bg) !important;
  overflow: hidden;
}

body {
  overscroll-behavior: none;
}

.leaflet-container {
  background: var(--theme-surface) !important;
  outline: none !important;
}

.saga-player-edge-fix {
  background: var(--theme-surface) !important;
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
          background: 'var(--theme-bg)',
          overflow: 'hidden',
          fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
          color: '#ffffff',
        }}
      >
        {children}
      </div>

      {/* Va aquí y no dentro de cada pantalla: así tapa también la cámara, los
          minijuegos y las hojas, que es justo donde el horizontal descuadra. */}
      <BloqueoVertical />
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

export function StatusCard({
  title,
  body,
  progress,
  progressDetail,
}: {
  title: string
  body: string
  progress?: number
  progressDetail?: string
}) {
  const playerLabel = getLaunchingPlayerLabel()

  return (
    <section style={statusCard}>
      <style>{statusCardAnimations}</style>
      <div style={statusLoader}>
        <div style={statusLoaderRing} />
      </div>
      <div style={statusTitle}>{playerLabel ? `Entrando como ${playerLabel}` : title}</div>
      <div style={statusBody}>{body}</div>
      {progress !== undefined && (
        <div style={progressContainer}>
          <div style={progressWrapper}>
            <div style={{ ...progressBar, width: `${progress}%` }} />
          </div>
          {progressDetail && <div style={progressText}>{progressDetail}</div>}
        </div>
      )}
    </section>
  )
}

export function CelebrationOverlay({ state }: { state: OverlayState }) {
  if (!state) return null

  const label =
    state === 'activate' ? 'Node ready' : state === 'node' ? 'Node cleared' : 'Mission complete'

  const toneStyle =
    state === 'activate' ? overlayInfo : state === 'node' ? overlaySuccess : overlayFinish

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
    background: 'rgb(var(--theme-ink-deep))',
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
      'linear-gradient(180deg, rgba(var(--theme-ink-deep), .88) 0%, rgba(var(--theme-ink-deep), .4) 50%, transparent 100%)',
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
    padding: mobile ? 'calc(env(safe-area-inset-top, 0px) + 16px) 10px 0' : '10px 0 0',
    zIndex: 1200,
    pointerEvents: 'auto',
  }
}

export function getToastOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: mobile ? 'calc(env(safe-area-inset-top, 0px) + 150px)' : 130,
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
    background: 'rgba(var(--theme-ink-deep), .45)',
    backdropFilter: 'var(--theme-blur)',
    WebkitBackdropFilter: 'var(--theme-blur)',
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
  borderRadius: 'var(--theme-radius-panel)',
  background: 'rgba(var(--theme-ink), .6)',
  border: '1px solid rgba(255,255,255,.1)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  textAlign: 'center',
  minWidth: 260,
  maxWidth: 320,
  animation: 'sagaStatusPulse 2s ease-in-out infinite',
}

const progressContainer: CSSProperties = {
  width: '100%',
  marginTop: 12,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
}

const progressWrapper: CSSProperties = {
  width: '100%',
  height: 6,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 3,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.04)',
}

const progressBar: CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg, rgb(var(--theme-ok)), rgb(var(--theme-ok-soft)))',
  borderRadius: 3,
  transition: 'width 0.2s ease-out',
}

const progressText: CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.5)',
  textAlign: 'center',
  fontFamily: 'monospace',
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
  borderRadius: 'var(--theme-radius-pill)',
  border: '3px solid rgba(255,255,255,.1)',
  borderTopColor: 'rgb(var(--theme-ok-soft))',
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
  borderRadius: 'var(--theme-radius-pill)',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.08em',
  boxShadow: '0 14px 30px rgba(var(--theme-ink), .12)',
  willChange: 'transform, opacity',
  animation: 'sagaOverlayPop 520ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const overlayInfo: CSSProperties = {
  background: 'rgba(239,246,255,.96)',
  border: '1px solid rgba(var(--theme-pin), .16)',
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
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(var(--theme-ok), .34)',
  background: 'rgba(var(--theme-ok), .18)',
  color: 'rgb(var(--theme-ok-soft))',
  fontSize: 20,
  display: 'grid',
  placeItems: 'center',
  boxShadow: '0 14px 34px rgba(var(--theme-ok), .20)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  cursor: 'pointer',
}

export const finishOverlayStyle = `
.saga-finish-overlay {
  position: fixed;
  inset: 0;
  z-index: 8000;
  display: flex;
  align-items: center;
  /* Era "justifyContent", que en CSS no existe: la tarjeta se quedaba pegada a
     la izquierda en cuanto la pantalla era más ancha que ella. */
  justify-content: center;
  /* La isla del iPhone come la franja de arriba: sin este margen la tarjeta del
     trofeo se metía debajo y se cortaba el título. */
  padding: max(16px, calc(env(safe-area-inset-top) + 12px)) 16px
    max(16px, calc(env(safe-area-inset-bottom) + 12px));
  background: radial-gradient(circle at center, rgba(var(--theme-ok), 0.22), #050b1c 88%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  will-change: opacity;
  animation: sagaFadeIn 0.4s ease-out forwards;
}
.saga-finish-card {
  width: min(100%, 390px);
  border-radius: 28px;
  /* Menos negro. Era casi carbón sobre carbón y de día no se distinguía la
     tarjeta del fondo: ahora el azul sube de tono y el borde verde brilla. */
  border: 1px solid rgba(var(--theme-ok-soft), 0.42);
  background: linear-gradient(180deg, rgba(30, 43, 74, 0.97), rgba(13, 22, 43, 0.99));
  box-shadow: 0 0 46px rgba(var(--theme-ok-soft), 0.24), 0 24px 54px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
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
  background: linear-gradient(135deg, rgb(var(--theme-ok)), #047857);
  box-shadow: 0 0 20px rgba(var(--theme-ok), 0.35), inset 0 2px 4px rgba(255,255,255,0.2);
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
  background: linear-gradient(90deg, rgb(var(--theme-ok-soft)), #6ee7b7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 2px 8px rgba(var(--theme-ok-soft), 0.15));
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
  color: rgb(var(--theme-ok-soft));
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
  background: linear-gradient(180deg, rgb(var(--theme-ok)), rgb(var(--theme-ok-deep)));
  color: #ffffff;
  font-size: 13px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(var(--theme-ok), 0.2);
  transition: all 0.2s ease;
}
.saga-finish-btn-primary:hover {
  background: linear-gradient(180deg, rgb(var(--theme-ok-soft)), rgb(var(--theme-ok)));
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

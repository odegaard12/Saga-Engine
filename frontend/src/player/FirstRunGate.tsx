import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Phase =
  | 'zoom_in'       // animación satelital descendiendo
  | 'gps'           // pedir permiso GPS (primera vez)
  | 'gps_waiting'   // esperando respuesta navegador
  | 'mission'       // descargar/confirmar misión
  | 'zoom_to_user'  // zoom final hacia ubicación del jugador
  | 'out'           // fade out → mapa visible

interface Props {
  playerName: string
  hasMissionCached: boolean
  isReturning: boolean  // ya pasó por aquí antes
  onDone: () => void
}

const GPS_KEY        = 'saga_gps_granted'
const FIRST_RUN_KEY  = 'saga_first_run_done'

export function markFirstRunDone() {
  localStorage.setItem(FIRST_RUN_KEY, '1')
  localStorage.setItem(GPS_KEY, '1')
}

export function shouldShowFirstRun(): boolean {
  return (
    localStorage.getItem(FIRST_RUN_KEY) !== '1' ||
    localStorage.getItem(GPS_KEY) !== '1'
  )
}

export function isReturningPlayer(): boolean {
  return (
    localStorage.getItem(FIRST_RUN_KEY) === '1' &&
    localStorage.getItem(GPS_KEY) === '1'
  )
}

export default function FirstRunGate({ playerName, hasMissionCached, isReturning, onDone }: Props) {
  const [phase, setPhase]       = useState<Phase>('zoom_in')
  const [gpsError, setGpsError] = useState('')
  const [visible, setVisible]   = useState(true)

  // Zoom animation state
  const [zoomScale, setZoomScale] = useState(6)
  const [zoomOpacity, setZoomOpacity] = useState(0)
  const [dotVisible, setDotVisible]   = useState(false)

  useEffect(() => {
    // Frame 1: iniciar zoom in desde "satélite" (escala 6 → 1)
    const t1 = setTimeout(() => {
      setZoomOpacity(1)
      setZoomScale(1)
    }, 80)

    if (isReturning) {
      // Jugador que vuelve: solo zoom de 2s → fade out directo
      const t2 = setTimeout(() => setDotVisible(true), 1200)
      const t3 = setTimeout(() => {
        setPhase('out')
        setTimeout(onDone, 500)
      }, 2800)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }

    // Primera vez: zoom 2.2s → mostrar panel
    const t2 = setTimeout(() => setDotVisible(true), 1400)
    const t3 = setTimeout(() => {
      const gpsGranted = localStorage.getItem(GPS_KEY) === '1'
      setPhase(gpsGranted ? 'mission' : 'gps')
    }, 2400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  function requestGPS() {
    setPhase('gps_waiting')
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      () => {
        localStorage.setItem(GPS_KEY, '1')
        setPhase('mission')
      },
      () => {
        setGpsError('Ubicación denegada. Puedes activarla desde Herramientas.')
        setPhase('mission')
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  function handleMissionReady() {
    markFirstRunDone()
    setPhase('zoom_to_user')
    // Zoom rápido hacia la ubicación → fade out
    setTimeout(() => {
      setPhase('out')
      setVisible(false)
      setTimeout(onDone, 500)
    }, 1200)
  }

  const isZooming = phase === 'zoom_in' || phase === 'zoom_to_user'
  const showPanel = phase === 'gps' || phase === 'gps_waiting' || phase === 'mission'

  return (
    <div style={{
      ...overlay,
      opacity: phase === 'out' ? 0 : 1,
      pointerEvents: phase === 'out' ? 'none' : 'all',
      transition: phase === 'out' ? 'opacity 500ms ease-in' : 'none',
    }}>

      {/* Fondo satelital animado */}
      <div style={{
        ...satBg,
        transform: `scale(${zoomScale})`,
        opacity: zoomOpacity,
        transition: isZooming
          ? 'transform 2.2s cubic-bezier(0.16,1,0.3,1), opacity 0.8s ease-out'
          : 'transform 1s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={gridLayer} />
        <div style={topoLayer} />
        {/* Líneas de coordenadas */}
        <div style={coordLine('h', '30%')} />
        <div style={coordLine('h', '50%')} />
        <div style={coordLine('h', '70%')} />
        <div style={coordLine('v', '25%')} />
        <div style={coordLine('v', '50%')} />
        <div style={coordLine('v', '75%')} />
      </div>

      {/* Punto de localización pulsante */}
      {dotVisible && (
        <div style={locatorWrap}>
          <div style={locatorRing1} />
          <div style={locatorRing2} />
          <div style={locatorDot} />
        </div>
      )}

      {/* Etiqueta de zoom */}
      {isZooming && (
        <div style={zoomHUD}>
          <div style={hudLabel}>LOCALIZANDO OPERATIVO</div>
          <div style={hudName}>{playerName.toUpperCase()}</div>
          <div style={hudCoords}>40°25′N  3°41′O</div>
          <div style={hudBar}><div style={hudBarFill} /></div>
        </div>
      )}

      {/* Panel de GPS — primera vez */}
      {(phase === 'gps' || phase === 'gps_waiting') && (
        <div style={panel}>
          <div style={panelIcon}>📡</div>
          <div style={panelTitle}>ACCESO A UBICACIÓN</div>
          <p style={panelBody}>
            SAGA necesita tu posición GPS para sincronizar zonas de operación y misiones de campo.
          </p>
          {gpsError && <p style={errorText}>{gpsError}</p>}
          <button
            style={btnPrimary}
            onClick={requestGPS}
            disabled={phase === 'gps_waiting'}
          >
            {phase === 'gps_waiting' ? 'ESPERANDO···' : 'PERMITIR UBICACIÓN'}
          </button>
          <button style={btnGhost} onClick={() => {
            setGpsError('')
            setPhase('mission')
          }}>
            Ahora no
          </button>
        </div>
      )}

      {/* Panel de misión */}
      {phase === 'mission' && (
        <div style={panel}>
          <div style={panelIcon}>📦</div>
          <div style={panelTitle}>PAQUETE DE MISIÓN</div>
          <p style={panelBody}>
            {hasMissionCached
              ? 'Misión almacenada y lista. Opera sin conexión cuando sea necesario.'
              : 'Descarga el paquete de misión para acceso offline en campo.'}
          </p>
          <button style={btnPrimary} onClick={handleMissionReady}>
            {hasMissionCached ? 'INICIAR OPERACIÓN →' : 'DESCARGAR E INICIAR →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Estilos ────────────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
  background: '#050a0d',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  overflow: 'hidden',
}
const satBg: CSSProperties = {
  position: 'absolute', inset: '-20%',
  background: 'radial-gradient(ellipse at 50% 60%, #0a2a18 0%, #050e14 40%, #030608 100%)',
  transformOrigin: '50% 55%',
}
const gridLayer: CSSProperties = {
  position: 'absolute', inset: 0,
  backgroundImage: `
    linear-gradient(rgba(0,200,150,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,200,150,.07) 1px, transparent 1px)`,
  backgroundSize: '48px 48px',
}
const topoLayer: CSSProperties = {
  position: 'absolute', inset: 0,
  backgroundImage: `
    radial-gradient(ellipse 60% 30% at 40% 55%, rgba(0,200,150,.04) 0%, transparent 70%),
    radial-gradient(ellipse 40% 20% at 65% 45%, rgba(0,180,130,.03) 0%, transparent 70%)`,
}
function coordLine(dir: 'h' | 'v', pos: string): CSSProperties {
  return {
    position: 'absolute',
    ...(dir === 'h'
      ? { left: 0, right: 0, top: pos, height: 1 }
      : { top: 0, bottom: 0, left: pos, width: 1 }),
    background: 'rgba(0,200,150,.12)',
  }
}
const locatorWrap: CSSProperties = {
  position: 'absolute', top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 0, height: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const locatorRing1: CSSProperties = {
  position: 'absolute',
  width: 80, height: 80, borderRadius: '50%',
  border: '1.5px solid rgba(0,200,150,.35)',
  animation: 'saga-locator-ring 2s ease-out infinite',
}
const locatorRing2: CSSProperties = {
  position: 'absolute',
  width: 140, height: 140, borderRadius: '50%',
  border: '1px solid rgba(0,200,150,.18)',
  animation: 'saga-locator-ring 2s ease-out 0.5s infinite',
}
const locatorDot: CSSProperties = {
  width: 12, height: 12, borderRadius: '50%',
  background: 'var(--saga-accent)',
  boxShadow: '0 0 16px rgba(0,200,150,.8), 0 0 40px rgba(0,200,150,.4)',
  zIndex: 1,
}
const zoomHUD: CSSProperties = {
  position: 'absolute', bottom: '14%', left: '50%',
  transform: 'translateX(-50%)',
  textAlign: 'center', display: 'grid', gap: 6,
  animation: 'saga-rise 400ms 1.2s both',
}
const hudLabel: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.30em', color: 'var(--saga-accent)', textTransform: 'uppercase',
}
const hudName: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 26, fontWeight: 700,
  letterSpacing: '0.05em', color: 'var(--saga-text)',
}
const hudCoords: CSSProperties = {
  fontFamily: 'monospace', fontSize: 11,
  color: 'rgba(0,200,150,.60)', letterSpacing: '0.12em',
}
const hudBar: CSSProperties = {
  height: 2, width: 160, background: 'rgba(0,200,150,.15)',
  borderRadius: 2, margin: '4px auto 0', overflow: 'hidden',
}
const hudBarFill: CSSProperties = {
  height: '100%', width: '100%', background: 'var(--saga-accent)',
  borderRadius: 2, transformOrigin: 'left',
  animation: 'saga-bar-fill 2.2s cubic-bezier(0.16,1,0.3,1) forwards',
}
const panel: CSSProperties = {
  position: 'relative', zIndex: 10,
  width: 'min(100% - 32px, 360px)',
  padding: '32px 28px',
  background: 'rgba(13,19,24,0.92)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(0,200,150,.20)',
  boxShadow: '0 0 0 1px rgba(0,200,150,.08), 0 24px 60px rgba(0,0,0,.6)',
  borderRadius: '20px',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 16, textAlign: 'center',
  animation: 'saga-rise 350ms cubic-bezier(0.16,1,0.3,1) both',
}
const panelIcon: CSSProperties = { fontSize: 44, lineHeight: 1 }
const panelTitle: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 18, fontWeight: 700,
  letterSpacing: '0.10em', color: 'var(--saga-text)',
}
const panelBody: CSSProperties = {
  fontSize: 14, lineHeight: 1.6,
  color: 'rgba(200,216,224,.75)', maxWidth: '26ch',
}
const errorText: CSSProperties = {
  fontSize: 12, color: '#f59e0b', textAlign: 'center',
}
const btnPrimary: CSSProperties = {
  width: '100%', minHeight: 48, borderRadius: 10,
  background: 'var(--saga-accent)', border: 0,
  color: '#050a0d',
  fontFamily: 'var(--saga-font-hud)', fontSize: 13, fontWeight: 800,
  letterSpacing: '0.14em', cursor: 'pointer',
  boxShadow: '0 0 24px rgba(0,200,150,.35)',
  transition: 'background 150ms, box-shadow 150ms',
}
const btnGhost: CSSProperties = {
  background: 'none', border: 0,
  color: 'rgba(200,216,224,.50)', fontSize: 13,
  cursor: 'pointer', padding: '8px',
}

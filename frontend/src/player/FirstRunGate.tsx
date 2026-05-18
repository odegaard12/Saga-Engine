import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Phase =
  | 'zoom_in'       // satélite descendiendo, mapa cargando debajo
  | 'gps'           // pedir GPS (1ª vez)
  | 'gps_waiting'   // esperando navegador
  | 'mission'       // confirmar misión
  | 'zoom_final'    // zoom hacia ubicación jugador
  | 'dissolve'      // fade-out con mapa ya listo debajo
  | 'done'

interface Props {
  playerName: string
  hasMissionCached: boolean
  isReturning: boolean
  mapTilesReady: boolean   // viene de PlayerApp via onMapTilesReady
  onDone: () => void
}

export const GPS_KEY       = 'saga_gps_granted'
export const FIRST_RUN_KEY = 'saga_first_run_done'

export function markFirstRunDone() {
  localStorage.setItem(FIRST_RUN_KEY, '1')
  localStorage.setItem(GPS_KEY, '1')
}
export function shouldShowFirstRun(): boolean {
  return localStorage.getItem(FIRST_RUN_KEY) !== '1' || localStorage.getItem(GPS_KEY) !== '1'
}
export function isReturningPlayer(): boolean {
  return localStorage.getItem(FIRST_RUN_KEY) === '1' && localStorage.getItem(GPS_KEY) === '1'
}

export default function FirstRunGate({ playerName, hasMissionCached, isReturning, mapTilesReady, onDone }: Props) {
  const [phase, setPhase]         = useState<Phase>('zoom_in')
  const [gpsError, setGpsError]   = useState('')
  const [zoomScale, setZoomScale] = useState(5)
  const [zoomOp, setZoomOp]       = useState(0)
  const [dotVisible, setDotVisible] = useState(false)
  const [overlayOp, setOverlayOp] = useState(1)
  const tilesReadyRef = useRef(mapTilesReady)
  const dissolveTriggered = useRef(false)

  // Sincronizar tiles ready en ref para usarlo en callbacks
  useEffect(() => { tilesReadyRef.current = mapTilesReady }, [mapTilesReady])

  // Función para iniciar el dissolve — espera tiles si no están listos
  function triggerDissolve() {
    if (dissolveTriggered.current) return
    dissolveTriggered.current = true
    setPhase('zoom_final')

    function doDissolve() {
      setPhase('dissolve')
      setOverlayOp(0)
      setTimeout(onDone, 700)
    }

    if (tilesReadyRef.current) {
      setTimeout(doDissolve, 800)
    } else {
      // Esperar tiles con timeout máximo de 3s
      let waited = 0
      const interval = setInterval(() => {
        waited += 100
        if (tilesReadyRef.current || waited >= 3000) {
          clearInterval(interval)
          doDissolve()
        }
      }, 100)
    }
  }

  useEffect(() => {
    // Iniciar zoom in
    const t1 = setTimeout(() => { setZoomOp(1); setZoomScale(1) }, 80)
    const t2 = setTimeout(() => setDotVisible(true), 1600)

    if (isReturning) {
      // Jugador que vuelve: zoom 2.5s → dissolve esperando tiles
      const t3 = setTimeout(triggerDissolve, 2600)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }

    // Primera vez: zoom → mostrar panel
    const t3 = setTimeout(() => {
      const gpsGranted = localStorage.getItem(GPS_KEY) === '1'
      setPhase(gpsGranted ? 'mission' : 'gps')
    }, 2500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  function requestGPS() {
    setPhase('gps_waiting')
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      () => { localStorage.setItem(GPS_KEY, '1'); setPhase('mission') },
      () => { setGpsError('GPS denegado. Actívalo desde Herramientas.'); setPhase('mission') },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  function handleMissionReady() {
    markFirstRunDone()
    triggerDissolve()
  }

  const isAnimating = phase === 'zoom_in' || phase === 'zoom_final'
  const showPanel   = phase === 'gps' || phase === 'gps_waiting' || phase === 'mission'
  const bgOpacity   = showPanel ? 0.88 : 1  // al mostrar panel, oscurecer menos para ver mapa
  const overlayBg   = `rgba(5,10,13,${(overlayOp * bgOpacity).toFixed(2)})`

  return (
    <div style={{
      ...overlay,
      background: overlayBg,
      opacity: overlayOp,
      transition: phase === 'dissolve'
        ? 'opacity 700ms cubic-bezier(0.4,0,0.2,1)'
        : 'background 400ms ease',
      pointerEvents: phase === 'done' || phase === 'dissolve' ? 'none' : 'all',
    }}>

      {/* Fondo satelital — se desvanece cuando hay panel */}
      <div style={{
        ...satBg,
        transform: `scale(${zoomScale})`,
        opacity: zoomOp * (showPanel ? 0.3 : 1),
        transition: isAnimating
          ? 'transform 2.4s cubic-bezier(0.16,1,0.3,1), opacity 0.6s ease'
          : 'opacity 600ms ease, transform 0.8s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={gridLayer} />
        <div style={topoLayer} />
        <div style={coordLine('h', '28%')} />
        <div style={coordLine('h', '50%')} />
        <div style={coordLine('h', '72%')} />
        <div style={coordLine('v', '22%')} />
        <div style={coordLine('v', '50%')} />
        <div style={coordLine('v', '78%')} />
      </div>

      {/* Localizador pulsante */}
      {dotVisible && (
        <div style={locatorWrap}>
          <div style={locatorRing1} />
          <div style={locatorRing2} />
          <div style={locatorDot} />
        </div>
      )}

      {/* HUD de zoom */}
      {isAnimating && (
        <div style={zoomHUD}>
          <div style={hudChip}>SAGA ENGINE · OP MODE</div>
          <div style={hudLabel}>LOCALIZANDO OPERATIVO</div>
          <div style={hudName}>{playerName.toUpperCase()}</div>
          <div style={hudCoords}>40°25′N  3°41′O</div>
          <div style={hudBar}><div style={hudBarFill} /></div>
        </div>
      )}

      {/* Panel GPS */}
      {(phase === 'gps' || phase === 'gps_waiting') && (
        <div style={panel}>
          <div style={panelIcon}>📡</div>
          <div style={panelTitle}>ACCESO A UBICACIÓN</div>
          <p style={panelBody}>
            SAGA necesita tu posición GPS para sincronizar zonas de operación y misiones de campo.
          </p>
          {gpsError && <p style={errorText}>{gpsError}</p>}
          <button style={btnPrimary} onClick={requestGPS} disabled={phase === 'gps_waiting'}>
            {phase === 'gps_waiting' ? 'ESPERANDO···' : 'PERMITIR UBICACIÓN'}
          </button>
          <button style={btnGhost} onClick={() => { setGpsError(''); setPhase('mission') }}>
            Ahora no
          </button>
        </div>
      )}

      {/* Panel Misión */}
      {phase === 'mission' && (
        <div style={panel}>
          <div style={panelIcon}>📦</div>
          <div style={panelTitle}>PAQUETE DE MISIÓN</div>
          <p style={panelBody}>
            {hasMissionCached
              ? 'Misión almacenada y lista. Opera offline cuando sea necesario.'
              : 'Descarga el paquete para acceso offline en campo.'}
          </p>
          <button style={btnPrimary} onClick={handleMissionReady}>
            {hasMissionCached ? 'INICIAR OPERACIÓN →' : 'DESCARGAR E INICIAR →'}
          </button>
        </div>
      )}

      {/* Indicador de espera de tiles */}
      {phase === 'zoom_final' && !mapTilesReady && (
        <div style={tilesWait}>
          <div style={tilesSpinner} />
          <span>Cargando mapa···</span>
        </div>
      )}
    </div>
  )
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
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
  backgroundImage: `linear-gradient(rgba(0,200,150,.07) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0,200,150,.07) 1px, transparent 1px)`,
  backgroundSize: '48px 48px',
}
const topoLayer: CSSProperties = {
  position: 'absolute', inset: 0,
  backgroundImage: `radial-gradient(ellipse 60% 30% at 40% 55%, rgba(0,200,150,.04) 0%, transparent 70%),
                    radial-gradient(ellipse 40% 20% at 65% 45%, rgba(0,180,130,.03) 0%, transparent 70%)`,
}
function coordLine(dir: 'h' | 'v', pos: string): CSSProperties {
  return {
    position: 'absolute',
    ...(dir === 'h' ? { left: 0, right: 0, top: pos, height: 1 }
                    : { top: 0, bottom: 0, left: pos, width: 1 }),
    background: 'rgba(0,200,150,.12)',
  }
}
const locatorWrap: CSSProperties = {
  position: 'absolute', top: '50%', left: '50%',
  transform: 'translate(-50%,-50%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  pointerEvents: 'none',
}
const locatorRing1: CSSProperties = {
  position: 'absolute', width: 80, height: 80, borderRadius: '50%',
  border: '1.5px solid rgba(0,200,150,.4)',
  animation: 'saga-locator-ring 2s ease-out infinite',
}
const locatorRing2: CSSProperties = {
  position: 'absolute', width: 140, height: 140, borderRadius: '50%',
  border: '1px solid rgba(0,200,150,.2)',
  animation: 'saga-locator-ring 2s ease-out 0.6s infinite',
}
const locatorDot: CSSProperties = {
  width: 12, height: 12, borderRadius: '50%',
  background: '#00c896',
  boxShadow: '0 0 16px rgba(0,200,150,.9), 0 0 40px rgba(0,200,150,.4)',
}
const zoomHUD: CSSProperties = {
  position: 'absolute', bottom: '13%', left: '50%',
  transform: 'translateX(-50%)',
  textAlign: 'center', display: 'grid', gap: 6,
  animation: 'saga-rise 400ms 1.4s both',
  pointerEvents: 'none',
}
const hudChip: CSSProperties = {
  display: 'inline-block', margin: '0 auto 4px',
  background: 'rgba(0,200,150,.12)', border: '1px solid rgba(0,200,150,.25)',
  borderRadius: 20, padding: '2px 12px',
  fontFamily: 'var(--saga-font-hud)', fontSize: 9, fontWeight: 700,
  letterSpacing: '0.22em', color: 'rgba(0,200,150,.8)', textTransform: 'uppercase',
}
const hudLabel: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.28em', color: 'rgba(0,200,150,.7)', textTransform: 'uppercase',
}
const hudName: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 28, fontWeight: 700,
  letterSpacing: '0.04em', color: '#e8f0f4',
}
const hudCoords: CSSProperties = {
  fontFamily: 'monospace', fontSize: 11,
  color: 'rgba(0,200,150,.55)', letterSpacing: '0.12em',
}
const hudBar: CSSProperties = {
  height: 2, width: 160, background: 'rgba(0,200,150,.15)',
  borderRadius: 2, margin: '4px auto 0', overflow: 'hidden',
}
const hudBarFill: CSSProperties = {
  height: '100%', width: '100%', background: '#00c896',
  borderRadius: 2, transformOrigin: 'left',
  animation: 'saga-bar-fill 2.4s cubic-bezier(0.16,1,0.3,1) forwards',
}
const panel: CSSProperties = {
  position: 'relative', zIndex: 10,
  width: 'min(calc(100% - 32px), 360px)',
  padding: '32px 28px',
  background: 'rgba(10,16,20,0.85)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(0,200,150,.22)',
  boxShadow: '0 0 0 1px rgba(0,200,150,.06), 0 24px 60px rgba(0,0,0,.7)',
  borderRadius: 20,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 16, textAlign: 'center',
  animation: 'saga-rise 350ms cubic-bezier(0.16,1,0.3,1) both',
}
const panelIcon: CSSProperties = { fontSize: 44, lineHeight: 1 }
const panelTitle: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 18, fontWeight: 700,
  letterSpacing: '0.10em', color: '#e8f0f4',
}
const panelBody: CSSProperties = {
  fontSize: 14, lineHeight: 1.65, color: 'rgba(200,216,224,.75)', maxWidth: '26ch',
}
const errorText: CSSProperties = { fontSize: 12, color: '#f59e0b' }
const btnPrimary: CSSProperties = {
  width: '100%', minHeight: 48, borderRadius: 10,
  background: '#00c896', border: 0, color: '#050a0d',
  fontFamily: 'var(--saga-font-hud)', fontSize: 13, fontWeight: 800,
  letterSpacing: '0.14em', cursor: 'pointer',
  boxShadow: '0 0 24px rgba(0,200,150,.35)',
  transition: 'background 150ms',
}
const btnGhost: CSSProperties = {
  background: 'none', border: 0, color: 'rgba(200,216,224,.45)',
  fontSize: 13, cursor: 'pointer', padding: 8,
}
const tilesWait: CSSProperties = {
  position: 'absolute', bottom: '8%', left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex', alignItems: 'center', gap: 8,
  color: 'rgba(0,200,150,.6)', fontSize: 12,
  fontFamily: 'var(--saga-font-hud)', letterSpacing: '0.12em',
}
const tilesSpinner: CSSProperties = {
  width: 14, height: 14, borderRadius: '50%',
  border: '2px solid rgba(0,200,150,.2)',
  borderTopColor: '#00c896',
  animation: 'spin 0.8s linear infinite',
}

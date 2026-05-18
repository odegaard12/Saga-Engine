import { useEffect, useState, type CSSProperties } from 'react'

type Phase =
  | 'zoom'          // animación zoom desde arriba
  | 'gps'           // pedir permiso GPS
  | 'gps_waiting'   // esperando respuesta del navegador
  | 'mission'       // descargar misión
  | 'done'          // todo listo, mostrar mapa

interface Props {
  playerName: string
  hasMissionCached: boolean
  onDone: (coords: GeolocationCoordinates | null) => void
}

const GPS_KEY = 'saga_gps_granted'
const FIRST_RUN_KEY = 'saga_first_run_done'

export default function FirstRunGate({ playerName, hasMissionCached, onDone }: Props) {
  const [phase, setPhase]         = useState<Phase>('zoom')
  const [coords, setCoords]       = useState<GeolocationCoordinates | null>(null)
  const [gpsError, setGpsError]   = useState('')
  const [missionOk, setMissionOk] = useState(hasMissionCached)
  const [zoomReady, setZoomReady] = useState(false)

  const alreadyGranted = localStorage.getItem(GPS_KEY) === '1'
  const firstRunDone   = localStorage.getItem(FIRST_RUN_KEY) === '1'

  // Si ya pasó por todo antes, skip directo
  useEffect(() => {
    if (firstRunDone && alreadyGranted) {
      // Solo animar zoom rápido, sin pedir nada
      setTimeout(() => onDone(null), 800)
      return
    }
    // Arrancar zoom
    setTimeout(() => setZoomReady(true), 100)
    setTimeout(() => {
      if (alreadyGranted) {
        setPhase('mission')
      } else {
        setPhase('gps')
      }
    }, 2200)
  }, [])

  function requestGPS() {
    setPhase('gps_waiting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords(pos.coords)
        localStorage.setItem(GPS_KEY, '1')
        setPhase('mission')
      },
      () => {
        setGpsError('GPS denegado. Puedes activarlo desde Herramientas.')
        setPhase('mission') // continuar sin GPS
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function skipGPS() {
    setPhase('mission')
  }

  function completeMission() {
    localStorage.setItem(FIRST_RUN_KEY, '1')
    setMissionOk(true)
    setPhase('done')
    setTimeout(() => onDone(coords), 600)
  }

  // FASE: zoom animado desde arriba
  if (phase === 'zoom') {
    return (
      <div style={overlay}>
        <div style={{ ...mapZoom, transform: zoomReady ? 'scale(1)' : 'scale(4)', opacity: zoomReady ? 1 : 0.4, transition: 'transform 2s cubic-bezier(0.16,1,0.3,1), opacity 1s ease-out' }}>
          <div style={mapGrid} />
          <div style={mapPulse} />
        </div>
        <div style={zoomLabel}>
          <div style={zoomTitle}>LOCALIZANDO OPERATIVO</div>
          <div style={zoomSub}>{playerName.toUpperCase()}</div>
        </div>
      </div>
    )
  }

  // FASE: pedir GPS
  if (phase === 'gps' || phase === 'gps_waiting') {
    return (
      <div style={overlay}>
        <div style={gate}>
          <div style={gateIcon}>📡</div>
          <div style={gateTitle}>ACCESO GPS</div>
          <p style={gateBody}>
            SAGA necesita tu ubicación para sincronizar misiones y zonas de operación.
          </p>
          {gpsError && <p style={errorText}>{gpsError}</p>}
          <button
            style={btnPrimary}
            onClick={requestGPS}
            disabled={phase === 'gps_waiting'}
          >
            {phase === 'gps_waiting' ? 'ESPERANDO···' : 'PERMITIR UBICACIÓN'}
          </button>
          <button style={btnGhost} onClick={skipGPS}>
            Ahora no
          </button>
        </div>
      </div>
    )
  }

  // FASE: descargar misión
  if (phase === 'mission') {
    return (
      <div style={overlay}>
        <div style={gate}>
          <div style={gateIcon}>📦</div>
          <div style={gateTitle}>PAQUETE DE MISIÓN</div>
          <p style={gateBody}>
            {hasMissionCached
              ? 'Misión almacenada lista. Puedes continuar offline.'
              : 'Descarga el paquete de misión para operar sin conexión.'}
          </p>
          <button style={btnPrimary} onClick={completeMission}>
            {hasMissionCached ? 'CONTINUAR →' : 'DESCARGAR Y ENTRAR →'}
          </button>
        </div>
      </div>
    )
  }

  // FASE: done — fade out
  if (phase === 'done') {
    return <div style={{ ...overlay, opacity: 0, transition: 'opacity 600ms ease-out', pointerEvents: 'none' }} />
  }

  return null
}

// --- Estilos ---
const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'var(--saga-bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexDirection: 'column',
}
const mapZoom: CSSProperties = {
  position: 'absolute', inset: 0,
  background: 'radial-gradient(circle at 50% 50%, #0a2a1a 0%, var(--saga-bg) 70%)',
  transformOrigin: '50% 60%',
}
const mapGrid: CSSProperties = {
  position: 'absolute', inset: 0,
  backgroundImage: `linear-gradient(rgba(0,200,150,.06) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0,200,150,.06) 1px, transparent 1px)`,
  backgroundSize: '32px 32px',
}
const mapPulse: CSSProperties = {
  position: 'absolute', top: '50%', left: '50%',
  width: 120, height: 120,
  transform: 'translate(-50%,-50%)',
  borderRadius: '50%',
  border: '2px solid var(--saga-accent)',
  boxShadow: '0 0 40px var(--saga-accent-glow), inset 0 0 40px var(--saga-accent-dim)',
  animation: 'saga-pulse-glow 2s ease-in-out infinite',
}
const zoomLabel: CSSProperties = {
  position: 'relative', zIndex: 2, textAlign: 'center',
  animation: 'saga-rise 400ms 1.4s both',
}
const zoomTitle: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.28em', color: 'var(--saga-accent)',
  textTransform: 'uppercase', marginBottom: 8,
}
const zoomSub: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 28, fontWeight: 700,
  letterSpacing: '0.06em', color: 'var(--saga-text)',
}
const gate: CSSProperties = {
  position: 'relative', zIndex: 2,
  width: 'min(100%,360px)', padding: 'var(--s8) var(--s6)',
  background: 'var(--saga-glass)',
  backdropFilter: 'var(--saga-glass-blur)',
  WebkitBackdropFilter: 'var(--saga-glass-blur)',
  border: 'var(--saga-glass-border)',
  boxShadow: 'var(--saga-glass-shadow)',
  borderRadius: 'var(--r-xl)',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 'var(--s4)', textAlign: 'center',
  animation: 'saga-rise 350ms cubic-bezier(0.16,1,0.3,1) both',
}
const gateIcon: CSSProperties = { fontSize: 40 }
const gateTitle: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 20, fontWeight: 700,
  letterSpacing: '0.08em', color: 'var(--saga-text)',
}
const gateBody: CSSProperties = {
  fontSize: 14, lineHeight: 1.6, color: 'var(--saga-text-muted)', maxWidth: '28ch',
}
const errorText: CSSProperties = {
  fontSize: 12, color: 'var(--saga-amber)', textAlign: 'center',
}
const btnPrimary: CSSProperties = {
  width: '100%', minHeight: 46, borderRadius: 'var(--r-md)',
  background: 'var(--saga-accent)', border: 0,
  color: 'var(--saga-text-inverse)',
  fontFamily: 'var(--saga-font-hud)', fontSize: 13, fontWeight: 800,
  letterSpacing: '0.12em', cursor: 'pointer',
  boxShadow: 'var(--shadow-accent)',
  transition: 'background var(--t-fast)',
}
const btnGhost: CSSProperties = {
  background: 'none', border: 0,
  color: 'var(--saga-text-muted)', fontSize: 13,
  cursor: 'pointer', padding: 'var(--s2)',
  transition: 'color var(--t-fast)',
}

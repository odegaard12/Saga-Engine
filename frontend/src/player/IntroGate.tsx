/**
 * IntroGate — pantalla de bienvenida de primera ejecución.
 *
 * Flujo:
 *   1. OPACO total (fondo negro, mapa NO visible) → pedir GPS + descargar assets
 *   2. Al pulsar "ACTIVAR Y DESCARGAR" → pide GPS al teléfono + descarga pack de misión en paralelo
 *   3. Cuando ambos terminan → fade-out + onDone(coords)  → MapSurface hace flyTo
 *
 * Visitas posteriores (FIRST_RUN_KEY === '1'): no se monta, mapa carga directo.
 */
import { useRef, useState, type CSSProperties } from 'react'

export const FIRST_RUN_KEY = 'saga_first_run_done'
export const GPS_KEY       = 'saga_gps_granted'

export function shouldShowIntro(): boolean {
  try { return localStorage.getItem(FIRST_RUN_KEY) !== '1' } catch { return false }
}
function markDone()       { try { localStorage.setItem(FIRST_RUN_KEY, '1') } catch {} }
function markGpsGranted() { try { localStorage.setItem(GPS_KEY, '1')       } catch {} }

type Phase = 'idle' | 'loading' | 'done'

interface Props {
  playerName: string
  playerHref: string   // URL del endpoint de misión para precargar
  onDone: (coords: { lat: number; lon: number } | null) => void
}

export default function IntroGate({ playerName, playerHref, onDone }: Props) {
  const [phase, setPhase]     = useState<Phase>('idle')
  const [status, setStatus]   = useState('')
  const [error, setError]     = useState('')
  const [fadeOut, setFadeOut] = useState(false)
  const coordsRef             = useRef<{ lat: number; lon: number } | null>(null)

  async function handleActivate() {
    setPhase('loading')
    setError('')
    setStatus('Solicitando GPS···')

    // GPS + descarga de misión en paralelo
    const [gpsResult] = await Promise.allSettled([
      // 1. GPS
      new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true, timeout: 15000,
        })
      ),
    ])

    if (gpsResult.status === 'fulfilled') {
      coordsRef.current = {
        lat: gpsResult.value.coords.latitude,
        lon: gpsResult.value.coords.longitude,
      }
      markGpsGranted()
      setStatus('GPS obtenido ✓  Descargando misión···')
    } else {
      setError('GPS denegado — puedes activarlo desde Herramientas.')
      setStatus('Descargando misión···')
    }

    // 2. Precarga de la página de misión (carga el SW cache)
    try {
      await fetch(playerHref, { cache: 'reload' })
      setStatus('Todo listo ✓')
    } catch {
      setStatus('Sin conexión — modo offline activo')
    }

    // Pequeña pausa para que el usuario vea el estado final
    await new Promise(r => setTimeout(r, 700))

    markDone()
    setFadeOut(true)
    setTimeout(() => onDone(coordsRef.current), 450)
  }

  return (
    <div style={{ ...overlay, opacity: fadeOut ? 0 : 1, transition: 'opacity 420ms ease' }}>
      <div style={{ ...panel, transform: fadeOut ? 'translateY(12px) scale(0.97)' : 'translateY(0) scale(1)', transition: 'opacity 420ms ease, transform 420ms ease' }}>

        {/* Marca */}
        <div style={brand}>
          <div style={sagaLogo}>SAGA</div>
          <div style={opTag}>OPERATIVO: {playerName.toUpperCase()}</div>
        </div>
        <div style={divider} />

        {phase === 'idle' && (
          <>
            <div style={iconEl}>🛰️</div>
            <div style={titleEl}>INICIALIZAR SISTEMA</div>
            <p style={bodyEl}>
              Activa el GPS y descarga el paquete de misión para operar en campo — incluso sin conexión.
            </p>
            <button style={btnPrimary} onClick={handleActivate}>
              ACTIVAR GPS Y DESCARGAR MISIÓN
            </button>
          </>
        )}

        {phase === 'loading' && (
          <>
            <div style={iconEl}>⏳</div>
            <div style={titleEl}>INICIALIZANDO···</div>
            <p style={statusEl}>{status}</p>
            {error && <p style={errEl}>{error}</p>}
          </>
        )}

      </div>
    </div>
  )
}

// ── Estilos ──────────────────────────────────────────────────────────────────
// Overlay completamente opaco — el mapa NO se ve detrás en la primera ejecución
const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
  background: '#080c0f',           // negro total, no semitransparente
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '0 16px',
}
const panel: CSSProperties = {
  width: 'min(100%, 360px)',
  padding: '32px 24px 28px',
  background: 'rgba(12,18,22,0.95)',
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  border: '1px solid rgba(0,200,150,.22)',
  boxShadow: '0 0 0 1px rgba(0,200,150,.05), 0 40px 80px rgba(0,0,0,.9)',
  borderRadius: 20,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 16, textAlign: 'center',
}
const brand: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
}
const sagaLogo: CSSProperties = {
  fontFamily: 'var(--saga-font-hud, "Rajdhani", sans-serif)',
  fontSize: 52, fontWeight: 900, letterSpacing: '-0.04em',
  color: '#e8f0f4', lineHeight: 1,
  textShadow: '0 0 40px rgba(0,200,150,.5)',
}
const opTag: CSSProperties = {
  fontFamily: 'var(--saga-font-hud, "Rajdhani", sans-serif)',
  fontSize: 9, fontWeight: 700, letterSpacing: '0.28em',
  color: 'rgba(0,200,150,.85)', textTransform: 'uppercase',
}
const divider: CSSProperties = {
  width: '100%', height: 1,
  background: 'linear-gradient(90deg, transparent, rgba(0,200,150,.2), transparent)',
}
const iconEl: CSSProperties  = { fontSize: 44, lineHeight: 1 }
const titleEl: CSSProperties = {
  fontFamily: 'var(--saga-font-hud, "Rajdhani", sans-serif)',
  fontSize: 18, fontWeight: 700, letterSpacing: '0.08em', color: '#e8f0f4',
}
const bodyEl: CSSProperties = {
  fontSize: 14, lineHeight: 1.7,
  color: 'rgba(200,216,224,.70)', maxWidth: '26ch', margin: 0,
}
const statusEl: CSSProperties = {
  fontSize: 13, color: 'rgba(0,200,150,.85)',
  fontFamily: 'monospace', letterSpacing: '0.04em', margin: 0,
}
const errEl: CSSProperties  = { fontSize: 12, color: '#f59e0b', margin: 0 }
const btnPrimary: CSSProperties = {
  width: '100%', minHeight: 52, borderRadius: 12,
  background: '#00c896', border: 0, color: '#050a0d',
  fontFamily: 'var(--saga-font-hud, "Rajdhani", sans-serif)',
  fontSize: 14, fontWeight: 800, letterSpacing: '0.14em',
  cursor: 'pointer', boxShadow: '0 0 32px rgba(0,200,150,.35)',
  transition: 'opacity 150ms',
}

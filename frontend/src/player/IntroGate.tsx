import { useEffect, useRef, useState, type CSSProperties } from 'react'

export const GPS_KEY       = 'saga_gps_granted'
export const FIRST_RUN_KEY = 'saga_first_run_done'

export function shouldShowIntro(): boolean {
  return localStorage.getItem(FIRST_RUN_KEY) !== '1'
}
export function markIntroDone(): void {
  localStorage.setItem(FIRST_RUN_KEY, '1')
}
export function markGpsGranted(): void {
  localStorage.setItem(GPS_KEY, '1')
}
export function gpsAlreadyGranted(): boolean {
  return localStorage.getItem(GPS_KEY) === '1'
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Phase =
  | 'gps'         // primera vez — pedir GPS
  | 'gps_wait'    // esperando respuesta del navegador
  | 'mission'     // confirmar/descargar misión
  | 'flying'      // saliendo — mapa va a hacer flyTo
  | 'done'        // invisible

interface Props {
  playerName: string
  hasMissionCached: boolean
  onDone: (coords: { lat: number; lon: number } | null) => void
}

export default function IntroGate({ playerName, hasMissionCached, onDone }: Props) {
  const [phase, setPhase]       = useState<Phase>(() =>
    gpsAlreadyGranted() ? 'mission' : 'gps'
  )
  const [gpsError, setGpsError] = useState('')
  const [panelOut, setPanelOut] = useState(false)
  const coordsRef               = useRef<{ lat: number; lon: number } | null>(null)

  // Si ya concedió GPS antes, intentar obtener posición en background
  useEffect(() => {
    if (gpsAlreadyGranted()) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          coordsRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      )
    }
  }, [])

  function requestGPS() {
    setPhase('gps_wait')
    setGpsError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordsRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        markGpsGranted()
        setPhase('mission')
      },
      () => {
        setGpsError('GPS denegado — actívalo desde Herramientas.')
        setPhase('mission')
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  function handleStart() {
    markIntroDone()
    setPhase('flying')
    setPanelOut(true)
    setTimeout(() => {
      onDone(coordsRef.current)
    }, 450)
  }

  if (phase === 'done') return null

  return (
    <>
      {/* Backdrop semitransparente — mapa real visible debajo */}
      <div style={{
        ...backdrop,
        opacity: panelOut ? 0 : 1,
        transition: 'opacity 400ms ease',
        pointerEvents: panelOut ? 'none' : 'all',
      }} />

      {/* Panel flotante */}
      <div style={{
        ...panelWrap,
        opacity: panelOut ? 0 : 1,
        transform: panelOut ? 'translateY(16px) scale(0.97)' : 'translateY(0) scale(1)',
        transition: 'opacity 380ms ease, transform 380ms cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: panelOut ? 'none' : 'all',
      }}>

        {/* ── Panel GPS ── */}
        {(phase === 'gps' || phase === 'gps_wait') && (
          <div style={panel}>
            <div style={brandBlock}>
              <div style={sagaWord}>SAGA</div>
              <div style={operativeTag}>OPERATIVO: {playerName.toUpperCase()}</div>
            </div>
            <div style={sep} />
            <div style={icon}>📡</div>
            <div style={title}>ACCESO A UBICACIÓN</div>
            <p style={body}>
              SAGA necesita tu posición GPS para sincronizar zonas de operación y misiones de campo.
            </p>
            {gpsError && <p style={errText}>{gpsError}</p>}
            <button
              style={{ ...btnPrimary, opacity: phase === 'gps_wait' ? 0.65 : 1 }}
              onClick={requestGPS}
              disabled={phase === 'gps_wait'}
            >
              {phase === 'gps_wait' ? 'ESPERANDO···' : 'PERMITIR UBICACIÓN'}
            </button>
            <button style={btnGhost} onClick={() => setPhase('mission')}>
              Ahora no
            </button>
          </div>
        )}

        {/* ── Panel Misión ── */}
        {phase === 'mission' && (
          <div style={panel}>
            <div style={brandBlock}>
              <div style={sagaWord}>SAGA</div>
              <div style={operativeTag}>OPERATIVO: {playerName.toUpperCase()}</div>
            </div>
            <div style={sep} />
            <div style={icon}>{hasMissionCached ? '🎯' : '📦'}</div>
            <div style={title}>
              {hasMissionCached ? 'LISTO PARA OPERAR' : 'DESCARGAR MISIÓN'}
            </div>
            <p style={body}>
              {hasMissionCached
                ? 'Misión cargada. El mapa volará hasta tu posición.'
                : 'Descarga el paquete de misión para operar sin conexión.'}
            </p>
            {coordsRef.current && (
              <div style={coordsBadge}>
                📍 {coordsRef.current.lat.toFixed(4)}N · {Math.abs(coordsRef.current.lon).toFixed(4)}O
              </div>
            )}
            <button style={btnPrimary} onClick={handleStart}>
              {hasMissionCached ? 'INICIAR OPERACIÓN →' : 'DESCARGAR E INICIAR →'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1500,
  background: 'rgba(5,10,13,0.70)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
}
const panelWrap: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1501,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '0 16px',
}
const panel: CSSProperties = {
  width: 'min(100%, 360px)',
  padding: '28px 24px 24px',
  background: 'rgba(8,12,15,0.92)',
  backdropFilter: 'blur(32px)',
  WebkitBackdropFilter: 'blur(32px)',
  border: '1px solid rgba(0,200,150,.22)',
  boxShadow: '0 0 0 1px rgba(0,200,150,.06), 0 32px 80px rgba(0,0,0,.85)',
  borderRadius: 20,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 14, textAlign: 'center',
  animation: 'saga-rise 320ms cubic-bezier(0.16,1,0.3,1) both',
}
const brandBlock: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
}
const sagaWord: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)',
  fontSize: 44, fontWeight: 900, letterSpacing: '-0.04em',
  color: '#e8f0f4', lineHeight: 1,
  textShadow: '0 0 32px rgba(0,200,150,.45)',
}
const operativeTag: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 9, fontWeight: 700,
  letterSpacing: '0.28em', color: 'rgba(0,200,150,.85)',
  textTransform: 'uppercase',
}
const sep: CSSProperties = {
  width: '100%', height: 1,
  background: 'linear-gradient(90deg, transparent, rgba(0,200,150,.18), transparent)',
}
const icon: CSSProperties = { fontSize: 40, lineHeight: 1 }
const title: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 17, fontWeight: 700,
  letterSpacing: '0.08em', color: '#e8f0f4',
}
const body: CSSProperties = {
  fontSize: 14, lineHeight: 1.65,
  color: 'rgba(200,216,224,.72)', maxWidth: '26ch', margin: 0,
}
const errText: CSSProperties = { fontSize: 12, color: '#f59e0b', margin: 0 }
const coordsBadge: CSSProperties = {
  fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.06em',
  color: 'rgba(0,200,150,.75)',
  background: 'rgba(0,200,150,.08)', borderRadius: 20,
  padding: '4px 14px', border: '1px solid rgba(0,200,150,.15)',
}
const btnPrimary: CSSProperties = {
  width: '100%', minHeight: 48, borderRadius: 10,
  background: '#00c896', border: 0, color: '#050a0d',
  fontFamily: 'var(--saga-font-hud)', fontSize: 13, fontWeight: 800,
  letterSpacing: '0.14em', cursor: 'pointer',
  boxShadow: '0 0 28px rgba(0,200,150,.32)',
  transition: 'opacity 150ms, background 150ms',
}
const btnGhost: CSSProperties = {
  background: 'none', border: 0,
  color: 'rgba(200,216,224,.38)', fontSize: 13,
  cursor: 'pointer', padding: '8px 16px',
}

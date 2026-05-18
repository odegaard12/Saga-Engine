import { useEffect, useRef, useState, type CSSProperties } from 'react'

export const GPS_KEY       = 'saga_gps_granted'
export const FIRST_RUN_KEY = 'saga_first_run_done'

export function shouldShowIntro(): boolean {
  return localStorage.getItem(FIRST_RUN_KEY) !== '1'
}
export function gpsAlreadyGranted(): boolean {
  return localStorage.getItem(GPS_KEY) === '1'
}
export function markIntroDone(): void {
  localStorage.setItem(FIRST_RUN_KEY, '1')
}
export function markGpsGranted(): void {
  localStorage.setItem(GPS_KEY, '1')
}

type Phase = 'gps' | 'gps_waiting' | 'mission' | 'flying' | 'done'

interface Props {
  playerName: string
  hasMissionCached: boolean
  // Callback: cuando el intro termina, devuelve coords si se obtuvo GPS
  onDone: (coords: { lat: number; lon: number } | null) => void
}

export default function IntroGate({ playerName, hasMissionCached, onDone }: Props) {
  const [phase, setPhase]       = useState<Phase>(() =>
    gpsAlreadyGranted() ? 'mission' : 'gps'
  )
  const [gpsError, setGpsError] = useState('')
  const [visible, setVisible]   = useState(true)
  const coordsRef               = useRef<{ lat: number; lon: number } | null>(null)

  function requestGPS() {
    setPhase('gps_waiting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordsRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        markGpsGranted()
        setPhase('mission')
      },
      () => {
        setGpsError('GPS denegado — puedes activarlo desde Herramientas.')
        setPhase('mission')
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  function handleStart() {
    markIntroDone()
    setPhase('flying')
    // Fade out el panel y dejar el mapa libre para el flyTo
    setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDone(coordsRef.current), 100)
    }, 400)
  }

  if (!visible) return null

  return (
    <>
      {/* Fondo semitransparente — el mapa es visible debajo */}
      <div style={{
        ...backdrop,
        opacity: phase === 'flying' ? 0 : 1,
        transition: 'opacity 400ms ease',
      }} />

      {/* Panel central */}
      <div style={{
        ...panelWrap,
        opacity: phase === 'flying' ? 0 : 1,
        transform: phase === 'flying' ? 'translateY(12px)' : 'translateY(0)',
        transition: 'opacity 350ms ease, transform 350ms ease',
      }}>
        {(phase === 'gps' || phase === 'gps_waiting') && (
          <div style={panel}>
            <div style={panelTop}>
              <div style={saga}>SAGA</div>
              <div style={operativeLabel}>OPERATIVO: {playerName.toUpperCase()}</div>
            </div>
            <div style={divider} />
            <div style={panelIcon}>📡</div>
            <div style={panelTitle}>ACCESO A UBICACIÓN</div>
            <p style={panelBody}>
              SAGA necesita tu posición GPS para sincronizar zonas de operación y misiones de campo.
            </p>
            {gpsError && <p style={errorText}>{gpsError}</p>}
            <button
              style={{ ...btnPrimary, opacity: phase === 'gps_waiting' ? 0.7 : 1 }}
              onClick={requestGPS}
              disabled={phase === 'gps_waiting'}
            >
              {phase === 'gps_waiting' ? 'ESPERANDO···' : 'PERMITIR UBICACIÓN'}
            </button>
            <button style={btnGhost} onClick={() => setPhase('mission')}>
              Ahora no
            </button>
          </div>
        )}

        {phase === 'mission' && (
          <div style={panel}>
            <div style={panelTop}>
              <div style={saga}>SAGA</div>
              <div style={operativeLabel}>OPERATIVO: {playerName.toUpperCase()}</div>
            </div>
            <div style={divider} />
            <div style={panelIcon}>🎯</div>
            <div style={panelTitle}>LISTO PARA OPERAR</div>
            <p style={panelBody}>
              {hasMissionCached
                ? 'Misión cargada. El mapa volará hasta tu posición.'
                : 'Paquete de misión descargado. El mapa volará hasta tu posición.'}
            </p>
            {coordsRef.current && (
              <div style={coordsBadge}>
                📍 {coordsRef.current.lat.toFixed(4)}N · {Math.abs(coordsRef.current.lon).toFixed(4)}O
              </div>
            )}
            <button style={btnPrimary} onClick={handleStart}>
              INICIAR OPERACIÓN →
            </button>
          </div>
        )}
      </div>
    </>
  )
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1500,
  background: 'rgba(5,10,13,0.72)',
  backdropFilter: 'blur(2px)',
  WebkitBackdropFilter: 'blur(2px)',
  pointerEvents: 'none',
}
const panelWrap: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1501,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '0 16px',
  pointerEvents: 'none',
}
const panel: CSSProperties = {
  width: 'min(100%, 360px)',
  padding: '28px 24px',
  background: 'rgba(10,16,20,0.90)',
  backdropFilter: 'blur(28px)',
  WebkitBackdropFilter: 'blur(28px)',
  border: '1px solid rgba(0,200,150,.24)',
  boxShadow: '0 0 0 1px rgba(0,200,150,.06), 0 32px 64px rgba(0,0,0,.8)',
  borderRadius: 20,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 14, textAlign: 'center',
  pointerEvents: 'all',
  animation: 'saga-rise 350ms cubic-bezier(0.16,1,0.3,1) both',
}
const panelTop: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
}
const saga: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)',
  fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em',
  color: '#e8f0f4', lineHeight: 1,
  textShadow: '0 0 30px rgba(0,200,150,.4)',
}
const operativeLabel: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 9, fontWeight: 700,
  letterSpacing: '0.28em', color: 'rgba(0,200,150,.8)',
  textTransform: 'uppercase',
}
const divider: CSSProperties = {
  width: '100%', height: 1,
  background: 'linear-gradient(90deg, transparent, rgba(0,200,150,.2), transparent)',
}
const panelIcon: CSSProperties = { fontSize: 38, lineHeight: 1 }
const panelTitle: CSSProperties = {
  fontFamily: 'var(--saga-font-hud)', fontSize: 17, fontWeight: 700,
  letterSpacing: '0.08em', color: '#e8f0f4',
}
const panelBody: CSSProperties = {
  fontSize: 14, lineHeight: 1.65,
  color: 'rgba(200,216,224,.72)', maxWidth: '26ch',
  margin: 0,
}
const errorText: CSSProperties = { fontSize: 12, color: '#f59e0b', margin: 0 }
const coordsBadge: CSSProperties = {
  fontSize: 11, fontFamily: 'monospace',
  color: 'rgba(0,200,150,.7)', letterSpacing: '0.06em',
  background: 'rgba(0,200,150,.08)', borderRadius: 20,
  padding: '4px 12px', border: '1px solid rgba(0,200,150,.15)',
}
const btnPrimary: CSSProperties = {
  width: '100%', minHeight: 48, borderRadius: 10,
  background: '#00c896', border: 0, color: '#050a0d',
  fontFamily: 'var(--saga-font-hud)', fontSize: 13, fontWeight: 800,
  letterSpacing: '0.14em', cursor: 'pointer',
  boxShadow: '0 0 24px rgba(0,200,150,.3)',
  transition: 'background 150ms, opacity 150ms',
}
const btnGhost: CSSProperties = {
  background: 'none', border: 0, color: 'rgba(200,216,224,.4)',
  fontSize: 13, cursor: 'pointer', padding: 8,
}

import { useRef, useState, type CSSProperties } from 'react'
import { fetchPlayerGame, fetchPublicConfig } from '../shared/api'
import { saveMissionPack } from './offline/missionPack'
import { cachePlayerShell } from './offline/pwaShell'
import { markIntroDone, rememberGpsReady } from './utils/gpsStorage'

interface Props {
  playerName: string
  playerHref: string
  playerUser: string
  onDone: (coords: { lat: number; lon: number } | null) => void
}

export default function IntroGate({ playerName, playerHref, playerUser, onDone }: Props) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Preparando acceso al operativo')
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const coordsRef = useRef<{ lat: number; lon: number } | null>(null)

  async function handleActivate() {
    if (loading) return
    setLoading(true)
    setError('')
    setStatus('Solicitando GPS…')

    const gpsPromise = new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        setError('Este dispositivo no soporta GPS.')
        resolve()
        return
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          coordsRef.current = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          }
          rememberGpsReady()
          resolve()
        },
        () => {
          setError('GPS denegado o no disponible. Puedes continuar igualmente.')
          resolve()
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      )
    })

    const missionPromise = (async () => {
      setStatus('Descargando misión y nodos offline…')
      try {
        const [config, offlinePayload] = await Promise.all([
          fetchPublicConfig(),
          fetchPlayerGame(playerUser, { offlinePack: true }),
        ])

        await saveMissionPack({
          user: playerUser,
          config,
          payload: offlinePayload,
        })

        await cachePlayerShell(playerHref).catch(() => undefined)
      } catch {
        // Permitimos continuar aunque falle la descarga offline
      }
    })()

    await Promise.all([gpsPromise, missionPromise])

    setStatus('Sistema listo')
    markIntroDone()

    setTimeout(() => {
      setClosing(true)
      setTimeout(() => onDone(coordsRef.current), 500)
    }, 350)
  }

  return (
    <div style={{ ...overlay, opacity: closing ? 0 : 1 }}>
      <div style={{ ...panel, transform: closing ? 'translateY(10px) scale(0.985)' : 'translateY(0) scale(1)' }}>
        <div style={brand}>SAGA</div>
        <div style={sub}>OPERATIVO: {playerName.toUpperCase()}</div>
        <div style={divider} />
        <div style={icon}>🛰️</div>
        <div style={title}>ACTIVAR GPS Y DESCARGAR MISIÓN</div>
        <p style={body}>
          Inicia el operativo, descarga la misión offline y activa tu posición antes de entrar en el mapa.
        </p>
        <p style={statusText}>{status}</p>
        {error ? <p style={errorText}>{error}</p> : null}
        <button type="button" style={{ ...button, opacity: loading ? 0.72 : 1 }} onClick={handleActivate} disabled={loading}>
          {loading ? 'INICIALIZANDO…' : 'ACTIVAR SISTEMA'}
        </button>
      </div>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: '#06090c',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  transition: 'opacity 420ms ease',
}

const panel: CSSProperties = {
  width: 'min(100%, 360px)',
  borderRadius: 22,
  padding: '30px 24px 24px',
  background: 'rgba(10,16,20,0.96)',
  border: '1px solid rgba(0,200,150,.20)',
  boxShadow: '0 32px 90px rgba(0,0,0,.55)',
  textAlign: 'center',
  transition: 'transform 420ms ease, opacity 420ms ease',
}

const brand: CSSProperties = {
  fontSize: 44,
  fontWeight: 900,
  letterSpacing: '-0.04em',
  color: '#eef7f7',
  lineHeight: 1,
}

const sub: CSSProperties = {
  marginTop: 6,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.24em',
  color: '#11c5a0',
}

const divider: CSSProperties = {
  height: 1,
  margin: '18px 0 20px',
  background: 'linear-gradient(90deg, transparent, rgba(17,197,160,.25), transparent)',
}

const icon: CSSProperties = {
  fontSize: 42,
  lineHeight: 1,
  marginBottom: 14,
}

const title: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: '0.06em',
  color: '#f1f5f9',
}

const body: CSSProperties = {
  margin: '12px auto 0',
  maxWidth: '28ch',
  fontSize: 14,
  lineHeight: 1.65,
  color: 'rgba(226,232,240,.74)',
}

const statusText: CSSProperties = {
  margin: '14px 0 0',
  fontSize: 12,
  color: '#34d399',
  letterSpacing: '0.04em',
}

const errorText: CSSProperties = {
  margin: '10px 0 0',
  fontSize: 12,
  color: '#f59e0b',
}

const button: CSSProperties = {
  marginTop: 18,
  width: '100%',
  minHeight: 50,
  borderRadius: 12,
  border: 0,
  background: '#12d0a3',
  color: '#04110e',
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '0.12em',
  cursor: 'pointer',
}

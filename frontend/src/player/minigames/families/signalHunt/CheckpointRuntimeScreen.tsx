import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedSignalHuntMinigame } from '../../core/resolver'
import { haptics, sounds } from '../../../utils/haptics'

interface Props {
  resolved: ResolvedSignalHuntMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
  /** Posición que ya conoce la app (GPS real o modo debug). */
  appPosition?: { lat: number; lon: number } | null
}

type GpsState = 'idle' | 'requesting' | 'tracking' | 'denied' | 'unsupported' | 'missing_source'

type LatLon = { lat: number; lon: number }

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function haversineMeters(a: LatLon, b: LatLon): number {
  const earthRadius = 6371000
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function formatMeters(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`
  return `${Math.round(value)} m`
}

function getStageCoordinate(stage: PlayerStage): LatLon | null {
  const raw = stage as unknown as Record<string, unknown>
  const location = raw.location as Record<string, unknown> | undefined
  const candidates = [
    { lat: raw.source_lat, lon: raw.source_lon },
    { lat: raw.lat, lon: raw.lon },
    { lat: raw.latitude, lon: raw.longitude },
    { lat: location?.lat, lon: location?.lon },
  ]

  for (const item of candidates) {
    const lat = toNumber(item.lat)
    const lon = toNumber(item.lon)
    if (lat !== null && lon !== null) return { lat, lon }
  }

  return null
}

const STYLES = `
.cp-root {
  width: 100%;
  margin-top: 8px;
  color: rgba(255,255,255,.96);
}
.cp-card {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  padding: 18px 16px;
  background:
    radial-gradient(circle at 50% 0%, rgba(255,255,255,.10), transparent 34%),
    linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
  border: 1px solid rgba(255,255,255,.12);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.13), 0 16px 42px rgba(0,0,0,.16);
  backdrop-filter: blur(22px) saturate(1.18);
  display: grid;
  gap: 14px;
  text-align: center;
}
.cp-overline {
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: rgba(226,238,255,.54);
  font-weight: 800;
}
.cp-distance {
  font-size: 34px;
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
}
.cp-distance small {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(226,238,255,.6);
}
.cp-status {
  font-size: 13px;
  font-weight: 700;
  color: rgba(226,238,255,.78);
  line-height: 1.4;
}
.cp-btn {
  width: 100%;
  min-height: 54px;
  border: none;
  border-radius: 18px;
  background: linear-gradient(135deg, rgb(var(--theme-ok)), rgb(var(--theme-ok-deep)));
  color: #022c22;
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(var(--theme-ok), .35);
}
.cp-btn:disabled {
  background: rgba(255,255,255,.10);
  color: rgba(255,255,255,.45);
  box-shadow: none;
  cursor: default;
}
.cp-fallback {
  font-size: 11px;
  color: rgba(226,238,255,.5);
  font-weight: 600;
}
`

export function CheckpointRuntimeScreen({ resolved, stage, submitting, onWin, appPosition = null }: Props) {
  const cfg = resolved.config as unknown as Record<string, unknown>

  const source = useMemo(() => {
    const sourceLat = toNumber(cfg.source_lat)
    const sourceLon = toNumber(cfg.source_lon)
    if (sourceLat !== null && sourceLon !== null) return { lat: sourceLat, lon: sourceLon }
    return getStageCoordinate(stage)
  }, [cfg.source_lat, cfg.source_lon, stage])

  const hasSource = source !== null

  // El radio del nodo manda: es el que se ve en admin y el que decide el
  // desbloqueo. Antes se usaba primero config.source_radius_m, así que el
  // jugador veía 30 m donde el admin ponía 40.
  const stageRadius = toNumber((stage as unknown as Record<string, unknown>).radius)
  const radius = Math.max(5, Number(stageRadius ?? cfg.source_radius_m ?? 50) || 50)

  const requireProximity =
    (stage as unknown as Record<string, unknown>).require_proximity !== false

  const [gpsState, setGpsState] = useState<GpsState>(hasSource ? 'idle' : 'missing_source')
  const [ownPosition, setOwnPosition] = useState<LatLon | null>(null)

  /**
   * La posición de la app manda.
   *
   * Antes esta pantalla abría su PROPIO watchPosition e ignoraba lo que la app
   * ya sabía. Con el modo debug (tocar el mapa) el checkpoint no se completaba
   * nunca: el mapa decía "ya puedes abrir este nodo" y aquí dentro seguía
   * "Buscando tu posición GPS...". Además gastaba batería con un segundo GPS.
   */
  const position = appPosition || ownPosition
  const watchIdRef = useRef<number | null>(null)
  const wonRef = useRef(false)

  const distance = useMemo(() => {
    if (!source || !position) return null
    return haversineMeters(position, source)
  }, [position, source])

  useEffect(() => {
    if (!hasSource || !requireProximity) return
    // Si la app ya nos da posición, no hace falta un segundo GPS.
    if (appPosition) {
      setGpsState('tracking')
      return
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsState('unsupported')
      return
    }

    setGpsState('requesting')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (reading) => {
        setOwnPosition({ lat: reading.coords.latitude, lon: reading.coords.longitude })
        setGpsState('tracking')
      },
      () => setGpsState('denied'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [hasSource, requireProximity, appPosition])

  const inRange = distance !== null && distance <= radius
  const gpsBroken = gpsState === 'denied' || gpsState === 'unsupported'
  const canComplete =
    !requireProximity || !hasSource || inRange || gpsBroken

  const statusText = !hasSource
    ? 'Este punto no tiene coordenadas. Puedes continuar.'
    : !requireProximity
      ? 'Punto informativo. Lee el texto y continúa.'
      : gpsState === 'requesting' || gpsState === 'idle'
        ? 'Buscando tu posición GPS…'
        : gpsState === 'denied'
          ? 'Sin permiso de ubicación. Puedes continuar manualmente.'
          : gpsState === 'unsupported'
            ? 'Este navegador no permite GPS. Puedes continuar manualmente.'
            : inRange
              ? '¡Has llegado al punto de control!'
              : 'Acércate al punto marcado en el mapa.'

  async function handleComplete() {
    if (wonRef.current || submitting) return
    wonRef.current = true
    haptics.signalLock()
    sounds.signalLock()
    await onWin()
  }

  return (
    <div className="cp-root">
      <style>{STYLES}</style>
      <div className="cp-card">
        <span className="cp-overline">📍 Punto de control</span>

        {requireProximity && hasSource ? (
          <div className="cp-distance">
            {formatMeters(distance)}
            <small>Distancia al punto · zona de {Math.round(radius)} m</small>
          </div>
        ) : null}

        <div className="cp-status">{statusText}</div>

        <button
          type="button"
          className="cp-btn"
          disabled={!canComplete || submitting}
          onClick={() => void handleComplete()}
        >
          {submitting ? 'Registrando…' : canComplete ? '✅ He llegado · Continuar' : '🚶 Acércate para continuar'}
        </button>

        {requireProximity && hasSource && !inRange && !gpsBroken ? (
          <span className="cp-fallback">
            Si el GPS falla, pide al monitor el código de emergencia del nodo.
          </span>
        ) : null}
      </div>
    </div>
  )
}

export default CheckpointRuntimeScreen

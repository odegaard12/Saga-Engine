import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedSignalHuntMinigame } from '../../core/resolver'
import { haptics, sounds } from '../../../utils/haptics'

interface Props {
  resolved: ResolvedSignalHuntMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

type GpsState =
  'idle' | 'requesting' | 'tracking' | 'denied' | 'unsupported' | 'missing_source' | 'locked'

type LatLon = {
  lat: number
  lon: number
}

type PositionReading = LatLon & {
  accuracy: number | null
  timestamp: number
}

const STYLES = `
.sh-root {
  --sh-text: rgba(255,255,255,.96);
  --sh-muted: rgba(226,238,255,.54);
  --sh-soft: rgba(226,238,255,.32);
  --sh-line: rgba(255,255,255,.12);
  --sh-accent: rgba(108,221,255,1);
  --sh-accent-soft: rgba(108,221,255,.18);
  --sh-hot: rgba(120,248,197,1);
  --sh-warn: rgba(255,210,124,1);

  width: 100%;
  margin-top: 8px;
  color: var(--sh-text);
}

.sh-root.is-rising {
  --sh-accent: rgba(137,216,255,1);
  --sh-accent-soft: rgba(137,216,255,.2);
}

.sh-root.is-window {
  --sh-accent: rgba(120,248,197,1);
  --sh-accent-soft: rgba(120,248,197,.28);
}

.sh-root.is-locked {
  --sh-accent: rgba(178,255,210,1);
  --sh-accent-soft: rgba(178,255,210,.33);
}

.sh-card {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 14px 14px 13px;
  background:
    radial-gradient(circle at 50% 0%, rgba(255,255,255,.105), transparent 30%),
    radial-gradient(circle at 78% 20%, var(--sh-accent-soft), transparent 34%),
    radial-gradient(circle at 22% 62%, rgba(116,145,255,.10), transparent 38%),
    linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
  border: 1px solid rgba(255,255,255,.115);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.13),
    0 16px 42px rgba(0,0,0,.16);
  backdrop-filter: blur(22px) saturate(1.18);
}

.sh-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255,255,255,.105), transparent 22%),
    radial-gradient(circle at center, rgba(255,255,255,.045), transparent 52%);
  opacity: .75;
}

.sh-top {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 13px;
}

.sh-mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sh-pulse {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--sh-accent);
  box-shadow: 0 0 16px var(--sh-accent);
}

.sh-overline {
  display: block;
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--sh-muted);
}

.sh-live {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.075);
  border: 1px solid rgba(255,255,255,.105);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.09);
  white-space: nowrap;
}

.sh-live span {
  font-size: 10px;
  letter-spacing: .13em;
  text-transform: uppercase;
  color: var(--sh-muted);
}

.sh-live strong {
  font-size: 12px;
  color: rgba(255,255,255,.9);
}

.sh-command {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 5px;
  text-align: center;
  margin: 4px 0 12px;
}

.sh-command-main {
  font-size: clamp(36px, 9.8vw, 56px);
  line-height: .9;
  letter-spacing: -.066em;
  font-weight: 880;
  text-transform: uppercase;
  text-shadow: 0 12px 38px rgba(0,0,0,.28);
}

.sh-command-main.is-small {
  font-size: clamp(31px, 8.5vw, 48px);
}

.sh-command-sub {
  font-size: 10px;
  letter-spacing: .15em;
  text-transform: uppercase;
  color: var(--sh-muted);
}

.sh-instrument {
  position: relative;
  z-index: 2;
  width: min(62vw, 250px);
  aspect-ratio: 1;
  margin: 0 auto 12px;
  display: grid;
  place-items: center;
  border-radius: 999px;
}

.sh-ring-progress {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background:
    conic-gradient(from -90deg, var(--sh-accent) var(--capture-deg), rgba(255,255,255,.085) var(--capture-deg) 360deg);
  box-shadow:
    0 0 32px var(--sh-accent-soft),
    inset 0 0 0 1px rgba(255,255,255,.07);
}

.sh-ring-progress::after {
  content: "";
  position: absolute;
  inset: 7px;
  border-radius: inherit;
  background:
    radial-gradient(circle at 50% 24%, rgba(255,255,255,.14), transparent 27%),
    linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.13),
    inset 0 -24px 45px rgba(0,0,0,.18);
}

.sh-field {
  position: absolute;
  inset: 15px;
  border-radius: 999px;
  overflow: hidden;
  background:
    radial-gradient(circle at center, var(--sh-accent-soft) 0 7%, transparent 8%),
    radial-gradient(circle at center, transparent 0 34%, rgba(255,255,255,.052) 35%, transparent 36%),
    radial-gradient(circle at center, transparent 0 54%, rgba(255,255,255,.052) 55%, transparent 56%),
    radial-gradient(circle at center, transparent 0 73%, rgba(255,255,255,.052) 74%, transparent 75%),
    conic-gradient(from 0deg, rgba(255,255,255,.12), transparent 26deg 66deg, rgba(255,255,255,.08) 92deg, transparent 124deg 214deg, rgba(255,255,255,.07) 260deg, transparent 300deg);
  border: 1px solid rgba(255,255,255,.085);
  box-shadow: inset 0 0 48px rgba(0,0,0,.22);
}

.sh-field::before,
.sh-field::after {
  content: "";
  position: absolute;
  inset: calc(50% - var(--wave-size) / 2);
  width: var(--wave-size);
  height: var(--wave-size);
  border-radius: 999px;
  border: 1px solid var(--sh-accent);
  opacity: var(--wave-opacity);
  transform: scale(var(--wave-scale));
  box-shadow: 0 0 24px var(--sh-accent-soft);
}

.sh-field::before {
  --wave-size: 58%;
  --wave-opacity: .22;
  --wave-scale: var(--signal-scale);
}

.sh-field::after {
  --wave-size: 82%;
  --wave-opacity: .12;
  --wave-scale: calc(.72 + var(--signal-ratio) * .34);
}

.sh-sweep {
  position: absolute;
  inset: 18px;
  border-radius: 999px;
  background: conic-gradient(from var(--sweep-rotation), transparent 0deg, rgba(255,255,255,.12) 12deg, var(--sh-accent-soft) 28deg, transparent 54deg);
  mask-image: radial-gradient(circle at center, transparent 0 16%, black 18% 100%);
  opacity: .9;
  animation: shSweep 4.2s linear infinite;
}

.sh-core {
  position: relative;
  z-index: 2;
  width: 42%;
  aspect-ratio: 1;
  border-radius: 999px;
  display: grid;
  place-items: center;
  text-align: center;
  background:
    radial-gradient(circle at 50% 18%, rgba(255,255,255,.2), transparent 32%),
    radial-gradient(circle at center, var(--sh-accent-soft), rgba(255,255,255,.075) 58%);
  border: 1px solid rgba(255,255,255,.13);
  box-shadow:
    0 12px 32px rgba(0,0,0,.18),
    0 0 calc(8px + var(--signal-ratio) * 32px) var(--sh-accent-soft),
    inset 0 1px 0 rgba(255,255,255,.13);
  backdrop-filter: blur(18px);
}

.sh-core strong {
  display: block;
  font-size: clamp(26px, 7vw, 39px);
  line-height: .92;
  letter-spacing: -.06em;
}

.sh-core span {
  display: block;
  margin-top: 4px;
  font-size: 8px;
  letter-spacing: .17em;
  text-transform: uppercase;
  color: var(--sh-muted);
}

.sh-lock-burst {
  position: absolute;
  inset: 5px;
  border-radius: 999px;
  border: 1px solid rgba(178,255,210,.52);
  opacity: 0;
  pointer-events: none;
}

.sh-root.is-window .sh-core {
  animation: shCorePulse 760ms ease-in-out infinite;
}

.sh-root.is-locked .sh-lock-burst {
  animation: shLock .95s ease-out both;
}

.sh-meter {
  position: relative;
  z-index: 2;
  height: 9px;
  border-radius: 999px;
  background: rgba(255,255,255,.075);
  border: 1px solid rgba(255,255,255,.065);
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.055);
  margin-bottom: 10px;
}

.sh-meter-fill {
  height: 100%;
  width: var(--signal-pct);
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(108,221,255,.82), var(--sh-accent));
  box-shadow: 0 0 22px var(--sh-accent-soft);
  transition: width 260ms ease-out;
}

.sh-threshold {
  position: absolute;
  top: -2px;
  bottom: -2px;
  left: var(--threshold-pct);
  width: 2px;
  transform: translateX(-1px);
  border-radius: 999px;
  background: var(--sh-warn);
  box-shadow: 0 0 16px rgba(255,210,124,.5);
}

.sh-metrics {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  align-items: center;
  padding-top: 2px;
}

.sh-readout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,.052);
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
  color: rgba(255,255,255,.88);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.sh-readout span {
  color: var(--sh-muted);
  letter-spacing: .02em;
}

.sh-readout strong {
  color: rgba(255,255,255,.94);
  font-weight: 820;
  letter-spacing: -.015em;
}

.sh-readout i {
  width: 3px;
  height: 3px;
  border-radius: 999px;
  background: rgba(255,255,255,.28);
}

.sh-sensor {
  position: relative;
  z-index: 2;
  margin-top: 10px;
  padding: 11px;
  border-radius: 18px;
  background: rgba(0,0,0,.13);
  border: 1px solid rgba(255,255,255,.08);
}

.sh-sensor-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: rgba(255,255,255,.82);
  font-size: 12px;
  font-weight: 720;
}

.sh-sensor p {
  margin: 5px 0 0;
  color: var(--sh-muted);
  font-size: 12px;
  line-height: 1.36;
}

.sh-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.sh-button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 9px 12px;
  background: var(--sh-accent);
  color: rgba(3,12,18,.95);
  font-size: 12px;
  font-weight: 820;
  cursor: pointer;
}

.sh-button.sh-ghost {
  color: rgba(255,255,255,.82);
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
}

@keyframes shSweep {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes shCorePulse {
  0%, 100% { transform: scale(.985); }
  50% { transform: scale(1.025); }
}

@keyframes shLock {
  0% { opacity: 0; transform: scale(.88); }
  22% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.16); }
}

@media (max-width: 420px) {
  .sh-card {
    border-radius: 26px;
    padding: 13px;
  }

  .sh-instrument {
    width: min(60vw, 238px);
  }

  .sh-command {
    margin-bottom: 10px;
  }

  .sh-readout {
    gap: 7px;
    padding-inline: 10px;
    font-size: 11px;
  }
}
`

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

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

function curveSignal(closeness: number, curve: 'linear' | 'smooth' | 'steep'): number {
  const x = clamp(closeness, 0, 1)

  if (curve === 'linear') return x
  if (curve === 'steep') return x ** 2.2

  return x * x * (3 - 2 * x)
}

function formatMeters(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}km`
  return `${Math.round(value)}m`
}

function getStageCoordinate(stage: PlayerStage): LatLon | null {
  const raw = stage as unknown as Record<string, unknown>
  const candidates = [
    { lat: raw.source_lat, lon: raw.source_lon },
    { lat: raw.lat, lon: raw.lon },
    { lat: raw.latitude, lon: raw.longitude },
    { lat: raw.gps_lat, lon: raw.gps_lon },
    {
      lat: (raw.location as Record<string, unknown> | undefined)?.lat,
      lon: (raw.location as Record<string, unknown> | undefined)?.lon,
    },
    {
      lat: (raw.location as Record<string, unknown> | undefined)?.latitude,
      lon: (raw.location as Record<string, unknown> | undefined)?.longitude,
    },
  ]

  for (const item of candidates) {
    const lat = toNumber(item.lat)
    const lon = toNumber(item.lon)

    if (lat !== null && lon !== null) {
      return { lat, lon }
    }
  }

  return null
}

function getConfigSource(resolved: ResolvedSignalHuntMinigame, stage: PlayerStage): LatLon | null {
  const cfg = resolved.config
  const sourceLat = toNumber(cfg.source_lat)
  const sourceLon = toNumber(cfg.source_lon)

  if (sourceLat !== null && sourceLon !== null) {
    return { lat: sourceLat, lon: sourceLon }
  }

  return getStageCoordinate(stage)
}

function getGpsCopy(state: GpsState, hasSource: boolean): string {
  if (!hasSource) return 'Faltan coordenadas del nodo. Revisa la posición en el mapa.'
  if (state === 'requesting') return 'Solicitando posición GPS.'
  if (state === 'tracking')
    return 'GPS activo. Busca el pico de señal y mantén posición en la zona de captura.'
  if (state === 'denied') return 'Permiso de ubicación denegado. Revisa permisos del navegador.'
  if (state === 'unsupported') return 'Este navegador no permite usar geolocalización.'
  if (state === 'locked') return 'Señal capturada.'
  return 'Preparando búsqueda de señal.'
}

export function SignalHuntRuntimeScreen({ resolved, stage, submitting, onWin }: Props) {
  const cfg = resolved.config

  const source = useMemo(() => getConfigSource(resolved, stage), [resolved, stage])
  const hasSource = source !== null

  const stageRadius = toNumber((stage as unknown as Record<string, unknown>).radius)

  const sourceRadius = clamp(Number(cfg.source_radius_m ?? stageRadius ?? 55), 1, 10000)
  const easyCheckpoint = cfg.easy_checkpoint === true
  const rawLockThreshold = clamp(Number(cfg.lock_threshold ?? 88), 1, 100)
  const lockThreshold = easyCheckpoint
    ? rawLockThreshold
    : clamp(Math.max(rawLockThreshold, 82), 1, 100)
  const rawHoldMs = clamp(Number(cfg.hold_ms ?? 3500), 100, 10000)
  const holdMs = easyCheckpoint ? rawHoldMs : clamp(Math.max(rawHoldMs, 3000), 100, 10000)
  const configuredLockRadius = toNumber(cfg.lock_radius_m)
  const lockRadius =
    configuredLockRadius !== null
      ? clamp(configuredLockRadius, 2, sourceRadius)
      : clamp(sourceRadius * 0.32, 8, Math.min(35, sourceRadius))
  const maxSignal = clamp(Number(cfg.max_signal ?? 100), 1, 100)
  const noiseFloor = clamp(Number(cfg.noise_floor ?? 4), 0, 35)
  const jitter = clamp(Number(cfg.jitter ?? 1), 0, 20)
  const decayCurve = cfg.decay_curve ?? 'smooth'

  const [gpsState, setGpsState] = useState<GpsState>(hasSource ? 'idle' : 'missing_source')
  const [position, setPosition] = useState<PositionReading | null>(null)
  const [signal, setSignal] = useState(hasSource ? noiseFloor : 0)
  const [holdProgress, setHoldProgress] = useState(0)
  const [locked, setLocked] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  const watchIdRef = useRef<number | null>(null)
  const holdStartRef = useRef<number | null>(null)
  const wonRef = useRef(false)
  const windowPulseRef = useRef(false)

  const distance = useMemo(() => {
    if (!source || !position) return null
    return haversineMeters(position, source)
  }, [position, source])

  useEffect(() => {
    if (!hasSource) {
      setGpsState('missing_source')
      return
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsState('unsupported')
      return
    }

    setGpsState('requesting')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (reading) => {
        setPosition({
          lat: reading.coords.latitude,
          lon: reading.coords.longitude,
          accuracy: Number.isFinite(reading.coords.accuracy) ? reading.coords.accuracy : null,
          timestamp: reading.timestamp,
        })

        setGpsState((current) => (current === 'locked' ? 'locked' : 'tracking'))
      },
      () => {
        setGpsState('denied')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 12000,
      }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [hasSource, retryNonce])

  useEffect(() => {
    if (!hasSource || distance === null) return

    const closeness = 1 - distance / sourceRadius
    const base = noiseFloor + curveSignal(closeness, decayCurve) * (maxSignal - noiseFloor)
    const wave = Math.sin(Date.now() / 480) * jitter
    const next = clamp(base + wave, 0, maxSignal)

    setSignal((previous) => previous + (next - previous) * 0.28)
  }, [decayCurve, distance, hasSource, jitter, maxSignal, noiseFloor, sourceRadius])

  const normalizedSignal = clamp((signal / maxSignal) * 100, 0, 100)
  const inLockRadius = distance !== null && distance <= lockRadius
  const inWindow =
    !locked &&
    hasSource &&
    gpsState === 'tracking' &&
    normalizedSignal >= lockThreshold &&
    inLockRadius
  const rising = !locked && hasSource && normalizedSignal >= Math.max(15, lockThreshold * 0.62)

  const completeLock = useCallback(async () => {
    if (wonRef.current) return
    wonRef.current = true
    setLocked(true)
    setGpsState('locked')
    setHoldProgress(1)

    if (cfg.use_vibration !== false) {
      haptics.signalLock()
      sounds.signalLock()
    }

    await onWin()
  }, [cfg.use_vibration, onWin])

  useEffect(() => {
    if (locked) return

    let raf = 0

    const tick = () => {
      if (inWindow) {
        const now = performance.now()

        if (holdStartRef.current === null) {
          holdStartRef.current = now

          if (!windowPulseRef.current && cfg.use_vibration !== false) {
            windowPulseRef.current = true
            haptics.tick()
          }
        }

        const elapsed = now - holdStartRef.current
        const progress = Math.min(1, elapsed / holdMs)

        setHoldProgress(progress)

        if (progress >= 1) {
          void completeLock()
          return
        }
      } else {
        holdStartRef.current = null
        windowPulseRef.current = false
        setHoldProgress((previous) => (previous <= 0 ? 0 : Math.max(0, previous - 0.08)))
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cfg.use_vibration, completeLock, holdMs, inWindow, locked])

  const command = useMemo(() => {
    if (submitting) return { main: 'GUARDAR', sub: 'Guardando captura', small: true }
    if (locked) return { main: 'CAPTURA', sub: 'Señal capturada', small: true }
    if (!hasSource) return { main: 'SIN PUNTO', sub: 'Configura el nodo en el mapa', small: true }
    if (gpsState === 'requesting' || gpsState === 'idle')
      return { main: 'GPS', sub: 'Buscando posición', small: false }
    if (gpsState === 'denied') return { main: 'GPS', sub: 'Permiso bloqueado', small: false }
    if (gpsState === 'unsupported') return { main: 'GPS', sub: 'No disponible', small: false }
    if (inWindow) return { main: 'MANTÉN', sub: 'Mantén posición', small: true }
    if (rising)
      return {
        main: 'CERCA',
        sub: inLockRadius ? 'Afina la señal' : 'Busca la zona de captura',
        small: false,
      }
    return { main: 'DÉBIL', sub: 'Busca más intensidad', small: false }
  }, [gpsState, hasSource, inWindow, locked, rising, submitting])

  const statusLabel = submitting
    ? 'GUARDAR'
    : locked
      ? 'OK'
      : inWindow
        ? 'MANTÉN'
        : gpsState === 'tracking'
          ? 'GPS'
          : gpsState === 'missing_source'
            ? 'CONFIG'
            : 'GPS'

  const rootClassName = [
    'sh-root',
    rising ? 'is-rising' : '',
    inWindow ? 'is-window' : '',
    locked ? 'is-locked' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const captureDeg = Math.round(holdProgress * 360)
  const displaySignal = position ? normalizedSignal : 0
  const signalPct = `${Math.round(displaySignal)}%`
  const thresholdPct = `${lockThreshold}%`
  const signalRatio = clamp(displaySignal / 100, 0, 1)
  const signalScale = 0.72 + signalRatio * 0.36

  const styleVars = {
    '--capture-deg': `${captureDeg}deg`,
    '--signal-pct': signalPct,
    '--threshold-pct': thresholdPct,
    '--signal-ratio': signalRatio,
    '--signal-scale': signalScale,
    '--sweep-rotation': `${Math.round(Date.now() / 80) % 360}deg`,
  } as React.CSSProperties

  const showSensorPanel = gpsState !== 'tracking' && !locked

  return (
    <section className={rootClassName} style={styleVars} aria-label="Captura de señal GPS">
      <style>{STYLES}</style>

      <div className="sh-card">
        <header className="sh-top">
          <div className="sh-mode">
            <span className="sh-pulse" aria-hidden="true" />
            <div>
              <span className="sh-overline">Captura GPS</span>
            </div>
          </div>

          <div className="sh-live">
            <span>{statusLabel}</span>
            <strong>{Math.round(displaySignal)}%</strong>
          </div>
        </header>

        <div className="sh-command" aria-live="polite">
          <div className={`sh-command-main ${command.small ? 'is-small' : ''}`}>{command.main}</div>
          <div className="sh-command-sub">{command.sub}</div>
        </div>

        <div className="sh-instrument">
          <div className="sh-ring-progress" />
          <div className="sh-field" />
          <div className="sh-sweep" />

          <div className="sh-core">
            <div className="sh-lock-burst" />
            <div>
              <strong>{Math.round(displaySignal)}%</strong>
              <span>Señal</span>
            </div>
          </div>
        </div>

        <div className="sh-meter">
          <div className="sh-meter-fill" />
          <div className="sh-threshold" />
        </div>

        <div className="sh-metrics">
          <div className="sh-readout">
            <span>dist</span>
            <strong>{formatMeters(distance)}</strong>
            <i aria-hidden="true" />
            <span>umbral</span>
            <strong>{Math.round(lockThreshold)}%</strong>
            <i aria-hidden="true" />
            <span>zona</span>
            <strong>{formatMeters(lockRadius)}</strong>
            <i aria-hidden="true" />
            <span>captura</span>
            <strong>{Math.round(holdMs / 100) / 10}s</strong>
          </div>
        </div>

        {showSensorPanel ? (
          <div className="sh-sensor">
            <div className="sh-sensor-row">
              <span>GPS</span>
              <span>{statusLabel}</span>
            </div>
            <p>{getGpsCopy(gpsState, hasSource)}</p>

            {!hasSource ? null : (
              <div className="sh-actions">
                <button
                  className="sh-button"
                  type="button"
                  disabled={gpsState === 'requesting'}
                  onClick={() => {
                    if (watchIdRef.current !== null) {
                      navigator.geolocation.clearWatch(watchIdRef.current)
                      watchIdRef.current = null
                    }
                    holdStartRef.current = null
                    windowPulseRef.current = false
                    setGpsState('requesting')
                    setPosition(null)
                    setSignal(noiseFloor)
                    setHoldProgress(0)
                    setRetryNonce((value) => value + 1)
                  }}
                >
                  Reintentar GPS
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default SignalHuntRuntimeScreen

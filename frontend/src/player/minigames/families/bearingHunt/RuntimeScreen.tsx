import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type AnyRecord = Record<string, any>

export type BearingHuntRuntimeScreenProps = {
  resolved?: AnyRecord
  stage?: AnyRecord
  helperText?: string
  submitting?: boolean
  onWin?: (result?: AnyRecord) => void | Promise<void>

  minigame?: AnyRecord
  interaction?: AnyRecord
  payload?: AnyRecord
  node?: AnyRecord
  onComplete?: (result?: AnyRecord) => void | Promise<void>
  onSolved?: (result?: AnyRecord) => void | Promise<void>
  onSuccess?: (result?: AnyRecord) => void | Promise<void>
  complete?: (result?: AnyRecord) => void | Promise<void>
  resolveInteraction?: (result?: AnyRecord) => void | Promise<void>
  onClose?: () => void
}

type SensorState =
  | 'idle'
  | 'needs_permission'
  | 'requesting'
  | 'searching'
  | 'tracking'
  | 'silent'
  | 'denied'
  | 'unsupported'
  | 'blocked_https'

type CompassEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

type PermissionableDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const STYLES = `
.bh-root {
  --bh-text: rgba(255,255,255,.96);
  --bh-muted: rgba(226,238,255,.54);
  --bh-soft: rgba(226,238,255,.32);
  --bh-line: rgba(255,255,255,.12);
  --bh-glass: rgba(255,255,255,.07);
  --bh-accent: rgba(112,236,215,1);
  --bh-accent-soft: rgba(112,236,215,.18);

  width: 100%;
  margin-top: 8px;
  color: var(--bh-text);
}

.bh-root.is-near {
  --bh-accent: rgba(146,216,255,1);
  --bh-accent-soft: rgba(146,216,255,.18);
}

.bh-root.is-window {
  --bh-accent: rgba(116,248,211,1);
  --bh-accent-soft: rgba(116,248,211,.28);
}

.bh-root.is-locked {
  --bh-accent: rgba(177,255,208,1);
  --bh-accent-soft: rgba(177,255,208,.32);
}

.bh-card {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  padding: 14px 14px 13px;
  background:
    radial-gradient(circle at 50% 0%, rgba(255,255,255,.105), transparent 30%),
    radial-gradient(circle at 82% 22%, var(--bh-accent-soft), transparent 34%),
    linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
  border: 1px solid rgba(255,255,255,.115);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.13),
    0 16px 42px rgba(0,0,0,.16);
  backdrop-filter: blur(22px) saturate(1.18);
}

.bh-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255,255,255,.105), transparent 22%),
    radial-gradient(circle at center, rgba(255,255,255,.045), transparent 52%);
  opacity: .75;
}

.bh-top {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 13px;
}

.bh-mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bh-pulse {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--bh-accent);
  box-shadow: 0 0 16px var(--bh-accent);
}

.bh-mode-copy {
  min-width: 0;
}

.bh-overline {
  display: block;
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--bh-muted);
}

.bh-title {
  display: none;
}

.bh-live {
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

.bh-live span {
  font-size: 10px;
  letter-spacing: .13em;
  text-transform: uppercase;
  color: var(--bh-muted);
}

.bh-live strong {
  font-size: 12px;
  color: rgba(255,255,255,.9);
}

.bh-command {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 5px;
  text-align: center;
  margin: 4px 0 11px;
}

.bh-command-main {
  font-size: clamp(36px, 9.8vw, 56px);
  line-height: .9;
  letter-spacing: -.066em;
  font-weight: 880;
  text-transform: uppercase;
  text-shadow: 0 12px 38px rgba(0,0,0,.28);
}

.bh-command-main.is-small {
  font-size: clamp(32px, 8.8vw, 49px);
}

.bh-command-sub {
  font-size: 10px;
  letter-spacing: .15em;
  text-transform: uppercase;
  color: var(--bh-muted);
}

.bh-instrument {
  position: relative;
  z-index: 2;
  width: min(61vw, 246px);
  aspect-ratio: 1;
  margin: 0 auto 12px;
  display: grid;
  place-items: center;
  border-radius: 999px;
}

.bh-ring-progress {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background:
    conic-gradient(from -90deg, var(--bh-accent) var(--capture-deg), rgba(255,255,255,.085) var(--capture-deg) 360deg);
  box-shadow:
    0 0 32px var(--bh-accent-soft),
    inset 0 0 0 1px rgba(255,255,255,.07);
}

.bh-ring-progress::after {
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

.bh-face {
  position: absolute;
  inset: 15px;
  border-radius: 999px;
  overflow: hidden;
  background:
    radial-gradient(circle at center, rgba(255,255,255,.08) 0 1.5px, transparent 2px),
    radial-gradient(circle at center, transparent 0 43%, rgba(255,255,255,.06) 44%, transparent 45%),
    radial-gradient(circle at center, transparent 0 68%, rgba(255,255,255,.055) 69%, transparent 70%),
    conic-gradient(from -90deg, rgba(255,255,255,.12), transparent 16deg 74deg, rgba(255,255,255,.08) 90deg, transparent 106deg 254deg, rgba(255,255,255,.07) 270deg, transparent 286deg);
  border: 1px solid rgba(255,255,255,.085);
  box-shadow: inset 0 0 48px rgba(0,0,0,.22);
}

.bh-face::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 13%;
  bottom: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, var(--bh-accent), transparent);
  opacity: .58;
}

.bh-gate {
  position: absolute;
  top: 9px;
  left: 50%;
  width: 64px;
  height: 24px;
  transform: translateX(-50%);
  pointer-events: none;
}

.bh-gate::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: 52px;
  height: 8px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: var(--bh-accent);
  box-shadow:
    0 0 18px var(--bh-accent),
    0 0 44px var(--bh-accent-soft);
}

.bh-gate::after {
  content: "";
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
}

.bh-orbit {
  position: absolute;
  inset: 17px;
  border-radius: 999px;
  transform: rotate(var(--target-offset));
  transition: transform 260ms cubic-bezier(.16,.88,.22,1);
}

.bh-target {
  position: absolute;
  top: -7px;
  left: 50%;
  width: 32px;
  height: 32px;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
}

.bh-target::before {
  content: "";
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--bh-accent);
  box-shadow:
    0 0 19px var(--bh-accent),
    0 0 45px var(--bh-accent-soft);
}

.bh-target::after {
  content: "";
  position: absolute;
  width: 25px;
  height: 25px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.25);
  opacity: .52;
}

.bh-center {
  position: relative;
  z-index: 2;
  width: 35%;
  aspect-ratio: 1;
  border-radius: 999px;
  display: grid;
  place-items: center;
  text-align: center;
  background:
    radial-gradient(circle at 50% 19%, rgba(255,255,255,.18), transparent 32%),
    rgba(255,255,255,.075);
  border: 1px solid rgba(255,255,255,.13);
  box-shadow:
    0 12px 32px rgba(0,0,0,.18),
    inset 0 1px 0 rgba(255,255,255,.13);
  backdrop-filter: blur(18px);
}

.bh-center strong {
  display: block;
  font-size: clamp(23px, 6.1vw, 34px);
  line-height: .92;
  letter-spacing: -.055em;
}

.bh-center span {
  display: block;
  margin-top: 4px;
  font-size: 8px;
  letter-spacing: .17em;
  text-transform: uppercase;
  color: var(--bh-muted);
}

.bh-lock-burst {
  position: absolute;
  inset: 5px;
  border-radius: 999px;
  border: 1px solid rgba(177,255,208,.5);
  opacity: 0;
  pointer-events: none;
}

.bh-root.is-window .bh-gate::before {
  animation: bhGate 850ms ease-in-out infinite;
}

.bh-root.is-locked .bh-lock-burst {
  animation: bhLock .95s ease-out both;
}

.bh-capture {
  display: none;
}

.bh-metrics {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0;
  padding-top: 2px;
}

.bh-readout {
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

.bh-readout span {
  color: var(--bh-muted);
  letter-spacing: .02em;
}

.bh-readout strong {
  color: rgba(255,255,255,.94);
  font-weight: 820;
  letter-spacing: -.015em;
}

.bh-readout i {
  width: 3px;
  height: 3px;
  border-radius: 999px;
  background: rgba(255,255,255,.28);
}

.bh-sensor {
  position: relative;
  z-index: 2;
  margin-top: 10px;
  padding: 11px;
  border-radius: 18px;
  background: rgba(0,0,0,.13);
  border: 1px solid rgba(255,255,255,.08);
}

.bh-sensor-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: rgba(255,255,255,.82);
  font-size: 12px;
  font-weight: 720;
}

.bh-sensor p {
  margin: 5px 0 0;
  color: var(--bh-muted);
  font-size: 12px;
  line-height: 1.36;
}

.bh-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.bh-button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 9px 12px;
  background: var(--bh-accent);
  color: rgba(3,12,18,.95);
  font-size: 12px;
  font-weight: 820;
  cursor: pointer;
}

.bh-button.bh-ghost {
  color: rgba(255,255,255,.82);
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
}

.bh-range {
  width: 100%;
  margin-top: 10px;
  accent-color: rgb(111,231,211);
}

@keyframes bhGate {
  0%, 100% { transform: translateX(-50%) scaleX(.92); opacity: .74; }
  50% { transform: translateX(-50%) scaleX(1.08); opacity: 1; }
}

@keyframes bhLock {
  0% { opacity: 0; transform: scale(.88); }
  22% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.16); }
}

@media (max-width: 420px) {
  .bh-card {
    border-radius: 26px;
    padding: 13px;
  }

  .bh-instrument {
    width: min(59vw, 236px);
  }

  .bh-command {
    margin-bottom: 10px;
  }
}
`

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

function signedDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

function formatDeg(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return String(Math.round(normalizeDegrees(value))).padStart(3, '0')
}

function pickNumber(...values: any[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return undefined
}

function getHeadingFromEvent(event: CompassEvent): number | null {
  if (
    typeof event.webkitCompassHeading === 'number' &&
    Number.isFinite(event.webkitCompassHeading)
  ) {
    return normalizeDegrees(event.webkitCompassHeading)
  }

  if (typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    return normalizeDegrees(360 - event.alpha)
  }

  return null
}

function getDeviceOrientationConstructor(): PermissionableDeviceOrientationEvent | null {
  if (typeof window === 'undefined') return null
  const ctor = window.DeviceOrientationEvent as PermissionableDeviceOrientationEvent | undefined
  return ctor ?? null
}

function getConfig(props: BearingHuntRuntimeScreenProps) {
  const sources = [
    props.resolved,
    props.resolved?.config,
    props.resolved?.payload,
    props.resolved?.params,
    props.resolved?.minigame,
    props.resolved?.minigame?.config,
    props.resolved?.minigame?.payload,
    props.stage,
    props.stage?.minigame,
    props.stage?.minigame?.config,
    props.stage?.payload,
    props.minigame,
    props.minigame?.config,
    props.minigame?.payload,
    props.minigame?.params,
    props.interaction,
    props.interaction?.minigame,
    props.interaction?.minigame?.config,
    props.interaction?.payload,
    props.interaction?.params,
    props.payload,
    props.payload?.minigame,
    props.payload?.config,
    props.payload?.params,
    props.node,
    props.node?.minigame,
  ].filter(Boolean)

  const read = (...keys: string[]) => {
    for (const source of sources) {
      for (const key of keys) {
        if (source && source[key] !== undefined && source[key] !== null) return source[key]
      }
    }
    return undefined
  }

  const targetBearing = normalizeDegrees(
    pickNumber(
      read('targetBearing', 'target_bearing', 'target', 'bearing', 'azimuth', 'targetAzimuth'),
      90
    ) ?? 90
  )

  const tolerance = Math.max(
    1,
    Math.min(
      90,
      pickNumber(
        read('tolerance', 'toleranceDeg', 'tolerance_degrees', 'window', 'windowDeg'),
        18
      ) ?? 18
    )
  )

  const holdMs = Math.max(
    250,
    pickNumber(read('holdMs', 'hold_ms', 'holdTime', 'hold_time', 'holdDurationMs'), 1200) ?? 1200
  )

  const title = String(
    read('title', 'name', 'label') ?? props.node?.title ?? props.node?.name ?? 'Bearing Hunt'
  )

  return {
    targetBearing,
    tolerance,
    holdMs,
    title,
  }
}

export function RuntimeScreen(props: BearingHuntRuntimeScreenProps) {
  const { targetBearing, tolerance, holdMs, title } = useMemo(() => getConfig(props), [props])

  const [sensorState, setSensorState] = useState<SensorState>('idle')
  const [heading, setHeading] = useState<number | null>(null)
  const [rawHeading, setRawHeading] = useState<number | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [locked, setLocked] = useState(false)
  const [manualMode, setManualMode] = useState(false)

  const headingRef = useRef<number | null>(null)
  const listenerRef = useRef<((event: DeviceOrientationEvent) => void) | null>(null)
  const captureStartRef = useRef<number | null>(null)
  const completeSentRef = useRef(false)
  const windowPulseRef = useRef(false)

  const completionCallback =
    props.onWin ??
    props.onComplete ??
    props.onSolved ??
    props.onSuccess ??
    props.complete ??
    props.resolveInteraction

  const updateHeading = useCallback((nextRaw: number) => {
    const normalized = normalizeDegrees(nextRaw)
    setRawHeading(normalized)

    setHeading((previous) => {
      const next =
        previous === null
          ? normalized
          : normalizeDegrees(previous + signedDelta(previous, normalized) * 0.16)

      headingRef.current = next
      return next
    })
  }, [])

  const delta = useMemo(() => {
    if (heading === null) return null
    return signedDelta(heading, targetBearing)
  }, [heading, targetBearing])

  const absDelta = Math.abs(delta ?? 999)
  const inWindow = !locked && heading !== null && absDelta <= tolerance
  const nearWindow = !locked && heading !== null && absDelta <= tolerance * 2.35

  const completeLock = useCallback(async () => {
    if (completeSentRef.current) return
    completeSentRef.current = true
    setLocked(true)
    setHoldProgress(1)

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.([18, 34, 26])
    }

    const finalHeading = headingRef.current

    await completionCallback?.({
      type: 'bearing_hunt',
      status: 'locked',
      targetBearing,
      tolerance,
      holdMs,
      heading: finalHeading,
      delta: finalHeading === null ? null : signedDelta(finalHeading, targetBearing),
      completedAt: new Date().toISOString(),
    })
  }, [completionCallback, holdMs, targetBearing, tolerance])

  useEffect(() => {
    if (locked) return

    let raf = 0

    const tick = () => {
      if (inWindow) {
        const now = performance.now()

        if (captureStartRef.current === null) {
          captureStartRef.current = now

          if (
            !windowPulseRef.current &&
            typeof navigator !== 'undefined' &&
            'vibrate' in navigator
          ) {
            windowPulseRef.current = true
            navigator.vibrate?.(10)
          }
        }

        const elapsed = now - captureStartRef.current
        const progress = Math.min(1, elapsed / holdMs)

        setHoldProgress(progress)

        if (progress >= 1) {
          void completeLock()
          return
        }
      } else {
        captureStartRef.current = null
        windowPulseRef.current = false
        setHoldProgress((previous) => (previous <= 0 ? 0 : Math.max(0, previous - 0.08)))
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [completeLock, holdMs, inWindow, locked])

  const startSensors = useCallback(async () => {
    if (typeof window === 'undefined') return

    if (!window.isSecureContext) {
      setSensorState('blocked_https')
      return
    }

    const OrientationCtor = getDeviceOrientationConstructor()

    if (!OrientationCtor) {
      setSensorState('unsupported')
      return
    }

    try {
      setSensorState('requesting')

      if (typeof OrientationCtor.requestPermission === 'function') {
        const result = await OrientationCtor.requestPermission()

        if (result !== 'granted') {
          setSensorState('denied')
          return
        }
      }

      if (listenerRef.current) {
        window.removeEventListener('deviceorientation', listenerRef.current as EventListener, true)
        window.removeEventListener(
          'deviceorientationabsolute',
          listenerRef.current as EventListener,
          true
        )
      }

      const handler = (event: DeviceOrientationEvent) => {
        const next = getHeadingFromEvent(event as CompassEvent)
        if (next === null) return

        updateHeading(next)
        setSensorState('tracking')
      }

      listenerRef.current = handler

      window.addEventListener('deviceorientation', handler as EventListener, true)
      window.addEventListener('deviceorientationabsolute', handler as EventListener, true)

      setSensorState('searching')

      window.setTimeout(() => {
        if (headingRef.current === null) {
          setSensorState((current) => (current === 'searching' ? 'silent' : current))
        }
      }, 1800)
    } catch {
      setSensorState('denied')
    }
  }, [updateHeading])

  useEffect(() => {
    const OrientationCtor = getDeviceOrientationConstructor()

    if (!OrientationCtor) {
      setSensorState('unsupported')
      return
    }

    if (typeof OrientationCtor.requestPermission === 'function') {
      setSensorState('needs_permission')
      return
    }

    void startSensors()

    return () => {
      if (listenerRef.current && typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', listenerRef.current as EventListener, true)
        window.removeEventListener(
          'deviceorientationabsolute',
          listenerRef.current as EventListener,
          true
        )
      }
    }
  }, [startSensors])

  useEffect(() => {
    return () => {
      if (listenerRef.current && typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', listenerRef.current as EventListener, true)
        window.removeEventListener(
          'deviceorientationabsolute',
          listenerRef.current as EventListener,
          true
        )
      }
    }
  }, [])

  const command = useMemo(() => {
    if (locked) {
      return { main: 'LOCKED', sub: 'Rumbo capturado', small: false }
    }

    if (heading === null) {
      if (sensorState === 'needs_permission')
        return { main: 'READY', sub: 'Activa orientación', small: false }
      if (sensorState === 'blocked_https')
        return { main: 'HTTPS', sub: 'Sensor bloqueado', small: false }
      return { main: 'SCAN', sub: 'Buscando heading', small: false }
    }

    if (inWindow) {
      return { main: 'HOLD', sub: 'Mantén estable', small: false }
    }

    const amount = Math.round(absDelta)
    const direction = (delta ?? 0) >= 0 ? 'RIGHT' : 'LEFT'

    return {
      main: `${direction} ${amount}°`,
      sub: nearWindow ? 'Cerca del vector' : 'Gira hacia el vector',
      small: amount >= 100,
    }
  }, [absDelta, delta, heading, inWindow, locked, nearWindow, sensorState])

  const sensorCopy = useMemo(() => {
    switch (sensorState) {
      case 'needs_permission':
        return 'Safari iPhone necesita un toque para activar orientación real.'
      case 'requesting':
        return 'Solicitando acceso al sensor.'
      case 'searching':
        return 'Sensor activo. Esperando primera lectura estable.'
      case 'tracking':
        return 'Orientación real activa.'
      case 'silent':
        return 'No llega heading. Puedes usar prueba manual discreta.'
      case 'denied':
        return 'Permiso denegado. Revisa movimiento/orientación en Safari.'
      case 'unsupported':
        return 'Este navegador no expone DeviceOrientation.'
      case 'blocked_https':
        return 'Abre el runtime desde HTTPS para usar sensores reales.'
      default:
        return 'Preparando instrumento.'
    }
  }, [sensorState])

  const statusLabel = props.submitting
    ? 'SYNC'
    : locked
      ? 'LOCK'
      : inWindow
        ? 'HOLD'
        : nearWindow
          ? 'NEAR'
          : sensorState === 'tracking'
            ? 'LIVE'
            : sensorState === 'needs_permission'
              ? 'ARM'
              : 'SCAN'

  const rootClassName = [
    'bh-root',
    nearWindow ? 'is-near' : '',
    inWindow ? 'is-window' : '',
    locked ? 'is-locked' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const targetOffset = delta ?? 0
  const captureDeg = Math.round(holdProgress * 360)
  const capturePct = `${Math.round(holdProgress * 100)}%`

  const styleVars = {
    '--target-offset': `${targetOffset}deg`,
    '--capture-deg': `${captureDeg}deg`,
    '--capture-pct': capturePct,
  } as React.CSSProperties

  const showSensorPanel = sensorState !== 'tracking' && !locked

  return (
    <section className={rootClassName} style={styleVars} aria-label="Bearing hunt runtime">
      <style>{STYLES}</style>

      <div className="bh-card">
        <header className="bh-top">
          <div className="bh-mode">
            <span className="bh-pulse" aria-hidden="true" />
            <div className="bh-mode-copy">
              <span className="bh-overline">Vector lock</span>
              <span className="bh-title">{title}</span>
            </div>
          </div>

          <div className="bh-live">
            <span>{statusLabel}</span>
            <strong>{formatDeg(rawHeading ?? heading)}°</strong>
          </div>
        </header>

        <div className="bh-command" aria-live="polite">
          <div className={`bh-command-main ${command.small ? 'is-small' : ''}`}>{command.main}</div>
          <div className="bh-command-sub">{command.sub}</div>
        </div>

        <div className="bh-instrument">
          <div className="bh-ring-progress" />
          <div className="bh-face" />
          <div className="bh-gate" />
          <div className="bh-orbit">
            <div className="bh-target" aria-hidden="true" />
          </div>

          <div className="bh-center">
            <div className="bh-lock-burst" />
            <div>
              <strong>{formatDeg(targetBearing)}°</strong>
              <span>Target</span>
            </div>
          </div>
        </div>

        <div className="bh-capture">
          <div className="bh-capture-track">
            <div className="bh-capture-fill" />
          </div>
          <span>{capturePct}</span>
        </div>

        <div className="bh-metrics">
          <div className="bh-readout">
            <span>Δ</span>
            <strong>{heading === null ? '—' : `${Math.round(absDelta)}°`}</strong>
            <i aria-hidden="true" />
            <span>ventana</span>
            <strong>±{Math.round(tolerance)}°</strong>
            <i aria-hidden="true" />
            <span>captura</span>
            <strong>{Math.round(holdMs / 100) / 10}s</strong>
          </div>
        </div>

        {showSensorPanel ? (
          <div className="bh-sensor">
            <div className="bh-sensor-row">
              <span>Sensor</span>
              <span>{statusLabel}</span>
            </div>
            <p>{sensorCopy}</p>

            <div className="bh-actions">
              {(sensorState === 'needs_permission' ||
                sensorState === 'denied' ||
                sensorState === 'silent' ||
                sensorState === 'blocked_https' ||
                sensorState === 'unsupported') && (
                <button className="bh-button" type="button" onClick={() => void startSensors()}>
                  Activar sensor
                </button>
              )}

              {(sensorState === 'silent' ||
                sensorState === 'unsupported' ||
                sensorState === 'denied') && (
                <button
                  className="bh-button bh-ghost"
                  type="button"
                  onClick={() => {
                    setManualMode((value) => !value)
                    if (headingRef.current === null) updateHeading(targetBearing + 72)
                  }}
                >
                  Prueba manual
                </button>
              )}
            </div>

            {manualMode ? (
              <input
                className="bh-range"
                type="range"
                min="0"
                max="359"
                value={Math.round(heading ?? targetBearing)}
                onChange={(event) => updateHeading(Number(event.target.value))}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export const BearingHuntRuntimeScreen = RuntimeScreen
export default RuntimeScreen

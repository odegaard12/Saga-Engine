import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedBearingHuntMinigame } from '../../core/resolver'

interface Props {
  resolved: ResolvedBearingHuntMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

type PermissionState = 'unknown' | 'granted' | 'denied' | 'not_required'
type SensorState = 'checking' | 'ready' | 'blocked' | 'locked'
type BlockedReason = 'none' | 'https' | 'permission' | 'unsupported'

type IOSOrientationEventCtor = {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

function shortestAngleDelta(from: number, to: number) {
  let diff = normalizeDegrees(to) - normalizeDegrees(from)
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return diff
}

function normalizeHeading(event: DeviceOrientationEvent): number | null {
  const withCompass = event as DeviceOrientationEvent & {
    webkitCompassHeading?: number
  }

  if (
    typeof withCompass.webkitCompassHeading === 'number' &&
    Number.isFinite(withCompass.webkitCompassHeading)
  ) {
    return normalizeDegrees(withCompass.webkitCompassHeading)
  }

  if (typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    return normalizeDegrees(360 - event.alpha)
  }

  return null
}

function getStateLabel(
  sensorState: SensorState,
  blockedReason: BlockedReason,
  permission: PermissionState,
  heading: number | null
) {
  if (sensorState === 'locked') return 'Locked'
  if (blockedReason === 'https') return 'HTTPS'
  if (blockedReason === 'permission') return 'Denied'
  if (blockedReason === 'unsupported') return 'No sensor'
  if (permission === 'unknown') return 'Enable'
  if (heading === null) return 'Search'
  return 'Track'
}

function getStatusLine(
  permission: PermissionState,
  blockedReason: BlockedReason,
  sensorState: SensorState,
  delta: number | null,
  tolerance: number
) {
  if (blockedReason === 'https') return 'Use HTTPS on iPhone.'
  if (blockedReason === 'permission') return 'Tap enable and allow motion access.'
  if (blockedReason === 'unsupported') return 'Orientation not exposed here.'
  if (permission === 'unknown') return 'Tap enable to use sensors.'
  if (sensorState === 'locked') return 'Locked.'
  if (delta === null) return 'Searching.'
  if (delta <= tolerance) return 'Hold steady.'
  if (delta <= tolerance * 1.8) return 'Almost there.'
  return 'Aim to target.'
}

export function BearingHuntRuntimeScreen({
  resolved,
  stage: _stage,
  helperText: _helperText,
  submitting,
  onWin,
}: Props) {
  const cfg = resolved.config

  const target = Number.isFinite(cfg.target_bearing_deg) ? cfg.target_bearing_deg ?? 90 : 90
  const tolerance = Number.isFinite(cfg.tolerance_deg) ? cfg.tolerance_deg : 18
  const holdMs = Number.isFinite(cfg.hold_ms) ? cfg.hold_ms : 1200

  const [permission, setPermission] = useState<PermissionState>('unknown')
  const [sensorState, setSensorState] = useState<SensorState>('checking')
  const [blockedReason, setBlockedReason] = useState<BlockedReason>('none')
  const [headingDisplay, setHeadingDisplay] = useState<number | null>(null)
  const [delta, setDelta] = useState<number | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [requestingPermission, setRequestingPermission] = useState(false)

  const rawHeadingRef = useRef<number | null>(null)
  const smoothedHeadingRef = useRef<number | null>(null)
  const displayHeadingRef = useRef<number | null>(null)
  const velocityRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const lockStartRef = useRef<number | null>(null)
  const wonRef = useRef(false)

  const targetRotation = useMemo(() => normalizeDegrees(target), [target])
  const stateLabel = getStateLabel(sensorState, blockedReason, permission, headingDisplay)
  const statusMessage = getStatusLine(permission, blockedReason, sensorState, delta, tolerance)
  const targetHot = delta !== null && delta <= tolerance * 1.35

  useEffect(() => {
    if (typeof window === 'undefined') return

    const ctor = window.DeviceOrientationEvent as unknown as IOSOrientationEventCtor | undefined
    const requiresRequest = typeof ctor?.requestPermission === 'function'
    const hasOrientationEvent =
      'DeviceOrientationEvent' in window || 'ondeviceorientation' in window

    if (!window.isSecureContext) {
      setPermission('denied')
      setBlockedReason('https')
      setSensorState('blocked')
      return
    }

    if (!hasOrientationEvent) {
      setPermission('denied')
      setBlockedReason('unsupported')
      setSensorState('blocked')
      return
    }

    if (requiresRequest) {
      setPermission('unknown')
      setBlockedReason('none')
      setSensorState('checking')
      return
    }

    setPermission('not_required')
    setBlockedReason('none')
    setSensorState('ready')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!(permission === 'granted' || permission === 'not_required')) return

    wonRef.current = false
    lockStartRef.current = null
    setSensorState('ready')
    setBlockedReason('none')

    function handleOrientation(event: DeviceOrientationEvent) {
      const nextHeading = normalizeHeading(event)

      if (nextHeading === null) {
        setSensorState('blocked')
        setBlockedReason('unsupported')
        rawHeadingRef.current = null
        smoothedHeadingRef.current = null
        setHeadingDisplay(null)
        setDelta(null)
        setHoldProgress(0)
        lockStartRef.current = null
        return
      }

      setBlockedReason('none')
      rawHeadingRef.current = nextHeading

      if (smoothedHeadingRef.current === null) {
        smoothedHeadingRef.current = nextHeading
      } else {
        const diff = shortestAngleDelta(smoothedHeadingRef.current, nextHeading)
        smoothedHeadingRef.current = normalizeDegrees(
          smoothedHeadingRef.current + diff * 0.22
        )
      }

      const current = smoothedHeadingRef.current
      const nextDelta = Math.abs(shortestAngleDelta(current, target))
      setDelta(Math.round(nextDelta))

      if (nextDelta <= tolerance) {
        const now = performance.now()

        if (lockStartRef.current === null) {
          lockStartRef.current = now
        }

        const progress = Math.min(100, ((now - lockStartRef.current) / holdMs) * 100)
        setHoldProgress(progress)
        setSensorState(progress >= 100 ? 'locked' : 'ready')

        if (progress >= 100 && !wonRef.current) {
          wonRef.current = true
          void onWin()
        }
      } else {
        lockStartRef.current = null
        setHoldProgress(0)
        setSensorState('ready')
      }
    }

    window.addEventListener('deviceorientation', handleOrientation, true)

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true)
    }
  }, [permission, target, tolerance, holdMs, onWin])

  useEffect(() => {
    if (typeof window === 'undefined') return

    function frame(now: number) {
      const last = lastFrameRef.current ?? now
      const dt = Math.max(0.8, Math.min(2.2, (now - last) / 16.666))
      lastFrameRef.current = now

      const targetHeading = smoothedHeadingRef.current

      if (targetHeading === null) {
        setHeadingDisplay(null)
        velocityRef.current *= 0.82
        rafRef.current = window.requestAnimationFrame(frame)
        return
      }

      if (displayHeadingRef.current === null) {
        displayHeadingRef.current = targetHeading
      }

      const currentDisplay = displayHeadingRef.current
      const deltaToTarget = shortestAngleDelta(currentDisplay, targetHeading)

      velocityRef.current += deltaToTarget * 0.11 * dt
      velocityRef.current *= 0.84

      const wobbleBase =
        sensorState === 'blocked' || sensorState === 'locked'
          ? 0
          : Math.min(1.1, Math.abs(velocityRef.current) * 0.08)

      const wobble = Math.sin(now / 180) * wobbleBase

      displayHeadingRef.current = normalizeDegrees(
        currentDisplay + velocityRef.current + wobble
      )

      setHeadingDisplay(Math.round(displayHeadingRef.current))
      rafRef.current = window.requestAnimationFrame(frame)
    }

    rafRef.current = window.requestAnimationFrame(frame)

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = null
      lastFrameRef.current = null
    }
  }, [sensorState])

  async function requestSensorPermission() {
    if (typeof window === 'undefined') return

    const ctor = window.DeviceOrientationEvent as unknown as IOSOrientationEventCtor | undefined
    if (typeof ctor?.requestPermission !== 'function') {
      setPermission('not_required')
      setBlockedReason('none')
      setSensorState('ready')
      return
    }

    try {
      setRequestingPermission(true)
      const result = await ctor.requestPermission()

      if (result === 'granted') {
        setPermission('granted')
        setBlockedReason('none')
        setSensorState('ready')
        return
      }

      setPermission('denied')
      setBlockedReason('permission')
      setSensorState('blocked')
    } catch {
      setPermission('denied')
      setBlockedReason('permission')
      setSensorState('blocked')
    } finally {
      setRequestingPermission(false)
    }
  }

  return (
    <section style={wrap}>
      <style>{animations}</style>

      <div style={topRow}>
        <div style={chipRow}>
          <span style={chip}>{`${target}°`}</span>
          <span style={chip}>{`±${tolerance}°`}</span>
          <span style={chip}>{`${(holdMs / 1000).toFixed(1)}s`}</span>
        </div>

        <span style={stateBadge(sensorState, blockedReason, permission)}>
          {permission === 'unknown'
            ? 'ENABLE'
            : sensorState === 'locked'
            ? 'LOCKED'
            : sensorState === 'blocked'
            ? blockedReason === 'https'
              ? 'HTTPS'
              : blockedReason === 'permission'
              ? 'DENIED'
              : 'BLOCKED'
            : 'READY'}
        </span>
      </div>

      <div
        style={{
          ...instrumentCard,
          boxShadow: targetHot
            ? '0 0 0 1px rgba(34,197,94,.10), inset 0 1px 0 rgba(255,255,255,.05)'
            : 'inset 0 1px 0 rgba(255,255,255,.04)',
        }}
      >
        <div style={dialWrap}>
          <div style={dialGlow} />
          <div style={dialSweep} />

          <svg viewBox="0 0 100 100" style={dialSvg} aria-hidden="true">
            <circle cx="50" cy="50" r="45" style={outerRing} />
            <circle cx="50" cy="50" r="34" style={innerRing} />

            <g transform={`rotate(${targetRotation} 50 50)`}>
              <circle
                cx="50"
                cy="11.8"
                r="5.8"
                fill="rgba(245,158,11,.18)"
                style={{ animation: 'bearingTargetPulse 1.9s ease-in-out infinite' }}
              />
              <rect x="47.2" y="8.3" width="5.6" height="12.6" rx="2.8" fill="#f59e0b" />
              <circle cx="50" cy="14.5" r="1.7" fill="#fde68a" />
            </g>

            {headingDisplay !== null ? (
              <g transform={`rotate(${headingDisplay} 50 50)`}>
                <line
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="22"
                  stroke="#f8fafc"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <polygon points="50,12 54,22 46,22" fill="#22c55e" />
              </g>
            ) : null}

            <circle cx="50" cy="50" r="5" fill="#f8fafc" />
            <circle cx="50" cy="50" r="8.5" fill="rgba(248,250,252,.10)" />
          </svg>

          <div style={dialReadout}>
            <div style={dialReadoutValue}>
              {headingDisplay === null ? '--' : `${headingDisplay}°`}
            </div>
            <div style={dialReadoutLabel}>HEADING</div>
          </div>
        </div>

        <div style={statsGrid}>
          <div style={statCard}>
            <div style={statLabel}>DELTA</div>
            <div style={statValue}>{delta === null ? '--' : `${delta}°`}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>HOLD</div>
            <div style={statValue}>{`${Math.round(holdProgress)}%`}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>STATE</div>
            <div style={statValue}>{stateLabel}</div>
          </div>
        </div>

        <div style={progressTrack}>
          <div style={{ ...progressFill, width: `${holdProgress}%` }} />
        </div>

        <div style={statusLineStyle}>{statusMessage}</div>
      </div>

      {permission === 'unknown' ? (
        <button
          type="button"
          style={enableButton}
          onClick={() => void requestSensorPermission()}
          disabled={requestingPermission || submitting}
        >
          {requestingPermission ? 'REQUESTING…' : 'ENABLE SENSORS'}
        </button>
      ) : null}
    </section>
  )
}

const wrap: CSSProperties = {
  display: 'grid',
  gap: 12,
}

const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const chip: CSSProperties = {
  minHeight: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  background: 'rgba(245,158,11,.10)',
  border: '1px solid rgba(245,158,11,.20)',
  color: '#fde68a',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const stateBadge = (
  state: SensorState,
  blockedReason: BlockedReason,
  permission: PermissionState
): CSSProperties => ({
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
  color: '#dbeafe',
  background:
    permission === 'unknown'
      ? 'rgba(37,99,235,.16)'
      : state === 'locked'
      ? 'rgba(22,163,74,.18)'
      : blockedReason === 'permission'
      ? 'rgba(239,68,68,.18)'
      : blockedReason === 'https'
      ? 'rgba(168,85,247,.18)'
      : state === 'blocked'
      ? 'rgba(239,68,68,.16)'
      : 'rgba(37,99,235,.16)',
  border:
    permission === 'unknown'
      ? '1px solid rgba(59,130,246,.22)'
      : state === 'locked'
      ? '1px solid rgba(34,197,94,.24)'
      : blockedReason === 'permission'
      ? '1px solid rgba(248,113,113,.24)'
      : blockedReason === 'https'
      ? '1px solid rgba(196,181,253,.24)'
      : state === 'blocked'
      ? '1px solid rgba(248,113,113,.20)'
      : '1px solid rgba(59,130,246,.22)',
})

const instrumentCard: CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'linear-gradient(180deg, rgba(20,31,61,.92), rgba(14,24,48,.94))',
  padding: 14,
  display: 'grid',
  gap: 12,
  overflow: 'hidden',
}

const dialWrap: CSSProperties = {
  position: 'relative',
  width: 'min(100%, 430px)',
  aspectRatio: '1 / 1',
  margin: '0 auto',
  borderRadius: '50%',
  background: 'radial-gradient(circle at 50% 50%, rgba(30,64,175,.22), rgba(8,15,34,.94) 72%)',
  border: '1px solid rgba(255,255,255,.07)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,.06), inset 0 -18px 28px rgba(0,0,0,.18), 0 18px 40px rgba(2,6,23,.28)',
  overflow: 'hidden',
}

const dialGlow: CSSProperties = {
  position: 'absolute',
  inset: '18%',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(37,99,235,.18), rgba(37,99,235,0) 70%)',
  filter: 'blur(10px)',
  pointerEvents: 'none',
  animation: 'bearingBreath 4.2s ease-in-out infinite',
}

const dialSweep: CSSProperties = {
  position: 'absolute',
  inset: '-12%',
  borderRadius: '50%',
  background:
    'conic-gradient(from 0deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.035) 38deg, rgba(255,255,255,0) 90deg)',
  filter: 'blur(10px)',
  opacity: 0.55,
  animation: 'bearingSweep 8s linear infinite',
  pointerEvents: 'none',
}

const dialSvg: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
}

const outerRing = {
  fill: 'none',
  stroke: 'rgba(255,255,255,.08)',
  strokeWidth: 1.6,
}

const innerRing = {
  fill: 'none',
  stroke: 'rgba(255,255,255,.16)',
  strokeWidth: 0.9,
  strokeDasharray: '1.8 2.4',
}

const dialReadout: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 24,
  transform: 'translateX(-50%)',
  display: 'grid',
  gap: 4,
  justifyItems: 'center',
}

const dialReadoutValue: CSSProperties = {
  color: '#f8fafc',
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: '-0.03em',
  textShadow: '0 2px 10px rgba(2,6,23,.34)',
}

const dialReadoutLabel: CSSProperties = {
  color: 'rgba(255,255,255,.68)',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.14em',
}

const statsGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
}

const statCard: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.04)',
  padding: 12,
  display: 'grid',
  gap: 6,
  minHeight: 88,
}

const statLabel: CSSProperties = {
  color: 'rgba(255,255,255,.56)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const statValue: CSSProperties = {
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 900,
  lineHeight: 1.14,
}

const progressTrack: CSSProperties = {
  height: 14,
  borderRadius: 999,
  background: 'rgba(255,255,255,.06)',
  overflow: 'hidden',
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,.18)',
}

const progressFill: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg, #2563eb, #22c55e)',
  transition: 'width 100ms linear',
}

const statusLineStyle: CSSProperties = {
  color: '#d6ddec',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.3,
  textAlign: 'center',
  minHeight: 18,
}

const enableButton: CSSProperties = {
  minHeight: 44,
  borderRadius: 16,
  border: '1px solid rgba(59,130,246,.26)',
  background: 'linear-gradient(180deg, rgba(37,99,235,.24), rgba(29,78,216,.18))',
  color: '#dbeafe',
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

const animations = `
@keyframes bearingTargetPulse {
  0%, 100% { opacity: .55; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.12); }
}

@keyframes bearingBreath {
  0%, 100% { opacity: .65; transform: scale(1); }
  50% { opacity: .95; transform: scale(1.03); }
}

@keyframes bearingSweep {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`

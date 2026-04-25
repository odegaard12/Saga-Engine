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
type SensorState = 'checking' | 'ready' | 'locked' | 'blocked'
type BlockedReason = 'none' | 'https' | 'permission' | 'unsupported'

type IOSOrientationEventCtor = {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
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

function readHeading(event: DeviceOrientationEvent): number | null {
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

function formatDeg(value: number | null) {
  return value == null ? '--' : `${Math.round(normalizeDegrees(value))}°`
}

function directionFromDelta(delta: number | null, tolerance: number) {
  if (delta == null) return 'Track'
  const abs = Math.abs(delta)
  if (abs <= tolerance) return 'Locked'
  if (abs <= tolerance * 1.8) return delta > 0 ? 'Right a bit' : 'Left a bit'
  return delta > 0 ? 'Turn right' : 'Turn left'
}

function statusText(
  blockedReason: BlockedReason,
  permission: PermissionState,
  sensorState: SensorState
) {
  if (blockedReason === 'https') return 'Use HTTPS on iPhone.'
  if (blockedReason === 'permission') {
    return permission === 'denied'
      ? 'Motion permission denied.'
      : 'Enable motion access.'
  }
  if (blockedReason === 'unsupported') return 'Orientation sensor unavailable.'
  if (sensorState === 'locked') return 'Target locked.'
  if (sensorState === 'ready') return 'Aim to target.'
  return 'Preparing sensors.'
}

function getIosRequestPermission():
  | (() => Promise<'granted' | 'denied'>)
  | null {
  if (typeof window === 'undefined') return null
  const ctor = (window as Window & {
    DeviceOrientationEvent?: IOSOrientationEventCtor
  }).DeviceOrientationEvent
  if (ctor && typeof ctor.requestPermission === 'function') {
    return ctor.requestPermission.bind(ctor)
  }
  return null
}

export function BearingHuntRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: Props) {
  const cfg = ((resolved as unknown as { config?: Record<string, unknown> })?.config ?? {}) as Record<
    string,
    unknown
  >

  const target = normalizeDegrees(
    Number(cfg.targetDeg ?? cfg.target_deg ?? cfg.targetHeading ?? cfg.target_heading ?? 90)
  )
  const tolerance = clamp(
    Number(cfg.toleranceDeg ?? cfg.tolerance_deg ?? 18),
    4,
    60
  )
  const holdMs = clamp(
    Number(cfg.holdMs ?? cfg.hold_ms ?? 1200),
    300,
    6000
  )

  const [permission, setPermission] = useState<PermissionState>('unknown')
  const [sensorState, setSensorState] = useState<SensorState>('checking')
  const [blockedReason, setBlockedReason] = useState<BlockedReason>('none')
  const [rawHeading, setRawHeading] = useState<number | null>(null)
  const [displayHeading, setDisplayHeading] = useState<number | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [fallbackOpen, setFallbackOpen] = useState(false)

  const rawHeadingRef = useRef<number | null>(null)
  const smoothHeadingRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const holdStartRef = useRef<number | null>(null)
  const wonRef = useRef(false)

  const isHttps = useMemo(() => {
    if (typeof window === 'undefined') return true
    const host = window.location.hostname
    return (
      window.location.protocol === 'https:' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '192.168.68.103' ||
      host === '192.168.68.200'
    )
  }, [])

  const delta = useMemo(() => {
    if (displayHeading == null) return null
    return shortestAngleDelta(displayHeading, target)
  }, [displayHeading, target])

  const absDelta = delta == null ? null : Math.abs(delta)
  const inWindow = absDelta != null && absDelta <= tolerance

  const guidanceTitle = useMemo(() => {
    if (sensorState === 'locked') return 'Locked'
    if (blockedReason !== 'none') return 'Blocked'
    return directionFromDelta(delta, tolerance)
  }, [sensorState, blockedReason, delta, tolerance])

  const guidanceSub = useMemo(() => {
    return statusText(blockedReason, permission, sensorState)
  }, [blockedReason, permission, sensorState])

  const statusChip = useMemo(() => {
    if (sensorState === 'locked') return 'LOCK'
    if (blockedReason !== 'none') return 'BLOCKED'
    return 'TRACK'
  }, [sensorState, blockedReason])

  async function requestMotionPermission() {
    const req = getIosRequestPermission()
    if (!req) {
      setPermission('not_required')
      return
    }

    try {
      const result = await req()
      if (result === 'granted') {
        setPermission('granted')
        setBlockedReason('none')
        setSensorState('checking')
      } else {
        setPermission('denied')
        setBlockedReason('permission')
        setSensorState('blocked')
      }
    } catch {
      setPermission('denied')
      setBlockedReason('permission')
      setSensorState('blocked')
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const req = getIosRequestPermission()

    if (!('DeviceOrientationEvent' in window)) {
      setPermission('not_required')
      setBlockedReason('unsupported')
      setSensorState('blocked')
      return
    }

    if (!isHttps) {
      setBlockedReason('https')
      setSensorState('blocked')
      return
    }

    if (req) {
      setPermission('unknown')
      setBlockedReason('permission')
      setSensorState('blocked')
      return
    }

    setPermission('not_required')
    setBlockedReason('none')
    setSensorState('checking')
  }, [isHttps])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (blockedReason === 'https') return
    if (permission === 'unknown') return
    if (permission === 'denied') return

    function onOrientation(event: DeviceOrientationEvent) {
      const next = readHeading(event)
      if (next == null) return
      rawHeadingRef.current = next
      setRawHeading(next)
      setBlockedReason('none')
      setSensorState((prev) => (prev === 'locked' ? 'locked' : 'ready'))
    }

    window.addEventListener('deviceorientation', onOrientation, true)
    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true)
    }
  }, [permission, blockedReason])

  useEffect(() => {
    if (rawHeading == null) return
    rawHeadingRef.current = rawHeading

    function tick() {
      const targetHeading = rawHeadingRef.current
      const current = smoothHeadingRef.current

      if (targetHeading == null) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      if (current == null) {
        smoothHeadingRef.current = targetHeading
        setDisplayHeading(targetHeading)
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const diff = shortestAngleDelta(current, targetHeading)
      const eased = normalizeDegrees(current + diff * 0.14)
      smoothHeadingRef.current = eased
      setDisplayHeading(eased)
      rafRef.current = requestAnimationFrame(tick)
    }

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [rawHeading])

  useEffect(() => {
    if (sensorState !== 'ready' && sensorState !== 'locked') {
      holdStartRef.current = null
      setHoldProgress(0)
      return
    }

    if (!inWindow) {
      holdStartRef.current = null
      setHoldProgress(0)
      return
    }

    let localRaf = 0

    const run = (now: number) => {
      if (holdStartRef.current == null) holdStartRef.current = now
      const elapsed = now - holdStartRef.current
      const ratio = clamp(elapsed / holdMs, 0, 1)
      setHoldProgress(ratio)

      if (ratio >= 1) {
        if (!wonRef.current && !submitting) {
          wonRef.current = true
          setSensorState('locked')
          void onWin()
        }
        return
      }

      localRaf = requestAnimationFrame(run)
    }

    localRaf = requestAnimationFrame(run)
    return () => cancelAnimationFrame(localRaf)
  }, [inWindow, holdMs, onWin, sensorState, submitting])

  const compassRotation = displayHeading == null ? 0 : -displayHeading
  const targetRotation = target
  const wobbleRotation =
    displayHeading == null ? 0 : clamp(shortestAngleDelta(displayHeading, rawHeading ?? displayHeading) * 0.35, -8, 8)

  const cardBase: CSSProperties = {
    borderRadius: 26,
    border: '1px solid rgba(255,255,255,0.08)',
    background:
      'linear-gradient(180deg, rgba(21,39,97,0.96) 0%, rgba(11,26,73,0.96) 100%)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 40px rgba(0,0,0,0.32)',
  }

  const chipBase: CSSProperties = {
    borderRadius: 999,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.08em',
    lineHeight: 1,
    textTransform: 'uppercase',
    border: '1px solid rgba(255,255,255,0.1)',
    whiteSpace: 'nowrap',
  }

  const statCard: CSSProperties = {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    padding: '12px 12px 14px',
    background: 'rgba(255,255,255,0.045)',
    border: '1px solid rgba(255,255,255,0.07)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  }

  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  }

  const valueStyle: CSSProperties = {
    marginTop: 8,
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: '-0.02em',
    color: '#ffffff',
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        color: '#fff',
      }}
    >
      {!!helperText && (
        <div
          style={{
            fontSize: 15,
            lineHeight: 1.35,
            color: 'rgba(255,255,255,0.86)',
            marginTop: 2,
          }}
        >
          {helperText}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            ...chipBase,
            color: '#f1d36a',
            background: 'rgba(215,161,41,0.13)',
          }}
        >
          {Math.round(target)}°
        </div>
        <div
          style={{
            ...chipBase,
            color: '#f1d36a',
            background: 'rgba(215,161,41,0.13)',
          }}
        >
          ±{Math.round(tolerance)}°
        </div>
        <div
          style={{
            ...chipBase,
            color: '#f1d36a',
            background: 'rgba(215,161,41,0.13)',
          }}
        >
          {(holdMs / 1000).toFixed(1)}s
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            ...chipBase,
            color:
              sensorState === 'locked'
                ? '#dfffd4'
                : blockedReason !== 'none'
                ? '#ffd8df'
                : '#d8e7ff',
            background:
              sensorState === 'locked'
                ? 'rgba(45,160,88,0.24)'
                : blockedReason !== 'none'
                ? 'rgba(146,43,70,0.34)'
                : 'rgba(59,102,196,0.34)',
            minWidth: 86,
            textAlign: 'center',
          }}
        >
          {statusChip}
        </div>
      </div>

      <div
        style={{
          ...cardBase,
          padding: 14,
        }}
      >
        <div
          style={{
            position: 'relative',
            borderRadius: 22,
            padding: '18px 16px 14px',
            overflow: 'hidden',
            background:
              'radial-gradient(circle at 50% 42%, rgba(61,104,228,0.32) 0%, rgba(17,34,90,0.22) 38%, rgba(8,17,52,0.18) 70%, rgba(8,17,52,0) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              maxWidth: 310,
              margin: '0 auto',
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 50% 48%, rgba(35,70,180,0.52) 0%, rgba(14,28,81,0.96) 55%, rgba(3,9,26,1) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow:
                'inset 0 12px 22px rgba(255,255,255,0.04), inset 0 -26px 36px rgba(0,0,0,0.32), 0 18px 48px rgba(0,0,0,0.24)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '7%',
                borderRadius: '50%',
                border: '2px dashed rgba(255,255,255,0.18)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: '3%',
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            />

            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
              const major = deg % 90 === 0
              return (
                <div
                  key={deg}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: major ? 4 : 2,
                    height: major ? '18%' : '10%',
                    transform: `translate(-50%, -100%) rotate(${deg}deg)`,
                    transformOrigin: '50% 100%',
                    borderRadius: 999,
                    background: major
                      ? 'rgba(255,255,255,0.58)'
                      : 'rgba(255,255,255,0.28)',
                  }}
                />
              )
            })}

            {[
              { label: 'N', deg: 0 },
              { label: 'E', deg: 90 },
              { label: 'S', deg: 180 },
              { label: 'W', deg: 270 },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) rotate(${item.deg}deg) translateY(-122px) rotate(${-item.deg}deg)`,
                  fontSize: 16,
                  fontWeight: item.label === 'N' ? 900 : 800,
                  color: item.label === 'N' ? '#ffffff' : 'rgba(255,255,255,0.86)',
                  textShadow: '0 2px 10px rgba(0,0,0,0.35)',
                }}
              >
                {item.label}
              </div>
            ))}

            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `rotate(${targetRotation}deg)`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 50,
                  height: 14,
                  borderRadius: 999,
                  transform: 'translate(92px, -50%)',
                  background: 'linear-gradient(90deg, #ffb300 0%, #ffd15a 100%)',
                  boxShadow: '0 0 18px rgba(255,179,0,0.45)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  transform: 'translate(128px, -50%)',
                  background: '#ffe17b',
                  boxShadow: '0 0 0 10px rgba(255,179,0,0.18)',
                }}
              />
            </div>

            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `rotate(${compassRotation + wobbleRotation}deg)`,
                transition: 'transform 80ms linear',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 8,
                  height: '34%',
                  transform: 'translate(-50%, -100%)',
                  borderRadius: 999,
                  background: 'linear-gradient(180deg, #ffffff 0%, #eef3ff 100%)',
                  boxShadow: '0 0 16px rgba(255,255,255,0.12)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 0,
                  height: 0,
                  transform: 'translate(-50%, -138px)',
                  borderLeft: '13px solid transparent',
                  borderRight: '13px solid transparent',
                  borderBottom: '38px solid #35e06f',
                  filter: 'drop-shadow(0 4px 8px rgba(18,176,74,0.35))',
                }}
              />
            </div>

            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 44,
                height: 44,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #f0f4ff 100%)',
                boxShadow: '0 0 0 10px rgba(196,215,255,0.16)',
              }}
            />

            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 26,
                transform: 'translateX(-50%)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: '0.16em',
                  color: 'rgba(255,255,255,0.62)',
                  textTransform: 'uppercase',
                }}
              >
                Heading
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 26,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                }}
              >
                {formatDeg(displayHeading)}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              {delta == null
                ? 'Track'
                : Math.abs(delta) <= tolerance
                ? 'Aligned'
                : `${delta > 0 ? 'Right' : 'Left'} ${Math.abs(Math.round(delta))}°`}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 15,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              {guidanceSub}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 16,
            }}
          >
            <div style={statCard}>
              <div style={labelStyle}>Target</div>
              <div style={valueStyle}>{Math.round(target)}°</div>
            </div>
            <div style={statCard}>
              <div style={labelStyle}>Delta</div>
              <div style={valueStyle}>
                {delta == null ? '--' : `${Math.abs(Math.round(delta))}°`}
              </div>
            </div>
            <div style={statCard}>
              <div style={labelStyle}>Hold</div>
              <div style={valueStyle}>{Math.round(holdProgress * 100)}%</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              height: 10,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(holdProgress * 100)}%`,
                height: '100%',
                borderRadius: 999,
                background:
                  sensorState === 'locked'
                    ? 'linear-gradient(90deg, #31d56e 0%, #7bff9a 100%)'
                    : inWindow
                    ? 'linear-gradient(90deg, #ffd053 0%, #ffb000 100%)'
                    : 'linear-gradient(90deg, #4667be 0%, #698bff 100%)',
                transition: 'width 100ms linear',
                boxShadow:
                  inWindow || sensorState === 'locked'
                    ? '0 0 12px rgba(255,194,71,0.45)'
                    : 'none',
              }}
            />
          </div>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setFallbackOpen((v) => !v)}
          style={{
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.03)',
            color: 'rgba(255,255,255,0.92)',
            padding: '9px 14px',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.02em',
          }}
        >
          Fallback
        </button>

        {fallbackOpen && (
          <div
            style={{
              ...cardBase,
              marginTop: 10,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.45,
                color: 'rgba(255,255,255,0.84)',
              }}
            >
              {guidanceSub}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 12,
              }}
            >
              {permission === 'unknown' || blockedReason === 'permission' ? (
                <button
                  type="button"
                  onClick={() => void requestMotionPermission()}
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(74,118,222,0.32)',
                    color: '#fff',
                    padding: '10px 14px',
                    fontSize: 14,
                    fontWeight: 800,
                  }}
                >
                  Enable motion
                </button>
              ) : null}

              <button
                type="button"
                disabled={submitting}
                onClick={() => void onWin()}
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  padding: '10px 14px',
                  fontSize: 14,
                  fontWeight: 800,
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Working…' : 'Complete anyway'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BearingHuntRuntimeScreen

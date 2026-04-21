import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { advancePlayer, fetchPlayerGame } from '../shared/api'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../types/player'
import { PlayerShell } from './components/PlayerShell'
import { PlayerHud } from './components/PlayerHud'
import { MapSurface } from './components/MapSurface'
import { InteractionSheet } from './components/InteractionSheet'
import { ToastNotice, type UiNotice } from './components/ToastNotice'
import { deriveStageRuntime } from './runtime'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PlayerGamePayload }

type NoticeTone = 'info' | 'warn' | 'success'
type OverlayState = 'activate' | 'node' | 'finish' | null

function vibrate(pattern: number | number[]) {
  if (typeof window === 'undefined') return
  if (!('navigator' in window)) return
  if (typeof window.navigator.vibrate !== 'function') return
  window.navigator.vibrate(pattern)
}

function getUserFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('user') || 'PLAYER 1'
}

function getCurrentStage(payload: PlayerGamePayload): PlayerStage | null {
  if (payload.finished) return null
  return payload.current_stage || payload.stages?.[payload.level] || null
}

function normalizeGpsStatus(status?: string): PlayerGpsStatus {
  if (!status) return 'unavailable'
  const value = status.toLowerCase()

  if (value === 'ok' || value === 'ready' || value === 'active' || value === 'available') {
    return 'ready'
  }
  if (value === 'stale') return 'stale'
  if (value === 'searching' || value === 'pending') return 'searching'
  if (value === 'error' || value === 'denied') return 'error'
  return 'unavailable'
}

function getPlayerPosition(payload: PlayerGamePayload) {
  const lat = payload.live_status?.lat
  const lon = payload.live_status?.lon

  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  return { lat, lon }
}

function getDistanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const earthRadius = 6371000

  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon

  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function canShowLiveDistance(gpsState: PlayerGpsStatus): boolean {
  return gpsState === 'ready' || gpsState === 'stale'
}

export default function PlayerApp() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uiNotice, setUiNotice] = useState<UiNotice>(null)
  const [overlayState, setOverlayState] = useState<OverlayState>(null)

  const noticeTimerRef = useRef<number | null>(null)
  const overlayTimerRef = useRef<number | null>(null)
  const user = useMemo(() => getUserFromUrl(), [])

  const isPhone =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        setState({ status: 'loading' })
        const payload = await fetchPlayerGame(user)

        if (!cancelled) {
          setState({ status: 'ready', payload })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown load error'

        if (!cancelled) {
          setState({ status: 'error', message })
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current)
      }
    }
  }, [])

  function showNotice(message: string, tone: NoticeTone) {
    setUiNotice({ message, tone })

    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current)
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setUiNotice(null)
      noticeTimerRef.current = null
    }, 2200)
  }

  function showOverlay(nextState: OverlayState) {
    setOverlayState(nextState)

    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current)
    }

    overlayTimerRef.current = window.setTimeout(() => {
      setOverlayState(null)
      overlayTimerRef.current = null
    }, nextState === 'finish' ? 1800 : 900)
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ScreenFrame mobile={isPhone}>
        <StatusCard title="Loading mission" body="Fetching player payload..." />
      </ScreenFrame>
    )
  }

  if (state.status === 'error') {
    return (
      <ScreenFrame mobile={isPhone}>
        <StatusCard title="Player app error" body={state.message} />
      </ScreenFrame>
    )
  }

  if (state.status !== 'ready') {
    return (
      <ScreenFrame mobile={isPhone}>
        <StatusCard title="Player app state" body="Unexpected player state." />
      </ScreenFrame>
    )
  }

  const payload = state.payload
  const currentStage = getCurrentStage(payload)
  const playerPosition = getPlayerPosition(payload)
  const gpsState = normalizeGpsStatus(payload.live_status?.gps_status)

  const rawDistanceMeters =
    currentStage && playerPosition
      ? Math.round(
          getDistanceMeters(playerPosition, {
            lat: currentStage.lat,
            lon: currentStage.lon,
          })
        )
      : null

  const distanceMeters =
    rawDistanceMeters !== null && canShowLiveDistance(gpsState)
      ? rawDistanceMeters
      : null

  const inRange =
    currentStage && distanceMeters !== null
      ? distanceMeters <= currentStage.radius
      : false

  const runtime = deriveStageRuntime({
    currentStage,
    finished: payload.finished,
    distanceMeters,
    gpsState,
    debugEnabled: Boolean(payload.live_status?.debug_enabled),
  })

  async function refreshPayload() {
    const nextPayload = await fetchPlayerGame(user)
    setState({ status: 'ready', payload: nextPayload })
    return nextPayload
  }

  function openInteraction() {
    if (!currentStage || !runtime.canEnter) return
    setSubmitError(null)
    setInteractionOpen(true)
  }

  function handlePrimaryAction() {
    if (!runtime.canEnter) return
    vibrate([10, 16, 10])
    showOverlay('activate')
    openInteraction()
  }

  function handleMapNodeTap() {
    if (payload.finished) {
      showNotice('This route is already complete.', 'info')
      return
    }

    if (runtime.canEnter) {
      handlePrimaryAction()
      return
    }

    if (!currentStage) {
      showNotice('No active node is available yet.', 'warn')
      return
    }

    if (runtime.reason === 'out_of_range') {
      showNotice(
        distanceMeters !== null
          ? `Move closer. Current distance: ${distanceMeters}m.`
          : 'Move closer to the node.',
        'warn'
      )
      return
    }

    if (runtime.reason === 'gps_unavailable' || runtime.reason === 'distance_unknown') {
      showNotice('Waiting for a reliable GPS fix.', 'info')
      return
    }

    showNotice('This node is not ready yet.', 'info')
  }

  async function handleSubmitCode(code: string) {
    try {
      setSubmitting(true)
      setSubmitError(null)

      const result = await advancePlayer(payload.user, code)
      if (result.status !== 'ok') {
        setSubmitError('Invalid code for the current stage.')
        showNotice('The code was not accepted for this node.', 'warn')
        return
      }

      setInteractionOpen(false)
      const nextPayload = await refreshPayload()

      if (nextPayload.finished) {
        showOverlay('finish')
        showNotice('Mission complete.', 'success')
      } else {
        showOverlay('node')
        showNotice('Node cleared.', 'success')
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown submit error'
      setSubmitError(message)
      showNotice('Mission sync failed. Try again.', 'warn')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScreenFrame mobile={isPhone}>
      <div style={getViewportStyle(isPhone)}>
        <MapSurface
          currentStage={currentStage}
          playerPosition={playerPosition}
          gpsState={gpsState}
          debugSimulation={Boolean(payload.live_status?.debug_enabled)}
          onNodeTap={handleMapNodeTap}
        />

        <div style={getTopScrimStyle(isPhone)} />

        <div style={getTopOverlayStyle(isPhone)}>
          <PlayerShell
            payload={payload}
            currentStage={currentStage}
          />
        </div>

        <div style={getToastOverlayStyle(isPhone)}>
          <ToastNotice notice={uiNotice} />
        </div>

        {overlayState ? <CelebrationOverlay state={overlayState} /> : null}

        <div style={getBottomOverlayStyle(isPhone)}>
          <PlayerHud
            currentStage={currentStage}
            level={payload.level}
            finished={payload.finished}
            gpsState={gpsState}
            distanceMeters={distanceMeters}
            inRange={inRange}
            primaryLabel={runtime.primaryLabel}
            primaryTone={runtime.primaryTone}
            primaryDisabled={!runtime.canEnter}
            statusLabel={runtime.statusLabel}
            summary={runtime.summary}
            onPrimaryAction={handlePrimaryAction}
          />
        </div>
      </div>

      <InteractionSheet
        open={interactionOpen}
        currentStage={currentStage}
        summaryText={runtime.summary}
        submitting={submitting}
        errorMessage={submitError}
        onClose={() => {
          if (!submitting) setInteractionOpen(false)
        }}
        onSubmitCode={handleSubmitCode}
      />
    </ScreenFrame>
  )
}

function ScreenFrame({
  children,
  mobile,
}: {
  children: ReactNode
  mobile: boolean
}) {
  return (
    <main
      style={{
        minHeight: mobile ? '100dvh' : '100svh',
        height: mobile ? '100dvh' : 'auto',
        background: 'linear-gradient(180deg, #020617 0%, #07111c 100%)',
        padding: mobile ? 0 : 12,
        fontFamily: 'system-ui, sans-serif',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {children}
    </main>
  )
}

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <section style={statusCard}>
      <div style={statusTitle}>{title}</div>
      <div style={statusBody}>{body}</div>
    </section>
  )
}

function CelebrationOverlay({ state }: { state: OverlayState }) {
  if (!state) return null

  const label =
    state === 'activate'
      ? 'Node ready'
      : state === 'node'
      ? 'Node cleared'
      : 'Mission complete'

  const toneStyle =
    state === 'activate'
      ? overlayInfo
      : state === 'node'
      ? overlaySuccess
      : overlayFinish

  return (
    <>
      <style>{overlayAnimations}</style>
      <div style={overlayWrap}>
        <div style={{ ...pulseRing, ...toneStyle }} />
        <div style={{ ...overlayPill, ...toneStyle }}>{label}</div>
      </div>
    </>
  )
}

function getViewportStyle(mobile: boolean): CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    maxWidth: mobile ? '100%' : 1320,
    height: mobile ? '100dvh' : 'calc(100svh - 24px)',
    minHeight: mobile ? '100dvh' : 620,
    maxHeight: mobile ? '100dvh' : 980,
    margin: '0 auto',
    overflow: 'hidden',
  }
}

function getTopScrimStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: mobile ? 132 : 160,
    zIndex: 1100,
    pointerEvents: 'none',
    borderTopLeftRadius: mobile ? 0 : 28,
    borderTopRightRadius: mobile ? 0 : 28,
    background:
      'linear-gradient(180deg, rgba(2,6,23,.82) 0%, rgba(2,6,23,.52) 48%, rgba(2,6,23,0) 100%)',
  }
}

function getTopOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    top: mobile ? 'calc(env(safe-area-inset-top, 0px) + 10px)' : 14,
    left: mobile ? 0 : 12,
    right: mobile ? 0 : 12,
    zIndex: 1200,
    pointerEvents: 'none',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
  }
}

function getToastOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: mobile ? 12 : 16,
    right: mobile ? 12 : 16,
    bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 174px)' : 190,
    zIndex: 1250,
    pointerEvents: 'none',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  }
}

function getBottomOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: mobile ? 0 : 12,
    right: mobile ? 0 : 12,
    bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 12px)' : 12,
    zIndex: 1200,
    pointerEvents: 'none',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
  }
}

const overlayWrap: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1235,
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const pulseRing: CSSProperties = {
  position: 'absolute',
  width: 190,
  height: 190,
  borderRadius: '50%',
  opacity: 0.22,
  animation: 'sagaPulseRing 720ms ease-out forwards',
}

const overlayPill: CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.08em',
  boxShadow: '0 14px 30px rgba(15,23,42,.22)',
  animation: 'sagaOverlayPop 520ms cubic-bezier(0.22, 1, 0.36, 1)',
}

const overlayInfo: CSSProperties = {
  background: 'rgba(239,246,255,.96)',
  border: '1px solid rgba(59,130,246,.16)',
  color: '#1d4ed8',
}

const overlaySuccess: CSSProperties = {
  background: 'rgba(220,252,231,.96)',
  border: '1px solid rgba(22,163,74,.18)',
  color: '#166534',
}

const overlayFinish: CSSProperties = {
  background: 'rgba(250,245,255,.96)',
  border: '1px solid rgba(168,85,247,.18)',
  color: '#7e22ce',
}

const overlayAnimations = `
@keyframes sagaPulseRing {
  from {
    transform: scale(.42);
    opacity: .28;
  }
  to {
    transform: scale(1.24);
    opacity: 0;
  }
}

@keyframes sagaOverlayPop {
  from {
    transform: scale(.94);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
`

const statusCard: CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(7,17,28,.82)',
  boxShadow: '0 18px 40px rgba(0,0,0,.26)',
  padding: 20,
  maxWidth: 760,
  margin: '40px auto',
}

const statusTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#ffffff',
}

const statusBody: CSSProperties = {
  fontSize: 14,
  color: '#cbd5e1',
  marginTop: 8,
  lineHeight: 1.5,
}

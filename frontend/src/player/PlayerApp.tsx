import { useEffect, useMemo, useRef, useState } from 'react'
import { advancePlayer, fetchPlayerGame } from '../shared/api'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../types/player'
import { PlayerShell } from './components/PlayerShell'
import { PlayerHud } from './components/PlayerHud'
import { MapSurface } from './components/MapSurface'
import { InteractionSheet } from './components/InteractionSheet'
import { deriveStageRuntime, type PlayerPanel } from './runtime'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PlayerGamePayload }

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
  const [activePanel, setActivePanel] = useState<PlayerPanel>(null)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [localDebugEnabled, setLocalDebugEnabled] = useState(false)
  const [mapNotice, setMapNotice] = useState<string | null>(null)

  const noticeTimerRef = useRef<number | null>(null)
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
    }
  }, [])

  function showMapNotice(message: string) {
    setMapNotice(message)

    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current)
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setMapNotice(null)
      noticeTimerRef.current = null
    }, 2200)
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ScreenFrame mobile={isPhone}>
        <StatusCard title="Loading player app" body="Fetching player mission payload..." />
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

  const effectiveDebugEnabled =
    Boolean(payload.live_status?.debug_enabled) || localDebugEnabled

  const runtime = deriveStageRuntime({
    currentStage,
    finished: payload.finished,
    distanceMeters,
    gpsState,
    debugEnabled: effectiveDebugEnabled,
  })

  const legacyPlayerHref = `/player/${encodeURIComponent(payload.user)}`
  const legacyLoginHref = '/legacy/'
  const adminHref = '/admin'

  async function refreshPayload() {
    const nextPayload = await fetchPlayerGame(user)
    setState({ status: 'ready', payload: nextPayload })
  }

  function togglePanel(panel: Exclude<PlayerPanel, null>) {
    setActivePanel((current) => (current === panel ? null : panel))
  }

  function closeMenu() {
    setActivePanel((current) => (current === 'menu' ? null : current))
  }

  function handleToggleDebug() {
    vibrate(8)
    setLocalDebugEnabled((current) => !current)
    showMapNotice(localDebugEnabled ? 'Local debug disabled.' : 'Local debug enabled.')
  }

  function openInteraction() {
    setSubmitError(null)
    setActivePanel(null)
    setInteractionOpen(true)
  }

  function handlePrimaryAction() {
    if (!runtime.canEnter) return
    vibrate([10, 16, 10])
    openInteraction()
  }

  function handleMapNodeTap() {
    if (payload.finished) return

    if (runtime.canEnter) {
      vibrate([10, 16, 10])
      openInteraction()
      return
    }

    vibrate(8)

    if (!currentStage) {
      showMapNotice('Complete the previous stage before interacting here.')
      return
    }

    if (runtime.reason === 'out_of_range') {
      showMapNotice(
        distanceMeters !== null
          ? 'Too far away. Move closer to the node.'
          : 'Too far from the node.'
      )
      return
    }

    if (runtime.reason === 'gps_unavailable' || runtime.reason === 'distance_unknown') {
      showMapNotice('Waiting for a reliable GPS fix.')
      return
    }

    if (runtime.reason === 'missing_stage') {
      showMapNotice('Complete the previous stage first.')
      return
    }

    showMapNotice('Interaction is not available yet.')
  }

  async function handleSubmitCode(code: string) {
    try {
      setSubmitting(true)
      setSubmitError(null)

      const result = await advancePlayer(payload.user, code)
      if (result.status !== 'ok') {
        setSubmitError('Invalid code for the current stage.')
        return
      }

      setInteractionOpen(false)
      await refreshPayload()
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unknown submit error'
      )
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
          debugSimulation={effectiveDebugEnabled}
          onNodeTap={handleMapNodeTap}
        />

        <div style={getTopScrimStyle(isPhone)} />

        <div style={getTopOverlayStyle(isPhone)}>
          <PlayerShell
            payload={payload}
            currentStage={currentStage}
            gpsState={gpsState}
            inRange={inRange}
            distanceMeters={distanceMeters}
          />
        </div>

        <div style={getBottomOverlayStyle(isPhone)}>
          <PlayerHud
            currentStage={currentStage}
            level={payload.level}
            finished={payload.finished}
            gpsState={gpsState}
            distanceMeters={distanceMeters}
            inRange={inRange}
            debugEnabled={effectiveDebugEnabled}
            mapNotice={mapNotice}
            legacyPlayerHref={legacyPlayerHref}
            legacyLoginHref={legacyLoginHref}
            adminHref={adminHref}
            detailsOpen={activePanel === 'details'}
            menuOpen={activePanel === 'menu'}
            primaryLabel={runtime.primaryLabel}
            primaryTone={runtime.primaryTone}
            primaryDisabled={!runtime.canEnter}
            helperText={runtime.helperText}
            onPrimaryAction={handlePrimaryAction}
            onToggleDetails={() => togglePanel('details')}
            onToggleMenu={() => togglePanel('menu')}
            onCloseMenu={closeMenu}
            onToggleDebug={handleToggleDebug}
          />
        </div>
      </div>

      <InteractionSheet
        open={interactionOpen}
        user={payload.user}
        currentStage={currentStage}
        helperText={runtime.helperText}
        legacyPlayerHref={legacyPlayerHref}
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
  children: React.ReactNode
  mobile: boolean
}) {
  return (
    <main
      style={{
        minHeight: mobile ? '100dvh' : '100svh',
        height: mobile ? '100dvh' : 'auto',
        background:
          'linear-gradient(180deg, #eef3ed 0%, #e8efea 48%, #e2ebe3 100%)',
        padding: mobile ? 0 : 12,
        fontFamily: 'system-ui, sans-serif',
        color: '#10231a',
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

function getViewportStyle(mobile: boolean): React.CSSProperties {
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

function getTopScrimStyle(mobile: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: mobile ? 110 : 132,
    zIndex: 1100,
    pointerEvents: 'none',
    borderTopLeftRadius: mobile ? 0 : 28,
    borderTopRightRadius: mobile ? 0 : 28,
    background:
      'linear-gradient(180deg, rgba(238,243,237,.96) 0%, rgba(238,243,237,.86) 42%, rgba(238,243,237,.52) 72%, rgba(238,243,237,0) 100%)',
  }
}

function getTopOverlayStyle(mobile: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: mobile ? 'calc(env(safe-area-inset-top, 0px) + 8px)' : 12,
    left: mobile ? 10 : 12,
    right: mobile ? 10 : 12,
    zIndex: 1200,
    pointerEvents: 'none',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
  }
}

function getBottomOverlayStyle(mobile: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    left: mobile ? 10 : 12,
    right: mobile ? 10 : 12,
    bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 8px)' : 12,
    zIndex: 1200,
    pointerEvents: 'none',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
  }
}

const statusCard: React.CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.9)',
  boxShadow: '0 18px 40px rgba(15,23,42,.06)',
  padding: 20,
  maxWidth: 760,
  margin: '0 auto',
}

const statusTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#0f172a',
}

const statusBody: React.CSSProperties = {
  fontSize: 14,
  color: '#475569',
  marginTop: 8,
  lineHeight: 1.5,
}

import { useEffect, useMemo, useState } from 'react'
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

export default function PlayerApp() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [activePanel, setActivePanel] = useState<PlayerPanel>(null)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [localDebugEnabled, setLocalDebugEnabled] = useState(false)

  const user = useMemo(() => getUserFromUrl(), [])

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

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ScreenFrame>
        <StatusCard title="Loading player app" body="Fetching player mission payload..." />
      </ScreenFrame>
    )
  }

  if (state.status === 'error') {
    return (
      <ScreenFrame>
        <StatusCard title="Player app error" body={state.message} />
      </ScreenFrame>
    )
  }

  if (state.status !== 'ready') {
    return (
      <ScreenFrame>
        <StatusCard title="Player app state" body="Unexpected player state." />
      </ScreenFrame>
    )
  }

  const payload = state.payload
  const currentStage = getCurrentStage(payload)
  const playerPosition = getPlayerPosition(payload)
  const gpsState = normalizeGpsStatus(payload.live_status?.gps_status)

  const distanceMeters =
    currentStage && playerPosition
      ? Math.round(
          getDistanceMeters(playerPosition, {
            lat: currentStage.lat,
            lon: currentStage.lon,
          })
        )
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
    setLocalDebugEnabled((current) => !current)
  }

  function handlePrimaryAction() {
    if (!runtime.canEnter) return
    setSubmitError(null)
    setActivePanel(null)
    setInteractionOpen(true)
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
    <ScreenFrame>
      <div style={viewport}>
        <MapSurface
          currentStage={currentStage}
          playerPosition={playerPosition}
          gpsState={gpsState}
          debugSimulation={effectiveDebugEnabled}
        />

        <div style={topScrim} />

        <div style={topOverlay}>
          <PlayerShell
            payload={payload}
            currentStage={currentStage}
            gpsState={gpsState}
            inRange={inRange}
            distanceMeters={distanceMeters}
          />
        </div>

        <div style={bottomOverlay}>
          <PlayerHud
            currentStage={currentStage}
            level={payload.level}
            finished={payload.finished}
            gpsState={gpsState}
            distanceMeters={distanceMeters}
            inRange={inRange}
            debugEnabled={effectiveDebugEnabled}
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

function ScreenFrame({ children }: { children: React.ReactNode }) {
  return <main style={frame}>{children}</main>
}

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <section style={statusCard}>
      <div style={statusTitle}>{title}</div>
      <div style={statusBody}>{body}</div>
    </section>
  )
}

const frame: React.CSSProperties = {
  minHeight: '100svh',
  background:
    'linear-gradient(180deg, #eef3ed 0%, #e8efea 48%, #e2ebe3 100%)',
  padding: 12,
  fontFamily: 'system-ui, sans-serif',
  color: '#10231a',
}

const viewport: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 1320,
  height: 'calc(100svh - 24px)',
  minHeight: 620,
  maxHeight: 980,
  margin: '0 auto',
}

const topScrim: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 132,
  zIndex: 1100,
  pointerEvents: 'none',
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  background:
    'linear-gradient(180deg, rgba(238,243,237,.96) 0%, rgba(238,243,237,.86) 42%, rgba(238,243,237,.52) 72%, rgba(238,243,237,0) 100%)',
}

const topOverlay: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  right: 12,
  zIndex: 1200,
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
}

const bottomOverlay: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 1200,
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-end',
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

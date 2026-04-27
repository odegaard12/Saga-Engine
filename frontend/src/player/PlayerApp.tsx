import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { advancePlayer, fetchPlayerGame, fetchTeamStatus, sendHeartbeat } from '../shared/api'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage, TeamProfileLiveStatus } from '../types/player'
import { PlayerShell } from './components/PlayerShell'
import { PlayerHud } from './components/PlayerHud'
import { MapSurface } from './components/MapSurface'
import { InteractionSheet } from './components/InteractionSheet'
import { TeamSheet } from './components/TeamSheet'
import { ToastNotice, type UiNotice } from './components/ToastNotice'
import { deriveStageRuntime, type PlayerPanel } from './runtime'
import { getPlayerNameFromLocation } from '../shared/playerRoute'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PlayerGamePayload }

type NoticeTone = 'info' | 'warn' | 'success'
type OverlayState = 'activate' | 'node' | 'finish' | null
type FocusRequest =
  | {
      target: 'player' | 'node'
      token: number
    }
  | null

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
  const [localDebugPosition, setLocalDebugPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [followPlayer, setFollowPlayer] = useState(true)
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null)
  const [uiNotice, setUiNotice] = useState<UiNotice>(null)
  const [overlayState, setOverlayState] = useState<OverlayState>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [teamProfiles, setTeamProfiles] = useState<TeamProfileLiveStatus[]>([])

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
    let cancelled = false
    let intervalId: number | null = null

    async function loadTeam() {
      try {
        const team = await fetchTeamStatus(user)
        if (!cancelled) {
          setTeamProfiles(Array.isArray(team.profiles) ? team.profiles : [])
        }
      } catch {
        if (!cancelled) {
          setTeamProfiles([])
        }
      }
    }

    loadTeam()
    intervalId = window.setInterval(loadTeam, 1000)

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [user])

  useEffect(() => {
    if (state.status !== 'ready') return
    const readyPayload: PlayerGamePayload = state.payload

    let intervalId: number | null = null

    async function publishHeartbeat() {
      try {
        const secureLiveGpsContext =
          typeof window !== 'undefined' &&
          window.isSecureContext &&
          window.location.protocol === 'https:'

        const rawLivePlayerPosition = getPlayerPosition(readyPayload)
        const rawGpsState = normalizeGpsStatus(readyPayload.live_status?.gps_status)

        const effectivePosition = localDebugPosition
          ? localDebugPosition
          : secureLiveGpsContext && (rawGpsState === 'ready' || rawGpsState === 'stale')
          ? rawLivePlayerPosition
          : null

        await sendHeartbeat({
          user,
          ...(effectivePosition
            ? {
                lat: effectivePosition.lat,
                lon: effectivePosition.lon,
                gps_status: 'ok',
              }
            : {
                gps_status: 'unavailable',
              }),
          source: localDebugPosition ? 'react' : 'player',
        })
      } catch {
        // ignore heartbeat errors in the UI loop
      }
    }

    publishHeartbeat()
    intervalId = window.setInterval(publishHeartbeat, 2000)

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [
    user,
    state.status,
    state.status === 'ready' ? state.payload.live_status?.lat : null,
    state.status === 'ready' ? state.payload.live_status?.lon : null,
    state.status === 'ready' ? state.payload.live_status?.gps_status : null,
    localDebugPosition?.lat,
    localDebugPosition?.lon,
  ])



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

  const rawLivePlayerPosition = getPlayerPosition(payload)
  const secureLiveGpsContext =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    window.location.protocol === 'https:'

  const rawGpsState = normalizeGpsStatus(payload.live_status?.gps_status)

  const gpsState = localDebugPosition
    ? 'ready'
    : secureLiveGpsContext
    ? rawGpsState
    : 'unavailable'

  const livePlayerPosition =
    secureLiveGpsContext && (rawGpsState === 'ready' || rawGpsState === 'stale')
      ? rawLivePlayerPosition
      : null

  const playerPosition = localDebugPosition || livePlayerPosition

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
    Boolean(payload.live_status?.debug_enabled) ||
    localDebugEnabled ||
    Boolean(localDebugPosition)

  const runtime = deriveStageRuntime({
    currentStage,
    finished: payload.finished,
    distanceMeters,
    gpsState,
    debugEnabled: effectiveDebugEnabled,
  })

  const hudHelperText =
    !localDebugPosition &&
    !secureLiveGpsContext &&
    runtime.reason === 'gps_unavailable'
      ? 'Live GPS is unavailable here. Use local debug tap or open the published HTTPS player.'
      : runtime.helperText

  const teamOtherProfiles = teamProfiles.filter(
    (member) => !member.is_self && member.user !== payload.user
  )
  const teamLiveCount = teamOtherProfiles.filter(
    (member) => String(member.presence || '').toLowerCase() === 'live'
  ).length
  const teamVisibleCount = teamOtherProfiles.filter(
    (member) => String(member.presence || '').toLowerCase() !== 'offline'
  ).length

  const playerHref = `/player/${encodeURIComponent(payload.user)}`
  const shellLoginHref = '/'
  const adminHref = '/admin'

  async function refreshPayload() {
    const nextPayload = await fetchPlayerGame(user)
    setState({ status: 'ready', payload: nextPayload })
    return nextPayload
  }

  function togglePanel(panel: Exclude<PlayerPanel, null>) {
    setToolsOpen(false)
    setTeamOpen(false)
    setActivePanel((current) => (current === panel ? null : panel))
  }

  function openTools() {
    setActivePanel(null)
    setTeamOpen(false)
    setToolsOpen((current) => !current)
  }

  function closeTools() {
    setToolsOpen(false)
  }

  function openTeam() {
    setActivePanel(null)
    setToolsOpen(false)
    setTeamOpen((current) => !current)
  }

  function closeTeam() {
    setTeamOpen(false)
  }

  function handleOpenEntry() {
    vibrate(10)
    window.location.assign(shellLoginHref)
  }

  function handleToggleDebug() {
    const currentlyActive = localDebugEnabled || Boolean(localDebugPosition)

    if (currentlyActive) {
      setLocalDebugEnabled(false)
      setLocalDebugPosition(null)
      setFollowPlayer(true)
      void sendHeartbeat({
        user,
        gps_status: 'unavailable',
        source: 'react',
      })
      showNotice('Debug tap disabled. Live GPS restored.', 'info')
      vibrate(8)
      return
    }

    setLocalDebugEnabled(true)
    showNotice('Debug tap enabled. Tap the map to place simulated GPS.', 'success')
    vibrate([10, 16, 10])
  }

  function handleDebugSetPosition(position: { lat: number; lon: number }) {
    setLocalDebugEnabled(true)
    setLocalDebugPosition(position)
    setFollowPlayer(true)
    setFocusRequest({ target: 'player', token: Date.now() })
    void sendHeartbeat({
      user,
      lat: position.lat,
      lon: position.lon,
      gps_status: 'ok',
      source: 'react',
    })
    showNotice('Simulated GPS updated from map tap.', 'success')
    vibrate([10, 12, 10])
  }

  function handleFocusPlayer() {
    if (!playerPosition) {
      showNotice('No player position is available yet.', 'warn')
      vibrate(8)
      return
    }

    setFocusRequest({ target: 'player', token: Date.now() })
    setFollowPlayer(true)
    showNotice('Centered on player.', 'info')
    vibrate(8)
  }

  function handleFocusNode() {
    if (!currentStage) {
      showNotice('No active node is available right now.', 'warn')
      vibrate(8)
      return
    }

    setFocusRequest({ target: 'node', token: Date.now() })
    showNotice('Centered on node.', 'info')
    vibrate(8)
  }

  function handleToggleFollow() {
    setFollowPlayer((current) => {
      const next = !current
      showNotice(next ? 'Player follow enabled.' : 'Free map enabled.', 'info')
      vibrate(8)
      return next
    })
  }

  function openInteraction() {
    setSubmitError(null)
    setActivePanel(null)
    setToolsOpen(false)
    setTeamOpen(false)
    setInteractionOpen(true)
  }

  function handlePrimaryAction() {
    if (!runtime.canEnter) return
    setFocusRequest({ target: 'node', token: Date.now() })
    vibrate([10, 16, 10])
    showOverlay('activate')
    openInteraction()
  }

  function handleMapNodeTap() {
    if (payload.finished) return

    vibrate(8)

    if (!currentStage) {
      showNotice('Complete the previous stage before interacting here.', 'warn')
      return
    }

    setFocusRequest({ target: 'node', token: Date.now() })

    if (runtime.canEnter) {
      showNotice('Target in range. Use Open Interaction.', 'info')
      return
    }

    if (runtime.reason === 'out_of_range') {
      showNotice(
        distanceMeters !== null
          ? 'Too far away. Move closer to the node.'
          : 'Too far from the node.',
        'warn'
      )
      return
    }

    if (runtime.reason === 'gps_unavailable' || runtime.reason === 'distance_unknown') {
      showNotice('Position is not ready yet.', 'info')
      return
    }

    if (runtime.reason === 'missing_stage') {
      showNotice('Complete the previous stage first.', 'warn')
      return
    }

    showNotice('Interaction is not available yet.', 'info')
  }

  async function handleSubmitCode(code: string) {
    try {
      setSubmitting(true)
      setSubmitError(null)

      const result = await advancePlayer(payload.user, code)
      if (result.status !== 'ok') {
        setSubmitError('Invalid code for the current stage.')
        showNotice('The code was not accepted for this stage.', 'warn')
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
          debugSimulation={localDebugEnabled || Boolean(localDebugPosition)}
          followPlayer={followPlayer}
          focusRequest={focusRequest}
          nodeState={interactionOpen ? 'engaging' : runtime.canEnter ? 'ready' : 'locked'}
          otherPlayers={teamOtherProfiles}
          selfLabel={'ME'}
          onDebugSetPosition={handleDebugSetPosition}
          onNodeTap={handleMapNodeTap}
        />

        <div style={getTopScrimStyle(isPhone)} />

        <div style={getTopOverlayStyle(isPhone)}>
          <PlayerShell
            payload={payload}
            currentStage={currentStage}
            teamOpen={teamOpen}
            teamCount={teamVisibleCount}
            teamLiveCount={teamLiveCount}
            onOpenTeam={openTeam}
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
            debugEnabled={effectiveDebugEnabled}
            followPlayer={followPlayer}
            toolsOpen={toolsOpen}
            playerHref={playerHref}
            loginHref={shellLoginHref}
            adminHref={adminHref}
            primaryLabel={runtime.primaryLabel}
            primaryTone={runtime.primaryTone}
            primaryDisabled={!runtime.canEnter}
            helperText={hudHelperText}
            detailsOpen={activePanel === 'details'}
            onPrimaryAction={handlePrimaryAction}
            onToggleDetails={() => togglePanel('details')}
            onOpenTools={openTools}
            onCloseTools={closeTools}
            onToggleDebug={handleToggleDebug}
          />
        </div>
      </div>

      <TeamSheet
        open={teamOpen}
        players={teamOtherProfiles}
        currentPosition={playerPosition}
        onClose={closeTeam}
      />

      <InteractionSheet
        open={interactionOpen}
        user={payload.user}
        currentStage={currentStage}
        helperText={runtime.helperText}
        playerHref={playerHref}
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
    height: mobile ? 132 : 144,
    zIndex: 1100,
    pointerEvents: 'none',
    borderTopLeftRadius: mobile ? 0 : 28,
    borderTopRightRadius: mobile ? 0 : 28,
    background:
      'linear-gradient(180deg, rgba(238,243,237,.96) 0%, rgba(238,243,237,.86) 42%, rgba(238,243,237,.52) 72%, rgba(238,243,237,0) 100%)',
  }
}

function getTopOverlayStyle(mobile: boolean): CSSProperties {
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

function getToastOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: mobile ? 12 : 16,
    right: mobile ? 12 : 16,
    bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 154px)' : 176,
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
    left: mobile ? 10 : 12,
    right: mobile ? 10 : 12,
    bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 10px)' : 12,
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
  boxShadow: '0 14px 30px rgba(15,23,42,.12)',
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
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.9)',
  boxShadow: '0 18px 40px rgba(15,23,42,.06)',
  padding: 20,
  maxWidth: 760,
  margin: '0 auto',
}

const statusTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#0f172a',
}

const statusBody: CSSProperties = {
  fontSize: 14,
  color: '#475569',
  marginTop: 8,
  lineHeight: 1.5,
}

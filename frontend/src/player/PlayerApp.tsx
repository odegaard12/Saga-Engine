import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { advancePlayer, fetchPlayerGame, fetchPublicConfig, fetchTeamStatus, sendHeartbeat } from '../shared/api'
import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage, TeamProfileLiveStatus } from '../types/player'
import { PlayerShell } from './components/PlayerShell'
import { PlayerHud } from './components/PlayerHud'
import { QuickProofPanel } from './components/QuickProofPanel'
import { MapSurface } from './components/MapSurface'
import { InteractionSheet } from './components/InteractionSheet'
import { TeamSheet } from './components/TeamSheet'
import { ToastNotice, type UiNotice } from './components/ToastNotice'
import { FieldPrepPanel } from './components/FieldPrepPanel'
import { deriveStageRuntime, type PlayerPanel } from './runtime'
import { getPlayerNameFromLocation } from '../shared/playerRoute'
import { advanceLocalProgress, getOfflineMissionSummary, getStoredMissionPack, saveMissionPack, type OfflineMissionSummary } from './offline/missionPack'
import { cachePlayerShell, registerPlayerServiceWorker } from './offline/pwaShell'
import { cacheTeamProfiles, getCachedTeamProfiles } from './offline/teamPresence'
import { countVisibleTeamMarkers, teamProfilesToMapMarkers } from './offline/teamMapPresence'
import { queueManualCode } from './offline/physicalEvents'
import { loadInventorySnapshot } from './offline/inventory'
import { getDistanceMeters } from './utils/geo'
import { readStoredGpsPosition, rememberGpsPosition, rememberGpsReady, hasRememberedGpsReady } from './utils/gpsStorage'
import { getCurrentStage, getPlayerPosition, getStagePosition, getStageRadius, normalizeGpsStatus } from './utils/stagePosition'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PlayerGamePayload }

type NoticeTone = 'info' | 'warn' | 'success'
type OverlayState = 'activate' | 'node' | 'finish' | null
type FocusRequest =
  | {
      target: 'player' | 'node' | 'route'
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

type ActiveItemRequirement = {
  itemId: string
  label: string
  quantity: number
  consume: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readActiveItemRequirement(stage: PlayerStage | null): ActiveItemRequirement | null {
  if (!stage) return null

  const raw = asRecord(stage)
  const requirements = asRecord(raw.requirements)
  const items = Array.isArray(requirements.items) ? requirements.items : []
  const first = asRecord(items[0])
  const config = {
    ...asRecord(raw.config),
    ...asRecord(asRecord(raw.minigame).config),
  }

  const itemId = String(first.item_id || first.required_item_id || config.required_item_id || '').trim()
  const label = String(first.label || first.required_item_label || config.required_item_label || itemId).trim()
  const quantityRaw = first.quantity || first.required_item_quantity || config.required_item_quantity || 1
  const quantity = Number.isFinite(Number(quantityRaw)) ? Math.max(1, Math.floor(Number(quantityRaw))) : 1
  const consumeRaw = first.consume ?? first.required_item_consume ?? config.required_item_consume
  const consume = consumeRaw === true || String(consumeRaw || '').toLowerCase() === 'true'

  if (!itemId) return null
  return { itemId, label: label || itemId, quantity, consume }
}

function countOwnedItems(user: string, itemId: string): number {
  return loadInventorySnapshot(user).items
    .filter((item) => item.item_id === itemId && item.state !== 'used')
    .reduce((total, item) => total + Math.max(0, item.quantity || 0), 0)
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
  const [routeOverviewActive, setRouteOverviewActive] = useState(false)
  const [uiNotice, setUiNotice] = useState<UiNotice>(null)
  const [overlayState, setOverlayState] = useState<OverlayState>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [teamProfiles, setTeamProfiles] = useState<TeamProfileLiveStatus[]>([])
  const [offlinePrepVisible, setOfflinePrepVisible] = useState(true)
  const [offlinePrepState, setOfflinePrepState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [offlineSummary, setOfflineSummary] = useState<OfflineMissionSummary | null>(null)
  const [browserGpsPosition, setBrowserGpsPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [browserGpsStatus, setBrowserGpsStatus] = useState<PlayerGpsStatus>('unavailable')
  const [inventoryRevision, setInventoryRevision] = useState(0)

  const noticeTimerRef = useRef<number | null>(null)
  const overlayTimerRef = useRef<number | null>(null)
  const gpsWatchRef = useRef<number | null>(null)
  const gpsCenteredRef = useRef(false)
  const gpsNoticeShownRef = useRef(false)
  const user = useMemo(() => getPlayerNameFromLocation() || getUserFromUrl(), [])

  const isPhone =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  useEffect(() => {
    const handleInventoryUpdated = () => {
      setInventoryRevision((current) => current + 1)
    }

    window.addEventListener('saga:inventory-updated', handleInventoryUpdated)
    window.addEventListener('storage', handleInventoryUpdated)

    return () => {
      window.removeEventListener('saga:inventory-updated', handleInventoryUpdated)
      window.removeEventListener('storage', handleInventoryUpdated)
    }
  }, [])

  useEffect(() => {
    const playerUrl = `/player/${encodeURIComponent(user)}`
    void registerPlayerServiceWorker()
    void cachePlayerShell(playerUrl)

    const storedGps = readStoredGpsPosition(user)
    if (storedGps) {
      setBrowserGpsPosition(storedGps)
      setBrowserGpsStatus('stale')
      setFollowPlayer(true)
      gpsCenteredRef.current = false
      window.setTimeout(() => {
        setFocusRequest({ target: 'player', token: Date.now() })
      }, 250)
    }

    if (hasRememberedGpsReady(user)) {
      setOfflinePrepVisible(false)
      window.setTimeout(() => {
        void handleRequestLiveGps({ silent: true, forceFocus: true })
      }, 300)
    }
  }, [user])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        setState({ status: 'loading' })
        const payload = await fetchPlayerGame(user, { offlinePack: true })

        if (!cancelled) {
          setState({ status: 'ready', payload })
        }
      } catch (error) {
        const offlinePack = await getStoredMissionPack(user).catch(() => null)

        if (!cancelled && offlinePack?.payload) {
          setState({ status: 'ready', payload: offlinePack.payload })
          return
        }

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
        const profiles = Array.isArray(team.profiles) ? team.profiles : []
        cacheTeamProfiles(user, profiles)
        if (!cancelled) {
          setTeamProfiles(profiles)
        }
      } catch {
        const cachedTeam = getCachedTeamProfiles(user)
        if (!cancelled) {
          setTeamProfiles(cachedTeam.profiles)
        }
      }
    }

    loadTeam()
    intervalId = window.setInterval(loadTeam, 5000)

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [user])

  useEffect(() => {
    if (state.status !== 'ready') return

    let cancelled = false

    getOfflineMissionSummary(user)
      .then((summary) => {
        if (!cancelled) {
          setOfflineSummary(summary)

          if (summary?.hasPack && hasRememberedGpsReady(user)) {
            setOfflinePrepVisible(false)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setOfflineSummary(null)
      })

    return () => {
      cancelled = true
    }
  }, [user, state.status, offlinePrepState])

  useEffect(() => {
    if (state.status !== 'ready') return

    let intervalId: number | null = null

    async function publishHeartbeat() {
      try {
        const readyPayload = (state as { status: 'ready'; payload: PlayerGamePayload }).payload
        const rawLivePosition = getPlayerPosition(readyPayload)
        const effectivePosition = localDebugPosition || browserGpsPosition || rawLivePosition

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
          source: localDebugPosition ? 'react' : browserGpsPosition ? 'browser_gps' : 'player',
        })
      } catch {
        // ignore heartbeat errors in the UI loop
      }
    }

    publishHeartbeat()
    intervalId = window.setInterval(publishHeartbeat, 5000)

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
    localDebugPosition?.lat,
    localDebugPosition?.lon,
    browserGpsPosition?.lat,
    browserGpsPosition?.lon,
  ])


  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current)
      }
      if (gpsWatchRef.current !== null && typeof window !== 'undefined' && window.navigator.geolocation) {
        window.navigator.geolocation.clearWatch(gpsWatchRef.current)
        gpsWatchRef.current = null
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

  const gpsState: PlayerGpsStatus = localDebugPosition
    ? 'ready'
    : browserGpsPosition
    ? 'ready'
    : browserGpsStatus === 'searching'
    ? 'searching'
    : browserGpsStatus === 'error'
    ? 'error'
    : 'unavailable'

  const playerPosition = browserGpsPosition || localDebugPosition
  const stagePosition = getStagePosition(currentStage)
  const stageRadius = getStageRadius(currentStage)

  const distanceMeters =
    stagePosition && playerPosition
      ? Math.round(getDistanceMeters(playerPosition, stagePosition))
      : null

  const inRange =
    stageRadius !== null && distanceMeters !== null
      ? distanceMeters <= stageRadius
      : false

  const effectiveDebugEnabled =
    localDebugEnabled ||
    Boolean(localDebugPosition)

  const runtime = deriveStageRuntime({
    currentStage,
    finished: payload.finished,
    distanceMeters,
    gpsState,
    debugEnabled: effectiveDebugEnabled,
  })

  const gpsActionRequired =
    !payload.finished &&
    Boolean(currentStage) &&
    !browserGpsPosition &&
    !localDebugPosition

  const activeRequirement = readActiveItemRequirement(currentStage)
  const ownedRequirementQuantity = activeRequirement
    ? countOwnedItems(payload.user, activeRequirement.itemId)
    : 0
  const missingRequiredItem = Boolean(
    activeRequirement && ownedRequirementQuantity < activeRequirement.quantity
  )
  void inventoryRevision

  const hudHelperText =
    missingRequiredItem && activeRequirement
      ? `Necesitas ${activeRequirement.quantity > 1 ? `${activeRequirement.quantity}× ` : ''}${activeRequirement.label}. Escanea su QR físico para guardarlo en Objetos.`
      : gpsActionRequired
      ? 'Activa GPS para calcular distancia, centrarte en el mapa y entrar en el nodo cuando estés dentro del radio.'
      : runtime.helperText

  const teamOtherProfiles = teamProfiles.filter(
    (member) => !member.is_self && member.user !== payload.user
  )
  const teamMapMarkers = teamProfilesToMapMarkers(teamProfiles, {
    includeSelf: false,
    includeOfflineWithPosition: true,
  })
  const teamMarkerSummary = countVisibleTeamMarkers(teamMapMarkers)
  const teamLiveCount = teamMarkerSummary.live
  const teamVisibleCount = teamMarkerSummary.live + teamMarkerSummary.stale

  const playerHref = `/player/${encodeURIComponent(payload.user)}`
  const shellLoginHref = '/'
  const adminHref = '/admin'
  const hasOfflineMission = offlinePrepState === 'saved' || Boolean(offlineSummary?.hasPack)
  const hasBrowserGps = Boolean(browserGpsPosition)
  const primaryLabel = gpsActionRequired ? 'Activar GPS' : runtime.primaryLabel
  const primaryDisabled = gpsActionRequired ? false : missingRequiredItem || !runtime.canEnter

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
      setRouteOverviewActive(false)

      const storedGps = readStoredGpsPosition(user)
      if (storedGps) {
        setBrowserGpsPosition(storedGps)
        setBrowserGpsStatus('stale')
        setFocusRequest({ target: 'player', token: Date.now() })
      }

      showNotice('Debug desactivado. Recuperando GPS real…', 'info')

      if (hasRememberedGpsReady(user)) {
        void handleRequestLiveGps({ silent: true, forceFocus: true })
        window.setTimeout(() => {
          void handleRequestLiveGps({ silent: true, forceFocus: true })
        }, 1500)
      }

      vibrate(8)
      return
    }

    if (gpsWatchRef.current !== null && typeof window !== 'undefined' && window.navigator.geolocation) {
      window.navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }
    setBrowserGpsPosition(null)
    setBrowserGpsStatus('unavailable')
    setLocalDebugEnabled(true)
    showNotice('Debug activo. Toca el mapa para colocar tu posición simulada.', 'success')
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
    showNotice('Posición debug actualizada.', 'success')
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

  function handleToggleRouteOverview() {
    if (!playerPosition) {
void handleRequestLiveGps({ forceFocus: true })
      return
    }

    const nextToken = Date.now()

    if (!currentStage || routeOverviewActive) {
      setRouteOverviewActive(false)
      setFollowPlayer(true)
      setFocusRequest({ target: 'player', token: nextToken })
return
    }

    setRouteOverviewActive(true)
    setFollowPlayer(false)
    setFocusRequest({ target: 'route', token: nextToken })
}

  function openInteraction() {
    setSubmitError(null)
    setActivePanel(null)
    setToolsOpen(false)
    setTeamOpen(false)
    setInteractionOpen(true)
  }

  async function handleRequestLiveGps(options: { silent?: boolean; forceFocus?: boolean } = {}) {
    if (typeof window === 'undefined' || !window.navigator.geolocation) {
      setBrowserGpsStatus('unavailable')
      if (!options.silent) showNotice('GPS no disponible en este dispositivo o navegador.', 'warn')
      return
    }

    if (!window.isSecureContext) {
      setBrowserGpsStatus('error')
      if (!options.silent) showNotice('El GPS requiere HTTPS o abrir SAGA como app instalada desde la pantalla de inicio.', 'warn')
      return
    }

    setLocalDebugEnabled(false)
    setLocalDebugPosition(null)
    setBrowserGpsStatus('searching')
    if (!options.silent) showNotice('Solicitando permiso de ubicación… acepta el aviso del navegador.', 'info')

    const onSuccess = (position: GeolocationPosition) => {
      const next = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      }

      setBrowserGpsPosition(next)
      setBrowserGpsStatus('ready')
      rememberGpsReady(user)
      rememberGpsPosition(user, next)
      if (hasOfflineMission) setOfflinePrepVisible(false)
      setLocalDebugEnabled(false)
      setLocalDebugPosition(null)
      setFollowPlayer(true)

      const storedGps = readStoredGpsPosition(user)
      if (storedGps) {
        setBrowserGpsPosition(storedGps)
        setBrowserGpsStatus('stale')
        setFocusRequest({ target: 'player', token: Date.now() })
      }

      if (options.forceFocus || !gpsCenteredRef.current) {
        gpsCenteredRef.current = true
        setFocusRequest({ target: 'player', token: Date.now() })
      }

      void sendHeartbeat({
        user,
        lat: next.lat,
        lon: next.lon,
        gps_status: 'ok',
        source: 'browser_gps',
      })

      if (!options.silent && !gpsNoticeShownRef.current) {
        gpsNoticeShownRef.current = true
        showNotice('GPS real activado.', 'success')
      }
    }

    const onError = (error: GeolocationPositionError) => {
      setBrowserGpsStatus('error')
      const denied = error.code === error.PERMISSION_DENIED
      if (!options.silent) {
        showNotice(
          denied
            ? 'Permiso de ubicación denegado. En iPhone revisa Ajustes > Safari > Ubicación, o elimina y vuelve a añadir la PWA.'
            : 'No se pudo obtener ubicación. Prueba al aire libre, activa Ubicación precisa y reintenta.',
          'warn'
        )
      }
    }

    window.navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000,
    })

    if (gpsWatchRef.current === null) {
      gpsWatchRef.current = window.navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 20000,
      })
    }
  }

  async function handlePrepareOfflinePack() {
    try {
      setOfflinePrepState('saving')
      const [config, offlinePayload] = await Promise.all([
        fetchPublicConfig(),
        fetchPlayerGame(payload.user, { offlinePack: true }),
      ])

      const pack = await saveMissionPack({
        user: payload.user,
        config,
        payload: offlinePayload,
      })

      setState({ status: 'ready', payload: offlinePayload })
      setOfflineSummary(await getOfflineMissionSummary(payload.user))
      setOfflinePrepState('saved')
      await cachePlayerShell(playerHref).catch(() => undefined)
      setOfflinePrepVisible(true)
      showNotice(`Mission downloaded for offline play (${pack.stage_count} nodes).`, 'success')
      vibrate([10, 16, 10])
    } catch (error) {
      setOfflinePrepState('error')
      showNotice(error instanceof Error ? error.message : 'Could not download offline mission.', 'warn')
      vibrate(10)
    }
  }

  function handlePrimaryAction() {
    if (gpsActionRequired) {
      void handleRequestLiveGps({ forceFocus: true })
      return
    }

    if (missingRequiredItem && activeRequirement) {
      showNotice(`Necesitas ${activeRequirement.label}. Escanea su QR físico primero.`, 'warn')
      vibrate([10, 16, 10])
      return
    }

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

    if (missingRequiredItem && activeRequirement) {
      showNotice(`Necesitas ${activeRequirement.label}. Escanea su QR físico primero.`, 'warn')
      return
    }

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
        const missingItem = result.reason === 'missing_required_item'
        setSubmitError(missingItem ? 'Missing required item for this node.' : 'Invalid code for the current stage.')
        showNotice(missingItem ? 'Missing required item for this node.' : 'The code was not accepted for this stage.', 'warn')
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
      const message = error instanceof Error ? error.message : 'Unknown submit error'

      try {
        const localResult = await advanceLocalProgress({
          payload,
          currentStage,
          code,
        })

        if (localResult.ok) {
          setInteractionOpen(false)
          setState({ status: 'ready', payload: localResult.payload })

          if (localResult.payload.finished) {
            showOverlay('finish')
            showNotice('Mission complete locally. Sync when connection returns.', 'success')
          } else {
            showOverlay('node')
            showNotice('Node cleared locally. Progress queued for sync.', 'success')
          }

          return
        }

        if (localResult.reason === 'missing_required_item') {
          setSubmitError('Missing required item for this node.')
          showNotice('Missing required item for this node.', 'warn')
          return
        }

        if (localResult.reason === 'invalid_code') {
          setSubmitError('Invalid code for the downloaded offline mission.')
          showNotice('The offline code was not accepted.', 'warn')
          return
        }

        const snapshot = queueManualCode({
          user: payload.user,
          node_id: currentStage?.id ? String(currentStage.id) : undefined,
          code,
          payload: {
            stage_title: currentStage?.title || '',
            reason: 'advance_sync_failed',
          },
        })
        setSubmitError(`${message}. Code saved locally and will sync when connection returns.`)
        showNotice(`Code saved offline (${snapshot.queued_events.length} pending).`, 'warn')
      } catch {
        setSubmitError(message)
        showNotice('Mission sync failed. Try again.', 'warn')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScreenFrame mobile={isPhone}>
      <div style={getViewportStyle(isPhone)}>
        <MapSurface
          currentStage={currentStage}
          missionStages={payload.stages || []}
          currentLevel={payload.level || 0}
          playerPosition={playerPosition}
          gpsState={gpsState}
          debugSimulation={localDebugEnabled || Boolean(localDebugPosition)}
          followPlayer={followPlayer}
          focusRequest={focusRequest}
          nodeState={interactionOpen ? 'engaging' : runtime.canEnter ? 'ready' : 'locked'}
          otherPlayers={teamMapMarkers}
          selfLabel={'YO'}
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
            gpsState={gpsState}
            onOpenTeam={openTeam}
          />
        </div>

        <div style={getToastOverlayStyle(isPhone)}>
          <ToastNotice notice={uiNotice} />
        </div>

        {activePanel !== 'details' && !toolsOpen && !overlayState ? (
          <div style={getMapQuickControlsStyle(isPhone)}>
            <QuickProofPanel
              user={user}
              mobile={isPhone}
              hidden={false}
            />

            <button
              type="button"
              style={mapRouteToggleInlineButton}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleToggleRouteOverview()
              }}
              aria-label={routeOverviewActive ? 'Volver a mi ubicación' : 'Ver mi ubicación y el nodo'}
            >
              {routeOverviewActive ? '◎' : '↔'}
            </button>
          </div>
        ) : null}{/* saga-map-quick-controls-row-v1 */}

          <FieldPrepPanel
            visible={offlinePrepVisible && !payload.finished}
            mobile={isPhone}
            hasOfflineMission={hasOfflineMission}
            hasBrowserGps={hasBrowserGps}
            offlinePrepState={offlinePrepState}
            browserGpsStatus={browserGpsStatus}
            onPrepareOfflinePack={handlePrepareOfflinePack}
            onRequestGps={() => void handleRequestLiveGps({ forceFocus: true })}
            onDismiss={() => setOfflinePrepVisible(false)}
          />

        {overlayState ? <CelebrationOverlay state={overlayState} /> : null}

        <div style={getBottomOverlayStyle(isPhone)}>
        <PlayerHud
            user={payload.user}
            missionPayload={payload}
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
            primaryLabel={primaryLabel}
            primaryTone={runtime.primaryTone}
            primaryDisabled={primaryDisabled}
            helperText={hudHelperText}
            detailsOpen={activePanel === 'details'}
            onPrimaryAction={handlePrimaryAction}
            onToggleDetails={() => togglePanel('details')}
            onOpenTools={openTools}
            onCloseTools={closeTools}
            onToggleDebug={handleToggleDebug}
            onRequestGps={() => void handleRequestLiveGps({ forceFocus: true })}
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

const mapRouteToggleButton: CSSProperties = {
  position: 'fixed',
  right: 18,
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 176px)',
  zIndex: 4600,
  width: 42,
  height: 42,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.22)',
  background: 'rgba(15,23,42,.62)',
  color: '#f8fafc',
  fontSize: 20,
  fontWeight: 900,
  boxShadow: '0 14px 34px rgba(15,23,42,.22)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  pointerEvents: 'auto',
  touchAction: 'manipulation',
}

const mapRouteToggleInlineButton: CSSProperties = {
  ...mapRouteToggleButton,
  position: 'static',
  right: 'auto',
  bottom: 'auto',
  zIndex: 'auto',
  gridColumn: 3,
  justifySelf: 'start',
  alignSelf: 'center',
  width: 42,
  height: 42,
  minWidth: 42,
  minHeight: 42,
  padding: 0,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 17,
  border: '1px solid rgba(255,255,255,.12)',
  background:
    'linear-gradient(180deg, rgba(148,163,184,.20), rgba(100,116,139,.17))',
  color: '#f8fafc',
  boxShadow: '0 12px 26px rgba(15,23,42,.20), inset 0 1px 0 rgba(255,255,255,.06)',
  backdropFilter: 'blur(20px) saturate(1.10)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.10)',
  fontSize: 17,
  lineHeight: 1,
  fontWeight: 950,
  textAlign: 'center',
}

function getMapQuickControlsStyle(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    left: mobile ? 12 : 24,
    right: mobile ? 12 : 24,
    bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 138px)' : 148,
    zIndex: 4600,
    display: 'grid',
    gridTemplateColumns: '1fr auto auto 1fr',
    alignItems: 'center',
    gap: 8,
    pointerEvents: 'auto',
  }
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
        position: mobile ? 'fixed' : 'relative',
        inset: mobile ? 0 : undefined,
        width: '100vw',
        minHeight: mobile ? '100dvh' : '100svh',
        height: mobile ? '100dvh' : 'auto',
        background:
          'linear-gradient(180deg, #eef3ed 0%, #e8efea 48%, #e2ebe3 100%)',
        padding: mobile ? 0 : 12,
        fontFamily: 'system-ui, sans-serif',
        color: '#10231a',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'manipulation',
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
    borderRadius: mobile ? 0 : 32,
    background: '#0f172a',
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
    top: mobile ? 'calc(env(safe-area-inset-top, 0px) + 10px)' : 12,
    left: mobile ? 10 : 12,
    right: mobile ? 10 : 12,
    zIndex: 1200,
    pointerEvents: 'auto',
    transform: mobile ? 'translateY(10px)' : undefined,
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
    bottom: mobile ? 0 : 12,
    zIndex: 1200,
    pointerEvents: 'auto',
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

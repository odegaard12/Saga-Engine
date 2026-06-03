import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { advancePlayer, deleteFieldProof, fetchFieldProofs, fetchPlayerGame, fetchPublicConfig, fetchTeamStatus, getFieldProofsDownloadUrl, sendHeartbeat, uploadFieldProof } from '../shared/api'
import type { FieldProof, PlayerGamePayload, PlayerGpsStatus, PlayerStage, TeamProfileLiveStatus } from '../types/player'
import { PlayerShell } from './components/PlayerShell'
import { PlayerHud } from './components/PlayerHud'
import { QuickProofPanel } from './components/QuickProofPanel'
import { MapSurface } from './components/MapSurface'
import { InteractionSheet } from './components/InteractionSheet'
import { TeamSheet } from './components/TeamSheet'
import { ToastNotice, type UiNotice } from './components/ToastNotice'
import { FieldPrepPanel } from './components/FieldPrepPanel'
import { FieldPhotoViewer } from './components/FieldPhotoViewer'
import { FieldCameraCapture } from './components/FieldCameraCapture'
import { deriveStageRuntime, type PlayerPanel } from './runtime'
import { getPlayerNameFromLocation } from '../shared/playerRoute'
import { buildFallbackPublicConfig, cachePublicConfig } from '../shared/offlinePublicConfig'
import { advanceLocalProgress, getOfflineMissionSummary, getStoredMissionPack, saveMissionPack, type OfflineMissionSummary } from './offline/missionPack'
import { cachePlayerShell, registerPlayerServiceWorker } from './offline/pwaShell'
import { cacheTeamProfiles, getCachedTeamProfiles } from './offline/teamPresence'
import { cacheFieldProofAssets, cacheFieldProofs, getCachedFieldProofs } from './offline/fieldProofCache'
import { countVisibleTeamMarkers, teamProfilesToMapMarkers } from './offline/teamMapPresence'
import { queueManualCode } from './offline/physicalEvents'
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

function isPhysicalQrStage(stage: PlayerStage | null): boolean {
  if (!stage || typeof stage !== 'object') return false

  const record = stage as unknown as Record<string, unknown>
  const flatKind = record.physical_node_kind || record.physical_item_kind

  if (flatKind === 'collectible' || flatKind === 'requirement' || flatKind === 'clue' || flatKind === 'bonus') {
    return true
  }

  const physicalQr = record.physical_qr
  if (physicalQr && typeof physicalQr === 'object') {
    const kind = (physicalQr as Record<string, unknown>).kind
    return kind === 'collectible' || kind === 'requirement' || kind === 'clue' || kind === 'bonus'
  }

  return false
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
  const [quickQrOpenSignal, setQuickQrOpenSignal] = useState(0)
  const [fieldProofs, setFieldProofs] = useState<FieldProof[]>([])
  const [fieldCameraOpen, setFieldCameraOpen] = useState(false)
  const [selectedFieldProofs, setSelectedFieldProofs] = useState<FieldProof[]>([])
  const [fieldPhotoUploading, setFieldPhotoUploading] = useState(false)

  const noticeTimerRef = useRef<number | null>(null)
  const overlayTimerRef = useRef<number | null>(null)
  const gpsWatchRef = useRef<number | null>(null)
  const gpsCenteredRef = useRef(false)
  const gpsNoticeShownRef = useRef(false)
  const user = useMemo(() => getPlayerNameFromLocation() || getUserFromUrl(), [])

  const isPhone =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

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
        const config = await fetchPublicConfig()
          .then((nextConfig) => {
            cachePublicConfig(nextConfig)
            return nextConfig
          })
          .catch(() => buildFallbackPublicConfig(user))

        void saveMissionPack({
          user: payload.user || user,
          config,
          payload,
        }).catch(() => undefined)

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
    let cancelled = false
    let intervalId: number | null = null

    async function loadFieldProofs() {
      try {
        const payload = await fetchFieldProofs(user)
        const proofs = Array.isArray(payload.proofs) ? payload.proofs : []

        cacheFieldProofs(user, proofs)
        void cacheFieldProofAssets(proofs)

        if (!cancelled) {
          setFieldProofs(proofs)
        }
      } catch {
        const cached = getCachedFieldProofs(user)

        if (!cancelled) {
          setFieldProofs(cached.proofs)
        }
      }
    }

    void loadFieldProofs()
    intervalId = window.setInterval(loadFieldProofs, 15000)

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
        <StatusCard
          title="Preparando jugador"
          body="Cargando misión, mapa y datos guardados. En offline se usa la última descarga preparada."
        />
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
  const currentStageIsPhysicalQr = isPhysicalQrStage(currentStage)

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

  const hudHelperText =
    gpsActionRequired
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
  const primaryLabel = currentStageIsPhysicalQr ? 'Abrir QR' : gpsActionRequired ? 'Activar GPS' : runtime.primaryLabel
  const primaryDisabled = gpsActionRequired ? false : !runtime.canEnter

  async function refreshPayload() {
    const nextPayload = await fetchPlayerGame(user)
    const config = await fetchPublicConfig()
      .then((nextConfig) => {
        cachePublicConfig(nextConfig)
        return nextConfig
      })
      .catch(() => buildFallbackPublicConfig(user))

    await saveMissionPack({
      user: nextPayload.user || user,
      config,
      payload: nextPayload,
    }).catch(() => undefined)

    setState({ status: 'ready', payload: nextPayload })
    return nextPayload
  }

  async function refreshFieldProofs() {
    const nextProofs = await fetchFieldProofs(user)
    setFieldProofs(Array.isArray(nextProofs.proofs) ? nextProofs.proofs : [])
    return nextProofs
  }

  function handleDownloadFieldProofs() {
    if (fieldProofs.length <= 0) {
      return
    }

    const link = document.createElement('a')
    link.href = getFieldProofsDownloadUrl(payload.user)
    link.download = ''
    document.body.appendChild(link)
    link.click()
    link.remove()
    closeTools()
  }

function handleOpenFieldCamera() {
    if (fieldPhotoUploading) {
      showNotice('Subiendo foto…', 'info')
      return
    }

    if (!playerPosition) {
      showNotice('Activa GPS o usa modo debug para guardar la foto en el mapa.', 'warn')
      vibrate(8)
      return
    }

    setFieldCameraOpen(true)
    vibrate(8)
  }

  async function handleDeleteFieldProof(proofId: string) {
    if (!proofId) return

    const confirmed = window.confirm('¿Eliminar esta foto del mapa? Solo puedes borrar tus propias fotos.')
    if (!confirmed) return

    try {
      await deleteFieldProof(payload.user, proofId)
      setFieldProofs((current) => current.filter((item) => item.id !== proofId))
      setSelectedFieldProofs((current) => current.filter((item) => item.id !== proofId))
      void refreshFieldProofs().catch(() => {})
      vibrate(8)
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'No se pudo eliminar la foto.', 'warn')
      vibrate(8)
    }
  }

  async function handleFieldCameraCapture(imageDataUrl: string, note: string) {
    if (!playerPosition) {
      showNotice('No hay posición para guardar la foto.', 'warn')
      return
    }

    try {
      setFieldPhotoUploading(true)

      const saved = await uploadFieldProof({
        user: payload.user,
        image_data_url: imageDataUrl,
        lat: playerPosition.lat,
        lon: playerPosition.lon,
        note,
        stage_id: currentStage?.id ? String(currentStage.id) : undefined,
        stage_title: currentStage?.title || undefined,
      })

      setFieldProofs((current) => [
        saved.proof,
        ...current.filter((item) => item.id !== saved.proof.id),
      ])

      void refreshFieldProofs().catch(() => {})
      vibrate([10, 16, 10])
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'No se pudo subir la foto.', 'warn')
      vibrate(8)
    } finally {
      setFieldPhotoUploading(false)
    }
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

    if (currentStageIsPhysicalQr) {
      if (!runtime.canEnter) {
        showNotice(
          runtime.reason === 'out_of_range'
            ? 'Acércate al nodo físico para escanear su QR.'
            : 'Activa GPS o usa modo debug para abrir este QR físico.',
          'warn'
        )
        vibrate(8)
        return
      }

      setFocusRequest({ target: 'node', token: Date.now() })
      setQuickQrOpenSignal(Date.now())
      showNotice('Escanea la tarjeta QR física de este nodo.', 'info')
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

    if (currentStageIsPhysicalQr) {
      if (!runtime.canEnter) {
        showNotice(
          runtime.reason === 'out_of_range'
            ? 'Acércate al nodo físico para escanear su QR.'
            : 'Activa GPS o usa modo debug para abrir este QR físico.',
          'warn'
        )
        return
      }

      setQuickQrOpenSignal(Date.now())
      showNotice('Escanea la tarjeta QR física de este nodo.', 'info')
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
          fieldProofs={fieldProofs}
          viewerUser={payload.user}
          onDeleteFieldProof={handleDeleteFieldProof}
          onOpenFieldProofs={(proofs) => setSelectedFieldProofs(proofs)}
          selfLabel={payload.display_name || payload.user || 'YO'}
          selfProfile={{
            ...(payload.profile || {}),
            user: payload.user,
            display_name: payload.display_name || payload.user,
            gps_status: gpsState,
          }}
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

        <FieldPhotoViewer
          open={selectedFieldProofs.length > 0}
          proofs={selectedFieldProofs}
          viewerUser={payload.user}
          onClose={() => setSelectedFieldProofs([])}
          onDelete={handleDeleteFieldProof}
        />

        <FieldCameraCapture
          open={fieldCameraOpen}
          busy={fieldPhotoUploading}
          onClose={() => setFieldCameraOpen(false)}
          onCapture={handleFieldCameraCapture}
        />

        {activePanel !== 'details' && !toolsOpen && !teamOpen && !overlayState ? (
          <div style={getMapQuickControlsStyle(isPhone)}>
            <QuickProofPanel
              user={user}
              mobile={isPhone}
              hidden={false}
              openSignal={quickQrOpenSignal}
              showLauncher={false}
            />

            <button
              type="button"
              style={mapRouteToggleInlineButton}
              disabled={fieldPhotoUploading}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleOpenFieldCamera()
              }}
              aria-label="Hacer foto de campo"
              title="Hacer foto de campo"
            >
              <span aria-hidden="true" style={mapQuickIcon}>{fieldPhotoUploading ? '⏳' : '📷'}</span>
            </button>

            <button
              type="button"
              style={teamOpen ? mapQuickButtonActive : mapRouteToggleInlineButton}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openTeam()
              }}
              aria-label="Jugadores"
            >
              <span aria-hidden="true" style={mapQuickIcon}>👥</span>
              <span style={mapQuickCountPill}>{teamVisibleCount}</span>
            </button>

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
              <span aria-hidden="true" style={mapQuickIcon}>{routeOverviewActive ? '📍' : '🧭'}</span>
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
            onDownloadFieldProofs={handleDownloadFieldProofs}
            fieldPhotoCount={fieldProofs.length}
             submitting={submitting}
             errorMessage={submitError}
             onSubmitCode={handleSubmitCode}
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
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(14px)',
  pointerEvents: 'auto',
  touchAction: 'manipulation',
}

const mapRouteToggleInlineButton: CSSProperties = {
  width: 44,
  height: 38,
  minWidth: 44,
  minHeight: 38,
  padding: 0,
  borderRadius: 18,
  border: '1px solid transparent',
  background: 'rgba(255,255,255,.03)',
  color: '#f8fafc',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  fontSize: 16,
  lineHeight: 1,
  fontWeight: 900,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  textShadow: '0 1px 6px rgba(15,23,42,.24)',
  boxShadow: 'none',
  position: 'relative',
  overflow: 'hidden',
  pointerEvents: 'auto',
  touchAction: 'manipulation',
  cursor: 'pointer',
  userSelect: 'none',
}

const mapQuickButtonActive: CSSProperties = {
  ...mapRouteToggleInlineButton,
  background: 'rgba(255,255,255,.10)',
  border: '1px solid rgba(224,242,254,.24)',
  color: '#e0f2fe',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)',
}

const mapQuickIcon: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 17,
  lineHeight: 1,
  filter: 'drop-shadow(0 1px 3px rgba(15,23,42,.24))',
  transform: 'translateY(-0.5px)',
}

const mapQuickCountPill: CSSProperties = {
  position: 'absolute',
  top: 5,
  right: 5,
  minWidth: 14,
  height: 14,
  padding: '0 3px',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(15,23,42,.56)',
  border: '1px solid rgba(255,255,255,.16)',
  color: '#ffffff',
  fontSize: 8,
  fontWeight: 950,
  lineHeight: 1,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10)',
}

function getMapQuickControlsStyle(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    left: '50%',
    bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 138px)' : 148,
    transform: 'translateX(-50%)',
    zIndex: 4600,
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    gap: 2,
    padding: 4,
    borderRadius: 24,
    border: '1px solid rgba(255,255,255,.20)',
    background:
      'linear-gradient(180deg, rgba(84,91,104,.72) 0%, rgba(110,116,128,.64) 100%)',
    boxShadow:
      '0 16px 34px rgba(15,23,42,.20), inset 0 1px 0 rgba(255,255,255,.10)',
    backdropFilter: 'blur(8px) saturate(120%)',
    WebkitBackdropFilter: 'blur(8px) saturate(120%)',
    pointerEvents: 'auto',
  }
}


const globalPlayerEdgeFix = `
html,
body,
#root {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  min-width: 100%;
  min-height: 100%;
  background: #020617 !important;
  overflow: hidden;
}

body {
  overscroll-behavior: none;
}

.leaflet-container {
  background: #020617 !important;
  outline: none !important;
}

.saga-player-edge-fix {
  background: #020617 !important;
}
`

function ScreenFrame({
  children,
  mobile,
}: {
  children: React.ReactNode
  mobile: boolean
}) {
  return (
    <>
      <style>{globalPlayerEdgeFix}</style>
      <main
      style={{
        position: mobile ? 'fixed' : 'relative',
        inset: mobile ? '-1px -1px 0 -1px' : undefined,
        width: mobile ? 'calc(100vw + 2px)' : '100vw',
        minHeight: mobile ? '100dvh' : '100svh',
        height: mobile ? '100dvh' : 'auto',
        background: '#020617',
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
    </>
  )
}

function getLaunchingPlayerLabel() {
  if (typeof window === 'undefined') return ''

  try {
    const raw = window.sessionStorage.getItem('saga:player-launching')
    if (!raw) return ''

    const parsed = JSON.parse(raw) as { label?: string; at?: string }
    return parsed.label || ''
  } catch {
    return ''
  }
}

function StatusCard({ title, body }: { title: string; body: string }) {
  const playerLabel = getLaunchingPlayerLabel()

  return (
    <section style={statusCard}>
      <style>{statusCardAnimations}</style>
      <div style={statusLoader}>
        <div style={statusLoaderRing} />
      </div>
      <div style={statusTitle}>{playerLabel ? `Entrando como ${playerLabel}` : title}</div>
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
    inset: '0 0 auto 0',
    height: 0,
    zIndex: 1100,
    pointerEvents: 'none',
    background: 'transparent',
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
  position: 'fixed',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(360px, calc(100vw - 32px))',
  boxSizing: 'border-box',
  display: 'grid',
  justifyItems: 'center',
  gap: 10,
  borderRadius: 30,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.94), rgba(30,41,59,.86))',
  boxShadow: '0 24px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.08)',
  padding: '22px 18px',
  margin: 0,
  color: '#f8fafc',
  textAlign: 'center',
}

const statusLoader: CSSProperties = {
  width: 42,
  height: 42,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 999,
  background: 'rgba(187,247,208,.10)',
  boxShadow: '0 0 0 8px rgba(187,247,208,.045)',
}

const statusLoaderRing: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  border: '3px solid rgba(255,255,255,.16)',
  borderTopColor: '#bbf7d0',
  animation: 'sagaPlayerSpin 760ms linear infinite',
}

const statusCardAnimations = `
@keyframes sagaPlayerSpin {
  to {
    transform: rotate(360deg);
  }
}
`

const statusTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#ffffff',
}

const statusBody: CSSProperties = {
  fontSize: 14,
  color: 'rgba(226,232,240,.78)',
  marginTop: 8,
  lineHeight: 1.5,
}

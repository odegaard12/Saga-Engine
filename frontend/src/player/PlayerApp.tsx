import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { usePlayerStore } from './store/usePlayerStore'
import { useGpsTracker } from './store/useGpsTracker'
import { collectInventoryItem } from './offline/inventory'
import {
  advancePlayer,
  deleteFieldProof,
  fetchFieldProofs,
  fetchPlayerGame,
  fetchPublicConfig,
  fetchTeamStatus,
  getFieldProofsDownloadUrl,
  sendHeartbeat,
  uploadFieldProof,
} from '../shared/api'
import type {
  FieldProof,
  PlayerGamePayload,
  PlayerGpsStatus,
  PlayerStage,
  PublicConfig,
  TeamProfileLiveStatus,
} from '../types/player'
import { PlayerShell } from './components/PlayerShell'
import { PlayerHud } from './components/PlayerHud'
import { StoryModal } from './components/StoryModal'
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
import {
  advanceLocalProgress,
  getOfflineMissionSummary,
  getStoredMissionPack,
  saveMissionPack,
  syncPendingOfflineEvents,
  type OfflineMissionSummary,
} from './offline/missionPack'
import { prefetchMissionMapTiles } from './offline/mapTileCache'
import { cachePlayerShell, registerPlayerServiceWorker } from './offline/pwaShell'
import { flushOfflineEvents } from './offline/localFirst'
import { cacheTeamProfiles, getCachedTeamProfiles } from './offline/teamPresence'
import {
  cacheFieldProofAssets,
  cacheFieldProofs,
  getCachedFieldProofs,
} from './offline/fieldProofCache'
import { countVisibleTeamMarkers, teamProfilesToMapMarkers } from './offline/teamMapPresence'
import { queueManualCode } from './offline/physicalEvents'
import { getDistanceMeters } from './utils/geo'
import {
  readStoredGpsPosition,
  rememberGpsPosition,
  rememberGpsReady,
  hasRememberedGpsReady,
} from './utils/gpsStorage'
import { haptics, sounds } from './utils/haptics'
import { getCurrentStage, getStagePosition, getStageRadius } from './utils/stagePosition'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../shared/playerIdentity'
import {
  CelebrationOverlay,
  ScreenFrame,
  StatusCard,
  getBottomOverlayStyle,
  getMapQuickControlsStyle,
  getTopOverlayStyle,
  getTopScrimStyle,
  getToastOverlayStyle,
  getViewportStyle,
  finishOverlayStyle,
  floatingTrophyButton,
  type OverlayState,
} from './components/PlayerLayout'

type LoadState =
  | { status: 'idle' | 'loading'; mapProgress?: { done: number; total: number; detail?: string } }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PlayerGamePayload; config: PublicConfig }

type NoticeTone = 'info' | 'warn' | 'success'
type FocusRequest = {
  target: 'player' | 'node' | 'route'
  token: number
} | null

function vibrate(pattern: number | number[]) {
  haptics.vibrate(pattern)
}

function getUserFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('user') || 'PLAYER 1'
}

function isPhysicalQrStage(stage: PlayerStage | null): boolean {
  if (!stage || typeof stage !== 'object') return false

  const record = stage as unknown as Record<string, unknown>
  const config =
    record.config && typeof record.config === 'object'
      ? (record.config as Record<string, unknown>)
      : {}
  if (config.is_map_collectible || record.is_map_collectible) {
    return false
  }

  const flatKind = record.physical_node_kind || record.physical_item_kind

  if (
    flatKind === 'collectible' ||
    flatKind === 'requirement' ||
    flatKind === 'clue' ||
    flatKind === 'bonus'
  ) {
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
  const user = getPlayerNameFromLocation() || getUserFromUrl()
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [showPrologue, setShowPrologue] = useState(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const loginId = url.searchParams.get('login')
      if (loginId) {
        url.searchParams.delete('login')
        window.history.replaceState({}, '', url.toString())
      }
      
      if (loginId) {
        const hasSeen = localStorage.getItem(`saga_prologue_seen_${user}`)
        if (!hasSeen) {
          localStorage.setItem(`saga_prologue_seen_${user}`, '1')
          return true
        }
      }
    }
    return false
  })
  const [activeStageIntro, setActiveStageIntro] = useState(false)
  const [activePanel, setActivePanel] = useState<PlayerPanel>(null)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [localDebugEnabled, setLocalDebugEnabled] = useState(false)
  const [localDebugPosition, setLocalDebugPosition] = useState<{ lat: number; lon: number } | null>(
    null
  )
  const [followPlayer, setFollowPlayerState] = useState(true)
  const followPlayerRef = useRef(true)
  function setFollowPlayer(val: boolean | ((curr: boolean) => boolean)) {
    setFollowPlayerState((current) => {
      const next = typeof val === 'function' ? val(current) : val
      followPlayerRef.current = next
      return next
    })
  }
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null)
  const [routeOverviewActive, setRouteOverviewActive] = useState(false)
  const [uiNotice, setUiNotice] = useState<UiNotice>(null)
  const [overlayState, setOverlayState] = useState<OverlayState>(null)
  const [dismissedFinishScreen, setDismissedFinishScreen] = useState(false)
  const toolsOpen = usePlayerStore((s) => s.toolsOpen)
  const setToolsOpen = usePlayerStore((s) => s.setToolsOpen)
  const teamOpen = usePlayerStore((s) => s.teamOpen)
  const setTeamOpen = usePlayerStore((s) => s.setTeamOpen)

  const addTrackerPoint = useGpsTracker((s) => s.addPoint)
  const [teamProfiles, setTeamProfiles] = useState<TeamProfileLiveStatus[]>([])

  const offlinePrepVisible = usePlayerStore((s) => s.offlinePrepVisible)
  const setOfflinePrepVisible = usePlayerStore((s) => s.setOfflinePrepVisible)
  const [offlinePrepState, setOfflinePrepState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const [offlineSummary, setOfflineSummary] = useState<OfflineMissionSummary | null>(null)

  const browserGpsPosition = usePlayerStore((s) => s.gpsPosition)
  const setBrowserGpsPosition = usePlayerStore((s) => s.setGpsPosition)
  const browserGpsStatus = usePlayerStore((s) => s.gpsStatus)
  const setBrowserGpsStatus = usePlayerStore((s) => s.setGpsStatus)
  const browserGpsFresh = usePlayerStore((s) => s.gpsFresh)
  const setBrowserGpsFresh = usePlayerStore((s) => s.setGpsFresh)
  const browserGpsAccuracy = usePlayerStore((s) => s.gpsAccuracy)
  const setBrowserGpsAccuracy = usePlayerStore((s) => s.setGpsAccuracy)
  const browserGpsCapturedAt = usePlayerStore((s) => s.gpsCapturedAt)
  const setBrowserGpsCapturedAt = usePlayerStore((s) => s.setGpsCapturedAt)
  const [quickQrOpenSignal, setQuickQrOpenSignal] = useState(0)
  const [fieldProofs, setFieldProofs] = useState<FieldProof[]>([])
  const [fieldCameraOpen, setFieldCameraOpen] = useState(false)
  const [selectedFieldProofs, setSelectedFieldProofs] = useState<FieldProof[]>([])
  const [fieldPhotoUploading, setFieldPhotoUploading] = useState(false)
  const [hideInsecureNotice, setHideInsecureNotice] = useState(false)
  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : true
  const [mapRefreshToken, setMapRefreshToken] = useState(0)
  // Removed gpsLoaded state and 20s timeout

  const noticeTimerRef = useRef<number | null>(null)
  const overlayTimerRef = useRef<number | null>(null)
  const gpsWatchRef = useRef<number | null>(null)
  const gpsCenteredRef = useRef(false)
  const gpsNoticeShownRef = useRef(false)
  const handleRequestLiveGpsRef = useRef<
    ((options?: { silent?: boolean; forceFocus?: boolean }) => Promise<void>) | null
  >(null)
  const prevTeamStatusRef = useRef<Record<string, string>>({})

  const isPhone = typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  useEffect(() => {
    const playerUrl = `/player/${encodeURIComponent(user)}`
    void registerPlayerServiceWorker()
    void cachePlayerShell(playerUrl)

    const storedGps = readStoredGpsPosition(user)
    if (storedGps) {
      setBrowserGpsPosition(storedGps)
      setBrowserGpsStatus('stale')
      setBrowserGpsFresh(false)
      setBrowserGpsAccuracy(typeof storedGps.accuracy === 'number' ? storedGps.accuracy : null)
      setBrowserGpsCapturedAt(null)
      // La ubicación almacenada sirve como respaldo,
      // pero nunca debe centrar el mapa al arrancar.
      setFollowPlayer(true)
      gpsCenteredRef.current = false
    }

    if (hasRememberedGpsReady(user)) {
      setOfflinePrepVisible(false)
    }
    window.setTimeout(() => {
      void handleRequestLiveGps({ silent: true, forceFocus: true })
    }, 300)
  }, [user])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        setState({
          status: 'loading',
          mapProgress: { done: 0, total: 100, detail: 'Iniciando conexión...' },
        })
        const payload = await fetchPlayerGame(user, { offlinePack: true })
        const config = await fetchPublicConfig()
          .then((nextConfig) => {
            cachePublicConfig(nextConfig)
            return nextConfig
          })
          .catch(() => buildFallbackPublicConfig(user))

        await saveMissionPack({
          user: payload.user || user,
          config,
          payload,
        }).catch(() => undefined)

        // Descarga de tiles offline automatizada al entrar (con pantalla de carga)
        if (
          typeof window !== 'undefined' &&
          window.navigator.onLine &&
          Array.isArray(payload.stages) &&
          payload.stages.length > 0
        ) {
          if (!cancelled) {
            setState({
              status: 'loading',
              mapProgress: { done: 0, total: 100, detail: 'Calculando mapa offline...' },
            })
          }
          try {
            await prefetchMissionMapTiles(payload.stages, (progress) => {
              if (!cancelled) {
                setState({
                  status: 'loading',
                  mapProgress: {
                    done: progress.done,
                    total: progress.total,
                    detail: progress.detail,
                  },
                })
              }
            })
          } catch (err) {
            console.error('Failed to prefetch map tiles automatically', err)
          }
        }

        if (!cancelled) {
          setState({ status: 'ready', payload, config })
        }
      } catch (error) {
        const offlinePack = await getStoredMissionPack(user).catch(() => null)

        if (!cancelled && offlinePack?.payload && offlinePack?.config) {
          setState({ status: 'ready', payload: offlinePack.payload, config: offlinePack.config })
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
    let running = false

    async function refreshMissionFromServer() {
      if (running) return
      if (interactionOpen || submitting) return

      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      running = true

      try {
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          await Promise.allSettled([flushOfflineEvents(user), syncPendingOfflineEvents(user)])
        }

        const nextPayload = await fetchPlayerGame(user, { offlinePack: true })

        const nextConfig = await fetchPublicConfig()
          .then((config) => {
            cachePublicConfig(config)
            return config
          })
          .catch(() => buildFallbackPublicConfig(user))

        await saveMissionPack({
          user: nextPayload.user || user,
          config: nextConfig,
          payload: nextPayload,
        }).catch(() => undefined)

        if (!cancelled) {
          setState((prev) => ({
            status: 'ready',
            payload: nextPayload,
            config: nextConfig,
          }))
          setMapRefreshToken((value) => value + 1)
        }
      } catch {
        // Keep the currently loaded mission while offline.
      } finally {
        running = false
      }
    }

    const refresh = () => {
      void refreshMissionFromServer()
    }

    const refreshAfterReconnect = () => {
      void refreshMissionFromServer()

      // Algunos móviles anuncian online antes de que
      // la red esté realmente utilizable.
      window.setTimeout(refreshMissionFromServer, 1200)
    }

    window.addEventListener('focus', refresh)
    window.addEventListener('online', refreshAfterReconnect)
    document.addEventListener('visibilitychange', refresh)

    const intervalId = window.setInterval(refresh, 30000)

    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refreshAfterReconnect)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(intervalId)
    }
  }, [user, interactionOpen, submitting])

  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null

    async function loadTeam() {
      try {
        const team = await fetchTeamStatus(user)
        const profiles = Array.isArray(team.profiles) ? team.profiles : []
        cacheTeamProfiles(user, profiles)

        if (!cancelled) {
          const prevStatuses = prevTeamStatusRef.current
          profiles.forEach((p) => {
            const oldStatus = prevStatuses[p.user]
            if (oldStatus && oldStatus !== p.status && p.status && !p.is_self) {
              setUiNotice({
                id: Date.now() + Math.random(),
                title: 'Progreso de Equipo',
                message: `${p.display_name || p.user} » ${p.status}`,
                tone: 'success',
              })
              vibrate([10, 30, 10])
            }
            prevStatuses[p.user] = p.status || ''
          })
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
        const effectivePosition =
          localDebugPosition || (browserGpsFresh ? browserGpsPosition : null)

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
    browserGpsFresh,
  ])

  useEffect(() => {
    if (!browserGpsFresh || browserGpsCapturedAt === null) {
      return
    }

    const ageMs = Math.max(0, Date.now() - browserGpsCapturedAt)

    const remainingMs = Math.max(1000, 45000 - ageMs)

    const timeoutId = window.setTimeout(() => {
      setBrowserGpsFresh(false)
      setBrowserGpsStatus('stale')
    }, remainingMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [browserGpsFresh, browserGpsCapturedAt])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current)
      }
      if (
        gpsWatchRef.current !== null &&
        typeof window !== 'undefined' &&
        window.navigator.geolocation
      ) {
        window.navigator.geolocation.clearWatch(gpsWatchRef.current)
        gpsWatchRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'ready') return

    function closeQrIfPhysicalScannerNoLongerReachable() {
      const readyPayload = (state as { status: 'ready'; payload: PlayerGamePayload }).payload
      const stage = getCurrentStage(readyPayload)

      if (!isPhysicalQrStage(stage)) return

      const position = browserGpsPosition || localDebugPosition
      const target = getStagePosition(stage)
      const radius = getStageRadius(stage)

      if (!position || !target || radius === null) {
        window.dispatchEvent(new CustomEvent('saga:close-qr-scanner'))
        return
      }

      const distance = getDistanceMeters(position, target)
      if (distance > radius) {
        window.dispatchEvent(new CustomEvent('saga:close-qr-scanner'))
      }
    }

    closeQrIfPhysicalScannerNoLongerReachable()
  }, [
    state.status,
    state.status === 'ready' ? state.payload.level : null,
    state.status === 'ready' ? state.payload.current_stage?.id : null,
    browserGpsPosition?.lat,
    browserGpsPosition?.lon,
    localDebugPosition?.lat,
    localDebugPosition?.lon,
  ])

  function showNotice(message: string, tone: NoticeTone) {
    const normalizedTone: NoticeTone = tone === 'success' ? 'info' : tone
    if (normalizedTone === 'info') return
    setUiNotice({ message, tone: normalizedTone })

    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current)
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setUiNotice(null)
      noticeTimerRef.current = null
    }, 3000)
  }

  function showOverlay(nextState: OverlayState) {
    if (nextState !== 'finish') return
    setOverlayState(nextState)

    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current)
    }

    overlayTimerRef.current = window.setTimeout(
      () => {
        setOverlayState(null)
        overlayTimerRef.current = null
      },
      nextState === 'finish' ? 1800 : 900
    )
  }

  // Centrar y re-calibrar al volver al primer plano (app resume)
  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (handleRequestLiveGpsRef.current) {
          void handleRequestLiveGpsRef.current({ silent: true, forceFocus: false })
        }
        // FORZAR ACTUALIZACIÓN DE SERVICE WORKER AL RESUMIR
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.ready
            .then((registration) => {
              void registration.update().catch(() => undefined)
            })
            .catch(() => undefined)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // A stale position may center the map, but never unlock a node.
  // La posición antigua no se dibuja ni centra.
  // Solo se usa GPS vivo o posición debug.
  const playerPosition = localDebugPosition || (browserGpsFresh ? browserGpsPosition : null)

  useEffect(() => {
    if (playerPosition) {
      addTrackerPoint(playerPosition.lat, playerPosition.lon)
    }
  }, [playerPosition?.lat, playerPosition?.lon, addTrackerPoint])

  if (state.status === 'idle' || state.status === 'loading') {
    const mapProgress = state.status === 'loading' ? state.mapProgress : undefined
    const ratio = mapProgress
      ? Math.max(0, Math.min(100, Math.round((mapProgress.done / (mapProgress.total || 1)) * 100)))
      : undefined

    return (
      <ScreenFrame mobile={isPhone}>
        <StatusCard
          title="SAGA"
          body={mapProgress ? 'Descargando mapa offline...' : 'Adquiriendo señal GPS...'}
          progress={ratio}
          progressDetail={mapProgress?.detail}
        />
      </ScreenFrame>
    )
  }

  if (state.status === 'error') {
    return (
      <ScreenFrame mobile={isPhone}>
        <StatusCard title="Error de SAGA" body={state.message} />
      </ScreenFrame>
    )
  }

  if (state.status !== 'ready') {
    return (
      <ScreenFrame mobile={isPhone}>
        <StatusCard title="Estado inesperado" body="Estado interno de jugador no reconocido." />
      </ScreenFrame>
    )
  }

  const payload = state.payload
  const currentStage = getCurrentStage(payload)
  const currentStageIsPhysicalQr = isPhysicalQrStage(currentStage)

  const stagePosition = getStagePosition(currentStage)
  const stageRadius = getStageRadius(currentStage)

  const gpsAccuracyLimit = stageRadius !== null ? Math.max(35, Math.min(80, stageRadius * 2)) : 60

  const gpsAccuracyAcceptable =
    browserGpsAccuracy === null || browserGpsAccuracy <= gpsAccuracyLimit

  const hasFreshBrowserGps = Boolean(browserGpsPosition) && browserGpsFresh && gpsAccuracyAcceptable

  const gpsState: PlayerGpsStatus = localDebugPosition
    ? 'ready'
    : hasFreshBrowserGps
      ? 'ready'
      : browserGpsPosition && !browserGpsFresh
        ? 'stale'
        : browserGpsPosition && !gpsAccuracyAcceptable
          ? 'searching'
          : browserGpsStatus === 'searching'
            ? 'searching'
            : browserGpsStatus === 'error'
              ? 'error'
              : 'unavailable'

  const unlockPosition = localDebugPosition || (hasFreshBrowserGps ? browserGpsPosition : null)

  const distanceMeters =
    stagePosition && unlockPosition
      ? Math.round(getDistanceMeters(unlockPosition, stagePosition))
      : null

  const inRange =
    stageRadius !== null && distanceMeters !== null ? distanceMeters <= stageRadius : false

  const effectiveDebugEnabled = localDebugEnabled || Boolean(localDebugPosition)

  const runtime = deriveStageRuntime({
    currentStage,
    finished: payload.finished,
    distanceMeters,
    gpsState,
    debugEnabled: effectiveDebugEnabled,
  })

  const gpsActionRequired = !payload.finished && Boolean(currentStage) && !unlockPosition

  const gpsQualityWarning = Boolean(browserGpsPosition) && browserGpsFresh && !gpsAccuracyAcceptable

  const hudHelperText = gpsQualityWarning
    ? `GPS impreciso (${Math.round(browserGpsAccuracy || 0)} m). Esperando una lectura mejor para desbloquear el nodo.`
    : gpsActionRequired
      ? 'Activa GPS para obtener una posición actual y entrar en el nodo cuando estés dentro del radio.'
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

  const isMapCollectible =
    Boolean(currentStage) &&
    (Boolean((currentStage as any).is_map_collectible) ||
      Boolean((currentStage as any).config?.is_map_collectible) ||
      (Boolean(
        (currentStage as any).physical_node_kind || (currentStage as any).physical_item_kind
      ) &&
        !(currentStage as any).qr_payload &&
        !(currentStage as any).physical_qr))

  const hasOfflineMission = offlinePrepState === 'saved' || Boolean(offlineSummary?.hasPack)
  const hasBrowserGps = Boolean(hasFreshBrowserGps)
  const primaryLabel = gpsActionRequired
    ? 'Activar GPS'
    : !runtime.canEnter
      ? runtime.primaryLabel
      : isMapCollectible
        ? `RECOGER ${String((currentStage as any).physical_item_label || currentStage!.title || 'OBJETO').toUpperCase()}`
        : currentStageIsPhysicalQr
          ? 'Abrir QR'
          : runtime.primaryLabel
  const playerHref = `/player/${encodeURIComponent(payload.user)}`
  const shellLoginHref = '/'
  const adminHref = '/admin'
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

    setState((prev) => ({
      status: 'ready',
      payload: nextPayload,
      config: prev.status === 'ready' ? prev.config : config,
    }))

    setMapRefreshToken((value) => value + 1)

    return nextPayload
  }

  async function refreshFieldProofs() {
    const nextProofs = await fetchFieldProofs(user)
    setFieldProofs(Array.isArray(nextProofs.proofs) ? nextProofs.proofs : [])
    return nextProofs
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

    const confirmed = window.confirm(
      '¿Eliminar esta foto del mapa? Solo puedes borrar tus propias fotos.'
    )
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
    setToolsOpen(!toolsOpen)
  }

  function closeTools() {
    setToolsOpen(false)
  }

  function openTeam() {
    setActivePanel(null)
    setToolsOpen(false)
    setTeamOpen(!teamOpen)
  }

  function closeTeam() {
    setTeamOpen(false)
  }

  function handleOpenEntry() {
    vibrate(10)
    window.location.assign(shellLoginHref)
  }

  function handleToggleDebug() {
    window.dispatchEvent(new CustomEvent('saga:close-qr-scanner'))
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
        setBrowserGpsFresh(false)
        setBrowserGpsAccuracy(typeof storedGps.accuracy === 'number' ? storedGps.accuracy : null)
        setBrowserGpsCapturedAt(null)
        gpsCenteredRef.current = false
      }

      showNotice('Debug desactivado. Recuperando GPS real…', 'info')

      if (hasRememberedGpsReady(user)) {
        void handleRequestLiveGps({ silent: true, forceFocus: true, exitingDebug: true })
        window.setTimeout(() => {
          void handleRequestLiveGps({ silent: true, forceFocus: true, exitingDebug: true })
        }, 1500)
      }

      vibrate(8)
      return
    }

    if (
      gpsWatchRef.current !== null &&
      typeof window !== 'undefined' &&
      window.navigator.geolocation
    ) {
      window.navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }
    setBrowserGpsPosition(null)
    setBrowserGpsStatus('unavailable')
    setBrowserGpsFresh(false)
    setBrowserGpsAccuracy(null)
    setBrowserGpsCapturedAt(null)
    setLocalDebugEnabled(true)
    showNotice(
      'Modo prueba activo. Toca un punto libre del mapa para colocar tu ubicación.',
      'info'
    )
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
    setRouteOverviewActive(false)

    if (!playerPosition) {
      void handleRequestLiveGps({
        forceFocus: true,
      })
      return
    }

    setFollowPlayer(true)
    setFocusRequest({
      target: 'player',
      token: Date.now(),
    })

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
      void handleRequestLiveGps({
        forceFocus: true,
      })
      return
    }

    const stages = Array.isArray(payload.stages) ? payload.stages : []

    const hasRouteNodes = stages.some(
      (stage) => typeof stage.lat === 'number' && typeof stage.lon === 'number'
    )

    const nextToken = Date.now()

    if (routeOverviewActive || !hasRouteNodes) {
      setRouteOverviewActive(false)
      setFollowPlayer(true)
      setFocusRequest({
        target: 'player',
        token: nextToken,
      })
      return
    }

    setRouteOverviewActive(true)
    setFollowPlayer(false)
    setFocusRequest({
      target: 'route',
      token: nextToken,
    })
  }

  function openInteraction() {
    setSubmitError(null)
    setActivePanel(null)
    setToolsOpen(false)
    setTeamOpen(false)
    setInteractionOpen(true)
  }

  async function handleRequestLiveGps(
    options: { silent?: boolean; forceFocus?: boolean; exitingDebug?: boolean } = {}
  ) {
    if (typeof window === 'undefined' || !window.navigator.geolocation) {
      setBrowserGpsStatus('unavailable')
      if (!options.silent) showNotice('GPS no disponible en este dispositivo o navegador.', 'warn')
      return
    }

    if (!window.isSecureContext) {
      setBrowserGpsStatus('error')
      setBrowserGpsFresh(false)
      if (!options.silent)
        showNotice(
          'El GPS requiere HTTPS o abrir SAGA como app instalada desde la pantalla de inicio.',
          'warn'
        )
      return
    }

    if (localDebugEnabled && !options.exitingDebug) {
      return
    }

    // Reactivar GPS debe crear un watch nuevo, no reutilizar uno bloqueado.
    if (gpsWatchRef.current !== null) {
      window.navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }

    setLocalDebugEnabled(false)
    setLocalDebugPosition(null)
    setBrowserGpsStatus('searching')
    setBrowserGpsFresh(false)
    setBrowserGpsCapturedAt(null)
    if (!options.silent)
      showNotice('Solicitando permiso de ubicación… acepta el aviso del navegador.', 'info')

    const onSuccess = (position: GeolocationPosition) => {
      if (localDebugEnabled) {
        return
      }

      const next = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      }

      const nextAccuracy =
        typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
          ? Math.max(0, position.coords.accuracy)
          : null

      const capturedAt =
        typeof position.timestamp === 'number' && Number.isFinite(position.timestamp)
          ? position.timestamp
          : Date.now()

      setBrowserGpsPosition(next)
      setBrowserGpsStatus('ready')
      setBrowserGpsFresh(true)
      setBrowserGpsAccuracy(nextAccuracy)
      setBrowserGpsCapturedAt(capturedAt)
      rememberGpsReady(user)
      rememberGpsPosition(user, next, {
        accuracy: nextAccuracy ?? undefined,
        capturedAt,
      })
      if (hasOfflineMission) setOfflinePrepVisible(false)
      setLocalDebugEnabled(false)
      setLocalDebugPosition(null)

      if (options?.forceFocus && followPlayerRef.current) {
        gpsCenteredRef.current = true
        setFocusRequest({
          target: 'player',
          token: Date.now(),
        })
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
      setBrowserGpsFresh(false)
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
      maximumAge: 10000,
      timeout: 4000,
    })

    if (gpsWatchRef.current === null) {
      gpsWatchRef.current = window.navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 4000,
      })
    }
  }

  handleRequestLiveGpsRef.current = handleRequestLiveGps

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

      setState((prev) => ({
        status: 'ready',
        payload: offlinePayload,
        config: prev.status === 'ready' ? prev.config : { map_zoom: 16 },
      }))

      setMapRefreshToken((value) => value + 1)

      setOfflineSummary(await getOfflineMissionSummary(payload.user))
      setOfflinePrepState('saved')
      await cachePlayerShell(playerHref).catch(() => undefined)
      setOfflinePrepVisible(true)
      showNotice(`Mission downloaded for offline play (${pack.stage_count} nodes).`, 'success')
      vibrate([10, 16, 10])
    } catch (error) {
      setOfflinePrepState('error')
      showNotice(
        error instanceof Error ? error.message : 'Could not download offline mission.',
        'warn'
      )
      vibrate(10)
    }
  }

  async function handleDownloadFieldProofs() {
    if (!fieldProofs.length) return
    showNotice('Preparando archivo ZIP...', 'info')

    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const promises = fieldProofs.map(async (proof, index) => {
        const url = proof.image_url || proof.thumbnail_url
        if (!url) return

        try {
          const response = await fetch(url)
          const blob = await response.blob()
          const filename = `foto_${index + 1}_${proof.id}.jpg`
          zip.file(filename, blob)
        } catch (err) {
          console.warn('Failed to fetch photo for zip', err)
        }
      })

      await Promise.all(promises)

      const content = await zip.generateAsync({ type: 'base64' })
      const safeUserName = String(payload.user || 'jugador')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
      const downloadUrl = `data:application/zip;base64,${content}`
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `fotos_saga_${safeUserName}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      showNotice('Descarga de ZIP completada', 'success')
    } catch (err) {
      console.error(err)
      showNotice('Error al crear ZIP', 'warn')
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
    
    if (currentStage?.intro_body && !isMapCollectible) {
      setActiveStageIntro(true)
    } else {
      openInteraction()
    }
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
      if (isMapCollectible) {
        handlePrimaryAction()
      } else {
        showNotice('Ya estás en rango. Pulsa el botón principal para abrir el nodo.', 'info')
      }
      return
    }

    if (runtime.reason === 'out_of_range') {
      showNotice(
        distanceMeters !== null
          ? `Demasiado lejos (${distanceMeters}m). Acércate al nodo.`
          : 'Fuera de rango. Acércate al nodo.',
        'warn'
      )
      return
    }

    if (runtime.reason === 'gps_unavailable' || runtime.reason === 'distance_unknown') {
      showNotice('GPS no disponible. Actívalo para detectar tu posición.', 'info')
      return
    }

    if (runtime.reason === 'missing_stage') {
      showNotice('Completa el nodo anterior antes de acceder a este.', 'warn')
      return
    }

    showNotice('Este nodo no está disponible todavía.', 'info')
  }

  async function handleSubmitCode(code: string) {
    try {
      setSubmitting(true)
      setSubmitError(null)

      if (isMapCollectible && currentStage && code === 'OK') {
        const itemId = (currentStage as any).physical_item_id || `item_${currentStage.id}`
        const label = (currentStage as any).physical_item_label || currentStage.title || 'Objeto Coleccionable'
        const icon = (currentStage as any).physical_icon ||
          (currentStage as any).config?.physical_icon ||
          (currentStage as any).icon ||
          '⭐'

        collectInventoryItem({
          user: payload.user,
          item_id: itemId,
          label: label,
          quantity: 1,
          source: 'manual',
          node_id: String(currentStage.id),
          metadata: {
            physical_icon: icon,
            node_title: currentStage.title || '',
            node_id: String(currentStage.id),
          },
          queue_event: true,
        })

        sounds.collect()
        haptics.collect()
        showNotice(`⭐ ¡Recogido: ${label}!`, 'success')
      }

      const result = await advancePlayer(payload.user, code)
      if (result.status !== 'ok') {
        const missingItem = result.reason === 'missing_required_item'
        setSubmitError(
          missingItem
            ? 'Te falta un objeto requerido. Recógelo antes de continuar.'
            : 'Código incorrecto para este nodo.'
        )
        showNotice(
          missingItem
            ? '¡Necesitas un objeto! Revisa tu mochila.'
            : 'Código no aceptado. Inténtalo de nuevo.',
          'warn'
        )
        return
      }

      setInteractionOpen(false)
      const nextPayload = await refreshPayload()

      if (nextPayload.finished) {
        showOverlay('finish')
        sounds.success()
        haptics.success()
        showNotice('¡Misión completada! 🏆', 'success')
      } else {
        showOverlay('node')
        sounds.success()
        haptics.success()
        showNotice('¡Nodo superado! ⚡', 'success')
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
          setState((prev) => ({
            status: 'ready',
            payload: localResult.payload,
            config: prev.status === 'ready' ? prev.config : { map_zoom: 16 },
          }))

          setMapRefreshToken((value) => value + 1)

          if (localResult.payload.finished) {
            showOverlay('finish')
            showNotice('¡Misión completada en modo offline! 🏆 Se sincronizará al recuperar conexión.', 'success')
          } else {
            showOverlay('node')
            showNotice('¡Nodo superado sin conexión! ⚡ El progreso se sincronizará pronto.', 'success')
          }

          return
        }

        if (localResult.reason === 'missing_required_item') {
          setSubmitError('Te falta un objeto requerido. Recógelo antes de continuar.')
          showNotice('¡Necesitas un objeto! Revisa tu mochila.', 'warn')
          return
        }

        if (localResult.reason === 'invalid_code') {
          setSubmitError('Código incorrecto para la misión offline descargada.')
          showNotice('Código no aceptado en modo offline.', 'warn')
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
        setSubmitError('Sin conexión. El código se ha guardado localmente y se sincronizará cuando vuelva la red.')
        showNotice(`Código guardado offline (${snapshot.queued_events.length} pendientes). ¡Sigue jugando!`, 'warn')
      } catch {
        setSubmitError(message)
        showNotice('Error al enviar. Comprueba tu conexión.', 'warn')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScreenFrame mobile={isPhone}>
      <MapSurface
        currentStage={currentStage}
        missionStages={payload.stages || []}
        currentLevel={payload.level || 0}
        playerPosition={playerPosition}
        gpsState={gpsState}
        debugSimulation={localDebugEnabled || Boolean(localDebugPosition)}
        followPlayer={followPlayer}
        focusRequest={focusRequest}
        refreshToken={mapRefreshToken}
        mapboxToken={state.config?.mapbox_token}
        mapboxStyle={state.config?.mapbox_style}
        onUserMapMove={() => {
          setFollowPlayer(false)
          setRouteOverviewActive(false)
        }}
        nodeState={interactionOpen ? 'engaging' : runtime.canEnter ? 'ready' : 'locked'}
        otherPlayers={teamMapMarkers}
        fieldProofs={fieldProofs}
        viewerUser={payload.user}
        onDeleteFieldProof={handleDeleteFieldProof}
        onOpenFieldProofs={setSelectedFieldProofs}
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

      {!isSecure && !hideInsecureNotice ? (
        <div style={insecureNoticeCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div style={insecureNoticeTitle}>⚠️ ENTORNO NO SEGURO (HTTP)</div>
            <button
              type="button"
              onClick={() => setHideInsecureNotice(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 900,
                cursor: 'pointer',
                padding: '0 4px',
                margin: '-4px -4px 0 0',
              }}
            >
              ×
            </button>
          </div>
          <div style={insecureNoticeBody}>
            El navegador bloquea el GPS y el mapa offline en conexiones HTTP. Para probar el modo
            offline:
            <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
              <li>
                Usa <strong>https://</strong> (con ngrok)
              </li>
              <li>
                O en Chrome del móvil, entra en{' '}
                <code
                  style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: 4 }}
                >
                  chrome://flags/#unsafely-treat-insecure-origin-as-secure
                </code>
                , añade esta URL y actívalo.
              </li>
            </ul>
          </div>
        </div>
      ) : null}

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

      {!interactionOpen && activePanel !== 'details' && !toolsOpen && !teamOpen && !overlayState ? (
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
            <span aria-hidden="true" style={mapQuickIcon}>
              {fieldPhotoUploading ? '⏳' : '📷'}
            </span>
          </button>

          {(state.config?.prologue_body || state.config?.prologue_title || state.config?.prologue_subtitle) ? (
            <button
              type="button"
              style={mapRouteToggleInlineButton}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setShowPrologue(true)
              }}
              aria-label="Historia"
              title="Leer historia"
            >
              <span aria-hidden="true" style={mapQuickIcon}>
                📖
              </span>
            </button>
          ) : null}

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
            <span aria-hidden="true" style={mapQuickIcon}>
              👥
            </span>
            <span style={mapQuickCountPill}>{teamVisibleCount}</span>
          </button>

          <button
            type="button"
            style={routeOverviewActive ? mapQuickButtonActive : mapRouteToggleInlineButton}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              handleToggleRouteOverview()
            }}
            aria-label={
              routeOverviewActive ? 'Volver a mi ubicación y seguirme' : 'Ver todos los nodos'
            }
            title={routeOverviewActive ? 'Volver a mi ubicación y seguirme' : 'Ver todos los nodos'}
          >
            <span aria-hidden="true" style={mapQuickIcon}>
              {routeOverviewActive ? '📍' : '🧭'}
            </span>
          </button>



          <button
            type="button"
            style={{
              ...mapRouteToggleInlineButton,
              background: 'rgba(52, 211, 153, 0.2)',
              borderColor: 'rgba(52, 211, 153, 0.4)',
              color: '#34d399',
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              transition:
                'max-width 0.3s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, padding 0.3s ease',
              maxWidth: !followPlayer ? '100px' : '0px',
              minWidth: !followPlayer ? '44px' : '0px',
              width: !followPlayer ? 'auto' : '0px',
              opacity: !followPlayer ? 1 : 0,
              paddingLeft: !followPlayer ? 12 : 0,
              paddingRight: !followPlayer ? 12 : 0,
              borderWidth: !followPlayer ? 1 : 0,
              pointerEvents: !followPlayer ? 'auto' : 'none',
              marginLeft: 0,
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setFollowPlayer(true)
              void handleRequestLiveGps({ forceFocus: true })
            }}
            aria-label="Centrar en mi ubicación"
          >
            CENTRAR
          </button>
        </div>
      ) : null}
      {/* saga-map-quick-controls-row-v1 */}

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

      {payload.finished && !dismissedFinishScreen ? (
        <div className="saga-finish-overlay" role="dialog" aria-modal="true">
          <style>{finishOverlayStyle}</style>
          <div className="saga-finish-card">
            <div className="saga-finish-orb">🏆</div>
            <h2 className="saga-finish-title">Misión Completada</h2>
            <p className="saga-finish-subtitle">
              ¡Excelente trabajo, agente <strong>{payload.display_name || payload.user}</strong>!
              Has completado con éxito todos los nodos de la ruta de campo.
            </p>

            <div className="saga-finish-stats">
              <div className="saga-finish-stat-box">
                <div className="saga-finish-stat-val">{payload.stages?.length || 0}</div>
                <div className="saga-finish-stat-lbl">Nodos</div>
              </div>
              <div className="saga-finish-stat-box">
                <div className="saga-finish-stat-val">
                  {fieldProofs?.filter((p) => p.user === payload.user).length || 0}
                </div>
                <div className="saga-finish-stat-lbl">Fotos</div>
              </div>
            </div>

            <button
              type="button"
              className="saga-finish-btn-primary"
              onClick={() => setDismissedFinishScreen(true)}
            >
              Ver mapa de ruta
            </button>

            <button
              type="button"
              className="saga-finish-btn-secondary"
              onClick={() => window.location.assign('/')}
            >
              Salir
            </button>
          </div>
        </div>
      ) : null}

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
        submitting={submitting}
        onClose={() => {
          if (!submitting) setInteractionOpen(false)
        }}
        onSubmitCode={handleSubmitCode}
        onShowHistory={currentStage?.intro_body ? () => setActiveStageIntro(true) : undefined}
      />

      {payload.finished && dismissedFinishScreen ? (
        <button
          type="button"
          style={floatingTrophyButton}
          onClick={() => setDismissedFinishScreen(false)}
          aria-label="Ver pantalla de finalización"
          title="Ver pantalla de finalización"
        >
          🏆
        </button>
      ) : null}

      {showPrologue && state.status === 'ready' && state.config && (
        <StoryModal
          title={state.config.prologue_title || 'Prólogo'}
          subtitle={state.config.prologue_subtitle}
          body={state.config.prologue_body || ''}
          buttonText="Comenzar Aventura"
          onClose={() => setShowPrologue(false)}
        />
      )}

      {activeStageIntro && currentStage && (
        <StoryModal
          title={currentStage.intro_title || currentStage.title || 'Historia'}
          body={currentStage.intro_body || ''}
          buttonText="Continuar a la prueba"
          onClose={() => {
            setActiveStageIntro(false)
            openInteraction()
          }}
        />
      )}
    </ScreenFrame>
  )
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

const insecureNoticeCardStyle: CSSProperties = {
  position: 'absolute',
  top: 140,
  left: 12,
  right: 12,
  padding: 14,
  borderRadius: 20,
  background: 'rgba(220,38,38,.92)',
  border: '1px solid rgba(255,255,255,.2)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.45,
  zIndex: 1200,
  boxShadow: '0 16px 36px rgba(0,0,0,.35)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

const insecureNoticeTitle: CSSProperties = {
  fontWeight: 900,
  fontSize: 13,
  letterSpacing: '-0.02em',
}

const insecureNoticeBody: CSSProperties = {
  marginTop: 6,
  opacity: 0.95,
  fontWeight: 700,
}

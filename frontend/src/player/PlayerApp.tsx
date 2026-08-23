import { getCachedPublicConfig } from '../shared/offlinePublicConfig'
import { aplicarTema } from '../shared/tema'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ToastNotice, type UiNotice } from './components/ToastNotice'
import { QuietNotice, type QuietNoticeData } from './components/QuietNotice'
import { SplashScreen } from './components/SplashScreen'
import { usePlayerStore } from './store/usePlayerStore'
import { useGpsTracker } from './store/useGpsTracker'
import { hydrateInventoryFromServer } from './offline/inventory'
import {
  deleteFieldProof,
  fetchPlayerGame,
  fetchPublicConfig,
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
import { RankingSheet } from './components/RankingSheet'
import { MissionCompleteScreen } from './components/MissionCompleteScreen'
import { UseItemOverlay } from './components/UseItemOverlay'

import { FieldPrepPanel } from './components/FieldPrepPanel'
import { FieldPhotoViewer } from './components/FieldPhotoViewer'
import { FieldCameraCapture } from './components/FieldCameraCapture'
import { deriveStageRuntime, type PlayerPanel } from './runtime'
import { aplicarResetDeRelojes, tiempoDelNodo } from './nodeClock'
import { marcarInicioQr, tempoDoQr } from './qrClock'
import { QrScanClock } from './components/QrScanClock'
import { adoptarIdiomaDeLaMision } from '../i18n'
import { checkStageItemGate, readStageItemRequirement } from './rewards/stageItemRequirement'
import { getPlayerNameFromLocation } from '../shared/playerRoute'
import { buildFallbackPublicConfig, cachePublicConfig, pedirConfigConCache } from '../shared/offlinePublicConfig'
import {
  borrarColaOffline,
  contarAvancesPendentes,
  getOfflineMissionSummary,
  getStoredMissionPack,
  saveMissionPack,
  syncPendingOfflineEvents,
  type OfflineMissionSummary,
} from './offline/missionPack'
import { pedirPartida } from './offline/missionSync'
import { getOfflineMapTileSummary, prefetchMissionMapTiles } from './offline/mapTileCache'
import { cachePlayerShell, registerPlayerServiceWorker } from './offline/pwaShell'
import {
  borrarFotoPendente,
  eFotoPendente,
  encolarBorradoDeFoto,
  flushOfflineEvents,
  saveOfflinePhoto,
} from './offline/localFirst'
import { cacheTeamProfiles, getCachedTeamProfiles } from './offline/teamPresence'
import { countVisibleTeamMarkers, teamProfilesToMapMarkers } from './offline/teamMapPresence'
import { getDistanceMeters } from './utils/geo'
import { useFotosDeCampo } from './hooks/useFotosDeCampo'
import { usePermisos } from './hooks/usePermisos'
import { estadoDelGps, margenQueSePerdona, precisionAceptable } from './gps/decisiones'
import { enviarCodigo } from './avance/enviarCodigo'
import {
  readStoredGpsPosition,
  rememberGpsPosition,
  rememberGpsReady,
  hasRememberedGpsReady,
} from './utils/gpsStorage'
import { haptics } from './utils/haptics'
import { getCurrentStage, getStagePosition, getStageRadius } from './utils/stagePosition'
import {
  CelebrationOverlay,
  ScreenFrame,
  StatusCard,
  getBottomOverlayStyle,
  getMapQuickControlsStyle,
  getTopOverlayStyle,
  getTopScrimStyle,
  getToastOverlayStyle,
  getQuietOverlayStyle,
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

/**
 * Nodo mas alto visto en esta sesion.
 *
 * Vive en memoria a proposito. Guardarlo en el telefono fue lo que se probo dos
 * veces y salio mal: un movil con datos viejos le imponia su version al
 * servidor y no habia forma de ponerlos de acuerdo. Asi, al cerrar la app se
 * olvida, de modo que un reset hecho desde administracion entra sin pelear. Lo
 * unico que impide es que la partida se deshaga en pantalla mientras se juega.
 */
/**
 * El nivel del jugador no baja por una respuesta del servidor.
 *
 * Hay dos verdades sobre en qué nodo estás: la del móvil, que avanza aunque no
 * haya cobertura, y la del servidor, que sólo se entera al sincronizar. Cuando
 * el servidor contesta con un nivel más bajo puede ser por tres motivos muy
 * distintos, y tratarlos igual es lo que mandaba a la gente a repetir juegos:
 *
 *  - respuesta vieja que llega tarde  → hay que ignorarla
 *  - nodos hechos sin cobertura       → hay que esperar a que suba la cola
 *  - reseteo desde administración     → hay que obedecer
 *
 * `permitirBajar` es lo único que distingue el tercero. Se pasa `true` sólo
 * cuando la cola está vacía —no hay nada que justifique ir por delante— y no
 * acaba de llegar un reseteo.
 */
function mantenerNivel(
  anterior: PlayerGamePayload | null,
  siguiente: PlayerGamePayload,
  permitirBajar = false
) {
  if (!anterior) return siguiente

  const nivelAnterior = Number(anterior.level || 0)
  const nivelSiguiente = Number(siguiente.level || 0)

  if (!Number.isFinite(nivelAnterior) || nivelSiguiente >= nivelAnterior) return siguiente
  if (permitirBajar) return siguiente

  // Llega un nivel menor del que ya se veia: respuesta vieja, rebote, o
  // progreso que todavia no ha subido. Se conserva lo alcanzado y se aprovecha
  // el resto de datos nuevos.
  return { ...siguiente, level: nivelAnterior, current_stage: anterior.current_stage }
}

export default function PlayerApp() {
  const user = getPlayerNameFromLocation() || getUserFromUrl()

  const [state, setState] = useState<LoadState>({ status: 'idle' })
  // La carga inicial descarga teselas y puede tardar. Mientras tanto el
  // refresco periódico NO debe promover a 'ready': hacerlo mostraba la pantalla
  // de juego unos segundos y después volvía a la de carga.
  const initialLoadDoneRef = useRef(false)

  /**
   * La partida que se está viendo ahora mismo, legible desde los efectos.
   *
   * Los ciclos de refresco viven en efectos con sus propias dependencias, así
   * que el `state` que ven es el del momento en que se montaron. Para decidir
   * si un nivel que llega es un avance o un retroceso hace falta el de verdad.
   */
  const payloadRef = useRef<PlayerGamePayload | null>(null)

  /**
   * Desde cuándo se espera una posición en el nodo actual.
   *
   * ⚠️ Va AQUÍ, con el resto de hooks y antes de cualquier `return` temprano.
   * Estuvo un rato más abajo, después de los returns de carga y error, y eso
   * hace que el número de hooks cambie entre un render y otro: React tira la
   * aplicación entera con el error 310 y el jugador ve la pantalla de fallo.
   * Cualquier hook nuevo va arriba, sin excepción.
   */
  const esperandoGpsRef = useRef<{ nodo: string; desde: number } | null>(null)
  const [showPrologue, setShowPrologue] = useState(false)

  /**
   * El prólogo se enseña SIEMPRE que se entra estando en el primer nodo.
   *
   * Antes se guardaba una marca en el móvil para no repetirlo, pero el día de
   * la ruta la gente abre y cierra la app varias veces antes de salir, y el
   * que la cerraba se quedaba sin saber de qué iba la misión. Mientras no se
   * haya superado el primer nodo, entrar significa ver el prólogo; una vez
   * dentro de la travesía ya no vuelve a aparecer.
   */
  const prologoLanzadoRef = useRef(false)

  useEffect(() => {
    if (state.status !== 'ready') return
    if (prologoLanzadoRef.current) return

    const level = Number(state.payload.level ?? 0)
    if (level !== 0 || state.payload.finished) return

    prologoLanzadoRef.current = true
    setShowPrologue(true)
  }, [state])

  /**
   * El tema, en cuanto la partida está cargada.
   *
   * Esto leía `getCachedPublicConfig()`, o sea la copia guardada en el móvil.
   * Un jugador que abre la aplicación por PRIMERA vez no tiene esa copia
   * todavía, asi que se quedaba con el tema de respaldo aunque la misión
   * dijera otro, y sólo se corregía en una carga posterior.
   *
   * Comprobado en el banco de ensayo, en una carga limpia: `body.className`
   * salía `theme-glass` con la misión puesta en `flame-red`.
   *
   * `state.config` es lo que acaba de traer el servidor. La copia guardada
   * sólo vale de respaldo, para cuando se abre sin cobertura.
   */
  useEffect(() => {
    if (state.status !== 'ready') return
    aplicarTema(state.config?.player_theme ?? getCachedPublicConfig()?.player_theme)
  }, [state])

  const [activeStageIntro, setActiveStageIntro] = useState(false)
  const [activePanel, setActivePanel] = useState<PlayerPanel>(null)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submitLockRef = useRef(false)
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
  const [uiQuiet, setUiQuiet] = useState<QuietNoticeData>(null)
  const [overlayState, setOverlayState] = useState<OverlayState>(null)
  const [dismissedFinishScreen, setDismissedFinishScreen] = useState(false)
  const toolsOpen = usePlayerStore((s) => s.toolsOpen)
  const setToolsOpen = usePlayerStore((s) => s.setToolsOpen)
  const rankingOpen = usePlayerStore((s) => s.rankingOpen)
  const setRankingOpen = usePlayerStore((s) => s.setRankingOpen)

  const addTrackerPoint = useGpsTracker((s) => s.addPoint)
  const [teamProfiles, setTeamProfiles] = useState<TeamProfileLiveStatus[]>([])

  // La mochila vive en localStorage y cambia sin que React se entere (al forjar
  // en la mesa de trabajo o al recoger un objeto). Sin este latido, el botón del
  // nodo final seguía diciendo "falta un objeto" después de haber forjado el
  // fabricado, hasta recargar. Mismo intervalo que usa la mesa de trabajo.
  const [inventoryTick, setInventoryTick] = useState(0)
  useEffect(() => {
    const bump = () => setInventoryTick((value) => value + 1)
    const id = window.setInterval(bump, 2_000)
    window.addEventListener('storage', bump)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('storage', bump)
    }
  }, [])

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
  const browserGpsStatusRef = useRef<PlayerGpsStatus>(browserGpsStatus)
  useEffect(() => { browserGpsStatusRef.current = browserGpsStatus }, [browserGpsStatus])
  const browserGpsFresh = usePlayerStore((s) => s.gpsFresh)
  const setBrowserGpsFresh = usePlayerStore((s) => s.setGpsFresh)
  const browserGpsAccuracy = usePlayerStore((s) => s.gpsAccuracy)
  const setBrowserGpsAccuracy = usePlayerStore((s) => s.setGpsAccuracy)
  const browserGpsCapturedAt = usePlayerStore((s) => s.gpsCapturedAt)
  const setBrowserGpsCapturedAt = usePlayerStore((s) => s.setGpsCapturedAt)
  const [quickQrOpenSignal, setQuickQrOpenSignal] = useState(0)
  // Paso de "usar el objeto" en los nodos que exigen llevar una pieza.
  const [useItemPrompt, setUseItemPrompt] = useState<{ label: string; itemId: string } | null>(null)
  const usedItemStagesRef = useRef<Set<string>>(new Set())
  // Nodos cuya historia ya se enseñó. En el nodo final el texto volvía a
  // saltar cada vez que se entraba al mosaico, tapando el juego una y otra vez.
  const introMostradaRef = useRef<Set<string>>(new Set())
  /**
   * Las fotos de campo, con su propio ciclo. Ver hooks/useFotosDeCampo.ts.
   *
   * Eran cuatro estados, un ciclo de 15 s, un escuchador y tres funciones
   * repartidos por este fichero. Aparte se leen de un vistazo, y de paso se ve
   * lo que hacen: llevan DOS listas, las que ya subieron y las que van de
   * camino, y las pintan juntas.
   */
  const fotos = useFotosDeCampo(user)
  const fieldProofs = fotos.delServidor
  const fotosPendentes = fotos.pendientes
  const repasarFotosPendentes = fotos.repasarPendientes
  const setFieldProofs = fotos.setDelServidor

  const [fieldCameraOpen, setFieldCameraOpen] = useState(false)
  const [selectedFieldProofs, setSelectedFieldProofs] = useState<FieldProof[]>([])
  const [fieldPhotoUploading, setFieldPhotoUploading] = useState(false)
  const [hideInsecureNotice, setHideInsecureNotice] = useState(false)
  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : true
  const [mapRefreshToken, setMapRefreshToken] = useState(0)
  // Removed gpsLoaded state and 20s timeout

  const noticeTimerRef = useRef<number | null>(null)
  const quietTimerRef = useRef<number | null>(null)
  const overlayTimerRef = useRef<number | null>(null)
  const gpsWatchRef = useRef<number | null>(null)
  const gpsCenteredRef = useRef(false)
  const gpsNoticeShownRef = useRef(false)
  const handleRequestLiveGpsRef = useRef<
    ((options?: { silent?: boolean; forceFocus?: boolean }) => Promise<void>) | null
  >(null)
  const prevTeamStatusRef = useRef<Record<string, string>>({})

  /**
   * Permisos de cámara y de movimiento, pedidos ANTES de salir.
   *
   * Los pedía cada juego la primera vez que hacía falta: en mitad del monte, con
   * el cronómetro corriendo y el aviso del sistema tapando el reto. En iOS el
   * permiso de movimiento sólo se puede pedir desde un toque del jugador, así
   * que va detrás de un botón aquí, en la pantalla de preparación.
   */
  /**
   * Cámara y movimiento, cada uno por su lado.
   *
   * Iban juntos: se pedían los dos de golpe y sólo se daban por buenos si los
   * dos salían bien. Conceder el movimiento no quitaba la fila porque la cámara
   * había fallado, y encima saltaba un aviso arriba diciendo que faltaba la
   * cámara cuando lo que acababas de conceder era el movimiento. Separados, cada
   * uno se pide con su botón y se apaga en cuanto está.
   */
  const permisos = usePermisos()
  const permisoCamara = permisos.camara
  const permisoMovimiento = permisos.movimiento
  const prepCerrada = permisos.prepCerrada
  const setPrepCerrada = permisos.setPrepCerrada
  const pedirCamara = permisos.pedirCamara
  const pedirMovimiento = permisos.pedirMovimiento

  // El idioma de la misión lo decide el admin en la configuración. Sin esto la
  // app arrancaba siempre en castellano: la historia salía en gallego y los
  // botones en castellano, y cada jugador tenía que entrar en Herramientas a
  // cambiarlo. Lo que el jugador elija a mano sigue mandando.
  const idiomaDeLaMision = state.status === 'ready' ? state.config?.ui_lang : undefined
  useEffect(() => {
    adoptarIdiomaDeLaMision(idiomaDeLaMision)
  }, [idiomaDeLaMision])

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

    /**
     * Arranque del GPS al abrir la app.
     *
     * Antes se lanzaba a ciegas 300 ms después de montar, en silencio. Si el
     * navegador no lo concedía en ese momento —lo normal cuando el permiso está
     * en "preguntar", porque muchos navegadores sólo enseñan el aviso si lo pide
     * un toque del jugador— fallaba sin decir nada: se entraba al juego sin
     * flecha y sin líneas, y sólo aparecía al ir a Herramientas y darle a
     * Activar GPS, que sí es un toque.
     *
     * Ahora se mira primero si el permiso YA está concedido. Si lo está, se
     * arranca solo y no hay aviso ninguno. Si no, se deja la pantalla de
     * preparación a la vista para que el jugador lo conceda con un toque.
     */
    let cancelado = false

    async function arrancarUbicacion() {
      const permisos = navigator.permissions
      if (!permisos?.query) {
        // Sin forma de consultar: se intenta igual, como hasta ahora.
        window.setTimeout(() => {
          if (!cancelado) void handleRequestLiveGps({ silent: true, forceFocus: true })
        }, 300)
        return
      }

      try {
        const estado = await permisos.query({ name: 'geolocation' as PermissionName })
        if (cancelado) return

        if (estado.state === 'granted') {
          void handleRequestLiveGps({ silent: true, forceFocus: true })
        } else {
          // Hace falta un toque: que se vea el botón en vez de fallar callando.
          setOfflinePrepVisible(true)
        }

        estado.addEventListener?.('change', () => {
          if (!cancelado && estado.state === 'granted') {
            void handleRequestLiveGps({ silent: true, forceFocus: true })
          }
        })
      } catch {
        window.setTimeout(() => {
          if (!cancelado) void handleRequestLiveGps({ silent: true, forceFocus: true })
        }, 300)
      }
    }

    void arrancarUbicacion()

    return () => {
      cancelado = true
    }
  }, [user])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        /**
         * Sin numeros falsos.
         *
         * Aqui se mandaba un progreso de 0 sobre 100, asi que la pantalla
         * enseñaba un 0% clavado mientras en realidad iba trabajando: parecia
         * colgada, sobre todo la primera vez, que es justo la que mas tarda.
         * Sin progreso la barra va en modo indeterminado, que si dice la
         * verdad: esto avanza, pero todavia no se cuanto queda.
         */
        setState({
          status: 'loading',
          mapProgress: { done: 0, total: 0, detail: 'Conectando con la misión…' },
        })
        const delServidor = await pedirPartida(user)

        // Objetos que el servidor conoce y la mochila local no (típicamente
        // entregados a mano desde administración como rescate). Sin esto no
        // llegaban nunca al jugador.
        hydrateInventoryFromServer(delServidor.user || user, delServidor.inventory_snapshot)

        // El mismo reset que vacía la mochila tiene que parar los cronómetros:
        // si no, un jugador reseteado volvía al nodo 1 con el reloj de la
        // partida anterior corriendo y empezaba con minutos de más.
        const huboReset = aplicarResetDeRelojes(
          delServidor.user || user,
          Number((delServidor.inventory_snapshot as { reset_at?: unknown } | undefined)?.reset_at) || 0
        )
        if (huboReset) await borrarColaOffline(user).catch(() => undefined)

        /**
         * Abrir la app no puede borrar lo que se hizo sin cobertura.
         *
         * Aquí se pedía la partida al servidor y se guardaba ese nivel encima
         * del paquete local —que era el que llevaba los nodos hechos en modo
         * avión—. Al volver a abrir, el jugador aparecía en un nodo que ya
         * había superado y lo tenía que repetir; y si lo repetía con red, el
         * avance viejo subía después y se saltaba otro nodo. Es la causa del
         * salto del 5 al 7.
         *
         * Mientras queden nodos por sincronizar, manda el móvil. Cuando la cola
         * está vacía, manda el servidor.
         */
        const pendientes = huboReset ? 0 : await contarAvancesPendentes(user).catch(() => 0)
        const guardado = pendientes > 0 ? await getStoredMissionPack(user).catch(() => null) : null

        const payload = mantenerNivel(
          guardado?.payload || null,
          delServidor,
          huboReset || pendientes === 0
        )

        const config = await fetchPublicConfig()
          .then((nextConfig) => {
            cachePublicConfig(nextConfig)
            /**
             * El tema, AQUI, en cuanto se sabe cual es.
             *
             * Lo que viene despues -guardar la mision entera y las teselas del
             * mapa- tarda minutos la primera vez: la propia pantalla lo avisa.
             * Hasta ahora el tema no se ponia hasta el final de todo eso, asi
             * que la primera apertura se pasaba entera con el equivocado.
             * Medido en el banco de ensayo: al 77% de las teselas el cuerpo
             * seguia en `theme-glass` con la mision puesta en `flame-red`.
             */
            aplicarTema(nextConfig.player_theme)
            return nextConfig
          })
          .catch(() => buildFallbackPublicConfig(user))

        await saveMissionPack({
          user: payload.user || user,
          config,
          payload,
        }).catch(() => undefined)

        /**
         * El mapa se guarda al entrar, pero sólo la PRIMERA vez se espera.
         *
         * Esto tenía al jugador delante de una pantalla de carga en cada
         * arranque —medido en sagagia.es con el mapa entero ya guardado: 22
         * segundos— y encima con el cartel de "Primera vez: se guarda el mapa"
         * puesto siempre. Las teselas no llegaban ni a la red: el service
         * worker las servía de su caché. Lo único que se estaba haciendo era
         * esperar.
         *
         * Con el mapa ya guardado se entra directo y el repaso se hace por
         * detrás. Sin mapa —la primera vez, o después de vaciar el navegador—
         * sí se espera: entrar al monte sin mapa es peor que esperar un rato,
         * y para eso está la pantalla.
         */
        const hayMapa = Boolean(getOfflineMapTileSummary()?.saved)

        const guardarMapa = async () => {
          try {
            await prefetchMissionMapTiles(payload.stages, (progress) => {
              if (!cancelled && !hayMapa) {
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
            console.error('No se pudo guardar el mapa para jugar sin cobertura', err)
          }
        }

        const puedeGuardarMapa =
          typeof window !== 'undefined' &&
          window.navigator.onLine &&
          Array.isArray(payload.stages) &&
          payload.stages.length > 0

        if (puedeGuardarMapa && !hayMapa) {
          if (!cancelled) {
            setState({
              status: 'loading',
              mapProgress: { done: 0, total: 0, detail: 'Calculando el mapa de la ruta…' },
            })
          }
          await guardarMapa()
        }

        if (!cancelled) {
          initialLoadDoneRef.current = true
          setState({ status: 'ready', payload, config })
        }

        // Ya se está jugando: lo que falte del mapa se completa por detrás.
        if (puedeGuardarMapa && hayMapa) void guardarMapa()
      } catch (error) {
        const offlinePack = await getStoredMissionPack(user).catch(() => null)

        if (!cancelled && offlinePack?.payload && offlinePack?.config) {
          initialLoadDoneRef.current = true
          setState({ status: 'ready', payload: offlinePack.payload, config: offlinePack.config })
          return
        }

        const message = error instanceof Error ? error.message : 'Unknown load error'

        if (!cancelled) {
          initialLoadDoneRef.current = true
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
      // No pisar la carga inicial (descarga de teselas) con un 'ready'.
      if (!initialLoadDoneRef.current) return
      if (interactionOpen || submitting) return

      /**
       * Con la pantalla apagada la cola SI sube; lo que no se hace es el
       * refresco pesado.
       *
       * Antes este `return` cortaba las dos cosas a la vez, y medido el
       * 2026-08-17 eso significaba que un movil en el bolsillo no subia nada:
       * ocho segundos con red perfecta y servidor sano, el servidor en 0 y el
       * movil en 1. Solo se reconciliaba al volver a mirar la pantalla. Quien
       * acaba la ruta y guarda el movil podia dejar su tiempo sin registrar
       * todo el dia.
       *
       * Pero no son dos cosas del mismo precio: vaciar la cola es un POST
       * diminuto -y con la cola vacia, ni eso-, mientras que `pedirPartida` son
       * 214 KB. Lo caro se salta; lo barato, no.
       *
       * OJO CON LO QUE ESTO NO ARREGLA: si el navegador CONGELA la pagina -app
       * en segundo plano un rato largo en Android- aqui no corre nada, ni esto
       * ni ninguna otra cosa. Para ese caso hace falta Background Sync de
       * verdad, con service worker. Esto cubre la pantalla apagada con la
       * pagina viva, que es el caso corriente al guardarse el movil un momento.
       */
      const oculto = typeof document !== 'undefined' && document.visibilityState !== 'visible'

      running = true

      try {
        /**
         * Primero los nodos completados, y de uno en uno.
         *
         * Estas dos colas iban lanzadas a la vez contra el mismo endpoint. El
         * servidor aplica los avances en el orden en que le llegan, asi que dos
         * peticiones simultaneas se pisaban: el nivel que salia dependia de
         * cual contestase antes. La de IndexedDB es la que lleva los nodos
         * superados, asi que va primera y se espera a que termine.
         */
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          await syncPendingOfflineEvents(user).catch(() => undefined)
          await flushOfflineEvents(user).catch(() => undefined)
        }

        // Hasta aqui llega el movil guardado en el bolsillo. Lo de abajo es
        // para cuando hay alguien mirando.
        if (oculto) return

        /**
         * Repasar tambien las fotos que estaban esperando.
         *
         * Este ciclo no las miraba, asi que una foto guardada sin cobertura se
         * quedaba pintada como pendiente DESPUES de haber subido, junto a la
         * de verdad: la misma foto contada dos veces -"fotos de campo 1/2"-, y
         * ahi se quedaba porque nada volvia a mirarlo.
         *
         * El aviso al subir ya lo arregla al momento; esto es la red por si
         * ese aviso se pierde.
         */
        void repasarFotosPendentes(user)

        const nextPayload = await pedirPartida(user)

        // Un reseteo desde administración es la única vez que el servidor puede
        // mandar un nivel más bajo y tener razón.
        const huboReset = aplicarResetDeRelojes(
          nextPayload.user || user,
          Number((nextPayload.inventory_snapshot as { reset_at?: unknown } | undefined)?.reset_at) || 0
        )
        if (huboReset) await borrarColaOffline(user).catch(() => undefined)

        /**
         * En plena partida el nivel no baja salvo por un reseteo.
         *
         * Este ciclo corre cada 30 s, al volver a la app y al recuperar la red:
         * justo los momentos en los que llega una respuesta vieja o a medias.
         * La reconciliación hacia abajo se hace al arrancar la aplicación, que
         * es cuando una respuesta no puede venir atrasada.
         */
        const permitirBajar = huboReset

        // La configuración de la misión no cambia mientras se camina, así que
        // no se vuelve a pedir en cada refresco: ver pedirConfigConCache.
        const nextConfig = await pedirConfigConCache(fetchPublicConfig).catch(() =>
          buildFallbackPublicConfig(user)
        )

        const reconciliado = mantenerNivel(payloadRef.current, nextPayload, permitirBajar)

        // Se guarda lo reconciliado, no lo que dijo el servidor: si no, el
        // paquete offline perdia los nodos hechos sin cobertura y al arrancar
        // la app mandaba a repetirlos.
        await saveMissionPack({
          user: reconciliado.user || user,
          config: nextConfig,
          payload: reconciliado,
        }).catch(() => undefined)

        if (!cancelled) {
          setState({ status: 'ready', payload: reconciliado, config: nextConfig })
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
      window.removeEventListener('visibilitychange', refresh)
      window.clearInterval(intervalId)
    }
  }, [user, interactionOpen, submitting])

  /**
   * Pinta la tabla de equipo. La trae el latido, no una petición aparte.
   *
   * Aquí había un ciclo propio pidiendo /api/team cada 5 segundos, en paralelo
   * al latido que ya iba cada 5 segundos: «aquí estoy yo» y «dónde están los
   * demás» son la misma conversación. Medido sobre la misión real: 1 440
   * peticiones por hora y por móvil, tres cuartas partes de todo lo que le
   * llegaba a la Raspberry. Ahora el latido devuelve las dos cosas.
   */
  const aplicarEquipo = (profiles: TeamProfileLiveStatus[]) => {
    cacheTeamProfiles(user, profiles)

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

  const aplicarEquipoRef = useRef(aplicarEquipo)
  aplicarEquipoRef.current = aplicarEquipo

  // El ciclo de las fotos vive en useFotosDeCampo.

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

  // Última posición conocida para el latido, sin recrear el temporizador.
  const heartbeatPositionRef = useRef<{ lat: number; lon: number } | null>(null)
  const heartbeatSourceRef = useRef<string>('player')
  heartbeatPositionRef.current =
    localDebugPosition || (browserGpsFresh ? browserGpsPosition : null)
  heartbeatSourceRef.current = localDebugPosition
    ? 'react'
    : browserGpsPosition
      ? 'browser_gps'
      : 'player'

  useEffect(() => {
    if (state.status !== 'ready') return

    let intervalId: number | null = null

    async function publishHeartbeat() {
      /**
       * Con la pantalla apagada no se late.
       *
       * En una ruta de tres horas el móvil pasa la mayor parte del tiempo en el
       * bolsillo. El navegador ya frena los temporizadores de fondo, pero no
       * siempre ni en todos: decirlo aquí quita peticiones que no sirven para
       * nada, porque nadie está mirando el mapa. Al volver a la pantalla se
       * manda una enseguida.
       */
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      try {
        /**
         * Con la mision terminada NO se manda donde esta la gente.
         *
         * Medido sobre la mision real: de 14 posiciones guardadas, 9 estaban a
         * mas de 3 km de la ruta -hasta 70 km-, y una de hacia poco mas de un
         * dia, con la ruta jugada una semana antes. No eran posiciones de
         * juego: eran casas y trabajos, de gente que abrio la aplicacion para
         * mirar la clasificacion.
         *
         * El latido sigue yendo, porque es lo que trae la tabla del grupo. Lo
         * que deja de ir son las coordenadas. Contra los datos de personas lo
         * que protege de verdad no es el permiso firmado, sino no tener lo que
         * no hace falta.
         */
        const misionRematada = Boolean(payloadRef.current?.finished)
        const effectivePosition = misionRematada ? null : heartbeatPositionRef.current

        const respuesta = await sendHeartbeat({
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
          source: heartbeatSourceRef.current,
          // Que traiga de vuelta dónde va el resto del grupo.
          equipo: true,
        })

        const profiles = respuesta?.team?.profiles
        if (Array.isArray(profiles)) {
          aplicarEquipoRef.current(profiles)
        }
      } catch {
        // Sin cobertura se pinta el último equipo conocido en vez de vaciar la
        // pantalla: los compañeros siguen donde estaban, que es más útil que
        // un mapa en blanco.
        const guardado = getCachedTeamProfiles(user)
        if (guardado.profiles.length) aplicarEquipoRef.current(guardado.profiles)
      }
    }

    publishHeartbeat()
    intervalId = window.setInterval(publishHeartbeat, 30000)

    // Volver a la aplicación tiene que refrescar el mapa del grupo al momento,
    // no esperar al siguiente ciclo.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void publishHeartbeat()
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
    // OJO con las dependencias: antes entraban aquí la posición y el estado del
    // GPS, así que el efecto se recreaba con CADA lectura del GPS y cada
    // recreación disparaba un latido inmediato. Resultado medido: ~1 petición
    // por segundo y el 60% devolviendo 429 del propio limitador. La posición se
    // lee ahora de un ref, así que el temporizador de 5 s no se reinicia nunca.
  }, [user, state.status])

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
      if (quietTimerRef.current !== null) {
        window.clearTimeout(quietTimerRef.current)
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

  /**
   * Dos destinos, no uno.
   *
   * Antes habia un solo sitio -el cartel- y para no llenar la pantalla de
   * carteles esta funcion se tragaba en silencio todo lo que llegara con tono
   * `info` o `success`:
   *
   *     const normalizedTone = tone === 'success' ? 'info' : tone
   *     if (normalizedTone === 'info') return
   *
   * Medido contra produccion el 2026-08-17, mismo nodo y mismo boton: con un
   * 500 del servidor el aviso salia a los 101 ms, y quedandose SIN COBERTURA no
   * salia nunca. El caso raro avisaba y el caso normal del monte era mudo,
   * porque `avisoDeAvanceSinServidor` devuelve `success` justo en esa rama.
   *
   * Ahora lo que interrumpe va al cartel y lo que solo se cuenta va a una linea
   * discreta abajo. Nada se descarta.
   */
  function showNotice(message: string, tone: NoticeTone) {
    if (tone === 'warn') {
      setUiNotice({ message, tone })

      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }

      noticeTimerRef.current = window.setTimeout(() => {
        setUiNotice(null)
        noticeTimerRef.current = null
      }, 3000)
      return
    }

    // Calla, pero se lee. Mas tiempo que el cartel: no interrumpe, asi que hay
    // que darle margen a que alguien la vea sin mirar aposta.
    setUiQuiet({ message })

    if (quietTimerRef.current !== null) {
      window.clearTimeout(quietTimerRef.current)
    }

    quietTimerRef.current = window.setTimeout(() => {
      setUiQuiet(null)
      quietTimerRef.current = null
    }, 5000)
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

  /**
   * Reloj de los nodos de pegatina: corre desde que se LLEGA, no desde la cámara.
   *
   * En estos nodos la prueba es buscar la pegatina por el monte. Arrancaba al
   * abrir la cámara, así que quien tardaba cinco minutos en dar con ella y
   * escaneaba en un segundo salía con un segundo: lo que costaba de verdad no
   * contaba.
   *
   * Se calcula desde `state` y por encima de cualquier return: los hooks no
   * pueden quedar detrás de una salida anticipada -eso ya tiró la aplicación
   * una vez con el error 310 de React-.
   */
  const qrPayloadActual = (() => {
    if (state.status !== 'ready') return ''
    const nodo = state.payload.current_stage as unknown as Record<string, unknown> | null
    if (!nodo) return ''
    if (state.payload.finished) return ''
    if (!(nodo.qr_payload || nodo.physical_qr)) return ''

    /**
     * Cuenta al LLEGAR, no al tener el nodo por delante.
     *
     * Con arrancar en cuanto el nodo pasa a ser el tuyo, el reloj empezaba a
     * ochocientos metros y sumaba la caminata. Andar no cuenta nunca en esta
     * ruta -se hace toda junta-, asi que solo cuenta desde dentro del radio.
     */
    const posicion = localDebugPosition || (browserGpsFresh ? browserGpsPosition : null)
    if (!posicion) return ''

    const lat = Number(nodo.lat)
    const lon = Number(nodo.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''

    const radio = Number(nodo.radius)
    if (!Number.isFinite(radio) || radio <= 0) return ''

    // Mismo criterio que para abrir el nodo: se descuenta el margen del GPS,
    // que en el monte anda por los 30-80 m.
    const margen = margenQueSePerdona(browserGpsAccuracy)
    const distancia = getDistanceMeters(
      { lat: posicion.lat, lon: posicion.lon },
      { lat, lon }
    )
    if (distancia - margen > radio) return ''

    return String(nodo.qr_payload || 'nodo')
  })()

  /**
   * Al cambiar de nodo se olvida la orden de abrir la camara.
   *
   * La señal de "abre el escaner" es una marca de tiempo que se queda en el
   * estado hasta que alguien la pisa. Al superar un nodo de pegatina y pasar al
   * siguiente, esa marca seguia ahi: se entraba en el nodo nuevo y saltaba la
   * camara del anterior, pidiendo escanear una pegatina ya validada. Pasaba
   * cuando el refresco del servidor tardaba —con poca cobertura, justo cuando
   * mas confunde—.
   *
   * Se limpia en cuanto cambia el nivel: una orden del nodo anterior no vale
   * para el siguiente.
   */
  const nivelActual = state.status === 'ready' ? state.payload.level : -1

  useEffect(() => {
    setQuickQrOpenSignal(0)
  }, [nivelActual])

  // El aviso de foto subida lo escucha useFotosDeCampo.

  const [qrMs, setQrMs] = useState(0)

  useEffect(() => {
    if (!qrPayloadActual) {
      setQrMs(0)
      return
    }

    marcarInicioQr(user, qrPayloadActual)
    setQrMs(tempoDoQr(user, qrPayloadActual))

    const id = window.setInterval(() => {
      setQrMs(tempoDoQr(user, qrPayloadActual))
    }, 500)

    return () => window.clearInterval(id)
  }, [qrPayloadActual, user])

  if (state.status === 'idle' || state.status === 'loading') {
    const mapProgress = state.status === 'loading' ? state.mapProgress : undefined
    // total 0 quiere decir "trabajando, pero aun no se cuanto queda": ahi no
    // hay porcentaje que enseñar, y fingir un 0% era lo que hacia parecer que
    // la aplicacion se habia quedado parada.
    const hayTotal = Boolean(mapProgress && mapProgress.total > 0)
    const ratio = hayTotal
      ? Math.max(0, Math.min(100, (mapProgress!.done / mapProgress!.total) * 100))
      : undefined

    return (
      <SplashScreen
        progress={ratio}
        done={hayTotal ? mapProgress!.done : undefined}
        total={hayTotal ? mapProgress!.total : undefined}
        primeiraVez={!initialLoadDoneRef.current}
        detail={mapProgress?.detail || 'Preparando la misión…'}
      />
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
  payloadRef.current = payload
  const currentStage = getCurrentStage(payload)
  const currentStageIsPhysicalQr = isPhysicalQrStage(currentStage)

  const stagePosition = getStagePosition(currentStage)
  const stageRadius = getStageRadius(currentStage)

  // Las reglas de GPS viven en gps/decisiones.ts, con pruebas. En el monte se
  // equivocan de las dos maneras: estrictas, y quien está encima del nodo no
  // entra; laxas, y se abre desde el coche.
  const gpsAccuracyAcceptable = precisionAceptable(browserGpsAccuracy, stageRadius)

  const hasFreshBrowserGps = Boolean(browserGpsPosition) && browserGpsFresh && gpsAccuracyAcceptable

  const estadoCalculado = estadoDelGps(
    {
      hayPosicion: Boolean(browserGpsPosition),
      fresca: browserGpsFresh,
      precision: browserGpsAccuracy,
      simulada: Boolean(localDebugPosition),
    },
    stageRadius
  )

  // Si no hay posición, lo que sabe el navegador manda: distingue "buscando" de
  // "denegado", y eso cambia lo que se le dice al jugador.
  const gpsState: PlayerGpsStatus =
    estadoCalculado !== 'unavailable'
      ? estadoCalculado
      : browserGpsStatus === 'searching'
        ? 'searching'
        : browserGpsStatus === 'error'
          ? 'error'
          : 'unavailable'

  // El HUD y el botón deben mirar la MISMA posición.
  //
  // Antes el HUD usaba la mejor posición disponible y el botón exigía una
  // "validada": el resultado en pantalla era "Ya puedes abrir este nodo" justo
  // encima de un botón que decía "GPS necesario". Con GPS regular en el monte
  // eso pasaba a menudo, y no había forma de entrar.
  //
  // Como último recurso vale la posición del navegador aunque sea imprecisa o
  // no del todo fresca: el margen de precisión ya se descuenta al comprobar el
  // radio, así que no se regala nada.
  const unlockPosition =
    localDebugPosition || (hasFreshBrowserGps ? browserGpsPosition : null) || browserGpsPosition

  // La distancia QUE SE MUESTRA usa siempre la mejor posición disponible,
  // aunque la precisión sea mala: así baja de verdad según caminas en vez de
  // quedarse clavada. El desbloqueo sigue exigiendo una posición válida.
  const displayPosition = localDebugPosition || browserGpsPosition || null

  const distanceMeters =
    stagePosition && displayPosition
      ? Math.round(getDistanceMeters(displayPosition, stagePosition))
      : null

  const unlockDistanceMeters =
    stagePosition && unlockPosition
      ? Math.round(getDistanceMeters(unlockPosition, stagePosition))
      : null

  // "Si estoy dentro, estoy dentro": se descuenta el margen de error del GPS,
  // porque con 40 m de precisión el punto puede caer fuera del radio estando
  // el jugador físicamente encima del nodo. Ver gps/decisiones.ts.
  const accuracyMargin = margenQueSePerdona(browserGpsAccuracy)

  const inRange =
    stageRadius !== null && distanceMeters !== null
      ? distanceMeters - accuracyMargin <= stageRadius
      : false

  const effectiveDebugEnabled = localDebugEnabled || Boolean(localDebugPosition)

  // inventoryTick sólo está aquí para que esto se recalcule cuando cambia la
  // mochila; el valor en sí no se usa.
  void inventoryTick
  const stageItemGate = checkStageItemGate(payload.user, currentStage)

  /**
   * Desde cuándo se está esperando una posición en este nodo.
   *
   * En el monte la precisión suele ser de 30 a 80 metros y a veces no llega
   * ninguna posición. Sin esto el nodo se queda en "LOCALIZANDO..." para
   * siempre; con esto, pasado un rato, se puede abrir igual y jugar el reto,
   * que es la prueba de verdad.
   */
  const nodoActualId = String(currentStage?.id ?? '')
  const hayPosicion = unlockDistanceMeters !== null

  if (!nodoActualId || hayPosicion) {
    esperandoGpsRef.current = null
  } else if (esperandoGpsRef.current?.nodo !== nodoActualId) {
    esperandoGpsRef.current = { nodo: nodoActualId, desde: Date.now() }
  }

  const esperandoGpsDesde = esperandoGpsRef.current?.desde ?? null

  const runtime = deriveStageRuntime({
    currentStage,
    finished: payload.finished,
    distanceMeters:
      unlockDistanceMeters === null
        ? null
        : Math.max(0, unlockDistanceMeters - accuracyMargin),
    gpsState,
    debugEnabled: effectiveDebugEnabled,
    itemGate: stageItemGate
      ? {
          label: stageItemGate.requirement.label,
          missing: stageItemGate.missing,
          quantity: stageItemGate.requirement.quantity,
        }
      : null,
    esperandoGpsMs: esperandoGpsDesde ? Date.now() - esperandoGpsDesde : null,
  })

  // Sólo se pide activar el GPS cuando NO hay ninguna posición. Antes bastaba
  // con que la posición no fuese "validada" para que el botón se quedase
  // clavado en "Activar GPS" aunque ya se estuviera viendo la distancia: de ahí
  // que a veces quedase raro. El desbloqueo real sigue exigiendo unlockPosition.
  const gpsActionRequired =
    !payload.finished &&
    Boolean(currentStage) &&
    !unlockPosition &&
    !displayPosition &&
    // Si ya se ha esperado bastante y el nodo se abre igual, pedir GPS otra vez
    // es dejar al jugador en el mismo callejón por la puerta de al lado.
    runtime.reason !== 'gps_rendido'

  const gpsQualityWarning = Boolean(browserGpsPosition) && browserGpsFresh && !gpsAccuracyAcceptable

  const hudHelperText = gpsQualityWarning
    ? `GPS impreciso (${Math.round(browserGpsAccuracy || 0)} m). Esperando una lectura mejor para desbloquear el nodo.`
    : gpsActionRequired
      ? 'Activa GPS para obtener una posición actual y entrar en el nodo cuando estés dentro del radio.'
      : runtime.helperText

  const teamOtherProfiles = teamProfiles.filter(
    (member) => !member.is_self && member.user !== payload.user
  )

  // El propio jugador no viene en la lista de "otros", así que se añade a mano.
  // Su tiempo y su nivel salen del payload, que es más fresco que el latido.
  const rankingPlayers: TeamProfileLiveStatus[] = [
    ...teamOtherProfiles,
    {
      user: payload.user,
      display_name: payload.display_name || payload.user,
      presence: 'live',
      total_time_ms: payload.live_status?.total_time_ms,
      level: payload.level,
      finished: payload.finished,
      avatar_url: payload.profile?.avatar_url,
      avatar_ref: payload.profile?.avatar_ref,
      color: payload.profile?.color,
    },
  ]
  const teamMapMarkers = teamProfilesToMapMarkers(teamProfiles, {
    includeSelf: false,
    includeOfflineWithPosition: true,
  })
  const teamMarkerSummary = countVisibleTeamMarkers(teamMapMarkers)
  const teamLiveCount = teamMarkerSummary.live
  const teamVisibleCount = teamMarkerSummary.live + teamMarkerSummary.stale

  /**
   * Nodo de simple paso: no hay reto, sólo llegar.
   *
   * Detrás de su texto aparecía una pantalla de "PUNTO DE CONTROL · 35 km" que
   * no pide nada y sólo desconcierta, sobre todo probando en remoto.
   */
  const isCheckpointStage = (() => {
    const cfg = (currentStage as any)?.config
    const raiz = cfg && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {}
    const interno =
      raiz.config && typeof raiz.config === 'object' ? (raiz.config as Record<string, unknown>) : raiz
    const juego = String(interno.game_id || raiz.game_id || '')
    const objetivo = String(interno.objective || raiz.objective || '')
    return juego === 'simple_checkpoint' || objetivo === 'checkpoint'
  })()

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

  // Lo que ve el jugador: lo del servidor mas lo suyo que va de camino.
  const todasAsFotos = fotos.todas

  async function refreshPayload() {
    /**
     * Con los nodos enteros, siempre.
     *
     * Aquí se pedía la partida sin el paquete offline, y entonces el servidor
     * sólo manda el contenido jugable del nodo actual: los demás llegan con el
     * título y las coordenadas y nada más. Como esa respuesta se guardaba tal
     * cual como paquete de la misión, completar un nodo con cobertura DEJABA
     * SIN JUEGO a todos los siguientes. Después, sin red, el nodo no tenía ni
     * configuración del minijuego —la foto del mosaico del el monte vive ahí—
     * ni código que aceptar: el juego no cargaba y el código de respaldo se
     * rechazaba.
     *
     * Medido en la Raspberry sobre la misión real: sin paquete, 1 de 10 nodos
     * traía minijuego; con paquete, 10 de 10.
     */
    const nextPayload = await pedirPartida(user)

    // También al refrescar: así un objeto dado desde administración en plena
    // partida llega sin tener que recargar la aplicación entera.
    hydrateInventoryFromServer(nextPayload.user || user, nextPayload.inventory_snapshot)

    /**
     * Se pinta AHORA, no al final.
     *
     * El numero de arriba sale de esta funcion. Antes, antes de pintar nada, se
     * esperaba a dos cosas mas: pedir la configuracion, y guardar el paquete de
     * la mision entero en el almacen del telefono -los diez nodos con lo que
     * llevan dentro, fotos incluidas-. Hasta que eso no terminaba no se
     * escribia el marcador, y en el movil eso tarda: de ahi el nodo superado
     * con 00:00 casi un minuto y la correccion de golpe despues.
     *
     * El servidor no tenia nada que ver: contesta bien y rapido en la primera
     * linea de aqui arriba, y para cuando contesta ya tiene el tiempo anotado
     * en disco. Lo que llegaba tarde era el pintar.
     */
    /**
     * También aquí el nivel se reconcilia, no se acepta a ciegas.
     *
     * Esta función corre justo después de superar un nodo, que es el peor
     * momento posible para hacer caso a una respuesta lenta: si llega con el
     * nivel de antes, el jugador acababa de vuelta en el nodo que ya había
     * completado. El refresco de fondo sí lo protegía; éste no.
     *
     * En plena partida lo único que puede bajar el nivel es un reseteo desde
     * administración. Bajarlo por cualquier otra cosa es un error: el servidor
     * acaba de confirmar el avance.
     */
    const huboReset = aplicarResetDeRelojes(
      nextPayload.user || user,
      Number((nextPayload.inventory_snapshot as { reset_at?: unknown } | undefined)?.reset_at) || 0
    )
    if (huboReset) await borrarColaOffline(user).catch(() => undefined)

    const reconciliado = mantenerNivel(payloadRef.current, nextPayload, huboReset)

    setState((prev) => (prev.status === 'ready' ? { ...prev, payload: reconciliado } : prev))

    const config = await pedirConfigConCache(fetchPublicConfig).catch(() =>
      buildFallbackPublicConfig(user)
    )

    setState((prev) => ({
      status: 'ready',
      payload: reconciliado,
      config: prev.status === 'ready' ? prev.config : config,
    }))

    // Guardar la mision para jugar sin cobertura sigue haciendose, pero por
    // detras: es para dentro de un rato, no para esta pantalla.
    void saveMissionPack({
      user: reconciliado.user || user,
      config,
      payload: reconciliado,
    }).catch(() => undefined)

    setMapRefreshToken((value) => value + 1)

    return reconciliado
  }

  const refreshFieldProofs = fotos.refrescar

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

    /**
     * Una foto que aun no ha subido no existe en el servidor.
     *
     * Se pintan las pendientes junto a las demas, y su identificador solo
     * existe en el movil: pedirle al servidor que borre ese identificador
     * fallaba siempre -"failed to delete"- y la foto no se iba ni con
     * cobertura. Se borra donde de verdad esta.
     */
    if (eFotoPendente(proofId)) {
      await borrarFotoPendente(proofId)
      await repasarFotosPendentes(payload.user)
      setSelectedFieldProofs((current) => current.filter((item) => item.id !== proofId))
      vibrate(8)
      return
    }

    try {
      await deleteFieldProof(payload.user, proofId)
      setFieldProofs((current) => current.filter((item) => item.id !== proofId))
      setSelectedFieldProofs((current) => current.filter((item) => item.id !== proofId))
      void refreshFieldProofs().catch(() => {})
      vibrate(8)
    } catch {
      /**
       * Sin cobertura el borrado queda apuntado.
       *
       * Antes salia "load failed" y no se borraba nada, asi que el jugador lo
       * intentaba una y otra vez. Ahora desaparece de su pantalla y se ejecuta
       * en el servidor cuando vuelva la red.
       */
      encolarBorradoDeFoto(payload.user, proofId)
      setFieldProofs((current) => current.filter((item) => item.id !== proofId))
      setSelectedFieldProofs((current) => current.filter((item) => item.id !== proofId))
      showNotice('Sen cobertura: a foto borrarase no servidor ao volver a rede.', 'info')
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
      /**
       * Sin cobertura la foto se guarda, no se pierde.
       *
       * Aqui solo se enseñaba el fallo de red -"load failed", tal cual, en
       * ingles- y la foto se tiraba a la basura. En el monte, que es donde se
       * hacen las fotos, eso significa perderlas todas.
       *
       * El almacen y la subida diferida ya existian y nadie los usaba: se
       * guarda en el movil y sube sola en la siguiente sincronizacion.
       */
      try {
        await saveOfflinePhoto({
          user: payload.user,
          image_data_url: imageDataUrl,
          lat: playerPosition.lat,
          lon: playerPosition.lon,
          note,
          stage_id: currentStage?.id ? String(currentStage.id) : undefined,
          stage_title: currentStage?.title || undefined,
        })
        await repasarFotosPendentes(payload.user)
        showNotice('Sen cobertura: a foto xa se ve, e subirase soa. 📷', 'info')
        vibrate([10, 16, 10])
      } catch {
        showNotice(
          error instanceof Error && error.message
            ? 'Non se puido gardar a foto. Téntao outra vez.'
            : 'Non se puido gardar a foto.',
          'warn'
        )
        vibrate(8)
      }
    } finally {
      setFieldPhotoUploading(false)
    }
  }

  function togglePanel(panel: Exclude<PlayerPanel, null>) {
    setToolsOpen(false)
    setActivePanel((current) => (current === panel ? null : panel))
  }

  function openTools() {
    setActivePanel(null)
    setToolsOpen(!toolsOpen)
  }

  function closeTools() {
    setToolsOpen(false)
  }

  function openRanking() {
    setActivePanel(null)
    setToolsOpen(false)
    setRankingOpen(!rankingOpen)
  }

  function closeRanking() {
    setRankingOpen(false)
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
    // Con catch: sin él, un latido rechazado (limitador, sin cobertura) sale como
    // promesa sin capturar en la consola del móvil. Perder un latido da igual,
    // el siguiente lleva la posición buena.
    void sendHeartbeat({
      user,
      lat: position.lat,
      lon: position.lon,
      gps_status: 'ok',
      source: 'react',
    }).catch(() => undefined)
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
    
    if (browserGpsStatusRef.current !== 'ready') {
      setBrowserGpsStatus('searching')
      setBrowserGpsFresh(false)
      setBrowserGpsCapturedAt(null)
    }

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

      // Debouncing: el latido ('ok') se acumulará en heartbeatPositionRef
      // y se enviará agrupado cada 30 segundos mediante publishHeartbeat(),
      // ahorrando batería al no despertar la antena de red en cada paso.

      if (!options.silent && !gpsNoticeShownRef.current) {
        gpsNoticeShownRef.current = true
        showNotice('GPS real activado.', 'success')
      }
    }

    const onError = (error: GeolocationPositionError) => {
      // TIMEOUT (code 3) while watching means the hardware GPS is still acquiring signal
      // (e.g. airplane mode with GPS chip active, or first cold fix outdoors).
      // Keep 'searching' so the UI shows "Buscando señal…" instead of a hard error.
      const isTimeout = error.code === 3 // GeolocationPositionError.TIMEOUT
      const denied = error.code === error.PERMISSION_DENIED

      if (isTimeout) {
        // GPS hardware still working - don't flag as error
        if (browserGpsStatusRef.current !== 'ready') {
          setBrowserGpsStatus('searching')
        }
        // Don't show any notice for silent timeout retries
        return
      }

      setBrowserGpsStatus('error')
      setBrowserGpsFresh(false)
      if (!options.silent) {
        showNotice(
          denied
            ? 'Permiso de ubicación denegado. En iPhone revisa Ajustes > Safari > Ubicación, o elimina y vuelve a añadir la PWA.'
            : 'No se pudo obtener ubicación. Prueba al aire libre, activa Ubicación precisa y reintenta.',
          'warn'
        )
      }
    }

    // getCurrentPosition: short timeout is fine for a quick first-fix attempt
    window.navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    })

    if (gpsWatchRef.current === null) {
      // watchPosition: long timeout so the GPS chip can finish a cold fix
      // even in airplane mode (GPS satellite signal is independent of cellular/wifi)
      gpsWatchRef.current = window.navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
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

    let fallidas = 0

    try {
      /**
       * `jszip` se pide aqui, no arriba, asi que sale como un trozo aparte
       * -96 KB, 28 KB comprimido- que el precache offline NO guarda: ese solo
       * coge los scripts que ya estan en la pagina. Sin cobertura, esta linea
       * falla, y esta bien que asi sea -son 28 KB de mas para todos y esto se
       * hace en casa con wifi, no en el monte-, pero hay que decirlo.
       */
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const promises = fieldProofs.map(async (proof, index) => {
        const url = proof.image_url || proof.thumbnail_url
        if (!url) {
          fallidas += 1
          return
        }

        try {
          const response = await fetch(url)
          if (!response.ok) throw new Error(`http ${response.status}`)
          const blob = await response.blob()
          const filename = `foto_${index + 1}_${proof.id}.jpg`
          zip.file(filename, blob)
        } catch (err) {
          // Antes esto era un console.warn y seguia: el ZIP salia incompleto y
          // se anunciaba como completado. El jugador borra el movil confiando
          // en que tiene sus fotos.
          fallidas += 1
          console.warn('[SAGA] no se pudo meter una foto en el ZIP', err)
        }
      })

      await Promise.all(promises)

      const blobData = await zip.generateAsync({ type: 'blob' })
      const safeUserName = String(payload.user || 'jugador')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
      const downloadUrl = URL.createObjectURL(blobData)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `fotos_saga_${safeUserName}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)

      if (fallidas === 0) {
        showNotice('Descarga de ZIP completada', 'success')
      } else {
        showNotice(
          `ZIP descargado, pero faltan ${fallidas} de ${fieldProofs.length} fotos. Vuelve a intentarlo con mejor cobertura.`,
          'warn'
        )
      }
    } catch (err) {
      console.error('[SAGA] no se pudo armar el ZIP de fotos', err)
      // Lo mas probable con diferencia es que no haya red: el trozo de jszip
      // no viene guardado en el movil. Decir solo "error" no ayuda a nadie.
      showNotice(
        'No se pudo preparar el ZIP. Hace falta conexión para armarlo.',
        'warn'
      )
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
          runtime.reason === 'missing_item'
            ? `Te falta ${stageItemGate?.requirement.label || 'un objeto'}. Fabrícalo en Mochila › Mesa de trabajo.`
            : runtime.reason === 'out_of_range'
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

    if (!runtime.canEnter) {
      // Antes esto salía en silencio y el botón parecía roto. Si lo que falta
      // es un objeto conviene decir dónde se consigue.
      if (runtime.reason === 'missing_item') {
        showNotice(
          `Te falta ${stageItemGate?.requirement.label || 'un objeto'}. Fabrícalo en Mochila › Mesa de trabajo.`,
          'warn'
        )
        vibrate(8)
      }
      return
    }

    setFocusRequest({ target: 'node', token: Date.now() })
    vibrate([10, 16, 10])
    showOverlay('activate')

    // Si el nodo exige una pieza y ya la llevas, se usa a la vista antes de
    // entrar. Antes el nodo se abría sin más y el objeto que tanto costó forjar
    // no se llegaba a ver en ningún momento.
    const requisito = readStageItemRequirement(currentStage)
    const claveNodo = String(currentStage?.id ?? currentStage?.title ?? '')
    if (requisito && !stageItemGate && !usedItemStagesRef.current.has(claveNodo)) {
      setUseItemPrompt({ label: requisito.label, itemId: requisito.itemId })
      return
    }

    // Antes se intentaba reproducir /media/<id>-historia.mp4 en TODOS los
    // nodos. Esos vídeos no existen, así que el jugador se comía una pantalla
    // negra con un botón "Saltar" en cada nodo. Se entra directo al contenido.
    proceedToInteraction()
  }

  /**
   * Milisegundos desde que se abrió el nodo actual.
   *
   * Lo lleva nodeClock, no un ref: un ref se pierde al recargar y volvía a
   * empezar de cero. El reloj arranca la primera vez que se abre el nodo y no
   * se para hasta superarlo.
   */
  function tiempoEnNodo() {
    const clave = claveDelNodo()
    if (!clave) return 0
    return tiempoDelNodo(user, clave)
  }

  /** Misma clave en todas partes: la hoja de interacción usa `stage.id`. */
  function claveDelNodo() {
    return String(currentStage?.id ?? '')
  }

  function proceedToInteraction() {
    // Cada tipo de nodo enseña su texto UNA vez:
    //
    //  - Coleccionable: la pantalla de recoger ya lleva el texto dentro, así
    //    que abrir antes la historia lo mostraba dos veces seguidas.
    //  - Punto de control: no hay reto que jugar. Detrás de la historia sólo
    //    aparecía una pantalla con la distancia ("35 km"), que no aporta nada
    //    y encima confunde cuando se juega en remoto. La historia ES el nodo.
    //  - Minijuego: historia y después el reto, como hasta ahora.
    if (isMapCollectible) {
      openInteraction()
      return
    }

    const clave = claveDelNodo()
    const yaVista = introMostradaRef.current.has(clave)

    /**
     * Leer NO cuenta. El reloj arranca con el reto.
     *
     * Antes se ponía en marcha aquí, al abrir el nodo, con lo que la pantalla
     * que cuenta la historia y explica en qué consiste el juego ya sumaba
     * segundos. Eso penaliza a quien lee entero y premia a quien se lo salta, y
     * en una ruta que se hace toda junta no distingue a nadie por jugar mejor.
     *
     * Ahora lo arranca la hoja del reto, que es cuando de verdad empieza:
     * el trazado del patrón, la foto del mosaico, las señales, la bola. Y para
     * al superarlo, que el nodo ya está hecho.
     */

    if (currentStage?.intro_body && !yaVista) {
      introMostradaRef.current.add(clave)
      setActiveStageIntro(true)
      return
    }

    if (isCheckpointStage) {
      /**
       * Un punto de control no suma tiempo.
       *
       * No hay reto que cronometrar: se llega y se lee. Contaba lo que se
       * tardase en leer el texto, asi que quien lee despacio salia penalizado
       * por leer, y eso no distingue a nadie en una ruta que se hace junta.
       */
      void handleSubmitCode('OK', 0)
      return
    }

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
          runtime.reason === 'missing_item'
            ? `Te falta ${stageItemGate?.requirement.label || 'un objeto'}. Fabrícalo en Mochila › Mesa de trabajo.`
            : runtime.reason === 'out_of_range'
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

    if (runtime.reason === 'missing_item') {
      showNotice(
        `Te falta ${stageItemGate?.requirement.label || 'un objeto'}. Fabrícalo en Mochila › Mesa de trabajo.`,
        'warn'
      )
      return
    }

    showNotice('Este nodo no está disponible todavía.', 'info')
  }

  /**
   * Envía el código del nodo. Devuelve true si el nodo quedó superado.
   *
   * Antes no devolvía nada y el escáner de QR daba por bueno el avance sin
   * mirar: si esta llamada se descartaba —el candado ocupado por otro envío en
   * marcha—, el jugador leía "nodo completado" y no había avanzado. Tenía que
   * escanear una segunda vez.
   *
   * Lo que decide vive en `avance/`: aquí sólo se conectan los cables que esa
   * decisión necesita del componente. Eran 341 líneas en medio de este fichero.
   */
  async function handleSubmitCode(
    code: string,
    timeSpentMs?: number,
    penaltyMs?: number,
    /** Escrito a mano en una casilla de respaldo. */
    aMano?: boolean
  ): Promise<boolean> {
    return enviarCodigo(
      {
        payload,
        currentStage,
        esColeccionable: isMapCollectible,
        claveDelNodo: claveDelNodo(),
        candado: submitLockRef,
        setSubmitting,
        setSubmitError,
        cerrarHoja: () => setInteractionOpen(false),

        sumarAlMarcador: (ms) => {
          setState((prev) => {
            if (prev.status !== 'ready') return prev
            const vivo = prev.payload.live_status || {}
            return {
              ...prev,
              payload: {
                ...prev.payload,
                live_status: {
                  ...vivo,
                  total_time_ms: Number(vivo.total_time_ms || 0) + ms,
                },
              },
            }
          })
        },

        ponerPartidaSinServidor: (payloadLocal) => {
          setState((prev) => ({
            status: 'ready',
            payload: payloadLocal,
            config: prev.status === 'ready' ? prev.config : { map_zoom: 16 },
          }))
          setMapRefreshToken((value) => value + 1)
        },

        refrescarPartida: refreshPayload,
        aviso: showNotice,
        pantalla: showOverlay,
      },
      { code, timeSpentMs, penaltyMs, aMano }
    )
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
        initialCenter={browserGpsPosition ?? (stagePosition ? { lat: stagePosition.lat, lon: stagePosition.lon } : undefined)}
        onUserMapMove={() => {
          setFollowPlayer(false)
          setRouteOverviewActive(false)
        }}
        nodeState={interactionOpen ? 'engaging' : runtime.canEnter ? 'ready' : 'locked'}
        otherPlayers={teamMapMarkers}
        fieldProofs={todasAsFotos}
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
        <PlayerShell payload={payload} currentStage={currentStage} />
      </div>

      <div style={getToastOverlayStyle(isPhone)}>
        <ToastNotice notice={uiNotice} />
      </div>

      {/*
        Mientras el avance esta EN VUELO, la linea callada lo dice.

        Medido con red lenta: el jugador pulsaba, se cerraba la historia y la
        pantalla no cambiaba en 11,8 segundos. El indicador de `submitting`
        existia, pero vive dentro del panel de interaccion, que para entonces ya
        se ha cerrado: en el mapa no quedaba ninguna senal, y doce segundos son
        de sobra para pensar que no ha funcionado y volver a pulsar.

        Va como expresion de render y NO como hook nuevo: `submitting` ya
        existe, y un hook detras de un `return` temprano tira esta pantalla
        entera con el error 310. Al resolverse el envio vuelve `uiQuiet`, que
        para entonces ya lleva el aviso de «superado sin conexion» si lo hubo.
      */}
      <div style={getQuietOverlayStyle(isPhone)}>
        <QuietNotice notice={submitting ? { message: 'Rexistrando…' } : uiQuiet} />
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


      {!interactionOpen && activePanel !== 'details' && !toolsOpen && !rankingOpen && !overlayState ? (
        <div className="saga-hud-quick" style={getMapQuickControlsStyle(isPhone)}>
          <QuickProofPanel
            user={user}
            mobile={isPhone}
            hidden={false}
            openSignal={quickQrOpenSignal}
            showLauncher={false}
            // El escáner manda sólo el tiempo de cámara; la penalización de 2
            // minutos por usar el respaldo se suma aquí, una sola vez.
            onRescueCode={(code, timeSpentMs) => handleSubmitCode(code, timeSpentMs, 120000, true)}
            activeQrPayload={
              String(
                (currentStage as any)?.qr_payload ||
                  (currentStage as any)?.config?.qr_payload ||
                  (currentStage as any)?.physical_qr?.payload ||
                  ''
              ) || null
            }
            onQrValidated={(code, timeSpentMs) => handleSubmitCode(code, timeSpentMs)}
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
              style={mapPrologueButton}
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
            style={rankingOpen ? mapQuickButtonActive : mapRouteToggleInlineButton}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openRanking()
            }}
            aria-label="Trofeo"
            title="Clasificación"
          >
            <span aria-hidden="true" style={mapQuickIcon}>
              🏆
            </span>
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
              background: 'rgba(var(--theme-ok-soft), 0.2)',
              borderColor: 'rgba(var(--theme-ok-soft), 0.4)',
              color: 'rgb(var(--theme-ok-soft))',
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
        /**
         * Sale también si falta algún permiso, aunque la misión ya esté
         * descargada: el jugador entraba sin flecha ni líneas y no había nada en
         * pantalla que dijese qué pasaba.
         *
         * `prepCerrada` manda sobre todo lo demás. Sin eso la tarjeta seguía
         * ahí mientras faltase un permiso, la X no hacía nada y no se podía
         * quitar de en medio: si el permiso de cámara fallaba, quedaba fija.
         */
        visible={
          !prepCerrada &&
          (offlinePrepVisible ||
            permisoMovimiento !== 'ok' ||
            permisoCamara !== 'ok') &&
          !payload.finished
        }
        mobile={isPhone}
        hasOfflineMission={hasOfflineMission}
        hasBrowserGps={hasBrowserGps}
        offlinePrepState={offlinePrepState}
        browserGpsStatus={browserGpsStatus}
        onPrepareOfflinePack={handlePrepareOfflinePack}
        onRequestGps={() => void handleRequestLiveGps({ forceFocus: true })}
        onDismiss={() => {
          setPrepCerrada(true)
          setOfflinePrepVisible(false)
        }}
        permisoCamara={permisoCamara}
        permisoMovimiento={permisoMovimiento}
        onRequestCamera={() => void pedirCamara()}
        onRequestMotion={() => void pedirMovimiento()}
      />

      {overlayState ? <CelebrationOverlay state={overlayState} /> : null}

      <UseItemOverlay
        open={Boolean(useItemPrompt)}
        label={useItemPrompt?.label || ''}
        itemId={useItemPrompt?.itemId || ''}
        onUsed={() => {
          usedItemStagesRef.current.add(String(currentStage?.id ?? currentStage?.title ?? ''))
          setUseItemPrompt(null)
          proceedToInteraction()
        }}
        onCancel={() => setUseItemPrompt(null)}
      />

      {payload.finished && !dismissedFinishScreen ? (
        <MissionCompleteScreen
          displayName={payload.display_name || payload.user}
          selfUser={payload.user}
          players={rankingPlayers}
          totalNodes={payload.stages?.length || 0}
          photoCount={todasAsFotos.filter((p) => p.user === payload.user).length || 0}
          onDismiss={() => setDismissedFinishScreen(true)}
          onExit={() => window.location.assign('/')}
        />
      ) : null}

      <div style={getBottomOverlayStyle(isPhone)}>
        {/*
          Se esconde con cualquier pantalla encima: la clasificación, la mochila
          o la hoja del reto lo taparían a medias, que es justo el estorbo que
          tenía cuando vivía pegado al botón del nodo.
        */}
        {qrPayloadActual && !interactionOpen && !rankingOpen && activePanel !== 'details' ? (
          <QrScanClock ms={qrMs} />
        ) : null}

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
          toolsOpen={toolsOpen}
          playerHref={playerHref}
          adminHref={adminHref}
          primaryLabel={primaryLabel}
          primaryTone={runtime.primaryTone}
          primaryDisabled={primaryDisabled}
          primaryReason={runtime.reason}
          helperText={hudHelperText}
          detailsOpen={activePanel === 'details'}
          onPrimaryAction={handlePrimaryAction}
          onToggleDetails={() => togglePanel('details')}
          onOpenTools={openTools}
          onCloseTools={closeTools}
          onToggleDebug={handleToggleDebug}
          onDownloadFieldProofs={handleDownloadFieldProofs}
          fieldPhotoCount={todasAsFotos.length}
          submitting={submitting}
          errorMessage={submitError}
          onSubmitCode={handleSubmitCode}
        />
      </div>

      <RankingSheet open={rankingOpen} players={rankingPlayers} onClose={closeRanking} />

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
        totalTimeMs={payload.live_status?.total_time_ms || 0}
        appPosition={displayPosition}
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
          buttonText="Comezar a travesía"
          onClose={() => setShowPrologue(false)}
        />
      )}

      {activeStageIntro && currentStage && (
        <StoryModal
          title={currentStage.intro_title || currentStage.title || 'Historia'}
          body={currentStage.intro_body || ''}
          buttonText={isCheckpointStage ? 'Rexistrar o paso' : 'Continuar á proba'}
          onClose={() => {
            setActiveStageIntro(false)
            if (isCheckpointStage) {
              // Leer no es un reto: el punto de control se registra sin tiempo.
              void handleSubmitCode('OK', 0)
            } else {
              openInteraction()
            }
          }}
        />
      )}
    </ScreenFrame>
  )
}

const mapRouteToggleInlineButton: CSSProperties = {
  width: 44,
  height: 40,
  minWidth: 44,
  minHeight: 40,
  padding: 0,
  borderRadius: 18,
  border: '1px solid rgba(255, 255, 255, 0.18)',
  background: 'rgba(255, 255, 255, 0.10)',
  color: '#f1f5f9',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 900,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  textShadow: '0 1px 4px rgba(0,0,0,.5)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
  position: 'relative',
  overflow: 'hidden',
  pointerEvents: 'auto',
  touchAction: 'manipulation',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background 0.15s ease, border-color 0.15s ease',
}

const mapPrologueButton: CSSProperties = {
  ...mapRouteToggleInlineButton,
}

const mapQuickButtonActive: CSSProperties = {
  ...mapRouteToggleInlineButton,
  background: 'rgba(var(--theme-info), 0.28)',
  border: '1px solid rgba(var(--theme-info), 0.55)',
  color: '#bae6fd',
  boxShadow: '0 0 12px rgba(var(--theme-info), 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
}

const mapQuickIcon: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 17,
  lineHeight: 1,
  filter: 'drop-shadow(0 1px 3px rgba(var(--theme-ink), .24))',
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
  background: 'rgba(var(--theme-ink), .56)',
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

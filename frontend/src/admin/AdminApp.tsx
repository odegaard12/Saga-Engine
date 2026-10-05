import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import AdminMissionControlShell from './components/AdminMissionControlShell'
import { fetchPublicConfig } from '../shared/api'
import type { PublicConfig } from '../types/player'
import {
  fetchAdminReactOverview,
  fetchAdminStages,
  changeAdminPassword,
  loginAdmin,
  logoutAdmin,
  saveAdminConfig,
  saveAdminStages,
  runAdminProfileAction,
  type AdminProfileAction,
  type AdminReactOverviewProfile,
  type AdminReactOverviewResponse,
  type AdminReactOverviewStage,
} from './lib/adminApi'
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  describeAdminError,
  formatWait,
  isAdminHttpError,
  isPasswordChangeRequired,
  lockoutSeconds,
} from './lib/adminErrors'
import { familyCards, type EditableAdminStage } from './lib/familyConfigs'
import {
  getDefaultAdminStagePatchForGame,
  getMissionTemplateById,
  type MissionTemplateId,
} from './lib/gameCatalog'
import {
  MAX_PLAYER_PROFILES,
  buildPlayerDrafts,
  findDuplicatePlayerIds,
  findOrphanedPlayerIds,
  normalizePlayerMode,
  savedPlayerId,
  type PlayerDraft,
} from './lib/playerDrafts'
import {
  applyLocalIdMap,
  hydrateStagesFromRaw,
  localIdMap,
  stageSaveIdentity,
} from './lib/adminStagePersistence'
import { runStagesSave } from './lib/adminSaveFlow'
import { markEditedFields } from './lib/stageFields'
import {
  clearAdminDrafts,
  describeDraftAge,
  draftHasContent,
  isDraftFresh,
  readAdminDrafts,
  writeAdminDrafts,
  type AdminDraftBundle,
} from './lib/adminDrafts'
import {
  confirmationForStructuralChange,
  playersBlockedByNewLaunch,
  playersPastIndex,
} from './lib/adminRouteGuards'
import {
  readMapSettings,
  verifyMissionSettingsSaved,
  verifyPlayersSaved,
} from './lib/adminConfigVerify'
import { mergeServerPeople, withoutMissionPass } from './lib/adminOverview'
import { getStablePlayerColor, getPlayerInitials } from '../shared/playerIdentity'
import { TEMA_POR_DEFECTO } from '../shared/tema'
import { styles } from './adminStyles'
import {
  buildTemplatePhysicalFields,
  fechaConZona,
  fechaParaElInput,
  preservePhysicalStageFields,
  slugifyMissionItemId,
} from './lib/adminHelpers'

type LoadState = 'loading' | 'ready' | 'error'
type OverviewState = 'locked' | 'loading' | 'ready' | 'error'
type CmsPanel =
  | 'none'
  | 'players'
  | 'mission'
  | 'labels'
  | 'builder'
  | 'objects'
  | 'simulation'
  | 'activity'
  | 'match-log'
  | 'desbloqueables'
  | 'tiempos'
  | 'exportar'

const HYDRATION_WARNING =
  'Atención: no se pudo leer el detalle de los nodos guardados, así que los editores pueden enseñar vacíos ' +
  'el requisito de mochila y el código de emergencia. No se pierde nada al guardar, pero no toques esos campos ' +
  'hasta recargar la misión.'

/** Baja un fichero JSON desde el navegador (copias de lo que está sin guardar). */
function descargarJson(nombre: string, datos: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
  )
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}

/**
 * Mezcla la configuración pública releída con la que ya hay, SIN tocar
 * `players` ni `player_profiles`: la pública trae las fichas sin fotos, y
 * pisar con ellas las del panel haría que guardar jugadores borrase las fotos.
 */
function mergePublicConfig(
  actual: PublicConfig | null,
  nueva: object | null | undefined
): PublicConfig {
  const resto = { ...((nueva || {}) as Record<string, unknown>) }
  delete resto.player_profiles
  delete resto.players
  return { ...(actual || {}), ...resto } as PublicConfig
}

export default function AdminApp() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [overview, setOverview] = useState<AdminReactOverviewResponse | null>(null)
  const [overviewState, setOverviewState] = useState<OverviewState>('locked')
  const [overviewError, setOverviewError] = useState<string | null>(null)
  /**
   * El servidor pide cambiar la contraseña (la de fábrica o una débil). Antes
   * no había pantalla para eso: el login decía "ok", el panel respondía
   * "password_change_required" y sólo se veía "Access denied", sin salida.
   */
  const [cambioClave, setCambioClave] = useState<{ actual: string } | null>(null)
  const [claveNueva, setClaveNueva] = useState('')
  const [claveRepetida, setClaveRepetida] = useState('')
  const [claveActualCampo, setClaveActualCampo] = useState('')
  const [cambioClaveError, setCambioClaveError] = useState<string | null>(null)
  const [cambiandoClave, setCambiandoClave] = useState(false)
  const [selectedStage, setSelectedStage] = useState<AdminReactOverviewStage | null>(null)
  const [cmsPanel, setCmsPanel] = useState<CmsPanel>('none')
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'dirty'>(
    'idle'
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const [settingsSaveState, setSettingsSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null)
  const [missionDraft, setMissionDraft] = useState<Record<string, string>>({})
  const [playerDrafts, setPlayerDrafts] = useState<PlayerDraft[]>([])
  const [playerSaveState, setPlayerSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const [playerSaveError, setPlayerSaveError] = useState<string | null>(null)
  const [profileActionState, setProfileActionState] = useState<Record<string, string>>({})
  const [profileActionError, setProfileActionError] = useState<Record<string, string>>({})
  const suppressStageSelectUntilRef = useRef(0)

  // Otra pestaña o persona guardó la misión antes que tú (409): no se pisa.
  const [saveConflict, setSaveConflict] = useState(false)
  // Borradores de jugadores y de ajustes con cambios sin guardar. Mientras lo
  // estén, recargar la vista NO los sobrescribe (informe A16).
  const [playersDirty, setPlayersDirty] = useState(false)
  const [missionDirty, setMissionDirty] = useState(false)
  // Aviso en la pantalla de entrada (sesión caducada, sesión cerrada...).
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)
  // Bloqueo de acceso tras demasiados intentos: hasta cuándo (ms) y el reloj que lo cuenta.
  const [loginLockedUntil, setLoginLockedUntil] = useState(0)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const overviewRef = useRef<AdminReactOverviewResponse | null>(null)
  overviewRef.current = overview
  const saveInFlightRef = useRef(false)
  // Cuenta cambios hechos a los nodos: sirve para saber si se editó MIENTRAS se guardaba.
  const editCounterRef = useRef(0)
  const sessionExpiredRef = useRef(false)
  const pendingRestoreRef = useRef<AdminDraftBundle | null>(null)
  const latestRef = useRef({
    overview,
    saveState,
    playersDirty,
    missionDirty,
    playerDrafts,
    missionDraft,
  })
  latestRef.current = {
    overview,
    saveState,
    playersDirty,
    missionDirty,
    playerDrafts,
    missionDraft,
  }

  useEffect(() => {
    let cancelled = false

    fetchPublicConfig()
      .then((payload) => {
        if (cancelled) return
        setConfig(payload)
        setState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unknown error')
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const profiles = useMemo(() => overview?.profiles || [], [overview])
  const stages = overview?.stages || []
  // Las tarjetas de familia del panel usan las 5 familias de PRESENTACIÓN
  // (displayFamilies.ts), no las 5 técnicas del runtime. Si un backend viejo
  // todavía no manda display_family_counts, cae a family_counts para no
  // dejar los chips en blanco.
  const familyCounts =
    overview?.counts?.display_family_counts || overview?.counts?.family_counts || {}
  const overviewReady = overviewState === 'ready' && Boolean(overview)

  const title =
    overview?.config?.admin_title || config?.admin_title || config?.site_name || 'SAGA Admin'
  const subtitle = overview?.config?.admin_subtitle || config?.admin_subtitle || 'Mission Control'

  // Los borradores de jugadores y de ajustes se construyen cuando LLEGAN datos
  // del servidor (al entrar y al recargar: `applyEnteredOverview`,
  // `refreshOverview`), no cada vez que cambia `overview`. Antes un efecto los
  // reconstruía con cada cambio de la vista -mover un nodo, pulsar «+1 nodo» de
  // un jugador- y pisaba lo que se estuviera escribiendo (informe A16).

  // La sesión caducó (403) en cualquier panel: vuelta al login SIN perder trabajo.
  const sessionExpiredHandlerRef = useRef<() => void>(() => undefined)
  sessionExpiredHandlerRef.current = handleSessionExpired
  useEffect(() => {
    const alCaducar = () => sessionExpiredHandlerRef.current()
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, alCaducar)
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, alCaducar)
  }, [])

  // Hay algo sin guardar: nodos, jugadores o ajustes.
  const hasUnsavedWork =
    saveState === 'dirty' || saveState === 'error' || playersDirty || missionDirty

  // Copia del trabajo sin guardar en esta pestaña (sessionStorage): si la sesión
  // caduca o se recarga por error, se puede recuperar al volver a entrar. Se
  // borra sola cuando no queda nada pendiente.
  useEffect(() => {
    if (!overviewReady) return undefined
    if (!hasUnsavedWork) {
      clearAdminDrafts()
      return undefined
    }
    const temporizador = window.setTimeout(() => {
      const bundle = buildDraftBundle('auto')
      if (bundle) writeAdminDrafts(bundle)
    }, 700)
    return () => window.clearTimeout(temporizador)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewReady, overview, hasUnsavedWork, playerDrafts, missionDraft])

  // Cuenta atrás del bloqueo de acceso (429).
  useEffect(() => {
    if (loginLockedUntil <= Date.now()) return undefined
    const reloj = window.setInterval(() => {
      const ahora = Date.now()
      setNowTick(ahora)
      if (ahora >= loginLockedUntil) window.clearInterval(reloj)
    }, 1000)
    return () => window.clearInterval(reloj)
  }, [loginLockedUntil])
  const loginLockedSeconds = Math.max(0, Math.ceil((loginLockedUntil - nowTick) / 1000))

  useMemo(() => {
    const counts = overview?.counts
    const cfg = overview?.config || config
    const players = counts?.players ?? (Array.isArray(config?.players) ? config.players.length : 0)
    const profileCount =
      counts?.profiles ??
      (Array.isArray(config?.player_profiles) ? config.player_profiles.length : 0)
    const stageCount = counts?.stages ?? 0
    const finished = counts?.finished_profiles ?? 0
    const mapCenter = Array.isArray(cfg?.map_center) ? cfg.map_center.join(', ') : 'Not configured'
    const mapZoom = cfg?.map_zoom ?? '—'

    void [stageCount, finished, mapCenter, mapZoom]
  }, [overview, config])

  function selectLocalStage(stage: AdminReactOverviewStage | null) {
    if (stage && Date.now() < suppressStageSelectUntilRef.current) {
      return
    }

    setSelectedStage(stage)
  }

  function getConfigTextValue(source: Record<string, unknown>, key: string, fallback = '') {
    const value = source[key]
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    return fallback
  }

  function buildMissionDraft(source: Record<string, unknown>) {
    const center = Array.isArray(source.map_center) ? source.map_center : config?.map_center
    const centerLat = Array.isArray(center) ? center[0] : 40.4168
    const centerLon = Array.isArray(center) ? center[1] : -3.7038

    return {
      site_name: getConfigTextValue(source, 'site_name', config?.site_name || ''),
      admin_title: getConfigTextValue(source, 'admin_title', config?.admin_title || ''),
      admin_subtitle: getConfigTextValue(source, 'admin_subtitle', config?.admin_subtitle || ''),
      login_title: getConfigTextValue(source, 'login_title', ''),
      login_subtitle: getConfigTextValue(source, 'login_subtitle', ''),
      login_instructions: getConfigTextValue(source, 'login_instructions', ''),
      story_title: getConfigTextValue(source, 'story_title', ''),
      story_text: getConfigTextValue(source, 'story_text', ''),
      prologue_title: getConfigTextValue(source, 'prologue_title', ''),
      prologue_subtitle: getConfigTextValue(source, 'prologue_subtitle', ''),
      prologue_image_url: getConfigTextValue(source, 'prologue_image_url', ''),
      prologue_body: getConfigTextValue(source, 'prologue_body', ''),
      mission_launch_at: fechaParaElInput(getConfigTextValue(source, 'mission_launch_at', '')),
      player_theme: getConfigTextValue(
        source,
        'player_theme',
        config?.player_theme || TEMA_POR_DEFECTO
      ),
      // Sólo lo da la vista de administración (react-overview), no /api/config.
      require_server_proximity:
        (source as Record<string, unknown> | null)?.require_server_proximity === true ||
        (config as unknown as Record<string, unknown> | null)?.require_server_proximity === true
          ? 'true'
          : 'false',
      mapbox_token: getConfigTextValue(source, 'mapbox_token', config?.mapbox_token || ''),
      mapbox_style: getConfigTextValue(source, 'mapbox_style', config?.mapbox_style || ''),
      map_center_lat: String(centerLat ?? 40.4168),
      map_center_lon: String(centerLon ?? -3.7038),
      map_zoom: getConfigTextValue(source, 'map_zoom', String(config?.map_zoom || 13)),
    }
  }

  function updateMissionDraft(key: string, value: string) {
    setMissionDraft((current) => ({
      ...current,
      [key]: value,
    }))
    setSettingsSaveState('idle')
    setMissionDirty(true)
  }

  /**
   * Lo que se manda al guardar los AJUSTES: solo los campos de este panel.
   *
   * Antes viajaba la configuración entera (con la lista de jugadores y sus
   * fotos) copiada del estado del panel. Si ese estado era viejo -otra persona
   * había cambiado jugadores o ajustes mientras tanto-, guardar un ajuste
   * pisaba también todo eso. Y el centro y el zoom del mapa vacíos se mandaban
   * como `0` (informe A18); ahora un campo vacío no se manda y uno absurdo no se
   * guarda. El servidor conserva lo que no le llega.
   */
  function buildMissionConfigPayload(): { payload?: Record<string, unknown>; error?: string } {
    const mapa = readMapSettings(missionDraft)
    if (mapa.error) return { error: mapa.error }

    const payload: Record<string, unknown> = {
      site_name: missionDraft.site_name || 'SAGA Engine',
      admin_title: missionDraft.admin_title || 'Mission editor',
      admin_subtitle: missionDraft.admin_subtitle || 'Map-first control panel',
      login_title: missionDraft.login_title || '',
      login_subtitle: missionDraft.login_subtitle || '',
      login_instructions: missionDraft.login_instructions || '',
      prologue_title: missionDraft.prologue_title || '',
      prologue_subtitle: missionDraft.prologue_subtitle || '',
      prologue_image_url: missionDraft.prologue_image_url || '',
      prologue_body: missionDraft.prologue_body || '',
      player_theme: missionDraft.player_theme || TEMA_POR_DEFECTO,
      mapbox_token: missionDraft.mapbox_token || '',
      mapbox_style: missionDraft.mapbox_style || '',
      require_server_proximity: missionDraft.require_server_proximity === 'true',
    }

    // La fecha de salida se lee de la configuración pública, no de la vista de
    // administración. Si esa lectura falló al abrir el panel, el campo está vacío
    // POR FALTA DE DATO, no porque se haya borrado: mandarlo así quitaría la fecha
    // y desbloquearía la misión. (El texto de historia ya no viaja: este panel no
    // lo edita y mandarlo vacío lo borraba.)
    if (config) {
      payload.mission_launch_at = fechaConZona(missionDraft.mission_launch_at || '')
    }

    if (mapa.center) payload.map_center = mapa.center
    if (mapa.zoom !== undefined) payload.map_zoom = mapa.zoom

    // La clave de misión sólo viaja si el admin escribió una nueva. Vacío =
    // no se toca (el servidor la deja como está).
    const missionPassInput = (missionDraft.mission_pass || '').trim()
    if (missionPassInput) {
      payload.mission_pass = missionPassInput
    }

    return { payload }
  }

  async function clearMissionPassword() {
    if (
      !window.confirm(
        'Quitar la clave de misión: los jugadores ya no tendrán que escribirla y cualquiera que ' +
          'sepa un nombre podrá entrar. Si la vuelves a poner, tendrás que anotar una nueva (la ' +
          'actual no se puede volver a ver). ¿Seguro?'
      )
    ) {
      return
    }

    setSettingsSaveState('saving')
    setSettingsSaveError(null)
    try {
      // Solo esa clave: quitarla no debe guardar de paso otros ajustes a medio escribir.
      const saved = await saveAdminConfig(undefined, { mission_pass: '' })
      if (saved.status !== 'ok') {
        throw new Error(saved.message || 'No se pudo quitar la contraseña.')
      }
      const refreshed = await fetchAdminReactOverview()
      if (refreshed.status === 'ok') {
        if (refreshed.config?.mission_pass_enabled) {
          throw new Error('El servidor sigue teniendo activa la contraseña de misión.')
        }
        setOverview((current) => mergeServerPeople(current, refreshed))
      }
      setMissionDraft((current) => ({ ...current, mission_pass: '' }))
      setSettingsSaveState('saved')
      setLocalNotice('Contraseña de misión quitada: la entrada ya no la pide.')
    } catch (error) {
      setSettingsSaveState('error')
      setSettingsSaveError(describeAdminError(error, 'guardar'))
    }
  }

  async function saveMissionSettings() {
    setSettingsSaveError(null)

    const construido = buildMissionConfigPayload()
    if (!construido.payload) {
      setSettingsSaveState('error')
      setSettingsSaveError(construido.error || 'Revisa los ajustes antes de guardar.')
      return
    }
    const payload = construido.payload

    // Una fecha de salida FUTURA en plena partida bloquea a todos hasta esa hora
    // (nadie puede completar un nodo), y hasta ahora se guardaba sin preguntar.
    const bloqueados = playersBlockedByNewLaunch(
      String((config as unknown as Record<string, unknown> | null)?.mission_launch_at || ''),
      String(payload.mission_launch_at || ''),
      profiles
    )
    if (bloqueados.length > 0) {
      const nombres = bloqueados
        .slice(0, 6)
        .map((jugador) => jugador.display_name || jugador.id)
        .join(', ')
      const seguir = window.confirm(
        `Vas a poner la salida en el futuro (${new Date(String(payload.mission_launch_at)).toLocaleString('es-ES')}) ` +
          `y hay ${bloqueados.length} jugador(es) ya en partida (${nombres}${bloqueados.length > 6 ? '…' : ''}).\n\n` +
          'Hasta esa hora NADIE podrá completar ningún nodo, tampoco ellos. ¿Guardar la fecha igualmente?'
      )
      if (!seguir) {
        setSettingsSaveState('idle')
        setLocalNotice('Ajustes sin guardar: cancelaste la nueva fecha de salida.')
        return
      }
    }

    // Una clave nueva: se enseña UNA vez, aquí, porque después no se puede volver a ver.
    if (typeof payload.mission_pass === 'string' && payload.mission_pass) {
      const seguir = window.confirm(
        `La clave de la misión será:\n\n    ${payload.mission_pass}\n\n` +
          'Los jugadores tendrán que escribir esta clave para entrar. Anótala ahora: ' +
          'no se puede volver a ver. Quien ya esté dentro tendrá que escribirla otra vez. ¿Guardar?'
      )
      if (!seguir) {
        setSettingsSaveState('idle')
        setLocalNotice('Ajustes sin guardar: no se ha cambiado la clave.')
        return
      }
    }

    setSettingsSaveState('saving')

    try {
      const saved = await saveAdminConfig(undefined, payload)

      if (saved.status !== 'ok') {
        throw new Error(saved.message || 'No se pudieron guardar los ajustes.')
      }

      // Un «ok» del servidor no prueba que se guardara: se relee y se compara.
      const [refreshed, publica] = await Promise.all([
        fetchAdminReactOverview(),
        fetchPublicConfig().catch(() => null),
      ])
      if (refreshed.status !== 'ok') {
        throw new Error(
          'Los ajustes se enviaron, pero no se pudieron releer para comprobar que se guardaron.'
        )
      }

      const desajustes = verifyMissionSettingsSaved(
        payload,
        (refreshed.config || undefined) as Record<string, unknown> | undefined,
        publica as unknown as Record<string, unknown> | null
      )
      if (desajustes.length > 0) {
        throw new Error(
          `El servidor no guardó exactamente lo enviado (${desajustes.join(', ')}). Recarga el panel y revísalo.`
        )
      }

      setConfig((current) => mergePublicConfig(current, publica ?? payload))
      setOverview((current) => mergeServerPeople(current, refreshed))
      setMissionDraft(
        buildMissionDraft({
          ...((config || {}) as unknown as Record<string, unknown>),
          ...payload,
          ...((refreshed.config || {}) as unknown as Record<string, unknown>),
        })
      )
      setMissionDirty(false)
      setSettingsSaveState('saved')
      setLocalNotice('Ajustes guardados y verificados en el servidor.')
    } catch (err) {
      setSettingsSaveState('error')
      setSettingsSaveError(describeAdminError(err, 'guardar'))
    }
  }

  function updatePlayerDraft(index: number, key: keyof PlayerDraft, value: string) {
    setPlayerDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index
          ? {
              ...draft,
              [key]: key === 'mode' ? normalizePlayerMode(value) : value,
            }
          : draft
      )
    )
    setPlayerSaveState('idle')
    setPlayersDirty(true)
  }

  function addPlayerDraft() {
    setPlayerDrafts((current) => {
      // Un nombre que no choque con los que ya hay (tras borrar uno, «PLAYER n»
      // podía repetirse y el servidor descartaba la ficha nueva).
      const usados = new Set(current.map((draft, index) => savedPlayerId(draft, index)))
      let numero = current.length + 1
      while (usados.has(`PLAYER ${numero}`)) numero += 1
      const fallbackName = `PLAYER ${numero}`

      return [
        ...current,
        {
          id: fallbackName,
          display_name: fallbackName,
          mode: 'solo',
          members: '',
          status: 'active',
          color: getStablePlayerColor(fallbackName),
          avatar_url: '',
          avatar_initials: getPlayerInitials(fallbackName),
        },
      ]
    })
    setPlayerSaveState('idle')
    setPlayersDirty(true)
    setLocalNotice('Jugador añadido en local. Pulsa Guardar jugadores para persistir.')
  }

  function deletePlayerDraft(index: number) {
    const draft = playerDrafts[index]
    if (!draft) return

    // Antes se borraba a la primera pulsación, sin preguntar, con un solo botón
    // al lado de «Editar».
    const id = savedPlayerId(draft, index)
    const guardado = profiles.find((profile) => String(profile.id) === id)
    const objetos = Array.isArray(guardado?.inventory_snapshot?.items)
      ? guardado?.inventory_snapshot.items.length
      : 0
    const detalle = guardado
      ? ` Va por el nodo ${(guardado.level ?? 0) + 1} de ${stages.length}${
          objetos ? ` y lleva ${objetos} objeto(s) en la mochila` : ''
        }.`
      : ''

    const seguir = window.confirm(
      `¿Eliminar a «${draft.display_name || id}» (ID ${id})?${detalle}\n\n` +
        'Se quitará de la lista al pulsar «Guardar jugadores». Su progreso y su mochila se quedan en el ' +
        'servidor pero sin jugador: si más adelante creas otro con el mismo ID, los heredará.'
    )
    if (!seguir) return

    setPlayerDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index))
    setPlayerSaveState('idle')
    setPlayersDirty(true)
    setLocalNotice('Jugador eliminado en local. Pulsa Guardar jugadores para persistir.')
  }

  /**
   * Lo que se manda al guardar los JUGADORES: solo la lista de jugadores y sus
   * fichas. Antes viajaba también la configuración entera copiada del panel, y
   * unos ajustes viejos pisaban los que otra persona acababa de guardar.
   */
  function buildPlayerConfigPayload() {
    const normalizedDrafts = playerDrafts.map((draft, index) => {
      const id = savedPlayerId(draft, index)
      const displayName = draft.display_name.trim() || id
      const members = draft.members
        .split(',')
        .map((member) => member.trim())
        .filter(Boolean)

      return {
        id,
        display_name: displayName,
        mode: normalizePlayerMode(draft.mode),
        members,
        status: draft.status.trim() || 'active',
        color: draft.color || getStablePlayerColor(id || displayName),
        avatar_url: draft.avatar_url.trim(),
        avatar_initials: (draft.avatar_initials.trim() || getPlayerInitials(displayName))
          .slice(0, 3)
          .toUpperCase(),
      }
    })

    return {
      players: normalizedDrafts.map((draft) => draft.id),
      player_profiles: normalizedDrafts.map((draft) => ({
        id: draft.id,
        display_name: draft.display_name,
        mode: draft.mode,
        ...(draft.mode === 'team' && draft.members.length > 0 ? { members: draft.members } : {}),
        status: draft.status,
        color: draft.color,
        avatar_url: draft.avatar_url,
        avatar_initials: draft.avatar_initials,
      })),
    }
  }

  async function runPlayerProfileAction(profileId: string, action: AdminProfileAction) {
    const cleanId = profileId.trim()
    if (!cleanId) {
      setLocalNotice('No se puede actuar sobre un jugador sin ID guardado.')
      return
    }

    const accionBase = String(action).split(':')[0]
    // Antes todo lo que no fuera reset/retroceder/avanzar se llamaba «marcar como
    // finalizado» (vaciar la mochila, entregar un objeto...).
    const actionLabel =
      accionBase === 'reset_profile'
        ? 'resetear la partida'
        : accionBase === 'level_prev'
          ? 'retroceder 1 nodo'
          : accionBase === 'level_next'
            ? 'avanzar 1 nodo'
            : accionBase === 'restore_node'
              ? 'restaurar el nodo anterior'
              : accionBase === 'clear_inventory'
                ? 'vaciar la mochila'
                : accionBase === 'give_item'
                  ? 'entregar un objeto'
                  : accionBase === 'remove_item'
                    ? 'quitar un objeto'
                    : 'marcar como finalizado'
    const hechoLabel =
      accionBase === 'reset_profile'
        ? 'reinicio de la partida'
        : accionBase === 'level_prev'
          ? 'retroceso de 1 nodo'
          : accionBase === 'level_next'
            ? 'avance de 1 nodo'
            : accionBase === 'restore_node'
              ? 'nodo restaurado'
              : accionBase === 'clear_inventory'
                ? 'mochila vaciada'
                : accionBase === 'give_item'
                  ? 'objeto entregado'
                  : accionBase === 'remove_item'
                    ? 'objeto retirado'
                    : 'partida marcada como finalizada'

    const dangerous =
      action === 'reset_profile' || action === 'mark_finished' || action === 'level_prev'

    if (dangerous && !window.confirm(`¿Seguro que quieres ${actionLabel} para ${cleanId}?`)) {
      return
    }

    // Se guarda QUÉ acción está en curso, no un genérico 'running': así sólo se
    // apaga el botón pulsado y el resto siguen disponibles.
    setProfileActionState((current) => ({ ...current, [cleanId]: action }))
    setProfileActionError((current) => ({ ...current, [cleanId]: '' }))

    // UI optimista: en el monte, con mala cobertura, la petición puede tardar
    // varios segundos. Sin esto no había ninguna señal de que el botón se
    // hubiera pulsado y se acababa pulsando varias veces.
    const optimisticDelta = action === 'level_next' ? 1 : action === 'level_prev' ? -1 : 0
    let rollbackOverview: AdminReactOverviewResponse | null = null

    if (optimisticDelta !== 0) {
      setOverview((current) => {
        if (!current) return current
        rollbackOverview = current
        return {
          ...current,
          profiles: (current.profiles || []).map((profile) =>
            String(profile.id).trim() === cleanId
              ? {
                  ...profile,
                  level: Math.max(0, Number(profile.level ?? 0) + optimisticDelta),
                }
              : profile
          ),
        }
      })
    }

    try {
      const result = await runAdminProfileAction(cleanId, action)

      if (result.status !== 'ok') {
        throw new Error(result.detail || result.message || 'No se pudo actualizar el progreso.')
      }

      // El nivel que manda es el que devuelve la acción, y se aplica ANTES de
      // refrescar. La recarga completa puede tardar o traer datos de hace un
      // instante, y mientras tanto la ficha seguía enseñando el nodo anterior:
      // salía "✓ Aplicado" con "Nodo 1 de 10" y sólo se corregía cerrando y
      // abriendo el panel.
      if (typeof result.level === 'number') {
        const nivelReal = result.level
        setOverview((current) => {
          if (!current) return current
          return {
            ...current,
            profiles: (current.profiles || []).map((profile) =>
              String(profile.id).trim() === cleanId
                ? {
                    ...profile,
                    level: nivelReal,
                    finished: nivelReal >= (current.stages || []).length,
                  }
                : profile
            ),
          }
        })
      }

      const refreshed = await fetchAdminReactOverview()
      if (refreshed.status === 'ok') {
        // Solo jugadores y fichas: los nodos que se estén editando (sin guardar)
        // NO se sustituyen por los del servidor.
        setOverview((current) => mergeServerPeople(current, refreshed))
        if (!latestRef.current.playersDirty) {
          setPlayerDrafts(
            buildPlayerDrafts(refreshed.profiles || [], {
              ...((config || {}) as unknown as Record<string, unknown>),
              ...((refreshed.config || {}) as unknown as Record<string, unknown>),
              ...(Array.isArray(refreshed.player_profiles)
                ? { player_profiles: refreshed.player_profiles }
                : {}),
            } as PublicConfig)
          )
        }
      }

      setProfileActionState((current) => ({ ...current, [cleanId]: `saved:${action}` }))
      // El servidor ya lo tiene; el móvil lo adopta en su próxima conexión (el
      // servidor sube su marca `reset_at`). «Aplicado» prometía más de lo cierto.
      const cambioDeNivel =
        typeof result.previous_level === 'number' &&
        typeof result.level === 'number' &&
        result.previous_level !== result.level
          ? ` (nivel ${result.previous_level} → ${result.level})`
          : ''
      setLocalNotice(
        `${cleanId}: ${hechoLabel} guardado en el servidor${cambioDeNivel}. El móvil lo aplicará en su próxima conexión.`
      )
    } catch (err) {
      const message = describeAdminError(err)
      // Se deshace el avance optimista: el nivel mostrado no puede quedar
      // por delante del que tiene realmente el servidor.
      if (rollbackOverview) setOverview(rollbackOverview)
      setProfileActionState((current) => ({ ...current, [cleanId]: 'error' }))
      setProfileActionError((current) => ({ ...current, [cleanId]: message }))
      setLocalNotice(`${cleanId}: no se pudo aplicar. ${message} Pulsa para reintentar.`)
    }
  }

  async function savePlayerProfiles() {
    setPlayerSaveError(null)

    // 1. Lo que el servidor descartaría en silencio, se dice ANTES.
    if (playerDrafts.length > MAX_PLAYER_PROFILES) {
      setPlayerSaveState('error')
      setPlayerSaveError(
        `Hay ${playerDrafts.length} jugadores y el servidor admite ${MAX_PLAYER_PROFILES} como mucho: el resto se perdería.`
      )
      return
    }

    const repetidos = findDuplicatePlayerIds(playerDrafts)
    if (repetidos.length > 0) {
      setPlayerSaveState('error')
      setPlayerSaveError(
        `Hay IDs repetidos: ${repetidos.map((id) => `«${id}»`).join(', ')}. Cada jugador necesita un ID distinto; ` +
          'con dos iguales el servidor se quedaría solo con el primero y tiraría la otra ficha.'
      )
      return
    }

    // 2. Quien deja de existir (borrado o con el ID cambiado) deja su progreso sin dueño.
    const huerfanos = findOrphanedPlayerIds(
      profiles.map((profile) => String(profile.id)),
      playerDrafts
    )
    if (huerfanos.length > 0) {
      const detalle = huerfanos
        .slice(0, 8)
        .map((id) => {
          const perfil = profiles.find((profile) => String(profile.id) === id)
          return perfil
            ? `• ${perfil.display_name || id} (ID ${id}, nodo ${(perfil.level ?? 0) + 1})`
            : `• ${id}`
        })
        .join('\n')
      const seguir = window.confirm(
        `Este guardado deja sin jugador el progreso de ${huerfanos.length} ID(s):\n\n${detalle}\n\n` +
          'Su nivel, sus tiempos y su mochila se quedan en el servidor pero ya no los ve nadie. ' +
          'Si solo querías cambiar el nombre que se ve, usa «Display name» en vez del ID. ¿Guardar igualmente?'
      )
      if (!seguir) {
        setPlayerSaveState('idle')
        setLocalNotice('Jugadores sin guardar: cancelaste el cambio de IDs.')
        return
      }
    }

    setPlayerSaveState('saving')

    try {
      const payload = buildPlayerConfigPayload()
      const saved = await saveAdminConfig(undefined, payload)

      if (saved.status !== 'ok') {
        throw new Error(saved.message || 'No se pudieron guardar los jugadores.')
      }

      // Un «ok» del servidor no prueba que se guardara: se relee y se compara.
      const refreshed = await fetchAdminReactOverview()
      if (refreshed.status !== 'ok') {
        throw new Error(
          'Los jugadores se enviaron, pero no se pudieron releer para comprobar que se guardaron.'
        )
      }

      const desajustes = verifyPlayersSaved(
        payload.player_profiles as unknown as Array<Record<string, unknown>>,
        refreshed.player_profiles
      )
      if (desajustes.length > 0) {
        throw new Error(
          `El servidor no guardó exactamente lo enviado: ${desajustes.slice(0, 5).join(', ')}.`
        )
      }

      setOverview((current) => mergeServerPeople(current, refreshed))
      setConfig((current) => ({
        ...(current || {}),
        players: payload.players,
        player_profiles: (refreshed.player_profiles ||
          payload.player_profiles) as unknown as PublicConfig['player_profiles'],
      }))
      setPlayerDrafts(
        buildPlayerDrafts(refreshed.profiles || [], {
          ...((config || {}) as unknown as Record<string, unknown>),
          player_profiles: refreshed.player_profiles || payload.player_profiles,
        } as unknown as PublicConfig)
      )

      setPlayersDirty(false)
      setPlayerSaveState('saved')
      setLocalNotice('Jugadores guardados y verificados en el servidor.')
    } catch (err) {
      setPlayerSaveState('error')
      setPlayerSaveError(describeAdminError(err, 'guardar'))
    }
  }

  /**
   * Copia de lo que está sin guardar (nodos, jugadores, ajustes) para dejarla en
   * `sessionStorage` o descargarla. Nunca lleva la contraseña de misión escrita.
   */
  function buildDraftBundle(reason: string): AdminDraftBundle | null {
    const actual = latestRef.current
    const nodos =
      actual.saveState === 'dirty' || actual.saveState === 'error' || actual.saveState === 'saving'
    if (!nodos && !actual.playersDirty && !actual.missionDirty) return null

    return {
      savedAt: Date.now(),
      reason,
      ...(nodos && actual.overview
        ? {
            stages: actual.overview.stages || [],
            stagesBaseRevision: actual.overview.stages_revision,
          }
        : {}),
      ...(actual.playersDirty ? { players: actual.playerDrafts } : {}),
      ...(actual.missionDirty ? { mission: withoutMissionPass(actual.missionDraft) } : {}),
    }
  }

  /**
   * El servidor contestó 403 a la sesión (dura una hora y no se renueva). Se
   * vuelve al login, pero ANTES se guarda una copia del trabajo sin guardar:
   * antes se tiraba todo lo editado y solo se veía «Access denied».
   */
  function handleSessionExpired() {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true

    const bundle = buildDraftBundle('session')
    pendingRestoreRef.current = bundle
    const guardada = bundle ? writeAdminDrafts(bundle) : false

    setSessionNotice(
      bundle
        ? guardada
          ? 'La sesión de administración ha caducado (dura una hora). Vuelve a entrar: tus cambios sin guardar están a salvo en este navegador y podrás recuperarlos.'
          : 'La sesión de administración ha caducado (dura una hora). Vuelve a entrar SIN cerrar ni recargar esta pestaña: tus cambios sin guardar siguen en ella.'
        : 'La sesión de administración ha caducado (dura una hora). Vuelve a entrar.'
    )
    setOverviewError(null)
    setOverviewState('locked')
  }

  function downloadLocalChanges() {
    const ahora = new Date()
    const dos = (n: number) => String(n).padStart(2, '0')
    const marca = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`
    descargarJson(`saga-mis-cambios-${marca}.json`, {
      formato: 'saga-cambios-sin-guardar',
      exportado: ahora.toISOString(),
      nodos: overview?.stages || [],
      jugadores: playersDirty ? playerDrafts : undefined,
      ajustes: missionDirty ? withoutMissionPass(missionDraft) : undefined,
    })
  }

  // Si la relectura de los nodos guardados falla al cargar, los editores enseñarían
  // el requisito de mochila y el código de emergencia vacíos: se avisa.
  const hydrationFailedRef = useRef(false)

  /**
   * La vista general del servidor, completada con lo que el resumen no trae
   * (requisito de mochila y código de emergencia de cada nodo, ver
   * stageFields.ts). Si alguien guardó justo entre las dos lecturas, se repite
   * una vez para no mezclar dos versiones.
   */
  async function fetchHydratedOverview(): Promise<AdminReactOverviewResponse> {
    hydrationFailedRef.current = false

    for (let intento = 0; intento < 2; intento += 1) {
      const [vista, guardados] = await Promise.all([fetchAdminReactOverview(), fetchAdminStages()])

      if (vista.status !== 'ok') return vista
      if (guardados.status !== 'ok' || !guardados.stages) {
        hydrationFailedRef.current = true
        return vista
      }

      const desfase =
        Boolean(vista.stages_revision) &&
        Boolean(guardados.stages_revision) &&
        vista.stages_revision !== guardados.stages_revision
      if (desfase && intento === 0) continue

      return { ...vista, stages: hydrateStagesFromRaw(vista.stages || [], guardados.stages) }
    }

    return fetchAdminReactOverview()
  }

  /** Pone en pantalla lo que llegó del servidor al ENTRAR, y ofrece recuperar lo que quedó sin guardar. */
  function applyEnteredOverview(payload: AdminReactOverviewResponse) {
    /**
     * Las fotos de los jugadores llegan por aquí, no por /api/config.
     *
     * En /api/config iban incrustadas en base64 y eran 134 KB de los 135 KB
     * que el jugador se bajaba cada treinta segundos, además de dejar las
     * caras de los catorce a la vista de cualquiera: ese endpoint es público.
     * Ahora sale ligero, y los perfiles completos vienen en esta respuesta,
     * que sí pide contraseña.
     *
     * Hay que meterlos en `config` antes de construir nada: todo lo que
     * edita y guarda jugadores lee de ahí, y con las fotos vacías guardar las
     * borraría.
     */
    const configConFotos = {
      ...((config || {}) as unknown as Record<string, unknown>),
      ...(Array.isArray(payload.player_profiles)
        ? { player_profiles: payload.player_profiles }
        : {}),
    } as PublicConfig

    setConfig(configConFotos)

    const sourceConfig = {
      ...(configConFotos as unknown as Record<string, unknown>),
      ...((payload.config || {}) as unknown as Record<string, unknown>),
    }

    let vista = payload
    let jugadores = buildPlayerDrafts(
      payload.profiles || [],
      sourceConfig as unknown as PublicConfig
    )
    let ajustes = buildMissionDraft(sourceConfig)
    let nodosSinGuardar = false
    let jugadoresSinGuardar = false
    let ajustesSinGuardar = false
    let recuperado = false

    // ¿Quedó trabajo sin guardar de antes de que caducara la sesión?
    const copia = pendingRestoreRef.current ?? readAdminDrafts()
    pendingRestoreRef.current = null

    if (copia && draftHasContent(copia) && isDraftFresh(copia)) {
      const partes: string[] = []
      if (Array.isArray(copia.stages)) partes.push('nodos')
      if (Array.isArray(copia.players)) partes.push('jugadores')
      if (copia.mission) partes.push('ajustes')

      const cambioDeBase =
        Array.isArray(copia.stages) &&
        Boolean(copia.stagesBaseRevision) &&
        Boolean(payload.stages_revision) &&
        copia.stagesBaseRevision !== payload.stages_revision

      const recuperar = window.confirm(
        `Hay cambios sin guardar de tu sesión anterior (${describeDraftAge(copia.savedAt)}): ${partes.join(', ')}.\n\n` +
          (cambioDeBase
            ? 'Ojo: la misión ha cambiado en el servidor desde entonces. Si los recuperas y luego guardas, sobrescribirás esos cambios.\n\n'
            : '') +
          'Aceptar: recuperarlos.\nCancelar: descartarlos (se descargará una copia por si acaso).'
      )

      if (recuperar) {
        recuperado = true
        if (Array.isArray(copia.stages)) {
          vista = { ...payload, stages: copia.stages as AdminReactOverviewStage[] }
          nodosSinGuardar = true
        }
        if (Array.isArray(copia.players)) {
          jugadores = copia.players as PlayerDraft[]
          jugadoresSinGuardar = true
        }
        if (copia.mission) {
          ajustes = { ...ajustes, ...copia.mission }
          ajustesSinGuardar = true
        }
      } else {
        descargarJson(`saga-cambios-descartados-${Date.now()}.json`, copia)
        clearAdminDrafts()
      }
    }

    setOverview(vista)
    setPlayerDrafts(jugadores)
    setMissionDraft(ajustes)
    setPlayersDirty(jugadoresSinGuardar)
    setMissionDirty(ajustesSinGuardar)
    setPlayerSaveState('idle')
    setSettingsSaveState('idle')
    setSaveState(nodosSinGuardar ? 'dirty' : 'idle')
    setSaveError(null)
    setSaveConflict(false)
    setSelectedStage(null)
    setOverviewState('ready')

    if (recuperado) {
      setLocalNotice('Recuperados tus cambios sin guardar. Revísalos y pulsa Guardar.')
    } else if (hydrationFailedRef.current) {
      setLocalNotice(HYDRATION_WARNING)
    }
  }

  // `passwordOverride`: al cambiar la contraseña se entra con la NUEVA, y el estado
  // `password` de esta pintada aún no la tiene (el `setTimeout` de
  // `handleCambioClave` cierra sobre la pintada anterior): sin esto, tras cambiarla
  // salía «Escribe la contraseña de admin para entrar».
  async function loadOverview(passwordOverride?: string) {
    const typedPassword = (passwordOverride ?? password).trim()

    if (!typedPassword && !overviewReady) {
      setOverviewError('Escribe la contraseña de admin para entrar.')
      setOverviewState('error')
      return
    }

    // Bloqueado por intentos fallidos: el botón ya está apagado, pero un Enter llega igual.
    if (Date.now() < loginLockedUntil) return

    setOverviewState('loading')
    setOverviewError(null)
    // Mientras se entra, un 403 no es «sesión caducada»: es que aún no hay sesión.
    sessionExpiredRef.current = true

    try {
      if (typedPassword) {
        const login = await loginAdmin(typedPassword)

        if (login.status !== 'ok') {
          setSelectedStage(null)
          setOverviewError(login.message || 'No se pudo entrar.')
          setOverviewState('error')
          return
        }

        setPassword('')

        if (login.must_change) {
          setCambioClave({ actual: typedPassword })
          setOverviewState('locked')
          return
        }
      }

      const payload = await fetchHydratedOverview()

      if (payload.status === 'password_change_required') {
        // Sesión abierta de antes, pero la clave hay que cambiarla: pedir la actual.
        setCambioClave({ actual: '' })
        setOverviewState('locked')
        return
      }

      if (payload.status !== 'ok') {
        setSelectedStage(null)
        setOverviewError(payload.message || 'La vista de administración no está disponible.')
        setOverviewState('error')
        return
      }

      sessionExpiredRef.current = false
      setSessionNotice(null)
      applyEnteredOverview(payload)
    } catch (err) {
      setSelectedStage(null)

      const espera = lockoutSeconds(err)
      if (espera) {
        setNowTick(Date.now())
        setLoginLockedUntil(Date.now() + espera * 1000)
      }

      if (isAdminHttpError(err) && isPasswordChangeRequired(err.status, err.detail)) {
        setCambioClave({ actual: '' })
        setOverviewState('locked')
        return
      }

      setOverviewError(describeAdminError(err, typedPassword ? 'login' : 'cargar'))
      setOverviewState('error')
    }
  }

  /**
   * Volver a pedir los datos al servidor SIN salir del panel. Antes «Recargar»
   * usaba la misma función que el login: ponía el estado en «cargando», con lo
   * que el panel entero se cambiaba por la pantalla de entrada, y si la petición
   * fallaba se quedaba ahí con todo lo editado tirado.
   */
  async function refreshOverview(): Promise<boolean> {
    try {
      const [payload, publica] = await Promise.all([
        fetchHydratedOverview(),
        fetchPublicConfig().catch(() => null),
      ])

      if (payload.status === 'password_change_required') {
        setCambioClave({ actual: '' })
        setOverviewState('locked')
        return false
      }

      if (payload.status !== 'ok') {
        setLocalNotice(
          `No se pudo recargar (${payload.message || 'la vista no está disponible'}). Sigues con lo que tenías.`
        )
        return false
      }

      const configConFotos = mergePublicConfig(
        {
          ...((config || {}) as unknown as Record<string, unknown>),
          ...(Array.isArray(payload.player_profiles)
            ? { player_profiles: payload.player_profiles }
            : {}),
        } as PublicConfig,
        publica
      )
      setConfig(configConFotos)

      const sourceConfig = {
        ...(configConFotos as unknown as Record<string, unknown>),
        ...((payload.config || {}) as unknown as Record<string, unknown>),
      }

      // Los nodos sí se sustituyen (el panel ya avisó de lo que se perdía). Los
      // borradores de jugadores y de ajustes NO se pisan si tienen cambios.
      setOverview(payload)
      setSelectedStage(null)
      setSaveState('idle')
      setSaveError(null)
      setSaveConflict(false)

      const { playersDirty: jugadoresSinGuardar, missionDirty: ajustesSinGuardar } =
        latestRef.current
      if (!jugadoresSinGuardar) {
        setPlayerDrafts(
          buildPlayerDrafts(payload.profiles || [], sourceConfig as unknown as PublicConfig)
        )
      }
      if (!ajustesSinGuardar) {
        setMissionDraft(buildMissionDraft(sourceConfig))
      }

      setLocalNotice(
        jugadoresSinGuardar || ajustesSinGuardar
          ? 'Datos recargados. Tus borradores de jugadores y ajustes sin guardar se han conservado.'
          : hydrationFailedRef.current
            ? HYDRATION_WARNING
            : 'Datos recargados desde el servidor.'
      )
      return true
    } catch (err) {
      setLocalNotice(
        `No se pudo recargar: ${describeAdminError(err, 'cargar')} Sigues con lo que tenías.`
      )
      return false
    }
  }

  async function handleLogout() {
    // El 403 de una sesión ya cerrada no es una «caducidad».
    sessionExpiredRef.current = true
    try {
      await logoutAdmin()
    } catch {
      // Aunque el servidor no conteste, esta pestaña sale igual.
    }

    clearAdminDrafts()
    pendingRestoreRef.current = null
    setOverview(null)
    setSelectedStage(null)
    setCmsPanel('none')
    setLocalNotice(null)
    setSaveState('idle')
    setSaveError(null)
    setSaveConflict(false)
    setPlayersDirty(false)
    setMissionDirty(false)
    setPlayerDrafts([])
    setMissionDraft({})
    setCambioClave(null)
    setOverviewError(null)
    setSessionNotice('Has cerrado la sesión de administración.')
    setOverviewState('locked')
  }

  /** «Recargar la misión» tras un conflicto: descarta los nodos locales y trae los del servidor. */
  async function reloadMissionAfterConflict() {
    const recargado = await refreshOverview()
    if (recargado) clearAdminDrafts()
  }

  async function saveLocalStages() {
    if (!overview) {
      setSaveState('error')
      setSaveError('No hay vista de administración cargada.')
      return
    }

    // Un segundo «Guardar» mientras el primero sigue en vuelo guardaría dos veces.
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true

    const instantanea = overview
    const edicionesAlEmpezar = editCounterRef.current

    setSaveState('saving')
    setSaveError(null)
    setSaveConflict(false)

    try {
      const resultado = await runStagesSave(instantanea, {
        fetchStages: () => fetchAdminStages(),
        saveStages: (nodos, opciones) => saveAdminStages(undefined, nodos, opciones),
        fetchOverview: () => fetchAdminReactOverview(),
        confirm: (mensaje) => window.confirm(mensaje),
        // En cuanto el servidor confirma, los nodos nuevos (`local-...`) pasan a
        // llevar su id numérico: si algo falla DESPUÉS, el segundo «Guardar» no
        // los duplica.
        onPosted: (guardados) => {
          const mapa = localIdMap(instantanea.stages || [], guardados)
          setOverview((actual) =>
            actual ? { ...actual, stages: applyLocalIdMap(actual.stages || [], mapa) } : actual
          )
          setSelectedStage((actual) => {
            const nuevo = actual && typeof actual.id === 'string' ? mapa.get(actual.id) : undefined
            return actual && nuevo !== undefined ? { ...actual, id: nuevo } : actual
          })
        },
      })

      // ¿Se tocó algún nodo mientras se guardaba? Entonces la vista relevida del
      // servidor NO se pone encima (borraría esos cambios).
      const editadoMientras = editCounterRef.current !== edicionesAlEmpezar

      if (resultado.kind === 'saved') {
        if (resultado.refreshed && !editadoMientras) {
          setOverview(resultado.refreshed)
          setSelectedStage(null)
          setSaveState('saved')
        } else {
          setOverview((actual) =>
            actual
              ? { ...actual, stages_revision: resultado.stagesRevision ?? actual.stages_revision }
              : actual
          )
          setSaveState(editadoMientras ? 'dirty' : 'saved')
        }
        setLocalNotice(
          editadoMientras
            ? 'Guardado. Pero cambiaste algo mientras se guardaba: pulsa Guardar otra vez para incluirlo.'
            : resultado.notice
        )
      } else if (resultado.kind === 'cancelled') {
        // Los cambios siguen sin guardar: NO es «idle».
        setSaveState('dirty')
        setLocalNotice(resultado.message)
      } else if (resultado.kind === 'conflict') {
        setSaveState('dirty')
        setSaveConflict(true)
        setLocalNotice(resultado.message)
      } else {
        if (resultado.postDone) {
          // El servidor sí guardó, pero falló la comprobación: la huella nueva
          // se adopta para que el siguiente guardado no choque con el propio.
          setOverview((actual) =>
            actual ? { ...actual, stages_revision: resultado.stagesRevision } : actual
          )
        }
        setSaveState('error')
        setSaveError(resultado.message)
      }
    } catch (err) {
      setSaveState('error')
      setSaveError(describeAdminError(err, 'guardar'))
    } finally {
      saveInFlightRef.current = false
    }
  }

  /** Marca los nodos como modificados (y cuenta el cambio, ver `editCounterRef`). */
  function markStagesEdited() {
    editCounterRef.current += 1
    // Mientras se guarda, el botón sigue en «Guardando»: el estado final lo decide el guardado.
    setSaveState((actual) => (actual === 'saving' ? actual : 'dirty'))
  }

  function deleteLocalStage(stageToDelete: AdminReactOverviewStage) {
    const deleteIdentity = stageSaveIdentity(stageToDelete)

    // Borrar un nodo por el que ya han pasado jugadores les hace saltarse o repetir
    // otro (el progreso va por posición). Un nodo nuevo sin guardar no afecta a nadie.
    const esNuevo = typeof stageToDelete.id === 'string' && stageToDelete.id.startsWith('local-')
    if (!esNuevo) {
      const posicion = stages.findIndex((stage) => stageSaveIdentity(stage) === deleteIdentity)
      const aviso =
        posicion >= 0
          ? confirmationForStructuralChange(
              'borrar',
              stageToDelete.title || 'este nodo',
              profiles,
              posicion
            )
          : ''
      if (aviso && !window.confirm(aviso)) return
    }

    markStagesEdited()
    setOverview((current) => {
      if (!current) return current

      const nextStages = (current.stages || [])
        .filter((stage) => stageSaveIdentity(stage) !== deleteIdentity)
        .map((stage, index) => ({
          ...stage,
          index,
        }))

      const familyCounts = nextStages.reduce<Record<string, number>>((acc, stage) => {
        const family = stage.type || 'motion_challenge'
        acc[family] = (acc[family] || 0) + 1
        return acc
      }, {})

      return {
        ...current,
        stages: nextStages,
        counts: current.counts
          ? {
              ...current.counts,
              stages: nextStages.length,
              family_counts: familyCounts,
            }
          : current.counts,
      }
    })

    setSelectedStage(null)
    setLocalNotice('Nodo quitado en local. Pulsa Guardar para persistir el borrado.')
  }

  function reorderLocalStage(stageToMove: AdminReactOverviewStage, direction: 'up' | 'down') {
    const moveIdentity = stageSaveIdentity(stageToMove)
    let movedStage: AdminReactOverviewStage | null = null

    // Reordenar nodos por los que ya han pasado jugadores les hace repetir uno ya
    // hecho o saltarse otro: se pide confirmación EXPLÍCITA antes de moverlos. La
    // lista exacta de afectados la da el servidor al guardar (ensayo `dry_run`).
    const desde = stages.findIndex((stage) => stageSaveIdentity(stage) === moveIdentity)
    const hasta = direction === 'up' ? desde - 1 : desde + 1
    if (desde >= 0 && hasta >= 0 && hasta < stages.length) {
      const aviso = confirmationForStructuralChange(
        'reordenar',
        stageToMove.title || 'este nodo',
        profiles,
        Math.min(desde, hasta)
      )
      if (aviso && !window.confirm(aviso)) return
    }

    setOverview((current) => {
      if (!current) return current

      const currentStages = current.stages || []
      const fromIndex = currentStages.findIndex(
        (stage) => stageSaveIdentity(stage) === moveIdentity
      )
      if (fromIndex < 0) return current

      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
      if (toIndex < 0 || toIndex >= currentStages.length) return current

      const nextStages = [...currentStages]
      const [stage] = nextStages.splice(fromIndex, 1)
      nextStages.splice(toIndex, 0, stage)

      const reindexedStages = nextStages.map((item, index) => ({
        ...item,
        index,
      }))

      movedStage = reindexedStages[toIndex] || null

      return {
        ...current,
        stages: reindexedStages,
        counts: current.counts
          ? {
              ...current.counts,
              stages: reindexedStages.length,
            }
          : current.counts,
      }
    })

    if (movedStage) {
      markStagesEdited()
      setLocalNotice('Orden de ruta actualizado en local. Pulsa Guardar para persistir.')
    }
  }

  /**
   * Cambia campos de un nodo (buscándolo por su identidad, no por el objeto que
   * tenga a mano quien llama) sin devolver una copia entera: arrastrar el pin o
   * moldear un tramo desde el mapa solo toca `lat/lon` o `route_*`, y no puede
   * pisar lo que se acaba de escribir en el cajón de edición.
   */
  function patchLocalStage(target: AdminReactOverviewStage, patch: Record<string, unknown>) {
    const identity = stageSaveIdentity(target)
    markStagesEdited()
    setOverview((current) => {
      if (!current) return current
      return {
        ...current,
        stages: (current.stages || []).map((stage) =>
          stageSaveIdentity(stage) === identity
            ? ({ ...stage, ...patch } as AdminReactOverviewStage)
            : stage
        ),
      }
    })
  }

  function syncLocalStage(
    editedStage: AdminReactOverviewStage,
    options: { select?: boolean; notice?: string | false } = {}
  ) {
    // Todo cambio hecho desde el cajón de edición o el selector de tipo pasa por
    // aquí. Antes NO marcaba «sin guardar»: el botón seguía en «✓ Guardado» con
    // cambios sin persistir y el navegador no avisaba al cerrar la pestaña.
    markStagesEdited()

    // Si se ha tocado el requisito de mochila o el código de emergencia, el nodo
    // lleva una marca: solo los marcados se reescriben al guardar (ver
    // lib/stageFields.ts). Sin ella se conserva lo que hay guardado.
    const previousStage = (overviewRef.current?.stages || []).find(
      (stage) => stage.index === editedStage.index
    )
    const nextStage = markEditedFields(
      previousStage as unknown as Record<string, unknown> | undefined,
      editedStage as unknown as Record<string, unknown>
    ) as unknown as AdminReactOverviewStage

    setOverview((current) => {
      if (!current) return current

      const currentStages = current.stages || []
      const exists = currentStages.some((stage) => stage.index === nextStage.index)
      const nextStages = exists
        ? currentStages.map((stage) =>
            stage.index === nextStage.index
              ? (preservePhysicalStageFields(
                  stage as unknown as Record<string, unknown>,
                  nextStage as unknown as Record<string, unknown>
                ) as typeof stage)
              : stage
          )
        : [...currentStages, nextStage]

      const familyCounts = nextStages.reduce<Record<string, number>>((acc, stage) => {
        const family = stage.type || 'motion_challenge'
        acc[family] = (acc[family] || 0) + 1
        return acc
      }, {})

      return {
        ...current,
        stages: nextStages,
        counts: current.counts
          ? {
              ...current.counts,
              stages: nextStages.length,
              family_counts: familyCounts,
            }
          : current.counts,
      }
    })

    if (options.select !== false) {
      setSelectedStage(nextStage)
    }

    if (options.notice !== false) {
      setLocalNotice(options.notice || 'Vista local actualizada. Pulsa Guardar para persistir.')
    }
  }

  function applyMissionTemplate(templateId: MissionTemplateId) {
    if (!overview) return

    const template = getMissionTemplateById(templateId)
    // La plantilla trae nodos con ids nuevos: si ya hay gente con progreso, al
    // guardar dejaría de tener sentido el punto en que iban.
    const conProgreso = playersPastIndex(profiles, 0)
    const shouldReplace =
      stages.length === 0 ||
      window.confirm(
        `Reemplazar la ruta local actual por la plantilla "${template.title}"? Guarda después para persistir.` +
          (conProgreso.length > 0
            ? `\n\nOjo: ${conProgreso.length} jugador(es) ya han avanzado en la ruta actual; al guardar la plantilla perderán su punto.`
            : '')
      )

    if (!shouldReplace) return

    const mapCenter =
      overview?.config?.map_center || config?.map_center || ([40.4168, -3.7038] as [number, number])

    const centerLat = Number(mapCenter[0] || 40.4168)
    const centerLon = Number(mapCenter[1] || -3.7038)
    let lastPhysicalItem: { id: string; label: string } | null = null

    const nextStages = template.stages.map((item, index) => {
      const patch = getDefaultAdminStagePatchForGame(item.gameId)
      const lat = centerLat + item.offsetLat
      const lon = centerLon + item.offsetLon
      const physicalFields = item.physicalKind
        ? buildTemplatePhysicalFields(item.physicalKind, item.itemLabel || item.title)
        : {}

      if (item.physicalKind) {
        const record = physicalFields as { physical_item_id?: string; physical_item_label?: string }
        lastPhysicalItem = {
          id: record.physical_item_id || slugifyMissionItemId(item.itemLabel || item.title),
          label: record.physical_item_label || item.itemLabel || item.title,
        }
      }

      const requirementConfig =
        item.requiresPreviousItem && lastPhysicalItem
          ? {
              required_item_id: lastPhysicalItem.id,
              required_item_label: lastPhysicalItem.label,
              required_item_quantity: 1,
              required_item_consume: false,
            }
          : {}

      return {
        id: `local-template-${Date.now()}-${index}`,
        index,
        title: item.title,
        type: patch.type,
        label: patch.label,
        icon: patch.icon,
        lat,
        lon,
        radius: item.radius || 50,
        entry_mode: 'gps',
        require_proximity: true,
        has_hint: false,
        has_manual_fallback: false,
        content: item.content || patch.content,
        objective: patch.objective,
        config: {
          ...patch.config,
          ...requirementConfig,
        },
        config_summary: Array.from(
          new Set([...patch.config_summary, ...Object.keys(requirementConfig)])
        ),
        messages: patch.messages,
        ...physicalFields,
      } as EditableAdminStage
    })

    const familyCounts = nextStages.reduce<Record<string, number>>((acc, stage) => {
      const family = stage.type || 'motion_challenge'
      acc[family] = (acc[family] || 0) + 1
      return acc
    }, {})

    setOverview((current) =>
      current
        ? {
            ...current,
            stages: nextStages,
            counts: current.counts
              ? {
                  ...current.counts,
                  stages: nextStages.length,
                  family_counts: familyCounts,
                }
              : current.counts,
          }
        : current
    )

    setSelectedStage(nextStages[0] || null)
    setCmsPanel('none')
    markStagesEdited()
    setLocalNotice(
      `Plantilla "${template.title}" creada en local. Revisa los nodos y pulsa Guardar.`
    )
  }

  function createLocalNodeAt(lat?: number, lon?: number) {
    const mapCenter =
      overview?.config?.map_center || config?.map_center || ([40.4168, -3.7038] as [number, number])

    const mappedStagesForCenter = stages.filter(
      (stage) => typeof stage.lat === 'number' && typeof stage.lon === 'number'
    )

    const routeCenter: [number, number] =
      mappedStagesForCenter.length > 0
        ? [
            mappedStagesForCenter.reduce((sum, stage) => sum + Number(stage.lat), 0) /
              mappedStagesForCenter.length,
            mappedStagesForCenter.reduce((sum, stage) => sum + Number(stage.lon), 0) /
              mappedStagesForCenter.length,
          ]
        : mapCenter

    const nextIndex = stages.length
    const nextLat = typeof lat === 'number' ? lat : routeCenter[0]
    const nextLon = typeof lon === 'number' ? lon : routeCenter[1]
    const defaultGamePatch = getDefaultAdminStagePatchForGame('shake_charge')

    const nextStage: EditableAdminStage = {
      id: `local-${Date.now()}`,
      index: nextIndex,
      title: `NEW NODE ${nextIndex + 1}`,
      type: defaultGamePatch.type,
      label: defaultGamePatch.label,
      lat: nextLat,
      lon: nextLon,
      radius: 50,
      entry_mode: 'free',
      require_proximity: false,
      has_hint: false,
      has_manual_fallback: false,
      content: defaultGamePatch.content,
      objective: defaultGamePatch.objective,
      config: defaultGamePatch.config,
      config_summary: defaultGamePatch.config_summary,
      messages: defaultGamePatch.messages,
    }

    setCmsPanel('none')
    markStagesEdited()
    syncLocalStage(nextStage)
    setSelectedStage(nextStage)
    setLocalNotice(
      typeof lat === 'number' && typeof lon === 'number'
        ? 'Nodo creado aquí. Edita el tipo y guarda cuando esté listo.'
        : 'Nodo creado en el centro de la ruta. Muévelo o edita coordenadas antes de guardar.'
    )
  }

  function insertLocalNodeAt(lat: number, lon: number, index: number) {
    // Un nodo nuevo en mitad de la ruta desplaza a quien ya ha pasado por delante.
    const aviso = confirmationForStructuralChange('insertar', 'nuevo nodo', profiles, index)
    if (aviso && !window.confirm(aviso)) return

    const defaultGamePatch = getDefaultAdminStagePatchForGame('shake_charge')

    const nextStage: EditableAdminStage = {
      id: `local-${Date.now()}`,
      index: index,
      title: `NEW NODE ${index + 1}`,
      type: defaultGamePatch.type,
      label: defaultGamePatch.label,
      lat,
      lon,
      radius: 50,
      entry_mode: 'free',
      require_proximity: false,
      has_hint: false,
      has_manual_fallback: false,
      content: defaultGamePatch.content,
      objective: defaultGamePatch.objective,
      config: defaultGamePatch.config,
      config_summary: defaultGamePatch.config_summary,
      messages: defaultGamePatch.messages,
    }

    setOverview((current) => {
      if (!current) return current
      const nextStages = [...(current.stages || [])]
      nextStages.splice(index, 0, nextStage)
      const reindexedStages = nextStages.map((s, idx) => ({ ...s, index: idx }))

      const familyCounts = reindexedStages.reduce<Record<string, number>>((acc, stage) => {
        const family = stage.type || 'motion_challenge'
        acc[family] = (acc[family] || 0) + 1
        return acc
      }, {})

      return {
        ...current,
        stages: reindexedStages,
        counts: current.counts
          ? {
              ...current.counts,
              stages: reindexedStages.length,
              family_counts: familyCounts,
            }
          : current.counts,
      }
    })

    setCmsPanel('none')
    markStagesEdited()
    setLocalNotice('Waypoint de ruta insertado. Guarda los cambios.')
  }

  function createLocalNodesWithItems(itemsToCreate: Array<{ id: string; label: string }>) {
    if (!itemsToCreate.length) return

    const mapCenter =
      overview?.config?.map_center || config?.map_center || ([40.4168, -3.7038] as [number, number])

    const mappedStagesForCenter = stages.filter(
      (stage) => typeof stage.lat === 'number' && typeof stage.lon === 'number'
    )

    const routeCenter: [number, number] =
      mappedStagesForCenter.length > 0
        ? [
            mappedStagesForCenter.reduce((sum, stage) => sum + Number(stage.lat), 0) /
              mappedStagesForCenter.length,
            mappedStagesForCenter.reduce((sum, stage) => sum + Number(stage.lon), 0) /
              mappedStagesForCenter.length,
          ]
        : mapCenter

    const defaultGamePatch = getDefaultAdminStagePatchForGame('shake_charge')

    itemsToCreate.forEach((item, idx) => {
      const offset = (idx - (itemsToCreate.length - 1) / 2) * 0.00035
      const nextIndex = stages.length + idx

      const nextStage: EditableAdminStage = {
        id: `local-${Date.now()}-${idx}`,
        index: nextIndex,
        title: item.label,
        type: defaultGamePatch.type,
        label: 'Objeto Coleccionable',
        lat: routeCenter[0] + offset,
        lon: routeCenter[1] + offset,
        radius: 35,
        entry_mode: 'free',
        require_proximity: false,
        has_hint: false,
        has_manual_fallback: false,
        physical_node_kind: 'collectible',
        physical_item_id: item.id,
        physical_item_label: item.label,
        content: `Misión: Recoge ${item.label} en esta ubicación real.`,
        objective: `Objeto: ${item.label}`,
        config: {
          ...defaultGamePatch.config,
          is_map_collectible: true,
          reward_item_id: item.id,
          reward_item_label: item.label,
        },
        config_summary: [`Coleccionable: ${item.label}`],
        messages: defaultGamePatch.messages,
      }

      syncLocalStage(nextStage, { select: false, notice: false })
    })

    setCmsPanel('none')
    setSelectedStage(null)
    markStagesEdited()
    setLocalNotice(
      itemsToCreate.length === 1
        ? `📍 Chincheta colocada en el mapa para "${itemsToCreate[0].label}". Arrástrala a su posición final.`
        : `📍 Se han colocado ${itemsToCreate.length} chinchetas en el mapa. Arrástralas a sus posiciones finales.`
    )
  }

  // Arrastrar el pin o moldear un tramo desde el mapa cambia SOLO lat/lon o
  // route_*, y se aplica sobre el nodo tal y como está ahora en la vista (no
  // sobre la copia que tenía el mapa): antes se devolvía el nodo entero del mapa
  // y podía pisar lo que se acababa de escribir en el cajón de edición (A6).
  function moveLocalStage(
    stageToMove: AdminReactOverviewStage,
    lat: number,
    lon: number,
    options: { select?: boolean } = {}
  ) {
    suppressStageSelectUntilRef.current = Date.now() + 700
    patchLocalStage(stageToMove, { lat, lon })
    if (options.select !== false) {
      setSelectedStage({ ...stageToMove, lat, lon })
    }
    setLocalNotice('Nodo movido en el mapa. Pulsa Guardar para persistir la nueva posición.')
  }

  function setLegViaLocal(targetStage: AdminReactOverviewStage, via: [number, number] | null) {
    suppressStageSelectUntilRef.current = Date.now() + 700
    patchLocalStage(targetStage, { route_via: via ? [via] : [] })
    setLocalNotice(
      via
        ? 'Camino moldeado. Pulsa Guardar para persistir la nueva ruta.'
        : 'Moldeado del camino eliminado. Pulsa Guardar para persistir.'
    )
  }

  function setLegTrackLocal(targetStage: AdminReactOverviewStage, track: Array<[number, number]>) {
    suppressStageSelectUntilRef.current = Date.now() + 700
    patchLocalStage(targetStage, { route_track: track })
    setLocalNotice('Trazado ajustado. Pulsa Guardar para persistirlo.')
  }

  function handleOverviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    loadOverview()
  }

  async function handleCambioClave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cambioClave) return
    const actual = cambioClave.actual || claveActualCampo.trim()
    if (!actual) {
      setCambioClaveError('Escribe la contraseña actual.')
      return
    }
    setCambiandoClave(true)
    setCambioClaveError(null)
    try {
      const resultado = await changeAdminPassword(actual, claveNueva.trim(), claveRepetida.trim())
      if (!resultado.ok) {
        const detalle = resultado.detalle || ''
        setCambioClaveError(
          /at least 10/i.test(detalle)
            ? 'Tiene que tener al menos 10 caracteres.'
            : /weak/i.test(detalle)
              ? 'Es demasiado fácil. Evita palabras comunes y patrones simples.'
              : /match/i.test(detalle)
                ? 'Las dos contraseñas nuevas no coinciden.'
                : /bad password/i.test(detalle)
                  ? 'La contraseña actual no es correcta.'
                  : `No se pudo cambiar (${detalle}).`
        )
        return
      }
      // Hecho: se entra ya con la nueva.
      setCambioClave(null)
      setClaveNueva('')
      setClaveRepetida('')
      setClaveActualCampo('')
      setPassword(claveNueva.trim())
      window.setTimeout(() => void loadOverview(claveNueva.trim()), 0)
    } catch (fallo) {
      setCambioClaveError(fallo instanceof Error ? fallo.message : 'No se pudo cambiar.')
    } finally {
      setCambiandoClave(false)
    }
  }

  if (!overviewReady) {
    return (
      <div className="admin-root">
        <style>{styles}</style>

        <section className="admin-login-minimal" aria-label="Admin login">
          <div className="admin-login-orb admin-login-orb-a" aria-hidden="true" />
          <div className="admin-login-orb admin-login-orb-b" aria-hidden="true" />

          <form
            onSubmit={(event) =>
              cambioClave ? void handleCambioClave(event) : handleOverviewSubmit(event)
            }
            className="admin-login-card admin-login-card-minimal"
          >
            <div className="admin-brand">SAGA ENGINE · ADMIN</div>

            <div className="admin-login-copy">
              <h1>Control de misión</h1>
              <p>{cambioClave ? 'Antes de entrar, cambia la contraseña' : 'Acceso protegido'}</p>
            </div>

            {cambioClave ? (
              <div className="admin-login-form">
                {!cambioClave.actual ? (
                  <>
                    <label>Contraseña actual</label>
                    <input
                      type="password"
                      value={claveActualCampo}
                      autoComplete="current-password"
                      onChange={(event) => setClaveActualCampo(event.target.value)}
                    />
                  </>
                ) : null}
                <label>Contraseña nueva (10 caracteres o más)</label>
                <input
                  type="password"
                  value={claveNueva}
                  autoComplete="new-password"
                  autoFocus
                  onChange={(event) => setClaveNueva(event.target.value)}
                />
                <label>Repite la nueva</label>
                <input
                  type="password"
                  value={claveRepetida}
                  autoComplete="new-password"
                  onChange={(event) => setClaveRepetida(event.target.value)}
                />
                <button type="submit" disabled={cambiandoClave}>
                  {cambiandoClave ? 'Cambiando…' : 'Cambiar y entrar'}
                </button>
              </div>
            ) : (
              <div className="admin-login-form">
                <label>Contraseña de admin</label>
                <input
                  type="password"
                  value={password}
                  placeholder="Contraseña"
                  autoComplete="current-password"
                  autoFocus
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={overviewState === 'loading' || loginLockedSeconds > 0}
                >
                  {overviewState === 'loading'
                    ? 'Entrando…'
                    : loginLockedSeconds > 0
                      ? `Espera ${formatWait(loginLockedSeconds)}`
                      : 'Entrar'}
                </button>
              </div>
            )}

            {/* Sesión caducada o cerrada: se dice, y si había cambios sin guardar
                se avisa de que se recuperarán al entrar. */}
            {sessionNotice ? (
              <div className="admin-error" role="status">
                <strong>Sesión</strong>
                <span>{sessionNotice}</span>
              </div>
            ) : null}

            {cambioClave && cambioClaveError ? (
              <div className="admin-error">
                <strong>No se ha cambiado</strong>
                <span>{cambioClaveError}</span>
              </div>
            ) : null}

            {!cambioClave && overviewState === 'error' ? (
              <div className="admin-error" role="alert">
                <strong>No se ha podido entrar</strong>
                <span>{overviewError}</span>
              </div>
            ) : null}

            {state === 'error' ? (
              <div className="admin-error">
                <strong>No se pudo leer la configuración pública</strong>
                <span>{error}</span>
              </div>
            ) : null}

            <div className="admin-login-foot">
              <span>Sin entrar no se enseña ningún dato de la misión.</span>
              <div>
                <a href="/">Entrada de jugadores</a>
              </div>
            </div>
          </form>
        </section>
      </div>
    )
  }

  return (
    <>
      <style>{styles}</style>
      <AdminMissionControlShell
        title={title}
        subtitle={subtitle}
        profiles={profiles}
        stages={stages}
        familyCounts={familyCounts}
        selectedStage={selectedStage}
        cmsPanel={cmsPanel}
        localNotice={localNotice}
        saveState={saveState}
        saveError={saveError}
        hasUnsavedWork={hasUnsavedWork}
        saveConflict={saveConflict}
        onReloadMission={() => void reloadMissionAfterConflict()}
        onDismissConflict={() => setSaveConflict(false)}
        onDownloadLocalChanges={downloadLocalChanges}
        onLogout={() => void handleLogout()}
        missionLaunchAt={String(
          (config as unknown as Record<string, unknown> | null)?.mission_launch_at || ''
        )}
        playerDrafts={playerDrafts}
        playerSaveState={playerSaveState}
        playerSaveError={playerSaveError}
        profileProgress={Object.fromEntries(
          (profiles || []).map((profile) => [
            profile.id,
            {
              level: profile.level ?? 0,
              finished: Boolean(profile.finished),
            },
          ])
        )}
        profileActionState={profileActionState}
        profileActionError={profileActionError}
        onProfileAction={runPlayerProfileAction}
        missionDraft={missionDraft}
        settingsSaveState={settingsSaveState}
        settingsSaveError={settingsSaveError}
        onRefresh={() => void refreshOverview()}
        onSelectStage={selectLocalStage}
        onCreateNode={() => createLocalNodeAt()}
        onCreateNodeAt={createLocalNodeAt}
        onInsertNodeAt={insertLocalNodeAt}
        onMoveStage={moveLocalStage}
        onSetLegVia={setLegViaLocal}
        onSetLegTrack={setLegTrackLocal}
        onApplyStage={syncLocalStage}
        onDeleteStage={deleteLocalStage}
        onReorderStage={reorderLocalStage}
        onSaveStages={saveLocalStages}
        onSetCmsPanel={setCmsPanel}
        onUpdatePlayer={updatePlayerDraft}
        onDeletePlayer={deletePlayerDraft}
        onAddPlayer={addPlayerDraft}
        onSavePlayers={savePlayerProfiles}
        onUpdateMissionDraft={updateMissionDraft}
        onSaveSettings={saveMissionSettings}
        missionPassEnabled={overview?.config?.mission_pass_enabled ?? false}
        onClearMissionPass={clearMissionPassword}
        onApplyMissionTemplate={applyMissionTemplate}
        onCreateNodesWithItems={createLocalNodesWithItems}
      />
    </>
  )
}

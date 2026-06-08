import { FormEvent, useEffect, useMemo, useState } from 'react'

import AdminMissionMap from './AdminMissionMap'
import AdminMissionControlShell from './components/AdminMissionControlShell'
import FamiliesPanel from './components/FamiliesPanel'
import NodeDetailDrawer from './components/NodeDetailDrawer'
import PlayersPanel from './components/PlayersPanel'
import SettingsPanel from './components/SettingsPanel'
import { fetchPublicConfig } from '../shared/api'
import type { PublicConfig } from '../types/player'
import {
  fetchAdminReactOverview,
  fetchAdminStages,
  loginAdmin,
  saveAdminConfig,
  saveAdminStages,
  runAdminProfileAction,
  type AdminProfileAction,
  type AdminRawStage,
  type AdminReactOverviewProfile,
  type AdminReactOverviewResponse,
  type AdminReactOverviewStage,
} from './lib/adminApi'
import {
  familyCards,
  getDefaultAdminConfigForFamily,
  type EditableAdminStage,
  type FamilyId,
} from './lib/familyConfigs'
import {
  getDefaultAdminStagePatchForGame,
  getMissionTemplateById,
  type MissionTemplateId,
} from './lib/gameCatalog'
import {
  buildPlayerDrafts,
  normalizePlayerId,
  normalizePlayerMode,
  type PlayerDraft,
} from './lib/playerDrafts'
import {
  buildRawStagesFromOverview,
  mergeOverviewIntoRawStages,
  stageSaveIdentity,
} from './lib/adminStagePersistence'
import { getStablePlayerColor, getPlayerInitials } from '../shared/playerIdentity'

type LoadState = 'loading' | 'ready' | 'error'
type OverviewState = 'locked' | 'loading' | 'ready' | 'error'
type CmsPanel = 'none' | 'players' | 'mission' | 'labels' | 'builder' | 'builder'


function slugifyMissionItemId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function buildTemplatePhysicalFields(kind: 'collectible' | 'requirement' | 'clue' | 'bonus', label: string) {
  const itemId = slugifyMissionItemId(label) || 'objeto_qr'
  const payload = `saga:item:${itemId}`

  return {
    physical_node_kind: kind,
    physical_item_kind: kind,
    physical_item_id: itemId,
    physical_item_label: label,
    physical_qr: {
      kind,
      item_id: itemId,
      label,
      payload,
    },
    qr_payload: payload,
  }
}

function preservePhysicalStageFields<T extends Record<string, unknown>>(previous: T, next: T): T {
  const keys = [
    'physical_node_kind',
    'physical_item_kind',
    'physical_item_id',
    'physical_item_label',
    'physical_qr',
    'qr_payload',
  ] as const

  const merged = { ...next } as Record<string, unknown>
  const clearPhysical =
    merged._clear_physical_fields === true ||
    merged._physical_node_mode === 'normal' ||
    merged.physical_node_kind === null ||
    merged.physical_item_kind === null

  if (clearPhysical) {
    for (const key of keys) {
      delete merged[key]
    }
    delete merged._clear_physical_fields
    delete merged._physical_node_mode
    return merged as T
  }

  for (const key of keys) {
    if (!(key in merged) && key in previous) {
      merged[key] = previous[key]
    }
  }

  return merged as T
}

export default function AdminApp() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [overview, setOverview] = useState<AdminReactOverviewResponse | null>(null)
  const [overviewState, setOverviewState] = useState<OverviewState>('locked')
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<AdminReactOverviewStage | null>(null)
  const [cmsPanel, setCmsPanel] = useState<CmsPanel>('none')
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [settingsSaveState, setSettingsSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null)
  const [missionDraft, setMissionDraft] = useState<Record<string, string>>({})
  const [playerDrafts, setPlayerDrafts] = useState<PlayerDraft[]>([])
  const [playerSaveState, setPlayerSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [playerSaveError, setPlayerSaveError] = useState<string | null>(null)
  const [profileActionState, setProfileActionState] = useState<Record<string, string>>({})
  const [profileActionError, setProfileActionError] = useState<Record<string, string>>({})

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

  const profiles = overview?.profiles || []
  const stages = overview?.stages || []
  const familyCounts = overview?.counts?.family_counts || {}
  const overviewReady = overviewState === 'ready' && Boolean(overview)

  const title = overview?.config?.admin_title || config?.admin_title || config?.site_name || 'SAGA Admin'
  const subtitle = overview?.config?.admin_subtitle || config?.admin_subtitle || 'Mission Control'


  useEffect(() => {
    if (!overviewReady) return

    const sourceConfig = {
      ...((config || {}) as unknown as Record<string, unknown>),
      ...((overview?.config || {}) as unknown as Record<string, unknown>),
    } as PublicConfig

    setPlayerDrafts(buildPlayerDrafts(overview?.profiles || profiles || [], sourceConfig))
  }, [overviewReady, overview, profiles, config])

  const stats = useMemo(() => {
    const counts = overview?.counts
    const cfg = overview?.config || config
    const players = counts?.players ?? (Array.isArray(config?.players) ? config.players.length : 0)
    const profileCount = counts?.profiles ?? (Array.isArray(config?.player_profiles) ? config.player_profiles.length : 0)
    const stageCount = counts?.stages ?? 0
    const finished = counts?.finished_profiles ?? 0
    const mapCenter = Array.isArray(cfg?.map_center) ? cfg.map_center.join(', ') : 'Not configured'
    const mapZoom = cfg?.map_zoom ?? '—'

    return [
      { label: 'Players', value: String(players), detail: 'Configured entries' },
      { label: 'Profiles', value: String(profileCount), detail: `${finished} finished` },
      { label: 'Nodes', value: String(stageCount), detail: 'Route model' },
      { label: 'Map', value: mapCenter, detail: `Zoom ${mapZoom}` },
      { label: 'Theme', value: cfg?.player_theme || 'classic', detail: 'Player shell' },
    ]
  }, [config, overview])

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
      login_subtitle: getConfigTextValue(source, 'login_subtitle', ''),
      story_title: getConfigTextValue(source, 'story_title', ''),
      story_text: getConfigTextValue(source, 'story_text', ''),
      prologue_title: getConfigTextValue(source, 'prologue_title', ''),
      prologue_subtitle: getConfigTextValue(source, 'prologue_subtitle', ''),
      prologue_body: getConfigTextValue(source, 'prologue_body', ''),
      player_theme: getConfigTextValue(source, 'player_theme', config?.player_theme || 'classic'),
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
  }

  function buildMissionConfigPayload() {
    const currentConfig = (config || {}) as unknown as Record<string, unknown>
    const overviewConfig = (overview?.config || {}) as unknown as Record<string, unknown>
    const base = {
      ...currentConfig,
      ...overviewConfig,
    }

    const existingPlayers =
      Array.isArray(currentConfig.players)
        ? currentConfig.players
        : Array.isArray(base.players)
          ? base.players
          : []

    const existingProfiles =
      Array.isArray(currentConfig.player_profiles)
        ? currentConfig.player_profiles
        : Array.isArray(base.player_profiles)
          ? base.player_profiles
          : []

    const lat = Number(missionDraft.map_center_lat)
    const lon = Number(missionDraft.map_center_lon)
    const zoom = Number(missionDraft.map_zoom)

    return {
      ...base,
      players: existingPlayers,
      player_profiles: existingProfiles,
      site_name: missionDraft.site_name || 'SAGA Engine',
      admin_title: missionDraft.admin_title || 'Mission editor',
      admin_subtitle: missionDraft.admin_subtitle || 'Map-first control panel',
      login_subtitle: missionDraft.login_subtitle || '',
      story_title: missionDraft.story_title || '',
      story_text: missionDraft.story_text || '',
      prologue_title: missionDraft.prologue_title || '',
      prologue_subtitle: missionDraft.prologue_subtitle || '',
      prologue_body: missionDraft.prologue_body || '',
      player_theme: missionDraft.player_theme || 'classic',
      map_center: [
        Number.isFinite(lat) ? lat : 40.4168,
        Number.isFinite(lon) ? lon : -3.7038,
      ],
      map_zoom: Number.isFinite(zoom) ? zoom : 13,
    }
  }


  async function saveMissionSettings() {
    setSettingsSaveState('saving')
    setSettingsSaveError(null)

    try {
      const payload = buildMissionConfigPayload()
      const saved = await saveAdminConfig(undefined, payload)

      if (saved.status !== 'ok') {
        throw new Error(saved.message || 'Could not save mission settings.')
      }

      setConfig((current) => ({
        ...(current || {}),
        ...(payload as unknown as PublicConfig),
      }))

      const refreshed = await fetchAdminReactOverview()
      if (refreshed.status === 'ok') {
        setOverview(refreshed)
        setMissionDraft(buildMissionDraft((refreshed.config || payload) as Record<string, unknown>))
        setPlayerDrafts(buildPlayerDrafts(refreshed.profiles || [], payload as unknown as PublicConfig))
      }

      setSettingsSaveState('saved')
      setLocalNotice('Mission settings saved. Admin and player config reloaded.')
    } catch (err) {
      setSettingsSaveState('error')
      setSettingsSaveError(err instanceof Error ? err.message : 'Unknown settings save error')
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
  }

  function addPlayerDraft() {
    setPlayerDrafts((current) => {
      const nextNumber = current.length + 1
      const fallbackName = `PLAYER ${nextNumber}`

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
    setLocalNotice('Player added locally. Save players to persist.')
  }

  function deletePlayerDraft(index: number) {
    setPlayerDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index))
    setPlayerSaveState('idle')
    setLocalNotice('Player removed locally. Save players to persist.')
  }

  function buildPlayerConfigPayload() {
    const base = {
      ...((config || {}) as PublicConfig),
      ...((overview?.config || {}) as unknown as Record<string, unknown>),
    }

    const normalizedDrafts = playerDrafts.map((draft, index) => {
      const id = normalizePlayerId(draft.id, index)
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
        avatar_initials: (draft.avatar_initials.trim() || getPlayerInitials(displayName)).slice(0, 3).toUpperCase(),
      }
    })

    return {
      ...base,
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

    const dangerous = action === 'reset_profile' || action === 'mark_finished'
    const actionLabel =
      action === 'reset_profile'
        ? 'resetear la partida'
        : action === 'level_prev'
          ? 'retroceder 1 nodo'
          : action === 'level_next'
            ? 'avanzar 1 nodo'
            : 'marcar como finalizado'

    if (dangerous && !window.confirm(`¿Seguro que quieres ${actionLabel} para ${cleanId}?`)) {
      return
    }

    setProfileActionState((current) => ({ ...current, [cleanId]: 'running' }))
    setProfileActionError((current) => ({ ...current, [cleanId]: '' }))

    try {
      const result = await runAdminProfileAction(cleanId, action)

      if (result.status !== 'ok') {
        throw new Error(result.detail || result.message || 'No se pudo actualizar el progreso.')
      }

      const refreshed = await fetchAdminReactOverview()
      if (refreshed.status === 'ok') {
        setOverview(refreshed)
        setPlayerDrafts(buildPlayerDrafts(refreshed.profiles || [], {
          ...((config || {}) as unknown as Record<string, unknown>),
          ...((refreshed.config || {}) as unknown as Record<string, unknown>),
        } as PublicConfig))
      }

      setProfileActionState((current) => ({ ...current, [cleanId]: 'saved' }))
      setLocalNotice(`${cleanId}: ${actionLabel} aplicado. Nivel ${result.previous_level ?? '—'} → ${result.level ?? '—'}.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido.'
      setProfileActionState((current) => ({ ...current, [cleanId]: 'error' }))
      setProfileActionError((current) => ({ ...current, [cleanId]: message }))
      setLocalNotice(`${cleanId}: no se pudo cambiar progreso.`)
    }
  }


  async function savePlayerProfiles() {
    setPlayerSaveState('saving')
    setPlayerSaveError(null)

    try {
      const payload = buildPlayerConfigPayload()
      const saved = await saveAdminConfig(undefined, payload)

      if (saved.status !== 'ok') {
        throw new Error(saved.message || 'Could not save player profiles.')
      }

      const refreshed = await fetchAdminReactOverview()
      if (refreshed.status === 'ok') {
        setOverview(refreshed)
        setPlayerDrafts(buildPlayerDrafts(refreshed.profiles || [], payload as unknown as PublicConfig))
      }

      setConfig((current) => ({
        ...(current || {}),
        ...(payload as unknown as PublicConfig),
      }))

      setPlayerSaveState('saved')
      setLocalNotice('Players saved. Admin and player config reloaded.')
    } catch (err) {
      setPlayerSaveState('error')
      setPlayerSaveError(err instanceof Error ? err.message : 'Unknown player save error')
    }
  }


  async function loadOverview() {
    const typedPassword = password.trim()

    if (!typedPassword && !overviewReady) {
      setOverviewError('Enter the admin password to unlock Mission Control.')
      setOverviewState('error')
      return
    }

    setOverviewState('loading')
    setOverviewError(null)

    try {
      if (typedPassword) {
        const login = await loginAdmin(typedPassword)

        if (login.status !== 'ok') {
          setOverview(null)
          setSelectedStage(null)
          setOverviewError(login.message || 'Admin login failed.')
          setOverviewState('error')
          return
        }

        setPassword('')
      }

      const payload = await fetchAdminReactOverview()

      if (payload.status !== 'ok') {
        setOverview(null)
        setSelectedStage(null)
        setOverviewError(payload.message || 'Admin overview unavailable')
        setOverviewState('error')
        return
      }

      setOverview(payload)
      setPlayerDrafts(buildPlayerDrafts(payload.profiles || [], {
        ...((config || {}) as unknown as Record<string, unknown>),
        ...((payload.config || {}) as unknown as Record<string, unknown>),
      } as PublicConfig))
      setSelectedStage(null)
      setOverviewState('ready')
    } catch (err) {
      setOverview(null)
      setSelectedStage(null)
      setOverviewError(err instanceof Error ? err.message : 'Unknown error')
      setOverviewState('error')
    }
  }


  async function saveLocalStages() {
    if (!overview) {
      setSaveState('error')
      setSaveError('No admin overview is loaded.')
      return
    }

    setSaveState('saving')
    setSaveError(null)

    try {
      let persistedStages: AdminRawStage[] = []
      let usedFallback = false

      const raw = await fetchAdminStages()

      if (raw.status === 'ok') {
        persistedStages = mergeOverviewIntoRawStages(raw.stages || [], overview.stages || [])
      } else {
        usedFallback = true
        persistedStages = buildRawStagesFromOverview(overview.stages || [])
      }

      const saved = await saveAdminStages(undefined, persistedStages)

      if (saved.status !== 'ok') {
        throw new Error(saved.message || 'Could not save admin stages.')
      }

      const refreshed = await fetchAdminReactOverview()
      if (refreshed.status === 'ok') {
        setOverview(refreshed)
        setSelectedStage(null)
      }

      setSaveState('saved')
      setLocalNotice(
        usedFallback
          ? 'Saved using fallback payload. Mission data reloaded.'
          : 'Saved to backend. Mission data reloaded.'
      )
    } catch (err) {
      setSaveState('error')
      setSaveError(err instanceof Error ? err.message : 'Unknown save error')
    }
  }


  function deleteLocalStage(stageToDelete: AdminReactOverviewStage) {
    const deleteIdentity = stageSaveIdentity(stageToDelete)

    setOverview((current) => {
      if (!current) return current

      const nextStages = (current.stages || [])
        .filter((stage) => stageSaveIdentity(stage) !== deleteIdentity)
        .map((stage, index) => ({
          ...stage,
          index,
        }))

      const familyCounts = nextStages.reduce<Record<string, number>>((acc, stage) => {
        const family = stage.type || 'signal_hunt'
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
    setSaveState('idle')
    setLocalNotice('Node removed locally. Save changes to persist deletion.')
  }

  function reorderLocalStage(
    stageToMove: AdminReactOverviewStage,
    direction: 'up' | 'down'
  ) {
    const moveIdentity = stageSaveIdentity(stageToMove)
    let movedStage: AdminReactOverviewStage | null = null

    setOverview((current) => {
      if (!current) return current

      const currentStages = current.stages || []
      const fromIndex = currentStages.findIndex((stage) => stageSaveIdentity(stage) === moveIdentity)
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
      setSelectedStage(movedStage)
      setSaveState('idle')
      setLocalNotice('Route order updated locally. Save changes to persist.')
    }
  }


  function syncLocalStage(nextStage: AdminReactOverviewStage) {
    setOverview((current) => {
      if (!current) return current

      const currentStages = current.stages || []
      const exists = currentStages.some((stage) => stage.index === nextStage.index)
      const nextStages = exists
        ? currentStages.map((stage) => (stage.index === nextStage.index ? preservePhysicalStageFields(stage as unknown as Record<string, unknown>, nextStage as unknown as Record<string, unknown>) as typeof stage : stage))
        : [...currentStages, nextStage]

      const familyCounts = nextStages.reduce<Record<string, number>>((acc, stage) => {
        const family = stage.type || 'signal_hunt'
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

    setSelectedStage(nextStage)
    setLocalNotice('Local preview updated. Save changes to persist.')
  }

  function applyMissionTemplate(templateId: MissionTemplateId) {
    if (!overview) return

    const template = getMissionTemplateById(templateId)
    const shouldReplace =
      stages.length === 0 ||
      window.confirm(`Reemplazar la ruta local actual por la plantilla "${template.title}"? Guarda después para persistir.`)

    if (!shouldReplace) return

    const mapCenter =
      overview?.config?.map_center ||
      config?.map_center ||
      ([40.4168, -3.7038] as [number, number])

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
        config_summary: Array.from(new Set([...patch.config_summary, ...Object.keys(requirementConfig)])),
        messages: patch.messages,
        ...physicalFields,
      } as EditableAdminStage
    })

    const familyCounts = nextStages.reduce<Record<string, number>>((acc, stage) => {
      const family = stage.type || 'signal_hunt'
      acc[family] = (acc[family] || 0) + 1
      return acc
    }, {})

    setOverview((current) => current
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
    setSaveState('idle')
    setLocalNotice(`Plantilla "${template.title}" creada en local. Revisa los nodos y pulsa Guardar.`)
  }

  function createLocalNodeAt(lat?: number, lon?: number) {
    const mapCenter =
      overview?.config?.map_center ||
      config?.map_center ||
      ([40.4168, -3.7038] as [number, number])

    const mappedStagesForCenter = stages.filter(
      (stage) => typeof stage.lat === 'number' && typeof stage.lon === 'number'
    )

    const routeCenter: [number, number] = mappedStagesForCenter.length > 0
      ? [
          mappedStagesForCenter.reduce((sum, stage) => sum + Number(stage.lat), 0) / mappedStagesForCenter.length,
          mappedStagesForCenter.reduce((sum, stage) => sum + Number(stage.lon), 0) / mappedStagesForCenter.length,
        ]
      : mapCenter

    const nextIndex = stages.length
    const nextLat = typeof lat === 'number' ? lat : routeCenter[0]
    const nextLon = typeof lon === 'number' ? lon : routeCenter[1]

    const nextStage: EditableAdminStage = {
      id: `local-${Date.now()}`,
      index: nextIndex,
      title: `NEW NODE ${nextIndex + 1}`,
      type: 'signal_hunt',
      label: 'Signal Hunt',
      lat: nextLat,
      lon: nextLon,
      radius: 50,
      entry_mode: 'gps',
      require_proximity: true,
      has_hint: false,
      has_manual_fallback: false,
      content: '',
      objective: 'proximity_lock',
      config: getDefaultAdminConfigForFamily('signal_hunt'),
      config_summary: Object.keys(getDefaultAdminConfigForFamily('signal_hunt')),
      messages: {
        hint: '',
        gps_unavailable: 'GPS unavailable message.',
        locked: 'Move closer to unlock this node.',
      },
    }

    setCmsPanel('none')
    setSaveState('idle')
    syncLocalStage(nextStage)
    setSelectedStage(nextStage)
    setLocalNotice(
      typeof lat === 'number' && typeof lon === 'number'
        ? 'Nodo creado aquí. Edita el tipo y guarda cuando esté listo.'
        : 'Nodo creado en el centro de la ruta. Muévelo o edita coordenadas antes de guardar.'
    )
  }

  function moveLocalStage(
    stageToMove: AdminReactOverviewStage,
    lat: number,
    lon: number
  ) {
    const movedStage: AdminReactOverviewStage = {
      ...stageToMove,
      lat,
      lon,
    }

    setSaveState('idle')
    syncLocalStage(movedStage)
    setLocalNotice('Node moved on map. Save changes to persist the new position.')
  }


  function handleOverviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    loadOverview()
  }

  if (!overviewReady) {
    return (
      <main className="admin-root admin-root-login-only">
        <style>{styles}</style>

        <section className="admin-login-minimal" aria-label="Admin login">
          <div className="admin-login-orb admin-login-orb-a" aria-hidden="true" />
          <div className="admin-login-orb admin-login-orb-b" aria-hidden="true" />

          <form onSubmit={handleOverviewSubmit} className="admin-login-card admin-login-card-minimal">
            <div className="admin-brand">SAGA ENGINE · ADMIN</div>

            <div className="admin-login-copy">
              <h1>Mission Control</h1>
              <p>Protected admin access</p>
            </div>

            <div className="admin-login-form">
              <label>Admin password</label>
              <input
                type="password"
                value={password}
                placeholder="Enter admin password once"
                autoComplete="current-password"
                autoFocus
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="submit" disabled={overviewState === 'loading'}>
                {overviewState === 'loading' ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>

            {overviewState === 'error' ? (
              <div className="admin-error">
                <strong>Access denied</strong>
                <span>{overviewError}</span>
              </div>
            ) : null}

            {state === 'error' ? (
              <div className="admin-error">
                <strong>Public config unavailable</strong>
                <span>{error}</span>
              </div>
            ) : null}

            <div className="admin-login-foot">
              <span>No mission data is shown before unlock.</span>
              <div>
                <a href="/">Player entry</a>
              </div>
            </div>
          </form>
        </section>
      </main>
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
        playerDrafts={playerDrafts}
        playerSaveState={playerSaveState}
        playerSaveError={playerSaveError}
      profileProgress={Object.fromEntries((profiles || []).map((profile) => [
        profile.id,
        {
          level: profile.level ?? 0,
          finished: Boolean(profile.finished),
        },
      ]))}
      profileActionState={profileActionState}
      profileActionError={profileActionError}
      onProfileAction={runPlayerProfileAction}
        missionDraft={missionDraft}
        settingsSaveState={settingsSaveState}
        settingsSaveError={settingsSaveError}
        onRefresh={loadOverview}
        onSelectStage={setSelectedStage}
        onCreateNode={() => createLocalNodeAt()}
        onCreateNodeAt={createLocalNodeAt}
        onMoveStage={moveLocalStage}
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
        onApplyMissionTemplate={applyMissionTemplate}
      />
    </>
  )

}

function StatCard({
  item,
  compact = false,
}: {
  item: { label: string; value: string; detail: string }
  compact?: boolean
}) {
  return (
    <article className={compact ? 'admin-stat compact' : 'admin-stat'}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </article>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="admin-section-head">
      <h2>{title}</h2>
      <span className="pill neutral">{count}</span>
    </div>
  )
}

function ProfileCard({ profile }: { profile: AdminReactOverviewProfile }) {
  const finished = Boolean(profile.finished)
  const gps = String(profile.gps_status || 'unknown')
  const lastSeen = formatLastSeen(profile.last_seen)

  return (
    <article className="admin-profile-card">
      <div>
        <strong>{profile.display_name || profile.id}</strong>
        <small>{profile.mode || 'solo'} · {profile.status || 'active'}</small>
      </div>

      <div className="admin-badge-row">
        <span className={finished ? 'pill ok' : 'pill neutral'}>
          {finished ? 'Finished' : `Level ${profile.level ?? 0}`}
        </span>
        <span className={gpsClass(gps)}>GPS {gps}</span>
        <span className="pill neutral">{profile.presence || 'unknown'}</span>
      </div>

      <small>{lastSeen}</small>
    </article>
  )
}

function NodeCard({
  stage,
  selected,
  onOpen,
}: {
  stage: AdminReactOverviewStage
  selected: boolean
  onOpen: () => void
}) {
  const radius = stage.radius ?? 50
  const family = familyCards.find((item) => item.id === stage.type)
  const coords = formatCoords(stage.lat, stage.lon)

  return (
    <button type="button" className={selected ? 'admin-node-card selected' : 'admin-node-card'} onClick={onOpen}>
      <div className="admin-node-top">
        <span>{stage.index + 1}</span>
        <div>
          <strong>{stage.title || 'Untitled node'}</strong>
          <small>{family?.icon || '◇'} {stage.label || stage.type}</small>
        </div>
      </div>

      <div className="admin-node-meta">
        <span>{stage.entry_mode || 'gps'}</span>
        <span>{radius}m</span>
        <span>{coords}</span>
      </div>
    </button>
  )
}


function formatCoords(lat?: number | null, lon?: number | null) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '—'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

function formatLastSeen(value?: number | string | null) {
  if (value === undefined || value === null || value === '') return 'No heartbeat yet'

  let ts: number | null = null

  if (typeof value === 'number') {
    ts = value
  } else {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      ts = asNumber
    } else {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) ts = Math.floor(parsed / 1000)
    }
  }

  if (!ts) return 'No heartbeat yet'
  if (ts > 1000000000000) ts = Math.floor(ts / 1000)

  const now = Math.floor(Date.now() / 1000)
  const delta = Math.max(0, now - ts)

  if (delta < 60) return 'Seen just now'
  if (delta < 3600) return `Seen ${Math.floor(delta / 60)} min ago`
  if (delta < 86400) return `Seen ${Math.floor(delta / 3600)} h ago`
  return `Seen ${Math.floor(delta / 86400)} d ago`
}

function gpsClass(gps: string) {
  const normalized = gps.toLowerCase()
  if (normalized === 'ok' || normalized === 'ready') return 'pill ok'
  if (normalized === 'searching' || normalized === 'stale') return 'pill warn'
  return 'pill neutral'
}

const styles = `
* {
  box-sizing: border-box;
}

.admin-root {
  min-height: 100vh;
  padding: 14px;
  color: #e5eefc;
  background:
    radial-gradient(circle at 0% 0%, rgba(56,189,248,0.18), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(34,197,94,0.12), transparent 30%),
    #020617;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.admin-login-layout,
.admin-console-layout {
  min-height: calc(100vh - 28px);
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 14px;
}

.admin-login-card,
.admin-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid rgba(148,163,184,0.24);
  background: rgba(15,23,42,0.76);
  box-shadow: 0 24px 80px rgba(0,0,0,0.34);
  backdrop-filter: blur(20px);
}

.admin-sidebar {
  overflow: auto;
}

.admin-brand {
  width: fit-content;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(56,189,248,0.10);
  border: 1px solid rgba(56,189,248,0.22);
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.admin-login-card h1,
.admin-sidebar h1 {
  margin: 0;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.07em;
}

.admin-sidebar h1 {
  font-size: 28px;
}

.admin-login-card p,
.admin-sidebar p {
  margin: 8px 0 0;
  color: #94a3b8;
  line-height: 1.45;
}

.admin-login-form {
  display: grid;
  gap: 9px;
}

.admin-login-form label,
.admin-detail-block > span,
.admin-kicker {
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.admin-login-form input {
  height: 44px;
  border: 1px solid rgba(148,163,184,0.25);
  border-radius: 16px;
  background: rgba(2,6,23,0.62);
  color: #e5eefc;
  padding: 0 13px;
  outline: none;
}

.admin-login-form button,
.admin-sidebar-actions button,
.admin-drawer-head button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #020617;
  font-weight: 950;
  cursor: pointer;
}

.admin-link-row,
.admin-sidebar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-link-row {
  margin-top: auto;
}

.admin-link-row a,
.admin-sidebar-actions a {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148,163,184,0.24);
  color: #dbeafe;
  background: rgba(15,23,42,0.54);
  text-decoration: none;
  font-weight: 850;
  font-size: 12px;
}

.admin-locked-workspace,
.admin-workspace {
  min-width: 0;
  display: grid;
  gap: 14px;
}

.admin-locked-workspace {
  grid-template-rows: auto minmax(360px, 1fr) auto auto;
  padding: 18px;
  border-radius: 30px;
  border: 1px solid rgba(148,163,184,0.22);
  background: rgba(15,23,42,0.48);
  box-shadow: 0 24px 80px rgba(0,0,0,0.26);
  backdrop-filter: blur(18px);
}

.admin-workspace {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.admin-workspace-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-radius: 24px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.62);
  backdrop-filter: blur(18px);
}

.admin-workspace-bar h2 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.05em;
}

.admin-locked-map {
  position: relative;
  min-height: 420px;
  border-radius: 30px;
  overflow: hidden;
  border: 1px solid rgba(148,163,184,0.18);
  background:
    linear-gradient(135deg, rgba(15,23,42,0.92), rgba(2,6,23,0.92)),
    radial-gradient(circle at 50% 50%, rgba(56,189,248,0.30), transparent 28%);
}

.admin-grid-bg {
  position: absolute;
  inset: 0;
  opacity: 0.24;
  background-image:
    linear-gradient(rgba(125,211,252,.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125,211,252,.18) 1px, transparent 1px);
  background-size: 44px 44px;
}

.admin-locked-message {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(420px, calc(100% - 40px));
  transform: translate(-50%, -50%);
  display: grid;
  gap: 8px;
  padding: 20px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(2,6,23,0.76);
  backdrop-filter: blur(20px);
  text-align: center;
  color: #cbd5e1;
}

.admin-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.admin-sidebar-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.admin-stat {
  padding: 13px;
  border-radius: 18px;
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.42);
}

.admin-stat.compact {
  padding: 11px;
}

.admin-stat span {
  color: #8aa0bd;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.admin-stat strong {
  display: block;
  margin-top: 5px;
  font-size: 20px;
  font-weight: 950;
  letter-spacing: -0.05em;
  word-break: break-word;
}

.admin-stat small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
}

.admin-family-compact-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.admin-family-compact,
.admin-family-row,
.admin-profile-card,
.admin-node-card,
.admin-muted,
.admin-detail-item,
.admin-detail-block {
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.35);
  border-radius: 18px;
}

.admin-family-compact {
  display: flex;
  gap: 10px;
  padding: 13px;
  color: #cbd5e1;
}

.admin-family-compact > span,
.admin-family-row > span {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: rgba(56,189,248,0.12);
  flex: 0 0 auto;
}

.admin-family-compact small,
.admin-family-row small,
.admin-profile-card small,
.admin-node-card small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
}

.admin-map-area {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
}

.admin-node-rail {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: 28px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.60);
  backdrop-filter: blur(18px);
}

.admin-node-rail-head,
.admin-section-head,
.admin-profile-card > div:first-child {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.admin-node-rail-head h3,
.admin-section-head h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.04em;
}

.admin-node-list,
.admin-profile-list,
.admin-family-count-list {
  display: grid;
  gap: 9px;
}

.admin-node-list {
  overflow: auto;
  padding-right: 2px;
}

.admin-node-card {
  width: 100%;
  color: inherit;
  text-align: left;
  padding: 12px;
  cursor: pointer;
  font: inherit;
}

.admin-node-card.selected {
  border-color: rgba(56,189,248,0.52);
  background: rgba(8,47,73,0.44);
  box-shadow: 0 0 0 1px rgba(56,189,248,0.16) inset;
}

.admin-node-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-node-top > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(129,140,248,0.18);
  font-weight: 950;
}

.admin-node-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
  color: #94a3b8;
  font-size: 11px;
}

.admin-profile-card,
.admin-muted {
  padding: 12px;
}

.admin-badge-row,
.admin-topbar-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.admin-family-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 10px;
}

.pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
}

.pill.ok {
  border: 1px solid rgba(34,197,94,0.26);
  background: rgba(34,197,94,0.14);
  color: #bbf7d0;
}

.pill.warn {
  border: 1px solid rgba(251,191,36,0.26);
  background: rgba(251,191,36,0.12);
  color: #fde68a;
}

.pill.neutral {
  border: 1px solid rgba(148,163,184,0.20);
  background: rgba(148,163,184,0.10);
  color: #cbd5e1;
}

.admin-error {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(248,113,113,0.28);
  background: rgba(127,29,29,0.22);
  color: #fecaca;
  font-size: 12px;
}

.admin-operator-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px;
  border-radius: 20px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.58);
  color: #cbd5e1;
}

.admin-operator-strip span {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12px;
}

.admin-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  background: rgba(2,6,23,0.58);
  backdrop-filter: blur(8px);
}

.admin-drawer {
  width: min(560px, 100%);
  height: 100%;
  overflow: auto;
  border-left: 1px solid rgba(148,163,184,0.22);
  background: rgba(15,23,42,0.94);
  box-shadow: -24px 0 80px rgba(0,0,0,0.40);
}

.admin-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid rgba(148,163,184,0.18);
  background: rgba(15,23,42,0.92);
  backdrop-filter: blur(18px);
}

.admin-drawer-head h2 {
  margin: 6px 0 0;
  font-size: 26px;
  line-height: 1.05;
  letter-spacing: -0.05em;
}

.admin-drawer-body {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.admin-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.admin-detail-item {
  display: grid;
  gap: 4px;
  padding: 12px;
}

.admin-detail-item span {
  color: #8aa0bd;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.admin-detail-block {
  display: grid;
  gap: 8px;
  padding: 14px;
}

.admin-detail-block p {
  margin: 0;
  color: #dbeafe;
  line-height: 1.55;
}

.admin-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.admin-chip-wrap code {
  padding: 5px 8px;
  border-radius: 999px;
  color: #bae6fd;
  background: rgba(14,165,233,0.12);
  border: 1px solid rgba(14,165,233,0.20);
  font-size: 11px;
}

@media (max-width: 1100px) {
  .admin-login-layout,
  .admin-console-layout {
    grid-template-columns: 1fr;
  }

  .admin-map-area {
    grid-template-columns: 1fr;
  }

  .admin-stat-grid,
  .admin-family-compact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .admin-root {
    padding: 8px;
  }

  .admin-stat-grid,
  .admin-family-compact-grid,
  .admin-sidebar-stats,
  .admin-detail-grid {
    grid-template-columns: 1fr;
  }

  .admin-login-card h1 {
    font-size: 34px;
  }
}

/* Minimal protected login pass */
.admin-root-login-only {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 18px;
  background:
    radial-gradient(circle at 22% 18%, rgba(125,211,252,0.22), transparent 30%),
    radial-gradient(circle at 78% 12%, rgba(129,140,248,0.18), transparent 30%),
    radial-gradient(circle at 50% 95%, rgba(34,197,94,0.12), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 38%, #b9c9dc 100%);
}

.admin-login-minimal {
  position: relative;
  width: min(430px, 100%);
}

.admin-login-card-minimal {
  position: relative;
  z-index: 2;
  min-height: auto;
  padding: 24px;
  border-radius: 34px;
  border: 1px solid rgba(255,255,255,0.62);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.42)),
    rgba(255,255,255,0.36);
  box-shadow:
    0 30px 90px rgba(15,23,42,0.22),
    inset 0 1px 0 rgba(255,255,255,0.74);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  color: #0f172a;
}

.admin-login-card-minimal .admin-brand {
  background: rgba(14,165,233,0.12);
  border-color: rgba(14,165,233,0.18);
  color: #0369a1;
}

.admin-login-copy {
  display: grid;
  gap: 8px;
  margin: 20px 0 18px;
}

.admin-login-card-minimal h1 {
  margin: 0;
  color: #0f172a;
  font-size: 42px;
  line-height: 0.92;
  letter-spacing: -0.08em;
}

.admin-login-card-minimal p {
  margin: 0;
  color: #475569;
  font-size: 14px;
}

.admin-login-card-minimal .admin-login-form label {
  color: #0369a1;
}

.admin-login-card-minimal .admin-login-form input {
  height: 48px;
  border-color: rgba(15,23,42,0.12);
  background: rgba(255,255,255,0.62);
  color: #0f172a;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form input::placeholder {
  color: #64748b;
}

.admin-login-card-minimal .admin-login-form input:focus {
  border-color: rgba(14,165,233,0.52);
  box-shadow:
    0 0 0 4px rgba(14,165,233,0.12),
    inset 0 1px 0 rgba(255,255,255,0.70);
}

.admin-login-card-minimal .admin-login-form button {
  height: 48px;
  box-shadow: 0 14px 30px rgba(59,130,246,0.28);
}

.admin-login-card-minimal .admin-error {
  border-color: rgba(239,68,68,0.25);
  background: rgba(254,226,226,0.72);
  color: #7f1d1d;
}

.admin-login-foot {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  color: #64748b;
  font-size: 12px;
}

.admin-login-foot > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-login-foot a {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.38);
  color: #334155;
  text-decoration: none;
  font-weight: 850;
}

.admin-login-orb {
  position: absolute;
  z-index: 1;
  border-radius: 999px;
  filter: blur(2px);
  opacity: 0.72;
  pointer-events: none;
}

.admin-login-orb-a {
  width: 180px;
  height: 180px;
  left: -64px;
  top: -62px;
  background: radial-gradient(circle, rgba(56,189,248,0.60), transparent 68%);
}

.admin-login-orb-b {
  width: 220px;
  height: 220px;
  right: -86px;
  bottom: -82px;
  background: radial-gradient(circle, rgba(129,140,248,0.45), transparent 70%);
}

@media (max-width: 700px) {
  .admin-root-login-only {
    padding: 12px;
  }

  .admin-login-card-minimal {
    border-radius: 28px;
    padding: 20px;
  }

  .admin-login-card-minimal h1 {
    font-size: 36px;
  }
}


/* Unlocked workspace glass pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  color: #102033;
  background:
    radial-gradient(circle at 12% 8%, rgba(56,189,248,0.22), transparent 30%),
    radial-gradient(circle at 88% 6%, rgba(129,140,248,0.18), transparent 32%),
    radial-gradient(circle at 55% 96%, rgba(34,197,94,0.10), transparent 34%),
    linear-gradient(180deg, #eef6ff 0%, #dbeafe 42%, #c4d5e8 100%);
}

.admin-root:not(.admin-root-login-only) .admin-console-layout {
  height: calc(100vh - 20px);
  min-height: 0;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar,
.admin-root:not(.admin-root-login-only) .admin-workspace-bar,
.admin-root:not(.admin-root-login-only) .admin-node-rail,
.admin-root:not(.admin-root-login-only) .admin-operator-strip,
.admin-root:not(.admin-root-login-only) .admin-stat,
.admin-root:not(.admin-root-login-only) .admin-profile-card,
.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-node-card,
.admin-root:not(.admin-root-login-only) .admin-muted {
  border-color: rgba(255,255,255,0.56);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.34)),
    rgba(255,255,255,0.30);
  box-shadow:
    0 18px 42px rgba(15,23,42,0.10),
    inset 0 1px 0 rgba(255,255,255,0.58);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  padding: 14px;
  border-radius: 30px;
  gap: 12px;
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar h1 {
  font-size: 23px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p,
.admin-root:not(.admin-root-login-only) .admin-stat small,
.admin-root:not(.admin-root-login-only) .admin-profile-card small,
.admin-root:not(.admin-root-login-only) .admin-node-card small,
.admin-root:not(.admin-root-login-only) .admin-family-row small,
.admin-root:not(.admin-root-login-only) .admin-operator-strip span {
  color: #516276;
}

.admin-root:not(.admin-root-login-only) .admin-brand {
  background: rgba(14,165,233,0.12);
  border-color: rgba(14,165,233,0.20);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a,
.admin-root:not(.admin-root-login-only) .admin-drawer-head button {
  min-height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button {
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #07111f;
  box-shadow: 0 12px 28px rgba(59,130,246,0.22);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a {
  color: #334155;
  background: rgba(255,255,255,0.45);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-stat {
  padding: 10px;
  border-radius: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-stat strong {
  color: #0f172a;
  font-size: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-stat span,
.admin-root:not(.admin-root-login-only) .admin-kicker,
.admin-root:not(.admin-root-login-only) .admin-detail-block > span {
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar {
  min-height: 74px;
  padding: 14px 16px;
  border-radius: 28px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar h2 {
  font-size: 24px;
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section {
  min-height: 0 !important;
  height: 100% !important;
  border-radius: 32px !important;
  border-color: rgba(255,255,255,0.58) !important;
  box-shadow:
    0 26px 80px rgba(15,23,42,0.18),
    inset 0 1px 0 rgba(255,255,255,0.55) !important;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail {
  min-height: 0;
  overflow: hidden;
  padding: 12px;
  border-radius: 28px;
}

.admin-root:not(.admin-root-login-only) .admin-node-list {
  max-height: calc(100vh - 220px);
  overflow: auto;
  padding-right: 2px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card {
  color: #102033;
  border-radius: 18px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card.selected {
  border-color: rgba(14,165,233,0.46);
  background:
    linear-gradient(180deg, rgba(224,242,254,0.80), rgba(255,255,255,0.44)),
    rgba(186,230,253,0.40);
  box-shadow:
    0 16px 36px rgba(14,165,233,0.14),
    inset 0 1px 0 rgba(255,255,255,0.74);
}

.admin-root:not(.admin-root-login-only) .admin-node-top > span {
  background: rgba(14,165,233,0.14);
  color: #0369a1;
}

.admin-root:not(.admin-root-login-only) .pill.ok {
  color: #166534;
  border-color: rgba(22,101,52,0.16);
  background: rgba(187,247,208,0.62);
}

.admin-root:not(.admin-root-login-only) .pill.warn {
  color: #92400e;
  border-color: rgba(146,64,14,0.16);
  background: rgba(254,243,199,0.70);
}

.admin-root:not(.admin-root-login-only) .pill.neutral {
  color: #334155;
  border-color: rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.46);
}

.admin-disclosure {
  display: grid;
  gap: 8px;
}

.admin-disclosure summary {
  list-style: none;
  cursor: pointer;
}

.admin-disclosure summary::-webkit-details-marker {
  display: none;
}

.admin-disclosure summary .admin-section-head,
.admin-disclosure summary .admin-node-rail-head {
  position: relative;
  padding-right: 22px;
}

.admin-disclosure summary .admin-section-head::after,
.admin-disclosure summary .admin-node-rail-head::after {
  content: "⌄";
  position: absolute;
  right: 0;
  top: 2px;
  color: #64748b;
  font-weight: 900;
  transition: transform .18s ease;
}

.admin-disclosure[open] summary .admin-section-head::after,
.admin-disclosure[open] summary .admin-node-rail-head::after {
  transform: rotate(180deg);
}

.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-profile-card {
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay {
  background: rgba(148,163,184,0.30);
  backdrop-filter: blur(12px);
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.58)),
    rgba(255,255,255,0.54);
  color: #102033;
  border-left: 1px solid rgba(255,255,255,0.64);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  background: rgba(255,255,255,0.70);
  border-bottom-color: rgba(15,23,42,0.08);
  color: #0f172a;
}

.admin-root:not(.admin-root-login-only) .admin-detail-item,
.admin-root:not(.admin-root-login-only) .admin-detail-block {
  background: rgba(255,255,255,0.46);
  border-color: rgba(15,23,42,0.08);
  color: #102033;
}

.admin-root:not(.admin-root-login-only) .admin-detail-block p {
  color: #102033;
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }

  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    height: auto;
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area {
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area > section {
    min-height: 520px !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-node-list {
    max-height: none;
  }
}

@media (max-width: 760px) {
  .admin-root:not(.admin-root-login-only) {
    padding: 8px;
  }

  .admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
    grid-template-columns: 1fr;
  }

  .admin-root:not(.admin-root-login-only) .admin-workspace-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}


/* Map-first CMS workspace tightening */
.admin-root:not(.admin-root-login-only) .admin-console-layout {
  grid-template-columns: 280px minmax(0, 1fr);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  padding: 12px;
  gap: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar h1 {
  font-size: 20px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p {
  font-size: 12px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats {
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.admin-root:not(.admin-root-login-only) .admin-stat {
  padding: 8px;
  border-radius: 15px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.07),
    inset 0 1px 0 rgba(255,255,255,0.55);
}

.admin-root:not(.admin-root-login-only) .admin-stat strong {
  font-size: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-stat small {
  font-size: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar {
  min-height: 58px;
  padding: 10px 13px;
  border-radius: 23px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar h2 {
  font-size: 22px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  grid-template-columns: minmax(0, 1fr) 245px;
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section {
  border-radius: 26px !important;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail {
  padding: 9px;
  border-radius: 22px;
}

.admin-root:not(.admin-root-login-only) .admin-node-rail-head h3 {
  font-size: 15px;
}

.admin-root:not(.admin-root-login-only) .admin-node-list {
  max-height: calc(100vh - 168px);
  gap: 7px;
}

.admin-root:not(.admin-root-login-only) .admin-node-card {
  padding: 9px;
  border-radius: 15px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.07),
    inset 0 1px 0 rgba(255,255,255,0.55);
}

.admin-root:not(.admin-root-login-only) .admin-node-top {
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-node-top > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-node-meta {
  grid-template-columns: 1fr;
  gap: 3px;
  margin-top: 7px;
  font-size: 10px;
}

.admin-root:not(.admin-root-login-only) .admin-profile-card,
.admin-root:not(.admin-root-login-only) .admin-family-row,
.admin-root:not(.admin-root-login-only) .admin-muted {
  border-radius: 15px;
  padding: 9px;
  box-shadow:
    0 10px 24px rgba(15,23,42,0.06),
    inset 0 1px 0 rgba(255,255,255,0.52);
}

.admin-root:not(.admin-root-login-only) .admin-profile-list,
.admin-root:not(.admin-root-login-only) .admin-family-count-list {
  gap: 7px;
}

.admin-root:not(.admin-root-login-only) .admin-family-row {
  grid-template-columns: 28px minmax(0, 1fr) auto;
}

.admin-root:not(.admin-root-login-only) .admin-family-row > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.admin-cms-actions {
  align-items: center;
}

.admin-cms-action {
  min-height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.52);
  color: #334155;
  font-weight: 900;
  font-size: 11px;
  cursor: pointer;
}

.admin-cms-action.primary {
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #07111f;
  border-color: transparent;
  box-shadow: 0 10px 22px rgba(59,130,246,0.18);
}

.admin-operator-strip-compact {
  min-height: 50px;
  padding: 9px 12px !important;
  border-radius: 18px !important;
}

.admin-root:not(.admin-root-login-only) .admin-operator-strip-compact span {
  font-size: 11px;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(520px, 100%);
}

@media (min-width: 1500px) {
  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
}

@media (max-width: 1200px) {
  .admin-root:not(.admin-root-login-only) .admin-map-area > section {
    min-height: 620px !important;
  }
}


/* Legacy operator shell pass */
.admin-root:not(.admin-root-login-only) {
  height: 100vh;
  overflow: hidden;
  padding: 10px;
  background:
    radial-gradient(circle at 18% 12%, rgba(16,185,129,0.12), transparent 28%),
    radial-gradient(circle at 84% 10%, rgba(59,130,246,0.10), transparent 30%),
    linear-gradient(180deg, #0b1220 0%, #0f172a 58%, #111827 100%);
}

.admin-root:not(.admin-root-login-only) .admin-console-layout {
  height: calc(100vh - 20px) !important;
  min-height: 0 !important;
  grid-template-columns: 340px minmax(0, 1fr) !important;
  gap: 10px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar {
  width: auto !important;
  min-width: 0 !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: auto !important;
  padding: 14px !important;
  gap: 12px !important;
  border-radius: 28px !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)),
    rgba(17,24,39,0.74) !important;
  box-shadow:
    0 20px 60px rgba(0,0,0,0.28),
    inset 0 1px 0 rgba(255,255,255,0.08) !important;
  backdrop-filter: blur(22px) saturate(135%);
  -webkit-backdrop-filter: blur(22px) saturate(135%);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar .admin-brand {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  width: auto !important;
  min-height: 40px !important;
  padding: 0 14px !important;
  border-radius: 18px !important;
  font-size: 11px !important;
  letter-spacing: 0.22em !important;
  background: rgba(255,255,255,0.08) !important;
  color: #86efac !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1 {
  margin: 0 !important;
  font-size: 18px !important;
  line-height: 1.04 !important;
  letter-spacing: -0.05em !important;
  color: #f8fafc !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) p {
  color: rgba(255,255,255,0.46) !important;
  font-size: 12px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions a {
  min-height: 42px !important;
  height: 42px !important;
  padding: 0 12px !important;
  border-radius: 14px !important;
  font-size: 12px !important;
  font-weight: 900 !important;
  text-decoration: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-stats,
.admin-root:not(.admin-root-login-only) .admin-sidebar .admin-disclosure {
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.08);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
    rgba(255,255,255,0.03);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 12px 30px rgba(0,0,0,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head {
  display: grid;
  gap: 4px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3 {
  margin: 0;
  color: #f8fafc;
  font-size: 14px;
  line-height: 1.1;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-actions {
  display: grid;
  gap: 8px;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 900;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover {
  transform: translateY(-1px);
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.14);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--primary {
  background: linear-gradient(135deg, rgba(16,185,129,0.28), rgba(14,165,233,0.22));
  color: #f8fafc;
  border-color: rgba(110,231,183,0.22);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(255,255,255,0.50);
  font-size: 11px;
  line-height: 1.4;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-list {
  display: grid;
  gap: 8px;
  max-height: 320px;
  overflow: auto;
  padding-right: 2px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #e5e7eb;
  text-align: left;
  cursor: pointer;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item.active {
  background: rgba(59,130,246,0.16);
  border-color: rgba(96,165,250,0.26);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item > span {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255,255,255,0.10);
  color: #93c5fd;
  font-size: 13px;
  font-weight: 900;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  display: block;
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.15;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item small {
  display: block;
  margin-top: 4px;
  color: rgba(255,255,255,0.54);
  font-size: 10px;
  line-height: 1.35;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-empty {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.50);
  font-size: 11px;
}

.admin-root:not(.admin-root-login-only) .admin-workspace {
  height: 100% !important;
  min-height: 0 !important;
  grid-template-rows: minmax(0, 1fr) !important;
  gap: 0 !important;
}

.admin-root:not(.admin-root-login-only) .admin-workspace-bar,
.admin-root:not(.admin-root-login-only) .admin-topbar-pills,
.admin-root:not(.admin-root-login-only) .admin-operator-strip,
.admin-root:not(.admin-root-login-only) .admin-operator-strip-compact,
.admin-root:not(.admin-root-login-only) .admin-node-rail {
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-map-area {
  height: 100% !important;
  min-height: 0 !important;
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 0 !important;
}

.admin-root:not(.admin-root-login-only) .admin-map-area > section:first-child {
  height: 100% !important;
  min-height: 0 !important;
  border-radius: 28px !important;
  overflow: hidden !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03)),
    rgba(255,255,255,0.03) !important;
  box-shadow:
    0 22px 60px rgba(0,0,0,0.24),
    inset 0 1px 0 rgba(255,255,255,0.08) !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  width: min(480px, calc(100vw - 28px)) !important;
  border-left: 1px solid rgba(255,255,255,0.08) !important;
  background:
    linear-gradient(180deg, rgba(17,24,39,0.92), rgba(17,24,39,0.96)) !important;
  backdrop-filter: blur(24px) saturate(125%);
  -webkit-backdrop-filter: blur(24px) saturate(125%);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head,
.admin-root:not(.admin-root-login-only) .admin-drawer-body {
  padding: 16px !important;
}

.admin-root:not(.admin-root-login-only) .admin-detail-grid {
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.admin-root:not(.admin-root-login-only) .admin-detail-item,
.admin-root:not(.admin-root-login-only) .admin-detail-block {
  border-radius: 16px !important;
  padding: 12px !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  background: rgba(255,255,255,0.03) !important;
}

@media (max-width: 1180px) {
  .admin-root:not(.admin-root-login-only) {
    height: auto;
    overflow: auto;
  }

  .admin-root:not(.admin-root-login-only) .admin-console-layout {
    height: auto !important;
    grid-template-columns: 1fr !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-sidebar {
    height: auto !important;
  }

  .admin-root:not(.admin-root-login-only) .admin-map-area > section:first-child {
    min-height: 72vh !important;
  }
}



/* Local CMS actions and editable drawer pass */
.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1,
.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  text-shadow: 0 1px 0 rgba(0,0,0,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action.active {
  background: rgba(59,130,246,0.22);
  border-color: rgba(147,197,253,0.34);
  color: #f8fafc;
}

.admin-local-notice {
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(110,231,183,0.18);
  background: rgba(16,185,129,0.12);
  color: rgba(236,253,245,0.86);
  font-size: 11px;
  line-height: 1.35;
}

.admin-cms-local-panel {
  display: grid;
  gap: 9px;
  padding: 11px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
}

.admin-cms-local-panel > strong {
  color: #f8fafc;
  font-size: 13px;
}

.admin-cms-local-panel > span,
.admin-cms-local-panel label {
  color: rgba(255,255,255,0.58);
  font-size: 11px;
  line-height: 1.35;
}

.admin-cms-local-panel label {
  display: grid;
  gap: 5px;
}

.admin-cms-local-panel input {
  min-height: 36px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(15,23,42,0.54);
  color: #f8fafc;
}

.admin-local-list {
  display: grid;
  gap: 6px;
}

.admin-local-row {
  display: grid;
  gap: 3px;
  min-height: 40px;
  padding: 8px 9px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: #f8fafc;
  text-align: left;
}

.admin-local-row.static {
  cursor: default;
}

.admin-local-row small {
  color: rgba(255,255,255,0.52);
}

.admin-drawer-editable .admin-drawer-body {
  gap: 12px;
}

.admin-edit-section {
  display: grid;
  gap: 10px;
  padding: 13px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.035);
}

.admin-edit-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.admin-edit-section-head strong {
  color: #f8fafc;
  font-size: 13px;
}

.admin-edit-section-head span {
  color: rgba(255,255,255,0.48);
  font-size: 11px;
}

.admin-edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.admin-edit-field {
  display: grid;
  gap: 6px;
  color: rgba(255,255,255,0.62);
  font-size: 11px;
  font-weight: 850;
}

.admin-edit-field input,
.admin-edit-field select,
.admin-edit-field textarea {
  width: 100%;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  background: rgba(15,23,42,0.56);
  color: #f8fafc;
  padding: 10px;
  font: inherit;
  outline: none;
}

.admin-edit-field input,
.admin-edit-field select {
  min-height: 39px;
}

.admin-edit-field textarea {
  resize: vertical;
  line-height: 1.45;
}

.admin-edit-field input:focus,
.admin-edit-field select:focus,
.admin-edit-field textarea:focus {
  border-color: rgba(96,165,250,0.48);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.16);
}

.admin-edit-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255,255,255,0.72);
  font-size: 12px;
  font-weight: 850;
}

.admin-edit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

@media (max-width: 620px) {
  .admin-edit-grid,
  .admin-edit-actions {
    grid-template-columns: 1fr;
  }
}



/* Persistent save flow pass */
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: rgba(14,165,233,0.16);
  border-color: rgba(125,211,252,0.26);
  color: #e0f2fe;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save:disabled {
  opacity: 0.68;
  cursor: wait;
}

.admin-save-error {
  display: grid;
  gap: 4px;
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid rgba(248,113,113,0.26);
  background: rgba(127,29,29,0.24);
  color: #fecaca;
  font-size: 11px;
  line-height: 1.35;
}

.admin-save-error strong {
  color: #fee2e2;
}



/* Delete node and CMS clarity pass */
.admin-root:not(.admin-root-login-only) .admin-sidebar {
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.45) transparent;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) h1 {
  color: #ffffff !important;
  font-size: 19px !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar > div:nth-of-type(2) p {
  color: rgba(226,232,240,0.76) !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions {
  grid-template-columns: 1fr !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button {
  text-align: left;
  justify-content: flex-start;
  background: rgba(14,165,233,0.12) !important;
  border-color: rgba(125,211,252,0.18) !important;
  color: #e0f2fe !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms {
  gap: 12px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3 {
  font-size: 15px;
  color: #ffffff;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(226,232,240,0.76);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action::after {
  content: "›";
  opacity: .45;
  font-size: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--primary::after,
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save::after,
.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger::after {
  content: "";
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger {
  background: rgba(127,29,29,0.30);
  border-color: rgba(248,113,113,0.30);
  color: #fecaca;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger:hover {
  background: rgba(153,27,27,0.42);
  border-color: rgba(252,165,165,0.38);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-list {
  max-height: 44vh;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  position: relative;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item.active {
  box-shadow: inset 0 0 0 1px rgba(147,197,253,0.20), 0 12px 28px rgba(0,0,0,0.18);
}

.admin-sidebar-node-coords {
  color: rgba(186,230,253,0.70) !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.admin-edit-actions-three {
  grid-template-columns: 1fr 1fr 1fr;
}

.admin-drawer-editable .admin-drawer-head h2 {
  color: #ffffff;
}

.admin-root:not(.admin-root-login-only) .admin-local-notice {
  color: #d1fae5;
}

@media (max-width: 760px) {
  .admin-edit-actions-three {
    grid-template-columns: 1fr;
  }
}



/* Resilient save and modern CMS polish */
.admin-root:not(.admin-root-login-only) .admin-sidebar h1,
.admin-root:not(.admin-root-login-only) .admin-sidebar-section-head h3,
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > strong,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item strong {
  color: #f8fafc !important;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar p,
.admin-root:not(.admin-root-login-only) .admin-sidebar small,
.admin-root:not(.admin-root-login-only) .admin-cms-local-panel > span,
.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  color: rgba(226,232,240,0.78) !important;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item {
  border-radius: 16px;
  transition: transform 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-actions button:hover,
.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item:hover {
  transform: translateY(-1px);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--save {
  background: linear-gradient(180deg, rgba(14,165,233,0.24), rgba(14,165,233,0.14));
  border-color: rgba(125,211,252,0.32);
  box-shadow: 0 10px 26px rgba(14,165,233,0.18);
}

.admin-root:not(.admin-root-login-only) .admin-cms-side-action--danger {
  background: rgba(127,29,29,0.32);
  border-color: rgba(248,113,113,0.30);
  color: #fecaca;
}

.admin-root:not(.admin-root-login-only) .admin-local-notice {
  border: 1px solid rgba(74,222,128,0.22);
  background: rgba(20,83,45,0.24);
  color: #dcfce7;
}

.admin-root:not(.admin-root-login-only) .admin-save-error {
  border-radius: 16px;
}

.admin-root:not(.admin-root-login-only) .admin-edit-field input,
.admin-root:not(.admin-root-login-only) .admin-edit-field select,
.admin-root:not(.admin-root-login-only) .admin-edit-field textarea {
  border-radius: 14px;
  background: rgba(2,6,23,0.66);
  color: #f8fafc;
}

.admin-root:not(.admin-root-login-only) .admin-edit-field input:focus,
.admin-root:not(.admin-root-login-only) .admin-edit-field select:focus,
.admin-root:not(.admin-root-login-only) .admin-edit-field textarea:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}



/* Map node interaction polish */
.admin-root:not(.admin-root-login-only) .admin-sidebar-cms-note {
  border: 1px solid rgba(125,211,252,0.16);
  background: rgba(14,165,233,0.08);
  padding: 10px 11px;
  border-radius: 14px;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-empty {
  color: rgba(226,232,240,0.78);
  border: 1px dashed rgba(125,211,252,0.20);
  background: rgba(14,165,233,0.07);
}

.admin-root:not(.admin-root-login-only) .admin-node-map-hint {
  color: rgba(226,232,240,0.76);
}



/* Non-blocking map editor drawer */
.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking {
  pointer-events: none !important;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking .admin-drawer {
  pointer-events: auto !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::before,
.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::after {
  pointer-events: none !important;
  display: none !important;
}

.admin-root:not(.admin-root-login-only) .admin-drawer {
  box-shadow:
    -22px 0 60px rgba(2,6,23,0.38),
    inset 1px 0 0 rgba(255,255,255,0.08);
}

.admin-root:not(.admin-root-login-only) .admin-drawer-head {
  cursor: default;
}

.admin-root:not(.admin-root-login-only) .admin-map-dragging-node {
  cursor: grabbing !important;
}



/* Node reorder controls */
.admin-reorder-section {
  border-color: rgba(125,211,252,0.14);
  background:
    radial-gradient(circle at top left, rgba(14,165,233,0.10), transparent 42%),
    rgba(255,255,255,0.035);
}

.admin-reorder-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.admin-reorder-actions .admin-cms-side-action {
  justify-content: center;
  min-height: 42px;
  text-align: center;
}

.admin-reorder-actions .admin-cms-side-action:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  transform: none !important;
}

.admin-reorder-note {
  color: rgba(226,232,240,0.72);
  font-size: 11px;
  line-height: 1.35;
}

.admin-root:not(.admin-root-login-only) .admin-sidebar-node-item span:first-child,
.admin-root:not(.admin-root-login-only) .admin-node-card .admin-node-top > span {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .admin-reorder-actions {
    grid-template-columns: 1fr;
  }
}



/* Persistent mission settings */
.admin-settings-panel {
  max-height: 52vh;
  overflow: auto;
  padding-right: 3px;
}

.admin-settings-panel label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-settings-panel input,
.admin-settings-panel select,
.admin-settings-panel textarea {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-settings-panel textarea {
  min-height: 74px;
  resize: vertical;
}

.admin-settings-panel input:focus,
.admin-settings-panel select:focus,
.admin-settings-panel textarea:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}

.admin-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.admin-settings-grid label:last-child {
  grid-column: 1 / -1;
}

@media (max-width: 760px) {
  .admin-settings-grid {
    grid-template-columns: 1fr;
  }
}



/* Persistent player profile editor */
.admin-players-panel {
  max-height: 52vh;
  overflow: auto;
  padding-right: 3px;
}

.admin-player-editor-list {
  display: grid;
  gap: 10px;
}

.admin-player-editor-card {
  display: grid;
  gap: 9px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(148,163,184,0.16);
  background: rgba(2,6,23,0.34);
}

.admin-player-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.admin-player-editor-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-player-editor-head .admin-cms-side-action {
  width: auto;
  min-height: 34px;
  padding: 0 10px;
  font-size: 10px;
}

.admin-player-editor-card label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-player-editor-card input,
.admin-player-editor-card select {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-player-editor-card input:focus,
.admin-player-editor-card select:focus {
  border-color: rgba(125,211,252,0.42);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.10);
}

.admin-player-editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.admin-player-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

@media (max-width: 760px) {
  .admin-player-editor-grid,
  .admin-player-actions {
    grid-template-columns: 1fr;
  }
}



/* Family config editor */
.admin-family-config-section {
  border-color: rgba(168,85,247,0.18);
  background:
    radial-gradient(circle at top left, rgba(168,85,247,0.10), transparent 42%),
    rgba(255,255,255,0.035);
}

.admin-family-config-grid {
  display: grid;
  gap: 9px;
}

.admin-family-config-grid label {
  display: grid;
  gap: 5px;
  color: rgba(226,232,240,0.78);
  font-size: 11px;
  font-weight: 850;
}

.admin-family-config-grid input {
  width: 100%;
  border: 1px solid rgba(148,163,184,0.18);
  border-radius: 13px;
  background: rgba(2,6,23,0.62);
  color: #f8fafc;
  padding: 10px 11px;
  font: inherit;
  outline: none;
}

.admin-family-config-grid input:focus {
  border-color: rgba(168,85,247,0.44);
  box-shadow: 0 0 0 4px rgba(168,85,247,0.12);
}

.admin-family-config-note {
  color: rgba(226,232,240,0.68);
  font-size: 11px;
  line-height: 1.35;
}


`

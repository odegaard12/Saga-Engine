import { useEffect, useState } from 'react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { t as _t } from '../../i18n'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import GameTemplateWizardPanel from './GameTemplateWizardPanel'
import GuidedNodeEditorFlow from './GuidedNodeEditorFlow'
import {
  familyCards,
  getAdminFamilyIcon,
  getDefaultAdminConfigForFamily,
  type EditableAdminStage,
  type FamilyId,
} from '../lib/familyConfigs'
import {
  adminGameCatalog,
  getAdminGameForStage,
  getDefaultAdminStagePatchForGame,
  type AdminGameId,
} from '../lib/gameCatalog'

const LEGACY_NODE_COPY_ES: Record<string, string> = {
  'GPS unavailable message.':
    'No se pudo obtener la posición GPS. Revisa permisos o usa el código de emergencia.',
  'Move closer to unlock this node.': 'Acércate al nodo para desbloquearlo.',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function normalizeLegacyNodeCopy(value?: unknown) {
  const clean = String(value ?? '').trim()
  if (!clean) return ''
  return LEGACY_NODE_COPY_ES[clean] ?? clean
}

type DrawerTab = 'basics' | 'game' | 'requirement' | 'messages'

function isPlayableAdminGame(game: { runtimeStatus: string; offlineStatus: string }) {
  return game.runtimeStatus === 'runtime_ready' && game.offlineStatus === 'offline_ready'
}

function getVisibleAdminGames(selectedGameId: string) {
  return adminGameCatalog.filter((game) => isPlayableAdminGame(game) || game.id === selectedGameId)
}

function buildFallbackCodeForStage(stage: AdminReactOverviewStage) {
  const index = typeof stage.index === 'number' ? stage.index + 1 : 1
  // Código fallback
  return `SAGA-${String(index).padStart(2, '0')}`
}

function pickCarryOverConfig(config: Record<string, unknown>) {
  const keepKeys = [
    'required_item_id',
    'required_item_label',
    'required_item_quantity',
    'required_item_consume',
    'reward_item_id',
    'reward_item_label',
    'reward_message',
    'physical_item_id',
    'physical_item_label',
    'physical_node_kind',
    'physical_item_kind',
    'success_code',
    'fallback_code',
  ]

  return Object.fromEntries(
    keepKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(config, key))
      .map((key) => [key, config[key]])
  )
}

type NodeDetailDrawerProps = {
  stage: AdminReactOverviewStage
  stages?: AdminReactOverviewStage[]
  onClose: () => void
  onApplyLocal: (stage: AdminReactOverviewStage) => void
  onDeleteLocal: (stage: AdminReactOverviewStage) => void
  onRequestChangeType?: () => void
}

function formatCoords(lat: unknown, lon: unknown) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return 'No coordinates'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function numberOrNull(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

type PhysicalRequirementOption = {
  itemId: string
  label: string
  title: string
  kind: string
  icon: string
}

function slugifyRequirementItemId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function getPhysicalRequirementOption(
  stage: AdminReactOverviewStage
): PhysicalRequirementOption | null {
  const record = stage as AdminReactOverviewStage & {
    physical_node_kind?: string
    physical_item_kind?: string
    physical_item_id?: string
    physical_item_label?: string
    physical_qr?: { item_id?: string; label?: string; kind?: string }
    qr_payload?: string
    label?: string
    icon?: string
  }

  const config =
    typeof (stage as EditableAdminStage).config === 'object' &&
    (stage as EditableAdminStage).config !== null
      ? (((stage as EditableAdminStage).config || {}) as Record<string, unknown>)
      : {}

  const gameId = typeof config.game_id === 'string' ? config.game_id : ''
  const labelText = String(record.label || stage.title || '').toLowerCase()
  const titleText = String(stage.title || '').toLowerCase()
  const payloadText = String(
    record.qr_payload || record.physical_qr?.item_id || record.physical_qr?.label || ''
  ).toLowerCase()
  const gameText = String(gameId || config.game_title || config.objective || '').toLowerCase()
  const allText = `${labelText} ${titleText} ${payloadText} ${gameText}`

  const catalogKind =
    gameId === 'qr_collectible'
      ? 'collectible'
      : gameId === 'qr_key_gate'
        ? 'requirement'
        : gameId === 'clue_card'
          ? 'clue'
          : gameId === 'bonus_cache'
            ? 'bonus'
            : ''

  const inferredKind = /llave|key|qr_key|requirement/.test(allText)
    ? 'requirement'
    : /pista|clue/.test(allText)
      ? 'clue'
      : /bonus|regalo|cache/.test(allText)
        ? 'bonus'
        : /objeto|coleccionable|collectible|qr/.test(allText)
          ? 'collectible'
          : ''

  const kind =
    record.physical_node_kind ||
    record.physical_item_kind ||
    record.physical_qr?.kind ||
    catalogKind ||
    inferredKind
  if (kind !== 'collectible' && kind !== 'requirement' && kind !== 'clue' && kind !== 'bonus')
    return null

  const title = String(stage.title || `Nodo ${stage.index + 1}`).trim()
  const typeLabel = String(
    record.physical_item_label ||
      record.physical_qr?.label ||
      config.physical_item_label ||
      config.game_title ||
      record.label ||
      (kind === 'requirement'
        ? 'Llave QR'
        : kind === 'clue'
          ? 'Pista QR'
          : kind === 'bonus'
            ? 'Bonus QR'
            : 'Coleccionable')
  ).trim()

  const itemId = String(
    record.physical_item_id ||
      record.physical_qr?.item_id ||
      config.physical_item_id ||
      slugifyRequirementItemId(typeLabel || title) ||
      `node_${stage.index + 1}`
  ).trim()

  return {
    itemId,
    label: title || typeLabel || itemId,
    title: typeLabel && typeLabel !== title ? `${title} · ${typeLabel}` : title,
    kind,
    icon:
      kind === 'collectible' ? '⭐' : kind === 'requirement' ? '🔑' : kind === 'clue' ? '🧩' : '🎁',
  }
}

export default function NodeDetailDrawer({
  stage,
  stages = [],
  onClose,
  onApplyLocal,
  onDeleteLocal,
  onRequestChangeType,
}: NodeDetailDrawerProps) {
  const [draft, setDraft] = useState<AdminReactOverviewStage>(stage)

  function patchGuidedV3Stage(patch: Record<string, any>) {
    const nextDraft = {
      ...(draft as any),
      ...patch,
    } as AdminReactOverviewStage
    setDraft(nextDraft)
    onApplyLocal(nextDraft)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function patchGuidedV2Stage(patch: Record<string, unknown>) {
    setDraft((current) => ({
      ...current,
      ...patch,
    }))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function patchGuidedStage(patch: Record<string, unknown>) {
    setDraft((current) => ({
      ...current,
      ...patch,
    }))
  }

  const [_activeTab, setActiveTab] = useState<DrawerTab>('basics')
  const [_isGameGuideOpen, _setIsGameGuideOpen] = useState(false)

  useEffect(() => {
    setDraft(stage)
    setActiveTab('basics')
  }, [stage])

  const family =
    familyCards.find((item) => item.id === draft.type) ||
    familyCards.find((item) => item.id === 'signal_hunt')

  const _messages = draft.messages || {}
  const isLocalNew = typeof draft.id === 'string' && draft.id.startsWith('local-')

  const draftConfig =
    typeof (draft as EditableAdminStage).config === 'object' &&
    (draft as EditableAdminStage).config !== null
      ? (((draft as EditableAdminStage).config || {}) as Record<string, unknown>)
      : {}

  const physicalRequirementOptions = stages
    .filter((candidate) => candidate.index !== draft.index)
    .map(getPhysicalRequirementOption)
    .filter((item): item is PhysicalRequirementOption => Boolean(item))

  const _selectedRequirement = physicalRequirementOptions.find(
    (item) => item.itemId === getDraftConfigText('required_item_id')
  )
  const selectedGame = getAdminGameForStage(draft.type, draftConfig)
  const _visibleGameCatalog = getVisibleAdminGames(selectedGame.id)

  function getDraftConfigText(key: string, fallback = '') {
    const value = draftConfig[key]
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')
      return String(value)
    return fallback
  }

  function updateDraftLocal(
    updater: (current: AdminReactOverviewStage) => AdminReactOverviewStage
  ) {
    setDraft((current) => {
      const nextDraft = updater(current)
      onApplyLocal(nextDraft)
      return nextDraft
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function setDraftField<K extends keyof AdminReactOverviewStage>(
    key: K,
    value: AdminReactOverviewStage[K]
  ) {
    updateDraftLocal((current) => ({
      ...current,
      [key]: value,
    }))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function setDraftMessage(key: 'hint' | 'gps_unavailable' | 'locked', value: string) {
    updateDraftLocal((current) => ({
      ...current,
      messages: {
        ...(current.messages || {}),
        [key]: value,
      },
    }))
  }

  function updateDraftConfig(key: string, value: unknown) {
    updateDraftLocal((current) => ({
      ...(current as EditableAdminStage),
      config: {
        ...(((current as EditableAdminStage).config || {}) as Record<string, unknown>),
        [key]: value,
      },
      config_summary: Array.from(new Set([...(current.config_summary || []), key])),
      objective: key === 'objective' ? String(value || '') : current.objective,
    }))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function updateDraftConfigText(key: string, value: string) {
    updateDraftConfig(key, value)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function updateDraftConfigNumber(key: string, value: string) {
    const parsed = Number(value)
    updateDraftConfig(key, Number.isFinite(parsed) ? parsed : value)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function updateDraftConfigSequence(value: string) {
    const parts = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    updateDraftConfig('sequence', parts.length > 0 ? parts : value)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleDraftGameChange(nextGameId: AdminGameId) {
    const patch = getDefaultAdminStagePatchForGame(nextGameId)

    updateDraftLocal((current) => {
      const currentConfig =
        typeof (current as EditableAdminStage).config === 'object' &&
        (current as EditableAdminStage).config !== null
          ? (((current as EditableAdminStage).config || {}) as Record<string, unknown>)
          : {}

      const carryOverConfig = pickCarryOverConfig(currentConfig)
      const nextConfig = {
        ...patch.config,
        ...carryOverConfig,
        game_id: nextGameId,
        game_title: patch.label,
        success_code: String(
          carryOverConfig.success_code ||
            carryOverConfig.fallback_code ||
            buildFallbackCodeForStage(current)
        ),
      }

      return {
        ...(current as EditableAdminStage),
        type: patch.type,
        label: patch.label,
        icon: patch.icon,
        objective: patch.objective,
        config: nextConfig,
        config_summary: Object.keys(nextConfig),
        content: patch.content,
        messages: patch.messages || {},
      }
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleDraftFamilyChange(nextType: FamilyId) {
    const nextConfig = getDefaultAdminConfigForFamily(nextType)

    updateDraftLocal((current) => ({
      ...(current as EditableAdminStage),
      type: nextType,
      label:
        nextType === 'motion_challenge'
          ? 'Motion Challenge'
          : nextType === 'bearing_hunt'
            ? 'Bearing Hunt'
            : nextType === 'circuit_matrix'
              ? 'Circuit Matrix'
              : 'Signal Hunt',
      icon: getAdminFamilyIcon(nextType),
      objective: String(nextConfig.objective || ''),
      config: nextConfig,
      config_summary: Object.keys(nextConfig),
    }))
  }

  function patchActivationStage(patch: Partial<AdminReactOverviewStage>) {
    setDraft((current) => ({
      ...current,
      ...patch,
    }))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function renderActivationPanel() {
    const rawDraft = draft as Record<string, unknown>
    const rawRadius = rawDraft.radius_m ?? rawDraft.radius ?? rawDraft.activation_radius_m ?? 50
    const radiusValue = String(rawRadius)
    const interactionValue = String(
      rawDraft.input_mode ??
        rawDraft.inputMode ??
        (rawDraft.require_proximity === false || rawDraft.requireProximity === false
          ? 'manual'
          : 'gps')
    )
    const requireProximity =
      rawDraft.require_proximity !== false && rawDraft.requireProximity !== false

    return (
      <section className="admin-node-activation-panel">
        <div className="admin-edit-section-head">
          <strong>Activación</strong>
          <span>Radio, proximidad y forma de interactuar</span>
        </div>

        <div className="admin-node-activation-grid">
          <label className="admin-edit-field">
            Radio en metros
            <input
              type="number"
              min="1"
              step="1"
              value={radiusValue}
              onChange={(event) => {
                const value = Number(event.target.value)
                const radius = Number.isFinite(value) && value > 0 ? value : 50
                patchActivationStage({
                  ...({ radius_m: radius } as Partial<AdminReactOverviewStage>),
                  ...({ radius: radius } as Partial<AdminReactOverviewStage>),
                  ...({ activation_radius_m: radius } as Partial<AdminReactOverviewStage>),
                })
              }}
            />
          </label>

          <label className="admin-edit-field">
            Interacción
            <select
              value={interactionValue}
              onChange={(event) => {
                patchActivationStage({
                  ...({ input_mode: event.target.value } as Partial<AdminReactOverviewStage>),
                  ...({ inputMode: event.target.value } as Partial<AdminReactOverviewStage>),
                })
              }}
            >
              <option value="gps">Por radio GPS</option>
              <option value="manual">Manual / sin radio</option>
              <option value="game">Según plantilla de juego</option>
            </select>
          </label>

          <label className="admin-edit-field admin-node-activation-check">
            <input
              type="checkbox"
              checked={requireProximity}
              onChange={(event) => {
                patchActivationStage({
                  ...({
                    require_proximity: event.target.checked,
                  } as Partial<AdminReactOverviewStage>),
                  ...({
                    requireProximity: event.target.checked,
                  } as Partial<AdminReactOverviewStage>),
                })
              }}
            />
            <span>Requerir estar cerca del nodo</span>
          </label>
        </div>

        <p className="admin-node-activation-note">
          La posición se cambia arrastrando el nodo en el mapa. Aquí configuras el radio y cómo se
          activa.
        </p>
      </section>
    )
  }

  return (
    <div className="admin-drawer-overlay admin-drawer-overlay--nonblocking" role="region">
      <aside
        className="admin-drawer admin-drawer-editable admin-node-editor-redesign admin-node-editor-large-modal admin-guided-v4-shell"
        role="dialog"

        aria-label={`Node editor: ${draft.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-node-editor-inline-topbar">
          <div className="admin-node-editor-inline-title">
            <span className="admin-node-editor-inline-kicker">Editor</span>
            <strong>Editor guiado de nodo / QR físico</strong>
          </div>
          <button
            type="button"
            className="admin-node-editor-inline-close"
            onClick={onClose}
            aria-label="Cerrar editor de nodo"
          >
            Cerrar ×
          </button>
        </div>
        <div className="admin-drawer-head admin-drawer-head--modern admin-node-editor-topbar">
          <div className="admin-node-editor-kicker-row">
            <span className="admin-kicker">
              {isLocalNew ? 'Añadir nodo' : 'Editor guiado de nodo'}
            </span>

            <button type="button" className="admin-node-editor-close" onClick={onClose}>
              Cerrar ×
            </button>
          </div>

          <div className="admin-node-editor-title-row">
            <div className="admin-node-editor-title-copy">
              <h2>
                {draft.index + 1}. {draft.title || 'Nodo sin título'}
              </h2>

              <div className="admin-drawer-meta admin-node-editor-meta">
                <span>
                  {family?.icon || '◇'} {draft.label || draft.type}
                </span>
                <span>{formatCoords(draft.lat, draft.lon)}</span>
                <span>{typeof draft.radius === 'number' ? `${draft.radius} m` : 'Sin radio'}</span>
              </div>
            </div>

            <div className="admin-node-editor-actions">
              <button type="button" onClick={onRequestChangeType}>
                Cambiar tipo
              </button>
              <button
                type="button"
                className="admin-node-delete-visible"
                onClick={() => {
                  if (
                    window.confirm(
                      `Eliminar nodo "${draft.title || 'Sin título'}"? Guarda después para persistir.`
                    )
                  ) {
                    onDeleteLocal(draft)
                  }
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
        <div className="admin-drawer-body admin-drawer-body--modern admin-guided-v4-body-host">
          <GuidedNodeEditorFlow
            stage={draft}
            onPatch={patchGuidedV3Stage}
            onClose={onClose}
            stages={stages}
            onRequestChangeType={onRequestChangeType}
            onDelete={() => {
              if (
                window.confirm(
                  `Eliminar nodo "${draft.title || 'Sin título'}"? Pulsa Guardar después para persistir.`
                )
              ) {
                onDeleteLocal(draft)
              }
            }}
          />
        </div>

        <div className="admin-drawer-footer">
          <div className="admin-drawer-footer-actions">
            <button type="button" className="admin-cms-side-action" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

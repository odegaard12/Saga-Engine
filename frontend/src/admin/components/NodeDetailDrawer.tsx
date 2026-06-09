import { useEffect, useState } from 'react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
import { t } from '../../i18n'
import GameTemplateWizardPanel from './GameTemplateWizardPanel'
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
  'GPS unavailable message.': 'No se pudo obtener la posición GPS. Revisa permisos o usa el código de emergencia.',
  'Move closer to unlock this node.': 'Acércate al nodo para desbloquearlo.',
}

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

function getPhysicalRequirementOption(stage: AdminReactOverviewStage): PhysicalRequirementOption | null {
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
    typeof (stage as EditableAdminStage).config === 'object' && (stage as EditableAdminStage).config !== null
      ? (((stage as EditableAdminStage).config || {}) as Record<string, unknown>)
      : {}

  const gameId = typeof config.game_id === 'string' ? config.game_id : ''
  const labelText = String(record.label || stage.title || '').toLowerCase()
  const titleText = String(stage.title || '').toLowerCase()
  const payloadText = String(record.qr_payload || record.physical_qr?.item_id || record.physical_qr?.label || '').toLowerCase()
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

  const inferredKind =
    /llave|key|qr_key|requirement/.test(allText)
      ? 'requirement'
      : /pista|clue/.test(allText)
        ? 'clue'
        : /bonus|regalo|cache/.test(allText)
          ? 'bonus'
          : /objeto|coleccionable|collectible|qr/.test(allText)
            ? 'collectible'
            : ''

  const kind = record.physical_node_kind || record.physical_item_kind || record.physical_qr?.kind || catalogKind || inferredKind
  if (kind !== 'collectible' && kind !== 'requirement' && kind !== 'clue' && kind !== 'bonus') return null

  const title = String(stage.title || `Nodo ${stage.index + 1}`).trim()
  const typeLabel = String(
    record.physical_item_label ||
    record.physical_qr?.label ||
    config.physical_item_label ||
    config.game_title ||
    record.label ||
    (
      kind === 'requirement'
        ? 'Llave QR'
        : kind === 'clue'
          ? 'Pista QR'
          : kind === 'bonus'
            ? 'Bonus QR'
            : 'Objeto QR'
    )
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
      kind === 'collectible'
        ? '⭐'
        : kind === 'requirement'
          ? '🔑'
          : kind === 'clue'
            ? '🧩'
            : '🎁',
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
  const [activeTab, setActiveTab] = useState<DrawerTab>('basics')
  const [isGameGuideOpen, setIsGameGuideOpen] = useState(false)

  useEffect(() => {
    setDraft(stage)
    setActiveTab('basics')
  }, [stage])

  const family =
    familyCards.find((item) => item.id === draft.type) ||
    familyCards.find((item) => item.id === 'signal_hunt')

  const messages = draft.messages || {}
  const isLocalNew = typeof draft.id === 'string' && draft.id.startsWith('local-')

  const draftConfig =
    typeof (draft as EditableAdminStage).config === 'object' && (draft as EditableAdminStage).config !== null
      ? (((draft as EditableAdminStage).config || {}) as Record<string, unknown>)
      : {}

  const physicalRequirementOptions = stages
    .filter((candidate) => candidate.index !== draft.index)
    .map(getPhysicalRequirementOption)
    .filter((item): item is PhysicalRequirementOption => Boolean(item))

  const selectedRequirement = physicalRequirementOptions.find(
    (item) => item.itemId === getDraftConfigText('required_item_id')
  )
  const selectedGame = getAdminGameForStage(draft.type, draftConfig)
  const visibleGameCatalog = getVisibleAdminGames(selectedGame.id)

  function getDraftConfigText(key: string, fallback = '') {
    const value = draftConfig[key]
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return String(value)
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

  function setDraftField<K extends keyof AdminReactOverviewStage>(
    key: K,
    value: AdminReactOverviewStage[K]
  ) {
    updateDraftLocal((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function setDraftMessage(
    key: 'hint' | 'gps_unavailable' | 'locked',
    value: string
  ) {
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

  function updateDraftConfigText(key: string, value: string) {
    updateDraftConfig(key, value)
  }

  function updateDraftConfigNumber(key: string, value: string) {
    const parsed = Number(value)
    updateDraftConfig(key, Number.isFinite(parsed) ? parsed : value)
  }

  function updateDraftConfigSequence(value: string) {
    const parts = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    updateDraftConfig('sequence', parts.length > 0 ? parts : value)
  }

  function handleDraftGameChange(nextGameId: AdminGameId) {
    const patch = getDefaultAdminStagePatchForGame(nextGameId)

    updateDraftLocal((current) => {
      const currentConfig =
        typeof (current as EditableAdminStage).config === 'object' && (current as EditableAdminStage).config !== null
          ? (((current as EditableAdminStage).config || {}) as Record<string, unknown>)
          : {}

      const carryOverConfig = pickCarryOverConfig(currentConfig)
      const nextConfig = {
        ...patch.config,
        ...carryOverConfig,
        game_id: nextGameId,
        game_title: patch.label,
        success_code: String(carryOverConfig.success_code || carryOverConfig.fallback_code || buildFallbackCodeForStage(current)),
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

  function handleDraftFamilyChange(nextType: FamilyId) {
    const nextConfig = getDefaultAdminConfigForFamily(nextType)

    updateDraftLocal((current) => ({
      ...(current as EditableAdminStage),
      type: nextType,
      label:
        nextType === 'bearing_hunt'
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


  function renderActivationPanel() {
    const rawDraft = draft as Record<string, unknown>
    const rawRadius =
      rawDraft.radius_m ??
      rawDraft.radius ??
      rawDraft.activation_radius_m ??
      50
    const radiusValue = String(rawRadius)
    const interactionValue = String(
      rawDraft.input_mode ??
        rawDraft.inputMode ??
        (rawDraft.require_proximity === false || rawDraft.requireProximity === false ? 'manual' : 'gps'),
    )
    const requireProximity = rawDraft.require_proximity !== false && rawDraft.requireProximity !== false

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
                  ...({ require_proximity: event.target.checked } as Partial<AdminReactOverviewStage>),
                  ...({ requireProximity: event.target.checked } as Partial<AdminReactOverviewStage>),
                })
              }}
            />
            <span>Requerir estar cerca del nodo</span>
          </label>
        </div>

        <p className="admin-node-activation-note">
          La posición se cambia arrastrando el nodo en el mapa. Aquí configuras el radio y cómo se activa.
        </p>
      </section>
    )
  }


  return (
    <div className="admin-drawer-overlay admin-drawer-overlay--nonblocking" role="region">
      <aside
        className="admin-drawer admin-drawer-editable admin-node-editor-redesign admin-node-editor-large-modal admin-node-editor-redesign"
        role="dialog"
        
        aria-label={`Node editor: ${draft.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-node-editor-inline-topbar">
          <div className="admin-node-editor-inline-title">
            <span className="admin-node-editor-inline-kicker">Editor</span>
            <strong>Editor de nodo / QR físico</strong>
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
            <span className="admin-kicker">{isLocalNew ? 'Añadir nodo' : 'Editor de nodo'}</span>

            <button
              type="button"
              className="admin-node-editor-close"
              onClick={onClose}
            >
              Cerrar ×
            </button>
          </div>

          <div className="admin-node-editor-title-row">
            <div className="admin-node-editor-title-copy">
              <h2>{draft.index + 1}. {draft.title || 'Nodo sin título'}</h2>

              <div className="admin-drawer-meta admin-node-editor-meta">
                <span>{family?.icon || '◇'} {draft.label || draft.type}</span>
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
                  if (window.confirm(`Eliminar nodo "${draft.title || 'Sin título'}"? Guarda después para persistir.`)) {
                    onDeleteLocal(draft)
                  }
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>

        <div className="admin-drawer-tabs admin-node-editor-tabs" role="tablist" aria-label="Node editor tabs">
          <button
            type="button"
            className={activeTab === 'basics' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('basics')}
          >
            Básico
          </button>
          <button
            type="button"
            className={activeTab === 'game' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('game')}
          >
            Juego
          </button>
          <button
            type="button"
            className={activeTab === 'requirement' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('requirement')}
          >
            Requisito
          </button>
          <button
            type="button"
            className={activeTab === 'messages' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('messages')}
          >
            Mensajes
          </button>
        </div>

        <div className="admin-drawer-body admin-drawer-body--modern">
          {activeTab === 'basics' ? (
            <section className="admin-edit-section admin-edit-section-compact admin-node-basics-panel">
              <div className="admin-edit-section-head">
                <strong>Basics</strong>
                <span>Core node identity</span>
              </div>
              {renderActivationPanel()}

              <label className="admin-edit-field">
                Title
                <input
                  value={draft.title || ''}
                  onChange={(event) => setDraftField('title', event.target.value)}
                />
              </label>

              <label className="admin-basic-game-duplicate admin-edit-field">
                Juego
                <select
                  value={selectedGame.id}
                  onChange={(event) => handleDraftGameChange(event.target.value as AdminGameId)}
                >
                  {visibleGameCatalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.icon} {item.title} · {item.difficulty}
                    </option>
                  ))}
                </select>
              </label>

              <div className="admin-game-choice-summary">
                <span>{selectedGame.icon}</span>
                <div>
                  <strong>{selectedGame.title}</strong>
                  <p>{selectedGame.summary}</p>
                  <small>{selectedGame.playerGoal}</small>
                </div>
              </div>

              <label className="admin-node-main-copy-field admin-edit-field">
                Texto principal del nodo
                <span className="admin-node-field-help">Lo verá el jugador como instrucción o pista principal al abrir/completar este nodo. Déjalo vacío si la plantilla de juego ya lo explica todo.</span>
                <textarea
                  rows={7}
                  value={draft.content || ''}
                  onChange={(event) => setDraftField('content', event.target.value)}
                />
              </label>
            </section>
          ) : null}


          {activeTab === 'game' ? (
            <section className="admin-edit-section admin-edit-section-compact admin-family-config-section admin-node-game-panel">
              <div className="admin-edit-section-head">
                <strong>Juego</strong>
                <span className="admin-game-selected-pill">{selectedGame.icon} {selectedGame.title} · {selectedGame.duration}</span>
                <small className="admin-game-editor-help admin-game-editor-help-v1">
                  <button type="button" className="admin-game-guide-open" onClick={() => setIsGameGuideOpen(true)}>
                    <span>¿Cómo configuro este juego?</span>
                    <small>Abrir asistente paso a paso</small>
                  </button>

                  {isGameGuideOpen ? (
                    <GameTemplateWizardPanel
                      selectedGameTitle={draft.title || 'Juego actual'}
                      onClose={() => setIsGameGuideOpen(false)}
                      onGoToGame={() => { setIsGameGuideOpen(false); setActiveTab('game') }}
                      onGoToBasics={() => { setIsGameGuideOpen(false); setActiveTab('basics') }}
                      onGoToMessages={() => { setIsGameGuideOpen(false); setActiveTab('messages') }}
                    />
                  ) : null}


                  Elige una prueba estable. Los modos parciales o planeados quedan ocultos hasta estar completos.
                </small>
              </div>

              <div className="admin-game-catalog-grid">
                {visibleGameCatalog.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    className={selectedGame.id === game.id ? 'admin-game-card active' : 'admin-game-card'}
                    onClick={() => handleDraftGameChange(game.id)}
                  >
                    <span>{game.icon}</span>
                    <strong>{game.title}</strong>
                    <small>{game.summary}</small>
                    <div className="admin-game-card-badges">
                      <em>
                        {game.runtimeStatus === 'runtime_ready'
                          ? 'Jugable'
                          : game.runtimeStatus === 'runtime_partial'
                            ? 'Parcial'
                            : game.runtimeStatus === 'preset_only'
                              ? 'Plantilla'
                              : 'Planeado'}
                      </em>
                      <em>
                        {game.offlineStatus === 'offline_ready'
                          ? 'Offline listo'
                          : game.offlineStatus === 'offline_partial'
                            ? 'Offline parcial'
                            : 'Offline pendiente'}
                      </em>
                    </div>
                  </button>
                ))}
              </div>

              <div className="admin-game-explain-box">
                <strong>{selectedGame.playerGoal}</strong>
                <span>{selectedGame.editorHint}</span>
                 <small className="admin-game-offline-note">
                   Offline obligatorio: {selectedGame.offlineNote}
                 </small>
              </div>

              <div className="admin-edit-section-head">
                <strong>Código fallback</strong>
                <span>Botón de emergencia: si falla GPS, QR, cámara, brújula o cobertura, este código completa el nodo.</span>
              </div>

              <div className="admin-edit-grid">
                <label className="admin-edit-field">
                  Código preestablecido
                  <input
                    value={getDraftConfigText('success_code')}
                    placeholder={buildFallbackCodeForStage(draft)}
                    onFocus={() => {
                      if (!getDraftConfigText('success_code')) {
                        updateDraftConfigText('success_code', buildFallbackCodeForStage(draft))
                      }
                    }}
                    onChange={(event) => updateDraftConfigText('success_code', event.target.value.trim().toUpperCase())}
                  />
                </label>

                <button
                  type="button"
                  className="admin-node-editor-close"
                  onClick={() => updateDraftConfigText('success_code', buildFallbackCodeForStage(draft))}
                >
                  Generar
                </button>
              </div>

              <small className="admin-family-config-note">
                No lo enseñes al jugador salvo emergencia. El monitor puede darlo para avanzar sin cobertura.
              </small>

              <div className="admin-family-config-grid">
                <label className="admin-game-technical-field">
                  Objective
                  <input
                    value={getDraftConfigText('objective')}
                    placeholder="proximity_lock, single_lock, sequence..."
                    onChange={(event) => updateDraftConfigText('objective', event.target.value)}
                  />
                </label>

                {draft.type === 'signal_hunt' ? (
                  <>
                    <label className="admin-game-technical-field">
                      Source radius meters
                      <input
                        value={getDraftConfigText('source_radius_m')}
                        placeholder="75"
                        onChange={(event) => updateDraftConfigNumber('source_radius_m', event.target.value)}
                      />
                    </label>

                    <label className="admin-game-technical-field">
                      Lock threshold
                      <input
                        value={getDraftConfigText('lock_threshold')}
                        placeholder="65"
                        onChange={(event) => updateDraftConfigNumber('lock_threshold', event.target.value)}
                      />
                    </label>

                    <label className="admin-game-technical-field">
                      Hold milliseconds
                      <input
                        value={getDraftConfigText('hold_ms')}
                        placeholder="1500"
                        onChange={(event) => updateDraftConfigNumber('hold_ms', event.target.value)}
                      />
                    </label>
                  </>
                ) : null}

                {draft.type === 'bearing_hunt' ? (
                  <>
                    <label>
                      Target bearing
                      <input
                        value={getDraftConfigText('target_bearing_deg')}
                        placeholder="270"
                        onChange={(event) => updateDraftConfigNumber('target_bearing_deg', event.target.value)}
                      />
                    </label>

                    <label>
                      Tolerance degrees
                      <input
                        value={getDraftConfigText('tolerance_deg')}
                        placeholder="12"
                        onChange={(event) => updateDraftConfigNumber('tolerance_deg', event.target.value)}
                      />
                    </label>

                    <label>
                      Hold milliseconds
                      <input
                        value={getDraftConfigText('hold_ms')}
                        placeholder="1200"
                        onChange={(event) => updateDraftConfigNumber('hold_ms', event.target.value)}
                      />
                    </label>
                  </>
                ) : null}

                {draft.type === 'circuit_matrix' ? (
                  <>
                    <label>
                      Sequence
                      <input
                        value={getDraftConfigText('sequence')}
                        placeholder="alpha, beta, gamma"
                        onChange={(event) => updateDraftConfigSequence(event.target.value)}
                      />
                    </label>

                    <label>
                      Difficulty
                      <input
                        value={getDraftConfigText('difficulty')}
                        placeholder="normal"
                        onChange={(event) => updateDraftConfigText('difficulty', event.target.value)}
                      />
                    </label>

                    <label>
                      Grid columns
                      <input
                        value={getDraftConfigText('grid_cols')}
                        placeholder="3"
                        onChange={(event) => updateDraftConfigNumber('grid_cols', event.target.value)}
                      />
                    </label>
                  </>
                ) : null}
              </div>

              <div className="admin-edit-section-head">
                <strong>{t('editor.gameAuthoring.title')}</strong>
                <span>{t('editor.gameAuthoring.subtitle')}</span>
              </div>

              <div className="admin-edit-section-head">
                <strong>{t('editor.gameAuthoring.completionTitle')}</strong>
                <span>{t('editor.gameAuthoring.completionHelp')}</span>
              </div>

              <label className="admin-edit-field">
                {t('editor.gameAuthoring.completionMethod')}
                <select
                  value={getDraftConfigText('completion_method', 'proximity')}
                  onChange={(event) => updateDraftConfigText('completion_method', event.target.value)}
                >
                  <option value="proximity">Llegar al sitio</option>
                  <option value="hold">Mantenerse en la zona</option>
                  <option value="bearing">Rumbo / brújula</option>
                  <option value="puzzle">Puzzle visual</option>
                  <option value="manual_code">Palabra o código</option>
                  <option value="sequence">Secuencia</option>
                  <option value="qr_complete">QR completa el nodo</option>
                  <option value="photo">Foto de exploración</option>
                  <option value="inventory_only">Guardar en mochila</option>
                  <option value="team">Equipo / capitán</option>
                </select>
              </label>

              <div className="admin-edit-section-head">
                <strong>{t('editor.gameAuthoring.rewardTitle')}</strong>
                <span>{t('editor.gameAuthoring.completionHelp')}</span>
              </div>

              <div className="admin-edit-grid">
                <label className="admin-edit-field">
                  {t('editor.gameAuthoring.rewardItemId')}
                  <input
                    value={getDraftConfigText('reward_item_id')}
                    placeholder="llave_torre"
                    onChange={(event) => updateDraftConfigText('reward_item_id', event.target.value.trim())}
                  />
                </label>

                <label className="admin-edit-field">
                  {t('editor.gameAuthoring.rewardItemLabel')}
                  <input
                    value={getDraftConfigText('reward_item_label')}
                    placeholder="Llave de la torre"
                    onChange={(event) => updateDraftConfigText('reward_item_label', event.target.value)}
                  />
                </label>
              </div>

              <label className="admin-edit-field">
                {t('editor.gameAuthoring.rewardMessage')}
                <textarea
                  rows={3}
                  value={getDraftConfigText('reward_message')}
                  placeholder="Has conseguido la llave de la torre."
                  onChange={(event) => updateDraftConfigText('reward_message', event.target.value)}
                />
              </label>

              <small className="admin-family-config-note">
                
              </small>
            </section>
          ) : null}

          {activeTab === 'requirement' ? (
            <section className="admin-edit-section admin-edit-section-compact admin-node-requirement-panel">
              <div className="admin-edit-section-head">
                <strong>Requisito de entrada</strong>
                <span>Opcional. El orden de ruta ya se respeta; activa esto solo si este nodo necesita que el jugador haya escaneado un QR físico.</span>
              </div>

              {physicalRequirementOptions.length > 0 ? (
                <>
                  <label className="admin-edit-field admin-required-item-select">
                    Para abrir este nodo se necesita
                    <select
                      value={getDraftConfigText('required_item_id')}
                      onChange={(event) => {
                        const selected = physicalRequirementOptions.find((item) => item.itemId === event.target.value)

                        if (!selected) {
                          updateDraftConfigText('required_item_id', '')
                          updateDraftConfigText('required_item_label', '')
                          updateDraftConfigNumber('required_item_quantity', '1')
                          updateDraftConfig('required_item_consume', false)
                          return
                        }

                        updateDraftConfigText('required_item_id', selected.itemId)
                        updateDraftConfigText('required_item_label', selected.label)
                        updateDraftConfigNumber('required_item_quantity', '1')
                      }}
                    >
                      <option value="">Nada: solo seguir el orden de ruta</option>
                      {physicalRequirementOptions.map((item) => (
                        <option key={item.itemId} value={item.itemId}>
                          {item.icon} {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedRequirement ? (
                    <div className="admin-requirement-summary">
                      <span>{selectedRequirement.icon}</span>
                      <div>
                        <strong>{selectedRequirement.label}</strong>
                        <small>Este nodo queda bloqueado hasta que el jugador escanee ese objeto QR.</small>
                      </div>
                    </div>
                  ) : (
                    <div className="admin-requirement-summary admin-requirement-summary--off">
                      <span>✓</span>
                      <div>
                        <strong>Sin requisito físico</strong>
                        <small>Este nodo solo depende del orden de ruta, GPS y reglas normales.</small>
                      </div>
                    </div>
                  )}

                  <label className="admin-edit-check">
                    <input
                      type="checkbox"
                      checked={getDraftConfigText('required_item_consume', 'false') === 'true'}
                      disabled={!getDraftConfigText('required_item_id')}
                      onChange={(event) => updateDraftConfig('required_item_consume', event.target.checked)}
                    />
                    Consumir objeto al superar el nodo
                  </label>
                </>
              ) : (
                <div className="admin-rule-empty-state">
                  <strong>No hay objetos QR disponibles.</strong>
                  <span>Crea primero un nodo Objeto QR, Llave QR, Pista QR o Bonus QR. Después podrás pedirlo aquí.</span>
                </div>
              )}
            </section>
          ) : null}

          {activeTab === 'messages' ? (
            <section className="admin-edit-section admin-edit-section-compact admin-node-messages-panel">
              <div className="admin-edit-section-head">
                <strong>Mensajes</strong>
                <span>Textos que verá el jugador</span>
              </div>

              <label className="admin-edit-field">
                Hint
                <textarea
                  rows={4}
                  value={normalizeLegacyNodeCopy(messages.hint || '')}
                  onChange={(event) => setDraftMessage('hint', event.target.value)}
                />
              </label>

              <label className="admin-edit-field">
                Mensaje si no hay GPS
                <input
                  value={normalizeLegacyNodeCopy(messages.gps_unavailable)}
                  onChange={(event) => setDraftMessage('gps_unavailable', event.target.value)}
                />
              </label>

              <label className="admin-edit-field">
                Mensaje de bloqueo / éxito
                <input
                  value={normalizeLegacyNodeCopy(messages.locked)}
                  onChange={(event) => setDraftMessage('locked', event.target.value)}
                />
              </label>
            </section>
          ) : null}

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

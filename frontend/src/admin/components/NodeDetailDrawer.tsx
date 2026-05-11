import { useEffect, useState } from 'react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
import { t } from '../../i18n'
import {
  familyCards,
  getAdminFamilyIcon,
  getDefaultAdminConfigForFamily,
  type EditableAdminStage,
  type FamilyId,
} from '../lib/familyConfigs'

type DrawerTab = 'basics' | 'location' | 'game' | 'messages' | 'advanced'

type NodeDetailDrawerProps = {
  stage: AdminReactOverviewStage
  onClose: () => void
  onApplyLocal: (stage: AdminReactOverviewStage) => void
  onDeleteLocal: (stage: AdminReactOverviewStage) => void
  onMoveLocal: (stage: AdminReactOverviewStage, direction: 'up' | 'down') => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function formatCoords(lat: unknown, lon: unknown) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return 'No coordinates'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

function numberOrNull(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function NodeDetailDrawer({
  stage,
  onClose,
  onApplyLocal,
  onDeleteLocal,
  onMoveLocal,
  canMoveUp,
  canMoveDown,
}: NodeDetailDrawerProps) {
  const [draft, setDraft] = useState<AdminReactOverviewStage>(stage)
  const [activeTab, setActiveTab] = useState<DrawerTab>('basics')

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

  return (
    <div className="admin-drawer-overlay admin-drawer-overlay--nonblocking" role="presentation">
      <aside
        className="admin-drawer admin-drawer-editable"
        role="dialog"
        aria-modal="true"
        aria-label={`Node editor: ${draft.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-drawer-head admin-drawer-head--modern">
          <div className="admin-drawer-head-copy">
            <span className="admin-kicker">{isLocalNew ? 'Add node' : 'Node editor'}</span>
            <h2>{draft.index + 1}. {draft.title || 'Untitled node'}</h2>
            <div className="admin-drawer-meta">
              <span>{family?.icon || '◇'} {draft.label || draft.type}</span>
              <span>{formatCoords(draft.lat, draft.lon)}</span>
              <span>{typeof draft.radius === 'number' ? `${draft.radius}m radius` : 'No radius'}</span>
            </div>
          </div>

          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="admin-drawer-tabs" role="tablist" aria-label="Node editor tabs">
          <button
            type="button"
            className={activeTab === 'basics' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('basics')}
          >
            Basics
          </button>
          <button
            type="button"
            className={activeTab === 'location' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('location')}
          >
            Location
          </button>
          <button
            type="button"
            className={activeTab === 'game' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('game')}
          >
            Game
          </button>
          <button
            type="button"
            className={activeTab === 'messages' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('messages')}
          >
            Messages
          </button>
          <button
            type="button"
            className={activeTab === 'advanced' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}
            onClick={() => setActiveTab('advanced')}
          >
            Advanced
          </button>
        </div>

        <div className="admin-drawer-body admin-drawer-body--modern">
          {activeTab === 'basics' ? (
            <section className="admin-edit-section admin-edit-section-compact">
              <div className="admin-edit-section-head">
                <strong>Basics</strong>
                <span>Core node identity</span>
              </div>

              <label className="admin-edit-field">
                Title
                <input
                  value={draft.title || ''}
                  onChange={(event) => setDraftField('title', event.target.value)}
                />
              </label>

              <label className="admin-edit-field">
                Family
                <select
                  value={draft.type || 'signal_hunt'}
                  onChange={(event) => handleDraftFamilyChange(event.target.value as FamilyId)}
                >
                  {familyCards.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
              </label>

              <label className="admin-edit-field">
                Node content
                <textarea
                  rows={7}
                  value={draft.content || ''}
                  onChange={(event) => setDraftField('content', event.target.value)}
                />
              </label>
            </section>
          ) : null}

          {activeTab === 'location' ? (
            <section className="admin-edit-section admin-edit-section-compact">
              <div className="admin-edit-section-head">
                <strong>Location</strong>
                <span>{formatCoords(draft.lat, draft.lon)}</span>
              </div>

              <div className="admin-edit-grid">
                <label className="admin-edit-field">
                  Latitude
                  <input
                    inputMode="decimal"
                    value={draft.lat ?? ''}
                    onChange={(event) => setDraftField('lat', numberOrNull(event.target.value))}
                  />
                </label>

                <label className="admin-edit-field">
                  Longitude
                  <input
                    inputMode="decimal"
                    value={draft.lon ?? ''}
                    onChange={(event) => setDraftField('lon', numberOrNull(event.target.value))}
                  />
                </label>

                <label className="admin-edit-field">
                  Radius meters
                  <input
                    inputMode="numeric"
                    value={draft.radius ?? ''}
                    onChange={(event) => setDraftField('radius', numberOrNull(event.target.value))}
                  />
                </label>

                <label className="admin-edit-field">
                  Entry mode
                  <select
                    value={draft.entry_mode || 'gps'}
                    onChange={(event) => setDraftField('entry_mode', event.target.value)}
                  >
                    <option value="gps">GPS</option>
                    <option value="free">Free</option>
                  </select>
                </label>
              </div>

              <label className="admin-edit-check">
                <input
                  type="checkbox"
                  checked={Boolean(draft.require_proximity)}
                  onChange={(event) => setDraftField('require_proximity', event.target.checked)}
                />
                Require proximity
              </label>
            </section>
          ) : null}

          {activeTab === 'game' ? (
            <section className="admin-edit-section admin-edit-section-compact admin-family-config-section">
              <div className="admin-edit-section-head">
                <strong>Game config</strong>
                <span>{draft.type === 'signal_hunt' ? 'Signal Hunt' : draft.type === 'bearing_hunt' ? 'Bearing Hunt' : 'Circuit Matrix'}</span>
              </div>

              <div className="admin-family-config-grid">
                <label>
                  Objective
                  <input
                    value={getDraftConfigText('objective')}
                    placeholder="proximity_lock, single_lock, sequence..."
                    onChange={(event) => updateDraftConfigText('objective', event.target.value)}
                  />
                </label>

                {draft.type === 'signal_hunt' ? (
                  <>
                    <label>
                      Source radius meters
                      <input
                        value={getDraftConfigText('source_radius_m')}
                        placeholder="75"
                        onChange={(event) => updateDraftConfigNumber('source_radius_m', event.target.value)}
                      />
                    </label>

                    <label>
                      Lock threshold
                      <input
                        value={getDraftConfigText('lock_threshold')}
                        placeholder="65"
                        onChange={(event) => updateDraftConfigNumber('lock_threshold', event.target.value)}
                      />
                    </label>

                    <label>
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
                  <option value="proximity">{t('editor.gameAuthoring.methodProximity')}</option>
                  <option value="manual_code">{t('editor.gameAuthoring.methodManualCode')}</option>
                  <option value="qr">{t('editor.gameAuthoring.methodQr')}</option>
                  <option value="nfc">{t('editor.gameAuthoring.methodNfc')}</option>
                  <option value="minigame">{t('editor.gameAuthoring.methodMinigame')}</option>
                  <option value="item">{t('editor.gameAuthoring.methodItem')}</option>
                </select>
              </label>

              <div className="admin-edit-section-head">
                <strong>{t('editor.gameAuthoring.requiredItemTitle')}</strong>
                <span>{t('editor.gameAuthoring.completionHelp')}</span>
              </div>

              <div className="admin-edit-grid">
                <label className="admin-edit-field">
                  {t('editor.gameAuthoring.requiredItemId')}
                  <input
                    value={getDraftConfigText('required_item_id')}
                    placeholder="runa_agua"
                    onChange={(event) => updateDraftConfigText('required_item_id', event.target.value.trim())}
                  />
                </label>

                <label className="admin-edit-field">
                  {t('editor.gameAuthoring.requiredItemLabel')}
                  <input
                    value={getDraftConfigText('required_item_label')}
                    placeholder="Runa de agua"
                    onChange={(event) => updateDraftConfigText('required_item_label', event.target.value)}
                  />
                </label>

                <label className="admin-edit-field">
                  {t('editor.gameAuthoring.requiredItemQuantity')}
                  <input
                    inputMode="numeric"
                    value={getDraftConfigText('required_item_quantity', '1')}
                    onChange={(event) => updateDraftConfigNumber('required_item_quantity', event.target.value)}
                  />
                </label>
              </div>

              <label className="admin-edit-check">
                <input
                  type="checkbox"
                  checked={getDraftConfigText('required_item_consume', 'false') === 'true'}
                  onChange={(event) => updateDraftConfig('required_item_consume', event.target.checked)}
                />
                {t('editor.gameAuthoring.consumeItem')}
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
                This panel updates local draft state immediately. Use Save in Mission Control to persist.
              </small>
            </section>
          ) : null}

          {activeTab === 'messages' ? (
            <section className="admin-edit-section admin-edit-section-compact">
              <div className="admin-edit-section-head">
                <strong>Messages</strong>
                <span>Player-facing copy</span>
              </div>

              <label className="admin-edit-field">
                Hint
                <textarea
                  rows={4}
                  value={messages.hint || ''}
                  onChange={(event) => setDraftMessage('hint', event.target.value)}
                />
              </label>

              <label className="admin-edit-field">
                GPS unavailable message
                <input
                  value={messages.gps_unavailable || ''}
                  onChange={(event) => setDraftMessage('gps_unavailable', event.target.value)}
                />
              </label>

              <label className="admin-edit-field">
                Locked / success copy
                <input
                  value={messages.locked || ''}
                  onChange={(event) => setDraftMessage('locked', event.target.value)}
                />
              </label>
            </section>
          ) : null}

          {activeTab === 'advanced' ? (
            <>
              <section className="admin-edit-section admin-edit-section-compact">
                <div className="admin-edit-section-head">
                  <strong>Route order</strong>
                  <span>Local reorder</span>
                </div>

                <div className="admin-reorder-actions">
                  <button
                    type="button"
                    className="admin-cms-side-action"
                    disabled={!canMoveUp}
                    onClick={() => onMoveLocal(draft, 'up')}
                  >
                    Move up
                  </button>

                  <button
                    type="button"
                    className="admin-cms-side-action"
                    disabled={!canMoveDown}
                    onClick={() => onMoveLocal(draft, 'down')}
                  >
                    Move down
                  </button>
                </div>

                <small className="admin-reorder-note">
                  Current route position: {draft.index + 1}. Save changes to persist the new order.
                </small>
              </section>

              <section className="admin-edit-section admin-edit-section-compact admin-edit-section-danger">
                <div className="admin-edit-section-head">
                  <strong>Danger zone</strong>
                  <span>Destructive action</span>
                </div>

                <button
                  type="button"
                  className="admin-cms-side-action admin-cms-side-action--danger"
                  onClick={() => {
                    if (window.confirm(`Delete node "${draft.title || 'Untitled node'}"? Save changes afterwards to persist.`)) {
                      onDeleteLocal(draft)
                    }
                  }}
                >
                  Delete node
                </button>
              </section>
            </>
          ) : null}
        </div>

        <div className="admin-drawer-footer">
          <div className="admin-note-pill">
            Live local preview · use Save in Mission Control to persist
          </div>

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

import { useEffect, useState } from 'react'
import type { AdminReactOverviewStage } from '../../shared/api'
import {
  familyCards,
  getAdminFamilyIcon,
  getAdminFamilyLabel,
  getDefaultAdminConfigForFamily,
  type EditableAdminStage,
  type FamilyId,
} from '../lib/familyConfigs'

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
}: {
  stage: AdminReactOverviewStage
  onClose: () => void
  onApplyLocal: (stage: AdminReactOverviewStage) => void
  onDeleteLocal: (stage: AdminReactOverviewStage) => void
  onMoveLocal: (stage: AdminReactOverviewStage, direction: 'up' | 'down') => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const [draft, setDraft] = useState<AdminReactOverviewStage>(stage)


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

  function getDefaultConfigForFamily(type: FamilyId): Record<string, unknown> {
    return getDefaultAdminConfigForFamily(type)
  }

  function getFamilyLabelForType(type: FamilyId) {
    if (type === 'bearing_hunt') return 'Bearing Hunt'
    if (type === 'circuit_matrix') return 'Circuit Matrix'
    return 'Signal Hunt'
  }

  function handleDraftFamilyChange(nextType: FamilyId) {
    const nextConfig = getDefaultConfigForFamily(nextType)

    updateDraftLocal((current) => ({
      ...(current as EditableAdminStage),
      type: nextType,
      label: getFamilyLabelForType(nextType),
      icon: getAdminFamilyIcon(nextType),
      objective: String(nextConfig.objective || ''),
      config: nextConfig,
      config_summary: Object.keys(nextConfig),
    }))
  }

  useEffect(() => {
    setDraft(stage)
  }, [stage])

  function applyDraftUpdate(nextDraft: AdminReactOverviewStage) {
    setDraft(nextDraft)
    onApplyLocal(nextDraft)
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

  const family = familyCards.find((item) => item.id === draft.type)
  const messages = draft.messages || {}
  const configSummary = draft.config_summary || []
  const isLocalNew = typeof draft.id === 'string' && draft.id.startsWith('local-')

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

  function numberOrNull(value: string) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
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
        <div className="admin-drawer-head">
          <div>
            <span className="admin-kicker">{isLocalNew ? 'Add node' : 'Node editor'}</span>
            <h2>{draft.index + 1}. {draft.title || 'Untitled node'}</h2>
            <small>{family?.icon || '◇'} {draft.label || draft.type}</small>
          </div>

          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="admin-drawer-body">
          <section className="admin-edit-section">
            <div className="admin-edit-section-head">
              <strong>Basics</strong>
              <span>Auto-updating</span>
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
                rows={5}
                value={draft.content || ''}
                onChange={(event) => setDraftField('content', event.target.value)}
              />
            </label>
          </section>

          <section className="admin-edit-section">
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

          <section className="admin-edit-section">
            <div className="admin-edit-section-head">
              <strong>Messages</strong>
              <span>Player-facing copy</span>
            </div>

            <label className="admin-edit-field">
              Hint
              <textarea
                rows={3}
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

          <section className="admin-edit-section admin-family-config-section">
            <div className="admin-edit-section-head">
              <strong>Runtime config</strong>
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

            <small className="admin-family-config-note">
              Changes update immediately. Use Save changes to persist.
            </small>
          </section>

          <section className="admin-edit-section admin-reorder-section">
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

          <div className="admin-edit-actions admin-edit-actions-three">
            

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

            <button type="button" className="admin-cms-side-action" onClick={onClose}>
              Cancel
            </button>
          </div>

          <div className="admin-local-notice">
            Use Save changes in the left rail to persist to backend.
          </div>
        </div>
      </aside>
    </div>
  )
}


function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

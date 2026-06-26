type SettingsPanelProps = {
  missionDraft: Record<string, string>
  settingsSaveState: 'idle' | 'saving' | 'saved' | 'error'
  settingsSaveError: string | null
  onUpdateMissionDraft: (key: string, value: string) => void
  onSaveSettings: () => void
}

export default function SettingsPanel({
  missionDraft,
  settingsSaveState,
  settingsSaveError,
  onUpdateMissionDraft,
  onSaveSettings,
}: SettingsPanelProps) {
  return (
    <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">Settings</span>
          <h2>Mission settings</h2>
          <p>Configure admin copy, player intro text and map defaults.</p>
        </div>

        <div className="admin-panel-count">
          <strong>{missionDraft.player_theme || 'classic'}</strong>
          <span>theme</span>
        </div>
      </div>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Identity</strong>
          <span>Visible names and admin labels</span>
        </div>

        <div className="admin-settings-grid-modern">
          <label>
            Site name
            <input
              value={missionDraft.site_name || ''}
              placeholder="SAGA Engine"
              onChange={(event) => onUpdateMissionDraft('site_name', event.target.value)}
            />
          </label>

          <label>
            Admin title
            <input
              value={missionDraft.admin_title || ''}
              placeholder="Mission Control"
              onChange={(event) => onUpdateMissionDraft('admin_title', event.target.value)}
            />
          </label>

          <label>
            Admin subtitle
            <input
              value={missionDraft.admin_subtitle || ''}
              placeholder="Map-first control panel"
              onChange={(event) => onUpdateMissionDraft('admin_subtitle', event.target.value)}
            />
          </label>

          <label>
            Login subtitle
            <input
              value={missionDraft.login_subtitle || ''}
              placeholder="Protected access"
              onChange={(event) => onUpdateMissionDraft('login_subtitle', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Map defaults</strong>
          <span>Initial center and zoom</span>
        </div>

        <div className="admin-settings-map-grid">
          <label>
            Latitude
            <input
              value={missionDraft.map_center_lat || ''}
              onChange={(event) => onUpdateMissionDraft('map_center_lat', event.target.value)}
            />
          </label>

          <label>
            Longitude
            <input
              value={missionDraft.map_center_lon || ''}
              onChange={(event) => onUpdateMissionDraft('map_center_lon', event.target.value)}
            />
          </label>

          <label>
            Zoom
            <input
              value={missionDraft.map_zoom || ''}
              onChange={(event) => onUpdateMissionDraft('map_zoom', event.target.value)}
            />
          </label>

          <label>
            Player theme
            <select
              value={missionDraft.player_theme || 'classic'}
              onChange={(event) => onUpdateMissionDraft('player_theme', event.target.value)}
            >
              <option value="classic">classic</option>
              <option value="glass">glass</option>
            </select>
          </label>
        </div>
      </section>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Mapbox Configuration</strong>
          <span>Tiles and styling</span>
        </div>

        <div className="admin-settings-grid-modern" style={{ gridTemplateColumns: '1fr' }}>
          <div style={{ padding: '12px 16px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '8px', color: '#facc15', fontSize: '13px', lineHeight: '1.5', marginBottom: '8px' }}>
            <strong>⚠️ Mapbox Quota Warning</strong><br />
            The free tier limit is <strong>200,000 requests per month</strong>. If you configure a Mapbox token, please monitor your usage at console.mapbox.com to avoid unexpected charges. SAGA offline downloads rely on these requests.
          </div>

          <label className="admin-wide-field">
            Mapbox Access Token
            <input
              value={missionDraft.mapbox_token || ''}
              placeholder="pk.ey..."
              onChange={(event) => onUpdateMissionDraft('mapbox_token', event.target.value)}
            />
          </label>

          <label className="admin-wide-field">
            Mapbox Style URL (Optional)
            <input
              value={missionDraft.mapbox_style || ''}
              placeholder="mapbox://styles/mapbox/satellite-streets-v12"
              onChange={(event) => onUpdateMissionDraft('mapbox_style', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Story</strong>
          <span>Player-facing mission narrative</span>
        </div>

        <div className="admin-settings-grid-modern">
          <label>
            Story title
            <input
              value={missionDraft.story_title || ''}
              onChange={(event) => onUpdateMissionDraft('story_title', event.target.value)}
            />
          </label>

          <label className="admin-wide-field">
            Story text
            <textarea
              value={missionDraft.story_text || ''}
              onChange={(event) => onUpdateMissionDraft('story_text', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>Prologue</strong>
          <span>Opening screen before gameplay</span>
        </div>

        <div className="admin-settings-grid-modern">
          <label>
            Prologue title
            <input
              value={missionDraft.prologue_title || ''}
              onChange={(event) => onUpdateMissionDraft('prologue_title', event.target.value)}
            />
          </label>

          <label>
            Prologue subtitle
            <input
              value={missionDraft.prologue_subtitle || ''}
              onChange={(event) => onUpdateMissionDraft('prologue_subtitle', event.target.value)}
            />
          </label>

          <label className="admin-wide-field">
            Prologue body
            <textarea
              value={missionDraft.prologue_body || ''}
              onChange={(event) => onUpdateMissionDraft('prologue_body', event.target.value)}
            />
          </label>
        </div>
      </section>

      {settingsSaveState === 'error' && settingsSaveError ? (
        <div className="admin-save-error">
          <strong>Settings save failed</strong>
          <span>{settingsSaveError}</span>
        </div>
      ) : null}

      <div className="admin-local-actions admin-panel-sticky-actions">
        <button
          type="button"
          className="admin-cms-side-action admin-cms-side-action--save"
          onClick={onSaveSettings}
          disabled={settingsSaveState === 'saving'}
        >
          {settingsSaveState === 'saving'
            ? 'Saving settings…'
            : settingsSaveState === 'saved'
              ? 'Settings saved'
              : 'Save settings'}
        </button>
      </div>
    </div>
  )
}

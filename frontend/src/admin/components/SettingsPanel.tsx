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
    <div className="admin-cms-local-panel admin-settings-panel">
      <strong>Settings</strong>
      <span>Edit mission/admin text and map defaults. Save settings to persist.</span>

      <label>
        Site name
        <input
          value={missionDraft.site_name || ''}
          onChange={(event) => onUpdateMissionDraft('site_name', event.target.value)}
        />
      </label>

      <label>
        Admin title
        <input
          value={missionDraft.admin_title || ''}
          onChange={(event) => onUpdateMissionDraft('admin_title', event.target.value)}
        />
      </label>

      <label>
        Admin subtitle
        <input
          value={missionDraft.admin_subtitle || ''}
          onChange={(event) => onUpdateMissionDraft('admin_subtitle', event.target.value)}
        />
      </label>

      <label>
        Login subtitle
        <input
          value={missionDraft.login_subtitle || ''}
          onChange={(event) => onUpdateMissionDraft('login_subtitle', event.target.value)}
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

      <div className="admin-settings-grid">
        <label>
          Map latitude
          <input
            value={missionDraft.map_center_lat || ''}
            onChange={(event) => onUpdateMissionDraft('map_center_lat', event.target.value)}
          />
        </label>

        <label>
          Map longitude
          <input
            value={missionDraft.map_center_lon || ''}
            onChange={(event) => onUpdateMissionDraft('map_center_lon', event.target.value)}
          />
        </label>

        <label>
          Map zoom
          <input
            value={missionDraft.map_zoom || ''}
            onChange={(event) => onUpdateMissionDraft('map_zoom', event.target.value)}
          />
        </label>
      </div>

      <label>
        Story title
        <input
          value={missionDraft.story_title || ''}
          onChange={(event) => onUpdateMissionDraft('story_title', event.target.value)}
        />
      </label>

      <label>
        Story text
        <textarea
          value={missionDraft.story_text || ''}
          onChange={(event) => onUpdateMissionDraft('story_text', event.target.value)}
        />
      </label>

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

      <label>
        Prologue body
        <textarea
          value={missionDraft.prologue_body || ''}
          onChange={(event) => onUpdateMissionDraft('prologue_body', event.target.value)}
        />
      </label>

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

      {settingsSaveState === 'error' && settingsSaveError ? (
        <div className="admin-save-error">
          <strong>Settings save failed</strong>
          <span>{settingsSaveError}</span>
        </div>
      ) : null}
    </div>
  )
}

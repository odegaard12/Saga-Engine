type SettingsPanelProps = {
  missionDraft: Record<string, string>
  settingsSaveState: 'idle' | 'saving' | 'saved' | 'error'
  settingsSaveError: string | null
  onUpdateMissionDraft: (key: string, value: string) => void
  onSaveSettings: () => void
}

import { useI18n } from '../../i18n/useI18n'

export default function SettingsPanel({
  missionDraft,
  settingsSaveState,
  settingsSaveError,
  onUpdateMissionDraft,
  onSaveSettings,
}: SettingsPanelProps) {
  const { t } = useI18n()

  return (
    <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">{t('admin.settingsPanel.title')}</span>
          <h2>{t('admin.settingsPanel.title')}</h2>
          <p>{t('admin.settingsPanel.subtitle')}</p>
        </div>

        <div className="admin-panel-count">
          <strong>{missionDraft.player_theme || 'classic'}</strong>
          <span>{t('admin.settingsPanel.themeLabel')}</span>
        </div>
      </div>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong>{t('admin.settingsPanel.identity')}</strong>
          <span>{t('admin.settingsPanel.identitySubtitle')}</span>
        </div>

        <div className="admin-settings-grid-modern">
          <label>
            {t('admin.settingsPanel.siteName')}
            <input
              value={missionDraft.site_name || ''}
              placeholder="SAGA Engine"
              onChange={(event) => onUpdateMissionDraft('site_name', event.target.value)}
            />
          </label>

          <label>
            {t('admin.settingsPanel.adminTitle')}
            <input
              value={missionDraft.admin_title || ''}
              placeholder="Mission Control"
              onChange={(event) => onUpdateMissionDraft('admin_title', event.target.value)}
            />
          </label>

          <label>
            {t('admin.settingsPanel.adminSubtitle')}
            <input
              value={missionDraft.admin_subtitle || ''}
              placeholder="Map-first control panel"
              onChange={(event) => onUpdateMissionDraft('admin_subtitle', event.target.value)}
            />
          </label>

          <label>
            {t('admin.settingsPanel.loginSubtitle')}
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
          <strong>{t('admin.settingsPanel.mapDefaults')}</strong>
          <span>{t('admin.settingsPanel.mapDefaultsSubtitle')}</span>
        </div>

        <div className="admin-settings-map-grid">
          <label>
            {t('admin.settingsPanel.latitude')}
            <input
              value={missionDraft.map_center_lat || ''}
              onChange={(event) => onUpdateMissionDraft('map_center_lat', event.target.value)}
            />
          </label>

          <label>
            {t('admin.settingsPanel.longitude')}
            <input
              value={missionDraft.map_center_lon || ''}
              onChange={(event) => onUpdateMissionDraft('map_center_lon', event.target.value)}
            />
          </label>

          <label>
            {t('admin.settingsPanel.zoom')}
            <input
              value={missionDraft.map_zoom || ''}
              onChange={(event) => onUpdateMissionDraft('map_zoom', event.target.value)}
            />
          </label>

          <label>
            {t('admin.settingsPanel.themeLabel')}
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
          <strong>{t('admin.settingsPanel.mapboxTitle')}</strong>
          <span>{t('admin.settingsPanel.mapboxSubtitle')}</span>
        </div>

        <div className="admin-settings-grid-modern" style={{ gridTemplateColumns: '1fr' }}>
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '8px',
              color: '#facc15',
              fontSize: '13px',
              lineHeight: '1.5',
              marginBottom: '8px',
            }}
          >
            <strong>{t('admin.settingsPanel.mapboxWarningTitle')}</strong>
            <br />
            {t('admin.settingsPanel.mapboxWarningText')}
          </div>

          <label className="admin-wide-field">
            {t('admin.settingsPanel.mapboxToken')}
            <input
              value={missionDraft.mapbox_token || ''}
              placeholder="pk.ey..."
              onChange={(event) => onUpdateMissionDraft('mapbox_token', event.target.value)}
            />
          </label>

          <label className="admin-wide-field">
            {t('admin.settingsPanel.mapboxStyle')}
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
          <strong style={{ color: '#38bdf8' }}>📜 Editor de Prólogo e Historia Inicial</strong>
          <span>Configura el título, subtítulo e historia del prólogo que ven los jugadores al iniciar la misión</span>
        </div>

        <div className="admin-settings-grid-modern">
          <label>
            Título del Prólogo
            <input
              value={missionDraft.prologue_title || ''}
              placeholder="Ej: Título de la misión"
              onChange={(event) => onUpdateMissionDraft('prologue_title', event.target.value)}
            />
          </label>

          <label>
            Subtítulo del Prólogo
            <input
              value={missionDraft.prologue_subtitle || ''}
              placeholder="Ej: Misión en el monte"
              onChange={(event) => onUpdateMissionDraft('prologue_subtitle', event.target.value)}
            />
          </label>

          <label className="admin-wide-field">
            URL Imagen de Portada del Prólogo (Opcional)
            <input
              value={missionDraft.prologue_image_url || ''}
              placeholder="https://ejemplo.com/imagen-prologo.jpg"
              onChange={(event) => onUpdateMissionDraft('prologue_image_url', event.target.value)}
            />
          </label>

          <label className="admin-wide-field">
            Cuerpo / Texto Completo de la Historia del Prólogo
            <textarea
              rows={6}
              value={missionDraft.prologue_body || ''}
              onChange={(event) => onUpdateMissionDraft('prologue_body', event.target.value)}
              placeholder="Escribe aquí la historia inicial. Puedes usar Markdown para dar formato: **texto en negrita**, *cursiva*, o imágenes ![Descripción](https://url-de-la-imagen.jpg)..."
              style={{ minHeight: '120px', fontFamily: 'inherit', fontSize: '13px', lineHeight: '1.5' }}
            />
          </label>
        </div>
      </section>

      <section className="admin-settings-section-modern">
        <div className="admin-settings-section-head">
          <strong style={{ color: '#22c55e' }}>🔐 Pantalla de Inicio de Sesión (Login de Jugador)</strong>
          <span>Personaliza el texto de bienvenida, subtítulo e instrucciones que ven los jugadores al entrar</span>
        </div>

        <div className="admin-settings-grid-modern">
          <label>
            Título de Bienvenida (Login)
            <input
              value={missionDraft.login_title || ''}
              placeholder="Ej: Benvidos a SAGA Engine"
              onChange={(event) => onUpdateMissionDraft('login_title', event.target.value)}
            />
          </label>

          <label>
            Subtítulo de Login
            <input
              value={missionDraft.login_subtitle || ''}
              placeholder="Ej: Selecciona o teu equipo ou introduce a túa clave"
              onChange={(event) => onUpdateMissionDraft('login_subtitle', event.target.value)}
            />
          </label>

          <label className="admin-wide-field">
            Instrucciones o Mensaje de Login
            <textarea
              rows={3}
              value={missionDraft.login_instructions || ''}
              onChange={(event) => onUpdateMissionDraft('login_instructions', event.target.value)}
              placeholder="Mensaje o aviso para los jugadores al iniciar sesión..."
              style={{ minHeight: '80px', fontFamily: 'inherit', fontSize: '13px' }}
            />
          </label>
        </div>
      </section>

      {settingsSaveState === 'error' && settingsSaveError ? (
        <div className="admin-save-error">
          <strong>{t('admin.settingsPanel.saveFailed')}</strong>
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
            ? t('admin.settingsPanel.saving')
            : settingsSaveState === 'saved'
              ? t('admin.settingsPanel.saved')
              : t('admin.settingsPanel.save')}
        </button>
      </div>
    </div>
  )
}

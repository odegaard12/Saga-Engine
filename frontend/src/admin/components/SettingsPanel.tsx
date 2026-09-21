import { useEffect as useEffectRed, useState as useStateRed } from 'react'
type SettingsPanelProps = {
  missionDraft: Record<string, string>
  settingsSaveState: 'idle' | 'saving' | 'saved' | 'error'
  settingsSaveError: string | null
  onUpdateMissionDraft: (key: string, value: string) => void
  onSaveSettings: () => void
  missionPassEnabled: boolean
  onClearMissionPass: () => void
}

import { useI18n } from '../../i18n/useI18n'
import { TEMAS, TEMA_POR_DEFECTO } from '../../shared/tema'

export default function SettingsPanel({
  missionDraft,
  settingsSaveState,
  settingsSaveError,
  onUpdateMissionDraft,
  onSaveSettings,
  missionPassEnabled,
  onClearMissionPass,
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

        <div className="admin-panel-count" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span>{t('admin.settingsPanel.themeLabel')}</span>
          <select
            value={missionDraft.player_theme || TEMA_POR_DEFECTO}
            onChange={(event) => onUpdateMissionDraft('player_theme', event.target.value)}
            style={{ padding: '4px 8px', borderRadius: '4px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            {/* De la lista canonica: escritas a mano se quedaban atras. */}
            {TEMAS.map((tema) => (
              <option key={tema.id} value={tema.id}>
                {tema.etiqueta}
              </option>
            ))}
          </select>
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
          <strong>Contraseña de misión</strong>
          <span>
            Una sola clave para todo el grupo. Cierra la entrada: sin ella, saber
            un nombre bastaba para colarse y ver el mapa y las fotos del grupo.
          </span>
        </div>

        <div className="admin-settings-grid-modern" style={{ gridTemplateColumns: '1fr' }}>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: missionPassEnabled
                ? 'rgba(34, 197, 94, 0.12)'
                : 'rgba(148, 163, 184, 0.12)',
              border: `1px solid ${
                missionPassEnabled ? 'rgba(34,197,94,0.35)' : 'rgba(148,163,184,0.3)'
              }`,
              color: missionPassEnabled ? '#4ade80' : '#cbd5e1',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {missionPassEnabled
              ? '● Activa — los jugadores tienen que teclear la clave para entrar.'
              : '○ Desactivada — cualquiera con un nombre puede entrar.'}
          </div>

          <label className="admin-wide-field">
            {missionPassEnabled ? 'Nueva clave (deja en blanco para no cambiarla)' : 'Clave de misión'}
            <input
              type="password"
              value={missionDraft.mission_pass || ''}
              placeholder={missionPassEnabled ? '••••••••' : 'Escribe una clave para activar'}
              autoComplete="new-password"
              onChange={(event) => onUpdateMissionDraft('mission_pass', event.target.value)}
            />
          </label>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Se guarda cifrada, nunca viaja de vuelta. Al cambiarla, las sesiones
              abiertas caducan y hay que volver a teclearla.
            </span>
            {missionPassEnabled ? (
              <button
                type="button"
                onClick={onClearMissionPass}
                style={{
                  marginLeft: 'auto',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(248,113,113,0.4)',
                  background: 'rgba(248,113,113,0.12)',
                  color: '#fca5a5',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Quitar contraseña
              </button>
            ) : null}
          </div>
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
          <strong style={{ color: '#f59e0b' }}>🕒 Fecha y Hora de Inicio</strong>
          <span>
            Deja que la gente descargue la misión y conceda permisos con días de antelación,
            pero no dejes que se complete ningún nodo hasta esta fecha. Vacío = sin bloqueo,
            la misión se puede jugar en cuanto se entra.
          </span>
        </div>

        <div className="admin-settings-grid-modern">
          <label>
            La misión empieza el
            <input
              type="datetime-local"
              value={missionDraft.mission_launch_at || ''}
              onChange={(event) => onUpdateMissionDraft('mission_launch_at', event.target.value)}
            />
          </label>
        </div>
      </section>

      <RedDeCaminos />

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

type EstadoRed = {
  hay: boolean
  built_at?: string
  nodos?: number
  tramos?: number
  bytes?: number
  margen_km?: number
}

/**
 * La red de caminos de la zona, descargada de OpenStreetMap.
 *
 * El mapa de este panel DIBUJA las carreteras, pero no las tiene como datos.
 * Para que la guía del jugador redirija por carreteras y caminos cuando se
 * sale del trazado, hace falta la red como grafo. Se descarga aquí, una
 * vez por ruta, y viaja en el paquete offline de cada móvil.
 */
function RedDeCaminos() {
  const [estado, setEstado] = useStateRed<EstadoRed | null>(null)
  const [ocupado, setOcupado] = useStateRed(false)
  const [aviso, setAviso] = useStateRed<string | null>(null)
  const [margen, setMargen] = useStateRed(12)

  async function pedir(ruta: string, cuerpo: Record<string, unknown> = {}) {
    const res = await fetch(ruta, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const datos = (await res.json().catch(() => ({}))) as EstadoRed & { status?: string; detail?: string }
    if (!res.ok || datos.status === 'error') throw new Error(datos.detail || `HTTP ${res.status}`)
    return datos
  }

  useEffectRed(() => {
    let vivo = true
    pedir('/api/admin/road-graph/status')
      .then((datos) => {
        if (vivo) setEstado(datos)
      })
      .catch(() => {
        if (vivo) setEstado({ hay: false })
      })
    return () => {
      vivo = false
    }
  }, [])

  async function preparar() {
    setOcupado(true)
    setAviso(null)
    try {
      const datos = await pedir('/api/admin/road-graph/build', { margen_km: margen })
      setEstado(datos)
      setAviso('Red de caminos preparada. Los móviles la bajarán con el paquete offline en la próxima entrada.')
    } catch (fallo) {
      setAviso(`No se pudo preparar: ${String((fallo as Error).message || fallo)}`)
    } finally {
      setOcupado(false)
    }
  }

  const mb = estado?.bytes ? (estado.bytes / 1024 / 1024).toFixed(1) : null

  return (
    <section className="admin-settings-section-modern">
      <div className="admin-settings-section-head">
        <strong style={{ color: '#38bdf8' }}>🛣️ Red de caminos (para redirigir fuera del trazado)</strong>
        <span>
          Descarga de OpenStreetMap las carreteras y caminos alrededor de la ruta y los guarda como
          grafo. Con esto, si un jugador se sale del trazado, la guía le lleva de vuelta por
          caminos reales, sin cobertura. Se prepara una vez por ruta; tarda entre medio minuto y
          dos.
        </span>
      </div>

      <div className="admin-settings-grid-modern">
        <label>
          Margen alrededor de la ruta (km)
          <input
            type="number"
            min={3}
            max={30}
            value={margen}
            onChange={(event) => setMargen(Number(event.target.value) || 12)}
          />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'end' }}>
          <button type="button" className="admin-btn-modern" disabled={ocupado} onClick={preparar}>
            {ocupado ? 'Descargando de OpenStreetMap…' : estado?.hay ? 'Volver a preparar' : 'Preparar red de caminos'}
          </button>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {estado === null
              ? 'Comprobando…'
              : estado.hay
                ? `Preparada el ${estado.built_at || '?'} · ${estado.tramos ?? '?'} tramos · ${estado.nodos ?? '?'} cruces · ${mb ?? '?'} MB · margen ${estado.margen_km ?? '?'} km`
                : 'Sin preparar: fuera del trazado la guía irá en línea recta.'}
          </span>
          {aviso ? <span style={{ fontSize: 12 }}>{aviso}</span> : null}
        </div>
      </div>
    </section>
  )
}

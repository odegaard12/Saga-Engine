import type { CSSProperties } from 'react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
import { getDefaultAdminStagePatchForGame } from '../lib/gameCatalog'
import GuidedNodeEditorFlow from './GuidedNodeEditorFlow'
import PhysicalQrCardsPanel, {
  type PhysicalQrKind,
  type SavedPhysicalQrCard,
} from './PhysicalQrCardsPanel'

type NodePhysicalMode = 'none' | PhysicalQrKind | 'map_collectible' | 'qr'

type NodePhysicalTypePanelProps = {
  stage: AdminReactOverviewStage
  onApplyLocal: (stage: AdminReactOverviewStage) => void
  chooserOnly?: boolean
  onFinishChoice?: () => void
  onRequestChangeType?: () => void
  onClose?: () => void
  onDeleteLocal?: (stage: AdminReactOverviewStage) => void
}

const physicalModes: Array<{ id: PhysicalQrKind; label: string; help: string; icon: string }> = [
  { id: 'collectible', label: 'Coleccionable', help: 'Objeto físico que se recoge', icon: '⭐' },
  {
    id: 'requirement',
    label: 'Llave QR',
    help: 'Objeto que puede desbloquear otro nodo',
    icon: '🔑',
  },
  { id: 'clue', label: 'Pista QR', help: 'Tarjeta física con pista', icon: '🧩' },
  { id: 'bonus', label: 'Bonus QR', help: 'Extra o recompensa física', icon: '🎁' },
]

function getPhysicalMode(stage: AdminReactOverviewStage): NodePhysicalMode {
  const record = stage as unknown as Record<string, unknown>
  const config =
    record.config && typeof record.config === 'object'
      ? (record.config as Record<string, unknown>)
      : {}
  if (config.is_map_collectible || record.is_map_collectible) {
    return 'map_collectible'
  }

  const raw = record.physical_node_kind || record.physical_item_kind

  if (raw === 'collectible' || raw === 'requirement' || raw === 'clue' || raw === 'bonus')
    return raw

  const physicalQr = record.physical_qr
  if (physicalQr && typeof physicalQr === 'object') {
    const qrKind = (physicalQr as Record<string, unknown>).kind
    if (
      qrKind === 'collectible' ||
      qrKind === 'requirement' ||
      qrKind === 'clue' ||
      qrKind === 'bonus'
    ) {
      return qrKind
    }
  }

  return 'none'
}

function clearPhysicalFields(stage: AdminReactOverviewStage): AdminReactOverviewStage {
  const next = { ...(stage as unknown as Record<string, unknown>) }

  delete next.physical_node_kind
  delete next.physical_qr
  delete next.qr_payload
  delete next.physical_item_id
  delete next.physical_item_label
  delete next.physical_item_kind
  delete next.is_map_collectible

  const config =
    next.config && typeof next.config === 'object'
      ? { ...(next.config as Record<string, unknown>) }
      : {}
  delete config.is_map_collectible
  delete config.physical_item_id
  delete config.physical_item_label
  delete config.game_id
  delete config.game_title
  delete config.success_code
  delete config.fallback_code

  next.config = config
  next._type_choice_done = true
  next._clear_physical_fields = true

  return next as unknown as AdminReactOverviewStage
}

function getStageText(stage: AdminReactOverviewStage, key: string): string {
  const value = (stage as unknown as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function getStageConfig(stage: AdminReactOverviewStage): Record<string, unknown> {
  const record = stage as unknown as Record<string, unknown>
  return record.config && typeof record.config === 'object' && !Array.isArray(record.config)
    ? (record.config as Record<string, unknown>)
    : {}
}

function buildFallbackCodeForPhysicalStage(stage: AdminReactOverviewStage) {
  const config = getStageConfig(stage)
  const existing = String(config.success_code || config.fallback_code || '')
    .trim()
    .toUpperCase()
  if (existing) return existing

  const index = typeof stage.index === 'number' ? stage.index + 1 : 1
  return `SAGA-${String(index).padStart(2, '0')}`
}

function formatCoord(value: unknown): string {
  return typeof value === 'number' ? value.toFixed(5) : 'Sin GPS'
}

function slugifyPhysicalValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function buildDefaultPhysicalQrCard(
  stage: AdminReactOverviewStage,
  kind: PhysicalQrKind
): SavedPhysicalQrCard {
  const record = stage as unknown as Record<string, unknown>
  const physicalQr =
    record.physical_qr && typeof record.physical_qr === 'object'
      ? (record.physical_qr as Partial<SavedPhysicalQrCard>)
      : {}

  const mode = physicalModes.find((item) => item.id === kind)
  const label = String(
    record.physical_item_label || physicalQr.label || stage.title || 'Objeto SAGA'
  ).trim()

  const itemId = String(
    record.physical_item_id || physicalQr.item_id || slugifyPhysicalValue(label) || 'objeto_saga'
  ).trim()

  const payload = physicalQr.payload || `SAGA1:ITEM:${itemId}:${label}`

  return {
    item_id: itemId,
    label,
    kind,
    payload,
    card_text:
      physicalQr.card_text ||
      `${mode?.icon || '⭐'} ${label}\n${mode?.label || 'Objeto QR'}\nEscanea esta tarjeta en SAGA.`,
    updated_at: physicalQr.updated_at || new Date().toISOString(),
  }
}

export default function NodePhysicalTypePanel({
  stage,
  onApplyLocal,
  chooserOnly = false,
  onFinishChoice,
  onRequestChangeType,
  onClose,
  onDeleteLocal,
}: NodePhysicalTypePanelProps) {
  const mode = getPhysicalMode(stage)
  const isPhysical = mode !== 'none'
  const isLocalNewPhysicalStage = typeof stage.id === 'string' && stage.id.startsWith('local-')

  const isLocalNew = typeof stage.id === 'string' && stage.id.startsWith('local-')

  function requestDeleteLocal() {
    if (!onDeleteLocal) return

    const action = isLocalNew ? 'Descartar' : 'Eliminar'
    const suffix = isLocalNew ? 'Se quitará de la edición local.' : 'Guarda después para persistir.'
    const title = stage.title || 'Sin título'

    if (window.confirm(`${action} nodo "${title}"? ${suffix}`)) {
      onDeleteLocal(stage)
    }
  }

  function patchStage(patch: Record<string, unknown>) {
    onApplyLocal({
      ...(stage as unknown as Record<string, unknown>),
      ...patch,
    } as unknown as AdminReactOverviewStage)
  }

  function setMode(nextMode: NodePhysicalMode) {
    if (nextMode === 'none') {
      onApplyLocal(clearPhysicalFields(stage))
      onFinishChoice?.()
      return
    }

    if (nextMode === 'map_collectible') {
      const baseCheckpoint = getDefaultAdminStagePatchForGame('simple_checkpoint')
      onApplyLocal({
        ...(stage as unknown as Record<string, unknown>),
        type: baseCheckpoint.type,
        label: 'Coleccionable de mapa',
        title: 'Objeto Coleccionable',
        physical_qr: null,
        physical_node_kind: 'collectible',
        physical_item_kind: 'collectible',
        physical_item_id: (stage as any).physical_item_id || 'objeto_mapa',
        physical_item_label: (stage as any).physical_item_label || 'Objeto de mapa',
        game_family: 'physical_qr',
        game_type: 'qr_collectible',
        game_template_id: 'qr_collectible',
        entry_mode: 'gps',
        completion_method: 'proximity',
        requires_proximity: true,
        qr_payload: '',
        fallback_code: 'OK',
        physical_fallback_code: 'OK',
        config: {
          ...((stage as any).config || {}),
          is_map_collectible: true,
          completion_method: 'proximity',
          game_id: 'qr_collectible',
          game_title: 'Objeto de mapa',
        },
        messages: {
          hint: 'Acércate para recoger este objeto.',
          gps_unavailable: 'Activa GPS para poder recoger el objeto.',
          locked: 'Muévete al punto para recoger el objeto.',
        },
        content: 'Un objeto coleccionable se encuentra en esta ubicación. Acércate para recogerlo.',
        description: 'Objeto coleccionable de mapa.',
        _type_choice_done: true,
      } as any)
      onFinishChoice?.()
      return
    }

    if (nextMode === 'qr') {
      const card = buildDefaultPhysicalQrCard(stage, 'collectible')
      onApplyLocal({
        ...(stage as unknown as Record<string, unknown>),
        physical_qr: card,
        physical_node_kind: 'collectible',
        physical_item_kind: 'collectible',
        qr_payload: card.payload,
        physical_item_id: card.item_id,
        physical_item_label: card.label,
        game_family: 'physical_qr',
        game_type: 'qr_collectible',
        game_template_id: 'qr_collectible',
        entry_mode: 'qr',
        completion_method: 'qr_scan',
        requires_proximity: false,
        fallback_code: buildFallbackCodeForPhysicalStage(stage),
        physical_fallback_code: buildFallbackCodeForPhysicalStage(stage),
        config: {
          ...((stage as any).config || {}),
          is_map_collectible: false,
          completion_method: 'qr_scan',
          game_id: 'qr_collectible',
          game_title: 'Objeto QR',
        },
        _type_choice_done: true,
      } as any)
      onFinishChoice?.()
      return
    }

    const card = buildDefaultPhysicalQrCard(stage, nextMode as any)

    patchStage({
      physical_node_kind: nextMode,
      physical_item_kind: nextMode,
      physical_qr: card,
      qr_payload: card.payload,
      physical_item_id: card.item_id,
      physical_item_label: card.label,
    })
    onFinishChoice?.()
  }

  function saveQrCard(card: SavedPhysicalQrCard) {
    const config = getStageConfig(stage)
    patchStage({
      physical_node_kind: card.kind,
      physical_qr: card,
      qr_payload: card.payload,
      physical_item_id: card.item_id,
      physical_item_label: card.label,
      physical_item_kind: card.kind,
      config: {
        ...config,
        success_code: String(
          config.success_code || config.fallback_code || buildFallbackCodeForPhysicalStage(stage)
        ),
      },
    })
  }

  function updatePhysicalFallbackCode(value: string) {
    const config = getStageConfig(stage)
    patchStage({
      config: {
        ...config,
        success_code: value.trim().toUpperCase(),
      },
    })
  }

  if (!chooserOnly && isPhysical) {
    return (
      <section
        className="saga-node-physical-type-panel saga-physical-guided-v4-shell"
        style={panel}
        aria-label="Editor guiado de QR físico"
      >
        <GuidedNodeEditorFlow
          stage={stage as unknown as Record<string, any>}
          onPatch={(patch: Record<string, any>) => patchStage(patch)}
          onClose={onClose ?? (() => undefined)}
          onDelete={requestDeleteLocal}
        />
      </section>
    )
  }

  if (chooserOnly) {
    return (
      <section className="saga-type-chooser-v4" style={panel} aria-label="Tipo de nodo">
        <header className="saga-type-chooser-v4-head">
          <div>
            <span>TIPO DE NODO</span>
            <h2>Selecciona el tipo de nodo</h2>
            <p>Elige la experiencia o interacción que tendrá este punto en la misión.</p>
          </div>
        </header>

        <div className="saga-type-chooser-v4-grid">
          <button
            type="button"
            className={mode === 'none' && ((stage as any).game_type === 'simple_checkpoint' || (stage as any).config?.game_id === 'simple_checkpoint') ? 'active' : ''}
              onClick={() => {
                const baseCheckpoint = getDefaultAdminStagePatchForGame('simple_checkpoint')
                const cleared = clearPhysicalFields(stage) as unknown as Record<string, unknown>

                onApplyLocal({
                  ...cleared,
                  ...baseCheckpoint,
                  type: baseCheckpoint.type,
                  label: 'Checkpoint',
                  icon: baseCheckpoint.icon,
                  title: stage.title || 'Checkpoint / Texto Rápido',
                  game_type: 'simple_checkpoint',
                  game_template_id: 'simple_checkpoint',
                  game_family: baseCheckpoint.type,
                  entry_mode: 'gps',
                  completion_method: 'proximity',
                  requires_proximity: true,
                  content:
                    String((stage as any).content || '').trim() ||
                    'Escribe aquí el texto o pista que se mostrará al jugador en este checkpoint.',
                  config: {
                    ...((cleared.config as Record<string, unknown>) || {}),
                    ...((baseCheckpoint.config as Record<string, unknown>) || {}),
                    is_map_collectible: false,
                    game_id: 'simple_checkpoint',
                    game_title: 'Checkpoint',
                    objective: 'checkpoint',
                    completion_method: 'proximity',
                  },
                  _clear_physical_fields: true,
                  _type_choice_done: true,
                } as unknown as AdminReactOverviewStage)
                onFinishChoice?.()
              }}
          >
            <i>📍</i>
            <strong>Checkpoint / Pista</strong>
            <small>Punto GPS simple. Muestra texto, historia o pista sin minijuegos complejos.</small>
          </button>

          <button
            type="button"
            className={mode === 'none' && (stage as any).game_type !== 'simple_checkpoint' && (stage as any).config?.game_id !== 'simple_checkpoint' ? 'active' : ''}
            onClick={() => setMode('none')}
          >
            <i>🎮</i>
            <strong>Minijuego o Desafío</strong>
            <small>Prueba interactiva en mapa: Laberinto, Secuencia, Matriz, Agitar o Sonido.</small>
          </button>

          <button
            type="button"
            className={mode === 'map_collectible' ? 'active' : ''}
            onClick={() => setMode('map_collectible')}
          >
            <i>🌟</i>
            <strong>Coleccionable (GPS)</strong>
            <small>Objeto digital que el jugador recoge automáticamente al acercarse con el GPS.</small>
          </button>

          <button
            type="button"
            className={mode === 'qr' ? 'active' : ''}
            onClick={() => setMode('qr')}
          >
            <i>🖨️</i>
            <strong>Tarjeta QR Física</strong>
            <small>Llave, pista u objeto impreso que requiere escanear un código QR físico.</small>
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="saga-node-physical-type-panel" style={panel} aria-label="Tipo de nodo">
      {onClose ? (
        <div className="saga-physical-editor-topbar">
          <div className="saga-physical-editor-topbar__copy">
            <span>{isPhysical ? 'QR físico' : 'Nodo normal'}</span>
            <strong>{stage.title || (isPhysical ? 'Objeto físico' : 'Nodo')}</strong>
          </div>
          <div className="saga-physical-editor-topbar__actions">
            <button
              type="button"
              className="saga-physical-editor-topbar__change"
              onClick={onRequestChangeType}
            >
              Cambiar tipo
            </button>
            {onDeleteLocal ? (
              <button
                type="button"
                className="saga-physical-editor-topbar__delete"
                onClick={() => {
                  const action = isLocalNewPhysicalStage ? 'Descartar nodo local' : 'Eliminar nodo'
                  if (
                    window.confirm(
                      `${action} "${stage.title || 'Sin título'}"? Guarda después para persistir.`
                    )
                  ) {
                    onDeleteLocal(stage)
                    onClose?.()
                  }
                }}
                aria-label={
                  isLocalNewPhysicalStage ? 'Descartar nodo local' : 'Eliminar nodo físico'
                }
              >
                {isLocalNewPhysicalStage ? 'Descartar' : 'Eliminar'}
              </button>
            ) : null}
            <button
              type="button"
              className="saga-physical-editor-topbar__close"
              onClick={onClose}
              aria-label="Cerrar editor físico"
            >
              Cerrar ×
            </button>
          </div>
        </div>
      ) : null}
      {chooserOnly ? (
        <div style={head}>
          <div>
            <div style={eyebrow}>TIPO DE NODO</div>
            <strong style={title}>{isPhysical ? 'Nodo QR físico' : 'Nodo normal jugable'}</strong>
            <p style={intro}>
              {isPhysical
                ? 'Usa este modo para objetos físicos, llaves, pistas o bonus. No muestra el editor de minijuego normal.'
                : 'Usa este modo para ruta, GPS, minijuego y reglas normales.'}
            </p>
          </div>
          <span style={isPhysical ? activeBadge : badge}>
            {isPhysical ? 'QR FÍSICO' : 'NORMAL'}
          </span>
        </div>
      ) : null}
      {chooserOnly ? (
        <div style={modeLayout}>
          <button
            type="button"
            style={mode === 'none' ? normalActiveButton : normalButton}
            onClick={() => setMode('none')}
          >
            <span style={modeIcon}>●</span>
            <span>
              <strong style={modeLabel}>Normal</strong>
              <small style={modeHelp}>Ruta, GPS o minijuego</small>
            </span>
          </button>

          <div style={physicalGrid}>
            {physicalModes.map((item) => (
              <button
                key={item.id}
                type="button"
                style={mode === item.id ? activeButton : modeButton}
                onClick={() => setMode(item.id)}
              >
                <span style={modeIcon}>{item.icon}</span>
                <strong style={modeLabel}>{item.label}</strong>
                <small style={modeHelp}>{item.help}</small>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={changeTypeBar}>
          <span>{isPhysical ? 'Configurar objeto físico' : 'Configurar nodo'}</span>
          <button type="button" style={changeTypeButton} onClick={onRequestChangeType}>
            Cambiar
          </button>
        </div>
      )}

      {!chooserOnly && isPhysical ? (
        <div style={physicalEditor}>
          <div style={sectionTitle}>
            <span>Datos del objeto</span>
            <small>Datos básicos y código de emergencia</small>
          </div>

          <label style={field}>
            Nombre visible
            <input
              value={stage.title || ''}
              onChange={(event) => patchStage({ title: event.target.value, physical_item_label: event.target.value })}
              placeholder="Buscar a tu enemigo"
              style={input}
            />
          </label>

          <label style={field}>
            Descripción breve
            <textarea
              value={getStageText(stage, 'content')}
              onChange={(event) => patchStage({ content: event.target.value })}
              placeholder="Objeto escondido, pista física o misión secundaria."
              style={textarea}
            />
          </label>

          <div style={infoGrid}>
            <div style={infoPill}>
              <span>Lat</span>
              <b>{formatCoord((stage as AdminReactOverviewStage & { lat?: unknown }).lat)}</b>
            </div>
            <div style={infoPill}>
              <span>Lon</span>
              <b>{formatCoord((stage as AdminReactOverviewStage & { lon?: unknown }).lon)}</b>
            </div>
            <div style={infoPill}>
              <span>Mapa</span>
              <b>Mover punto</b>
            </div>
          </div>

          <div style={fallbackPanel}>
            <div style={sectionTitle}>
              <span>Código fallback</span>
              <small>
                Emergencia offline para completar este QR si falla la cámara, el escaneo o la
                cobertura.
              </small>
            </div>

            <label style={field}>
              Código preestablecido
              <input
                value={buildFallbackCodeForPhysicalStage(stage)}
                placeholder={buildFallbackCodeForPhysicalStage(stage)}
                onChange={(event) => updatePhysicalFallbackCode(event.target.value)}
                style={input}
              />
            </label>

            <button
              type="button"
              style={changeTypeButton}
              onClick={() =>
                updatePhysicalFallbackCode(`SAGA-${String(stage.index + 1).padStart(2, '0')}`)
              }
            >
              Generar fallback
            </button>
          </div>

          {mode !== 'map_collectible' && (
            <PhysicalQrCardsPanel
              initialLabel={
                (stage as AdminReactOverviewStage & { physical_item_label?: string })
                  .physical_item_label ||
                stage.title ||
                'Buscar a tu enemigo'
              }
              initialKind={mode as any}
              compact
              onSaveToNode={saveQrCard}
            />
          )}
        </div>
      ) : !chooserOnly ? (
        <div style={emptyBox}>
          Nodo normal. El editor de juego, ubicación, mensajes y reglas está debajo.
        </div>
      ) : null}
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 14,
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.60), rgba(15,23,42,.38))',
}

const head: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const eyebrow: CSSProperties = {
  color: '#93c5fd',
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  display: 'block',
  marginTop: 4,
  color: '#ffffff',
  fontSize: 17,
  lineHeight: 1.08,
  fontWeight: 950,
}

const intro: CSSProperties = {
  margin: '7px 0 0',
  color: 'rgba(226,232,240,.72)',
  fontSize: 12,
  lineHeight: 1.35,
  fontWeight: 760,
}

const badge: CSSProperties = {
  minHeight: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#e2e8f0',
  fontSize: 11,
  fontWeight: 950,
  whiteSpace: 'nowrap',
}

const activeBadge: CSSProperties = {
  ...badge,
  border: '1px solid rgba(187,247,208,.22)',
  background: 'rgba(34,197,94,.14)',
  color: '#dcfce7',
}

const modeLayout: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const physicalGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const normalButton: CSSProperties = {
  minHeight: 74,
  display: 'grid',
  gridTemplateColumns: '34px 1fr',
  alignItems: 'center',
  justifyItems: 'start',
  gap: 10,
  padding: '10px 14px',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.34)',
  color: '#e2e8f0',
  textAlign: 'left',
  cursor: 'pointer',
}

const normalActiveButton: CSSProperties = {
  ...normalButton,
  border: '1px solid rgba(187,247,208,.30)',
  background: 'rgba(34,197,94,.17)',
  color: '#dcfce7',
}

const modeButton: CSSProperties = {
  minHeight: 88,
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 4,
  padding: '9px 10px',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.34)',
  color: '#e2e8f0',
  textAlign: 'center',
  cursor: 'pointer',
  overflow: 'hidden',
}

const activeButton: CSSProperties = {
  ...modeButton,
  border: '1px solid rgba(187,247,208,.26)',
  background: 'rgba(34,197,94,.15)',
  color: '#dcfce7',
}

const modeIcon: CSSProperties = {
  display: 'block',
  fontSize: 19,
  lineHeight: 1,
}

const modeLabel: CSSProperties = {
  display: 'block',
  fontSize: 13,
  lineHeight: 1.08,
  fontWeight: 950,
}

const modeHelp: CSSProperties = {
  display: 'block',
  maxWidth: 150,
  color: 'rgba(226,232,240,.82)',
  fontSize: 10,
  lineHeight: 1.18,
  fontWeight: 760,
}

const physicalEditor: CSSProperties = {
  display: 'grid',
  gap: 12,
  paddingTop: 4,
}

const sectionTitle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  color: '#e2e8f0',
  fontSize: 12,
  fontWeight: 950,
}

const field: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'rgba(241,245,249,.88)',
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const input: CSSProperties = {
  width: '100%',
  minHeight: 42,
  borderRadius: 15,
  border: '1px solid rgba(255,255,255,.13)',
  background: 'rgba(15,23,42,.44)',
  color: '#ffffff',
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 850,
  outline: 'none',
}

const textarea: CSSProperties = {
  ...input,
  minHeight: 74,
  padding: 12,
  resize: 'vertical',
  lineHeight: 1.35,
}

const infoGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
}

const infoPill: CSSProperties = {
  display: 'grid',
  gap: 3,
  padding: 10,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.28)',
}

const emptyBox: CSSProperties = {
  padding: 12,
  borderRadius: 17,
  border: '1px dashed rgba(226,232,240,.16)',
  color: 'rgba(226,232,240,.72)',
  fontSize: 12,
  lineHeight: 1.35,
}

const changeTypeBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: 10,
  borderRadius: 18,
  border: '1px solid rgba(125,211,252,.18)',
  background: 'rgba(14,165,233,.10)',
  color: '#dbeafe',
  fontSize: 12,
  fontWeight: 850,
}

const changeTypeButton: CSSProperties = {
  minHeight: 34,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(15,23,42,.56)',
  color: '#f8fafc',
  fontSize: 11,
  fontWeight: 950,
}

const fallbackPanel: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 18,
  border: '1px solid rgba(251,191,36,.20)',
  background: 'rgba(251,191,36,.08)',
}

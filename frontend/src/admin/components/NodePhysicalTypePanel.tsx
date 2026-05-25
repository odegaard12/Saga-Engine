import type { CSSProperties } from 'react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
import PhysicalQrCardsPanel, {
  type PhysicalQrKind,
  type SavedPhysicalQrCard,
} from './PhysicalQrCardsPanel'

type NodePhysicalMode = 'none' | PhysicalQrKind

type NodePhysicalTypePanelProps = {
  stage: AdminReactOverviewStage
  onApplyLocal: (stage: AdminReactOverviewStage) => void
}

const physicalModes: Array<{ id: PhysicalQrKind; label: string; help: string; icon: string }> = [
  { id: 'collectible', label: 'Coleccionable', help: 'Objeto opcional o misión secundaria', icon: '⭐' },
  { id: 'requirement', label: 'Requisito', help: 'Objeto necesario para otro nodo', icon: '🔒' },
  { id: 'clue', label: 'Pista', help: 'Tarjeta con pista física', icon: '🧩' },
  { id: 'bonus', label: 'Bonus', help: 'Extra o recompensa', icon: '🎁' },
]

function getPhysicalMode(stage: AdminReactOverviewStage): NodePhysicalMode {
  const raw = (stage as AdminReactOverviewStage & { physical_node_kind?: string }).physical_node_kind
  if (raw === 'collectible' || raw === 'requirement' || raw === 'clue' || raw === 'bonus') return raw
  return 'none'
}

function clearPhysicalFields(stage: AdminReactOverviewStage): AdminReactOverviewStage {
  const next = { ...(stage as Record<string, unknown>) }

  delete next.physical_node_kind
  delete next.physical_qr
  delete next.qr_payload
  delete next.physical_item_id
  delete next.physical_item_label
  delete next.physical_item_kind

  return next as unknown as AdminReactOverviewStage
}

function getStageText(stage: AdminReactOverviewStage, key: string): string {
  const value = (stage as unknown as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function formatCoord(value: unknown): string {
  return typeof value === 'number' ? value.toFixed(5) : 'Sin GPS'
}

export default function NodePhysicalTypePanel({ stage, onApplyLocal }: NodePhysicalTypePanelProps) {
  const mode = getPhysicalMode(stage)
  const isPhysical = mode !== 'none'

  function patchStage(patch: Record<string, unknown>) {
    onApplyLocal({
      ...(stage as unknown as Record<string, unknown>),
      ...patch,
    } as unknown as AdminReactOverviewStage)
  }

  function setMode(nextMode: NodePhysicalMode) {
    if (nextMode === 'none') {
      onApplyLocal(clearPhysicalFields(stage))
      return
    }

    patchStage({
      physical_node_kind: nextMode,
      physical_item_kind: nextMode,
    })
  }

  function saveQrCard(card: SavedPhysicalQrCard) {
    patchStage({
      physical_node_kind: card.kind,
      physical_qr: card,
      qr_payload: card.payload,
      physical_item_id: card.item_id,
      physical_item_label: card.label,
      physical_item_kind: card.kind,
    })
  }

  return (
    <section style={panel} aria-label="Tipo de nodo">
      <div style={head}>
        <div>
          <div style={eyebrow}>TIPO DE NODO</div>
          <strong style={title}>{isPhysical ? 'Nodo físico con QR' : 'Nodo normal jugable'}</strong>
          <p style={intro}>
            {isPhysical
              ? 'Este nodo no usa minijuego normal. Funciona como tarjeta física, coleccionable, pista, bonus o requisito.'
              : 'Este nodo usa el flujo normal: ubicación, juego, mensajes y reglas del editor.'}
          </p>
        </div>
        <span style={isPhysical ? activeBadge : badge}>{isPhysical ? 'QR FÍSICO' : 'NORMAL'}</span>
      </div>

      <div style={modeLayout}>
        <button
          type="button"
          style={mode === 'none' ? normalActiveButton : normalButton}
          onClick={() => setMode('none')}
        >
          <span style={modeIcon}>●</span>
          <strong style={modeLabel}>Normal</strong>
          <small style={modeHelp}>Nodo de ruta, GPS o minijuego</small>
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

      {isPhysical ? (
        <div style={physicalEditor}>
          <div style={sectionTitle}>
            <span>Datos del nodo físico</span>
            <small>No se muestran opciones de minijuego normal</small>
          </div>

          <label style={field}>
            Nombre visible del punto
            <input
              value={stage.title || ''}
              onChange={(event) => patchStage({ title: event.target.value })}
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
              <span>Ubicación</span>
              <b>Mover en mapa</b>
            </div>
          </div>

          <PhysicalQrCardsPanel
            initialLabel={
              ((stage as AdminReactOverviewStage & { physical_item_label?: string }).physical_item_label) ||
              stage.title ||
              'Buscar a tu enemigo'
            }
            initialKind={mode}
            compact
            onSaveToNode={saveQrCard}
          />
        </div>
      ) : (
        <div style={emptyBox}>
          Nodo normal. Usa el editor inferior para configurar ubicación, familia de juego, mensajes, reglas y opciones avanzadas.
        </div>
      )}
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 14,
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,.60), rgba(15,23,42,.38))',
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
  gridTemplateColumns: 'minmax(118px, .8fr) minmax(0, 2.2fr)',
  gap: 8,
}

const physicalGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(92px, 1fr))',
  gap: 8,
}

const normalButton: CSSProperties = {
  minHeight: 120,
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 6,
  padding: '12px 10px',
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.34)',
  color: '#e2e8f0',
  textAlign: 'center',
  cursor: 'pointer',
}

const normalActiveButton: CSSProperties = {
  ...normalButton,
  border: '1px solid rgba(187,247,208,.30)',
  background: 'rgba(34,197,94,.17)',
  color: '#dcfce7',
}

const modeButton: CSSProperties = {
  minHeight: 120,
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 6,
  padding: '12px 9px',
  borderRadius: 20,
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
  fontSize: 20,
  lineHeight: 1,
}

const modeLabel: CSSProperties = {
  display: 'block',
  fontSize: 14,
  lineHeight: 1.08,
  fontWeight: 950,
}

const modeHelp: CSSProperties = {
  display: 'block',
  maxWidth: 112,
  color: 'rgba(226,232,240,.82)',
  fontSize: 11,
  lineHeight: 1.22,
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

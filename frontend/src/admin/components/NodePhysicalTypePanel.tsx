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

const modes: Array<{ id: NodePhysicalMode; label: string; help: string; icon: string }> = [
  { id: 'none', label: 'Normal', help: 'Nodo sin tarjeta QR', icon: '●' },
  { id: 'collectible', label: 'Coleccionable', help: 'QR opcional o misión secundaria', icon: '⭐' },
  { id: 'requirement', label: 'Requisito', help: 'Objeto necesario para otro nodo', icon: '🔒' },
  { id: 'clue', label: 'Pista', help: 'QR con pista física', icon: '🧩' },
  { id: 'bonus', label: 'Bonus', help: 'Extra o recompensa', icon: '🎁' },
]

function getPhysicalMode(stage: AdminReactOverviewStage): NodePhysicalMode {
  const raw = (stage as AdminReactOverviewStage & { physical_node_kind?: string }).physical_node_kind
  if (raw === 'collectible' || raw === 'requirement' || raw === 'clue' || raw === 'bonus') {
    return raw
  }
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

export default function NodePhysicalTypePanel({ stage, onApplyLocal }: NodePhysicalTypePanelProps) {
  const mode = getPhysicalMode(stage)
  const isQrNode = mode !== 'none'

  function setMode(nextMode: NodePhysicalMode) {
    if (nextMode === 'none') {
      onApplyLocal(clearPhysicalFields(stage))
      return
    }

    onApplyLocal({
      ...(stage as Record<string, unknown>),
      physical_node_kind: nextMode,
      physical_item_kind: nextMode,
    } as unknown as AdminReactOverviewStage)
  }

  function saveQrCard(card: SavedPhysicalQrCard) {
    onApplyLocal({
      ...(stage as Record<string, unknown>),
      physical_node_kind: card.kind,
      physical_qr: card,
      qr_payload: card.payload,
      physical_item_id: card.item_id,
      physical_item_label: card.label,
      physical_item_kind: card.kind,
    } as unknown as AdminReactOverviewStage)
  }

  return (
    <section style={panel} aria-label="Tipo de nodo">
      <div style={head}>
        <div>
          <div style={eyebrow}>TIPO DE NODO</div>
          <strong style={title}>Normal, QR, requisito o coleccionable</strong>
        </div>
        <span style={badge}>{isQrNode ? 'QR ACTIVO' : 'NORMAL'}</span>
      </div>

      <div style={modeGrid}>
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            style={mode === item.id ? activeButton : modeButton}
            onClick={() => setMode(item.id)}
          >
            <span>{item.icon}</span>
            <strong>{item.label}</strong>
            <small>{item.help}</small>
          </button>
        ))}
      </div>

      {isQrNode ? (
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
      ) : (
        <div style={emptyBox}>
          Este nodo no genera QR. Es el modo recomendado para nodos normales de ruta, GPS o minijuegos.
        </div>
      )}
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 12,
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(15,23,42,.28)',
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
  fontSize: 14,
  lineHeight: 1.1,
}

const badge: CSSProperties = {
  minHeight: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#e2e8f0',
  fontSize: 10,
  fontWeight: 950,
  whiteSpace: 'nowrap',
}

const modeGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 7,
}

const modeButton: CSSProperties = {
  minHeight: 82,
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 3,
  padding: 8,
  borderRadius: 17,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.34)',
  color: '#e2e8f0',
  textAlign: 'center',
  cursor: 'pointer',
}

const activeButton: CSSProperties = {
  ...modeButton,
  border: '1px solid rgba(187,247,208,.26)',
  background: 'rgba(34,197,94,.15)',
  color: '#dcfce7',
}

const emptyBox: CSSProperties = {
  padding: 11,
  borderRadius: 16,
  border: '1px dashed rgba(226,232,240,.16)',
  color: 'rgba(226,232,240,.72)',
  fontSize: 12,
  lineHeight: 1.35,
}

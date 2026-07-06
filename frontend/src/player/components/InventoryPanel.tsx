import { useEffect, useState, type CSSProperties } from 'react'
import {
  countInventoryItems,
  loadInventorySnapshot,
  markInventoryItemUsed,
  type InventoryItem,
  type InventorySnapshot,
} from '../offline/inventory'
import { queuePhysicalEvent } from '../offline/physicalEvents'
import ItemIconSvg from './ItemIconSvg'

interface InventoryPanelProps {
  user: string
}

// ─── Icon resolver ────────────────────────────────────────────────────────────
const ICON_MAP: [RegExp, string, string][] = [
  [/llave|key/i, '🔑', '#f59e0b'],
  [/emp|electr|bateria|pila|cable/i, '⚡', '#3b82f6'],
  [/placa|chip|circuito|board/i, '🖥️', '#6366f1'],
  [/cinta|tape|adhesiv/i, '🪝', '#84cc16'],
  [/arma|pistol|rifle/i, '🔫', '#ef4444'],
  [/escudo|shield/i, '🛡️', '#06b6d4'],
  [/map|mapa/i, '🗺️', '#10b981'],
  [/radio|señal|signal/i, '📡', '#a855f7'],
  [/herramienta|tool|alicate|pinza/i, '🔧', '#f97316'],
  [/linterna|luz|flashlight/i, '🔦', '#fbbf24'],
  [/comida|agua|food|water/i, '🍶', '#34d399'],
  [/nota|papel|doc|informe/i, '📄', '#e2e8f0'],
  [/medic|pastilla|jeringa/i, '💊', '#fb7185'],
  [/bomb|explosiv/i, '💣', '#ef4444'],
  [/cerrojo|candado|lock/i, '🔒', '#94a3b8'],
  [/flecha|arrow/i, '➡️', '#38bdf8'],
  [/cristal|glass/i, '💎', '#22d3ee'],
  [/moneda|coin|dinero/i, '🪙', '#facc15'],
  [/hueso|bone/i, '🦴', '#e2e8f0'],
]

function getItemIcon(itemOrLabel: string | InventoryItem): { glyph: string; color: string } {
  if (typeof itemOrLabel !== 'string') {
    const customIcon = itemOrLabel.metadata?.physical_icon || itemOrLabel.metadata?.icon
    if (customIcon) {
      return { glyph: String(customIcon), color: '#38bdf8' }
    }
    return getItemIcon(itemOrLabel.label || itemOrLabel.item_id)
  }
  for (const [pattern, glyph, color] of ICON_MAP) {
    if (pattern.test(itemOrLabel)) return { glyph, color }
  }
  return { glyph: '◈', color: '#60a5fa' }
}

function getSourceBadge(source?: string): string {
  if (source === 'qr') return 'QR'
  if (source === 'nfc') return 'NFC'
  if (source === 'manual') return 'MAN'
  return 'SYS'
}

function getUpdatedLabel(value?: string): string {
  if (!value) return 'sin sincronizar'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return 'actualizado'
  const age = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (age < 10) return 'ahora'
  if (age < 60) return `${age}s`
  const m = Math.round(age / 60)
  if (m < 60) return `${m}m`
  return `${Math.round(m / 60)}h`
}

// ─── Component ────────────────────────────────────────────────────────────────
export function InventoryPanel({ user }: InventoryPanelProps) {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(() => loadInventorySnapshot(user))
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    function refresh() {
      setSnapshot(loadInventorySnapshot(user))
    }
    refresh()
    const id = window.setInterval(refresh, 2_000)
    window.addEventListener('storage', refresh)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('storage', refresh)
    }
  }, [user])

  function handleUseItem(item: InventoryItem) {
    const next = markInventoryItemUsed(user, item.item_id, 1)
    setSnapshot(next)
    setFeedbackId(item.item_id)
    setTimeout(() => setFeedbackId(null), 1500)

    queuePhysicalEvent({
      user,
      source: item.source === 'nfc' ? 'nfc' : item.source === 'qr' ? 'qr' : 'manual',
      node_id: item.node_id,
      physical_id: item.physical_id || item.item_id,
      payload: {
        inventory_item_id: item.item_id,
        inventory_label: item.label,
        inventory_action: 'used',
        inventory_quantity_after_use:
          next.items.find((n) => n.item_id === item.item_id)?.quantity || 0,
      },
    })
  }

  const totalItems = countInventoryItems(user)
  const visibleItems = snapshot.items.slice(0, 12)

  // How many empty cells to fill grid
  const gridSize = Math.max(8, Math.ceil(visibleItems.length / 4) * 4)
  const emptyCells = gridSize - visibleItems.length

  return (
    <section style={panel}>
      {/* Header */}
      <div style={headerRow}>
        <div style={headerLeft}>
          <span style={headerLabel}>MOCHILA</span>
          <span style={headerCount}>{totalItems} obj.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={syncBadge}>⏱ {getUpdatedLabel(snapshot.updated_at)}</span>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            style={guideToggleBtn}
            title="Cómo funciona"
          >
            {showGuide ? '✕' : '❓'}
          </button>
        </div>
      </div>

      {/* How to play guide */}
      {showGuide && (
        <div style={guideBox}>
          <div style={guideTitle}>📖 Cómo funciona</div>
          <div style={guideStep}>
            <span style={guideNum}>1</span>
            <span>
              🌟 <strong>Recoge objetos</strong> — Al acercarte a un coleccionable en el mapa, se
              abre un panel automáticamente. Pulsa <strong>OK / Recoger</strong> para guardarlo aquí
              en la mochila.
            </span>
          </div>
          <div style={guideStep}>
            <span style={guideNum}>2</span>
            <span>
              ⚒️ <strong>Combínalos en la Mesa</strong> — Algunos objetos son ingredientes para
              fabricar algo más potente. Ve a la pestaña <strong>Mesa</strong> y, si tienes todos
              los ingredientes, pulsa <strong>Ensamblar</strong>.
            </span>
          </div>
          <div style={guideStep}>
            <span style={guideNum}>3</span>
            <span>
              🔑 <strong>Desbloquea nodos</strong> — Ciertos puntos del mapa sólo se abren si llevas
              el objeto correcto en la mochila. Cuando llegues a ese punto con el objeto necesario,
              el nodo se desbloqueará automáticamente.
            </span>
          </div>
          <div style={guideTip}>
            💡 El objeto permanece en tu mochila hasta que se usa o el admin lo configura para
            consumirse al superar el nodo.
          </div>
          {selected!.state !== 'used' && selected!.quantity > 0 ? (
            <button
              type="button"
              style={useBtn}
              onClick={() => {
                handleUseItem(selected!)
                setSelected(null)
              }}
            >
              Usar objeto
            </button>
          ) : (
            <div style={usedText}>Este objeto ya fue usado</div>
          )}
        </div>
      )}

      {/* Grid */}
      <div style={grid}>
        {visibleItems.map((item) => {
          const usable = item.state !== 'used' && item.quantity > 0
          const isSelected = selected?.item_id === item.item_id
          const isFeedback = feedbackId === item.item_id
          const color = 'rgba(255, 255, 255, 0.1)'

          return (
            <button
              key={item.item_id}
              type="button"
              style={{
                ...cell,
                ...(isSelected ? cellSelected : {}),
                ...(isFeedback ? cellFeedback : {}),
                ...(!usable ? cellUsed : {}),
                borderColor: isSelected ? color : undefined,
                boxShadow: isSelected ? `0 0 0 1px ${color}44, 0 4px 20px ${color}22` : undefined,
              }}
              onClick={() => setSelected(isSelected ? null : item)}
            >
              <span
                style={{
                  ...cellIcon,
                  background: usable ? `rgba(255,255,255,0.08)` : 'rgba(255,255,255,0.04)',
                }}
              >
                <ItemIconSvg itemId={item.item_id} size={28} />
              </span>
              {item.quantity > 1 && <span style={qtyBadge}>{item.quantity}</span>}
              {!usable && <span style={usedOverlay}>✓</span>}
              <span style={cellName}>{item.label.slice(0, 12)}</span>
            </button>
          )
        })}
        {Array.from({ length: emptyCells }).map((_, i) => (
          <div key={`e-${i}`} style={emptyCell} />
        ))}
      </div>

      {/* Selected detail */}
      {selected && (
        <div style={detailCard} key={selected!.item_id}>
          <div style={detailHeader}>
            <span><ItemIconSvg itemId={selected!.item_id} size={40} /></span>
            <div>
              <div style={detailTitle}>{selected!.label}</div>
              <div style={detailMeta}>
                <span style={sourcePill}>{getSourceBadge(selected!.source)}</span>
                {selected!.node_id && <span style={nodePill}>Nodo {selected!.node_id}</span>}
                <span style={qtyText}>×{selected!.quantity}</span>
              </div>
            </div>
          </div>
          {selected!.state !== 'used' && selected!.quantity > 0 ? (
            <button
              type="button"
              style={useBtn}
              onClick={() => {
                handleUseItem(selected!)
                setSelected(null)
              }}
            >
              Usar objeto
            </button>
          ) : (
            <div style={usedText}>Este objeto ya fue usado</div>
          )}
        </div>
      )}

      {snapshot.items.length === 0 && (
        <div style={emptyMsg}>
          <span style={{ fontSize: 36 }}>🎒</span>
          <div style={{ fontWeight: 900, color: 'rgba(255,255,255,0.7)' }}>Mochila vacía</div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.55,
              marginTop: 2,
              lineHeight: 1.5,
              maxWidth: 220,
              textAlign: 'center',
            }}
          >
            Acércate a un coleccionable en el mapa para recoger objetos. También puedes escanear
            tarjetas QR físicas.
          </div>
          <button type="button" style={guideToggleBtn} onClick={() => setShowGuide(true)}>
            ❓ Ver cómo funciona
          </button>
        </div>
      )}
    </section>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '10px 4px',
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 2px',
}

const headerLeft: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
}

const headerLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#bfdbfe',
}

const headerCount: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.4)',
}

const syncBadge: CSSProperties = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.3)',
  fontWeight: 600,
}

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 8,
}

const guideToggleBtn: CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 999,
  color: 'rgba(255,255,255,0.6)',
  fontSize: 11,
  fontWeight: 800,
  padding: '2px 10px',
  cursor: 'pointer',
  lineHeight: 1.8,
}

const guideBox: CSSProperties = {
  background: 'rgba(14, 165, 233, 0.07)',
  border: '1px solid rgba(125,211,252,0.18)',
  borderRadius: 14,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const guideTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: '#7dd3fc',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const guideStep: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  fontSize: 12,
  color: 'rgba(226,232,240,0.82)',
  lineHeight: 1.45,
}

const guideNum: CSSProperties = {
  background: 'rgba(125,211,252,0.18)',
  color: '#7dd3fc',
  borderRadius: 999,
  width: 20,
  height: 20,
  minWidth: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 900,
  marginTop: 1,
}

const guideTip: CSSProperties = {
  fontSize: 11,
  color: 'rgba(226,232,240,0.5)',
  fontStyle: 'italic',
  lineHeight: 1.4,
  paddingTop: 4,
  borderTop: '1px solid rgba(255,255,255,0.06)',
}

const cell: CSSProperties = {
  position: 'relative',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  padding: '10px 4px 8px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  WebkitTapHighlightColor: 'transparent',
  userSelect: 'none',
  minHeight: 72,
}

const cellSelected: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  transform: 'scale(0.96)',
}

const cellFeedback: CSSProperties = {
  background: 'rgba(34,197,94,0.15)',
  borderColor: 'rgba(34,197,94,0.4)',
}

const cellUsed: CSSProperties = {
  opacity: 0.4,
}

const cellIcon: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  transition: 'background 0.2s',
}

const qtyBadge: CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  background: 'rgba(251,191,36,0.9)',
  color: '#1c1008',
  fontSize: 9,
  fontWeight: 900,
  borderRadius: 999,
  minWidth: 16,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  lineHeight: 1,
}

const usedOverlay: CSSProperties = {
  position: 'absolute',
  top: 5,
  left: 6,
  fontSize: 9,
  color: '#4ade80',
  fontWeight: 900,
}

const cellName: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: 'rgba(226,232,240,0.7)',
  textAlign: 'center',
  letterSpacing: '0.04em',
  lineHeight: 1.2,
  wordBreak: 'break-word',
  maxWidth: '100%',
  overflow: 'hidden',
}

const emptyCell: CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px dashed rgba(255,255,255,0.05)',
  borderRadius: 14,
  minHeight: 72,
}

const detailCard: CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 16,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  animation: 'fadeInUp 0.2s ease',
}

const detailHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const detailTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: '#ffffff',
}

const detailMeta: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 4,
  flexWrap: 'wrap',
}

const sourcePill: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.12em',
  color: '#93c5fd',
  background: 'rgba(59,130,246,0.15)',
  border: '1px solid rgba(59,130,246,0.25)',
  borderRadius: 999,
  padding: '1px 7px',
}

const nodePill: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.08em',
  color: '#a5f3fc',
  background: 'rgba(6,182,212,0.12)',
  border: '1px solid rgba(6,182,212,0.2)',
  borderRadius: 999,
  padding: '1px 7px',
}

const qtyText: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#fde68a',
}

const useBtn: CSSProperties = {
  width: '100%',
  padding: '10px 0',
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  color: '#fff',
  fontWeight: 900,
  fontSize: 13,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(34,197,94,0.35)',
  transition: 'transform 0.15s, box-shadow 0.15s',
}

const usedText: CSSProperties = {
  textAlign: 'center',
  fontSize: 11,
  color: 'rgba(255,255,255,0.35)',
  fontWeight: 700,
  padding: '6px 0',
}

const emptyMsg: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '28px 0',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 13,
  fontWeight: 700,
  textAlign: 'center',
}

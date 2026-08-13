import { useEffect, useState, type CSSProperties } from 'react'
import {
  countInventoryItems,
  loadInventorySnapshot,
  markInventoryItemUsed,
  type InventoryItem,
  type InventorySnapshot,
} from '../offline/inventory'
import { queuePhysicalEvent } from '../offline/physicalEvents'
import { leerMarcaDeTiempo } from '../../shared/fechas'

interface InventoryPanelProps {
  user: string
}

// ─── Icon resolver ────────────────────────────────────────────────────────────
const ICON_MAP: [RegExp, string, string][] = [
  [/llave|key/i, '🔑', '#f59e0b'],
  [/emp|electr|bateria|pila|cable/i, '⚡', '#3b82f6'],
  [/placa|chip|circuito|board/i, '🖥️', '#6366f1'],
  [/cinta|tape|adhesiv/i, '🩹', '#84cc16'],
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
  [/cristal|glass|gema|gem/i, '💎', '#22d3ee'],
  [/moneda|coin|dinero/i, '🪙', '#facc15'],
  [/hueso|bone/i, '🦴', '#e2e8f0'],
  [/foto|camara|camera/i, '📷', '#f0abfc'],
  [/libro|book|manual/i, '📚', '#a78bfa'],
  [/coleccionable|collectible/i, '⭐', '#fbbf24'],
  [/objeto|item|mapa|pieza/i, '📦', '#60a5fa'],
]

function getItemIcon(item: InventoryItem): { glyph: string; color: string } {
  // 1. Custom icon from metadata (highest priority - explicitly set by admin/node)
  const customIcon = item.metadata?.physical_icon || item.metadata?.icon
  if (customIcon && typeof customIcon === 'string' && customIcon.trim()) {
    return { glyph: customIcon.trim(), color: '#fbbf24' }
  }
  // 2. El nombre manda, venga de donde venga.
  //
  //    Antes lo recogido por proximidad devolvía ⭐ SIN mirar el nombre, así
  //    que la cinta aislante salía como estrella aunque la tabla de abajo
  //    tuviera su icono. El origen sólo decide el respaldo, no el icono.
  const text = `${item.label || ''} ${item.item_id || ''}`.toLowerCase()
  for (const [pattern, glyph, color] of ICON_MAP) {
    if (pattern.test(text)) return { glyph, color }
  }

  const idText = (item.item_id || '').toLowerCase()
  if (/llave|key/.test(idText)) return { glyph: '🔑', color: '#f59e0b' }
  if (/emp|bateria|pila|cable|electr/.test(idText)) return { glyph: '⚡', color: '#3b82f6' }
  if (/placa|chip|circuito|board/.test(idText)) return { glyph: '🖥️', color: '#6366f1' }

  // 3. Respaldo por origen: estrella para coleccionables de campo, caja el resto.
  if (item.source === 'manual' || (!item.source && item.node_id)) {
    return { glyph: '⭐', color: '#fbbf24' }
  }
  return { glyph: '📦', color: '#60a5fa' }
}

/** ¿Es una tarjeta QR escaneada? Se dibujan distinto y van las primeras. */
function isQrCard(item: InventoryItem): boolean {
  return item.source === 'qr' || Boolean(item.metadata?.qr_entry)
}

function getSourceBadge(source?: string): string {
  if (source === 'qr') return 'QR'
  if (source === 'nfc') return 'NFC'
  if (source === 'manual') return 'Campo'
  return 'Sistema'
}

function getUpdatedLabel(value?: string): string {
  if (!value) return ''
  const ts = leerMarcaDeTiempo(value)
  if (ts === null) return ''
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
  // Las tarjetas QR primero: son la prueba de haber estado en el sitio y es lo
  // que el jugador va a buscar nada más abrir la mochila.
  const orderedItems = [...snapshot.items].sort((a, b) => {
    const qa = isQrCard(a) ? 0 : 1
    const qb = isQrCard(b) ? 0 : 1
    return qa - qb
  })
  const visibleItems = orderedItems.slice(0, 12)
  const gridSize = Math.max(8, Math.ceil(visibleItems.length / 4) * 4)
  const emptyCells = gridSize - visibleItems.length
  const updatedLabel = getUpdatedLabel(snapshot.updated_at)

  return (
    <section style={panel}>
      {/* Header */}
      <div style={headerRow}>
        <div style={headerLeft}>
          <span style={headerLabel}>MOCHILA</span>
          <span style={headerCount}>{totalItems} {totalItems === 1 ? 'objeto' : 'objetos'}</span>
          {updatedLabel && <span style={syncBadge}>· {updatedLabel}</span>}
        </div>
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          style={guideToggleBtn}
          title="Cómo funciona la mochila"
        >
          {showGuide ? '✕' : '❓'}
        </button>
      </div>

      {/* How to play guide */}
      {showGuide && (
        <div style={guideBox}>
          <div style={guideTitle}>📖 Cómo funciona la mochila</div>
          <div style={guideStep}>
            <span style={guideNum}>1</span>
            <span>
              🌟 <strong>Recoge objetos</strong> — Al acercarte a un nodo coleccionable en el mapa, aparece un panel automáticamente. Pulsa <strong>Recoger</strong> para guardarlo aquí.
            </span>
          </div>
          <div style={guideStep}>
            <span style={guideNum}>2</span>
            <span>
              🔑 <strong>Desbloquea nodos</strong> — Ciertos puntos del mapa sólo se abren si llevas el objeto correcto. Cuando llegues con el objeto necesario, el nodo se activa.
            </span>
          </div>
          <div style={guideStep}>
            <span style={guideNum}>3</span>
            <span>
              ⚒️ <strong>Combínalos en la Mesa</strong> — Algunos objetos son ingredientes para fabricar algo más potente. Ve a la pestaña <strong>Mesa</strong> para ensamblarlos.
            </span>
          </div>
          <div style={guideTip}>
            💡 El objeto permanece en la mochila hasta que se usa o el creador de la misión lo configura para consumirse.
          </div>
        </div>
      )}

      {/* Grid */}
      {snapshot.items.length > 0 ? (
        <div style={grid}>
          {visibleItems.map((item) => {
            const usable = item.state !== 'used' && item.quantity > 0
            const isSelected = selected?.item_id === item.item_id
            const isFeedback = feedbackId === item.item_id
            const qrCard = isQrCard(item)
            const { glyph, color } = qrCard
              ? { glyph: '', color: '#22d3ee' }
              : getItemIcon(item)

            return (
              <button
                key={item.item_id}
                type="button"
                style={{
                  ...cell,
                  ...(isSelected ? cellSelected : {}),
                  ...(isFeedback ? cellFeedback : {}),
                  ...(!usable ? cellUsed : {}),
                  borderColor: isSelected ? color + '55' : undefined,
                  boxShadow: isSelected ? `0 0 0 1px ${color}44, 0 4px 20px ${color}22` : undefined,
                }}
                onClick={() => setSelected(isSelected ? null : item)}
              >
                <span
                  style={{
                    ...cellIcon,
                    background: usable
                      ? `${color}22`
                      : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${color}33`,
                  }}
                >
                  {qrCard ? (
                    // Miniatura de código QR dibujada con CSS: una tarjeta
                    // escaneada se reconoce de un vistazo y no se confunde con
                    // los objetos de la mochila.
                    <span style={qrGlyph} aria-label="Tarjeta QR">
                      <i style={{ ...qrEye, top: 3, left: 3 }} />
                      <i style={{ ...qrEye, top: 3, right: 3 }} />
                      <i style={{ ...qrEye, bottom: 3, left: 3 }} />
                      <i style={qrNoise} />
                    </span>
                  ) : (
                    <span style={{ fontSize: 22, lineHeight: 1 }}>{glyph}</span>
                  )}
                </span>
                {item.quantity > 1 && <span style={qtyBadge}>{item.quantity}</span>}
                {!usable && <span style={usedOverlay}>✓</span>}
                <span style={cellName}>{item.label}</span>
              </button>
            )
          })}
          {Array.from({ length: emptyCells }).map((_, i) => (
            <div key={`e-${i}`} style={emptyCell} />
          ))}
        </div>
      ) : (
        <div style={emptyMsg}>
          <span style={{ fontSize: 40 }}>🎒</span>
          <div style={{ fontWeight: 900, color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Mochila vacía</div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.55,
              marginTop: 4,
              lineHeight: 1.5,
              maxWidth: 220,
              textAlign: 'center',
            }}
          >
            Acércate a un nodo coleccionable en el mapa para recoger objetos o escanea un código QR físico.
          </div>
          <button type="button" style={{ ...guideToggleBtn, marginTop: 8 }} onClick={() => setShowGuide(true)}>
            ❓ Ver cómo funciona
          </button>
        </div>
      )}

      {/* Selected detail */}
      {selected && (
        <div style={detailCard} key={selected.item_id}>
          <div style={detailHeader}>
            <div style={{
              ...cellIcon,
              width: 52,
              height: 52,
              borderRadius: 14,
              background: `${getItemIcon(selected).color}22`,
              border: `1px solid ${getItemIcon(selected).color}44`,
              fontSize: 28,
            }}>
              <span style={{ lineHeight: 1 }}>{getItemIcon(selected).glyph}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={detailTitle}>{selected.label}</div>
              <div style={detailMeta}>
                <span style={sourcePill}>{getSourceBadge(selected.source)}</span>
                {selected.node_id && <span style={nodePill}>Nodo {selected.node_id}</span>}
                <span style={qtyText}>×{selected.quantity}</span>
              </div>
            </div>
          </div>
          {selected.state !== 'used' && selected.quantity > 0 ? (
            <button
              type="button"
              style={useBtn}
              onClick={() => {
                handleUseItem(selected)
                setSelected(null)
              }}
            >
              ✅ Usar objeto
            </button>
          ) : (
            <div style={usedText}>Este objeto ya fue usado ✓</div>
          )}
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
  gap: 6,
  flexWrap: 'wrap',
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
  color: 'rgba(255,255,255,0.5)',
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
  padding: '3px 10px',
  cursor: 'pointer',
  lineHeight: 1.8,
  transition: 'background 0.2s',
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

const qrGlyph: CSSProperties = {
  position: 'relative',
  display: 'block',
  width: 28,
  height: 28,
  borderRadius: 5,
  background: '#f8fafc',
}

const qrEye: CSSProperties = {
  position: 'absolute',
  width: 9,
  height: 9,
  border: '2.5px solid #0f172a',
  borderRadius: 2,
}

const qrNoise: CSSProperties = {
  position: 'absolute',
  right: 3,
  bottom: 3,
  width: 11,
  height: 11,
  // Damero de 3x3: sugiere los módulos de datos sin dibujarlos uno a uno.
  backgroundImage:
    'linear-gradient(90deg, #0f172a 33%, transparent 33% 66%, #0f172a 66%),' +
    'linear-gradient(0deg, #0f172a 33%, transparent 33% 66%, #0f172a 66%)',
  backgroundSize: '100% 100%',
  opacity: 0.85,
}

const cellIcon: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 22,
  transition: 'background 0.2s',
}

const qtyBadge: CSSProperties = {
  position: 'absolute',
  top: 5,
  right: 5,
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
  width: '100%',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  padding: '0 2px',
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
  letterSpacing: '0.1em',
  color: '#93c5fd',
  background: 'rgba(59,130,246,0.15)',
  border: '1px solid rgba(59,130,246,0.25)',
  borderRadius: 999,
  padding: '2px 7px',
}

const nodePill: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.08em',
  color: '#a5f3fc',
  background: 'rgba(6,182,212,0.12)',
  border: '1px solid rgba(6,182,212,0.2)',
  borderRadius: 999,
  padding: '2px 7px',
}

const qtyText: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#fde68a',
}

const useBtn: CSSProperties = {
  width: '100%',
  padding: '11px 0',
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
  fontSize: 12,
  color: 'rgba(255,255,255,0.35)',
  fontWeight: 700,
  padding: '8px 0',
}

const emptyMsg: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '28px 8px',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 13,
  fontWeight: 700,
  textAlign: 'center',
}

import { useEffect, useState, type CSSProperties } from 'react'
import {
  countInventoryItems,
  loadInventorySnapshot,
  markInventoryItemUsed,
  type InventoryItem,
  type InventorySnapshot,
} from '../offline/inventory'
import { queuePhysicalEvent } from '../offline/physicalEvents'

interface InventoryPanelProps {
  user: string
}

function itemSubtitle(item: InventoryItem): string {
  const parts = [
    item.source ? String(item.source).toUpperCase() : '',
    item.node_id ? `Nodo ${item.node_id}` : '',
    item.physical_id ? `ID ${item.physical_id}` : '',
  ].filter(Boolean)

  return parts.length ? parts.join(' · ') : 'Objeto local'
}

function getUpdatedLabel(value?: string): string {
  if (!value) return 'sin sincronizar'

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'actualizado'

  const ageSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (ageSeconds < 10) return 'actualizado ahora'
  if (ageSeconds < 60) return `actualizado hace ${ageSeconds}s`

  const ageMinutes = Math.round(ageSeconds / 60)
  if (ageMinutes < 60) return `actualizado hace ${ageMinutes}m`

  const ageHours = Math.round(ageMinutes / 60)
  return `actualizado hace ${ageHours}h`
}

export function InventoryPanel({ user }: InventoryPanelProps) {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(() => loadInventorySnapshot(user))

  useEffect(() => {
    if (typeof document === 'undefined') return

    if (!document.getElementById('saga-inventory-style')) {
      const style = document.createElement('style')
      style.id = 'saga-inventory-style'
      style.textContent = `
        .saga-inventory-slot {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 12px 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .saga-inventory-slot:last-child {
          border-bottom: none;
        }
        .saga-inventory-slot--usable {
        }
        .saga-inventory-slot--usable:hover {
          opacity: 0.8;
        }
        .saga-inventory-slot--used {
          opacity: 0.5;
        }
        .saga-inventory-slot--empty {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.3);
          transition: all 0.2s ease;
        }
        .saga-inventory-slot--empty:last-child {
          border-bottom: none;
        }
        .saga-inventory-icon {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.06);
          font-size: 14px;
          line-height: 1;
        }
        .saga-inventory-slot--usable .saga-inventory-icon {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.2);
        }
        .saga-inventory-slot--used .saga-inventory-icon {
          background: rgba(148, 163, 184, 0.1);
          color: rgba(226, 232, 240, 0.4);
        }
        .saga-inventory-use-btn {
          min-height: 28px;
          padding: 0 12px;
          border-radius: 12px;
          border: none;
          background: #22c55e;
          color: #052e16;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .saga-inventory-use-btn:hover {
          background: #4ade80;
          transform: scale(1.02);
        }
        .saga-inventory-use-btn:active {
          transform: scale(0.98);
        }
        .saga-inventory-use-btn:disabled {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.04);
          cursor: not-allowed;
          pointer-events: none;
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  function useItem(item: InventoryItem) {
    const next = markInventoryItemUsed(user, item.item_id, 1)
    setSnapshot(next)

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
          next.items.find((nextItem) => nextItem.item_id === item.item_id)?.quantity || 0,
      },
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    function refresh() {
      setSnapshot(loadInventorySnapshot(user))
    }

    refresh()
    const intervalId = window.setInterval(refresh, 2_000)

    window.addEventListener('storage', refresh)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('storage', refresh)
    }
  }, [user])

  const totalItems = countInventoryItems(user)
  const visibleItems = snapshot.items.slice(0, 4)

  return (
    <section style={panel}>
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>Objetos</div>
          <div style={title}>
            {totalItems} objeto{totalItems === 1 ? '' : 's'}
          </div>
        </div>
        <div style={statusPill}>{snapshot.items.length ? 'MOCHILA' : 'VACÍO'}</div>
      </div>

      {visibleItems.length ? (
        <div style={slotGrid}>
          {visibleItems.map((item) => {
            const usable = item.state !== 'used' && item.quantity > 0

            return (
              <div key={item.item_id} className={`saga-inventory-slot ${usable ? 'saga-inventory-slot--usable' : 'saga-inventory-slot--used'}`}>
                <div className="saga-inventory-icon">{usable ? '◆' : '✓'}</div>
                <div style={slotBody}>
                  <div style={itemLabel}>
                    {item.label}
                    {item.quantity > 1 ? <span style={quantity}>×{item.quantity}</span> : null}
                  </div>
                  <div style={itemMeta}>{itemSubtitle(item)}</div>
                </div>
                <button
                  type="button"
                  className="saga-inventory-use-btn"
                  disabled={!usable}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (usable) useItem(item)
                  }}
                >
                  {usable ? 'Usar' : 'Usado'}
                </button>
              </div>
            )
          })}

          {Array.from({ length: Math.max(0, 4 - visibleItems.length) }).map((_, index) => (
            <div key={`empty-${index}`} className="saga-inventory-slot--empty">
              <div style={emptySlotIcon}>＋</div>
              <div style={emptySlotText}>Hueco libre</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="saga-inventory-slot--empty">
              <div style={emptySlotIcon}>＋</div>
              <div style={emptySlotText}>Hueco libre</div>
            </div>
          ))}
          <div style={emptyText}>Aún no hay objetos. Usa QR, NFC o recogida manual para llenar la mochila.</div>
        </div>
      )}

      <div style={footerText}>{getUpdatedLabel(snapshot.updated_at)} · estado local del juego</div>
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 8,
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const eyebrow: CSSProperties = {
  color: '#bfdbfe',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 900,
}

const statusPill: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: '1px solid rgba(96,165,250,.22)',
  background: 'rgba(59,130,246,.14)',
  color: '#dbeafe',
  padding: '0 10px',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const slotGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 0,
}

const slotBody: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  alignContent: 'center',
  gap: 3,
}

const itemLabel: CSSProperties = {
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const quantity: CSSProperties = {
  marginLeft: 6,
  color: '#bbf7d0',
  fontSize: 12,
  fontWeight: 900,
}

const itemMeta: CSSProperties = {
  color: 'rgba(226,232,240,.62)',
  fontSize: 11,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const emptyGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 0,
}

const emptySlotIcon: CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  opacity: 0.72,
}

const emptySlotText: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const emptyText: CSSProperties = {
  gridColumn: '1 / -1',
  color: 'rgba(226,232,240,.74)',
  fontSize: 12,
  lineHeight: 1.45,
}

const footerText: CSSProperties = {
  color: 'rgba(226,232,240,.56)',
  fontSize: 10,
  fontWeight: 800,
}

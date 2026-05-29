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
              <div key={item.item_id} style={usable ? slotCard : slotCardUsed}>
                <div style={slotIcon}>{usable ? '◆' : '✓'}</div>
                <div style={slotBody}>
                  <div style={itemLabel}>
                    {item.label}
                    {item.quantity > 1 ? <span style={quantity}>×{item.quantity}</span> : null}
                  </div>
                  <div style={itemMeta}>{itemSubtitle(item)}</div>
                </div>
                <button
                  type="button"
                  style={usable ? useButton : useButtonDisabled}
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
            <div key={`empty-${index}`} style={emptySlot}>
              <div style={emptySlotIcon}>＋</div>
              <div style={emptySlotText}>Hueco libre</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} style={emptySlot}>
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
  gap: 10,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.06)',
  padding: 12,
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
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const slotGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const slotCard: CSSProperties = {
  minHeight: 112,
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  gap: 7,
  borderRadius: 16,
  border: '1px solid rgba(187,247,208,.18)',
  background: 'linear-gradient(180deg, rgba(34,197,94,.12), rgba(15,23,42,.24))',
  padding: 10,
}

const slotCardUsed: CSSProperties = {
  ...slotCard,
  opacity: 0.62,
  border: '1px solid rgba(148,163,184,.16)',
  background: 'rgba(15,23,42,.22)',
}

const slotIcon: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 12,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,.10)',
  color: '#bbf7d0',
  fontSize: 14,
  fontWeight: 900,
}

const slotBody: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: 3,
}

const itemLabel: CSSProperties = {
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const quantity: CSSProperties = {
  marginLeft: 6,
  color: '#bbf7d0',
  fontSize: 11,
  fontWeight: 900,
}

const itemMeta: CSSProperties = {
  color: 'rgba(226,232,240,.62)',
  fontSize: 10,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const useButton: CSSProperties = {
  minHeight: 30,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(34,197,94,.22)',
  background: 'rgba(34,197,94,.16)',
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const useButtonDisabled: CSSProperties = {
  ...useButton,
  border: '1px solid rgba(148,163,184,.14)',
  background: 'rgba(148,163,184,.10)',
  color: 'rgba(226,232,240,.54)',
}

const emptyGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const emptySlot: CSSProperties = {
  minHeight: 92,
  display: 'grid',
  placeItems: 'center',
  gap: 4,
  borderRadius: 16,
  border: '1px dashed rgba(226,232,240,.18)',
  background: 'rgba(15,23,42,.16)',
  color: 'rgba(226,232,240,.52)',
  textAlign: 'center',
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

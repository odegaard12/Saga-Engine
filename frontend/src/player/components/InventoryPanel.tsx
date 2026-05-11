import { useEffect, useState, type CSSProperties } from 'react'
import {
  countInventoryItems,
  loadInventorySnapshot,
  markInventoryItemUsed,
  type InventoryItem,
  type InventorySnapshot,
} from '../offline/inventory'

interface InventoryPanelProps {
  user: string
}

function itemSubtitle(item: InventoryItem): string {
  const parts = [
    item.source ? String(item.source).toUpperCase() : '',
    item.node_id ? `NODE ${item.node_id}` : '',
    item.physical_id ? `ID ${item.physical_id}` : '',
  ].filter(Boolean)

  return parts.length ? parts.join(' · ') : 'Local item'
}

function getUpdatedLabel(value?: string): string {
  if (!value) return 'not synced'

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'updated'

  const ageSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (ageSeconds < 10) return 'updated now'
  if (ageSeconds < 60) return `updated ${ageSeconds}s ago`

  const ageMinutes = Math.round(ageSeconds / 60)
  if (ageMinutes < 60) return `updated ${ageMinutes}m ago`

  const ageHours = Math.round(ageMinutes / 60)
  return `updated ${ageHours}h ago`
}

export function InventoryPanel({ user }: InventoryPanelProps) {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(() => loadInventorySnapshot(user))

  function useItem(item: InventoryItem) {
    const next = markInventoryItemUsed(user, item.item_id, 1)
    setSnapshot(next)
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
          <div style={eyebrow}>Inventory</div>
          <div style={title}>{totalItems} item{totalItems === 1 ? '' : 's'}</div>
        </div>
        <div style={statusPill}>{snapshot.items.length ? 'LOCAL' : 'EMPTY'}</div>
      </div>

      {visibleItems.length ? (
        <div style={itemList}>
          {visibleItems.map((item) => (
            <div key={item.item_id} style={itemRow}>
              <div style={itemMain}>
                <div style={itemLabel}>
                  {item.label}
                  {item.quantity > 1 ? <span style={quantity}>×{item.quantity}</span> : null}
                </div>
                <div style={itemMeta}>{itemSubtitle(item)}</div>
              </div>
              <div style={itemActions}>
                <div style={itemState}>{item.state}</div>
                {item.state !== 'used' && item.quantity > 0 ? (
                  <button
                    type="button"
                    style={useButton}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      useItem(item)
                    }}
                  >
                    Use
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyText}>No local items yet. QR/NFC/manual item collection can fill this panel next.</div>
      )}

      <div style={footerText}>{getUpdatedLabel(snapshot.updated_at)} · local-first gameplay state</div>
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

const itemList: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const itemRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.22)',
  padding: '9px 10px',
}

const itemMain: CSSProperties = {
  minWidth: 0,
  display: 'grid',
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

const itemState: CSSProperties = {
  flex: '0 0 auto',
  color: '#c4b5fd',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const itemActions: CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
}

const useButton: CSSProperties = {
  minHeight: 28,
  padding: '0 9px',
  borderRadius: 999,
  border: '1px solid rgba(34,197,94,.20)',
  background: 'rgba(34,197,94,.13)',
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const emptyText: CSSProperties = {
  color: 'rgba(226,232,240,.74)',
  fontSize: 12,
  lineHeight: 1.45,
}

const footerText: CSSProperties = {
  color: 'rgba(226,232,240,.56)',
  fontSize: 10,
  fontWeight: 800,
}

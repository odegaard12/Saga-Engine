import { useState, type CSSProperties } from 'react'
import { collectInventoryItem } from '../offline/inventory'

interface ManualInventoryCollectPanelProps {
  user: string
}

type ParsedItemCode = {
  item_id: string
  label: string
}

function parseItemCode(value: string): ParsedItemCode | null {
  const clean = value.trim()
  if (!clean) return null

  const normalized = clean.replace(/^item\s*:/i, 'ITEM:')
  if (!normalized.toUpperCase().startsWith('ITEM:')) {
    return null
  }

  const parts = normalized.split(':').map((part) => part.trim()).filter(Boolean)
  const itemId = parts[1]
  const label = parts.slice(2).join(':') || itemId

  if (!itemId) return null

  return {
    item_id: itemId.slice(0, 120),
    label: label.slice(0, 160),
  }
}

export function ManualInventoryCollectPanel({ user }: ManualInventoryCollectPanelProps) {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('Usa ITEM:id o ITEM:id:Etiqueta')
  const [saved, setSaved] = useState(false)

  function submitItemCode() {
    const parsed = parseItemCode(code)

    if (!parsed) {
      setSaved(false)
      setMessage('Formato: ITEM:id o ITEM:id:Etiqueta')
      return
    }

    try {
      const snapshot = collectInventoryItem({
        user,
        item_id: parsed.item_id,
        label: parsed.label,
        source: 'manual',
        physical_id: parsed.item_id,
        queue_event: true,
        metadata: {
          manual_entry: true,
        },
      })

      setCode('')
      setSaved(true)
      setMessage(`Objeto recogido: ${parsed.label} · ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} de objeto local`)
    } catch {
      setSaved(false)
      setMessage('No se pudo guardar el objeto en este dispositivo')
    }
  }

  return (
    <section style={panel}>
      <div>
        <div style={eyebrow}>Objeto manual</div>
        <div style={title}>Recoger objeto local</div>
      </div>

      <div style={inputRow}>
        <input
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
            setSaved(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitItemCode()
            }
          }}
          placeholder="ITEM:llave:Llave azul"
          style={input}
        />
        <button
          type="button"
          style={button}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            submitItemCode()
          }}
        >
          Añadir
        </button>
      </div>

      <div style={saved ? okText : helpText}>{message}</div>
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

const eyebrow: CSSProperties = {
  color: '#fde68a',
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

const inputRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
}

const input: CSSProperties = {
  width: '100%',
  minWidth: 0,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(15,23,42,.38)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
  padding: '10px 11px',
  outline: 'none',
}

const button: CSSProperties = {
  minHeight: 38,
  padding: '0 12px',
  borderRadius: 14,
  border: '1px solid rgba(250,204,21,.22)',
  background: 'rgba(250,204,21,.16)',
  color: '#fef9c3',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const helpText: CSSProperties = {
  color: 'rgba(226,232,240,.66)',
  fontSize: 11,
  lineHeight: 1.4,
}

const okText: CSSProperties = {
  ...helpText,
  color: '#bbf7d0',
  fontWeight: 900,
}

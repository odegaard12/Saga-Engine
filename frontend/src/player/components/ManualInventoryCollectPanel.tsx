import { useState, type CSSProperties } from 'react'
import { collectInventoryItem } from '../offline/inventory'

interface ManualInventoryCollectPanelProps {
  user: string
}

type ParsedItemCode = {
  item_id: string
  label: string
}

const QUICK_ITEMS = [
  { code: 'ITEM:llave:Llave azul', label: 'Llave azul' },
  { code: 'ITEM:pista:Pista encontrada', label: 'Pista' },
  { code: 'ITEM:moneda:Moneda antigua', label: 'Moneda' },
]

function parseItemCode(value: string): ParsedItemCode | null {
  const clean = value.trim()
  if (!clean) return null

  const normalized = clean.replace(/^item\s*:/i, 'ITEM:')
  if (!normalized.toUpperCase().startsWith('ITEM:')) {
    return {
      item_id: clean.slice(0, 80),
      label: clean.slice(0, 120),
    }
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
  const [message, setMessage] = useState('Escribe un nombre o pega un código ITEM:id:Etiqueta.')
  const [saved, setSaved] = useState(false)

  function submitItemCode(value = code) {
    const parsed = parseItemCode(value)

    if (!parsed) {
      setSaved(false)
      setMessage('Escribe un objeto o usa formato ITEM:id:Etiqueta.')
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
      setMessage(`Añadido: ${parsed.label} · ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} en mochila`)
    } catch {
      setSaved(false)
      setMessage('No se pudo guardar el objeto en este dispositivo.')
    }
  }

  return (
    <section style={panel}>
      <div>
        <div style={eyebrow}>Coger objeto</div>
        <div style={title}>Añadir coleccionable manual</div>
      </div>

      <div style={quickGrid}>
        {QUICK_ITEMS.map((item) => (
          <button
            key={item.code}
            type="button"
            style={quickButton}
            onClick={() => submitItemCode(item.code)}
          >
            + {item.label}
          </button>
        ))}
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
          placeholder="Ej: Llave azul"
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
      <div style={formatHint}>Formato avanzado: ITEM:llave:Llave azul</div>
    </section>
  )
}

const panel: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.06)',
  padding: 12,
}

const eyebrow: React.CSSProperties = {
  color: '#fde68a',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const title: React.CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 900,
}

const quickGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 7,
}

const quickButton: React.CSSProperties = {
  minHeight: 34,
  borderRadius: 14,
  border: '1px solid rgba(250,204,21,.18)',
  background: 'rgba(250,204,21,.10)',
  color: '#fef9c3',
  fontSize: 10,
  fontWeight: 900,
}

const inputRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
}

const input: React.CSSProperties = {
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

const button: React.CSSProperties = {
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

const helpText: React.CSSProperties = {
  color: 'rgba(226,232,240,.66)',
  fontSize: 11,
  lineHeight: 1.4,
}

const okText: React.CSSProperties = {
  ...helpText,
  color: '#bbf7d0',
  fontWeight: 900,
}

const formatHint: React.CSSProperties = {
  color: 'rgba(226,232,240,.44)',
  fontSize: 10,
  fontWeight: 800,
}

import { useMemo, useState, type CSSProperties } from 'react'
import { collectInventoryItem } from '../offline/inventory'

interface ManualInventoryCollectPanelProps {
  user: string
}

type ParsedManualInput = {
  item_id: string
  label: string
  raw: string
}

function slugifyItemId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function parseManualInput(value: string): ParsedManualInput | null {
  const clean = value.trim()
  if (!clean) return null

  let normalized = clean.replace(/^saga\s*:/i, 'SAGA:')

  if (normalized.toUpperCase().startsWith('SAGA1:')) {
    normalized = normalized.slice('SAGA1:'.length)
  } else if (normalized.toUpperCase().startsWith('SAGA:')) {
    normalized = normalized.slice('SAGA:'.length)
  }

  normalized = normalized
    .replace(/^item\s*:/i, 'ITEM:')
    .replace(/^proof\s*:/i, 'PROOF:')

  if (normalized.toUpperCase().startsWith('ITEM:') || normalized.toUpperCase().startsWith('PROOF:')) {
    const parts = normalized.split(':').map((part) => part.trim()).filter(Boolean)
    const itemId = parts[1]
    const label = parts.slice(2).join(':') || itemId

    if (!itemId) return null

    return {
      item_id: slugifyItemId(itemId) || itemId.slice(0, 80),
      label: label.slice(0, 160),
      raw: clean.slice(0, 300),
    }
  }

  const itemId = slugifyItemId(clean)
  if (!itemId) return null

  return {
    item_id: itemId,
    label: clean.slice(0, 160),
    raw: clean.slice(0, 300),
  }
}

export function ManualInventoryCollectPanel({ user }: ManualInventoryCollectPanelProps) {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('Usa esto solo como respaldo si QR/NFC falla o si os perdeis en un nodo.')
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => parseManualInput(value), [value])
  const canSubmit = Boolean(preview)

  function submitManualFallback() {
    const parsed = parseManualInput(value)

    if (!parsed) {
      setSaved(false)
      setMessage('Escribe una palabra, codigo o nombre visible de la prueba.')
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
          raw_value: parsed.raw,
          input_format: 'manual_fallback',
        },
      })

      setValue('')
      setSaved(true)
      setMessage(`Guardado en Objetos: ${parsed.label} ? ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} en mochila`)
    } catch {
      setSaved(false)
      setMessage('No se pudo guardar. Prueba otra vez.')
    }
  }

  return (
    <section style={panel}>
      <div>
        <div style={eyebrow}>RESPALDO</div>
        <div style={title}>Codigo o texto manual</div>
      </div>

      <div style={copy}>
        Normalmente usa los botones rapidos del mapa: QR o NFC. Esta pantalla es el plan B para escribir una palabra, codigo o nombre si algo falla.
      </div>

      <label style={field}>
        Texto de respaldo
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setSaved(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitManualFallback()
            }
          }}
          placeholder="Ej: llave torre, runa azul, pista faro"
          style={input}
        />
      </label>

      {preview ? (
        <div style={previewBox}>
          <span>Se guardara en Objetos</span>
          <strong>{preview.label}</strong>
          <small>El identificador interno se crea automaticamente.</small>
        </div>
      ) : null}

      <button
        type="button"
        style={canSubmit ? button : buttonDisabled}
        disabled={!canSubmit}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          submitManualFallback()
        }}
      >
        Guardar respaldo
      </button>

      <div style={saved ? okText : helpText}>{message}</div>
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 12,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.12)',
  background:
    'radial-gradient(circle at top right, rgba(125,211,252,.12), transparent 36%), linear-gradient(180deg, rgba(100,116,139,.34), rgba(51,65,85,.28))',
  padding: 12,
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: '0.14em',
}

const title: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 950,
}

const copy: CSSProperties = {
  borderRadius: 15,
  background: 'rgba(15,23,42,.20)',
  color: 'rgba(226,232,240,.76)',
  fontSize: 12,
  lineHeight: 1.35,
  fontWeight: 750,
  padding: 10,
}

const field: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'rgba(226,232,240,.84)',
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const input: CSSProperties = {
  width: '100%',
  minWidth: 0,
  borderRadius: 15,
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(15,23,42,.46)',
  color: '#ffffff',
  fontSize: 16,
  lineHeight: 1.2,
  fontWeight: 800,
  padding: '12px 12px',
  outline: 'none',
  textTransform: 'none',
  letterSpacing: 0,
}

const previewBox: CSSProperties = {
  display: 'grid',
  gap: 2,
  borderRadius: 15,
  border: '1px solid rgba(187,247,208,.16)',
  background: 'rgba(34,197,94,.10)',
  padding: 10,
}

const button: CSSProperties = {
  minHeight: 42,
  padding: '0 12px',
  borderRadius: 15,
  border: '1px solid rgba(125,211,252,.24)',
  background: 'rgba(14,165,233,.20)',
  color: '#dbeafe',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const buttonDisabled: CSSProperties = {
  ...button,
  opacity: 0.48,
}

const helpText: CSSProperties = {
  color: 'rgba(226,232,240,.66)',
  fontSize: 11,
  lineHeight: 1.4,
}

const okText: CSSProperties = {
  ...helpText,
  color: '#bbf7d0',
  fontWeight: 950,
}

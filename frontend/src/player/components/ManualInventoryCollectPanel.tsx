import { useMemo, useState, type CSSProperties } from 'react'
import { collectInventoryItem } from '../offline/inventory'

interface ManualInventoryCollectPanelProps {
  user: string
}

type ParsedManualInput = {
  item_id: string
  label: string
  raw: string
  format: 'field_text' | 'structured_code'
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

  const normalized = clean.replace(/^saga\s*:/i, '').replace(/^item\s*:/i, 'ITEM:')

  if (normalized.toUpperCase().startsWith('ITEM:')) {
    const parts = normalized.split(':').map((part) => part.trim()).filter(Boolean)
    const itemId = parts[1]
    const label = parts.slice(2).join(':') || itemId

    if (!itemId) return null

    return {
      item_id: slugifyItemId(itemId) || itemId.slice(0, 80),
      label: label.slice(0, 160),
      raw: clean.slice(0, 300),
      format: 'structured_code',
    }
  }

  const itemId = slugifyItemId(clean)
  if (!itemId) return null

  return {
    item_id: itemId,
    label: clean.slice(0, 160),
    raw: clean.slice(0, 300),
    format: 'field_text',
  }
}

export function ManualInventoryCollectPanel({ user }: ManualInventoryCollectPanelProps) {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('Escribe la palabra o nombre que ves en la prueba fisica.')
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => parseManualInput(value), [value])
  const canSubmit = Boolean(preview)

  function submitManualProof(input = value) {
    const parsed = parseManualInput(input)

    if (!parsed) {
      setSaved(false)
      setMessage('Escribe una palabra, nombre de objeto o codigo visible.')
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
          input_format: parsed.format,
        },
      })

      setValue('')
      setSaved(true)
      setMessage(`Guardado: ${parsed.label} ? ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} en mochila`)
    } catch {
      setSaved(false)
      setMessage('No se pudo guardar. Prueba otra vez.')
    }
  }

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <div style={eyebrow}>COGER</div>
          <div style={title}>Prueba de campo</div>
        </div>
        <span style={badge}>LOCAL</span>
      </div>

      <div style={hint}>
        Busca una palabra, simbolo o nombre en la tarjeta, sobre, QR, NFC o prop. Si el escaneo falla, escribelo aqui.
      </div>

      <label style={field}>
        Palabra o nombre visible
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setSaved(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitManualProof()
            }
          }}
          placeholder="Ej: llave torre, runa azul, pista faro"
          style={input}
        />
      </label>

      {preview ? (
        <div style={previewBox}>
          <span>Se guardara en mochila</span>
          <strong>{preview.label}</strong>
        </div>
      ) : null}

      <button
        type="button"
        style={canSubmit ? button : buttonDisabled}
        disabled={!canSubmit}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          submitManualProof()
        }}
      >
        Guardar prueba
      </button>

      <div style={saved ? okText : helpText}>{message}</div>
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 10,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.12)',
  background:
    'radial-gradient(circle at top right, rgba(125,211,252,.14), transparent 36%), linear-gradient(180deg, rgba(100,116,139,.34), rgba(51,65,85,.28))',
  padding: 12,
}

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
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

const badge: CSSProperties = {
  alignSelf: 'flex-start',
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 9px',
  borderRadius: 999,
  border: '1px solid rgba(125,211,252,.20)',
  background: 'rgba(14,165,233,.14)',
  color: '#dbeafe',
  fontSize: 9,
  fontWeight: 950,
}

const hint: CSSProperties = {
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

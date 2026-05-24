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

  const normalized = clean
    .replace(/^saga\s*:/i, '')
    .replace(/^item\s*:/i, 'ITEM:')

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
  const [message, setMessage] = useState('Busca una palabra, s?mbolo o nombre en el objeto f?sico y escr?belo aqu?.')
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => parseManualInput(value), [value])
  const canSubmit = Boolean(preview)

  function submitManualProof(input = value) {
    const parsed = parseManualInput(input)

    if (!parsed) {
      setSaved(false)
      setMessage('Escribe el nombre del objeto, la palabra del sobre o el c?digo visible del prop.')
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
      setMessage(`A?adido a la mochila: ${parsed.label} ? ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} de objeto guardado`)
    } catch {
      setSaved(false)
      setMessage('No se pudo guardar en este dispositivo. Prueba otra vez.')
    }
  }

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <div style={eyebrow}>Plan B de campo</div>
          <div style={title}>Guardar objeto encontrado</div>
        </div>
        <span style={badge}>MOCHILA LOCAL</span>
      </div>

      <div style={steps}>
        <div style={step}>
          <b>1</b>
          <span>Mira el objeto f?sico, tarjeta, sobre o pista.</span>
        </div>
        <div style={step}>
          <b>2</b>
          <span>Escribe su nombre, palabra clave o c?digo visible.</span>
        </div>
        <div style={step}>
          <b>3</b>
          <span>Queda guardado aunque no haya cobertura.</span>
        </div>
      </div>

      <label style={field}>
        ?Qu? has encontrado?
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
          placeholder="Ej: Llave de la torre, Runa azul, Pista del faro..."
          style={input}
        />
      </label>

      {preview ? (
        <div style={previewBox}>
          <span>Se a?adir? a la mochila</span>
          <strong>{preview.label}</strong>
          <small>Identificador interno creado autom?ticamente.</small>
        </div>
      ) : (
        <div style={emptyPreview}>
          El QR/NFC ser? la v?a r?pida m?s adelante. Este campo queda como respaldo manual.
        </div>
      )}

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
        Guardar objeto
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
    'radial-gradient(circle at top right, rgba(125,211,252,.14), transparent 36%), linear-gradient(180deg, rgba(100,116,139,.42), rgba(51,65,85,.34))',
  padding: 12,
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 950,
}

const badge: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid rgba(125,211,252,.20)',
  background: 'rgba(14,165,233,.14)',
  color: '#dbeafe',
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.10em',
  whiteSpace: 'nowrap',
}

const steps: CSSProperties = {
  display: 'grid',
  gap: 7,
}

const step: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '24px 1fr',
  gap: 8,
  alignItems: 'center',
  color: 'rgba(226,232,240,.74)',
  fontSize: 11,
  lineHeight: 1.35,
  fontWeight: 750,
}

const field: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'rgba(226,232,240,.86)',
  fontSize: 10,
  fontWeight: 900,
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

const emptyPreview: CSSProperties = {
  borderRadius: 15,
  border: '1px dashed rgba(226,232,240,.14)',
  color: 'rgba(226,232,240,.54)',
  fontSize: 10,
  lineHeight: 1.4,
  fontWeight: 800,
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
  fontWeight: 900,
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
  fontWeight: 900,
}

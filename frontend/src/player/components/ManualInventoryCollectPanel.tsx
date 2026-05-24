import { useMemo, useState, type CSSProperties } from 'react'
import { collectInventoryItem } from '../offline/inventory'

interface ManualInventoryCollectPanelProps {
  user: string
}

type ParsedItemCode = {
  item_id: string
  label: string
  raw: string
  format: 'item_code' | 'plain_text'
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

function parseItemCode(value: string): ParsedItemCode | null {
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
      format: 'item_code',
    }
  }

  const itemId = slugifyItemId(clean)

  if (!itemId) return null

  return {
    item_id: itemId,
    label: clean.slice(0, 160),
    raw: clean.slice(0, 300),
    format: 'plain_text',
  }
}

export function ManualInventoryCollectPanel({ user }: ManualInventoryCollectPanelProps) {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('Introduce un c?digo f?sico o el nombre del objeto encontrado.')
  const [saved, setSaved] = useState(false)

  const preview = useMemo(() => parseItemCode(code), [code])

  function submitItemCode(value = code) {
    const parsed = parseItemCode(value)

    if (!parsed) {
      setSaved(false)
      setMessage('Introduce un objeto o usa formato ITEM:id:Etiqueta.')
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

      setCode('')
      setSaved(true)
      setMessage(`Guardado en mochila: ${parsed.label} ? ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} de objeto`)
    } catch {
      setSaved(false)
      setMessage('No se pudo guardar el objeto en este dispositivo.')
    }
  }

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <div style={eyebrow}>Prueba f?sica</div>
          <div style={title}>Recoger objeto manual</div>
        </div>
        <span style={badge}>OFFLINE</span>
      </div>

      <p style={copy}>
        Usa este fallback cuando el QR/NFC no est? disponible. El objeto queda en la mochila local y se a?ade una prueba a la cola de sincronizaci?n.
      </p>

      <label style={field}>
        C?digo o nombre del objeto
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
          placeholder="Ej: ITEM:llave_torre:Llave de la torre"
          style={input}
        />
      </label>

      {preview ? (
        <div style={previewBox}>
          <span>Se guardar? como</span>
          <strong>{preview.label}</strong>
          <small>ID: {preview.item_id}</small>
        </div>
      ) : null}

      <button
        type="button"
        style={button}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          submitItemCode()
        }}
      >
        Guardar en mochila
      </button>

      <div style={saved ? okText : helpText}>{message}</div>

      <div style={formatHint}>
        Formatos v?lidos: <b>ITEM:id:Etiqueta</b> o texto libre. Ejemplo QR futuro: <b>ITEM:runa_agua:Runa de agua</b>.
      </div>
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 11,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'linear-gradient(180deg, rgba(250,204,21,.08), rgba(255,255,255,.045))',
  padding: 12,
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
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

const badge: CSSProperties = {
  minHeight: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid rgba(250,204,21,.20)',
  background: 'rgba(250,204,21,.12)',
  color: '#fef9c3',
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.10em',
}

const copy: CSSProperties = {
  margin: 0,
  color: 'rgba(226,232,240,.70)',
  fontSize: 11,
  lineHeight: 1.45,
  fontWeight: 750,
}

const field: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'rgba(226,232,240,.82)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const input: CSSProperties = {
  width: '100%',
  minWidth: 0,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(15,23,42,.42)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
  padding: '11px 12px',
  outline: 'none',
  textTransform: 'none',
  letterSpacing: 0,
}

const previewBox: CSSProperties = {
  display: 'grid',
  gap: 2,
  borderRadius: 14,
  border: '1px solid rgba(187,247,208,.16)',
  background: 'rgba(34,197,94,.10)',
  padding: 10,
}

const button: CSSProperties = {
  minHeight: 40,
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

const formatHint: CSSProperties = {
  color: 'rgba(226,232,240,.48)',
  fontSize: 10,
  lineHeight: 1.35,
  fontWeight: 800,
}

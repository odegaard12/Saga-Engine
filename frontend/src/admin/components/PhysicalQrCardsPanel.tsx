import { useMemo, useState, type CSSProperties } from 'react'

type PhysicalQrKind = 'collectible' | 'requirement' | 'clue' | 'bonus'

const kindLabels: Record<PhysicalQrKind, string> = {
  collectible: 'Coleccionable',
  requirement: 'Requisito',
  clue: 'Pista',
  bonus: 'Bonus',
}

const kindIcons: Record<PhysicalQrKind, string> = {
  collectible: '⭐',
  requirement: '🔒',
  clue: '🧩',
  bonus: '🎁',
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export default function PhysicalQrCardsPanel() {
  const [label, setLabel] = useState('Llave de la torre')
  const [manualId, setManualId] = useState('')
  const [kind, setKind] = useState<PhysicalQrKind>('collectible')
  const [copied, setCopied] = useState<string | null>(null)

  const itemId = useMemo(() => {
    const chosen = manualId.trim() || label.trim()
    return slugify(chosen) || 'objeto_saga'
  }, [label, manualId])

  const cleanLabel = label.trim() || 'Objeto SAGA'
  const payload = `SAGA1:ITEM:${itemId}:${cleanLabel}`
  const cardText = `${kindIcons[kind]} ${cleanLabel}\n${kindLabels[kind]}\nEscanea esta tarjeta en SAGA.`

  async function handleCopy(name: string, value: string) {
    const ok = await copyToClipboard(value)
    setCopied(ok ? `${name} copiado` : `No se pudo copiar ${name}`)
    window.setTimeout(() => setCopied(null), 1800)
  }

  return (
    <section style={panel} aria-label="Tarjetas QR">
      <div style={header}>
        <div>
          <div style={eyebrow}>TARJETAS QR</div>
          <h2 style={title}>Objetos físicos y coleccionables</h2>
          <p style={copy}>
            Crea tarjetas QR para objetos del juego. El jugador solo ve una tarjeta bonita; SAGA guarda el objeto al escanearla.
          </p>
        </div>
        <span style={badge}>QR MVP</span>
      </div>

      <div style={formGrid}>
        <label style={field}>
          Nombre visible
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Llave de la torre"
            style={input}
          />
        </label>

        <label style={field}>
          ID interno
          <input
            value={manualId}
            onChange={(event) => setManualId(event.target.value)}
            placeholder={itemId}
            style={input}
          />
        </label>

        <label style={field}>
          Tipo
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as PhysicalQrKind)}
            style={input}
          >
            <option value="collectible">Coleccionable</option>
            <option value="requirement">Requisito</option>
            <option value="clue">Pista</option>
            <option value="bonus">Bonus</option>
          </select>
        </label>
      </div>

      <div style={previewGrid}>
        <div style={cardPreview}>
          <div style={cardIcon}>{kindIcons[kind]}</div>
          <strong>{cleanLabel}</strong>
          <span>{kindLabels[kind]}</span>
          <small>Escanea esta tarjeta en SAGA</small>
        </div>

        <div style={payloadBox}>
          <span>Texto interno del QR</span>
          <code>{payload}</code>
          <small>Esto va dentro de la imagen QR. El jugador no lo escribe.</small>
        </div>
      </div>

      <div style={actions}>
        <button type="button" style={button} onClick={() => void handleCopy('Payload QR', payload)}>
          Copiar payload QR
        </button>

        <button type="button" style={button} onClick={() => void handleCopy('Texto tarjeta', cardText)}>
          Copiar texto tarjeta
        </button>
      </div>

      {copied ? <div style={notice}>{copied}</div> : null}

      <div style={nextBox}>
        <b>Siguiente paso</b>
        <span>
          Después añadiremos generación/descarga de imagen QR y nodos secundarios con icono especial en el mapa.
        </span>
      </div>
    </section>
  )
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 14,
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  margin: '4px 0 0',
  color: '#ffffff',
  fontSize: 18,
  lineHeight: 1.05,
  fontWeight: 950,
  letterSpacing: '-0.04em',
}

const copy: CSSProperties = {
  margin: '7px 0 0',
  color: 'rgba(226,232,240,.74)',
  fontSize: 12,
  lineHeight: 1.42,
  fontWeight: 760,
}

const badge: CSSProperties = {
  minHeight: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(187,247,208,.18)',
  background: 'rgba(34,197,94,.12)',
  color: '#dcfce7',
  fontSize: 10,
  fontWeight: 950,
  whiteSpace: 'nowrap',
}

const formGrid: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const field: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'rgba(241,245,249,.88)',
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const input: CSSProperties = {
  width: '100%',
  minHeight: 42,
  borderRadius: 15,
  border: '1px solid rgba(255,255,255,.13)',
  background: 'rgba(15,23,42,.44)',
  color: '#ffffff',
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 850,
  outline: 'none',
}

const previewGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, .9fr) minmax(0, 1.1fr)',
  gap: 10,
}

const cardPreview: CSSProperties = {
  minHeight: 146,
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'center',
  gap: 5,
  padding: 12,
  borderRadius: 20,
  border: '1px solid rgba(187,247,208,.16)',
  background:
    'radial-gradient(circle at top, rgba(187,247,208,.18), transparent 48%), rgba(15,23,42,.34)',
  textAlign: 'center',
}

const cardIcon: CSSProperties = {
  width: 42,
  height: 42,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 16,
  background: 'rgba(248,250,252,.10)',
  fontSize: 22,
}

const payloadBox: CSSProperties = {
  display: 'grid',
  gap: 7,
  padding: 12,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(15,23,42,.30)',
}

const actions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const button: CSSProperties = {
  minHeight: 40,
  borderRadius: 15,
  border: '1px solid rgba(187,247,208,.18)',
  background: 'rgba(34,197,94,.14)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const notice: CSSProperties = {
  padding: 10,
  borderRadius: 14,
  background: 'rgba(34,197,94,.12)',
  border: '1px solid rgba(187,247,208,.16)',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
}

const nextBox: CSSProperties = {
  display: 'grid',
  gap: 3,
  padding: 11,
  borderRadius: 16,
  border: '1px dashed rgba(226,232,240,.16)',
  color: 'rgba(226,232,240,.72)',
  fontSize: 11,
  lineHeight: 1.35,
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export type PhysicalQrKind = 'collectible' | 'requirement' | 'clue' | 'bonus'

export type SavedPhysicalQrCard = {
  item_id: string
  label: string
  kind: PhysicalQrKind
  payload: string
  card_text: string
  updated_at: string
}

type PhysicalQrCardsPanelProps = {
  initialLabel?: string
  initialKind: PhysicalQrKind
  compact?: boolean
  onSaveToNode: (card: SavedPhysicalQrCard) => void
}

const kindLabels: Record<PhysicalQrKind, string> = {
  collectible: 'Objeto QR',
  requirement: 'Llave QR',
  clue: 'Pista',
  bonus: 'Bonus',
}

const kindIcons: Record<PhysicalQrKind, string> = {
  collectible: '⭐',
  requirement: '🔑',
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

function downloadTextFile(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function PhysicalQrCardsPanel({
  initialLabel = 'Buscar a tu enemigo',
  initialKind,
  compact = false,
  onSaveToNode,
}: PhysicalQrCardsPanelProps) {
  const [label, setLabel] = useState(initialLabel)
  const [manualId, setManualId] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const qrWrapRef = useRef<HTMLDivElement | null>(null)

  const kind = initialKind

  useEffect(() => {
    setLabel(initialLabel || 'Buscar a tu enemigo')
    setManualId('')
  }, [initialLabel, initialKind])

  const itemId = useMemo(() => {
    const chosen = manualId.trim() || label.trim()
    return slugify(chosen) || 'objeto_saga'
  }, [label, manualId])

  const cleanLabel = label.trim() || 'Objeto SAGA'
  const payload = `SAGA1:ITEM:${itemId}:${cleanLabel}`
  const cardText = `${kindIcons[kind]} ${cleanLabel}\n${kindLabels[kind]}\nEscanea esta tarjeta en SAGA.`

  function showNotice(value: string) {
    setNotice(value)
    window.setTimeout(() => setNotice(null), 1800)
  }

  async function handleCopy(name: string, value: string) {
    const ok = await copyToClipboard(value)
    showNotice(ok ? `${name} copiado` : `No se pudo copiar ${name}`)
  }

  function handleDownloadSvg() {
    const svg = qrWrapRef.current?.querySelector('svg')
    if (!svg) {
      showNotice('No se pudo descargar el QR')
      return
    }

    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`
    downloadTextFile(`saga-qr-${itemId}.svg`, source, 'image/svg+xml')
    showNotice('QR descargado')
  }

  function handleSaveToNode() {
    onSaveToNode({
      item_id: itemId,
      label: cleanLabel,
      kind,
      payload,
      card_text: cardText,
      updated_at: new Date().toISOString(),
    })

    showNotice('QR guardado en este nodo. Pulsa Guardar en Control de misión para persistir.')
  }

  return (
    <section style={compact ? compactPanel : panel} aria-label="Generador QR del nodo">
      <div style={header}>
        <div>
          <div style={eyebrow}>QR DEL NODO</div>
          <h2 style={compact ? compactTitle : title}>Tarjeta física</h2>
          <p style={copy}>
            Hereda el tipo elegido arriba: {kindLabels[kind]}. El jugador escanea este QR y SAGA lo guarda en Objetos.
          </p>
        </div>
        <span style={badge}>{kindIcons[kind]} {kindLabels[kind]}</span>
      </div>

      <div style={layout}>
        <div style={qrCard}>
          <div ref={qrWrapRef} style={qrImage}>
            <QRCodeSVG value={payload} size={154} level="M" includeMargin />
          </div>
          <strong>{cleanLabel}</strong>
          <small>{itemId}</small>
        </div>

        <div style={formGrid}>
          <label style={field}>
            Nombre visible
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Buscar a tu enemigo"
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
        </div>
      </div>

      <div style={payloadBox}>
        <span>Texto interno del QR</span>
        <code>{payload}</code>
        <small>El jugador no escribe esto. Va dentro de la imagen QR.</small>
      </div>

      <div style={actions}>
        <button type="button" style={primaryButton} onClick={handleSaveToNode}>
          Guardar QR en nodo
        </button>

        <button type="button" style={button} onClick={() => void handleCopy('Payload QR', payload)}>
          Copiar payload
        </button>

        <button type="button" style={button} onClick={handleDownloadSvg}>
          Descargar QR
        </button>
      </div>

      {notice ? <div style={noticeBox}>{notice}</div> : null}
    </section>
  )
}

const panel: CSSProperties = { display: 'grid', gap: 14 }

const compactPanel: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 12,
  borderRadius: 22,
  border: '1px solid rgba(187,247,208,.16)',
  background:
    'radial-gradient(circle at top right, rgba(187,247,208,.13), transparent 42%), rgba(15,23,42,.28)',
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

const compactTitle: CSSProperties = { ...title, fontSize: 15 }

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

const layout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 12,
  alignItems: 'stretch',
}

const qrCard: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  alignContent: 'center',
  gap: 8,
  padding: 12,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.13)',
  background: 'rgba(15,23,42,.32)',
  textAlign: 'center',
}

const qrImage: CSSProperties = {
  width: 166,
  height: 166,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 18,
  background: '#ffffff',
  overflow: 'hidden',
}

const formGrid: CSSProperties = { display: 'grid', gap: 10 }

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

const payloadBox: CSSProperties = {
  display: 'grid',
  gap: 7,
  padding: 12,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(15,23,42,.30)',
}

const actions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
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

const primaryButton: CSSProperties = {
  ...button,
  background: 'linear-gradient(180deg, rgba(187,247,208,.28), rgba(34,197,94,.18))',
}

const noticeBox: CSSProperties = {
  padding: 10,
  borderRadius: 14,
  background: 'rgba(34,197,94,.12)',
  border: '1px solid rgba(187,247,208,.16)',
  color: '#dcfce7',
  fontSize: 12,
  fontWeight: 900,
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export type PhysicalQrKind = 'collectible' | 'requirement' | 'clue' | 'bonus' | 'qr'

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
  hideInputs?: boolean
  onSaveToNode: (card: SavedPhysicalQrCard) => void
}

const kindLabels: Record<PhysicalQrKind, string> = {
  collectible: 'Objeto QR',
  requirement: 'Llave QR',
  clue: 'Pista QR',
  bonus: 'Bonus QR',
  qr: 'QR Físico',
}

const kindIcons: Record<PhysicalQrKind, string> = {
  collectible: '⭐',
  requirement: '🔑',
  clue: '🧩',
  bonus: '🎁',
  qr: '📍',
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
  hideInputs = false,
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
    return (manualId.trim() || label.trim()).toUpperCase().replace(/\s+/g, '_')
  }, [label, manualId])

  const cleanLabel = label.trim() || 'Objeto SAGA'
  const payload = manualId.trim() || itemId
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

    showNotice('QR aplicado. Pulsa Guardar para persistir la misión.')
  }

  return (
    <section style={compact ? compactPanel : panel} aria-label="Generador QR del nodo">
      {!compact && (
        <div style={header}>
          <div>
            <div style={eyebrow}>TARJETA QR</div>
            <h2 style={compact ? compactTitle : title}>QR imprimible</h2>
            <p style={copy}>Escanéalo para guardar este objeto físico en la mochila del jugador.</p>
          </div>
          <span style={badge}>
            {kindIcons[kind]} {kindLabels[kind]}
          </span>
        </div>
      )}

      <div style={layout}>
        <div style={qrCardWrapper}>
          <div ref={qrWrapRef} style={qrCardPdfStyle}>
            <div style={qrCodeBox}>
              <QRCodeSVG 
                value={payload} 
                size={160} 
                level="H" 
                fgColor="#007f4f" 
                includeMargin={false} 
              />
              <div style={qrSagaLogo}>SAGA</div>
            </div>
            <div style={qrLabelCapsule}>
              {cleanLabel}
            </div>
          </div>
        </div>

        {!hideInputs && (
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
        )}
      </div>

      <div style={payloadBox}>
        <span>Payload interno</span>
        <code>{payload}</code>
        <small>Va dentro del QR. Normalmente no se escribe a mano.</small>
      </div>

      <div style={actions}>
        <button type="button" style={primaryButton} onClick={handleSaveToNode}>
          Aplicar QR al nodo
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

const qrCardWrapper: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
}

const qrCardPdfStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '20px',
  background: '#ffffff',
  border: '1px dashed #cbd5e1',
  borderRadius: '16px',
  gap: '16px',
}

const qrCodeBox: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#ffffff',
  padding: '4px',
}

const qrSagaLogo: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  backgroundColor: '#007f4f',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 900,
  letterSpacing: '0.05em',
  padding: '4px 10px',
  borderRadius: '12px',
  border: '3px solid #ffffff',
  boxShadow: '0 0 0 1px #007f4f',
}

const qrLabelCapsule: CSSProperties = {
  color: '#007f4f',
  fontSize: '14px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  border: '2px solid #007f4f',
  borderRadius: '20px',
  padding: '4px 24px',
  background: '#ffffff',
  minWidth: '140px',
  textAlign: 'center',
}

const formGrid: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const field: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  color: 'rgba(226,232,240,.7)',
  fontSize: 12,
  fontWeight: 700,
}

const input: CSSProperties = {
  width: '100%',
  height: 44,
  background: 'rgba(15,23,42,.4)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 12,
  padding: '0 14px',
  color: '#fff',
  fontSize: 15,
  fontFamily: 'inherit',
  transition: 'border-color .15s',
}

const payloadBox: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 16,
  background: 'rgba(0,0,0,.15)',
  border: '1px solid rgba(255,255,255,.05)',
  borderRadius: 12,
  color: 'rgba(255,255,255,.5)',
  fontSize: 11,
}

const actions: CSSProperties = {
  display: 'flex',
  gap: 12,
  marginTop: 6,
}

const button: CSSProperties = {
  flex: 1,
  height: 44,
  border: 'none',
  borderRadius: 12,
  background: 'rgba(255,255,255,.08)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButton: CSSProperties = {
  ...button,
  background: '#10b981',
  color: '#022c22',
}

const noticeBox: CSSProperties = {
  position: 'absolute',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#10b981',
  color: '#064e3b',
  padding: '8px 16px',
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 700,
  boxShadow: '0 8px 24px rgba(16,185,129,.4)',
  animation: 'fadeUp 0.2s ease-out',
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import jsQR from 'jsqr'
import { collectInventoryItem } from '../offline/inventory'

interface ManualInventoryCollectPanelProps {
  user: string
}

type ParsedProofInput = {
  item_id: string
  label: string
  raw: string
  kind: 'item' | 'proof'
  format: 'field_text' | 'structured_code' | 'qr'
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

function parseProofInput(value: string, format: ParsedProofInput['format'] = 'field_text'): ParsedProofInput | null {
  const clean = value.trim()
  if (!clean) return null

  let normalized = clean.replace(/^saga\s*:/i, 'SAGA:')
  let qrFormat = format

  if (normalized.toUpperCase().startsWith('SAGA1:')) {
    normalized = normalized.slice('SAGA1:'.length)
    qrFormat = 'qr'
  } else if (normalized.toUpperCase().startsWith('SAGA:')) {
    normalized = normalized.slice('SAGA:'.length)
    qrFormat = 'qr'
  }

  normalized = normalized
    .replace(/^item\s*:/i, 'ITEM:')
    .replace(/^proof\s*:/i, 'PROOF:')

  if (normalized.toUpperCase().startsWith('ITEM:') || normalized.toUpperCase().startsWith('PROOF:')) {
    const kind = normalized.toUpperCase().startsWith('PROOF:') ? 'proof' : 'item'
    const parts = normalized.split(':').map((part) => part.trim()).filter(Boolean)
    const itemId = parts[1]
    const label = parts.slice(2).join(':') || itemId

    if (!itemId) return null

    return {
      item_id: slugifyItemId(itemId) || itemId.slice(0, 80),
      label: label.slice(0, 160),
      raw: clean.slice(0, 300),
      kind,
      format: qrFormat === 'qr' ? 'qr' : 'structured_code',
    }
  }

  const itemId = slugifyItemId(clean)
  if (!itemId) return null

  return {
    item_id: itemId,
    label: clean.slice(0, 160),
    raw: clean.slice(0, 300),
    kind: 'proof',
    format,
  }
}

export function ManualInventoryCollectPanel({ user }: ManualInventoryCollectPanelProps) {
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('Escanea un QR o escribe la palabra que ves en la prueba fisica.')
  const [saved, setSaved] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerState, setScannerState] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const preview = useMemo(() => parseProofInput(value), [value])
  const canSubmit = Boolean(preview)

  function saveProof(input = value, source: ParsedProofInput['format'] = 'field_text') {
    const parsed = parseProofInput(input, source)

    if (!parsed) {
      setSaved(false)
      setMessage('Escribe una palabra, nombre de objeto o pista visible.')
      return false
    }

    try {
      const snapshot = collectInventoryItem({
        user,
        item_id: parsed.item_id,
        label: parsed.label,
        source: parsed.format === 'qr' ? 'qr' : 'manual',
        physical_id: parsed.item_id,
        queue_event: true,
        metadata: {
          manual_entry: parsed.format !== 'qr',
          qr_entry: parsed.format === 'qr',
          proof_kind: parsed.kind,
          raw_value: parsed.raw,
          input_format: parsed.format,
        },
      })

      setValue('')
      setScannerOpen(false)
      setScannerState('idle')
      setSaved(true)
      setMessage(`Guardado en Objetos: ${parsed.label} ? ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} en mochila`)
      return true
    } catch {
      setSaved(false)
      setMessage('No se pudo guardar. Prueba otra vez.')
      return false
    }
  }

  useEffect(() => {
    if (!scannerOpen) return

    let stopped = false
    let timeoutId: number | null = null
    let stream: MediaStream | null = null

    async function startScanner() {
      setScannerState('starting')
      setMessage('Abriendo camara... acepta el permiso del navegador.')

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('camera_unavailable')
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        })

        if (stopped) return

        const video = videoRef.current
        if (!video) throw new Error('video_unavailable')

        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        await video.play()

        setScannerState('scanning')
        setMessage('Apunta al QR de la tarjeta, sobre, pegatina o prop.')

        const tick = () => {
          if (stopped) return

          const currentVideo = videoRef.current
          const canvas = canvasRef.current
          const context = canvas?.getContext('2d', { willReadFrequently: true })

          if (currentVideo && canvas && context && currentVideo.readyState >= 2) {
            const width = currentVideo.videoWidth
            const height = currentVideo.videoHeight

            if (width > 0 && height > 0) {
              canvas.width = width
              canvas.height = height
              context.drawImage(currentVideo, 0, 0, width, height)

              const image = context.getImageData(0, 0, width, height)
              const result = jsQR(image.data, image.width, image.height, {
                inversionAttempts: 'dontInvert',
              })

              if (result?.data) {
                saveProof(result.data, 'qr')
                return
              }
            }
          }

          timeoutId = window.setTimeout(tick, 220)
        }

        tick()
      } catch {
        setScannerState('error')
        setScannerOpen(false)
        setMessage('No se pudo abrir la camara. Usa la entrada manual.')
      }
    }

    void startScanner()

    return () => {
      stopped = true

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }

      const video = videoRef.current
      if (video) {
        video.srcObject = null
      }
    }
  }, [scannerOpen, user])

  return (
    <section style={panel}>
      <div style={header}>
        <div>
          <div style={eyebrow}>PRUEBA</div>
          <div style={title}>Registrar prueba fisica</div>
        </div>
        <span style={badge}>QR + MANUAL</span>
      </div>

      <div style={hint}>
        Escanea un QR de SAGA o escribe la palabra visible. La prueba se guarda en Objetos y puede desbloquear otros nodos.
      </div>

      <div style={modeRow}>
        <button
          type="button"
          style={scannerOpen ? modeButtonActive : modeButton}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setSaved(false)
            setScannerOpen((current) => !current)
          }}
        >
          {scannerOpen ? 'Cerrar QR' : 'Escanear QR'}
        </button>

        <button
          type="button"
          style={modeButton}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setScannerOpen(false)
          }}
        >
          Escribir manualmente
        </button>
      </div>

      {scannerOpen ? (
        <div style={scannerBox}>
          <video ref={videoRef} style={videoStyle} muted playsInline />
          <canvas ref={canvasRef} style={canvasStyle} />
          <div style={scannerText}>
            {scannerState === 'starting'
              ? 'Abriendo camara...'
              : scannerState === 'error'
                ? 'Camara no disponible.'
                : 'Apunta al QR.'}
          </div>
        </div>
      ) : null}

      <label style={field}>
        Palabra, pista u objeto
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setSaved(false)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              saveProof()
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
        </div>
      ) : null}

      <button
        type="button"
        style={canSubmit ? button : buttonDisabled}
        disabled={!canSubmit}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          saveProof()
        }}
      >
        Guardar en Objetos
      </button>

      <div style={saved ? okText : helpText}>{message}</div>

      <div style={formatHint}>
        QR recomendado: SAGA1:ITEM:llave_torre:Llave de la torre
      </div>
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
  whiteSpace: 'nowrap',
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

const modeRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const modeButton: CSSProperties = {
  minHeight: 40,
  borderRadius: 15,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(15,23,42,.30)',
  color: 'rgba(226,232,240,.82)',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const modeButtonActive: CSSProperties = {
  ...modeButton,
  border: '1px solid rgba(187,247,208,.20)',
  background: 'rgba(34,197,94,.14)',
  color: '#dcfce7',
}

const scannerBox: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  minHeight: 180,
  borderRadius: 18,
  border: '1px solid rgba(125,211,252,.20)',
  background: 'rgba(2,6,23,.54)',
}

const videoStyle: CSSProperties = {
  width: '100%',
  height: 220,
  objectFit: 'cover',
  display: 'block',
}

const canvasStyle: CSSProperties = {
  display: 'none',
}

const scannerText: CSSProperties = {
  position: 'absolute',
  left: 10,
  right: 10,
  bottom: 10,
  borderRadius: 999,
  background: 'rgba(2,6,23,.72)',
  color: '#e0f2fe',
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 900,
  textAlign: 'center',
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

const formatHint: CSSProperties = {
  color: 'rgba(226,232,240,.42)',
  fontSize: 10,
  lineHeight: 1.35,
  fontWeight: 800,
}

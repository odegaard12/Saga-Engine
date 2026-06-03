import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import jsQR from 'jsqr'
import { collectInventoryItem } from '../offline/inventory'

interface QuickProofPanelProps {
  user: string
  mobile: boolean
  hidden: boolean
  openSignal?: number
  showLauncher?: boolean
  submitting?: boolean
  errorMessage?: string | null
  onSubmitCode?: (code: string) => Promise<void>
}

type ParsedQrItem = {
  item_id: string
  label: string
  raw: string
  kind: 'item' | 'proof' | 'text'
  format: 'saga_item' | 'saga_proof' | 'plain_text' | 'url'
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

function getPayloadFromQr(value: string): { payload: string; format: ParsedQrItem['format'] } {
  const clean = String(value || '').trim()

  try {
    const url = new URL(clean)
    const nested =
      url.searchParams.get('item') ||
      url.searchParams.get('proof') ||
      url.searchParams.get('c') ||
      url.searchParams.get('saga')

    if (nested) return { payload: nested.trim(), format: 'url' }
  } catch {
    // Not a URL; use the raw QR payload.
  }

  return { payload: clean, format: 'plain_text' }
}

function parseQrItem(value: string): ParsedQrItem | null {
  const { payload, format } = getPayloadFromQr(value)
  const clean = payload.trim()

  if (!clean) return null

  const normalized = clean
    .replace(/^saga\s*:/i, 'SAGA:')
    .replace(/^saga1\s*:/i, 'SAGA1:')

  const stripped = normalized.toUpperCase().startsWith('SAGA1:')
    ? normalized.slice('SAGA1:'.length)
    : normalized.toUpperCase().startsWith('SAGA:')
      ? normalized.slice('SAGA:'.length)
      : normalized

  const parts = stripped.split(':').map((part) => part.trim()).filter(Boolean)
  const kind = String(parts[0] || '').toUpperCase()

  if (kind === 'ITEM' && parts[1]) {
    const itemId = slugifyItemId(parts[1]) || parts[1].slice(0, 80)
    const label = parts.slice(2).join(':') || parts[1]

    return {
      item_id: itemId,
      label: label.slice(0, 160),
      raw: clean.slice(0, 300),
      kind: 'item',
      format: 'saga_item',
    }
  }

  if (['PROOF', 'STAGE', 'NODE', 'CODE'].includes(kind) && parts[1]) {
    const itemId = slugifyItemId(parts[1]) || parts[1].slice(0, 80)
    const label = parts.slice(2).join(':') || `Tarjeta QR ${parts[1]}`

    return {
      item_id: `qr_${itemId}`.slice(0, 90),
      label: label.slice(0, 160),
      raw: clean.slice(0, 300),
      kind: 'proof',
      format: format === 'url' ? 'url' : 'saga_proof',
    }
  }

  const itemId = slugifyItemId(clean)
  if (!itemId) return null

  return {
    item_id: itemId,
    label: clean.slice(0, 160),
    raw: clean.slice(0, 300),
    kind: 'text',
    format,
  }
}

export function QuickProofPanel({
  user,
  mobile,
  hidden,
  openSignal = 0,
  showLauncher = true,
  submitting = false,
  errorMessage = null,
  onSubmitCode,
}: QuickProofPanelProps) {
  const [mode, setMode] = useState<'idle' | 'qr'>('idle')
  const [message, setMessage] = useState('Escanea una tarjeta QR de SAGA. Se guardará automáticamente en Objetos.')
  const [notice, setNotice] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [fallbackCode, setFallbackCode] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  function stopCamera() {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setScanning(false)
  }

  useEffect(() => {
    if (hidden) {
      stopCamera()
      setMode('idle')
      setNotice(null)
      setShowFallback(false)
      setFallbackCode('')
    }
  }, [hidden])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  useEffect(() => {
    if (!notice) return

    const timer = window.setTimeout(() => setNotice(null), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

  function saveQrItem(value: string) {
    const parsed = parseQrItem(value)

    if (!parsed) {
      setMessage('QR no leído. Prueba otra vez o usa Mochila > Respaldo.')
      return
    }

    try {
      const snapshot = collectInventoryItem({
        user,
        item_id: parsed.item_id,
        label: parsed.label,
        source: 'qr',
        physical_id: parsed.item_id,
        queue_event: true,
        metadata: {
          qr_entry: true,
          raw_value: parsed.raw,
          input_format: parsed.format,
          qr_kind: parsed.kind,
        },
      })

      setNotice(`Guardado en Objetos: ${parsed.label}`)
      setMessage(`Guardado en Objetos. Tienes ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} de objeto.`)
      setMode('idle')
      stopCamera()
      window.dispatchEvent(new CustomEvent('saga:inventory-updated', {
        detail: {
          user,
          item_id: parsed.item_id,
          label: parsed.label,
          source: 'qr',
        },
      }))
    } catch {
      setMessage('No se pudo guardar en este dispositivo. Usa Mochila > Respaldo.')
    }
  }

  useEffect(() => {
    if (!openSignal || hidden) return
    void startQrScan()
  }, [openSignal, hidden])

  async function handleFallbackSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const clean = fallbackCode.trim().toUpperCase()
    if (!clean || !onSubmitCode || submitting) return

    await onSubmitCode(clean)
    setFallbackCode('')
  }

  async function startQrScan() {
    if (typeof window === 'undefined') return

    if (!window.navigator.mediaDevices?.getUserMedia) {
      setMode('qr')
      setMessage('La cámara no está disponible. Usa Mochila > Respaldo.')
      return
    }

    stopCamera()
    setMode('qr')
    setNotice(null)
    setMessage('Apunta la cámara a la tarjeta QR de SAGA.')
    setScanning(true)

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const scan = () => {
        const video = videoRef.current
        const canvas = canvasRef.current
        const context = canvas?.getContext('2d', { willReadFrequently: true })

        if (!video || !canvas || !context || !streamRef.current) {
          frameRef.current = window.requestAnimationFrame(scan)
          return
        }

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          canvas.width = video.videoWidth || 640
          canvas.height = video.videoHeight || 480

          context.drawImage(video, 0, 0, canvas.width, canvas.height)

          const image = context.getImageData(0, 0, canvas.width, canvas.height)
          const result = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'attemptBoth',
          })

          if (result?.data) {
            saveQrItem(result.data)
            return
          }
        }

        frameRef.current = window.requestAnimationFrame(scan)
      }

      frameRef.current = window.requestAnimationFrame(scan)
    } catch {
      stopCamera()
      setMode('qr')
      setMessage('No se pudo abrir la cámara. Usa Mochila > Respaldo.')
    }
  }

  if (hidden) return null

  if (!showLauncher && mode === 'idle' && !notice) return null

  return (
    <div style={getWrapperStyle(mobile)} aria-label="Escaneo QR de campo">
      {notice ? <div style={noticeBox}>{notice}</div> : null}

      {mode === 'qr' ? (
        <section style={panel}>
          <div style={panelHead}>
            <div>
              <div style={eyebrow}>ESCANEAR QR</div>
              <strong>Escanear tarjeta QR</strong>
            </div>

            <button
              type="button"
              style={closeButton}
              aria-label="Cerrar escáner QR"
              onClick={() => {
                stopCamera()
                setMode('idle')
              }}
            >
              ×
            </button>
          </div>

          <div style={scannerBox}>
            <video ref={videoRef} style={videoStyle} playsInline muted />
            <canvas ref={canvasRef} style={canvasStyle} />
            <div style={scannerText}>
              {scanning
                ? 'Apunta la cámara a la tarjeta QR de SAGA.'
                : 'Pulsa QR para activar la cámara.'}
            </div>
          </div>

          <div style={helpText}>{message}</div>

          {onSubmitCode ? (
            <div style={fallbackWrap}>
              <button
                type="button"
                style={fallbackToggle}
                onClick={() => setShowFallback((value) => !value)}
                disabled={submitting}
              >
                {showFallback ? 'Ocultar fallback' : 'Fallback'}
              </button>

              {showFallback ? (
                <form style={fallbackForm} onSubmit={handleFallbackSubmit}>
                  <div style={fallbackTitle}>Código fallback</div>
                  <div style={fallbackHint}>
                    Si no puedes escanear el QR, introduce el código preestablecido de este nodo.
                  </div>

                  <input
                    value={fallbackCode}
                    onChange={(event) => setFallbackCode(event.target.value.toUpperCase())}
                    placeholder="CÓDIGO FALLBACK"
                    style={fallbackInput}
                    disabled={submitting}
                  />

                  <button type="submit" style={fallbackSubmit} disabled={submitting || !fallbackCode.trim()}>
                    {submitting ? 'Completando…' : 'Completar nodo'}
                  </button>

                  {errorMessage ? <div style={fallbackError}>{errorMessage}</div> : null}
                </form>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {showLauncher ? (
        <div style={dock}>
          <button type="button" style={dockButtonWide} onClick={() => void startQrScan()}>
            QR
          </button>
        </div>
      ) : null}
    </div>
  )
}

function getWrapperStyle(mobile: boolean): CSSProperties {
  return {
    position: 'relative',
    display: 'grid',
    justifyItems: 'stretch',
    gap: 8,
    pointerEvents: 'auto',
    width: mobile ? 'min(calc(100vw - 112px), 128px)' : 136,
    maxWidth: mobile ? 'min(calc(100vw - 112px), 128px)' : 136,
    justifySelf: 'end',
    alignSelf: 'center',
    gridColumn: 2,
  }
}

const dock: CSSProperties = {
  width: '100%',
  display: 'grid',
  gridTemplateColumns: '1fr',
  alignItems: 'center',
  gap: 6,
  padding: 6,
  borderRadius: 19,
  border: '1px solid rgba(255,255,255,.12)',
  background:
    'linear-gradient(180deg, rgba(148,163,184,.19), rgba(100,116,139,.16))',
  boxShadow: '0 14px 30px rgba(15,23,42,.20)',
  backdropFilter: 'blur(20px) saturate(1.10)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.10)',
}

const dockButton: CSSProperties = {
  minWidth: 0,
  minHeight: 38,
  padding: '0 12px',
  display: 'grid',
  placeItems: 'center',
  borderRadius: 15,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(51,65,85,.42)',
  color: 'rgba(248,250,252,.90)',
  fontSize: 10,
  lineHeight: 1,
  fontWeight: 950,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  textAlign: 'center',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
}

const dockButtonWide: CSSProperties = {
  ...dockButton,
  background: 'rgba(51,65,85,.42)',
  border: '1px solid rgba(255,255,255,.08)',
  color: 'rgba(248,250,252,.90)',
}

const panel: CSSProperties = {
  position: 'fixed',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(calc(100vw - 26px), 390px)',
  maxHeight: 'min(74vh, 610px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  display: 'grid',
  gap: 14,
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.18)',
  background:
    'linear-gradient(180deg, rgba(100,116,139,.97), rgba(51,65,85,.95))',
  color: '#f8fafc',
  boxShadow: '0 28px 76px rgba(2,6,23,.38)',
  backdropFilter: 'blur(26px) saturate(1.12)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.12)',
  padding: 15,
  zIndex: 5600,
}

const panelHead: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  paddingBottom: 6,
  borderBottom: '1px solid rgba(255,255,255,.08)',
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 9,
  fontWeight: 950,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const closeButton: CSSProperties = {
  width: 36,
  height: 36,
  minWidth: 36,
  minHeight: 36,
  padding: 0,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(15,23,42,.56)',
  color: '#ffffff',
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 950,
  textAlign: 'center',
  boxShadow: '0 10px 24px rgba(2,6,23,.20)',
}

const scannerBox: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  minHeight: 280,
  borderRadius: 22,
  border: '1px solid rgba(187,247,208,.14)',
  background: 'rgba(2,6,23,.66)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
}

const videoStyle: CSSProperties = {
  width: '100%',
  height: 300,
  objectFit: 'cover',
  display: 'block',
}

const canvasStyle: CSSProperties = {
  display: 'none',
}

const scannerText: CSSProperties = {
  position: 'absolute',
  left: 12,
  right: 12,
  bottom: 12,
  borderRadius: 18,
  background: 'rgba(15,23,42,.82)',
  border: '1px solid rgba(255,255,255,.10)',
  color: '#f8fafc',
  padding: '9px 11px',
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1.28,
  textAlign: 'center',
}

const helpText: CSSProperties = {
  color: 'rgba(241,245,249,.78)',
  fontSize: 12,
  lineHeight: 1.42,
  fontWeight: 820,
}

const noticeBox: CSSProperties = {
  position: 'fixed',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(calc(100vw - 28px), 340px)',
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.16)',
  background:
    'linear-gradient(180deg, rgba(100,116,139,.97), rgba(51,65,85,.95))',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 900,
  lineHeight: 1.4,
  padding: '12px 14px',
  textAlign: 'center',
  boxShadow: '0 16px 36px rgba(2,6,23,.26)',
  backdropFilter: 'blur(20px) saturate(1.12)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.12)',
  zIndex: 5600,
}


const fallbackWrap: CSSProperties = {
  display: 'grid',
  gap: 10,
  paddingTop: 2,
}

const fallbackToggle: CSSProperties = {
  minHeight: 42,
  borderRadius: 16,
  border: '1px solid rgba(251,191,36,.24)',
  background: 'rgba(251,191,36,.13)',
  color: '#fef3c7',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const fallbackForm: CSSProperties = {
  display: 'grid',
  gap: 9,
  padding: 11,
  borderRadius: 18,
  border: '1px solid rgba(251,191,36,.20)',
  background: 'rgba(15,23,42,.36)',
}

const fallbackTitle: CSSProperties = {
  color: '#f8fafc',
  fontSize: 13,
  fontWeight: 950,
}

const fallbackHint: CSSProperties = {
  color: 'rgba(241,245,249,.74)',
  fontSize: 11,
  lineHeight: 1.35,
  fontWeight: 760,
}

const fallbackInput: CSSProperties = {
  width: '100%',
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(15,23,42,.52)',
  color: '#ffffff',
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 900,
  outline: 'none',
}

const fallbackSubmit: CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(187,247,208,.22)',
  background: 'rgba(34,197,94,.18)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const fallbackError: CSSProperties = {
  color: '#fecaca',
  fontSize: 11,
  fontWeight: 850,
  lineHeight: 1.35,
}

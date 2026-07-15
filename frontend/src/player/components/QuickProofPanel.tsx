import { useEffect, useRef, useState, type CSSProperties } from 'react'
import jsQR from 'jsqr'
import { collectInventoryItem } from '../offline/inventory'
import { sounds, haptics } from '../utils/haptics'

interface QuickProofPanelProps {
  user: string
  mobile: boolean
  hidden: boolean
  openSignal?: number
  showLauncher?: boolean
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

  const normalized = clean.replace(/^saga\s*:/i, 'SAGA:').replace(/^saga1\s*:/i, 'SAGA1:')

  const stripped = normalized.toUpperCase().startsWith('SAGA1:')
    ? normalized.slice('SAGA1:'.length)
    : normalized.toUpperCase().startsWith('SAGA:')
      ? normalized.slice('SAGA:'.length)
      : normalized

  const parts = stripped
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean)
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
}: QuickProofPanelProps) {
  const [mode, setMode] = useState<'idle' | 'qr'>('idle')
  const [message, setMessage] = useState(
    'Escanea una tarjeta QR de SAGA. Se guardará automáticamente en Objetos.'
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined') return

    if (!document.getElementById('saga-qr-scanner-style')) {
      const style = document.createElement('style')
      style.id = 'saga-qr-scanner-style'
      style.textContent = `
        body.saga-qr-scanner-open [data-saga-player-hud="bottom"] {
          display: none !important;
          pointer-events: none !important;
        }
        .saga-scanner-viewfinder {
          position: absolute;
          inset: 40px;
          border: 1px dashed rgba(74, 222, 128, 0.25);
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .saga-scanner-viewfinder::after {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
          opacity: 0.6;
          animation: sagaScannerPulse 1.5s infinite ease-in-out;
        }
        .saga-scanner-corner {
          position: absolute;
          width: 16px;
          height: 16px;
          border: 3px solid #4ade80;
          pointer-events: none;
        }
        .saga-scanner-corner--tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; border-top-left-radius: 6px; }
        .saga-scanner-corner--tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; border-top-right-radius: 6px; }
        .saga-scanner-corner--bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; border-bottom-left-radius: 6px; }
        .saga-scanner-corner--br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; border-bottom-right-radius: 6px; }
        @keyframes sagaScannerPulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.3); opacity: 0.8; }
        }
        @keyframes sagaScanline {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(240px); opacity: 0; }
        }
      `
      document.head.appendChild(style)
    }

    const scannerOpen = mode !== 'idle'
    document.body.classList.toggle('saga-qr-scanner-open', scannerOpen)

    return () => {
      document.body.classList.remove('saga-qr-scanner-open')
    }
  }, [mode])

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
    }
  }, [hidden])

  useEffect(() => {
    const closeScanner = () => {
      stopCamera()
      setMode('idle')
      setNotice(null)
    }

    window.addEventListener('saga:close-qr-scanner', closeScanner)
    return () => window.removeEventListener('saga:close-qr-scanner', closeScanner)
  }, [])

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

      setNotice(`📷 Guardado: ${parsed.label}`)
      setMessage(
        `Guardado en Objetos. Tienes ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} de objeto.`
      )
      sounds.qrScan()
      haptics.qrScan()
      setMode('idle')
      stopCamera()
      window.dispatchEvent(
        new CustomEvent('saga:inventory-updated', {
          detail: {
            user,
            item_id: parsed.item_id,
            label: parsed.label,
            source: 'qr',
          },
        })
      )
    } catch {
      setMessage('No se pudo guardar en este dispositivo. Usa Mochila > Respaldo.')
    }
  }

  useEffect(() => {
    if (!openSignal || hidden) return
    void startQrScan()
  }, [openSignal, hidden])

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
            {scanning ? <div className="saga-scanner-line" /> : null}
            {scanning ? (
              <div className="saga-scanner-viewfinder">
                <div className="saga-scanner-corner saga-scanner-corner--tl" />
                <div className="saga-scanner-corner saga-scanner-corner--tr" />
                <div className="saga-scanner-corner saga-scanner-corner--bl" />
                <div className="saga-scanner-corner saga-scanner-corner--br" />
              </div>
            ) : null}
            <div style={scannerText}>
              {scanning
                ? 'Apunta la cámara a la tarjeta QR de SAGA.'
                : 'Pulsa QR para activar la cámara.'}
            </div>
          </div>
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
  background: 'linear-gradient(180deg, rgba(148,163,184,.19), rgba(100,116,139,.16))',
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
  top: '46%',
  transform: 'translate(-50%, -50%)',
  width: 'min(calc(100vw - 26px), 390px)',
  maxHeight: 'min(calc(100dvh - 36px), 560px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  display: 'grid',
  gap: 10,
  borderRadius: 28,
  border: '2px solid rgba(74,222,128,.30)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.98), rgba(2,6,23,.99))',
  color: '#f8fafc',
  boxShadow: '0 0 0 1px rgba(255,255,255,.05), 0 32px 84px rgba(0,0,0,.60)',
  backdropFilter: 'blur(26px) saturate(1.12)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.12)',
  padding: 12,
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
  minHeight: 216,
  borderRadius: 22,
  border: '2px solid rgba(74,222,128,.40)',
  background: 'rgba(2,6,23,.80)',
  boxShadow: 'inset 0 0 20px rgba(0,0,0,.60)',
}

const videoStyle: CSSProperties = {
  width: '100%',
  height: 236,
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
  top: '46%',
  transform: 'translate(-50%, -50%)',
  width: 'min(calc(100vw - 28px), 340px)',
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,.16)',
  background: 'linear-gradient(180deg, rgba(100,116,139,.97), rgba(51,65,85,.95))',
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

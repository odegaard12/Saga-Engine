import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import jsQR from 'jsqr'
import { collectInventoryItem } from '../offline/inventory'

interface QuickProofPanelProps {
  user: string
  mobile: boolean
  hidden: boolean
}

type ProofMode = 'idle' | 'qr' | 'nfc' | 'manual'

type ParsedProofInput = {
  item_id: string
  label: string
  raw: string
  kind: 'item' | 'proof'
  format: 'manual' | 'qr' | 'nfc' | 'structured_code'
}

type BrowserNDEFRecord = {
  recordType?: string
  data?: DataView
}

type BrowserNDEFReadingEvent = {
  message?: {
    records?: BrowserNDEFRecord[]
  }
}

type BrowserNDEFReader = {
  scan: () => Promise<void>
  onreading: ((event: BrowserNDEFReadingEvent) => void) | null
  onreadingerror: (() => void) | null
}

type WindowWithNFC = Window & {
  NDEFReader?: new () => BrowserNDEFReader
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

function parseProofInput(value: string, format: ParsedProofInput['format'] = 'manual'): ParsedProofInput | null {
  const clean = value.trim()
  if (!clean) return null

  let normalized = clean.replace(/^saga\s*:/i, 'SAGA:')
  let detectedFormat = format

  if (normalized.toUpperCase().startsWith('SAGA1:')) {
    normalized = normalized.slice('SAGA1:'.length)
    detectedFormat = format === 'nfc' ? 'nfc' : 'qr'
  } else if (normalized.toUpperCase().startsWith('SAGA:')) {
    normalized = normalized.slice('SAGA:'.length)
    detectedFormat = format === 'nfc' ? 'nfc' : 'qr'
  }

  normalized = normalized
    .replace(/^item\s*:/i, 'ITEM:')
    .replace(/^proof\s*:/i, 'PROOF:')

  if (normalized.toUpperCase().startsWith('ITEM:') || normalized.toUpperCase().startsWith('PROOF:')) {
    const kind = normalized.toUpperCase().startsWith('ITEM:') ? 'item' : 'proof'
    const parts = normalized.split(':').map((part) => part.trim()).filter(Boolean)
    const itemId = parts[1]
    const label = parts.slice(2).join(':') || itemId

    if (!itemId) return null

    return {
      item_id: slugifyItemId(itemId) || itemId.slice(0, 80),
      label: label.slice(0, 160),
      raw: clean.slice(0, 300),
      kind,
      format: detectedFormat === 'manual' ? 'structured_code' : detectedFormat,
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

function decodeNfcText(record: BrowserNDEFRecord): string | null {
  if (!record.data) return null

  const bytes = new Uint8Array(
    record.data.buffer,
    record.data.byteOffset,
    record.data.byteLength
  )

  if (bytes.length === 0) return null

  if (record.recordType === 'text' && bytes.length > 1) {
    const languageLength = bytes[0] & 0x3f
    const payload = bytes.slice(1 + languageLength)
    return new TextDecoder().decode(payload).trim()
  }

  return new TextDecoder().decode(bytes).trim()
}

export function QuickProofPanel({ user, mobile, hidden }: QuickProofPanelProps) {
  const [mode, setMode] = useState<ProofMode>('idle')
  const [value, setValue] = useState('')
  const [message, setMessage] = useState('Elige QR, NFC o Codigo.')
  const [notice, setNotice] = useState<string | null>(null)
  const [scannerState, setScannerState] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle')
  const [nfcState, setNfcState] = useState<'idle' | 'starting' | 'scanning' | 'unsupported' | 'error'>('idle')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const preview = useMemo(() => parseProofInput(value, 'manual'), [value])
  const canSubmit = Boolean(preview)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (hidden) {
      setMode('idle')
    }
  }, [hidden])

  function saveProof(input: string, source: ParsedProofInput['format']) {
    const parsed = parseProofInput(input, source)

    if (!parsed) {
      setMessage('No se pudo leer. Usa Codigo como respaldo.')
      setNotice('No se pudo leer la prueba.')
      return false
    }

    try {
      const snapshot = collectInventoryItem({
        user,
        item_id: parsed.item_id,
        label: parsed.label,
        source: parsed.format === 'qr' ? 'qr' : parsed.format === 'nfc' ? 'nfc' : 'manual',
        physical_id: parsed.item_id,
        queue_event: true,
        metadata: {
          manual_entry: parsed.format !== 'qr' && parsed.format !== 'nfc',
          qr_entry: parsed.format === 'qr',
          nfc_entry: parsed.format === 'nfc',
          proof_kind: parsed.kind,
          raw_value: parsed.raw,
          input_format: parsed.format,
        },
      })

      setValue('')
      setMode('idle')
      setScannerState('idle')
      setNfcState('idle')
      setNotice(`Guardado: ${parsed.label}`)
      setMessage(`Guardado en Objetos. Total: ${snapshot.items.length}.`)
      return true
    } catch {
      setMessage('No se pudo guardar. Prueba otra vez.')
      setNotice('No se pudo guardar.')
      return false
    }
  }

  async function startNfcScan() {
    setMode('nfc')
    setNotice(null)

    const NDEFReader = (window as WindowWithNFC).NDEFReader

    if (!NDEFReader) {
      setNfcState('unsupported')
      setMessage('NFC no disponible aqui. Usa QR o Codigo.')
      return
    }

    try {
      setNfcState('starting')
      setMessage('Preparando NFC... acerca el movil a la etiqueta.')

      const reader = new NDEFReader()

      reader.onreading = (event) => {
        const records = event.message?.records || []
        const text = records.map(decodeNfcText).find(Boolean)

        if (text) {
          saveProof(text, 'nfc')
          return
        }

        setNfcState('error')
        setMessage('Etiqueta leida, pero sin prueba valida. Usa Codigo.')
      }

      reader.onreadingerror = () => {
        setNfcState('error')
        setMessage('No se pudo leer NFC. Usa QR o Codigo.')
      }

      await reader.scan()
      setNfcState('scanning')
      setMessage('NFC activo. Acerca el movil a la etiqueta.')
    } catch {
      setNfcState('error')
      setMessage('No se pudo iniciar NFC. Usa QR o Codigo.')
    }
  }

  useEffect(() => {
    if (mode !== 'qr') return

    let stopped = false
    let timeoutId: number | null = null
    let stream: MediaStream | null = null

    async function startScanner() {
      setScannerState('starting')
      setMessage('Abriendo camara... acepta el permiso.')

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
        setMessage('Apunta al QR. Si no lee, usa Codigo.')

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
                inversionAttempts: 'attemptBoth',
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
        setMode('manual')
        setMessage('No se pudo abrir la camara. Usa Codigo.')
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
  }, [mode, user])

  if (hidden) return null

  return (
    <div style={getWrapperStyle(mobile)} aria-label="Pruebas rapidas">
      {notice ? <div style={noticeBox}>{notice}</div> : null}

      {mode !== 'idle' ? (
        <section style={panel}>
          <div style={panelHead}>
            <div>
              <div style={eyebrow}>PRUEBA RAPIDA</div>
              <strong>{mode === 'qr' ? 'Escanear QR' : mode === 'nfc' ? 'Leer NFC' : 'Codigo de respaldo'}</strong>
            </div>

            <button
              type="button"
              style={closeButton}
              onClick={() => setMode('idle')}
            >
              x
            </button>
          </div>

          {mode === 'qr' ? (
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

          {mode === 'nfc' ? (
            <div style={nfcBox}>
              <strong>
                {nfcState === 'unsupported'
                  ? 'NFC no disponible'
                  : nfcState === 'scanning'
                    ? 'Esperando etiqueta'
                    : 'Lectura NFC'}
              </strong>
              <span>{message}</span>
            </div>
          ) : null}

          {mode === 'manual' ? (
            <>
              <label style={field}>
                Codigo, palabra u objeto
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveProof(value, 'manual')
                    }
                  }}
                  placeholder="Ej: llave torre, runa azul"
                  style={input}
                />
              </label>

              {preview ? (
                <div style={previewBox}>
                  <span>Se guardara como</span>
                  <strong>{preview.label}</strong>
                </div>
              ) : null}

              <button
                type="button"
                style={canSubmit ? saveButton : saveButtonDisabled}
                disabled={!canSubmit}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  saveProof(value, 'manual')
                }}
              >
                Guardar
              </button>
            </>
          ) : null}

          <div style={helpText}>{message}</div>
        </section>
      ) : null}

      <div style={dock}>
        <button type="button" style={dockButton} onClick={() => setMode('qr')}>
          QR
        </button>

        <button type="button" style={dockButton} onClick={() => void startNfcScan()}>
          NFC
        </button>

        <button type="button" style={dockButtonWide} onClick={() => {
          setMode('manual')
          setMessage('Codigo de respaldo: escribe lo que ves si QR/NFC falla.')
        }}>
          Codigo
        </button>
      </div>
    </div>
  )
}

function getWrapperStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: mobile ? 12 : 'auto',
    right: mobile ? 12 : 24,
    bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 112px)' : 132,
    zIndex: 1184,
    display: 'grid',
    justifyItems: 'stretch',
    gap: 8,
    pointerEvents: 'auto',
    width: mobile ? 'auto' : 360,
  }
}

const dock: CSSProperties = {
  width: '100%',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  alignItems: 'center',
  gap: 8,
  padding: 8,
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.20)',
  background:
    'linear-gradient(180deg, rgba(100,116,139,.64), rgba(51,65,85,.54))',
  boxShadow: '0 18px 42px rgba(15,23,42,.24)',
  backdropFilter: 'blur(22px) saturate(1.12)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.12)',
}

const dockButton: CSSProperties = {
  minWidth: 0,
  minHeight: 40,
  borderRadius: 17,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(15,23,42,.34)',
  color: 'rgba(248,250,252,.84)',
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)',
}

const dockButtonWide: CSSProperties = {
  ...dockButton,
  background: 'rgba(34,197,94,.18)',
  border: '1px solid rgba(187,247,208,.20)',
  color: '#dcfce7',
}

const panel: CSSProperties = {
  width: '100%',
  display: 'grid',
  gap: 10,
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,.18)',
  background:
    'linear-gradient(180deg, rgba(100,116,139,.82), rgba(51,65,85,.72))',
  color: '#f8fafc',
  boxShadow: '0 22px 60px rgba(2,6,23,.36)',
  backdropFilter: 'blur(22px) saturate(1.12)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.12)',
  padding: 12,
}

const panelHead: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 9,
  fontWeight: 950,
  letterSpacing: '0.14em',
}

const closeButton: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(15,23,42,.50)',
  color: '#ffffff',
  fontSize: 18,
  fontWeight: 950,
}

const scannerBox: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  minHeight: 176,
  borderRadius: 18,
  border: '1px solid rgba(125,211,252,.20)',
  background: 'rgba(2,6,23,.54)',
}

const videoStyle: CSSProperties = {
  width: '100%',
  height: 210,
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
  background: 'rgba(2,6,23,.74)',
  color: '#e0f2fe',
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 900,
  textAlign: 'center',
}

const nfcBox: CSSProperties = {
  display: 'grid',
  gap: 5,
  borderRadius: 16,
  border: '1px solid rgba(125,211,252,.16)',
  background: 'rgba(14,165,233,.10)',
  color: 'rgba(226,232,240,.82)',
  padding: 12,
  fontSize: 12,
  lineHeight: 1.35,
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

const saveButton: CSSProperties = {
  minHeight: 40,
  borderRadius: 14,
  border: '1px solid rgba(125,211,252,.24)',
  background: 'rgba(14,165,233,.20)',
  color: '#dbeafe',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const saveButtonDisabled: CSSProperties = {
  ...saveButton,
  opacity: 0.48,
}

const helpText: CSSProperties = {
  color: 'rgba(226,232,240,.70)',
  fontSize: 11,
  lineHeight: 1.35,
}

const noticeBox: CSSProperties = {
  width: '100%',
  borderRadius: 999,
  background: 'rgba(34,197,94,.18)',
  border: '1px solid rgba(187,247,208,.22)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 950,
  padding: '9px 12px',
  textAlign: 'center',
  boxShadow: '0 12px 28px rgba(2,6,23,.20)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
}

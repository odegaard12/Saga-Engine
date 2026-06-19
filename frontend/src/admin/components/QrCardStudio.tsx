import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import jsQR from 'jsqr'
import { QRCodeSVG } from 'qrcode.react'

export type QrCardPreset = 'clean' | 'dark' | 'photo'
export type QrCardShape = 'rounded' | 'square'

export type QrCardDesign = {
  preset: QrCardPreset
  shape: QrCardShape
  accent: string
  imageDataUrl: string
}

type Props = {
  payload: string
  label: string
  itemId: string
  typeLabel: string
  design: QrCardDesign
  validationSignature?: string
  onDesignChange: (design: QrCardDesign) => void
  onValidated: (signature: string) => void
  onApply: () => void
}

type ScanState = 'idle' | 'starting' | 'scanning' | 'wrong' | 'valid' | 'error'

const PRESETS: Array<{
  id: QrCardPreset
  label: string
  help: string
}> = [
  { id: 'clean', label: 'Claro', help: 'Limpio y fácil de imprimir.' },
  { id: 'dark', label: 'Oscuro', help: 'Más contraste en pantalla.' },
  { id: 'photo', label: 'Foto', help: 'Imagen de cabecera sin tocar el QR.' },
]

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getQrDesignSignature(
  payload: string,
  design: QrCardDesign,
): string {
  return hashText(JSON.stringify({ payload, design }))
}

function safeAccent(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#2563eb'
}

async function optimizeImage(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image()
    next.onload = () => resolve(next)
    next.onerror = () => reject(new Error('La imagen no es válida'))
    next.src = source
  })

  const maxWidth = 1000
  const maxHeight = 650
  const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height)
  const width = Math.max(1, Math.round(image.width * ratio))
  const height = Math.max(1, Math.round(image.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo preparar la imagen')
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (context.measureText(next).width <= maxWidth || !current) {
      current = next
      continue
    }
    lines.push(current)
    current = word
    if (lines.length >= maxLines - 1) break
  }

  if (current && lines.length < maxLines) lines.push(current)
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight))
}

export default function QrCardStudio({
  payload,
  label,
  itemId,
  typeLabel,
  design,
  validationSignature = '',
  onDesignChange,
  onValidated,
  onApply,
}: Props) {
  const qrWrapRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanMessage, setScanMessage] = useState('')
  const [notice, setNotice] = useState('')

  const accent = safeAccent(design.accent)
  const signature = useMemo(
    () => getQrDesignSignature(payload, { ...design, accent }),
    [payload, design, accent],
  )
  const validated = Boolean(validationSignature && validationSignature === signature)

  const cardStyle = useMemo<CSSProperties>(() => {
    const dark = design.preset === 'dark'
    const photo = design.preset === 'photo' && Boolean(design.imageDataUrl)
    return {
      ...previewCard,
      borderRadius: design.shape === 'square' ? 8 : 26,
      color: dark || photo ? '#ffffff' : '#0f172a',
      background: photo
        ? `linear-gradient(180deg, rgba(15,23,42,.20), rgba(15,23,42,.94)), url(${design.imageDataUrl}) center/cover`
        : dark
          ? 'linear-gradient(145deg, #111827, #0f172a)'
          : 'linear-gradient(145deg, #ffffff, #f8fafc)',
      border: `2px solid ${accent}`,
    }
  }, [design, accent])

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      stopStream(streamRef.current)
    }
  }, [])

  function updateDesign(patch: Partial<QrCardDesign>) {
    onDesignChange({ ...design, ...patch })
    setNotice('El diseño cambió: valida otra vez antes de descargar.')
  }

  async function handleImage(file: File | null) {
    if (!file) return
    try {
      const imageDataUrl = await optimizeImage(file)
      updateDesign({ preset: 'photo', imageDataUrl })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo preparar la imagen')
    }
  }

  function closeScanner() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setScannerOpen(false)
    setScanState('idle')
  }

  async function openScanner() {
    setScannerOpen(true)
    setScanState('starting')
    setScanMessage('Abriendo cámara…')

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScanState('error')
      setScanMessage('La cámara necesita HTTPS y permisos del navegador.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('No se pudo abrir la vista de cámara')
      video.srcObject = stream
      await video.play()
      setScanState('scanning')
      setScanMessage('Apunta al QR que quieres comprobar.')

      const scan = () => {
        const canvas = scanCanvasRef.current
        const currentVideo = videoRef.current
        if (!canvas || !currentVideo || currentVideo.readyState < 2) {
          frameRef.current = requestAnimationFrame(scan)
          return
        }

        const width = currentVideo.videoWidth
        const height = currentVideo.videoHeight
        if (!width || !height) {
          frameRef.current = requestAnimationFrame(scan)
          return
        }

        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(currentVideo, 0, 0, width, height)
        const image = context.getImageData(0, 0, width, height)
        const code = jsQR(image.data, width, height, {
          inversionAttempts: 'attemptBoth',
        })

        if (code?.data) {
          if (code.data === payload) {
            onValidated(signature)
            setScanState('valid')
            setScanMessage('QR correcto. Ya puedes descargar la tarjeta.')
            stopStream(streamRef.current)
            streamRef.current = null
            return
          }
          setScanState('wrong')
          setScanMessage('Ese QR no corresponde a este nodo. Prueba de nuevo.')
        }

        frameRef.current = requestAnimationFrame(scan)
      }

      frameRef.current = requestAnimationFrame(scan)
    } catch (error) {
      setScanState('error')
      setScanMessage(error instanceof Error ? error.message : 'No se pudo abrir la cámara')
    }
  }

  async function downloadCard() {
    if (!validated) {
      setNotice('Valida el QR con la cámara antes de descargarlo.')
      return
    }

    const svg = qrWrapRef.current?.querySelector('svg')
    if (!svg) {
      setNotice('No se encontró el QR para descargar.')
      return
    }

    try {
      const width = 1200
      const height = 1750
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No se pudo preparar la tarjeta')

      const dark =
        design.preset === 'dark'

      const photoEnabled =
        design.preset === 'photo' &&
        Boolean(design.imageDataUrl)

      context.fillStyle =
        dark || photoEnabled
          ? '#0f172a'
          : '#ffffff'
      context.fillRect(0, 0, width, height)

      if (photoEnabled) {
        const photo = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('No se pudo cargar la foto'))
          image.src = design.imageDataUrl
        })
        const scale = Math.max(width / photo.width, 460 / photo.height)
        const drawWidth = photo.width * scale
        const drawHeight = photo.height * scale
        context.drawImage(photo, (width - drawWidth) / 2, (460 - drawHeight) / 2, drawWidth, drawHeight)
        const gradient = context.createLinearGradient(0, 0, 0, 500)
        gradient.addColorStop(0, 'rgba(15,23,42,.08)')
        gradient.addColorStop(1, 'rgba(15,23,42,.94)')
        context.fillStyle = gradient
        context.fillRect(0, 0, width, 500)
      }

      context.fillStyle = accent
      context.fillRect(0, 0, width, 34)

      const qrSource = new XMLSerializer().serializeToString(svg)
      const qrBlob = new Blob([qrSource], { type: 'image/svg+xml;charset=utf-8' })
      const qrUrl = URL.createObjectURL(qrBlob)
      const qrImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('No se pudo generar el QR'))
        image.src = qrUrl
      })

      const qrBox = 820
      const qrX = (width - qrBox) / 2
      const qrY =
        photoEnabled ? 470 : 180
      context.fillStyle = '#ffffff'
      context.fillRect(qrX - 36, qrY - 36, qrBox + 72, qrBox + 72)
      context.drawImage(qrImage, qrX, qrY, qrBox, qrBox)
      URL.revokeObjectURL(qrUrl)

      const textColor =
        dark || photoEnabled
          ? '#ffffff'
          : '#0f172a'
      context.fillStyle = textColor
      context.textAlign = 'center'
      context.font = '900 64px system-ui, sans-serif'
      drawWrappedText(context, label || 'Objeto SAGA', width / 2, qrY + qrBox + 125, 980, 72, 2)
      context.font = '800 32px system-ui, sans-serif'
      context.fillStyle = dark || design.preset === 'photo' ? '#cbd5e1' : '#475569'
      context.fillText(typeLabel, width / 2, qrY + qrBox + 280)
      context.font = '700 25px ui-monospace, monospace'
      context.fillText(itemId, width / 2, qrY + qrBox + 335)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.96))
      if (!blob) throw new Error('No se pudo crear el PNG')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `saga-qr-${itemId}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice('Tarjeta QR descargada.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo descargar la tarjeta')
    }
  }

  return (
    <section style={studio} aria-label="Diseño y validación de tarjeta QR">
      <div style={studioHeader}>
        <div>
          <span style={eyebrow}>DISEÑO Y PRUEBA</span>
          <h3 style={heading}>Tarjeta QR</h3>
          <p style={description}>El diseño rodea al QR; el código mantiene fondo blanco y alto contraste.</p>
        </div>
        <span style={validated ? validBadge : pendingBadge}>
          {validated ? 'VALIDADO' : 'SIN VALIDAR'}
        </span>
      </div>

      <div style={workspace}>
        <div style={cardStyle}>
          {design.preset === 'photo' && design.imageDataUrl ? <div style={photoShade} /> : null}
          <div ref={qrWrapRef} style={qrPanel}>
            <QRCodeSVG
              value={payload}
              size={184}
              level="H"
              includeMargin
              fgColor="#0f172a"
              bgColor="#ffffff"
            />
          </div>
          <strong style={previewTitle}>{label || 'Objeto SAGA'}</strong>
          <span style={previewType}>{typeLabel}</span>
          <small style={previewId}>{itemId}</small>
        </div>

        <div style={controls}>
          <div style={presetGrid}>
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                style={design.preset === preset.id ? presetActive : presetButton}
                onClick={() => updateDesign({ preset: preset.id })}
              >
                <strong>{preset.label}</strong>
                <small>{preset.help}</small>
              </button>
            ))}
          </div>

          <div style={controlRow}>
            <label style={field}>
              Color
              <input
                type="color"
                value={accent}
                onChange={(event) => updateDesign({ accent: event.target.value })}
                style={colorInput}
              />
            </label>
            <label style={field}>
              Forma
              <select
                value={design.shape}
                onChange={(event) => updateDesign({ shape: event.target.value as QrCardShape })}
                style={selectInput}
              >
                <option value="rounded">Redondeada</option>
                <option value="square">Recta</option>
              </select>
            </label>
          </div>

          <label style={uploadButton}>
            {design.imageDataUrl ? 'Cambiar fotografía' : 'Añadir fotografía'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => void handleImage(event.target.files?.[0] || null)}
            />
          </label>

          {design.imageDataUrl ? (
            <button type="button" style={secondaryButton} onClick={() => updateDesign({ imageDataUrl: '', preset: 'clean' })}>
              Quitar fotografía
            </button>
          ) : null}
        </div>
      </div>

      <div style={actionGrid}>
        <button type="button" style={secondaryButton} onClick={onApply}>Aplicar al nodo</button>
        <button type="button" style={validateButton} onClick={() => void openScanner()}>Validar con cámara</button>
        <button
          type="button"
          style={validated ? downloadButton : disabledButton}
          disabled={!validated}
          onClick={() => void downloadCard()}
        >
          Descargar PNG
        </button>
      </div>

      <p style={validationHelp}>
        Abre la cámara en el móvil o en un equipo con webcam y escanea la vista previa desde otra pantalla o desde una prueba impresa.
      </p>

      {notice ? <div style={noticeStyle}>{notice}</div> : null}

      {scannerOpen ? (
        <div style={scannerOverlay} role="dialog" aria-modal="true" aria-label="Validar QR con cámara">
          <div style={scannerBackdrop} onClick={closeScanner} />
          <section style={scannerCard}>
            <div style={scannerHeader}>
              <div>
                <span style={eyebrow}>VALIDACIÓN</span>
                <strong>Escanea esta tarjeta</strong>
              </div>
              <button type="button" style={closeButton} onClick={closeScanner}>×</button>
            </div>
            <video ref={videoRef} muted playsInline style={videoStyle} />
            <canvas ref={scanCanvasRef} hidden />
            <div style={scanState === 'valid' ? scanValid : scanInfo}>{scanMessage}</div>
            {scanState === 'valid' ? (
              <button type="button" style={downloadButton} onClick={closeScanner}>Cerrar</button>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  )
}

const studio: CSSProperties = {
  display: 'grid', gap: 14, padding: 16, borderRadius: 24,
  border: '1px solid rgba(148,163,184,.18)', background: 'rgba(15,23,42,.34)',
}
const studioHeader: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }
const eyebrow: CSSProperties = { color: '#93c5fd', fontSize: 9, fontWeight: 950, letterSpacing: '.16em' }
const heading: CSSProperties = { margin: '4px 0 0', color: '#fff', fontSize: 20, fontWeight: 950 }
const description: CSSProperties = { margin: '6px 0 0', color: 'rgba(226,232,240,.72)', fontSize: 12, lineHeight: 1.4 }
const badgeBase: CSSProperties = { minHeight: 26, display: 'inline-flex', alignItems: 'center', padding: '0 9px', borderRadius: 999, fontSize: 9, fontWeight: 950 }
const validBadge: CSSProperties = { ...badgeBase, color: '#dcfce7', background: 'rgba(34,197,94,.15)', border: '1px solid rgba(74,222,128,.22)' }
const pendingBadge: CSSProperties = { ...badgeBase, color: '#fef3c7', background: 'rgba(245,158,11,.14)', border: '1px solid rgba(251,191,36,.20)' }
const workspace: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, alignItems: 'stretch' }
const previewCard: CSSProperties = { position: 'relative', minHeight: 390, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 8, padding: 18, overflow: 'hidden', textAlign: 'center', boxShadow: '0 18px 42px rgba(2,6,23,.24)' }
const photoShade: CSSProperties = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(15,23,42,.08),rgba(15,23,42,.80))' }
const qrPanel: CSSProperties = { position: 'relative', zIndex: 1, width: 204, height: 204, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 18, boxShadow: '0 10px 28px rgba(2,6,23,.26)' }
const previewTitle: CSSProperties = { position: 'relative', zIndex: 1, fontSize: 19, fontWeight: 950 }
const previewType: CSSProperties = { position: 'relative', zIndex: 1, fontSize: 12, fontWeight: 850, opacity: .82 }
const previewId: CSSProperties = { position: 'relative', zIndex: 1, fontFamily: 'ui-monospace,monospace', opacity: .68 }
const controls: CSSProperties = { display: 'grid', gap: 10, alignContent: 'start' }
const presetGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8 }
const presetButton: CSSProperties = { minHeight: 68, display: 'grid', gap: 4, padding: 10, borderRadius: 16, border: '1px solid rgba(148,163,184,.15)', background: 'rgba(30,41,59,.62)', color: '#e2e8f0', textAlign: 'left' }
const presetActive: CSSProperties = { ...presetButton, border: '1px solid rgba(96,165,250,.38)', background: 'rgba(37,99,235,.22)', color: '#fff' }
const controlRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }
const field: CSSProperties = { display: 'grid', gap: 6, color: 'rgba(226,232,240,.78)', fontSize: 10, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }
const colorInput: CSSProperties = { width: '100%', minHeight: 42, padding: 4, borderRadius: 14, border: '1px solid rgba(148,163,184,.18)', background: 'rgba(15,23,42,.56)' }
const selectInput: CSSProperties = { width: '100%', minHeight: 42, padding: '0 10px', borderRadius: 14, border: '1px solid rgba(148,163,184,.18)', background: 'rgba(15,23,42,.56)', color: '#fff' }
const buttonBase: CSSProperties = { minHeight: 42, borderRadius: 15, fontSize: 11, fontWeight: 950 }
const uploadButton: CSSProperties = { ...buttonBase, display: 'grid', placeItems: 'center', border: '1px dashed rgba(147,197,253,.34)', background: 'rgba(37,99,235,.12)', color: '#dbeafe', cursor: 'pointer' }
const secondaryButton: CSSProperties = { ...buttonBase, border: '1px solid rgba(148,163,184,.18)', background: 'rgba(51,65,85,.70)', color: '#f8fafc' }
const validateButton: CSSProperties = { ...buttonBase, border: '1px solid rgba(96,165,250,.30)', background: 'rgba(37,99,235,.24)', color: '#dbeafe' }
const downloadButton: CSSProperties = { ...buttonBase, border: '1px solid rgba(74,222,128,.28)', background: 'linear-gradient(180deg,#22c55e,#16a34a)', color: '#fff' }
const disabledButton: CSSProperties = { ...buttonBase, border: '1px solid rgba(148,163,184,.12)', background: 'rgba(71,85,105,.48)', color: 'rgba(226,232,240,.48)' }
const actionGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }
const validationHelp: CSSProperties = { margin: 0, color: 'rgba(148,163,184,.80)', fontSize: 11, lineHeight: 1.4 }
const noticeStyle: CSSProperties = { padding: '9px 11px', borderRadius: 13, background: 'rgba(59,130,246,.13)', color: '#dbeafe', fontSize: 11, fontWeight: 850 }
const scannerOverlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 7200, display: 'grid', placeItems: 'center', padding: 16 }
const scannerBackdrop: CSSProperties = { position: 'absolute', inset: 0, background: 'rgba(2,6,23,.76)', backdropFilter: 'blur(8px)' }
const scannerCard: CSSProperties = { position: 'relative', zIndex: 1, width: 'min(100%,520px)', display: 'grid', gap: 12, padding: 14, borderRadius: 24, border: '1px solid rgba(148,163,184,.22)', background: '#0f172a', boxShadow: '0 30px 90px rgba(2,6,23,.65)' }
const scannerHeader: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, color: '#fff' }
const closeButton: CSSProperties = { width: 40, height: 40, borderRadius: 999, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(30,41,59,.82)', color: '#fff', fontSize: 22 }
const videoStyle: CSSProperties = { width: '100%', maxHeight: '58vh', objectFit: 'cover', borderRadius: 18, background: '#020617' }
const scanInfo: CSSProperties = { padding: 10, borderRadius: 14, background: 'rgba(59,130,246,.13)', color: '#dbeafe', fontSize: 12, fontWeight: 850 }
const scanValid: CSSProperties = { ...scanInfo, background: 'rgba(34,197,94,.14)', color: '#dcfce7' }

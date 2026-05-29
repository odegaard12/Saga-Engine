import { useEffect, useRef, useState, type CSSProperties } from 'react'

type FieldCameraCaptureProps = {
  open: boolean
  busy?: boolean
  onClose: () => void
  onCapture: (imageDataUrl: string, note: string) => Promise<void> | void
}

export function FieldCameraCapture({
  open,
  busy = false,
  onClose,
  onCapture,
}: FieldCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!open) return

      setError('')
      setPreview('')

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('La cámara no está disponible en este navegador.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
      } catch {
        setError('No se pudo abrir la cámara. Revisa permisos del navegador.')
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [open])

  if (!open) return null

  function captureFrame() {
    const video = videoRef.current
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setError('La cámara aún no está lista.')
      return
    }

    const maxSide = 1600
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
    const width = Math.max(1, Math.round(video.videoWidth * scale))
    const height = Math.max(1, Math.round(video.videoHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('No se pudo preparar la foto.')
      return
    }

    ctx.drawImage(video, 0, 0, width, height)
    setPreview(canvas.toDataURL('image/jpeg', 0.90))
  }

  async function submitPhoto() {
    if (!preview || busy) return
    await onCapture(preview, note.trim())
    setPreview('')
    setNote('')
    onClose()
  }

  return (
    <div style={overlay}>
      <section style={sheet} aria-label="Cámara de campo">
        <div style={header}>
          <strong>Foto de campo</strong>
          <button type="button" style={ghostButton} onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        <div style={cameraFrame}>
          {preview ? (
            <img src={preview} alt="Vista previa" style={previewImage} />
          ) : (
            <video
              ref={videoRef}
              style={video}
              autoPlay
              muted
              playsInline
            />
          )}

          {error ? <div style={errorBox}>{error}</div> : null}
        </div>

        <label style={noteLabel}>
          Nota opcional
          <input
            value={note}
            maxLength={180}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ej.: pista junto al árbol, foto del equipo..."
            style={noteInput}
            disabled={busy}
          />
        </label>

        <div style={actions}>
          {preview ? (
            <>
              <button type="button" style={secondaryButton} onClick={() => setPreview('')} disabled={busy}>
                Repetir
              </button>
              <button type="button" style={primaryButton} onClick={() => void submitPhoto()} disabled={busy}>
                {busy ? 'Subiendo…' : 'Subir al mapa'}
              </button>
            </>
          ) : (
            <button type="button" style={primaryButton} onClick={captureFrame} disabled={busy || Boolean(error)}>
              Hacer foto
            </button>
          )}
        </div>

        <p style={helpText}>
          La foto se guarda en esta ubicación y será visible para todos los jugadores de la partida.
        </p>
      </section>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 7000,
  display: 'grid',
  alignItems: 'end',
  background: 'rgba(2,6,23,.46)',
  backdropFilter: 'blur(10px)',
}

const sheet: CSSProperties = {
  width: 'min(100%, 520px)',
  margin: '0 auto',
  padding: 14,
  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
  borderRadius: '24px 24px 0 0',
  border: '1px solid rgba(255,255,255,.16)',
  background: 'linear-gradient(180deg, rgba(15,23,42,.94), rgba(30,41,59,.96))',
  boxShadow: '0 -18px 48px rgba(0,0,0,.28)',
  color: '#fff',
  display: 'grid',
  gap: 12,
}

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
}

const ghostButton: CSSProperties = {
  minHeight: 34,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#e2e8f0',
  fontWeight: 900,
}

const cameraFrame: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '4 / 3',
  overflow: 'hidden',
  borderRadius: 20,
  background: '#020617',
  border: '1px solid rgba(255,255,255,.12)',
}

const video: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
}

const previewImage: CSSProperties = {
  ...video,
}

const errorBox: CSSProperties = {
  position: 'absolute',
  left: 12,
  right: 12,
  bottom: 12,
  padding: 10,
  borderRadius: 14,
  background: 'rgba(127,29,29,.88)',
  color: '#fee2e2',
  fontSize: 12,
  fontWeight: 800,
}

const noteLabel: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'rgba(226,232,240,.84)',
  fontSize: 11,
  fontWeight: 900,
}

const noteInput: CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#fff',
  padding: '0 12px',
  fontSize: 14,
  outline: 'none',
}

const actions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
}

const primaryButton: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(125,211,252,.32)',
  background: 'linear-gradient(135deg, rgba(14,165,233,.94), rgba(37,99,235,.90))',
  color: '#fff',
  fontSize: 14,
  fontWeight: 950,
}

const secondaryButton: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#e2e8f0',
  fontSize: 14,
  fontWeight: 950,
}

const helpText: CSSProperties = {
  margin: 0,
  color: 'rgba(226,232,240,.62)',
  fontSize: 11,
  lineHeight: 1.35,
}

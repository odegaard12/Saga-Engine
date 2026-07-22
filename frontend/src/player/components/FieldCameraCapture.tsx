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
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')

  useEffect(() => {
    if (typeof document === 'undefined') return

    if (!document.getElementById('saga-camera-grid-style')) {
      const style = document.createElement('style')
      style.id = 'saga-camera-grid-style'
      style.textContent = `
        .saga-camera-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 5;
          overflow: hidden;
        }
        .saga-camera-center-target {
          position: absolute;
          top: 50%; left: 50%;
          width: min(85vw, 320px); height: min(50vh, 340px);
          transform: translate(-50%, -50%);
          border: 2px solid rgba(255, 255, 255, 0.85);
          border-radius: 24px;
          box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.45);
        }
        .saga-camera-corner {
          position: absolute;
          width: 28px;
          height: 28px;
          border: 3px solid #38bdf8;
        }
        .saga-camera-corner--tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; border-top-left-radius: 20px; }
        .saga-camera-corner--tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; border-top-right-radius: 20px; }
        .saga-camera-corner--bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; border-bottom-left-radius: 20px; }
        .saga-camera-corner--br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; border-bottom-right-radius: 20px; }
        .saga-camera-hint {
          position: absolute;
          bottom: 12px; left: 0; right: 0;
          text-align: center;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 800;
          font-size: 13px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.8);
          letter-spacing: 0.08em;
        }
        .saga-shutter-btn {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          border: 4px solid #ffffff;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease;
          padding: 0;
        }
        .saga-shutter-btn:active {
          transform: scale(0.92);
        }
        .saga-shutter-inner {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!open) return

      setError('')
      setPreview('')
      setTorchSupported(false)
      setTorchOn(false)

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('La cámara no está disponible en este navegador.')
        return
      }

      try {
        streamRef.current?.getTracks().forEach((track) => track.stop())

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        const track = stream.getVideoTracks()[0]
        if (track && 'getCapabilities' in track) {
          try {
            const caps = track.getCapabilities() as any
            if (caps && caps.torch) {
              setTorchSupported(true)
            }
          } catch {}
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
      } catch {
        setError('No se pudo abrir la cámara. Revisa los permisos del navegador.')
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [open, facingMode])

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
    setPreview(canvas.toDataURL('image/jpeg', 0.9))
  }

  async function submitPhoto() {
    if (!preview || busy) return
    await onCapture(preview, note.trim())
    setPreview('')
    setNote('')
    onClose()
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const nextState = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: nextState } as any] })
      setTorchOn(nextState)
    } catch {
      setTorchOn(nextState)
    }
  }

  return (
    <div style={overlay}>
      <section style={sheet} aria-label="Cámara de campo">
        {/* Header bar */}
        <div style={header}>
          <strong style={headerTitle}>📸 Foto de campo</strong>
          <button type="button" style={closeBtnStyle} onClick={onClose} disabled={busy} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {/* Viewfinder frame (large height) */}
        <div style={cameraFrame}>
          {!preview ? (
            <div style={topControlsGroup}>
              {torchSupported ? (
                <button
                  type="button"
                  style={{
                    ...pillControlBtn,
                    background: torchOn ? '#facc15' : 'rgba(15,23,42,.70)',
                    color: torchOn ? '#000' : '#fff',
                    border: torchOn ? '1px solid #facc15' : '1px solid rgba(255,255,255,.25)'
                  }}
                  onClick={() => void toggleTorch()}
                  aria-label="Alternar Linterna"
                >
                  {torchOn ? '🔦 FLASH ON' : '🔦 FLASH OFF'}
                </button>
              ) : <div />}

              <button
                type="button"
                style={pillControlBtn}
                onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                aria-label="Cambiar cámara"
              >
                🔄 {facingMode === 'environment' ? 'Cam. Trasera' : 'Cam. Frontal'}
              </button>
            </div>
          ) : null}

          {preview ? (
            <img src={preview} alt="Vista previa" style={previewImage} />
          ) : (
            <video ref={videoRef} style={video} autoPlay muted playsInline />
          )}

          {error ? <div style={errorBox}>{error}</div> : null}
        </div>

        {/* Bottom controls / Note */}
        <div style={controlsBottomContainer}>
          <input
            value={note}
            maxLength={180}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Añade una nota a la foto (opcional)..."
            style={noteInput}
            disabled={busy}
          />

          <div style={shutterContainer}>
            {preview ? (
              <div style={previewActionsGroup}>
                <button
                  type="button"
                  style={secondaryBtnStyle}
                  onClick={() => setPreview('')}
                  disabled={busy}
                >
                  🔄 Repetir foto
                </button>
                <button
                  type="button"
                  style={primaryBtnStyle}
                  onClick={() => void submitPhoto()}
                  disabled={busy}
                >
                  {busy ? 'Subiendo…' : '✔ Guardar en mapa'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="saga-shutter-btn"
                onClick={captureFrame}
                disabled={busy || Boolean(error)}
                aria-label="Disparar foto"
                title="Disparar foto"
              >
                <div className="saga-shutter-inner" />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 7500,
  display: 'grid',
  placeItems: 'center',
  padding: 12,
  background: 'rgba(2, 6, 23, 0.65)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
}

const sheet: CSSProperties = {
  width: 'min(100%, 540px)',
  height: 'min(94vh, 760px)',
  margin: '0 auto',
  padding: 16,
  borderRadius: 24,
  border: '1px solid rgba(255, 255, 255, 0.22)',
  background: 'linear-gradient(180deg, rgba(100,116,139,.52), rgba(71,85,105,.42))',
  boxShadow: '0 25px 60px rgba(15,23,42,.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
  backdropFilter: 'blur(24px) saturate(1.12)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.12)',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 4px',
}

const headerTitle: CSSProperties = {
  fontSize: 17,
  fontWeight: 900,
  letterSpacing: '-0.02em',
  color: '#f8fafc',
}

const closeBtnStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.20)',
  background: 'rgba(255,255,255,.10)',
  color: '#f8fafc',
  fontWeight: 700,
  fontSize: 16,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
}

const cameraFrame: CSSProperties = {
  position: 'relative',
  flex: 1,
  width: '100%',
  minHeight: 280,
  borderRadius: 20,
  background: 'rgba(15, 23, 42, 0.4)',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  overflow: 'hidden',
}

const topControlsGroup: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  right: 12,
  zIndex: 10,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
}

const pillControlBtn: CSSProperties = {
  minHeight: 34,
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.25)',
  background: 'rgba(15,23,42,.70)',
  color: '#fff',
  fontWeight: 800,
  fontSize: 12,
  backdropFilter: 'blur(10px)',
  boxShadow: '0 2px 10px rgba(0,0,0,.3)',
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
  padding: 12,
  borderRadius: 14,
  background: 'rgba(127,29,29,.90)',
  color: '#fee2e2',
  fontSize: 13,
  fontWeight: 800,
  textAlign: 'center',
}

const controlsBottomContainer: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  alignItems: 'center',
  width: '100%',
}

const noteInput: CSSProperties = {
  width: '100%',
  minHeight: 44,
  borderRadius: 14,
  border: '1px solid rgba(255, 255, 255, 0.18)',
  background: 'rgba(15, 23, 42, 0.45)',
  color: '#fff',
  padding: '0 14px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const shutterContainer: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '100%',
  minHeight: 68,
}

const previewActionsGroup: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
  width: '100%',
}

const primaryBtnStyle: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(125,211,252,.35)',
  background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 950,
  cursor: 'pointer',
}

const secondaryBtnStyle: CSSProperties = {
  minHeight: 46,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.10)',
  color: '#e2e8f0',
  fontSize: 14,
  fontWeight: 950,
  cursor: 'pointer',
}

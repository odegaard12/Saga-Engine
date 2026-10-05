import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { IconoCamara } from './PlayerIcons'
import { useCubreElMapa } from '../hooks/useCubreElMapa'
import { codificarConTope, restriccionesDeCamara } from '../utils/calidadDeFoto'
import { reponerTrasTeclado } from '../utils/vistaTrasTeclado'

/**
 * La cámara y el teclado del iPhone (5.49).
 *
 * La capa es `.saga-raiz-movil` (mobile-shell.css): `fixed` con top/bottom, sin `vh` ni la medida del visual
 * viewport. Con 5.48 se medía con `--saga-area-alto`, y en iOS 26 el visual viewport se queda ~24 px corto tras
 * el teclado: la capa terminaba antes del borde y asomaba la franja bajo el disparador.
 *
 * La NOTA ya no es un campo pegado al disparador: abajo, iOS desplazaba toda la página para enseñarlo sobre el
 * teclado. Ahora «Añadir nota» abre una hoja ARRIBA de la tarjeta (donde el teclado no tapa, así que no hay que
 * desplazar nada) con su propio desplazamiento interno. Todos los cierres pasan por `cerrarNota()`: primero quita
 * el foco (quitar del DOM un campo enfocado no lanza `focusout` en iOS) y luego pide reponer la vista.
 */

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
  // Cámara a pantalla completa: el mapa de detrás no necesita latir.
  useCubreElMapa(open)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [montada, setMontada] = useState(open)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    if (open) {
      setMontada(true)
      setSaliendo(false)
      return undefined
    }
    if (!montada) return undefined
    setSaliendo(true)
    // Red de seguridad holgada: quien manda es `onTransitionEnd`. Un
    // temporizador que dure lo mismo que la transicion la corta siempre,
    // porque la transicion arranca un fotograma mas tarde.
    const id = window.setTimeout(() => {
      setMontada(false)
      setSaliendo(false)
    }, 700)
    return () => window.clearTimeout(id)
  }, [open, montada])

  // Al cerrarse (por la X, al guardar o desde fuera): fuera el foco de la nota y la pantalla a su sitio. En iOS el
  // teclado dejaba la página corrida y, al quitar la cámara con el campo enfocado, nadie lo reponía.
  const estabaAbierta = useRef(open)
  useEffect(() => {
    if (estabaAbierta.current && !open) reponerTrasTeclado()
    estabaAbierta.current = open
  }, [open])

  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const [note, setNote] = useState('')
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [editandoNota, setEditandoNota] = useState(false)
  const notaRef = useRef<HTMLTextAreaElement | null>(null)

  /** Abre la hoja de la nota y enfoca el campo DENTRO del toque: iOS sólo saca el teclado así. */
  function abrirNota() {
    if (busy) return
    flushSync(() => setEditandoNota(true))
    notaRef.current?.focus({ preventScroll: true })
  }

  /** Único cierre de la nota (Hecho, Intro, tocar fuera, X, guardar, cerrar la cámara). */
  function cerrarNota() {
    notaRef.current?.blur()
    setEditandoNota(false)
    reponerTrasTeclado()
  }

  // Si la cámara se cierra desde fuera con la nota abierta, la hoja se va con ella (sin el foco antes).
  useEffect(() => {
    if (!open && editandoNota) {
      notaRef.current?.blur()
      setEditandoNota(false)
    }
  }, [open, editandoNota])

  // Si la cámara desaparece entera (la quita PlayerApp) con la nota enfocada: el foco fuera ANTES de quitar el
  // DOM (efecto de maquetación: corre antes de que React desmonte los nodos), porque después iOS ya no avisa.
  useLayoutEffect(
    () => () => {
      const campo = notaRef.current
      if (campo && document.activeElement === campo) campo.blur()
      if (estabaAbierta.current) reponerTrasTeclado()
    },
    []
  )

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
          border: 3px solid rgb(var(--theme-info));
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
          background: linear-gradient(135deg, rgb(var(--theme-info)) 0%, #0284c7 100%);
          box-shadow: 0 0 12px rgba(var(--theme-info), 0.6);
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

        // Trasera y lo más grande que dé el móvil (hasta 4K): ver utils/calidadDeFoto.
        const stream = await navigator.mediaDevices.getUserMedia(restriccionesDeCamara(facingMode))

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

  /**
   * "La camara se abre y se cierra muy brusco".
   *
   * Era `if (!open) return null`: el mismo fallo, por cuarta vez en este
   * repositorio. Cerrar no es una animacion, es un borrado: el panel mas
   * grande de la pantalla desaparecia de un fotograma al siguiente. Y al
   * abrir, la tarjeta SI tenia entrada, pero el fondo oscuro y desenfocado
   * -que es lo que ocupa toda la pantalla- se plantaba de golpe.
   *
   * Mismo patron que SwipeableSheet y FieldPrepPanel: se queda montada
   * mientras sale, el fondo entra y sale con ella, y quien decide cuando
   * desmontar es `onTransitionEnd`, no un cronometro corriendo una carrera
   * contra la transicion.
   */
  if (!montada) return null

  /**
   * Dibuja el original en un canvas de hasta 2048 px de lado y lo codifica a
   * JPEG 0,85 (bajando calidad sólo si se pasa del tope del servidor). El
   * reencode quita el EXIF: ubicación y modelo del móvil no viajan.
   */
  function codificarFoto(fuente: CanvasImageSource, ancho: number, alto: number): string | null {
    return codificarConTope(ancho, alto, (w, h, calidad) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(fuente, 0, 0, w, h)
      return canvas.toDataURL('image/jpeg', calidad)
    }).dataUrl || null
  }

  /** Foto de verdad a resolución completa del sensor, si el navegador la ofrece. */
  async function tomarFotoCompleta(): Promise<string | null> {
    const track = streamRef.current?.getVideoTracks()[0]
    const Captura = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } })
      .ImageCapture
    if (!track || !Captura || track.readyState !== 'live') return null
    try {
      const blob = await new Captura(track).takePhoto()
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      try {
        return codificarFoto(bitmap, bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    } catch {
      return null
    }
  }

  async function captureFrame() {
    const video = videoRef.current
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setError('La cámara aún no está lista.')
      return
    }

    // Primero la foto completa (ImageCapture); si no hay, el fotograma del vídeo.
    const completa = await tomarFotoCompleta()
    if (completa) {
      setPreview(completa)
      return
    }
    const fotograma = codificarFoto(video, video.videoWidth, video.videoHeight)
    if (!fotograma) {
      setError('No se pudo preparar la foto.')
      return
    }
    setPreview(fotograma)
  }

  async function submitPhoto() {
    if (!preview || busy) return
    cerrarNota()
    await onCapture(preview, note.trim())
    setPreview('')
    setNote('')
    cerrar()
  }

  function cerrar() {
    cerrarNota()
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
    <div
      data-saga-anim="camara-capa"
      className="saga-raiz-movil"
      style={{
        ...overlay,
        opacity: saliendo ? 0 : 1,
        animation: saliendo
          ? 'none'
          : 'sagaCapaEntra var(--saga-motion-entra) var(--saga-motion-curva)',
      }}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.propertyName !== 'opacity') return
        if (!saliendo) return
        setMontada(false)
        setSaliendo(false)
      }}
    >
      <section
        data-saga-anim="camara-tarjeta"
        style={{
          ...sheet,
          transform: saliendo ? 'translateY(14px) scale(.97)' : 'translateY(0) scale(1)',
          opacity: saliendo ? 0 : 1,
          transition: saliendo
            ? 'transform var(--saga-motion-sale) var(--saga-curva-sale), opacity var(--saga-motion-sale) var(--saga-curva-sale)'
            : undefined,
          animation: saliendo ? 'none' : sheet.animation,
        }}
        aria-label="Cámara de campo"
      >
        {editandoNota ? (
          <div
            data-saga-nota-hoja=""
            style={notaVelo}
            onPointerDown={(event) => {
              // Tocar fuera de la hoja la cierra (y quita el teclado).
              if (event.target === event.currentTarget) cerrarNota()
            }}
          >
            <div style={notaHoja} role="dialog" aria-label="Nota de la foto">
              <div style={notaCabecera}>
                <strong style={{ fontSize: 15 }}>Nota de la foto</strong>
                <button
                  type="button"
                  style={notaHecho}
                  // Sin esto el toque quita el foco ANTES del clic y el botón se mueve bajo el dedo.
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={cerrarNota}
                >
                  Hecho
                </button>
              </div>
              <textarea
                ref={notaRef}
                value={note}
                maxLength={180}
                rows={3}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={(event) => {
                  // «Hecho»/Intro del teclado: fuera teclado y la pantalla a su sitio.
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    cerrarNota()
                  }
                }}
                // La barra del teclado de iOS («Hecho» de arriba) sólo quita el foco: también cierra la hoja.
                onBlur={cerrarNota}
                enterKeyHint="done"
                placeholder="Añade una nota a la foto (opcional)..."
                style={noteInput}
                disabled={busy}
              />
            </div>
          </div>
        ) : null}
        {/* Header bar */}
        <div style={header}>
          <strong style={headerTitle}>
            <IconoCamara size={18} /> Foto de campo
          </strong>
          <button type="button" style={closeBtnStyle} onClick={cerrar} disabled={busy} aria-label="Cerrar">
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
                    background: torchOn ? '#facc15' : 'rgba(var(--theme-ink), .70)',
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
          <button
            type="button"
            data-saga-nota-boton=""
            style={note ? notaBotonConTexto : notaBoton}
            onClick={abrirNota}
            disabled={busy}
            aria-label={note ? `Editar nota: ${note}` : 'Añadir nota'}
          >
            <span aria-hidden="true">📝</span>
            <span style={notaBotonTexto}>{note || 'Añadir nota'}</span>
          </button>

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
                onClick={() => void captureFrame()}
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
  // Posición y tamaño: `.saga-raiz-movil` (fixed con top/bottom, ver mobile-shell.css). Nada de vh aquí.
  zIndex: 7500,
  display: 'grid',
  placeItems: 'center',
  padding:
    'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
  boxSizing: 'border-box',
  overscrollBehavior: 'contain',
  // Fondo difuminado, como el prologo y "antes de salir".
  background: 'rgba(var(--theme-ink-deep), .84)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  transition: 'opacity var(--saga-motion-sale) var(--saga-curva-sale)',
}

// Tarjeta solida del diseño "B", como el resto: era el ultimo panel grande
// que seguia con el cristal viejo -degradado, borde y desenfoque-.
const sheet: CSSProperties = {
  position: 'relative',
  width: 'min(100%, 420px)',
  // Todo el alto del área visible (menos el margen), nunca más: el disparador queda siempre a la vista.
  height: '100%',
  maxHeight: 760,
  minHeight: 0,
  boxSizing: 'border-box',
  margin: '0 auto',
  padding: 16,
  borderRadius: 18,
  border: 0,
  background: 'var(--theme-card)',
  boxShadow: 'var(--theme-card-shadow)',
  animation: 'sagaPanelEntra var(--saga-motion-entra) var(--saga-motion-curva)',
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
  borderRadius: 'var(--theme-radius-pill)',
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
  minHeight: 160,
  borderRadius: 14,
  background: 'var(--theme-card-inset)',
  border: 0,
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
  minHeight: 36,
  padding: '0 14px',
  borderRadius: 10,
  border: 0,
  background: 'var(--theme-card)',
  color: '#fff',
  fontWeight: 800,
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,.45)',
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
  borderRadius: 'var(--theme-radius-card)',
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
  minHeight: 72,
  maxHeight: 140,
  resize: 'none',
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  background: 'rgba(var(--theme-ink), 0.45)',
  color: '#fff',
  padding: '10px 14px',
  // 16 px: con menos, iOS amplía la página al enfocar.
  fontSize: 16,
  lineHeight: 1.35,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const notaBoton: CSSProperties = {
  width: '100%',
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 14px',
  borderRadius: 'var(--theme-radius-card)',
  border: '1px dashed rgba(255, 255, 255, 0.28)',
  background: 'rgba(var(--theme-ink), 0.35)',
  color: 'rgba(255,255,255,.82)',
  fontSize: 14,
  fontWeight: 800,
  textAlign: 'left',
  cursor: 'pointer',
  boxSizing: 'border-box',
}

const notaBotonConTexto: CSSProperties = {
  ...notaBoton,
  border: '1px solid rgba(255, 255, 255, 0.18)',
  color: '#fff',
  fontWeight: 600,
}

const notaBotonTexto: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** Velo de la hoja de la nota: cubre la tarjeta; la hoja va ARRIBA, lejos del teclado. */
const notaVelo: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  padding: 12,
  borderRadius: 18,
  background: 'rgba(var(--theme-ink-deep), .62)',
  overflow: 'hidden',
  overscrollBehavior: 'contain',
}

const notaHoja: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: 'var(--theme-card)',
  boxShadow: 'var(--theme-card-shadow)',
  maxHeight: '100%',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  boxSizing: 'border-box',
  animation: 'sagaPanelEntra var(--saga-motion-entra) var(--saga-motion-curva)',
}

const notaCabecera: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  color: '#f8fafc',
}

const notaHecho: CSSProperties = {
  minHeight: 36,
  padding: '0 16px',
  borderRadius: 'var(--theme-radius-pill)',
  border: 0,
  background: 'rgb(var(--theme-info))',
  color: '#fff',
  fontWeight: 900,
  fontSize: 14,
  cursor: 'pointer',
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
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid rgba(var(--theme-info-soft), .35)',
  background: 'linear-gradient(135deg, rgb(var(--theme-info)) 0%, #2563eb 100%)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 950,
  cursor: 'pointer',
}

const secondaryBtnStyle: CSSProperties = {
  minHeight: 46,
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.10)',
  color: '#e2e8f0',
  fontSize: 14,
  fontWeight: 950,
  cursor: 'pointer',
}

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { marcarInicioQr, pecharQr } from '../qrClock'
import { createPortal } from 'react-dom'
import jsQR from 'jsqr'
import { recognizeSagaSticker } from '../offline/qrLogoRecovery'
import { warmUpQrEngine } from '../offline/qrWorkerClient'
import { collectInventoryItem } from '../offline/inventory'
import { sounds, haptics } from '../utils/haptics'

interface QuickProofPanelProps {
  user: string
  mobile: boolean
  hidden: boolean
  openSignal?: number
  showLauncher?: boolean
  /** Payloads QR de la misión, para reconocer pegatinas tapadas por el logo. */
  knownPayloads?: string[]
  /** Envía el código de respaldo del nodo con el tiempo de cámara, sin penalización. */
  onRescueCode?: (code: string, timeSpentMs: number) => Promise<boolean> | boolean | void
  /** Código impreso en la pegatina del nodo que toca ahora, si lo tiene. */
  activeQrPayload?: string | null
  /**
   * Se llama cuando la pegatina escaneada es la del nodo activo.
   * Devuelve si el nodo llegó a superarse, para no cantar victoria en falso.
   */
  onQrValidated?: (code: string, timeSpentMs: number) => Promise<boolean> | boolean | void
}

type ParsedQrItem = {
  item_id: string
  label: string
  raw: string
  kind: 'item' | 'proof' | 'text'
  format: 'saga_item' | 'saga_proof' | 'plain_text' | 'url'
}

/** Normaliza un código para compararlo: mayúsculas, sin espacios ni guiones. */
function normalizeCode(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '')
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
  knownPayloads = [],
  onRescueCode,
  activeQrPayload = null,
  onQrValidated,
}: QuickProofPanelProps) {
  const knownPayloadsRef = useRef<string[]>(knownPayloads)
  knownPayloadsRef.current = knownPayloads
  const activePayloadRef = useRef<string | null>(activeQrPayload)
  activePayloadRef.current = activeQrPayload
  const recoveryBusyRef = useRef(false)
  const recoveryLastRef = useRef<string | null>(null)
  // Cronómetro del escáner: arranca al abrir la cámara y para al leer.
  const [scanElapsedMs, setScanElapsedMs] = useState(0)
  const scanStartRef = useRef<number | null>(null)
  const [mode, setMode] = useState<'idle' | 'qr'>('idle')
  /** Pegatina leída y nodo registrado: cartel a pantalla completa. */
  const [completado, setCompletado] = useState(false)
  /** La X roja de foto descartada: un segundo y a por otra. */
  const [fotoFallida, setFotoFallida] = useState(false)

  const [message, setMessage] = useState(
    'Escanea una tarjeta QR de SAGA. Se guardará automáticamente en Objetos.'
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeTone, setNoticeTone] = useState<'success' | 'info'>('info')
  const [scanning, setScanning] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [analysing, setAnalysing] = useState(false)

  useEffect(() => {
    if (typeof document === 'undefined') return

    if (!document.getElementById('saga-qr-scanner-style')) {
      const style = document.createElement('style')
      style.id = 'saga-qr-scanner-style'
      style.textContent = `
        /* Se oculta SIN sacarlo del flujo. Con display:none la barra dejaba de
           ocupar sitio, el mapa se reajustaba, y al cerrar el escáner volvía a
           aparecer de golpe estirándose durante un par de segundos. Así el
           hueco se mantiene y la vuelta es un fundido, no un salto. */
        [data-saga-player-hud="bottom"] {
          transition: opacity 140ms ease;
        }
        body.saga-qr-scanner-open [data-saga-player-hud="bottom"] {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        /* El visor es cuadrado y con object-fit: cover, así que enseña justo
           el cuadrado central del fotograma, que es lo que se analiza. El marco
           va al 90% como guía de encuadre, no como recorte: el análisis prueba
           el cuadro entero y luego versiones más cerradas. */
        .saga-scanner-viewfinder {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          aspect-ratio: 1 / 1;
          max-height: 90%;
          border: 2px solid rgba(74, 222, 128, 0.55);
          border-radius: 18px;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
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
        @keyframes sagaNoticeIn {
          from { transform: translateX(-50%) translateY(-14px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes sagaScannerPulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.3); opacity: 0.8; }
        }
        /* La línea de barrido se declaraba en el JSX pero no existía en CSS:
           no se pintaba nada. Se anima con porcentajes para que valga sea cual
           sea el tamaño del visor. */
        @keyframes sagaCarteEntra {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sagaMarcaEntra {
          from { opacity: 0; transform: scale(.55); }
          to { opacity: 1; transform: scale(1); }
        }
        .saga-scanner-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, #4ade80, transparent);
          box-shadow: 0 0 16px rgba(74, 222, 128, 0.75);
          pointer-events: none;
          z-index: 3;
          animation: sagaScanline 2.6s infinite ease-in-out;
        }
        @keyframes sagaScanline {
          0% { top: 2%; opacity: 0; }
          12% { opacity: 0.95; }
          88% { opacity: 0.95; }
          100% { top: 97%; opacity: 0; }
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

    const timer = window.setTimeout(() => setNotice(null), noticeTone === 'success' ? 3200 : 2200)
    return () => window.clearTimeout(timer)
  }, [notice, noticeTone])

  useEffect(() => {
    if (!scanning) return
    const id = window.setInterval(() => {
      if (scanStartRef.current !== null) {
        const vai = Date.now() - scanStartRef.current
        setScanElapsedMs(vai)

        // Las pegatinas con el logo grande no las lee el analisis continuo: a
        // los tres segundos se deja de esperar y se pide la foto, que es lo que
        // de verdad las valida.
        if (vai > 3000) {
          setMessage('Non se le soa: pulsa 📸 Facer foto e validar.')
        }
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [scanning])

  async function captureAndAnalyse() {
    const video = videoRef.current
    if (!video || !streamRef.current || analysing) return

    const vw = video.videoWidth || 1280
    const vh = video.videoHeight || 720

    /**
     * Recorte cuadrado centrado a una fracción del fotograma.
     *
     * Se prueban varias: medido sobre las fotos reales de campo, la misma
     * pegatina que a fotograma completo daba 100% de coincidencia NO se
     * localizaba siquiera recortando al 72%. El encuadre del jugador no va a
     * ser perfecto, así que se le dan varias oportunidades en vez de una.
     */
    function cropSquare(fraction: number): ImageData | null {
      const side = Math.floor(Math.min(vw, vh) * fraction)
      const cx = Math.floor((vw - side) / 2)
      const cy = Math.floor((vh - side) / 2)

      const shot = document.createElement('canvas')
      // Por encima de ~900 px no se gana lectura y sí se gasta memoria.
      const work = Math.min(side, 900)
      shot.width = work
      shot.height = work
      const ctx = shot.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null

      ctx.drawImage(video!, cx, cy, side, side, 0, 0, work, work)
      return ctx.getImageData(0, 0, work, work)
    }

    const image = cropSquare(0.72)
    if (!image) return

    // OJO: los recortes se toman AHORA, con la cámara viva. Más abajo se para
    // el vídeo para liberar memoria antes de cargar el motor, y a partir de ahí
    // el elemento <video> ya no entrega fotogramas.
    const candidates = [cropSquare(1), cropSquare(0.85), image].filter(
      (candidate): candidate is ImageData => candidate !== null
    )

    // 1) Lectura normal: si el código es sano, se resuelve aquí sin más.
    const direct = jsQR(image.data, image.width, image.height, {
      inversionAttempts: 'attemptBoth',
    })
    if (direct?.data) {
      void saveQrItem(direct.data)
      return
    }

    if (knownPayloadsRef.current.length === 0) {
      setMessage('No se pudo leer el código. Usa el código de respaldo.')
      haptics.error()
      return
    }

    // 2) Pegatinas con el logo encima: hace falta el motor de visión. Se para
    //    la cámara ANTES de cargarlo; con el vídeo activo el móvil se queda
    //    sin memoria y la página se cierra.
    setAnalysing(true)
    setMessage('Analizando la foto... un momento.')
    stopCamera()

    try {
      /**
       * Cinco segundos y se vuelve a la camara.
       *
       * Si la foto sale movida o la pegatina no se ve entera, el motor de
       * vision puede tirarse mucho rato buscando algo que no esta, y la
       * pantalla se quedaba en "Analizando..." sin salida: el jugador no sabia
       * si esperar o no. Cinco segundos es de sobra para una foto buena.
       *
       * El reloj del nodo sigue corriendo mientras tanto, que para eso es la
       * prueba: no se para por reintentar.
       */
      const reconocer = (async () => {
        // De más ancho a más cerrado: el fotograma completo es el que mejor
        // funciona cuando la pegatina no queda perfectamente centrada.
        for (const candidate of candidates) {
          const encontrado = await recognizeSagaSticker(candidate, knownPayloadsRef.current)
          if (encontrado) return encontrado
        }
        return null
      })()

      const seAcabouOTempo = Symbol('tarde')
      const resultado = await Promise.race([
        reconocer,
        new Promise<typeof seAcabouOTempo>((resolve) =>
          window.setTimeout(() => resolve(seAcabouOTempo), 5000)
        ),
      ])

      if (resultado === seAcabouOTempo || !resultado) {
        /**
         * Foto descartada: una X un segundo y otra vez a la camara.
         *
         * Sin la X el jugador no sabia si la foto habia fallado o si la
         * camara se habia reabierto sola por otra cosa. Un segundo es lo justo
         * para verla sin que estorbe: la prueba sigue corriendo.
         */
        setMessage(
          resultado === seAcabouOTempo
            ? 'No se ve bien. Otra foto, más cerca y sin mover.'
            : 'Esa no es. Otra foto.'
        )
        haptics.error()
        setAnalysing(false)
        setFotoFallida(true)
        window.setTimeout(() => {
          setFotoFallida(false)
          void startQrScan()
        }, 1000)
        return
      }

      setMessage('Pegatina reconocida.')
      void saveQrItem(resultado as string)
      return
    } catch {
      setMessage('Fallo al analizar. Escribe el código abajo.')
    } finally {
      setAnalysing(false)
    }
  }

  async function saveQrItem(value: string) {
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

      // La pegatina del nodo que toca no es sólo un objeto: es la prueba de
      // haber llegado, así que completa el nodo. Sin esto el jugador veía
      // "guardado" y se quedaba atascado en el mismo punto.
      const active = normalizeCode(activePayloadRef.current)
      const scanned = normalizeCode(parsed.raw) || normalizeCode(parsed.label)
      const completesNode = Boolean(active) && active === scanned

      /**
       * La confirmación se da AQUÍ, en la propia cámara, y se cierra sola.
       *
       * Antes había además una pantalla intermedia con un botón y un aviso
       * suelto por encima del mapa: tres confirmaciones para lo mismo, y la de
       * abajo dejaba la barra de clasificación descolocada un par de segundos.
       * Con lo que dice la cámara sobra.
       */
      setMessage(
        completesNode
          ? 'Pegatina correcta. Rexistrando o nodo…'
          : `Gardado en Obxectos. Tes ${snapshot.items.length} tipo${snapshot.items.length === 1 ? '' : 's'} de obxecto.`
      )
      // Exacto desde el ref, no del estado: scanElapsedMs se refresca cada
      // 200 ms y en una lectura rápida se quedaba corto.
      const elapsed = scanStartRef.current ? Date.now() - scanStartRef.current : scanElapsedMs
      scanStartRef.current = null

      // Nodo resuelto: el reloj para aquí, al validar.
      try {
        pecharQr(user, activeQrPayload || 'nodo')
      } catch {
        /* nada */
      }
      sounds.qrScan()
      haptics.qrScan()
      stopCamera()

      let cerrarSolo = true

      if (completesNode) {
        // Sin penalización: ha encontrado la pegatina de verdad.
        //
        // Se ESPERA el resultado. Antes se lanzaba y se daba por hecho: si el
        // avance no llegaba a producirse, el jugador leía "nodo completado" y
        // seguía en el mismo nodo, y tenía que volver a escanear.
        const avanzou = await onQrValidated?.(parsed.raw, elapsed)

        if (avanzou === false) {
          // Esto sí se queda en pantalla: hay que hacer algo.
          cerrarSolo = false
          setMessage(
            'Lin a pegatina, pero o nodo non chegou a rexistrarse. ' +
              'Proba outra vez ou usa o código de respaldo.'
          )
        } else {
          setMessage('Pegatina correcta. Nodo completado.')
        }
      }

      /**
       * La ventana ya no se cierra sola.
       *
       * Se cerraba en poco más de un segundo y, con la cámara tardando en
       * leer, lo que veía el jugador era: apunto, espero, y se cierra sin
       * decirme nada. Ahora se queda el cartel hasta que se pulse Continuar.
       */
      if (cerrarSolo) {
        setCompletado(true)
      }
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

  /**
   * Sólo se abre la cámara con una señal EMITIDA DESPUÉS de montarnos.
   *
   * Este panel sólo se renderiza cuando no hay ninguna hoja abierta, así que
   * cada vez que se cierra un nodo el componente se vuelve a montar y este
   * efecto se ejecutaba otra vez con el openSignal viejo: al salir del
   * laberinto o de Caza-Señales se abría sola la cámara pidiendo escanear la
   * pegatina de un nodo ya superado. En el nodo coleccionable siguiente
   * secuestraba el flujo y la recogida no llegaba a completarse.
   *
   * openSignal es un Date.now(), así que comparar contra el momento de montaje
   * distingue una señal nueva de una heredada.
   */
  const mountedAtRef = useRef(Date.now())

  useEffect(() => {
    if (!openSignal || hidden) return
    if (openSignal < mountedAtRef.current) return
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
    setNotice('')
    setMessage('')
    setTorchSupported(false)
    setTorchOn(false)
    setMessage('Apunta la cámara a la tarjeta QR de SAGA.')
    setScanning(true)
    // El motor de visión se calienta en un WORKER aparte: aislado así, aunque
    // se quede sin memoria muere el worker y la app sigue en pie.
    warmUpQrEngine()
    /**
     * El reloj de la pegatina se guarda por nodo y NO vuelve a cero.
     *
     * Cerrar la cámara y volver a abrirla reiniciaba la cuenta: buscar la
     * pegatina cinco minutos y luego abrir la cámara un momento salía como
     * treinta segundos. Ahora el instante de arranque vive con el nodo, así que
     * cuenta desde la primera vez que se abrió la cámara en ese nodo.
     */
    // El reloj ya viene marcado desde que se llegó al nodo: buscar la pegatina
    // por el monte ES la prueba. Aquí sólo se lee; marcar es por si acaso.
    scanStartRef.current = marcarInicioQr(user, activeQrPayload || 'nodo')
    setScanElapsedMs(0)

    try {
      // Resolución alta: las pegatinas del monte son pequeñas y a 640x480 el
      // QR ocupa demasiados pocos píxeles para decodificarse.
      const stream = await window.navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // @ts-expect-error focusMode no está en los tipos estándar
          focusMode: 'continuous',
        },
        audio: false,
      })

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
        await videoRef.current.play()
      }

      // Bucle de escaneo con presupuesto de CPU.
      //
      // Antes esto corría en CADA fotograma y llamaba a jsQR hasta 4 veces
      // sobre imágenes de 1920x1080. Cada pasada son millones de píxeles: el
      // hilo principal se quedaba bloqueado y la app se petaba al abrir la
      // cámara. Ahora se remuestrea a un lienzo pequeño, se limita a ~8
      // análisis por segundo y las pasadas caras se alternan.
      const WORK = 480
      const work = document.createElement('canvas')
      work.width = WORK
      work.height = WORK
      const workCtx = work.getContext('2d', { willReadFrequently: true })

      let lastScanAt = 0
      let pass = 0

      const scan = () => {
        const video = videoRef.current

        if (!video || !workCtx || !streamRef.current) {
          frameRef.current = window.requestAnimationFrame(scan)
          return
        }

        const now = performance.now()
        if (now - lastScanAt < 120 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          frameRef.current = window.requestAnimationFrame(scan)
          return
        }
        lastScanAt = now
        pass += 1

        const vw = video.videoWidth || 640
        const vh = video.videoHeight || 480
        const side = Math.floor(Math.min(vw, vh) * 0.72)
        const cx = Math.floor((vw - side) / 2)
        const cy = Math.floor((vh - side) / 2)

        // Recorte central remuestreado: mucha resolución efectiva sobre el QR
        // sin procesar el fotograma entero.
        workCtx.drawImage(video, cx, cy, side, side, 0, 0, WORK, WORK)
        const image = workCtx.getImageData(0, 0, WORK, WORK)

        let result = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        })

        // Pasadas caras alternadas para no saturar el móvil
        if (!result?.data && pass % 2 === 0) {
          result = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'attemptBoth',
          })
        }

        if (!result?.data && pass % 3 === 0) {
          const data = image.data
          let sum = 0
          for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
          }
          const mean = sum / (data.length / 4)
          const boosted = new Uint8ClampedArray(data)
          for (let i = 0; i < boosted.length; i += 4) {
            const lum = (boosted[i] * 299 + boosted[i + 1] * 587 + boosted[i + 2] * 114) / 1000
            const v = lum > mean ? 255 : 0
            boosted[i] = v
            boosted[i + 1] = v
            boosted[i + 2] = v
          }
          result = jsQR(boosted, image.width, image.height, {
            inversionAttempts: 'attemptBoth',
          })
        }

        if (result?.data) {
          void saveQrItem(result.data)
          return
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

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] })
      setTorchOn(!torchOn)
    } catch {}
  }

  if (!showLauncher && mode === 'idle' && !notice) return null

  // El panel se saca a document.body con un portal.
  //
  // El contenedor de los botones del mapa usa transform y backdrop-filter, y
  // ambos crean bloque contenedor para los descendientes con position: fixed.
  // Por eso el escáner se anclaba a esa píldora de abajo y salía cortado en el
  // borde inferior en vez de ocupar la pantalla.
  // La pantalla intermedia de "escaneado e listo" ya no existe: la cámara dice
  // el resultado y se cierra sola. Eran tres confirmaciones para lo mismo.
  const scannerPanel =
    mode === 'qr' ? (

      <div style={scannerBackdrop}>
        {completado ? (
          <div style={carteFondo}>
            <div style={carteCaixa}>
              <div style={carteMarca}>✓</div>
              <strong style={carteTitulo}>PEGATINA VALIDADA</strong>
              <p style={carteTexto}>O nodo quedou rexistrado. Bo traballo.</p>
              <button
                type="button"
                style={carteBoton}
                onClick={() => {
                  setCompletado(false)
                  setMode('idle')
                }}
              >
                Continuar
              </button>
            </div>
          </div>
        ) : null}

        {fotoFallida ? (
          <div style={carteFondo}>
            <div style={{ ...carteCaixa, borderColor: 'rgba(239,68,68,.42)' }}>
              <div
                style={{
                  ...carteMarca,
                  color: '#fecaca',
                  borderColor: 'rgba(239,68,68,.5)',
                  background: 'rgba(127,29,29,.34)',
                }}
              >
                ✕
              </div>
              <strong style={{ ...carteTitulo, color: '#fecaca' }}>FOTO DESCARTADA</strong>
              <p style={carteTexto}>Outra vez, máis preto e sen mover.</p>
            </div>
          </div>
        ) : null}

        <section style={panel}>
          <header style={panelHead}>
            <div>
              <div style={eyebrow}>ESCÁNER DE CAMPO</div>
              <strong style={panelTitle}>Pegatina SAGA</strong>
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
          </header>

          <div style={scannerStage}>
          <div style={scannerBox}>
            <video ref={videoRef} style={videoStyle} playsInline muted />
            {torchSupported ? (
              <button
                type="button"
                style={torchButton}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleTorch()
                }}
                aria-label="Alternar Linterna"
              >
                {torchOn ? '🔦 ON' : '🔦 OFF'}
              </button>
            ) : null}
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
            {scanning ? (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  zIndex: 5,
                  background: 'rgba(2,6,23,.72)',
                  border: '1px solid rgba(74,222,128,.4)',
                  borderRadius: 999,
                  padding: '4px 11px',
                  color: '#4ade80',
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: '.04em',
                }}
              >
                ⏱ {(scanElapsedMs / 1000).toFixed(1)}s
              </div>
            ) : null}
          </div>
          </div>

          <div style={footer}>
            <div style={hintText}>
              {analysing
                ? 'Analizando la pegatina...'
                : scanning
                  ? 'Encuadra la pegatina, acércate y pulsa 📸. Las pegatinas con logo sólo se leen con la foto.'
                  : 'Activando la cámara...'}
            </div>

          {/* Analizar un fotograma a máxima resolución bajo demanda: es más
              preciso que el análisis continuo, que trabaja reducido. */}
          <button
            type="button"
            style={captureButton}
            disabled={!scanning || analysing}
            onClick={() => void captureAndAnalyse()}
          >
            {analysing ? '⏳ Analizando...' : '📸 Hacer foto y validar'}
          </button>

          {/* Código de RESCATE del nodo, siempre visible. No guarda un objeto:
              completa el nodo igual que el código de emergencia de la ficha, y
              por eso lleva la penalización de 2 minutos. */}
          <div style={rescueBox}>
            <div style={rescueTitle}>🔑 ¿Atascado? Escribe el código de respaldo</div>
            <div style={rescueNote}>Suma 2 minutos a tu tiempo.</div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const clean = manualCode.trim().toUpperCase()
                if (!clean) return
                setManualCode('')
                stopCamera()
                setMode('idle')
                // Sólo el tiempo que estuvo abierta la cámara. Los 2 minutos de
                // penalización los suma quien recibe esto, aparte: si se metían
                // aquí también, se contaban dos veces (4 minutos por un respaldo).
                void onRescueCode?.(clean, scanElapsedMs || 0)
              }}
              style={manualRow}
            >
              <input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Ej. SAGA_QR_1"
                style={manualInput}
                autoCapitalize="characters"
                autoCorrect="off"
              />
              <button type="submit" style={manualButton} disabled={!manualCode.trim()}>
                Enviar
              </button>
            </form>
          </div>
          </div>
        </section>
      </div>
    ) : null

  return (
    <div style={getWrapperStyle(mobile)} aria-label="Escaneo QR de campo">
      {notice ? (
        <div style={noticeBox(noticeTone)} role="status">
          <span style={noticeIcon}>{noticeTone === 'success' ? '✅' : 'ℹ️'}</span>
          <div style={noticeCopy}>
            <strong style={noticeTitle}>
              {noticeTone === 'success' ? 'Pegatina validada' : 'Escáner'}
            </strong>
            <span style={noticeText}>{notice}</span>
          </div>
        </div>
      ) : null}

      {scannerPanel && typeof document !== 'undefined'
        ? createPortal(scannerPanel, document.body)
        : null}

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

const carteFondo: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 40,
  display: 'grid',
  placeItems: 'center',
  padding: 22,
  background: 'radial-gradient(circle at 50% 40%, rgba(6,40,26,.62), rgba(2,6,23,.82))',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  animation: 'sagaCarteEntra 220ms ease-out',
}

const carteCaixa: CSSProperties = {
  width: 'min(100%, 330px)',
  display: 'grid',
  justifyItems: 'center',
  gap: 10,
  padding: '24px 20px 20px',
  borderRadius: 26,
  border: '1px solid rgba(74,222,128,.45)',
  background: 'linear-gradient(180deg, rgba(30,58,44,.78), rgba(15,32,24,.78))',
  backdropFilter: 'blur(20px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 24px 56px rgba(2,6,23,.55)',
  textAlign: 'center',
}

const carteMarca: CSSProperties = {
  width: 64,
  height: 64,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 999,
  border: '2px solid rgba(74,222,128,.6)',
  background: 'rgba(74,222,128,.18)',
  color: '#bbf7d0',
  fontSize: 32,
  fontWeight: 900,
  animation: 'sagaMarcaEntra 340ms cubic-bezier(.34,1.56,.64,1)',
}

const carteTitulo: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: '.06em',
  color: '#f0fdf4',
}

const carteTexto: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.4,
  color: 'rgba(209,250,229,.8)',
}

const carteBoton: CSSProperties = {
  marginTop: 6,
  width: '100%',
  minHeight: 46,
  borderRadius: 999,
  border: '1px solid rgba(134,239,172,.6)',
  background: 'linear-gradient(180deg, rgba(74,222,128,.95), rgba(21,128,61,.95))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.32), 0 10px 24px rgba(21,128,61,.4)',
  color: '#04220f',
  fontSize: 14.5,
  fontWeight: 900,
  cursor: 'pointer',
}

const scannerBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Opaco y a pantalla completa: la barra de clasificación del jugador se
  // colaba por debajo cuando esto era sólo una tarjeta flotante.
  background: '#020617',
  zIndex: 2147483000,
  display: 'flex',
  justifyContent: 'center',
}

const rescueBox: CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: '10px 12px',
  borderRadius: 16,
  border: '1px solid rgba(251,191,36,.35)',
  background: 'rgba(251,191,36,.08)',
}

const rescueTitle: CSSProperties = {
  color: '#fbbf24',
  fontSize: 13,
  fontWeight: 900,
}

const rescueNote: CSSProperties = {
  color: 'rgba(251,191,36,.75)',
  fontSize: 11,
  fontWeight: 700,
}

const captureButton: CSSProperties = {
  minHeight: 58,
  border: 'none',
  borderRadius: 18,
  background: 'linear-gradient(135deg, #34d399, #059669)',
  color: '#022c22',
  fontSize: 17,
  fontWeight: 950,
  letterSpacing: '-.01em',
  boxShadow: '0 12px 28px rgba(16,185,129,.35)',
  cursor: 'pointer',
}

const manualRow: CSSProperties = {
  display: 'flex',
  gap: 8,
}

const manualInput: CSSProperties = {
  flex: 1,
  minHeight: 46,
  borderRadius: 12,
  border: '1px solid rgba(251,191,36,.5)',
  background: 'rgba(2,6,23,.6)',
  color: '#fff',
  padding: '0 12px',
  fontSize: 15,
  fontWeight: 800,
}

const manualButton: CSSProperties = {
  minHeight: 46,
  padding: '0 18px',
  borderRadius: 12,
  border: 'none',
  background: '#fbbf24',
  color: '#422006',
  fontSize: 14,
  fontWeight: 900,
  cursor: 'pointer',
}

const panel: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  height: '100%',
  // Cabecera y pie fijos, el visor ocupa lo que sobra. Antes era una tarjeta
  // anclada arriba que en iPhone dejaba el código de respaldo fuera de pantalla.
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  gap: 10,
  padding: 14,
  paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
  paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
  color: '#f8fafc',
  overflow: 'hidden',
}

const panelHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const panelTitle: CSSProperties = {
  fontSize: 19,
  fontWeight: 950,
  letterSpacing: '-.01em',
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

const torchButton: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 10,
  minHeight: 34,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(0,0,0,.5)',
  color: '#fff',
  fontWeight: 900,
  backdropFilter: 'blur(10px)',
  fontSize: 10,
  cursor: 'pointer',
}

const scannerStage: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minHeight: 0,
}

const scannerBox: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  // CUADRADO a propósito. Con object-fit: cover, un contenedor cuadrado enseña
  // exactamente el cuadrado central del fotograma, que es justo lo que recorta
  // el analizador. Así el marco verde marca de verdad la zona que se lee; con
  // el visor rectangular anterior el jugador encuadraba una zona distinta de la
  // que se analizaba.
  width: 'min(100%, 100%)',
  maxWidth: '100%',
  maxHeight: '100%',
  aspectRatio: '1 / 1',
  borderRadius: 26,
  border: '2px solid rgba(74,222,128,.40)',
  background: '#000',
  boxShadow: '0 24px 60px rgba(0,0,0,.6)',
}

const videoStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
}

const canvasStyle: CSSProperties = {
  display: 'none',
}

const footer: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const hintText: CSSProperties = {
  color: '#cbd5f5',
  fontSize: 12.5,
  fontWeight: 700,
  lineHeight: 1.35,
  textAlign: 'center',
}

const helpText: CSSProperties = {
  color: 'rgba(241,245,249,.78)',
  fontSize: 12,
  lineHeight: 1.42,
  fontWeight: 820,
}

function noticeBox(tone: 'success' | 'info'): CSSProperties {
  const accent = tone === 'success' ? '#4ade80' : '#94a3b8'
  return {
    position: 'fixed',
    left: '50%',
    // Arriba y no en mitad de la pantalla: el aviso ya no tapa el mapa ni el
    // botón que el jugador va a pulsar justo después.
    top: 'calc(env(safe-area-inset-top) + 14px)',
    transform: 'translateX(-50%)',
    width: 'min(calc(100vw - 24px), 380px)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    border: `1px solid ${accent}55`,
    borderLeft: `4px solid ${accent}`,
    background: 'linear-gradient(180deg, rgba(15,23,42,.97), rgba(2,6,23,.97))',
    color: '#f8fafc',
    padding: '12px 14px',
    textAlign: 'left',
    boxShadow: '0 18px 40px rgba(2,6,23,.45)',
    backdropFilter: 'blur(18px) saturate(1.1)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.1)',
    zIndex: 2147483000,
    animation: 'sagaNoticeIn .22s ease-out',
  }
}

const noticeIcon: CSSProperties = {
  fontSize: 22,
  lineHeight: 1,
  flex: 'none',
}

const noticeCopy: CSSProperties = {
  display: 'grid',
  gap: 2,
  minWidth: 0,
}

const noticeTitle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 950,
  letterSpacing: '-.01em',
}

const noticeText: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.35,
  color: '#cbd5f5',
}

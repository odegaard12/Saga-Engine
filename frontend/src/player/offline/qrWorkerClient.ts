/**
 * Cliente del worker de visión (ver public/qr-worker.js).
 *
 * OpenCV vive dentro del worker a propósito: son 11 MB de WASM y cargarlos en
 * el hilo principal, con el vídeo de la cámara activo, cerraba la pestaña por
 * falta de memoria. Aislado en el worker, si algo se desborda muere el worker
 * y la app sigue funcionando con el código de respaldo.
 */

let worker: Worker | null = null
let nextId = 1
let warmed = false

type Pending = {
  resolve: (matrix: boolean[][] | null) => void
  timer: number
}

const pending = new Map<number, Pending>()

function ensureWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null
  if (worker) return worker

  try {
    // URL versionada a propósito: Cloudflare cachea los .js por delante del
    // backend y seguía sirviendo el worker antiguo tras desplegar, dejando el
    // arranque colgado. Con la versión en la query cada despliegue es una URL
    // nueva y no hay forma de recibir el viejo.
    worker = new Worker(`/qr-worker.js?v=${__SAGA_VERSION__}`)
  } catch {
    worker = null
    return null
  }

  worker.onmessage = (event: MessageEvent) => {
    const data = event.data || {}
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    window.clearTimeout(entry.timer)
    entry.resolve(Array.isArray(data.matrix) ? data.matrix : null)
  }

  // Si el worker se cae (por memoria, por ejemplo) se descarta y las
  // peticiones vivas se resuelven en vacío en vez de quedarse colgadas.
  worker.onerror = () => {
    pending.forEach((entry) => {
      window.clearTimeout(entry.timer)
      entry.resolve(null)
    })
    pending.clear()
    try {
      worker?.terminate()
    } catch {
      // nada que hacer
    }
    worker = null
    warmed = false
  }

  return worker
}

/** Empieza a cargar el motor sin bloquear nada. */
export function warmUpQrEngine(): void {
  if (warmed) return
  const instance = ensureWorker()
  if (!instance) return
  warmed = true
  instance.postMessage({ id: nextId++, type: 'warmup' })
}

/** Devuelve la matriz de módulos del QR de la imagen, o null. */
export function detectQrMatrixInWorker(
  image: ImageData,
  timeoutMs = 20000
): Promise<boolean[][] | null> {
  const instance = ensureWorker()
  if (!instance) return Promise.resolve(null)

  return new Promise((resolve) => {
    const id = nextId++

    const timer = window.setTimeout(() => {
      pending.delete(id)
      resolve(null)
    }, timeoutMs)

    pending.set(id, { resolve, timer })

    // El búfer se transfiere: no se copia y el móvil no duplica memoria.
    const copy = new Uint8ClampedArray(image.data)
    instance.postMessage(
      {
        id,
        type: 'detect',
        buffer: copy.buffer,
        width: image.width,
        height: image.height,
      },
      [copy.buffer]
    )
  })
}

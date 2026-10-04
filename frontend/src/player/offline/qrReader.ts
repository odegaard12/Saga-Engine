import {
  aGris,
  ESTRATEGIAS,
  leerConEstrategias,
  medirLuz,
  ROTACION_DEL_BUCLE,
  type Estrategia,
  type FuncionJsQr,
  type MedidaDeLuz,
} from './qrNucleo'

/**
 * Leer un QR. Funciona sin cobertura y sin bloquear la interfaz.
 *
 * Historia: las primeras pegatinas se imprimieron con el logo de SAGA encima
 * del código, que tapa la información de formato y las pautas de
 * temporización (no tienen corrección de errores): ningún escáner podía
 * leerlas, y la app llegó a cargar OpenCV —11 MB de WebAssembly— para
 * reconocerlas por comparación de matrices. Con las pegatinas nuevas, sin nada
 * encima, eso sobra. Quedan dos caminos, ninguno necesita red:
 *
 *  1. `BarcodeDetector`, nativo en Chrome para Android: código del sistema,
 *     fuera del hilo de JavaScript, rápido y tolerante.
 *  2. jsQR en un worker (`lectorQr.worker.ts`), con las estrategias de
 *     `qrNucleo.ts` para los casos difíciles: inclinada, movida, con poca luz,
 *     con un reflejo o pequeña en el encuadre. Es lo que usa el iPhone.
 *
 * Si el navegador no deja crear el worker, jsQR corre aquí, en el hilo
 * principal, de una estrategia en una para no congelar la pantalla.
 */

export type LecturaQr = {
  texto: string
  via: 'nativo' | 'jsqr'
  /** Milisegundos que costó. */
  ms: number
  /** Con qué preparación de la imagen leyó jsQR (para el banco y el autotest). */
  estrategia?: Estrategia | null
}

/** Lo que devuelve una pasada: la lectura, o qué se sabe de la imagen si no leyó. */
export type PasadaQr = {
  lectura: LecturaQr | null
  luz: MedidaDeLuz | null
  /** Lo que tardó la pasada de jsQR, para ajustar el ritmo del bucle. */
  ms: number
}

// ---------------------------------------------------------------------------
// Lector nativo
// ---------------------------------------------------------------------------

type DetectorNativo = {
  detect(fuente: CanvasImageSource | ImageData): Promise<Array<{ rawValue?: string }>>
}

type VentanaConDetector = typeof globalThis & {
  BarcodeDetector?: {
    new (opciones?: { formats?: string[] }): DetectorNativo
    getSupportedFormats?: () => Promise<string[]>
  }
}

let detectorNativo: DetectorNativo | null | undefined

/** `undefined` = sin mirar; `null` = mirado y no está. */
async function pedirDetectorNativo(): Promise<DetectorNativo | null> {
  if (detectorNativo !== undefined) return detectorNativo
  const ventana = globalThis as VentanaConDetector
  if (!ventana.BarcodeDetector) {
    detectorNativo = null
    return null
  }
  try {
    // Que exista la clase no significa que lea QR: algunos Android sólo traen
    // códigos de barras de una dimensión.
    const formatos = (await ventana.BarcodeDetector.getSupportedFormats?.()) || []
    if (formatos.length && !formatos.includes('qr_code')) {
      detectorNativo = null
      return null
    }
    detectorNativo = new ventana.BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    detectorNativo = null
  }
  return detectorNativo || null
}

/** ¿Este móvil trae lector nativo? Para el autotest. */
export async function hayLectorNativo(): Promise<boolean> {
  return Boolean(await pedirDetectorNativo())
}

async function leerNativo(imagen: ImageData): Promise<string | null> {
  const detector = await pedirDetectorNativo()
  if (!detector) return null
  try {
    const encontrados = await detector.detect(imagen)
    return encontrados.find((item) => item.rawValue)?.rawValue || null
  } catch {
    // Algunos Android tiran el detector con imágenes grandes: se sigue por jsQR.
    return null
  }
}

// ---------------------------------------------------------------------------
// jsQR: en el worker, o aquí si no hay worker
// ---------------------------------------------------------------------------

type Respuesta = {
  id: number
  texto: string | null
  estrategia: Estrategia | null
  luz: MedidaDeLuz | null
  ms: number
}

/** Si el worker no contesta en esto, se da por muerto y se crea otro. */
const ESPERA_MAXIMA_MS = 6000

let trabajador: Worker | null | undefined
let siguienteId = 1
const pendientes = new Map<
  number,
  { resolver: (r: Respuesta | null) => void; temporizador: number }
>()

function crearTrabajador(): Worker | null {
  if (trabajador !== undefined) return trabajador
  try {
    if (typeof Worker === 'undefined') throw new Error('sin workers')
    const nuevo = new Worker(new URL('./lectorQr.worker.ts', import.meta.url), { type: 'module' })
    nuevo.onmessage = (evento: MessageEvent<Respuesta>) => {
      const pendiente = pendientes.get(evento.data.id)
      if (!pendiente) return
      pendientes.delete(evento.data.id)
      window.clearTimeout(pendiente.temporizador)
      pendiente.resolver(evento.data)
    }
    nuevo.onerror = () => {
      // Un worker que no carga (p. ej. sin red y sin guardar): a jsQR en el hilo.
      cerrarLectorQr()
      trabajador = null
    }
    trabajador = nuevo
  } catch {
    trabajador = null
  }
  return trabajador
}

function pedirAlTrabajador(
  imagen: ImageData,
  estrategias: readonly Estrategia[]
): Promise<Respuesta | null> | null {
  const w = crearTrabajador()
  if (!w) return null
  const id = siguienteId++
  return new Promise((resolver) => {
    const temporizador = window.setTimeout(() => {
      pendientes.delete(id)
      // Colgado (sin memoria, o jsQR atascado en una imagen imposible).
      cerrarLectorQr()
      resolver(null)
    }, ESPERA_MAXIMA_MS)
    pendientes.set(id, { resolver, temporizador })
    try {
      // Se TRANSFIERE el búfer: sin copiar 2 MB por fotograma.
      w.postMessage(
        {
          id,
          ancho: imagen.width,
          alto: imagen.height,
          datos: imagen.data.buffer,
          estrategias: [...estrategias],
        },
        [imagen.data.buffer]
      )
    } catch {
      pendientes.delete(id)
      window.clearTimeout(temporizador)
      resolver(null)
    }
  })
}

let jsQrCargado: Promise<FuncionJsQr> | null = null
function pedirJsQr(): Promise<FuncionJsQr> {
  if (!jsQrCargado)
    jsQrCargado = import('jsqr').then((modulo) => modulo.default as unknown as FuncionJsQr)
  return jsQrCargado
}

async function leerAqui(
  imagen: ImageData,
  estrategias: readonly Estrategia[]
): Promise<Respuesta | null> {
  let jsQR: FuncionJsQr
  try {
    jsQR = await pedirJsQr()
  } catch {
    // Sin el paquete (sin red y sin guardar) no hay lectura; el resto sigue.
    jsQrCargado = null
    return null
  }
  const arranque = performance.now()
  const gris = aGris(imagen.data, imagen.width, imagen.height)
  const resultado = leerConEstrategias(gris, estrategias, jsQR)
  return {
    id: 0,
    texto: resultado?.texto ?? null,
    estrategia: resultado?.estrategia ?? null,
    luz: resultado ? null : medirLuz(gris),
    ms: performance.now() - arranque,
  }
}

/** Para el worker y olvida lo pendiente. Se llama al cerrar el escáner. */
export function cerrarLectorQr() {
  for (const [, pendiente] of pendientes) {
    window.clearTimeout(pendiente.temporizador)
    pendiente.resolver(null)
  }
  pendientes.clear()
  if (trabajador) trabajador.terminate()
  trabajador = undefined
}

// ---------------------------------------------------------------------------
// Lo que usa el escáner
// ---------------------------------------------------------------------------

/**
 * Una pasada sobre un fotograma.
 *
 * - `bucle`: una sola estrategia, la que toca en este `turno` (rotan todas en
 *   ~1 s). Así ningún fotograma cuesta más que una lectura.
 * - `foto`: todas, una detrás de otra. Es el botón 📸.
 *
 * El `ImageData` se transfiere al worker: no se puede usar después.
 */
export async function leerFotograma(
  imagen: ImageData,
  opciones: { modo: 'bucle' | 'foto'; turno?: number }
): Promise<PasadaQr> {
  const arranque = performance.now()
  const turno = opciones.turno || 0

  const nativo = await leerNativo(imagen)
  if (nativo) {
    return {
      lectura: { texto: nativo, via: 'nativo', ms: Math.round(performance.now() - arranque) },
      luz: null,
      ms: 0,
    }
  }

  // Con lector nativo, jsQR sólo en un fotograma de cada dos: el nativo ya
  // cubre el caso corriente y así se ahorra batería.
  if (opciones.modo === 'bucle' && detectorNativo && turno % 2 === 1) {
    return { lectura: null, luz: null, ms: 0 }
  }

  const estrategias: readonly Estrategia[] =
    opciones.modo === 'foto' ? ESTRATEGIAS : [ROTACION_DEL_BUCLE[turno % ROTACION_DEL_BUCLE.length]]

  // Si hay worker, la imagen se le transfiere y aquí ya no vale: un fallo del
  // worker es «no leyó este fotograma», no «léelo aquí».
  const peticion = pedirAlTrabajador(imagen, estrategias)
  const respuesta = peticion ? await peticion : await leerAqui(imagen, estrategias)
  if (!respuesta) return { lectura: null, luz: null, ms: 0 }
  if (respuesta.texto) {
    return {
      lectura: {
        texto: respuesta.texto,
        via: 'jsqr',
        ms: Math.round(performance.now() - arranque),
        estrategia: respuesta.estrategia,
      },
      luz: null,
      ms: respuesta.ms,
    }
  }
  return { lectura: null, luz: respuesta.luz, ms: respuesta.ms }
}

/**
 * Buscar un QR en una imagen, probando todo. Para quien sólo quiere un sí o un
 * no (el estudio de tarjetas del panel). No transfiere: copia la imagen.
 */
export async function leerQr(imagen: ImageData): Promise<LecturaQr | null> {
  const copia = new ImageData(new Uint8ClampedArray(imagen.data), imagen.width, imagen.height)
  return (await leerFotograma(copia, { modo: 'foto' })).lectura
}

/** Lado del cuadrado que se manda a leer: con 720 un módulo de una pegatina al 10 % del encuadre aún mide 4 px. */
export const LADO_DE_CAPTURA = 720

let lienzoCompartido: HTMLCanvasElement | null = null

/**
 * El cuadrado central del vídeo, como mucho de `LADO_DE_CAPTURA` px.
 *
 * Es lo que enseña el visor (cuadrado con `object-fit: cover`). Se reutiliza
 * el lienzo: crear uno por fotograma ocho veces por segundo era basura para el
 * recolector justo en los móviles que menos memoria tienen.
 */
export function capturarCuadro(video: HTMLVideoElement, fraccion = 1): ImageData | null {
  const ancho = video.videoWidth || 0
  const alto = video.videoHeight || 0
  if (!ancho || !alto) return null

  const lado = Math.floor(Math.min(ancho, alto) * fraccion)
  if (lado < 32) return null
  const x = Math.floor((ancho - lado) / 2)
  const y = Math.floor((alto - lado) / 2)
  const trabajo = Math.min(lado, LADO_DE_CAPTURA)

  if (!lienzoCompartido) lienzoCompartido = document.createElement('canvas')
  const lienzo = lienzoCompartido
  if (lienzo.width !== trabajo) lienzo.width = trabajo
  if (lienzo.height !== trabajo) lienzo.height = trabajo

  const ctx = lienzo.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, x, y, lado, lado, 0, 0, trabajo, trabajo)
  return ctx.getImageData(0, 0, trabajo, trabajo)
}

/** Compatibilidad: el recorte de antes, con la fracción pedida. */
export function recortarCuadrado(video: HTMLVideoElement, fraccion: number): ImageData | null {
  return capturarCuadro(video, fraccion)
}

/** Los encuadres de antes. El recorte lo hace ahora el núcleo (85 %, completo y centro). */
export const ENCUADRES = [1] as const

import jsQR from 'jsqr'

/**
 * Leer un QR. Un solo camino, y funciona sin cobertura.
 *
 * Lo que había antes: las pegatinas se imprimieron con el logo de SAGA encima
 * del código, y eso tapa la información de formato y las pautas de
 * temporización, que no tienen corrección de errores. Ningún escáner del mundo
 * podía leerlas. Para salvarlas la app cargaba OpenCV —11 MB de WebAssembly—,
 * localizaba el cuadrilátero, lo enderezaba, muestreaba la matriz 21×21 y la
 * comparaba con la esperada de cada payload, probando ocho orientaciones.
 * Funcionaba, pero: 11 MB que bajar antes de salir al monte, un worker que se
 * quedaba sin memoria en los móviles justos, cinco segundos por intento, y
 * sólo reconocía payloads que la misión ya conociera.
 *
 * Con las pegatinas nuevas —sin nada encima y con su zona de silencio— sobra
 * todo eso. Aquí quedan dos caminos, ambos nativos del móvil:
 *
 *  1. `BarcodeDetector`, que traen Chrome y Android de serie. Va en el hilo del
 *     navegador, en código nativo, y es el más rápido y el más tolerante.
 *  2. `jsQR`, 30 KB de JavaScript puro, para iOS y para todo lo demás.
 *
 * Ninguno necesita red. No hay tercer camino a propósito: cada rama que se
 * añade es otra forma distinta de fallar en el monte.
 */

export type LecturaQr = {
  texto: string
  via: 'nativo' | 'jsqr'
  /** Milisegundos que costó. Se enseña en el autotest. */
  ms: number
}

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

/**
 * El detector del navegador, si lo hay.
 *
 * `undefined` = todavía no se ha mirado. `null` = mirado y no está. Se guarda
 * para no volver a preguntar en cada fotograma.
 */
async function pedirDetectorNativo(): Promise<DetectorNativo | null> {
  if (detectorNativo !== undefined) return detectorNativo

  const ventana = globalThis as VentanaConDetector

  if (!ventana.BarcodeDetector) {
    detectorNativo = null
    return null
  }

  try {
    // Que exista la clase no significa que sepa leer QR: en algunos Android
    // sólo trae códigos de barras de una dimensión.
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

/** ¿Este móvil trae lector nativo? Sólo para poder contarlo en el autotest. */
export async function hayLectorNativo(): Promise<boolean> {
  return Boolean(await pedirDetectorNativo())
}

/**
 * Sube el contraste antes de reintentar.
 *
 * Una pegatina a la sombra de un pinar, o a contraluz, llega gris sobre gris.
 * jsQR binariza por su cuenta, pero con poco margen falla; llevarlo
 * a blanco y negro con el umbral en la media de la imagen recupera lecturas que
 * si no se pierden.
 */
function subirContraste(imagen: ImageData): ImageData {
  const datos = imagen.data
  const grises = new Uint8Array(datos.length / 4)

  let suma = 0
  for (let i = 0, p = 0; i < datos.length; i += 4, p += 1) {
    // Luminancia percibida: el verde pesa más de lo que parece.
    const gris = (datos[i] * 299 + datos[i + 1] * 587 + datos[i + 2] * 114) / 1000
    grises[p] = gris
    suma += gris
  }

  const umbral = suma / grises.length
  const salida = new Uint8ClampedArray(datos.length)

  for (let p = 0, i = 0; p < grises.length; p += 1, i += 4) {
    const valor = grises[p] > umbral ? 255 : 0
    salida[i] = valor
    salida[i + 1] = valor
    salida[i + 2] = valor
    salida[i + 3] = 255
  }

  return new ImageData(salida, imagen.width, imagen.height)
}

/**
 * Buscar un QR en un fotograma.
 *
 * Devuelve null si no hay nada legible: quien llama decide si reintentar con
 * otro encuadre o pedir el código de respaldo.
 */
export async function leerQr(imagen: ImageData): Promise<LecturaQr | null> {
  const arranque = performance.now()

  const detector = await pedirDetectorNativo()

  if (detector) {
    try {
      const encontrados = await detector.detect(imagen)
      const texto = encontrados.find((item) => item.rawValue)?.rawValue

      if (texto) {
        return { texto, via: 'nativo', ms: Math.round(performance.now() - arranque) }
      }
    } catch {
      // Algunos Android tiran el detector con imágenes grandes. Se sigue por
      // jsQR en vez de dejar al jugador sin lectura.
    }
  }

  // `attemptBoth` prueba también en negativo: hay impresoras que invierten y
  // pegatinas que se leen mejor al revés.
  const directo = jsQR(imagen.data, imagen.width, imagen.height, {
    inversionAttempts: 'attemptBoth',
  })

  if (directo?.data) {
    return { texto: directo.data, via: 'jsqr', ms: Math.round(performance.now() - arranque) }
  }

  const realzado = jsQR(subirContraste(imagen).data, imagen.width, imagen.height, {
    inversionAttempts: 'attemptBoth',
  })

  if (realzado?.data) {
    return { texto: realzado.data, via: 'jsqr', ms: Math.round(performance.now() - arranque) }
  }

  return null
}

/**
 * Recorta un cuadrado centrado del vídeo y lo devuelve listo para leer.
 *
 * Se prueban varias fracciones porque el encuadre del jugador no va a ser
 * perfecto: medido sobre las fotos de campo, la misma pegatina que a fotograma
 * completo se leía, recortada al 72 % no se localizaba siquiera.
 */
export function recortarCuadrado(video: HTMLVideoElement, fraccion: number): ImageData | null {
  const ancho = video.videoWidth || 0
  const alto = video.videoHeight || 0
  if (!ancho || !alto) return null

  const lado = Math.floor(Math.min(ancho, alto) * fraccion)
  if (lado < 32) return null

  const x = Math.floor((ancho - lado) / 2)
  const y = Math.floor((alto - lado) / 2)

  const lienzo = document.createElement('canvas')
  // Por encima de ~900 px no se gana lectura y sí se gasta memoria, que es
  // justo lo que tumbaba la pestaña en los móviles justos.
  const trabajo = Math.min(lado, 900)
  lienzo.width = trabajo
  lienzo.height = trabajo

  const ctx = lienzo.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(video, x, y, lado, lado, 0, 0, trabajo, trabajo)
  return ctx.getImageData(0, 0, trabajo, trabajo)
}

/** Los encuadres que se prueban, de más abierto a más cerrado. */
export const ENCUADRES = [1, 0.85, 0.7] as const

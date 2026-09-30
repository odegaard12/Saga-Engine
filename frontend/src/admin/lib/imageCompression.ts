/**
 * Fotos del editor: reducidas y con tope de peso.
 *
 * Esto salió de `PlaceMosaicEditor`, que ya recortaba la foto en cuadrado y la
 * comprimía hasta que cupiera en 520 000 caracteres. Los otros dos editores con
 * foto (pista de «Cuenta las señales» y foto de «Mapa mudo») leían el fichero
 * tal cual con `readAsDataURL`: una foto de móvil de 4-8 MB viajaba dentro de
 * `/api/game`, del paquete offline y de la vista de administración, y en «Cuenta
 * las señales» el servidor descartaba en silencio todo lo que pasara de 600 000
 * caracteres (informe A14).
 *
 * Mismo algoritmo y mismos intentos que antes; solo cambia que es de todos.
 */

/** Tope de caracteres del data URL. Por debajo del límite del servidor (600 000). */
export const MAX_IMAGE_LENGTH = 520_000

const TIPOS_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp']

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
    image.onload = () => resolve(image)
    image.src = source
  })
}

export function squareImage(
  image: HTMLImageElement,
  side: number,
  mime: 'image/webp' | 'image/jpeg',
  quality: number
) {
  const canvas = document.createElement('canvas')

  canvas.width = side
  canvas.height = side

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas no disponible.')
  }

  context.fillStyle = '#111315'
  context.fillRect(0, 0, side, side)

  const scale = Math.max(side / image.width, side / image.height)

  const width = image.width * scale
  const height = image.height * scale

  context.drawImage(image, (side - width) / 2, (side - height) / 2, width, height)

  return canvas.toDataURL(mime, quality)
}

export const ERROR_FOTO_GRANDE =
  'La foto sigue pesando demasiado aun reducida (el tope son unos 380 KB). Prueba con otra más simple o más pequeña.'

/**
 * Devuelve la foto en cuadrado y ≤ `MAX_IMAGE_LENGTH` caracteres, o LANZA un
 * error con el motivo en castellano. Quien la llama tiene que enseñárselo al
 * organizador: una foto que no cabe no puede quedarse en silencio.
 */
export async function compressImage(file: File): Promise<string> {
  if (!TIPOS_ADMITIDOS.includes(file.type)) {
    throw new Error('Usa una fotografía JPG, PNG o WebP.')
  }

  const source = await fileDataUrl(file)

  const image = await loadImage(source)

  const attempts: Array<[number, 'image/webp' | 'image/jpeg', number]> = [
    [640, 'image/webp', 0.8],
    [560, 'image/webp', 0.74],
    [512, 'image/jpeg', 0.72],
    [448, 'image/jpeg', 0.66],
  ]

  for (const [side, mime, quality] of attempts) {
    const output = squareImage(image, side, mime, quality)

    const mimeSupported = mime !== 'image/webp' || output.startsWith('data:image/webp')

    if (mimeSupported && output.length <= MAX_IMAGE_LENGTH) {
      return output
    }
  }

  throw new Error(ERROR_FOTO_GRANDE)
}

/** Peso aproximado en KB del contenido de un data URL. */
export function dataUrlKilobytes(value: string) {
  const separator = value.indexOf(',')
  if (separator < 0) return 0

  const encoded = value.slice(separator + 1)
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  const bytes = Math.max(0, Math.floor(encoded.length * 0.75) - padding)

  return Math.max(1, Math.round(bytes / 1024))
}

/** El mensaje para enseñar cuando una foto no se ha podido preparar. */
export function describeImageError(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'No se pudo preparar la foto.'
}

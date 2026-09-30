/**
 * Calidad de las fotos de campo: números y decisiones sin DOM, para poder
 * probarlas en Node (tests/js/logica_jugador.cjs).
 *
 * Antes: fotograma de vídeo de ~1080p, reducido a 1600 px y JPEG al 0,9, y una
 * miniatura de 360 px en el mapa. Los jugadores se quejaban de que "se ven mal".
 * Ahora: se pide la cámara trasera a 4K, se hace una foto de verdad
 * (`ImageCapture.takePhoto`) cuando el navegador la ofrece, y se guarda a
 * 2048 px de lado mayor al 0,85. Reencodificar en un canvas quita el EXIF
 * (ubicación, modelo del móvil): eso NO se toca.
 */

/** Lado mayor de la foto que se sube (px). */
export const LADO_FOTO_PX = 2048
/** Calidad JPEG de partida. */
export const CALIDAD_FOTO = 0.85
/** Peso máximo de la foto codificada (bytes): por debajo del tope del servidor (3 MB). */
export const TOPE_FOTO_BYTES = 2_400_000
/** Calidades a las que se baja, por orden, si la foto se pasa del tope. */
export const CALIDADES_DE_RESERVA = [0.8, 0.72, 0.64]

/** Lo que se le pide a la cámara: trasera, lo más grande que dé (hasta 4K). */
export function restriccionesDeCamara(facingMode: 'environment' | 'user'): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      frameRate: { ideal: 30 },
    },
  }
}

/** Tamaño de salida: el mayor lado a `lado` como mucho, sin ampliar nunca. */
export function dimensionesDeFoto(
  ancho: number,
  alto: number,
  lado: number = LADO_FOTO_PX
): { ancho: number; alto: number } {
  const escala = Math.min(1, lado / Math.max(ancho, alto))
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  }
}

/** Bytes que pesa un `data:` URL en base64. */
export function bytesDeDataUrl(dataUrl: string): number {
  const coma = dataUrl.indexOf(',')
  const base64 = coma >= 0 ? dataUrl.slice(coma + 1) : dataUrl
  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - relleno
}

/**
 * Codifica con la calidad de partida y, si se pasa del tope, baja la calidad y
 * por último el tamaño. Siempre devuelve algo: la última prueba, aunque pese.
 */
export function codificarConTope(
  ancho: number,
  alto: number,
  codificar: (ancho: number, alto: number, calidad: number) => string,
  tope: number = TOPE_FOTO_BYTES
): { dataUrl: string; ancho: number; alto: number; calidad: number } {
  let dim = dimensionesDeFoto(ancho, alto)
  let resultado = { dataUrl: '', ancho: dim.ancho, alto: dim.alto, calidad: CALIDAD_FOTO }
  for (const calidad of [CALIDAD_FOTO, ...CALIDADES_DE_RESERVA]) {
    resultado = { dataUrl: codificar(dim.ancho, dim.alto, calidad), ancho: dim.ancho, alto: dim.alto, calidad }
    if (bytesDeDataUrl(resultado.dataUrl) <= tope) return resultado
  }
  // Aún grande: se encoge un 25 % y se vuelve a intentar dos veces.
  for (let i = 0; i < 2; i += 1) {
    dim = dimensionesDeFoto(dim.ancho, dim.alto, Math.round(Math.max(dim.ancho, dim.alto) * 0.75))
    resultado = { dataUrl: codificar(dim.ancho, dim.alto, 0.72), ancho: dim.ancho, alto: dim.alto, calidad: 0.72 }
    if (bytesDeDataUrl(resultado.dataUrl) <= tope) return resultado
  }
  return resultado
}

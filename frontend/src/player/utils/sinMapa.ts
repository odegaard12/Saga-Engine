import type { LatLon } from './geo'

/**
 * Lo que necesita la brújula de respaldo (sin WebGL no hay mapa): saber si hay
 * WebGL, el rumbo hasta el nodo y cómo decir la distancia. Funciones puras, con
 * pruebas en tests/js/revision_motor.cjs.
 */

let webglCache: boolean | null = null

/**
 * ¿Puede este navegador crear un contexto WebGL? Se mira UNA vez por sesión y
 * se suelta el contexto enseguida: cada lienzo de prueba es un contexto más, y
 * los móviles tienen un tope de unos pocos.
 */
export function hayWebGL(): boolean {
  if (webglCache !== null) return webglCache
  try {
    if (typeof document === 'undefined') return true
    const lienzo = document.createElement('canvas')
    const contexto = (lienzo.getContext('webgl2') ||
      lienzo.getContext('webgl')) as WebGLRenderingContext | null
    contexto?.getExtension('WEBGL_lose_context')?.loseContext()
    webglCache = Boolean(contexto)
  } catch {
    webglCache = false
  }
  return webglCache
}

/** Sólo para pruebas. */
export function olvidarWebGL(): void {
  webglCache = null
}

/** Rumbo inicial (0-360, 0 = norte, en el sentido de las agujas) de `desde` a `hasta`. */
export function rumboEntre(desde: LatLon, hasta: LatLon): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const f1 = rad(desde.lat)
  const f2 = rad(hasta.lat)
  const dl = rad(hasta.lon - desde.lon)
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  const grados = (Math.atan2(y, x) * 180) / Math.PI
  return (grados + 360) % 360
}

/** Hacia dónde girar la flecha: el rumbo al nodo menos hacia dónde mira el móvil. */
export function giroDeLaFlecha(rumbo: number, orientacion: number | null): number {
  if (orientacion === null || !Number.isFinite(orientacion)) return rumbo
  return (((rumbo - orientacion) % 360) + 360) % 360
}

/** «85 m», «1,2 km». */
export function formatoDistancia(metros: number | null, locale: string): string {
  if (metros === null || !Number.isFinite(metros)) return '—'
  if (metros < 1000) return `${Math.max(0, Math.round(metros))} m`
  const km = metros / 1000
  const texto = km < 10 ? km.toFixed(1) : String(Math.round(km))
  return `${locale === 'en' ? texto : texto.replace('.', ',')} km`
}

/** Los ocho puntos cardinales, para quien no tiene brújula en el móvil. */
export function puntoCardinal(rumbo: number, locale: string): string {
  const es = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const lista = locale === 'en' ? en : es
  return lista[Math.round((((rumbo % 360) + 360) % 360) / 45) % 8]
}

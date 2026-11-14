import { esMxId, type MxId } from '../avatares3d/mixamo/catalogo'

/**
 * El retrato redondo con el que se ve a cada jugador en el mapa cuando no va en 3D (vista 2D, zoom lejano, mapa casi
 * cenital, móvil sin WebGL): un círculo con el aro del color de su equipo y, dentro, SU FOTO de perfil (la que subió
 * el admin, la misma del login, también la tuya).
 *
 * - 5/11 (Óscar: «en las fotos debe aparecer la cara del jugador, no del personaje»): sin foto, o mientras no llega
 *   (sin red y sin caché), una SILUETA en su color, igual para todos. Nunca la cara del personaje 3D; el `mx` de las
 *   funciones sólo forma parte del nombre de la imagen.
 * - 11/11 (Óscar: «sin pico o halo, solamente su círculo con su foto»): sin punta. La coordenada del jugador cae en el
 *   CENTRO del círculo (`Y_PUNTA`, nombre heredado) y el mapa ya no pinta aro ni flecha en el suelo bajo el retrato.
 *
 * La foto sólo se pide a `/api/player-avatar/` (con su puerta de acceso, ver `urlDeFotoValida`): nunca a una
 * dirección externa. Lienzo lógico de 56 × 56 px.
 */

export const ANCHO_RETRATO_PX = 56
export const ALTO_RETRATO_PX = 56
/** Dónde cae la coordenada, en px lógicos desde arriba: el centro del círculo. */
export const Y_PUNTA = 27
/** Lo que hay que bajar la imagen (ancla abajo) para que el centro del círculo caiga en la coordenada. */
export const DESPLAZAMIENTO_PIES_PX = ALTO_RETRATO_PX - Y_PUNTA
const ESCALA = 3
const R_EXTERIOR = 25
const GROSOR_ARO = 4.5
const CX = ANCHO_RETRATO_PX / 2
const CY = Y_PUNTA

/** Un `pj-Ch01-3b82f6` del mapa, desmontado; `null` si no es un retrato. */
export function leerIdDeRetrato(id: string): { mx: MxId; color: string } | null {
  const m = /^pj-(Ch\d+)-([0-9a-f]{6})$/.exec(id)
  if (!m || !esMxId(m[1])) return null
  return { mx: m[1], color: `#${m[2]}` }
}

export const idDeRetrato = (mx: MxId, color: string) =>
  `pj-${mx}-${color.replace('#', '').toLowerCase()}`

/** Las fotos sólo se piden al endpoint de retratos del servidor (el único con puerta de acceso). */
const PREFIJO_DE_FOTOS = '/api/player-avatar/'

/** ¿Es una dirección de foto que se puede pedir? (mismo origen, `/api/player-avatar/…`). */
export function urlDeFotoValida(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(PREFIJO_DE_FOTOS) && !url.includes('//') && url.length < 400
}

/** FNV-1a de 32 bits en hexadecimal: una clave corta y estable para el nombre de la imagen del mapa. */
function claveCorta(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const fotosPorClave = new Map<string, { url: string; mx: MxId }>()

/**
 * El id de imagen del mapa para la foto de un jugador: `pf-<clave de foto y personaje>-<color>`.
 * Lleva también su personaje, que es lo que se dibuja mientras la foto no llega.
 */
export function idDeRetratoConFoto(url: string, mx: MxId, color: string): string {
  const clave = claveCorta(`${url}|${mx}`)
  fotosPorClave.set(clave, { url, mx })
  return `pf-${clave}-${color.replace('#', '').toLowerCase()}`
}

/** Un `pf-<clave>-<color>` del mapa, desmontado; `null` si no es una foto registrada. */
export function leerIdDeFoto(id: string): { url: string; mx: MxId; color: string } | null {
  const m = /^pf-([0-9a-f]{8})-([0-9a-f]{6})$/.exec(id)
  const f = m ? fotosPorClave.get(m[1]) : undefined
  return m && f ? { ...f, color: `#${m[2]}` } : null
}

const fotos = new Map<string, HTMLImageElement | 'sin-foto'>()
const esperandoFoto = new Map<string, Set<() => void>>()

/** La foto si ya está lista; si no, empieza a bajarla (de la caché del móvil) y avisa al terminar. */
function fotoDe(url: string, alListo?: () => void): HTMLImageElement | null {
  const f = fotos.get(url)
  if (f === 'sin-foto') return null
  if (f) return f
  if (!urlDeFotoValida(url) || typeof Image === 'undefined') {
    fotos.set(url, 'sin-foto')
    return null
  }
  let cola = esperandoFoto.get(url)
  if (!cola) {
    cola = new Set()
    esperandoFoto.set(url, cola)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      fotos.set(url, img)
      const avisar = esperandoFoto.get(url)
      esperandoFoto.delete(url)
      avisar?.forEach((fn) => fn())
    }
    img.onerror = () => {
      fotos.set(url, 'sin-foto')
      esperandoFoto.delete(url)
    }
    img.src = url
  }
  if (alListo) cola.add(alListo)
  return null
}

/** Empieza ya a bajar las fotos del grupo (de la caché del móvil): así el mapa 2D no sale primero con las caras. */
export function precargarFotos(urls: Iterable<string | null | undefined>): void {
  for (const u of urls) if (urlDeFotoValida(u)) fotoDe(u)
}

/** Las fotos que fallaron (sin red) se piden otra vez y `alListo` se llama por cada una que llega. */
export function reintentarFotos(alListo: () => void): void {
  for (const [url, f] of [...fotos]) {
    if (f !== 'sin-foto') continue
    fotos.delete(url)
    fotoDe(url, alListo)
  }
}

function lienzoNuevo(ancho: number, alto: number, escala: number) {
  if (typeof document === 'undefined') return null
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(ancho * escala)
  lienzo.height = Math.round(alto * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  return { lienzo, ctx }
}

/** Pinta el retrato (círculo y aro, sin punta) en un contexto cuyo origen es la esquina del lienzo lógico. */
function pintar(
  ctx: CanvasRenderingContext2D,
  color: string,
  cara: HTMLImageElement | null
) {
  // Sombra suave bajo la ficha.
  ctx.save()
  ctx.shadowColor = 'rgba(11,18,32,.45)' // no-tema: sombra horneada en la imagen
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 1.5
  ctx.fillStyle = '#ffffff' // no-tema: canto blanco horneado en la imagen, como el de los nodos
  ctx.beginPath()
  ctx.arc(CX, CY, R_EXTERIOR, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Aro del color del equipo.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(CX, CY, R_EXTERIOR - 1.2, 0, Math.PI * 2)
  ctx.fill()

  // La cara, recortada en círculo.
  const r = R_EXTERIOR - 1.2 - GROSOR_ARO
  ctx.save()
  ctx.beginPath()
  ctx.arc(CX, CY, r, 0, Math.PI * 2)
  ctx.clip()
  if (cara && cara.naturalWidth > 0) {
    // Recorte cuadrado y centrado: una foto de perfil no tiene por qué ser cuadrada.
    const lado = Math.min(cara.naturalWidth, cara.naturalHeight)
    ctx.drawImage(
      cara,
      (cara.naturalWidth - lado) / 2,
      (cara.naturalHeight - lado) / 2,
      lado,
      lado,
      CX - r,
      CY - r,
      r * 2,
      r * 2
    )
  } else {
    // Sin foto: silueta en el color del jugador sobre un fondo claro (5/11).
    const fondo = ctx.createLinearGradient(CX, CY - r, CX, CY + r)
    fondo.addColorStop(0, '#f8fafc') // no-tema: colores horneados en la imagen
    fondo.addColorStop(1, '#e2e8f0')
    ctx.fillStyle = fondo
    ctx.fillRect(CX - r, CY - r, r * 2, r * 2)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(CX, CY - r * 0.18, r * 0.36, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(CX, CY + r * 0.86, r * 0.72, r * 0.62, 0, Math.PI, 0)
    ctx.fill()
  }
  ctx.restore()
  // Canto fino por dentro del aro: separa la cara del color.
  ctx.strokeStyle = 'rgba(11,18,32,.35)' // no-tema: canto horneado en la imagen
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(CX, CY, r, 0, Math.PI * 2)
  ctx.stroke()
}

/** El retrato de quien no tiene foto (lo que se registra con `pixelRatio: 3`): su silueta en su color. */
export function dibujarRetratoDeMapa(
  _mx: MxId,
  color: string
): ImageData | null {
  const nuevo = lienzoNuevo(ANCHO_RETRATO_PX, ALTO_RETRATO_PX, ESCALA)
  if (!nuevo) return null
  pintar(nuevo.ctx, color, null)
  return nuevo.ctx.getImageData(0, 0, nuevo.lienzo.width, nuevo.lienzo.height)
}

/**
 * El retrato del mapa con la FOTO del jugador (2D, o 3D lejos). Mientras la foto no está lista, o si no
 * llega, sale su silueta; al llegar se llama a `alListo` para repintarlo.
 */
export function dibujarRetratoConFoto(
  url: string,
  mx: MxId,
  color: string,
  alListo?: () => void
): ImageData | null {
  const nuevo = lienzoNuevo(ANCHO_RETRATO_PX, ALTO_RETRATO_PX, ESCALA)
  if (!nuevo) return null
  const foto = fotoDe(url, alListo)
  pintar(nuevo.ctx, color, foto)
  return nuevo.ctx.getImageData(0, 0, nuevo.lienzo.width, nuevo.lienzo.height)
}

/** El retrato redondo para el DOM (popup, tienda): sólo el círculo con su aro, sin punta. */
export function elementoDeRetrato(_mx: MxId, color: string, lado: number, foto?: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'saga-retrato'
  el.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${lado}px;height:${lado}px;border-radius:50%;box-sizing:border-box;border:${Math.max(2, Math.round(lado / 12))}px solid ${color};overflow:hidden;background:#f1f5f9;line-height:1`
  // 5/11: con foto de perfil, la foto; sin ella (o si no llega), la silueta en su color. Nunca la cara del personaje.
  const silueta = () => {
    el.replaceChildren()
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.setAttribute('aria-hidden', 'true')
    // `style` y no el atributo `fill`: la clasificación pasa colores `var(--…)`, que un atributo SVG no entiende.
    svg.innerHTML = `<circle cx="50" cy="41" r="18" style="fill:${color}"/><ellipse cx="50" cy="93" rx="36" ry="31" style="fill:${color}"/>`
    el.appendChild(svg)
  }
  if (!foto || !urlDeFotoValida(foto)) {
    silueta()
    return el
  }
  const img = document.createElement('img')
  img.alt = ''
  img.draggable = false
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
  img.onerror = silueta
  img.src = foto
  el.appendChild(img)
  return el
}

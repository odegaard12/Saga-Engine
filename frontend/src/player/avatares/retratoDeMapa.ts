import { MX_IDS, MX_NOMBRES, esMxId, type MxId } from '../avatares3d/mixamo/catalogo'
import { urlDeCara } from '../avatares3d/mixamo/rutas'

/**
 * El retrato redondo con el que se ve a cada jugador en el mapa cuando no va en 3D
 * (zoom lejano, mapa casi cenital, muchos jugadores juntos, móvil sin WebGL, modelo
 * que no está en el móvil): la CARA de su personaje 3D en un círculo, con el aro del
 * color de su equipo y una puntita que señala el sitio exacto.
 *
 * La cara es el retrato horneado del propio modelo (`cara-<Ch>.<huella>.webp`, ver
 * `scripts/hornear_avatares_mixamo.py`), que viaja en la parte «App» de la pantalla de
 * carga. Si no está (primer arranque sin cobertura, servidor sin los activos) se
 * dibuja la INICIAL del personaje sobre su color: el mapa nunca se queda sin jugadores.
 *
 * En el retrato (la vista 2D y también la 3D cuando el zoom lejano pasa a retrato) cada jugador se ve con
 * SU FOTO de perfil —la que subió el admin, la misma del login— (5.48: antes sólo en 2D), la que ya
 * tiene en el sistema y que sus compañeros ya ven en la lista del grupo— en lugar de la cara de su
 * personaje, con el mismo aro de color de equipo. Sin foto, o si no llega (sin red y sin caché), sale
 * la cara del personaje como siempre. La foto sólo se pide a `/api/player-avatar/` (con su puerta de
 * acceso, ver `urlDeFotoValida`): nunca a una dirección externa.
 *
 * Lienzo lógico de 56 × 66 px; la punta apoya en `Y_PUNTA` (ahí va la coordenada).
 */

export const ANCHO_RETRATO_PX = 56
export const ALTO_RETRATO_PX = 66
/** Dónde apoya la punta, en px lógicos desde arriba. */
export const Y_PUNTA = 64
/** Lo que hay que bajar la imagen (ancla abajo) para que la punta caiga en la coordenada. */
export const DESPLAZAMIENTO_PIES_PX = ALTO_RETRATO_PX - Y_PUNTA
const ESCALA = 3
const R_EXTERIOR = 25
const GROSOR_ARO = 4.5
const CX = ANCHO_RETRATO_PX / 2
const CY = 27.5

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

type Cara = HTMLImageElement | 'sin-cara'
const caras = new Map<MxId, Cara>()
const esperando = new Map<MxId, Set<() => void>>()

/** La cara si ya está lista; si no, empieza a bajarla (de la caché del móvil) y avisa al terminar. */
function caraDe(mx: MxId, alListo?: () => void): HTMLImageElement | null {
  const c = caras.get(mx)
  if (c === 'sin-cara') return null
  if (c) return c
  const url = urlDeCara(mx)
  if (!url || typeof Image === 'undefined') {
    caras.set(mx, 'sin-cara')
    return null
  }
  let cola = esperando.get(mx)
  if (!cola) {
    cola = new Set()
    esperando.set(mx, cola)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      caras.set(mx, img)
      const avisar = esperando.get(mx)
      esperando.delete(mx)
      avisar?.forEach((f) => f())
    }
    img.onerror = () => {
      caras.set(mx, 'sin-cara')
      esperando.delete(mx)
    }
    img.src = url
  }
  if (alListo) cola.add(alListo)
  return null
}

/** Baja ya las diez caras (de la caché del móvil): así los retratos no salen primero con la inicial. */
export function precargarCaras(): void {
  for (const mx of MX_IDS) caraDe(mx)
}

/**
 * Las caras que fallaron (sin red al arrancar) se piden otra vez, y `alListo` se llama cuando llegue cada una:
 * antes quedaban como inicial hasta recargar la app.
 */
export function reintentarCaras(alListo: () => void): void {
  for (const [mx, c] of [...caras]) {
    if (c !== 'sin-cara') continue
    caras.delete(mx)
    caraDe(mx, alListo)
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

/** Pinta el retrato (círculo, aro y punta) en un contexto cuyo origen es la esquina del lienzo lógico. */
function pintar(
  ctx: CanvasRenderingContext2D,
  mx: MxId,
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
  ctx.moveTo(CX - 7, CY + R_EXTERIOR - 4)
  ctx.lineTo(CX, Y_PUNTA)
  ctx.lineTo(CX + 7, CY + R_EXTERIOR - 4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Aro del color del equipo, con la punta del mismo color.
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(CX, CY, R_EXTERIOR - 1.2, 0, Math.PI * 2)
  ctx.moveTo(CX - 6, CY + R_EXTERIOR - 4.5)
  ctx.lineTo(CX, Y_PUNTA - 1.6)
  ctx.lineTo(CX + 6, CY + R_EXTERIOR - 4.5)
  ctx.closePath()
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
    const fondo = ctx.createLinearGradient(CX, CY - r, CX, CY + r)
    fondo.addColorStop(0, '#f3f4f6') // no-tema: colores horneados en la imagen
    fondo.addColorStop(1, '#cbd5e1')
    ctx.fillStyle = fondo
    ctx.fillRect(CX - r, CY - r, r * 2, r * 2)
    ctx.fillStyle = '#334155' // no-tema: colores horneados en la imagen
    ctx.font = '700 20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(MX_NOMBRES[mx].slice(0, 1), CX, CY + 1)
  }
  ctx.restore()
  // Canto fino por dentro del aro: separa la cara del color.
  ctx.strokeStyle = 'rgba(11,18,32,.35)' // no-tema: canto horneado en la imagen
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(CX, CY, r, 0, Math.PI * 2)
  ctx.stroke()
}

/**
 * El retrato como imagen del mapa (lo que se registra con `pixelRatio: 3`). Si la cara aún no
 * está lista sale con la inicial y se llama a `alListo` cuando llegue, para repintarlo.
 */
export function dibujarRetratoDeMapa(
  mx: MxId,
  color: string,
  alListo?: () => void
): ImageData | null {
  const nuevo = lienzoNuevo(ANCHO_RETRATO_PX, ALTO_RETRATO_PX, ESCALA)
  if (!nuevo) return null
  pintar(nuevo.ctx, mx, color, caraDe(mx, alListo))
  return nuevo.ctx.getImageData(0, 0, nuevo.lienzo.width, nuevo.lienzo.height)
}

/**
 * El retrato del mapa con la FOTO del jugador (2D, o 3D lejos). Mientras la foto no está lista, o si no
 * llega, sale la cara de su personaje (`mx`); al llegar se llama a `alListo` para repintarlo.
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
  pintar(nuevo.ctx, mx, color, foto ?? caraDe(mx, alListo))
  return nuevo.ctx.getImageData(0, 0, nuevo.lienzo.width, nuevo.lienzo.height)
}

/** El retrato redondo para el DOM (popup, tienda): sólo el círculo con su aro, sin punta. */
export function elementoDeRetrato(mx: MxId, color: string, lado: number, foto?: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'saga-retrato'
  el.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:${lado}px;height:${lado}px;border-radius:50%;box-sizing:border-box;border:${Math.max(2, Math.round(lado / 12))}px solid ${color};overflow:hidden;background:#e2e8f0;color:#334155;font-weight:700;line-height:1`
  // Con foto de perfil se pide ella; si no llega, cae a la cara del personaje y luego a la inicial.
  const urlCara = urlDeCara(mx)
  let url = foto && urlDeFotoValida(foto) ? foto : urlCara
  const inicial = () => {
    el.textContent = MX_NOMBRES[mx].slice(0, 1)
    el.style.fontSize = `${Math.round(lado * 0.45)}px`
  }
  if (!url) {
    inicial()
    return el
  }
  const img = document.createElement('img')
  img.alt = ''
  img.draggable = false
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
  img.onerror = () => {
    if (url !== urlCara && urlCara) {
      url = urlCara
      img.src = urlCara
      return
    }
    img.remove()
    inicial()
  }
  img.src = url
  el.appendChild(img)
  return el
}

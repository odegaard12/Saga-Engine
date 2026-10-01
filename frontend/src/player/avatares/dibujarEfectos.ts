/**
 * Imágenes sueltas del mapa que no son nodos ni personajes: la flecha de
 * dirección del trazado y los efectos de la celebración. Todas en canvas,
 * sin descargar nada.
 */

function lienzo(ancho: number, alto: number, escala: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = ancho * escala
  c.height = alto * escala
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  return { c, ctx }
}

/** Chevron que se repite a lo largo del trazado (`line-pattern`): apunta en el sentido del dibujo. */
export function dibujarFlechaDeRuta(): ImageData | null {
  const l = lienzo(36, 12, 3)
  if (!l) return null
  const { ctx, c } = l
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(6, 2.6)
  ctx.lineTo(11.4, 6)
  ctx.lineTo(6, 9.4)
  ctx.strokeStyle = 'rgba(11,18,32,.6)' // no-tema: canto horneado en la imagen
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.2
  ctx.stroke()
  return ctx.getImageData(0, 0, c.width, c.height)
}

/** Onda del suelo: anillo dorado con el borde blanco, simétrico. */
export function dibujarOnda(): ImageData | null {
  const lado = 128
  const l = lienzo(lado, lado, 2)
  if (!l) return null
  const { ctx, c } = l
  const m = lado / 2
  const g = ctx.createRadialGradient(m, m, m * 0.6, m, m, m * 0.98)
  g.addColorStop(0, 'rgba(255,214,90,0)')
  g.addColorStop(0.7, 'rgba(255,214,90,.75)')
  g.addColorStop(0.9, 'rgba(255,255,255,.95)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(m, m, m, 0, Math.PI * 2)
  ctx.fill()
  return ctx.getImageData(0, 0, c.width, c.height)
}

/** Chispa de cuatro puntas, dorada con el centro blanco. */
export function dibujarChispa(): ImageData | null {
  const l = lienzo(32, 32, 3)
  if (!l) return null
  const { ctx, c } = l
  ctx.translate(16, 16)
  ctx.beginPath()
  for (let i = 0; i < 8; i += 1) {
    const r = i % 2 === 0 ? 14 : 4
    const a = (i * Math.PI) / 4 - Math.PI / 2
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fillStyle = '#ffd24a'
  ctx.fill()
  ctx.lineWidth = 1.4
  ctx.strokeStyle = 'rgba(146,84,10,.75)' // no-tema: canto horneado en la imagen
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(0, 0, 3, 0, Math.PI * 2)
  ctx.fill()
  return ctx.getImageData(0, 0, c.width, c.height)
}

/** Insignia de «hecho»: disco verde con el check blanco, con la luz de las bolas de los nodos. */
export function dibujarInsignia(): ImageData | null {
  const l = lienzo(64, 64, 3)
  if (!l) return null
  const { ctx, c } = l
  const cx = 32
  const luz = ctx.createRadialGradient(cx - 9, cx - 11, 3, cx, cx, 27)
  luz.addColorStop(0, '#b7f7cf')
  luz.addColorStop(0.3, '#22c55e')
  luz.addColorStop(1, '#0f7a37')
  ctx.shadowColor = 'rgba(0,0,0,.4)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fillStyle = luz
  ctx.beginPath()
  ctx.arc(cx, cx, 24, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 6.4
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(21, 33)
  ctx.lineTo(29, 41)
  ctx.lineTo(44, 24)
  ctx.stroke()
  return ctx.getImageData(0, 0, c.width, c.height)
}

/** Resplandor dorado del tamaño de la imagen del nodo, centrado en la moneda. */
export function dibujarBrilloDeNodo(ancho: number, alto: number, centroY: number): ImageData | null {
  const l = lienzo(ancho, alto, 3)
  if (!l) return null
  const { ctx, c } = l
  const cx = ancho / 2
  const g = ctx.createRadialGradient(cx, centroY, 4, cx, centroY, ancho * 0.62)
  g.addColorStop(0, 'rgba(255,248,200,.95)')
  g.addColorStop(0.4, 'rgba(255,205,70,.6)')
  g.addColorStop(1, 'rgba(255,190,40,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, ancho, alto)
  return ctx.getImageData(0, 0, c.width, c.height)
}

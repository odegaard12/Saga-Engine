import { esPersonaje, type Personaje } from './personajes'

/**
 * Los muñecos del mapa, dibujados en un canvas (nada se descarga).
 *
 * Mismo lenguaje que los nodos (ver `dibujarBola` y `bolaRenderizada.ts`):
 * figuras redondeadas con luz arriba a la izquierda y sombra abajo a la
 * derecha, canto oscuro de 1,5 px y un brillo blanco. Proporción de muñeco:
 * cabeza grande y cuerpo pequeño, que se lee a dos dedos de distancia.
 *
 * La sombra del suelo y el aro del color del equipo NO van aquí: los pinta
 * otra capa, TUMBADA sobre el terreno (ver `dibujarSueloDeJugador`), para que
 * se asienten con la inclinación del mapa igual que el suelo de los nodos.
 *
 * Lienzo lógico de 64 × 84 px; los pies apoyan en `Y_PIES`.
 */

export const ANCHO_PERSONAJE_PX = 64
export const ALTO_PERSONAJE_PX = 84
/** Dónde apoyan los pies, en px lógicos desde arriba. */
export const Y_PIES = 77
/** Lo que hay que bajar la imagen (ancla abajo) para que los pies caigan en la coordenada. */
export const DESPLAZAMIENTO_PIES_PX = ALTO_PERSONAJE_PX - Y_PIES
const ESCALA = 3

type Ctx = CanvasRenderingContext2D

const CONTORNO = 'rgba(11,18,32,.62)' // no-tema: canto horneado en la imagen, como el de los nodos
const PIEL = { claro: '#ffe3c6', base: '#f3c79b', oscuro: '#c98d60' } // no-tema: colores horneados en la imagen
const OJO = '#1a1430' // no-tema: colores horneados en la imagen
const CX = 32

/** Aclara u oscurece un #rrggbb. */
function tono(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const canal = (v: number) => Math.max(0, Math.min(255, Math.round(factor >= 0 ? v + (255 - v) * factor : v * (1 + factor))))
  const r = canal((n >> 16) & 255)
  const g = canal((n >> 8) & 255)
  const b = canal(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

type Paleta = { claro: string; base: string; oscuro: string }
const paleta = (base: string): Paleta => ({ claro: tono(base, 0.5), base, oscuro: tono(base, -0.38) })

/** Una elipse «de bulto»: luz arriba a la izquierda, sombra abajo a la derecha, canto oscuro. */
function bulto(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  p: Paleta,
  opciones: { giro?: number; sinCanto?: boolean; brillo?: boolean } = {}
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(opciones.giro ?? 0)
  ctx.scale(1, ry / rx)
  const luz = ctx.createRadialGradient(-rx * 0.35, -rx * 0.42, rx * 0.08, 0, 0, rx * 1.08)
  luz.addColorStop(0, p.claro)
  luz.addColorStop(0.3, p.base)
  luz.addColorStop(1, p.oscuro)
  ctx.fillStyle = luz
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  if (!opciones.sinCanto) {
    ctx.lineWidth = 1.5 / (ry / rx > 0.5 ? 1 : ry / rx)
    ctx.strokeStyle = CONTORNO
    ctx.stroke()
  }
  if (opciones.brillo) {
    ctx.fillStyle = 'rgba(255,255,255,.4)'
    ctx.beginPath()
    ctx.ellipse(-rx * 0.3, -rx * 0.46, rx * 0.3, rx * 0.17, -0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Un trazo cualquiera con el mismo relleno de luz y canto (vale para gorros, capas, barbas). */
function forma(ctx: Ctx, trazar: () => void, p: Paleta, cx: number, cy: number, radio: number, sinCanto = false): void {
  ctx.save()
  const luz = ctx.createRadialGradient(cx - radio * 0.4, cy - radio * 0.5, radio * 0.1, cx, cy, radio * 1.2)
  luz.addColorStop(0, p.claro)
  luz.addColorStop(0.35, p.base)
  luz.addColorStop(1, p.oscuro)
  ctx.fillStyle = luz
  ctx.beginPath()
  trazar()
  ctx.fill()
  if (!sinCanto) {
    ctx.lineWidth = 1.4
    ctx.lineJoin = 'round'
    ctx.strokeStyle = CONTORNO
    ctx.stroke()
  }
  ctx.restore()
}

function linea(ctx: Ctx, puntos: [number, number][], color: string, ancho: number): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = ancho
  ctx.beginPath()
  puntos.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.stroke()
  ctx.restore()
}

// ------------------------------------------------------------ piezas comunes

type Traje = { cuerpo: string; botas?: string }

/** Botas y cuerpo: el tronco redondeado con un brillo. */
function cuerpoBase(ctx: Ctx, traje: Traje): void {
  const botas = paleta(traje.botas ?? '#5b3b22') // no-tema: colores horneados en la imagen
  bulto(ctx, CX - 6.5, 73.2, 6.2, 4.3, botas)
  bulto(ctx, CX + 6.5, 73.2, 6.2, 4.3, botas)
  const p = paleta(traje.cuerpo)
  forma(
    ctx,
    () => {
      ctx.moveTo(CX - 11, 49)
      ctx.quadraticCurveTo(CX - 13, 71, CX - 6, 71)
      ctx.lineTo(CX + 6, 71)
      ctx.quadraticCurveTo(CX + 13, 71, CX + 11, 49)
      ctx.quadraticCurveTo(CX, 43, CX - 11, 49)
    },
    p,
    CX,
    58,
    14
  )
  ctx.fillStyle = 'rgba(255,255,255,.28)'
  ctx.beginPath()
  ctx.ellipse(CX - 5, 52.5, 4, 2.1, -0.5, 0, Math.PI * 2)
  ctx.fill()
}

function brazos(ctx: Ctx, color: string): void {
  const p = paleta(color)
  bulto(ctx, CX - 13.2, 55, 3.9, 5.4, p, { giro: 0.25 })
  bulto(ctx, CX + 13.2, 55, 3.9, 5.4, p, { giro: -0.25 })
  const mano = paleta(PIEL.base)
  bulto(ctx, CX - 14.2, 60, 2.7, 2.7, mano)
  bulto(ctx, CX + 14.2, 60, 2.7, 2.7, mano)
}

type Cara = { piel?: Paleta; cejas?: boolean; sonrisa?: number; mejillas?: string }

/** Cabeza redonda con ojos, mejillas y sonrisa. */
function cabeza(ctx: Ctx, cara: Cara = {}): void {
  const cy = 31
  const r = 15.2
  bulto(ctx, CX, cy, r, r * 0.97, cara.piel ?? PIEL, { brillo: true })
  // Mejillas.
  ctx.fillStyle = cara.mejillas ?? 'rgba(236,110,110,.42)'
  ctx.beginPath()
  ctx.ellipse(CX - 8.6, cy + 5.4, 2.9, 1.9, 0, 0, Math.PI * 2)
  ctx.ellipse(CX + 8.6, cy + 5.4, 2.9, 1.9, 0, 0, Math.PI * 2)
  ctx.fill()
  ojos(ctx, cy + 1.6)
  // Sonrisa.
  ctx.strokeStyle = 'rgba(92,40,30,.85)'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(CX, cy + 6.2, cara.sonrisa ?? 3.4, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.stroke()
}

function ojos(ctx: Ctx, y: number, separacion = 5.6): void {
  for (const lado of [-1, 1]) {
    const x = CX + lado * separacion
    ctx.fillStyle = OJO
    ctx.beginPath()
    ctx.ellipse(x, y, 1.95, 2.7, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x - 0.6, y - 1, 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Un gorro de ala ancha con copa: explorador, exploradora y peregrino. */
function sombreroDeAla(ctx: Ctx, color: string, banda: string, copaAlta = 9): void {
  const ala = paleta(color)
  // Copa primero (detrás del ala).
  bulto(ctx, CX, 19.2, 11.6, copaAlta, ala)
  // Ala.
  bulto(ctx, CX, 22.2, 20.4, 5.3, ala)
  // Banda.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(CX, 19.2, 11.6, copaAlta, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = banda
  ctx.fillRect(CX - 13, 19.4, 26, 3.1)
  ctx.restore()
}

/** Casco vikingo con dos cuernos. */
function cascoVikingo(ctx: Ctx, cuerno = '#f3ecd8'): void {
  const hueso = paleta(cuerno)
  for (const lado of [-1, 1]) {
    forma(
      ctx,
      () => {
        ctx.moveTo(CX + lado * 12.5, 22)
        ctx.quadraticCurveTo(CX + lado * 21.5, 21, CX + lado * 20.5, 8.5)
        ctx.quadraticCurveTo(CX + lado * 17.6, 15.6, CX + lado * 9, 16.5)
        ctx.closePath()
      },
      hueso,
      CX + lado * 16,
      16,
      8
    )
  }
  const hierro = paleta('#8d99ab') // no-tema: colores horneados en la imagen
  bulto(ctx, CX, 21.4, 14.6, 9.6, hierro)
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(CX, 21.4, 14.6, 9.6, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#525d70' // no-tema: colores horneados en la imagen
  ctx.fillRect(CX - 16, 22.2, 32, 3.4)
  ctx.restore()
  ctx.fillStyle = '#f1f5f9' // no-tema: colores horneados en la imagen
  for (const dx of [-7, 0, 7]) {
    ctx.beginPath()
    ctx.arc(CX + dx, 23.9, 0.95, 0, Math.PI * 2)
    ctx.fill()
  }
}

function trenza(ctx: Ctx, x: number, y: number, pelo: Paleta, lazo: string): void {
  for (let i = 0; i < 3; i += 1) bulto(ctx, x + (i % 2 === 0 ? -0.6 : 0.6), y + i * 5.4, 3.3 - i * 0.3, 3.1, pelo)
  ctx.fillStyle = lazo
  ctx.beginPath()
  ctx.arc(x, y + 16.4, 1.9, 0, Math.PI * 2)
  ctx.fill()
}

// ------------------------------------------------------------ los personajes

type Pintor = (ctx: Ctx) => void

const PERSONAJES_DIBUJO: Record<Personaje, Pintor> = {
  explorador(ctx) {
    // Correa de la mochila detrás.
    cuerpoBase(ctx, { cuerpo: '#c8a45c' }) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX - 9, 48], [CX + 8, 69]], '#6b4a26', 3.2) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX - 12, 64.4], [CX + 12, 64.4]], '#6b4a26', 2.6) // no-tema: colores horneados en la imagen
    brazos(ctx, '#c8a45c') // no-tema: colores horneados en la imagen
    cabeza(ctx)
    // Mechones bajo el ala.
    const pelo = paleta('#6b4423') // no-tema: colores horneados en la imagen
    bulto(ctx, CX - 13.6, 29.6, 2.8, 4.6, pelo)
    bulto(ctx, CX + 13.6, 29.6, 2.8, 4.6, pelo)
    sombreroDeAla(ctx, '#d9b96e', '#7a4f2a') // no-tema: colores horneados en la imagen
  },
  exploradora(ctx) {
    const pelo = paleta('#7a4a2a') // no-tema: colores horneados en la imagen
    // Coleta detrás de la cabeza.
    bulto(ctx, CX + 15.6, 36, 3.6, 9, pelo, { giro: -0.35 })
    cuerpoBase(ctx, { cuerpo: '#2aa198' }) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX + 9, 48], [CX - 8, 69]], '#6b4a26', 3.2) // no-tema: colores horneados en la imagen
    brazos(ctx, '#2aa198') // no-tema: colores horneados en la imagen
    cabeza(ctx)
    bulto(ctx, CX - 13.8, 29.4, 2.7, 4.4, pelo)
    bulto(ctx, CX + 13.8, 29.4, 2.7, 4.4, pelo)
    sombreroDeAla(ctx, '#e6c47c', '#1f7a72') // no-tema: colores horneados en la imagen
    ctx.fillStyle = '#e4453b' // no-tema: colores horneados en la imagen
    ctx.beginPath()
    ctx.arc(CX + 14.4, 28, 1.7, 0, Math.PI * 2)
    ctx.fill()
  },
  vikingo(ctx) {
    cuerpoBase(ctx, { cuerpo: '#b8372c', botas: '#4a3320' }) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX - 11, 63.5], [CX + 11, 63.5]], '#3b2a1c', 3.2) // no-tema: colores horneados en la imagen
    ctx.fillStyle = '#e8c160' // no-tema: colores horneados en la imagen
    ctx.fillRect(CX - 1.7, 61.8, 3.4, 3.4)
    brazos(ctx, '#b8372c') // no-tema: colores horneados en la imagen
    cabeza(ctx)
    // Barba pelirroja.
    const barba = paleta('#dd6b2a') // no-tema: colores horneados en la imagen
    forma(
      ctx,
      () => {
        ctx.moveTo(CX - 14.4, 33)
        ctx.quadraticCurveTo(CX - 13, 47, CX, 49.5)
        ctx.quadraticCurveTo(CX + 13, 47, CX + 14.4, 33)
        ctx.quadraticCurveTo(CX + 9, 37.6, CX, 36.6)
        ctx.quadraticCurveTo(CX - 9, 37.6, CX - 14.4, 33)
      },
      barba,
      CX,
      42,
      13
    )
    ctx.strokeStyle = 'rgba(92,40,30,.85)'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(CX, 40.6, 2.8, 0.2 * Math.PI, 0.8 * Math.PI)
    ctx.stroke()
    cascoVikingo(ctx)
  },
  vikinga(ctx) {
    const pelo = paleta('#f0c75a') // no-tema: colores horneados en la imagen
    trenza(ctx, CX - 16.2, 33, pelo, '#2f6db5') // no-tema: colores horneados en la imagen
    trenza(ctx, CX + 16.2, 33, pelo, '#2f6db5') // no-tema: colores horneados en la imagen
    cuerpoBase(ctx, { cuerpo: '#3274c2', botas: '#4a3320' }) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX - 11, 63.5], [CX + 11, 63.5]], '#f3ecd8', 2.6) // no-tema: colores horneados en la imagen
    brazos(ctx, '#3274c2') // no-tema: colores horneados en la imagen
    cabeza(ctx)
    // Flequillo rubio bajo el casco.
    bulto(ctx, CX - 9, 24.4, 6.2, 3.6, pelo, { sinCanto: true })
    bulto(ctx, CX + 9, 24.4, 6.2, 3.6, pelo, { sinCanto: true })
    cascoVikingo(ctx)
  },
  peregrino(ctx) {
    // Vara con calabaza, detrás.
    linea(ctx, [[CX + 19.4, 28], [CX + 19.4, 77]], '#5c3d1e', 3) // no-tema: colores horneados en la imagen
    const calabaza = paleta('#d6a23e') // no-tema: colores horneados en la imagen
    bulto(ctx, CX + 19.4, 37.4, 3.5, 3.2, calabaza)
    bulto(ctx, CX + 19.4, 42.4, 4.6, 4.6, calabaza)
    cuerpoBase(ctx, { cuerpo: '#7a6442' }) // no-tema: colores horneados en la imagen
    // Esclavina.
    const capa = paleta('#94785a') // no-tema: colores horneados en la imagen
    forma(
      ctx,
      () => {
        ctx.moveTo(CX - 14.5, 50)
        ctx.quadraticCurveTo(CX, 41, CX + 14.5, 50)
        ctx.quadraticCurveTo(CX + 13, 59, CX, 59.5)
        ctx.quadraticCurveTo(CX - 13, 59, CX - 14.5, 50)
      },
      capa,
      CX,
      52,
      14
    )
    // Concha de vieira en el pecho.
    concha(ctx, CX, 55, 4.6)
    brazos(ctx, '#7a6442') // no-tema: colores horneados en la imagen
    cabeza(ctx)
    const barba = paleta('#8a7a66') // no-tema: colores horneados en la imagen
    forma(
      ctx,
      () => {
        ctx.moveTo(CX - 7, 38.4)
        ctx.quadraticCurveTo(CX - 6, 45, CX, 45.4)
        ctx.quadraticCurveTo(CX + 6, 45, CX + 7, 38.4)
        ctx.quadraticCurveTo(CX, 41.6, CX - 7, 38.4)
      },
      barba,
      CX,
      42,
      7
    )
    sombreroDeAla(ctx, '#8b6a3c', '#4f3519', 6.8) // no-tema: colores horneados en la imagen
    concha(ctx, CX, 17.6, 3.3)
  },
  bruxa(ctx) {
    const pelo = paleta('#3a2c58') // no-tema: colores horneados en la imagen
    bulto(ctx, CX - 14.6, 42, 5, 13, pelo, { giro: 0.12 })
    bulto(ctx, CX + 14.6, 42, 5, 13, pelo, { giro: -0.12 })
    cuerpoBase(ctx, { cuerpo: '#4a2f86', botas: '#2a1a4d' }) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX - 10.6, 64.6], [CX + 10.6, 64.6]], '#33d1b4', 2.6) // no-tema: colores horneados en la imagen
    brazos(ctx, '#4a2f86') // no-tema: colores horneados en la imagen
    cabeza(ctx)
    // Flequillo.
    bulto(ctx, CX - 6.4, 23.6, 6.4, 3.9, pelo, { sinCanto: true })
    bulto(ctx, CX + 6.4, 23.6, 6.4, 3.9, pelo, { sinCanto: true })
    // Sombrero de pico, con la punta torcida.
    const sombrero = paleta('#6a3fb5') // no-tema: colores horneados en la imagen
    forma(
      ctx,
      () => {
        ctx.moveTo(CX - 10.6, 22)
        ctx.quadraticCurveTo(CX - 8, 9, CX + 1.6, 4)
        ctx.quadraticCurveTo(CX + 7.4, 1.4, CX + 12.4, 4.4)
        ctx.quadraticCurveTo(CX + 4.6, 8, CX + 10.6, 22)
        ctx.closePath()
      },
      sombrero,
      CX,
      13,
      12
    )
    bulto(ctx, CX, 22.6, 19.6, 4.8, sombrero)
    ctx.fillStyle = '#f5c842' // no-tema: colores horneados en la imagen
    ctx.fillRect(CX - 9.6, 18.4, 19.2, 3.6)
    ctx.fillStyle = '#2a1a4d' // no-tema: colores horneados en la imagen
    ctx.fillRect(CX - 2.4, 18.2, 4.8, 4)
    estrella(ctx, CX + 1, 12.4, 3.1, '#ffe27a') // no-tema: colores horneados en la imagen
  },
  marinheira(ctx) {
    const pelo = paleta('#7a4527') // no-tema: colores horneados en la imagen
    for (const lado of [-1, 1]) {
      bulto(ctx, CX + lado * 16.4, 38, 3.9, 8.6, pelo, { giro: lado * -0.12 })
      ctx.fillStyle = '#d63a3a' // no-tema: colores horneados en la imagen
      ctx.beginPath()
      ctx.arc(CX + lado * 15.6, 30.4, 1.9, 0, Math.PI * 2)
      ctx.fill()
    }
    cuerpoBase(ctx, { cuerpo: '#f4f6fa', botas: '#22325a' }) // no-tema: colores horneados en la imagen
    // Rayas marineras.
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(CX - 11, 49)
    ctx.quadraticCurveTo(CX - 13, 71, CX - 6, 71)
    ctx.lineTo(CX + 6, 71)
    ctx.quadraticCurveTo(CX + 13, 71, CX + 11, 49)
    ctx.quadraticCurveTo(CX, 43, CX - 11, 49)
    ctx.clip()
    ctx.fillStyle = '#23407a' // no-tema: colores horneados en la imagen
    for (const y of [52.5, 58.5, 64.5]) ctx.fillRect(CX - 14, y, 28, 2.6)
    ctx.restore()
    ctx.fillStyle = '#d63a3a' // no-tema: colores horneados en la imagen
    ctx.beginPath()
    ctx.moveTo(CX - 5, 47.2)
    ctx.lineTo(CX + 5, 47.2)
    ctx.lineTo(CX, 54.4)
    ctx.closePath()
    ctx.fill()
    brazos(ctx, '#f4f6fa') // no-tema: colores horneados en la imagen
    cabeza(ctx)
    bulto(ctx, CX - 8, 24.2, 7, 3.7, pelo, { sinCanto: true })
    bulto(ctx, CX + 8, 24.2, 7, 3.7, pelo, { sinCanto: true })
    // Gorra marinera.
    const gorra = paleta('#f4f6fa') // no-tema: colores horneados en la imagen
    bulto(ctx, CX, 20.6, 13.4, 7.6, gorra)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(CX, 20.6, 13.4, 7.6, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#23407a' // no-tema: colores horneados en la imagen
    ctx.fillRect(CX - 15, 22.4, 30, 3.4)
    ctx.restore()
    ctx.fillStyle = '#d63a3a' // no-tema: colores horneados en la imagen
    ctx.beginPath()
    ctx.arc(CX, 14.6, 1.9, 0, Math.PI * 2)
    ctx.fill()
  },
  gaiteiro(ctx) {
    cuerpoBase(ctx, { cuerpo: '#2f8a57', botas: '#3a2a1c' }) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX - 11, 63.6], [CX + 11, 63.6]], '#c93232', 3.4) // no-tema: colores horneados en la imagen
    // La gaita: fuelle bajo el brazo, roncón y punteiro.
    linea(ctx, [[CX + 3, 54], [CX + 14, 37]], '#3a2a1c', 2.2) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX + 6, 55], [CX + 18, 41]], '#3a2a1c', 2.2) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX - 5, 58], [CX - 12, 70]], '#3a2a1c', 2.2) // no-tema: colores horneados en la imagen
    bulto(ctx, CX + 1.6, 57.4, 9.4, 6.2, paleta('#a8672c'), { giro: -0.45, brillo: true }) // no-tema: colores horneados en la imagen
    ctx.fillStyle = '#e8c160' // no-tema: colores horneados en la imagen
    for (const [x, y] of [[CX + 14, 37], [CX + 18, 41]]) {
      ctx.beginPath()
      ctx.arc(x, y, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    brazos(ctx, '#2f8a57') // no-tema: colores horneados en la imagen
    cabeza(ctx)
    // Bigote y pelo.
    const pelo = paleta('#5a3a1e') // no-tema: colores horneados en la imagen
    bulto(ctx, CX - 4.2, 37.2, 4.3, 2.3, pelo, { giro: 0.3, sinCanto: true })
    bulto(ctx, CX + 4.2, 37.2, 4.3, 2.3, pelo, { giro: -0.3, sinCanto: true })
    bulto(ctx, CX - 13.4, 28.4, 2.8, 4.8, pelo)
    bulto(ctx, CX + 13.4, 28.4, 2.8, 4.8, pelo)
    // Montera con borla roja.
    const gorro = paleta('#26302c') // no-tema: colores horneados en la imagen
    bulto(ctx, CX, 20.2, 14, 7, gorro)
    bulto(ctx, CX, 15.6, 8.4, 5.4, gorro)
    ctx.fillStyle = '#d63a3a' // no-tema: colores horneados en la imagen
    ctx.beginPath()
    ctx.arc(CX, 10.4, 2.6, 0, Math.PI * 2)
    ctx.fill()
  },
  can(ctx) {
    const pelaje = paleta('#c98a4b') // no-tema: colores horneados en la imagen
    // Cola detrás.
    bulto(ctx, CX + 14.4, 62, 3.4, 7.4, pelaje, { giro: -0.6 })
    cuerpoBase(ctx, { cuerpo: '#c98a4b', botas: '#a86c36' }) // no-tema: colores horneados en la imagen
    // Barriga clara y collar.
    bulto(ctx, CX, 61, 6.4, 8.4, paleta('#f4dfba'), { sinCanto: true }) // no-tema: colores horneados en la imagen
    linea(ctx, [[CX - 9.4, 48.6], [CX, 51.6], [CX + 9.4, 48.6]], '#d63a3a', 3.2) // no-tema: colores horneados en la imagen
    bulto(ctx, CX, 53.6, 1.9, 1.9, paleta('#f5c842')) // no-tema: colores horneados en la imagen
    brazos(ctx, '#c98a4b') // no-tema: colores horneados en la imagen
    // Orejas caídas.
    const oreja = paleta('#7a4a24') // no-tema: colores horneados en la imagen
    bulto(ctx, CX - 14.4, 26.4, 4.8, 9.6, oreja, { giro: 0.32 })
    bulto(ctx, CX + 14.4, 26.4, 4.8, 9.6, oreja, { giro: -0.32 })
    bulto(ctx, CX, 31, 15.2, 14.8, pelaje, { brillo: true })
    // Mancha en un ojo.
    bulto(ctx, CX - 6.2, 29.4, 4.6, 4.4, paleta('#7a4a24'), { sinCanto: true }) // no-tema: colores horneados en la imagen
    ojos(ctx, 30.4)
    // Hocico.
    bulto(ctx, CX, 37.4, 8.2, 6, paleta('#f4dfba'), { sinCanto: true }) // no-tema: colores horneados en la imagen
    bulto(ctx, CX, 34.4, 3.3, 2.3, paleta('#3a3340'), { sinCanto: true }) // no-tema: colores horneados en la imagen
    ctx.strokeStyle = 'rgba(40,24,30,.8)'
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(CX, 36)
    ctx.lineTo(CX, 38.6)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(CX - 2.2, 38.6, 2.2, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.arc(CX + 2.2, 38.6, 2.2, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.stroke()
    bulto(ctx, CX, 42, 2.3, 2.9, paleta('#f08aa0'), { sinCanto: true }) // no-tema: colores horneados en la imagen
  },
  raposo(ctx) {
    const pelaje = paleta('#ec7a2e') // no-tema: colores horneados en la imagen
    const blanco = paleta('#fff6ea') // no-tema: colores horneados en la imagen
    // Cola grande con la punta blanca.
    bulto(ctx, CX + 15.4, 62, 5.6, 12.4, pelaje, { giro: -0.7 })
    bulto(ctx, CX + 21.2, 52.2, 3.6, 4.2, blanco, { giro: -0.7 })
    cuerpoBase(ctx, { cuerpo: '#ec7a2e', botas: '#3b2418' }) // no-tema: colores horneados en la imagen
    bulto(ctx, CX, 60.6, 6.4, 9.2, blanco, { sinCanto: true })
    brazos(ctx, '#ec7a2e') // no-tema: colores horneados en la imagen
    // Orejas en punta.
    for (const lado of [-1, 1]) {
      forma(
        ctx,
        () => {
          ctx.moveTo(CX + lado * 5, 19)
          ctx.lineTo(CX + lado * 13.4, 3.2)
          ctx.lineTo(CX + lado * 15.4, 22.6)
          ctx.closePath()
        },
        pelaje,
        CX + lado * 11,
        14,
        9
      )
      ctx.fillStyle = '#3b2418' // no-tema: colores horneados en la imagen
      ctx.beginPath()
      ctx.moveTo(CX + lado * 9, 15.6)
      ctx.lineTo(CX + lado * 13.4, 7.6)
      ctx.lineTo(CX + lado * 13.6, 18)
      ctx.closePath()
      ctx.fill()
    }
    bulto(ctx, CX, 31, 15.2, 14.6, pelaje, { brillo: true })
    // Mofletes blancos en pico.
    forma(
      ctx,
      () => {
        ctx.moveTo(CX - 14.4, 33)
        ctx.quadraticCurveTo(CX - 6, 34, CX, 45.2)
        ctx.quadraticCurveTo(CX + 6, 34, CX + 14.4, 33)
        ctx.quadraticCurveTo(CX + 10, 42.6, CX, 44.6)
        ctx.quadraticCurveTo(CX - 10, 42.6, CX - 14.4, 33)
        ctx.closePath()
      },
      blanco,
      CX,
      38,
      12,
      true
    )
    ojos(ctx, 29.6, 5.4)
    bulto(ctx, CX, 40.4, 2.6, 2, paleta('#2a1f2b'), { sinCanto: true }) // no-tema: colores horneados en la imagen
    ctx.strokeStyle = 'rgba(40,24,30,.8)'
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(CX - 2, 42, 2, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.arc(CX + 2, 42, 2, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.stroke()
  },
}

/** Concha de vieira: abanico con estrías. */
function concha(ctx: Ctx, x: number, y: number, r: number): void {
  const p = paleta('#fff1c2') // no-tema: colores horneados en la imagen
  forma(
    ctx,
    () => {
      ctx.moveTo(x, y + r * 0.9)
      ctx.arc(x, y + r * 0.3, r * 1.1, Math.PI * 1.08, Math.PI * 1.92)
      ctx.closePath()
    },
    p,
    x,
    y,
    r
  )
  ctx.strokeStyle = 'rgba(150,110,40,.7)'
  ctx.lineWidth = 0.8
  for (const a of [1.3, 1.5, 1.7]) {
    ctx.beginPath()
    ctx.moveTo(x, y + r * 0.9)
    ctx.lineTo(x + Math.cos(Math.PI * a) * r * 1.3, y + r * 0.3 + Math.sin(Math.PI * a) * r * 1.3)
    ctx.stroke()
  }
}

function estrella(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const radio = i % 2 === 0 ? r : r * 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const px = x + Math.cos(a) * radio
    const py = y + Math.sin(a) * radio
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

// ------------------------------------------------------------ API

function lienzoNuevo(ancho: number, alto: number, escala: number): { lienzo: HTMLCanvasElement; ctx: Ctx } | null {
  if (typeof document === 'undefined') return null
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * escala
  lienzo.height = alto * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  return { lienzo, ctx }
}

/** El muñeco, en el lienzo lógico de 64 × 84 (lo que el mapa registra con `pixelRatio: 3`). */
export function dibujarPersonaje(personaje: string): ImageData | null {
  const id: Personaje = esPersonaje(personaje) ? personaje : 'explorador'
  const nuevo = lienzoNuevo(ANCHO_PERSONAJE_PX, ALTO_PERSONAJE_PX, ESCALA)
  if (!nuevo) return null
  PERSONAJES_DIBUJO[id](nuevo.ctx)
  return nuevo.ctx.getImageData(0, 0, nuevo.lienzo.width, nuevo.lienzo.height)
}

/**
 * El muñeco como lienzo, para el popup y el selector (DOM). Con un fondo
 * circular opcional del color del equipo, como una ficha.
 */
export function lienzoDePersonaje(personaje: string, lado: number, fondo?: string): HTMLCanvasElement | null {
  const escala = Math.max(2, Math.ceil((typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) * 1.5))
  const nuevo = lienzoNuevo(lado, lado, escala)
  if (!nuevo) return null
  const { ctx, lienzo } = nuevo
  if (fondo) {
    ctx.fillStyle = fondo
    ctx.beginPath()
    ctx.arc(lado / 2, lado / 2, lado / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  const datos = dibujarPersonaje(personaje)
  if (datos) {
    const fuente = document.createElement('canvas')
    fuente.width = datos.width
    fuente.height = datos.height
    fuente.getContext('2d')?.putImageData(datos, 0, 0)
    // Recortado al muñeco (de la gorra a las botas) y centrado.
    const alto = lado * 0.94
    const ancho = (alto * 52) / 78
    ctx.drawImage(fuente, 6 * ESCALA, 2 * ESCALA, 52 * ESCALA, 78 * ESCALA, (lado - ancho) / 2, lado * 0.04, ancho, alto)
  }
  return lienzo
}

// ------------------------------------------------------------ suelo del jugador

/** Lado del lienzo del suelo, en px lógicos: cabe el aro, la sombra y la flecha de rumbo. */
export const LADO_SUELO_JUGADOR_PX = 96

/**
 * El suelo de un jugador, TUMBADO en el mapa: sombra blanda, aro del color
 * del equipo y, si `conRumbo`, una flecha hacia el norte de la imagen (el
 * mapa la gira con el rumbo). Es simétrico salvo la flecha, así que sirve
 * igual sin ella. Mismo lenguaje que el suelo de los nodos: sombra, aro de
 * color que se difumina hacia fuera y brillo en el canto.
 */
export function dibujarSueloDeJugador(color: string, conRumbo: boolean): ImageData | null {
  const escala = 3
  const nuevo = lienzoNuevo(LADO_SUELO_JUGADOR_PX, LADO_SUELO_JUGADOR_PX, escala)
  if (!nuevo) return null
  const { ctx, lienzo } = nuevo
  const c = LADO_SUELO_JUGADOR_PX / 2

  // Sombra del muñeco.
  const sombra = ctx.createRadialGradient(c, c, 4, c, c, 22)
  sombra.addColorStop(0, 'rgba(0,0,0,.55)')
  sombra.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sombra
  ctx.beginPath()
  ctx.arc(c, c, 22, 0, Math.PI * 2)
  ctx.fill()

  // Aro del color del equipo: canto blanco fino por fuera, cuerpo de color, difuminado.
  const aro = ctx.createRadialGradient(c, c, 12, c, c, 23)
  aro.addColorStop(0, color + '00')
  aro.addColorStop(0.45, color + 'dd')
  aro.addColorStop(0.8, color + 'ff')
  aro.addColorStop(1, color + '00')
  ctx.fillStyle = aro
  ctx.beginPath()
  ctx.arc(c, c, 23, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = 'rgba(255,255,255,.92)'
  ctx.beginPath()
  ctx.arc(c, c, 18.6, 0, Math.PI * 2)
  ctx.stroke()

  if (conRumbo) {
    // Flecha: punta hacia arriba (norte de la imagen), apoyada en el aro.
    ctx.save()
    ctx.translate(c, c)
    const cuerpo = ctx.createLinearGradient(0, -44, 0, -16)
    cuerpo.addColorStop(0, '#ffffff')
    cuerpo.addColorStop(1, color)
    ctx.fillStyle = cuerpo
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(11,18,32,.65)' // no-tema: canto horneado en la imagen
    ctx.beginPath()
    ctx.moveTo(0, -45)
    ctx.lineTo(10.5, -24)
    ctx.lineTo(3.6, -27)
    ctx.lineTo(0, -21)
    ctx.lineTo(-3.6, -27)
    ctx.lineTo(-10.5, -24)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

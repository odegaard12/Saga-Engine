import { LEJOS, alcanceLuz, profundidad, velocidadCamino } from './dinamo'

/**
 * Dinamo «La luz de la bici» (22/11/2026, propuesta C elegida por Óscar): el lienzo de la escena.
 *
 * De noche, en bici, por un camino entre árboles hacia una aldea con su molino. Un solo `<canvas>` 2D: todo lo que no
 * cambia (cielo, montes, árboles, manillar, aldea, el haz del faro) se pinta UNA vez en lienzos aparte al cambiar de
 * tamaño, y cada fotograma sólo copia trozos con `drawImage` y rellena unas pocas formas. Sin objetos nuevos por
 * fotograma: posiciones en arrays fijos, textos constantes, sin degradados nuevos.
 *
 * Perspectiva: un punto del camino a profundidad z (1 = la bici, LEJOS = la aldea) se ve a 1/z de la altura entre la
 * fuga y la parte de abajo, y su anchura también va con 1/z: el camino es un triángulo exacto, así que el haz del
 * faro es un único dibujo que se recorta por filas a la profundidad que alcanza la luz.
 *
 * Colores: variables `--dn-*` del CSS de la pantalla (la escena es de noche en todos los temas).
 */

export const VARIABLES = {
  cielo1: '--dn-cielo-1',
  cielo2: '--dn-cielo-2',
  cielo3: '--dn-cielo-3',
  luna: '--dn-luna',
  estrella: '--dn-estrella',
  monteLejos: '--dn-monte-lejos',
  monteMedio: '--dn-monte-medio',
  suelo: '--dn-suelo',
  arbol: '--dn-arbol',
  arbolLuz: '--dn-arbol-luz',
  asfalto: '--dn-asfalto',
  raya: '--dn-raya',
  luz: '--dn-luz',
  luz2: '--dn-luz-2',
  ventana: '--dn-ventana',
  reflector: '--dn-reflector',
  niebla: '--dn-niebla',
  agua: '--dn-agua',
  casa: '--dn-casa',
  metal: '--dn-metal',
  luciernaga: '--dn-luciernaga',
} as const

export type Paleta = { -readonly [K in keyof typeof VARIABLES]: string }

export function leerPaleta(el: Element): Paleta {
  const cs = getComputedStyle(el)
  const p = {} as Paleta
  for (const k of Object.keys(VARIABLES) as (keyof Paleta)[])
    p[k] = cs.getPropertyValue(VARIABLES[k]).trim() || 'black'
  return p
}

/** Lo que la pantalla le cuenta al lienzo (un objeto que se reescribe, nunca se crea de nuevo). */
export interface EstadoEscena {
  /** Ritmo relativo (1 = el ritmo cómodo calibrado). */
  rel: number
  /** Carga de la fase (0..1) = hasta dónde llega la luz. */
  carga: number
  /** Cuesta (fase lenta) o bajada (rápida). */
  lenta: boolean
  dentro: boolean
  /** Pedaleando (calibrando o jugando). */
  activo: boolean
  /** performance.now() del último tramo terminado (0 = ninguno). */
  celebrar: number
  hecho: boolean
}

export const CELEBRAR_MS = 1400

const ETIQUETAS = ['25%', '50%', '75%']
const HITOS = [0.25, 0.5, 0.75]
const N_ARBOLES = 26
const N_POSTES = 16
const N_ITEMS = N_ARBOLES + N_POSTES + HITOS.length
const N_LUCIERNAGAS = 9
const N_TITILAN = 16
const VANO_ARBOLES = 15
const VANO_POSTES = 16

const mod = (a: number, n: number) => ((a % n) + n) % n
const lim = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x)
const suave = (a: number, b: number, x: number) => {
  const t = lim((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const rgb = (c: string): [number, number, number] => {
  const h = c.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (x) => x + x) : h.slice(0, 6), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lienzo(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}

/** Un color del CSS con otra opacidad (los degradados a `transparent` oscurecen el borde: van hacia negro). */
const conAlfa = (c: string, a: number) => {
  const [r, g, b] = rgb(c)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Halo redondo (para la luna, el faro, ventanas, reflectores y luciérnagas): centro vivo y borde muy suave. */
function halo(color: string, r: number): HTMLCanvasElement {
  const [c, g] = lienzo(r * 2, r * 2)
  const gr = g.createRadialGradient(r, r, 0, r, r, r)
  gr.addColorStop(0, conAlfa(color, 1))
  gr.addColorStop(0.2, conAlfa(color, 0.55))
  gr.addColorStop(0.5, conAlfa(color, 0.16))
  gr.addColorStop(1, conAlfa(color, 0))
  g.fillStyle = gr
  g.fillRect(0, 0, r * 2, r * 2)
  return c
}

export function crearEscena(destino: HTMLCanvasElement, p: Paleta) {
  const ctx = destino.getContext('2d')
  if (!ctx) return null
  const c2 = ctx

  let W = 0
  let H = 0
  let dpr = 1
  // Lienzos pintados una vez por tamaño.
  let cielo: HTMLCanvasElement | null = null
  let montes: HTMLCanvasElement | null = null
  let vineta: HTMLCanvasElement | null = null
  let cono: HTMLCanvasElement | null = null
  let manillar: HTMLCanvasElement | null = null
  let aldea: HTMLCanvasElement | null = null
  let aldeaLuz: HTMLCanvasElement | null = null
  let niebla: HTMLCanvasElement | null = null
  let grano: HTMLCanvasElement | null = null
  // El haz recortado a su alcance de cada fotograma (se reusa: borrar, copiar el haz, enmascarar el final).
  let conoVivo: HTMLCanvasElement | null = null
  let cv: CanvasRenderingContext2D | null = null
  const [mascara, gmasc] = lienzo(1, 64)
  {
    const gm = gmasc.createLinearGradient(0, 0, 0, 64)
    gm.addColorStop(0, conAlfa(p.luz, 1))
    gm.addColorStop(1, conAlfa(p.luz, 0))
    gmasc.fillStyle = gm
    gmasc.fillRect(0, 0, 1, 64)
  }
  const anchoPlaca: number[] = [30, 30, 30]
  const arboles: HTMLCanvasElement[] = []
  const arbolesLuz: HTMLCanvasElement[] = []
  const haloLuz = halo(p.luz, 64)
  const haloVentana = halo(p.ventana, 32)
  const haloRojo = halo(p.reflector, 32)
  const haloBicho = halo(p.luciernaga, 16)

  // Disposición fija (semilla constante: la misma escena siempre).
  let semilla = 20261122
  const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647
  const arbZ = new Float32Array(N_ARBOLES)
  const arbX = new Float32Array(N_ARBOLES)
  const arbTipo = new Uint8Array(N_ARBOLES)
  const arbTam = new Float32Array(N_ARBOLES)
  for (let i = 0; i < N_ARBOLES; i += 1) {
    const lado = i % 2 === 0 ? -1 : 1
    arbZ[i] = (i * VANO_ARBOLES) / N_ARBOLES + azar() * 0.4
    arbX[i] = lado * (1.5 + azar() * 1.6)
    arbTipo[i] = Math.floor(azar() * 3)
    arbTam[i] = 0.8 + azar() * 0.5
  }
  const estrellasX = new Float32Array(N_TITILAN)
  const estrellasY = new Float32Array(N_TITILAN)
  const estrellasF = new Float32Array(N_TITILAN)
  for (let i = 0; i < N_TITILAN; i += 1) {
    estrellasX[i] = azar()
    estrellasY[i] = azar() * 0.85
    estrellasF[i] = 0.6 + azar() * 1.8
  }
  const bichoX = new Float32Array(N_LUCIERNAGAS)
  const bichoY = new Float32Array(N_LUCIERNAGAS)
  const bichoF = new Float32Array(N_LUCIERNAGAS)
  for (let i = 0; i < N_LUCIERNAGAS; i += 1) {
    const lado = i % 2 === 0 ? -1 : 1
    bichoX[i] = 0.5 + lado * (0.3 + azar() * 0.18)
    bichoY[i] = 0.08 + azar() * 0.3
    bichoF[i] = azar() * 6.28
  }
  // Lista de cosas al borde del camino, ordenada de lejos a cerca en cada fotograma (por inserción, sin crear nada).
  const itemZ = new Float32Array(N_ITEMS)
  const orden = new Int16Array(N_ITEMS)

  // Estado del dibujo (suavizado entre lecturas del juego, a 60 fps).
  let avance = 0
  let vel = 0
  let luz = alcanceLuz(0)
  let incl = 1
  let pedal = 0
  let rueda = 0
  let pueblo = 0.3

  // Geometría del fotograma.
  let cx = 0
  let f = 0
  let yH = 0
  let yV = 0
  let yB = 0
  let camX = 0

  function pintarFijos() {
    const w = W * dpr
    const h = H * dpr
    const k = dpr
    yH = H * 0.4
    // Cielo: degradado, Vía Láctea tenue, estrellas fijas y la luna con su halo.
    let g: CanvasRenderingContext2D
    ;[cielo, g] = lienzo(w + 12 * k, h)
    const gc = g.createLinearGradient(0, 0, 0, yH * k)
    gc.addColorStop(0, p.cielo1)
    gc.addColorStop(0.62, p.cielo2)
    gc.addColorStop(1, p.cielo3)
    g.fillStyle = gc
    g.fillRect(0, 0, w + 12 * k, yH * k + 2)
    g.save()
    g.translate(w * 0.35, h * 0.12)
    g.rotate(-0.5)
    g.scale(1, 0.22)
    const lactea = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.6)
    lactea.addColorStop(0, p.estrella)
    lactea.addColorStop(1, conAlfa(p.estrella, 0))
    g.globalAlpha = 0.07
    g.fillStyle = lactea
    g.fillRect(-w, -w, w * 2, w * 2)
    g.restore()
    g.fillStyle = p.estrella
    for (let i = 0; i < 110; i += 1) {
      const y = Math.pow(azar(), 1.4) * yH * k * 0.95
      g.globalAlpha = 0.25 + azar() * 0.5
      g.fillRect(azar() * (w + 12 * k), y, k * (azar() < 0.15 ? 1.6 : 1), k * (azar() < 0.15 ? 1.6 : 1))
    }
    const lr = Math.max(10, W * 0.042) * k
    const lx = w * 0.7
    const ly = h * 0.12
    g.globalAlpha = 0.5
    g.drawImage(haloLuz, lx - lr * 7, ly - lr * 7, lr * 14, lr * 14)
    g.globalAlpha = 1
    const gl = g.createRadialGradient(lx - lr * 0.3, ly - lr * 0.3, lr * 0.1, lx, ly, lr)
    gl.addColorStop(0, p.luna)
    gl.addColorStop(1, p.luz)
    g.fillStyle = gl
    g.beginPath()
    g.arc(lx, ly, lr, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = p.cielo3
    g.globalAlpha = 0.14
    for (const [dx, dy, r] of [
      [-0.3, -0.2, 0.22],
      [0.25, 0.15, 0.3],
      [-0.1, 0.4, 0.14],
    ]) {
      g.beginPath()
      g.arc(lx + dx * lr, ly + dy * lr, r * lr, 0, Math.PI * 2)
      g.fill()
    }
    // Montes lejanos, con la bruma del aire encima de su falda.
    g.globalAlpha = 1
    g.fillStyle = p.monteLejos
    g.beginPath()
    g.moveTo(0, yH * k)
    for (let x = 0; x <= w + 12 * k; x += 4 * k) {
      const u = x / (w + 12 * k)
      g.lineTo(x, (yH - H * (0.07 + 0.045 * Math.sin(u * 7.1 + 1) + 0.025 * Math.sin(u * 17.3))) * k)
    }
    g.lineTo(w + 12 * k, yH * k + 2)
    g.lineTo(0, yH * k + 2)
    g.fill()
    const bruma = g.createLinearGradient(0, (yH - H * 0.12) * k, 0, yH * k)
    bruma.addColorStop(0, conAlfa(p.niebla, 0))
    bruma.addColorStop(1, p.niebla)
    g.globalAlpha = 0.28
    g.fillStyle = bruma
    g.fillRect(0, (yH - H * 0.12) * k, w + 12 * k, H * 0.12 * k + 2)

    // Montes medios con pinos en la cresta, y el suelo hasta abajo.
    ;[montes, g] = lienzo(w + 30 * k, h)
    g.fillStyle = p.monteMedio
    g.beginPath()
    g.moveTo(0, yH * k + 2)
    const cresta = (u: number) => yH - H * (0.03 + 0.03 * Math.sin(u * 4.3 + 2.2) + 0.012 * Math.sin(u * 13))
    for (let x = 0; x <= w + 30 * k; x += 3 * k) g.lineTo(x, cresta(x / (w + 30 * k)) * k)
    g.lineTo(w + 30 * k, yH * k + 2)
    g.fill()
    for (let x = 0; x <= w + 30 * k; x += (5 + azar() * 9) * k) {
      const y = cresta(x / (w + 30 * k)) * k
      const th = (4 + azar() * 7) * k
      g.beginPath()
      g.moveTo(x - th * 0.32, y + 2)
      g.lineTo(x, y - th)
      g.lineTo(x + th * 0.32, y + 2)
      g.fill()
    }
    const gs = g.createLinearGradient(0, yH * k, 0, h)
    gs.addColorStop(0, p.monteMedio)
    gs.addColorStop(0.15, p.suelo)
    gs.addColorStop(1, p.cielo1)
    g.fillStyle = gs
    g.fillRect(0, yH * k, w + 30 * k, h - yH * k)
    g.globalAlpha = 0.22
    const bh = g.createLinearGradient(0, (yH - H * 0.04) * k, 0, (yH + H * 0.06) * k)
    bh.addColorStop(0, conAlfa(p.niebla, 0))
    bh.addColorStop(0.5, p.niebla)
    bh.addColorStop(1, conAlfa(p.niebla, 0))
    g.fillStyle = bh
    g.fillRect(0, (yH - H * 0.04) * k, w + 30 * k, H * 0.1 * k)

    // Viñeta: esquinas más oscuras, para que la mirada vaya al camino.
    ;[vineta, g] = lienzo(w, h)
    const gv = g.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.78)
    gv.addColorStop(0, conAlfa(p.cielo1, 0))
    gv.addColorStop(1, p.cielo1)
    g.globalAlpha = 0.75
    g.fillStyle = gv
    g.fillRect(0, 0, w, h)

    // El haz del faro sobre el asfalto (ver la cabecera): fila = 1/z, columna = lateral en unidades de camino × z.
    const CW = 192
    const CH = 256
    ;[cono, g] = lienzo(CW, CH)
    const img = g.createImageData(CW, CH)
    const [r1, g1, b1] = rgb(p.luz)
    const [r2, g2, b2] = rgb(p.luz2)
    for (let j = 0; j < CH; j += 1) {
      const s = (j + 0.5) / CH
      const z = 1 / s
      const lejos = lim((z - 1) / (LEJOS - 1))
      const fuerza = 0.25 + 0.75 / (1 + 0.14 * Math.pow(Math.max(0, z - 1), 1.2))
      const haz = 0.42 + 0.07 * z
      for (let i = 0; i < CW; i += 1) {
        const X = Math.abs(((i + 0.5) / CW) * 2 - 1) * 1.6 * z
        let a = fuerza * (1 - suave(haz * 0.55, haz * 1.15, X))
        a += fuerza * 0.22 * (1 - suave(haz, haz * 2.3, X))
        a = lim(a * (z > LEJOS + 0.5 ? 0 : 1))
        const o = (j * CW + i) * 4
        img.data[o] = r1 + (r2 - r1) * lejos
        img.data[o + 1] = g1 + (g2 - g1) * lejos
        img.data[o + 2] = b1 + (b2 - b1) * lejos
        img.data[o + 3] = a * 150
      }
    }
    g.putImageData(img, 0, 0)
    ;[conoVivo, cv] = lienzo(W, H)
    // Grano del asfalto: motas más grandes cerca (perspectiva). Se multiplica: sólo se ve donde hay luz.
    ;[grano, g] = lienzo(w, h)
    g.fillStyle = p.raya
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 2600; i += 1) {
      const y = yH * k + Math.pow(azar(), 0.8) * (h - yH * k)
      const cerca = (y / k - yH) / (H - yH)
      const t = (0.6 + cerca * 2.6) * k
      g.globalAlpha = 0.12 + azar() * 0.22
      g.fillStyle = azar() < 0.5 ? p.metal : p.asfalto
      g.fillRect(azar() * w, y, t * (1 + azar()), t * 0.6)
    }
    g.globalAlpha = 1
    c2.font = '800 10px system-ui, sans-serif'
    for (let i = 0; i < ETIQUETAS.length; i += 1) anchoPlaca[i] = Math.ceil(c2.measureText(ETIQUETAS[i]).width) + 10

    // Árboles: pino, eucalipto y castaño, cada uno en sombra y con la luz cálida del faro (para mezclar al acercarse).
    arboles.length = 0
    arbolesLuz.length = 0
    const AH = Math.round(Math.min(220, H * 0.7) * k)
    for (let tipo = 0; tipo < 3; tipo += 1) {
      for (const [color, lista] of [
        [p.arbol, arboles],
        [p.arbolLuz, arbolesLuz],
      ] as const) {
        const aw = Math.round(AH * (tipo === 1 ? 0.5 : 0.62))
        const [c, a] = lienzo(aw, AH)
        a.fillStyle = color
        const mx = aw / 2
        a.fillRect(mx - AH * 0.02, AH * 0.55, AH * 0.04, AH * 0.45)
        if (tipo === 0) {
          // Pino: pisos de ramas.
          for (let n = 0; n < 6; n += 1) {
            const y0 = AH * (0.04 + n * 0.13)
            const ancho = aw * (0.18 + n * 0.065)
            a.beginPath()
            a.moveTo(mx, y0)
            a.lineTo(mx + ancho, y0 + AH * 0.2)
            a.lineTo(mx - ancho, y0 + AH * 0.2)
            a.fill()
          }
        } else if (tipo === 1) {
          // Eucalipto: tronco alto y fino con copas sueltas.
          a.fillRect(mx - AH * 0.015, AH * 0.2, AH * 0.03, AH * 0.8)
          for (const [dx, dy, r] of [
            [0, 0.12, 0.16],
            [-0.18, 0.24, 0.13],
            [0.2, 0.3, 0.12],
            [-0.05, 0.38, 0.14],
            [0.12, 0.08, 0.1],
          ]) {
            a.beginPath()
            a.ellipse(mx + dx * aw, dy * AH, r * aw, r * AH * 0.7, 0, 0, Math.PI * 2)
            a.fill()
          }
        } else {
          // Castaño: copa redonda y ancha.
          for (const [dx, dy, r] of [
            [0, 0.3, 0.36],
            [-0.24, 0.42, 0.26],
            [0.26, 0.4, 0.27],
            [0, 0.5, 0.3],
          ]) {
            a.beginPath()
            a.arc(mx + dx * aw, dy * AH, r * aw, 0, Math.PI * 2)
            a.fill()
          }
        }
        if (color === p.arbolLuz) {
          // La luz viene de abajo: se apaga hacia la copa.
          a.globalCompositeOperation = 'destination-in'
          const gm = a.createLinearGradient(0, AH, 0, 0)
          gm.addColorStop(0, 'black')
          gm.addColorStop(0.55, conAlfa(p.cielo1, 0))
          a.fillStyle = gm
          a.fillRect(0, 0, aw, AH)
        }
        lista.push(c)
      }
    }

    // La aldea: casas, iglesia y el molino junto al río (la rueda se pinta aparte, gira).
    const VW = Math.round(W * 0.62 * k)
    const VH = Math.round(VW * 0.42)
    ;[aldea, g] = lienzo(VW, VH)
    const casas: [number, number, number, number][] = [
      [0.08, 0.16, 0.42, 0],
      [0.22, 0.12, 0.34, 0],
      [0.33, 0.07, 0.75, 1],
      [0.4, 0.16, 0.38, 0],
      [0.56, 0.14, 0.46, 0],
      [0.69, 0.12, 0.33, 0],
    ]
    g.fillStyle = p.casa
    g.fillRect(0, VH * 0.82, VW, VH * 0.18)
    for (const [x0, ancho, alto, torre] of casas) {
      const x = x0 * VW
      const wv = ancho * VW
      const top = VH * (0.86 - alto * 0.62)
      g.fillRect(x, top, wv, VH * 0.86 - top)
      g.beginPath()
      g.moveTo(x - wv * 0.08, top + 1)
      g.lineTo(x + wv / 2, top - (torre ? wv * 0.9 : wv * 0.38))
      g.lineTo(x + wv * 1.08, top + 1)
      g.fill()
    }
    // Molino: casa baja a la derecha, el río pasa por debajo hacia el camino.
    g.fillRect(VW * 0.8, VH * 0.56, VW * 0.14, VH * 0.3)
    g.beginPath()
    g.moveTo(VW * 0.78, VH * 0.57)
    g.lineTo(VW * 0.87, VH * 0.42)
    g.lineTo(VW * 0.96, VH * 0.57)
    g.fill()
    g.strokeStyle = p.agua
    g.lineWidth = VH * 0.06
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(VW * 0.99, VH * 0.84)
    g.quadraticCurveTo(VW * 0.82, VH * 0.95, VW * 0.62, VH * 0.99)
    g.stroke()
    g.strokeStyle = p.luna
    g.globalAlpha = 0.5
    g.lineWidth = Math.max(1, VH * 0.012)
    g.beginPath()
    g.moveTo(VW * 0.93, VH * 0.87)
    g.lineTo(VW * 0.86, VH * 0.9)
    g.moveTo(VW * 0.78, VH * 0.94)
    g.lineTo(VW * 0.72, VH * 0.95)
    g.stroke()
    // Las ventanas encendidas y su halo (capa aparte: se funde de apagada a encendida).
    ;[aldeaLuz, g] = lienzo(VW, VH)
    const ventanas: [number, number][] = [
      [0.12, 0.6],
      [0.19, 0.6],
      [0.26, 0.66],
      [0.36, 0.42],
      [0.45, 0.62],
      [0.5, 0.7],
      [0.6, 0.58],
      [0.66, 0.7],
      [0.73, 0.64],
      [0.84, 0.68],
      [0.9, 0.68],
    ]
    const vw = Math.max(2, VW * 0.022)
    for (const [x, y] of ventanas) {
      g.globalAlpha = 0.55
      g.drawImage(haloVentana, x * VW - vw * 3, y * VH - vw * 3, vw * 6, vw * 6)
      g.globalAlpha = 1
      g.fillStyle = p.ventana
      g.fillRect(x * VW - vw / 2, y * VH - vw * 0.6, vw, vw * 1.2)
    }
    g.globalAlpha = 0.35
    g.drawImage(haloVentana, VW * 0.1, VH * 0.2, VW * 0.8, VH * 0.9)

    // Bruma a ras de suelo: manchas sueltas, se desliza despacio.
    ;[niebla, g] = lienzo(w, H * 0.22 * k)
    for (let i = 0; i < 14; i += 1) {
      const r = (0.08 + azar() * 0.12) * w
      const x = azar() * w
      const y = H * 0.11 * k + (azar() - 0.5) * H * 0.08 * k
      const gn = g.createRadialGradient(x, y, 0, x, y, r)
      gn.addColorStop(0, p.niebla)
      gn.addColorStop(1, conAlfa(p.niebla, 0))
      g.globalAlpha = 0.16
      g.fillStyle = gn
      for (const dx of [-w, 0, w]) {
        g.save()
        g.translate(x + dx, y)
        g.scale(1, 0.32)
        g.translate(-x - dx, -y)
        g.beginPath()
        g.arc(x + dx, y, r, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
    }

    // El manillar visto desde el sillín, con el faro en el centro (la lente y su luz se pintan aparte).
    const MW = Math.round(W * k)
    const MH = Math.round(H * 0.3 * k)
    ;[manillar, g] = lienzo(MW, MH)
    const m = MW / 2
    g.lineCap = 'round'
    // Rueda delantera asomando.
    g.fillStyle = p.cielo1
    g.beginPath()
    g.ellipse(m, MH * 1.05, MW * 0.07, MH * 0.5, 0, Math.PI, 0)
    g.fill()
    g.strokeStyle = p.metal
    g.globalAlpha = 0.5
    g.lineWidth = MH * 0.02
    g.stroke()
    g.globalAlpha = 1
    // Potencia y horquilla.
    g.strokeStyle = p.casa
    g.lineWidth = MH * 0.12
    g.beginPath()
    g.moveTo(m, MH)
    g.lineTo(m, MH * 0.5)
    g.stroke()
    // Manillar: barra con brillo arriba (semi 3D).
    const barra = (ancho: number, color: string, dy: number) => {
      g.strokeStyle = color
      g.lineWidth = ancho
      g.beginPath()
      g.moveTo(MW * 0.06, MH * 0.36 + dy)
      g.bezierCurveTo(MW * 0.3, MH * 0.6 + dy, MW * 0.7, MH * 0.6 + dy, MW * 0.94, MH * 0.36 + dy)
      g.stroke()
    }
    barra(MH * 0.11, p.casa, 0)
    barra(MH * 0.03, p.metal, -MH * 0.03)
    // Puños y manetas.
    g.fillStyle = p.cielo1
    for (const lado of [-1, 1]) {
      g.save()
      g.translate(m + lado * MW * 0.4, MH * 0.4)
      g.rotate(lado * 0.48)
      g.beginPath()
      g.roundRect(-MW * 0.075, -MH * 0.085, MW * 0.15, MH * 0.17, MH * 0.07)
      g.fill()
      g.strokeStyle = p.metal
      g.globalAlpha = 0.35
      g.lineWidth = MH * 0.015
      g.beginPath()
      g.moveTo(-MW * 0.06, -MH * 0.05)
      g.lineTo(MW * 0.06, -MH * 0.05)
      g.stroke()
      g.globalAlpha = 1
      g.restore()
      g.strokeStyle = p.metal
      g.lineWidth = MH * 0.025
      g.beginPath()
      g.moveTo(m + lado * MW * 0.3, MH * 0.48)
      g.quadraticCurveTo(m + lado * MW * 0.36, MH * 0.62, m + lado * MW * 0.45, MH * 0.6)
      g.stroke()
    }
    // Carcasa del faro con aro cromado.
    const fr = MH * 0.2
    const gf = g.createLinearGradient(m - fr, MH * 0.3 - fr, m + fr, MH * 0.3 + fr)
    gf.addColorStop(0, p.raya)
    gf.addColorStop(0.5, p.metal)
    gf.addColorStop(1, p.casa)
    g.fillStyle = gf
    g.beginPath()
    g.arc(m, MH * 0.3, fr, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = p.casa
    g.beginPath()
    g.arc(m, MH * 0.3, fr * 0.78, 0, Math.PI * 2)
    g.fill()
  }

  /** y en pantalla de una profundidad (con la inclinación del tramo ya en yV). */
  const yDe = (z: number) => yV + (yB - yV) / z

  /** Banda del camino (una raya) entre dos profundidades, en coordenadas sin sesgo. */
  function banda(X: number, ancho: number, z0: number, z1: number) {
    const s0 = 1 / z0
    const s1 = 1 / z1
    const y0 = yV + (yB - yV) * s0
    const y1 = yV + (yB - yV) * s1
    c2.beginPath()
    c2.moveTo(cx + (X - ancho) * f * s0, y0)
    c2.lineTo(cx + (X + ancho) * f * s0, y0)
    c2.lineTo(cx + (X + ancho) * f * s1, y1)
    c2.lineTo(cx + (X - ancho) * f * s1, y1)
    c2.fill()
  }

  function redimensionar(w: number, h: number, escala: number) {
    if (w < 10 || h < 10) return
    if (w === W && h === H && escala === dpr) return
    W = w
    H = h
    dpr = escala
    destino.width = Math.round(w * escala)
    destino.height = Math.round(h * escala)
    semilla = 777
    pintarFijos()
  }

  /**
   * Un fotograma. `dt` en ms; `animar` = false pinta la escena quieta (movimiento reducido): sin desplazar, sin
   * titilar ni parpadear, pero con la luz a la longitud de ahora.
   */
  function dibujar(ahora: number, dtMs: number, e: EstadoEscena, animar: boolean) {
    if (!cielo || !montes || !cono || !manillar || !aldea || !aldeaLuz || !niebla || !vineta) return
    const dt = animar ? Math.min(0.1, Math.max(0, dtMs / 1000)) : 1
    const k = (tau: number) => (animar ? 1 - Math.exp(-dt / tau) : 1)
    const celebrando = e.celebrar > 0 && ahora - e.celebrar < CELEBRAR_MS
    const lleno = e.hecho || celebrando

    vel += ((e.activo ? velocidadCamino(e.rel) : 0) - vel) * k(0.35)
    if (animar) {
      avance += vel * dt
      pedal += vel * dt * 2.2
      rueda += dt * (pueblo > 0.6 ? 3.2 : 0.5)
    }
    luz += ((lleno ? 1 : alcanceLuz(e.carga)) - luz) * k(lleno ? 0.25 : 0.18)
    incl += ((e.lenta ? 1 : -1) - incl) * k(0.8)
    pueblo += ((lleno ? 1 : 0.3 + 0.45 * suave(0.7, 1, luz)) - pueblo) * k(0.3)
    // Fuera de ritmo el faro titila y baja un poco; dentro (o sin jugar) luce entero.
    const faro =
      !animar || e.dentro || !e.activo || lleno
        ? 1
        : 0.74 + 0.1 * Math.sin(ahora * 0.031) + 0.07 * Math.sin(ahora * 0.0173 + 1)

    camX = animar ? Math.sin(pedal) * 0.05 : 0
    cx = W / 2
    f = W * 0.62
    yH = H * 0.4
    yV = yH - H * (incl > 0 ? 0.065 : 0.05) * incl
    yB = H * 1.04
    const zL = profundidad(luz)

    c2.setTransform(dpr, 0, 0, dpr, 0, 0)
    c2.globalAlpha = 1
    c2.globalCompositeOperation = 'source-over'
    c2.drawImage(cielo, -6 - camX * 30, 0, (cielo.width / dpr), H)

    // Estrellas que titilan.
    c2.fillStyle = p.estrella
    for (let i = 0; i < N_TITILAN; i += 1) {
      const a = animar ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(ahora * 0.001 * estrellasF[i] + i * 2.1)) : 0.7
      c2.globalAlpha = a
      const r = i % 4 === 0 ? 1.4 : 0.9
      c2.beginPath()
      c2.arc(estrellasX[i] * W, estrellasY[i] * yH * 0.8, r, 0, Math.PI * 2)
      c2.fill()
    }
    c2.globalAlpha = 1
    c2.drawImage(montes, -15 - camX * 90, 0, montes.width / dpr, H)

    // El camino (con el leve vaivén de la bici: sesgo, la fuga no se mueve).
    const sesgo = (-camX * f) / (yB - yV)
    c2.save()
    c2.transform(1, 0, sesgo, 1, -sesgo * yV, 0)
    const sF = 1 / LEJOS
    c2.fillStyle = p.asfalto
    c2.beginPath()
    c2.moveTo(cx - 1.02 * f, yB)
    c2.lineTo(cx + 1.02 * f, yB)
    c2.lineTo(cx + 1.02 * f * sF, yDe(LEJOS))
    c2.lineTo(cx - 1.02 * f * sF, yDe(LEJOS))
    c2.fill()
    // El haz: copia entera y máscara suave entre 0,8 y 1,15 de su alcance; encima, el grano del asfalto.
    const zCorte = Math.max(1, zL * 0.84)
    if (conoVivo && cv && grano) {
      const yLejos = Math.max(0, yDe(zL * 1.15))
      const yCerca = Math.max(yLejos + 1, yDe(Math.max(1.02, zL * 0.8)))
      cv.globalCompositeOperation = 'source-over'
      cv.clearRect(0, 0, W, H)
      cv.drawImage(cono, cx - 1.6 * f, yV, 3.2 * f, yB - yV)
      // `destination-out` sólo toca donde se pinta (`destination-in` borraría también el resto del lienzo).
      cv.globalCompositeOperation = 'destination-out'
      cv.drawImage(mascara, 0, yLejos, W, yCerca - yLejos)
      cv.fillStyle = p.luz
      cv.fillRect(0, 0, W, yLejos)
      c2.globalCompositeOperation = 'lighter'
      c2.globalAlpha = faro
      c2.drawImage(conoVivo, 0, 0, W, H)
      c2.globalCompositeOperation = 'multiply'
      c2.globalAlpha = 0.6
      c2.beginPath()
      c2.moveTo(cx - 1.02 * f, yB)
      c2.lineTo(cx + 1.02 * f, yB)
      c2.lineTo(cx + 1.02 * f * sF, yDe(LEJOS))
      c2.lineTo(cx - 1.02 * f * sF, yDe(LEJOS))
      c2.save()
      c2.clip()
      c2.drawImage(grano, 0, 0, W, H)
      c2.restore()
    }
    c2.globalCompositeOperation = 'source-over'
    // Rayas: bordes continuos y discontinua central que corre hacia ti; brillan donde llega la luz.
    c2.fillStyle = p.raya
    const iluminado = (z: number) => lim((zL * 1.12 - z) / (zL * 0.3)) * faro
    for (const lado of [-1, 1]) {
      c2.globalAlpha = 0.12
      banda(lado * 0.93, 0.014, 1, LEJOS)
      c2.globalAlpha = 0.75 * faro
      banda(lado * 0.93, 0.014, 1, zCorte)
    }
    for (let i = 0; i < 11; i += 1) {
      const z0 = 1 + mod(i * 1.3 - avance, 14.3)
      if (z0 > LEJOS - 0.5) continue
      c2.globalAlpha = 0.1 + 0.8 * iluminado(z0)
      banda(0, 0.016, z0, Math.min(LEJOS, z0 + 0.55))
    }
    c2.restore()

    // La aldea al final del camino y su molino.
    const vy = yDe(LEJOS)
    const vw = aldea.width / dpr
    const vh = aldea.height / dpr
    const vx = cx - camX * f * sF - vw * 0.5
    const vtop = vy - vh * 0.92
    c2.globalAlpha = 1
    c2.drawImage(aldea, vx, vtop, vw, vh)
    c2.globalCompositeOperation = 'lighter'
    c2.globalAlpha = pueblo
    c2.drawImage(aldeaLuz, vx, vtop, vw, vh)
    if (lleno && animar) {
      // El momento de la aldea: un halo cálido que se abre y se queda suave.
      const t = e.celebrar > 0 ? (ahora - e.celebrar) / 900 : 1
      c2.globalAlpha = 0.35 + 0.45 * Math.exp(-t * 2)
      const hr = vw * (0.8 + 0.25 * Math.min(1, t))
      c2.drawImage(haloVentana, cx - hr, vtop + vh * 0.55 - hr * 0.6, hr * 2, hr * 1.2)
    }
    c2.globalCompositeOperation = 'source-over'
    const rx = vx + vw * 0.78
    const ry = vtop + vh * 0.7
    const rr = vh * 0.24
    c2.globalAlpha = 1
    c2.strokeStyle = pueblo > 0.6 ? p.ventana : p.metal
    c2.lineWidth = Math.max(1, rr * 0.14)
    c2.beginPath()
    c2.arc(rx, ry, rr, 0, Math.PI * 2)
    for (let i = 0; i < 8; i += 1) {
      const a = rueda + (i * Math.PI) / 4
      c2.moveTo(rx, ry)
      c2.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr)
    }
    c2.stroke()

    // Bruma a ras de suelo que se desliza.
    const nw = niebla.width / dpr
    const nh = niebla.height / dpr
    const nx = -mod(ahora * (animar ? 0.006 : 0) + avance * 4, nw)
    c2.globalAlpha = 0.9
    c2.drawImage(niebla, nx, yH - nh * 0.35, nw, nh)
    c2.drawImage(niebla, nx + nw, yH - nh * 0.35, nw, nh)

    // Luciérnagas en las cunetas oscuras.
    c2.globalCompositeOperation = 'lighter'
    for (let i = 0; i < N_LUCIERNAGAS; i += 1) {
      const t = ahora * 0.001 + bichoF[i]
      const a = animar ? Math.pow(Math.max(0, Math.sin(t * 0.9)), 2) : 0.5
      if (a < 0.02) continue
      const x = bichoX[i] * W + (animar ? Math.sin(t * 0.7) * 10 : 0)
      const y = yH + bichoY[i] * H + (animar ? Math.cos(t * 1.1) * 5 : 0)
      c2.globalAlpha = a * 0.9
      c2.drawImage(haloBicho, x - 7, y - 7, 14, 14)
    }
    c2.globalCompositeOperation = 'source-over'

    // Árboles, postes con reflector e hitos del 25/50/75 %, de lejos a cerca.
    for (let i = 0; i < N_ARBOLES; i += 1) itemZ[i] = 1 + mod(arbZ[i] - avance, VANO_ARBOLES)
    for (let i = 0; i < N_POSTES; i += 1)
      itemZ[N_ARBOLES + i] = 1 + mod(Math.floor(i / 2) * 2 + (i % 2) - avance, VANO_POSTES)
    for (let i = 0; i < HITOS.length; i += 1) itemZ[N_ARBOLES + N_POSTES + i] = profundidad(HITOS[i])
    for (let i = 0; i < N_ITEMS; i += 1) {
      let j = i
      orden[j] = i
      while (j > 0 && itemZ[orden[j - 1]] < itemZ[i]) {
        orden[j] = orden[j - 1]
        j -= 1
      }
      orden[j] = i
    }
    c2.font = '800 10px system-ui, sans-serif'
    c2.textAlign = 'center'
    c2.textBaseline = 'middle'
    for (let n = 0; n < N_ITEMS; n += 1) {
      const i = orden[n]
      const z = itemZ[i]
      if (z < 1.04 || z > LEJOS + 2.5) continue
      const s = 1 / z
      const y = yDe(z)
      // Los árboles se funden antes de la aldea para no taparla.
      const brumaLejos = i < N_ARBOLES ? lim((9.5 - z) / 2.5) : lim((LEJOS - 0.8 - z) / 3.2)
      const luzAqui = iluminado(z)
      if (i < N_ARBOLES) {
        const tipo = arbTipo[i]
        const sp = arboles[tipo]
        const h = arbTam[i] * 2.2 * f * s
        const w = (h * sp.width) / sp.height
        const x = cx + (arbX[i] - camX) * f * s
        c2.globalAlpha = brumaLejos
        c2.drawImage(sp, x - w / 2, y - h, w, h)
        const brillo = luzAqui * 0.55 * Math.min(1, 1.6 * s + 0.25)
        if (brillo > 0.02) {
          c2.globalAlpha = brillo * brumaLejos
          c2.drawImage(arbolesLuz[tipo], x - w / 2, y - h, w, h)
        }
      } else if (i < N_ARBOLES + N_POSTES) {
        const lado = i % 2 === 0 ? -1 : 1
        const x = cx + (lado * 1.1 - camX) * f * s
        const h = 0.2 * f * s
        const w = Math.max(1, 0.03 * f * s)
        c2.globalAlpha = brumaLejos
        c2.fillStyle = p.metal
        c2.fillRect(x - w / 2, y - h, w, h)
        c2.globalAlpha = brumaLejos * (0.2 + 0.8 * luzAqui)
        c2.fillStyle = p.reflector
        c2.fillRect(x - w / 2, y - h, w, h * 0.22)
        if (luzAqui > 0.05) {
          c2.globalCompositeOperation = 'lighter'
          c2.globalAlpha = luzAqui * brumaLejos * 0.8
          const gh = Math.max(6, w * 5)
          c2.drawImage(haloRojo, x - gh / 2, y - h * 0.89 - gh / 2, gh, gh)
          c2.globalCompositeOperation = 'source-over'
        }
      } else {
        const hito = i - N_ARBOLES - N_POSTES
        const pasado = luz >= HITOS[hito] - 0.005
        const x = cx + ((hito === 1 ? 1.2 : -1.2) - camX) * f * s
        const h = Math.max(10, 0.3 * f * s)
        const pw = anchoPlaca[hito]
        c2.globalAlpha = 1
        c2.fillStyle = p.metal
        c2.fillRect(x - 1, y - h, 2, h)
        c2.fillStyle = pasado ? p.ventana : p.casa
        c2.fillRect(x - pw / 2, y - h - 8, pw, 15)
        c2.fillStyle = pasado ? p.cielo1 : p.raya
        c2.fillText(ETIQUETAS[hito], x, y - h - 0.5)
      }
    }

    // Charco de luz justo delante y el manillar con su faro (se mece con la pedalada).
    c2.globalCompositeOperation = 'lighter'
    c2.globalAlpha = 0.14 * faro
    c2.drawImage(haloLuz, cx - W * 0.45, H * 0.78, W * 0.9, H * 0.4)
    c2.globalCompositeOperation = 'source-over'
    const mw = manillar.width / dpr
    const mh = manillar.height / dpr
    c2.save()
    c2.translate(cx, H + mh * 0.18)
    c2.rotate(camX * 0.35)
    c2.globalAlpha = 1
    c2.drawImage(manillar, -mw / 2, -mh, mw, mh)
    const ly = -mh + mh * 0.3
    const lr = mh * 0.12
    c2.fillStyle = p.luz2
    c2.globalAlpha = 0.35 + 0.65 * faro
    c2.beginPath()
    c2.arc(0, ly, lr, 0, Math.PI * 2)
    c2.fill()
    c2.fillStyle = p.luna
    c2.globalAlpha = faro
    c2.beginPath()
    c2.arc(-lr * 0.2, ly - lr * 0.2, lr * 0.45, 0, Math.PI * 2)
    c2.fill()
    c2.globalCompositeOperation = 'lighter'
    c2.globalAlpha = 0.4 * faro
    c2.drawImage(haloLuz, -lr * 5, ly - lr * 5, lr * 10, lr * 10)
    c2.restore()

    c2.globalCompositeOperation = 'source-over'
    c2.globalAlpha = 1
    c2.drawImage(vineta, 0, 0, W, H)
    // Tramo terminado: un destello cálido que se apaga.
    if (celebrando && animar) {
      c2.globalCompositeOperation = 'lighter'
      c2.globalAlpha = 0.45 * Math.exp(-(ahora - e.celebrar) / 260)
      c2.fillStyle = p.luz2
      c2.fillRect(0, 0, W, H)
      c2.globalCompositeOperation = 'source-over'
    }
    c2.globalAlpha = 1
  }

  return { redimensionar, dibujar }
}

export type Escena = NonNullable<ReturnType<typeof crearEscena>>

/**
 * Banco de lectura de QR en casos difíciles.
 *
 *     cd frontend && node scripts/medir-lectura-qr.mjs            # todo
 *     node scripts/medir-lectura-qr.mjs --rapido                   # 8 tomas por caso
 *     node scripts/medir-lectura-qr.mjs --json salida.json         # cifras a fichero
 *     node scripts/medir-lectura-qr.mjs --casos 'inclinado|poca luz' # sólo esos casos
 *     node scripts/medir-lectura-qr.mjs --version-minima 1         # pegatinas de antes
 *     node scripts/medir-lectura-qr.mjs --por-estrategia           # qué lee cada estrategia
 *
 * Necesita Node 22.18 o más (importa el .ts del núcleo directamente).
 *     node scripts/medir-lectura-qr.mjs --volcar carpeta           # una .pgm por caso
 *
 * `comprobar-qr.mjs` mide el caso fácil (un raster perfecto). Esto fabrica
 * fotos sintéticas de la pegatina con los ajustes REALES de shared/qrCard.tsx
 * (nivel H, 4 módulos de margen, negro sobre blanco) y les mete lo que pasa en
 * el monte: inclinación, desenfoque, ruido, poca luz, reflejos, la pegatina
 * pequeña en el encuadre, girada o impresa en una impresora sin tóner.
 *
 * Compara dos lectores sobre las MISMAS imágenes:
 *   - «antes»: el lector hasta la 5.47 (recorte del 85 %, jsQR probando los dos
 *     sentidos y, si no, un umbral global en la media). Copiado aquí tal cual
 *     para poder seguir midiéndolo.
 *   - «después»: src/player/offline/qrNucleo.ts, importado tal cual (Node
 *     quita los tipos). «1.ª» = el primer fotograma; «1 s» = las estrategias
 *     que rota el bucle en un segundo de cámara.
 *
 * Las imágenes son lo que llega al lector: el cuadrado central de 720×720 de
 * un fotograma de 1280×720, que es lo que se pide a la cámara.
 *
 * Lo que NO mide: el autoenfoque, el balance de blancos, la compresión del
 * vídeo y el pulso del jugador. Sirve para comparar lectores, no para
 * prometer una tasa en campo.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import jsQR from 'jsqr'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aGris,
  aRgba,
  leerConEstrategia,
  leerConEstrategias,
  ROTACION_DEL_BUCLE,
  ESTRATEGIAS,
} from '../src/player/offline/qrNucleo.ts'

/** Los ajustes se LEEN de shared/qrCard.tsx: si alguien los cambia allí, el banco mide lo nuevo. */
function ajustesDeLaTarjeta() {
  const fuente = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'qrCard.tsx'), 'utf8')
  const numero = (nombre) => Number(new RegExp(`const ${nombre} = ([0-9]+)`).exec(fuente)?.[1])
  return { marginSize: numero('ZONA_DE_SILENCIO'), minVersion: numero('VERSION_MINIMA') }
}

const args = process.argv.slice(2)
const RAPIDO = args.includes('--rapido')
const TOMAS = args.includes('--tomas') ? Number(args[args.indexOf('--tomas') + 1]) : RAPIDO ? 8 : 24
const FILTRO = args.includes('--casos') ? args[args.indexOf('--casos') + 1].toLowerCase() : null
const rutaJson = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
const carpetaVolcado = args.includes('--volcar') ? args[args.indexOf('--volcar') + 1] : null
const POR_ESTRATEGIA = args.includes('--por-estrategia')

/** Los mismos ajustes que src/shared/qrCard.tsx. */
const AJUSTES = { level: 'H', ...ajustesDeLaTarjeta(), bgColor: '#ffffff', fgColor: '#000000', size: 512 }
if (args.includes('--version-minima')) AJUSTES.minVersion = Number(args[args.indexOf('--version-minima') + 1])

// Payloads ficticios con las dos formas que hay en las misiones: el corto
// aleatorio que genera ahora el panel y el largo de antes (objeto + etiqueta).
const PAYLOADS = args.includes('--payloads')
  ? args[args.indexOf('--payloads') + 1].split(',')
  : ['SAGA7KQ2MX', 'SAGAH4WN9C', 'SAGA1:ITEM:objeto_prueba:Objeto de prueba']

// ---------------------------------------------------------------------------
// Matriz del código, sacada del SVG que genera la aplicación
// ---------------------------------------------------------------------------

function matrizDe(payload) {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value: payload, ...AJUSTES }))
  const lado = Number(/viewBox="0 0 (\d+) (\d+)"/.exec(svg)[1])
  const trazado =
    /<path[^>]*fill="#000000"[^>]*d="([^"]+)"/.exec(svg) || /<path[^>]*d="([^"]+)"[^>]*fill="#000000"/.exec(svg)
  const m = new Uint8Array(lado * lado)
  for (const c of trazado[1].matchAll(/M(\d+(?:\.\d+)?)[ ,](\d+(?:\.\d+)?)\s*h(\d+(?:\.\d+)?)v(\d+(?:\.\d+)?)/g)) {
    const [x0, y0, w, h] = [Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4])]
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) m[y * lado + x] = 1
  }
  return { n: lado, m }
}

// ---------------------------------------------------------------------------
// Azar reproducible
// ---------------------------------------------------------------------------

function azar(semilla) {
  let s = semilla >>> 0 || 1
  const u = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  const normal = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u())
  return { u, normal }
}

// ---------------------------------------------------------------------------
// La foto sintética
// ---------------------------------------------------------------------------

const FRAME_W = 1280
const LADO = 720 // lo que llega al lector: el cuadrado central del fotograma
const F = FRAME_W * 0.8 // focal en píxeles (~77° de campo horizontal)

function rot(ax, ay, az) {
  const [a, b, c] = [ax, ay, az].map((g) => (g * Math.PI) / 180)
  const Rx = [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)]
  const Ry = [Math.cos(b), 0, Math.sin(b), 0, 1, 0, -Math.sin(b), 0, Math.cos(b)]
  const Rz = [Math.cos(c), -Math.sin(c), 0, Math.sin(c), Math.cos(c), 0, 0, 0, 1]
  const mul = (A, B) => {
    const C = new Array(9).fill(0)
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) for (let k = 0; k < 3; k += 1) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]
    return C
  }
  return mul(Rx, mul(Ry, Rz))
}

function desenfocar(img, w, h, sigma) {
  if (sigma < 0.3) return img
  const r = Math.ceil(sigma * 3)
  const k = new Float32Array(2 * r + 1)
  let s = 0
  for (let i = -r; i <= r; i += 1) s += k[i + r] = Math.exp((-i * i) / (2 * sigma * sigma))
  for (let i = 0; i < k.length; i += 1) k[i] /= s
  const tmp = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let a = 0
      for (let i = -r; i <= r; i += 1) a += img[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r]
      tmp[y * w + x] = a
    }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let a = 0
      for (let i = -r; i <= r; i += 1) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r]
      out[y * w + x] = a
    }
  return out
}

/**
 * p: {
 *   fraccion: ancho del código (con su margen) / ancho del fotograma
 *   inclX, inclY, giro: grados
 *   desenfoque: sigma en módulos     ruido: sigma en niveles de gris
 *   luz: 0-1                          negro, blanco: reflectancia de la tinta y del papel
 *   reflejo: intensidad 0-1 de un brillo sobre una esquina del código
 *   semitono: impresora sin tóner (puntos en vez de negro macizo)
 *   desplazar: el código algo fuera del centro
 * }
 */
function fotografiar(matriz, p, semilla) {
  const { u, normal } = azar(semilla)
  const { n, m } = matriz
  const papel = 3 // módulos de pegatina blanca alrededor del margen
  const R = rot(p.inclX || 0, p.inclY || 0, p.giro || 0)
  const anchoPx = p.fraccion * FRAME_W
  const Z0 = (F * n) / anchoPx
  const cx = LADO / 2 + (p.desplazar ? (u() - 0.5) * LADO * 0.12 : 0)
  const cy = LADO / 2 + (p.desplazar ? (u() - 0.5) * LADO * 0.12 : 0)
  const nrm = [R[2], R[5], R[8]]
  const dotPlano = nrm[2] * Z0

  // Fondo: piedra o corteza, manchas grandes y grano.
  const rejilla = 24
  const manchas = new Float32Array((rejilla + 1) * (rejilla + 1)).map(() => 70 + u() * 90)
  const fondo = (x, y) => {
    const gx = (x / LADO) * rejilla
    const gy = (y / LADO) * rejilla
    const ix = Math.min(rejilla - 1, Math.floor(gx))
    const iy = Math.min(rejilla - 1, Math.floor(gy))
    const dx = gx - ix
    const dy = gy - iy
    const a = manchas[iy * (rejilla + 1) + ix] * (1 - dx) + manchas[iy * (rejilla + 1) + ix + 1] * dx
    const b = manchas[(iy + 1) * (rejilla + 1) + ix] * (1 - dx) + manchas[(iy + 1) * (rejilla + 1) + ix + 1] * dx
    return (a * (1 - dy) + b * dy) / 255
  }

  const negro = p.negro ?? 0.06
  const blanco = p.blanco ?? 0.88
  // Reflectancia en el plano de la pegatina, en coordenadas de módulo.
  const reflectancia = (mu, mv) => {
    if (mu < -papel || mv < -papel || mu >= n + papel || mv >= n + papel) return -1
    if (mu < 0 || mv < 0 || mu >= n || mv >= n) return blanco
    if (!m[Math.floor(mv) * n + Math.floor(mu)]) return blanco
    if (p.semitono) {
      // Trama de 4 puntos por módulo, cubriendo ~55 %: negro de impresora sin tóner.
      const fu = (mu * 4) % 1 - 0.5
      const fv = (mv * 4) % 1 - 0.5
      return fu * fu + fv * fv < 0.17 ? negro : blanco * 0.92
    }
    return negro
  }

  const SS = 3
  const img = new Float32Array(LADO * LADO)
  const gradiente = (u() - 0.5) * 0.5
  // Coordenadas de módulo de un punto de la imagen (rayo contra el plano).
  const R0 = R[0], R1 = R[1], R3 = R[3], R4 = R[4], R6 = R[6], R7 = R[7]
  let lu = 0
  let lv = 0
  const proyectar = (px, py) => {
    const d0 = (px - cx) / F
    const d1 = (py - cy) / F
    const den = nrm[0] * d0 + nrm[1] * d1 + nrm[2]
    if (Math.abs(den) < 1e-9) return false
    const t = dotPlano / den
    const P0 = t * d0
    const P1 = t * d1
    const P2 = t - Z0
    lu = R0 * P0 + R3 * P1 + R6 * P2 + n / 2
    lv = R1 * P0 + R4 * P1 + R7 * P2 + n / 2
    return t > 0
  }
  for (let y = 0; y < LADO; y += 1) {
    for (let x = 0; x < LADO; x += 1) {
      // Lejos de la pegatina basta una muestra; cerca, 3×3 para el antialias.
      let cerca = false
      if (proyectar(x + 0.5, y + 0.5)) {
        cerca = lu > -papel - 2 && lv > -papel - 2 && lu < n + papel + 2 && lv < n + papel + 2
      }
      let acumulado = 0
      let enPegatina = 0
      const ss = cerca ? SS : 1
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const px = x + (sx + 0.5) / ss
          const py = y + (sy + 0.5) / ss
          const r = cerca && proyectar(px, py) ? reflectancia(lu, lv) : -1
          if (r >= 0) {
            acumulado += r
            enPegatina += 1
          } else acumulado += fondo(px, py)
        }
      }
      const luzLocal = (p.luz ?? 1) * (1 + gradiente * (x / LADO - 0.5))
      img[y * LADO + x] = 255 * luzLocal * (acumulado / (ss * ss))
      if (enPegatina && p.reflejo) {
        // Brillo especular sobre una esquina: tapa sin saturar del todo.
        const rx = cx + anchoPx * 0.18
        const ry = cy - anchoPx * 0.12
        const radio = anchoPx * 0.22
        const dd = ((x - rx) ** 2 + (y - ry) ** 2) / (radio * radio)
        img[y * LADO + x] += 255 * p.reflejo * Math.exp(-dd) * (enPegatina / (ss * ss))
      }
    }
  }

  const modulo = anchoPx / n
  const borrosa = desenfocar(img, LADO, LADO, (p.desenfoque || 0) * modulo)
  const ruido = p.ruido || 0
  const rgba = new Uint8ClampedArray(LADO * LADO * 4)
  for (let i = 0; i < LADO * LADO; i += 1) {
    // Ruido del sensor: el de lectura más el de fotones (crece con la luz).
    // Con buena luz queda en σ≈2, que es lo que deja el procesado del móvil.
    const fotones = Math.sqrt(Math.max(0, borrosa[i])) * 0.12
    const v = borrosa[i] + normal() * Math.sqrt(ruido * ruido + fotones * fotones)
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

// ---------------------------------------------------------------------------
// El lector de antes (hasta la 5.47), copiado tal cual
// ---------------------------------------------------------------------------

function recorteAntiguo(rgba, lado, fraccion) {
  // recortarCuadrado(): cuadrado centrado, como mucho 900 px (aquí no llega).
  const sub = Math.floor(lado * fraccion)
  const x0 = Math.floor((lado - sub) / 2)
  const out = new Uint8ClampedArray(sub * sub * 4)
  for (let y = 0; y < sub; y += 1) out.set(rgba.subarray(((y + x0) * lado + x0) * 4, ((y + x0) * lado + x0 + sub) * 4), y * sub * 4)
  return { data: out, w: sub }
}

function subirContrasteAntiguo(datos) {
  const grises = new Uint8Array(datos.length / 4)
  let suma = 0
  for (let i = 0, p = 0; i < datos.length; i += 4, p += 1) {
    grises[p] = (datos[i] * 299 + datos[i + 1] * 587 + datos[i + 2] * 114) / 1000
    suma += grises[p]
  }
  const umbral = suma / grises.length
  const salida = new Uint8ClampedArray(datos.length)
  for (let p = 0, i = 0; p < grises.length; p += 1, i += 4) {
    const v = grises[p] > umbral ? 255 : 0
    salida[i] = salida[i + 1] = salida[i + 2] = v
    salida[i + 3] = 255
  }
  return salida
}

function leerAntiguo(rgba, fraccion) {
  const { data, w } = recorteAntiguo(rgba, LADO, fraccion)
  const a = jsQR(data, w, w, { inversionAttempts: 'attemptBoth' })
  if (a?.data) return a.data
  return jsQR(subirContrasteAntiguo(data), w, w, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

/** Lado de la pegatina (código con su margen) en mm a una distancia en cm → fracción del ancho. */
function aFraccion(mm, cm) {
  return mm / (1.25 * cm * 10)
}

const BASE = { fraccion: 0.3, desplazar: true, ruido: 1 }
const CASOS = [
  ['limpio, de frente (30 %)', {}],
  ['inclinado 20°', { inclY: 20, inclX: 6 }],
  ['inclinado 30°', { inclY: 30, inclX: 8 }],
  ['inclinado 40°', { inclY: 40, inclX: 10 }],
  ['desenfoque 0,35 módulo', { desenfoque: 0.35 }],
  ['desenfoque 0,5 módulo', { desenfoque: 0.5 }],
  ['desenfoque 0,65 módulo', { desenfoque: 0.65 }],
  ['ruido σ=15', { ruido: 15 }],
  ['ruido σ=25', { ruido: 25 }],
  ['poca luz (15 %)', { luz: 0.15, ruido: 4 }],
  ['poca luz (8 %)', { luz: 0.08, ruido: 3 }],
  ['bajo contraste (gastada)', { negro: 0.5, blanco: 0.8 }],
  ['reflejo parcial', { reflejo: 0.9 }],
  ['reflejo fuerte', { reflejo: 1.4 }],
  ['pequeño 20 %', { fraccion: 0.2 }],
  ['pequeño 15 %', { fraccion: 0.15 }],
  ['pequeño 10 %', { fraccion: 0.1 }],
  ['muy cerca (50 %)', { fraccion: 0.5, desplazar: false }],
  // Distancia: el fotograma de 1280 px abarca ~1,25 × la distancia (64° de
  // campo), así que una pegatina de L mm a d cm ocupa L / (12,5·d) del ancho.
  ['pegatina 38 mm a 40 cm', { fraccion: aFraccion(38, 40) }],
  ['pegatina 45 mm a 20 cm', { fraccion: aFraccion(45, 20) }],
  ['pegatina 45 mm a 30 cm', { fraccion: aFraccion(45, 30) }],
  ['pegatina 45 mm a 40 cm', { fraccion: aFraccion(45, 40) }],
  ['pegatina 45 mm a 40 cm, 20° y algo movida', { fraccion: aFraccion(45, 40), inclY: 20, desenfoque: 0.3, ruido: 4 }],
  ['rotado 30°', { giro: 30 }],
  ['rotado 90°', { giro: 90 }],
  ['rotado 180°', { giro: 180 }],
  ['impreso en B/N sin tóner', { semitono: true, negro: 0.15 }],
  ['combinado: 30° + pequeño + borroso + ruido', { inclY: 30, fraccion: 0.15, desenfoque: 0.35, ruido: 12 }],
  ['combinado: poca luz + reflejo + 20°', { luz: 0.25, reflejo: 0.6, inclY: 20, ruido: 6 }],
]

const matrices = new Map(PAYLOADS.map((p) => [p, matrizDe(p)]))
const resultados = []
const pasadasPorSegundo = 8
const rotacionUnSegundo = ROTACION_DEL_BUCLE.slice(0, pasadasPorSegundo)

if (carpetaVolcado) mkdirSync(carpetaVolcado, { recursive: true })

console.log(`Banco de lectura QR — ${TOMAS} tomas por caso, ${PAYLOADS.length} payloads alternos, versión mínima ${AJUSTES.minVersion}, margen ${AJUSTES.marginSize}.`)
console.log('«antes» = lector hasta la 5.47 en el bucle de cámara; «foto» = su botón 📸.')
console.log('«1.ª» = lector nuevo, primer fotograma; «1 s» = bucle nuevo durante ~1 s; «todo» = botón 📸 nuevo.')
console.log()
console.log('  caso                                          antes   foto   │  1.ª    1 s   todo')
console.log('  ' + '─'.repeat(86))

let msPasada = 0
const tiempos = {}
let nPasadas = 0

for (const [nombre, extra] of CASOS) {
  if (FILTRO && !FILTRO.split('|').some((f) => nombre.toLowerCase().includes(f))) continue
  const p = { ...BASE, ...extra }
  const cuenta = { antes: 0, foto: 0, primera: 0, unSegundo: 0, todo: 0, estrategias: {} }
  for (let t = 0; t < TOMAS; t += 1) {
    const payload = PAYLOADS[t % PAYLOADS.length]
    const semilla = 1000 + t * 7919 + nombre.length * 31
    const rgba = fotografiar(matrices.get(payload), p, semilla)
    if (carpetaVolcado && t === 0) {
      const g = aGris(rgba, LADO, LADO)
      const cab = Buffer.from(`P5\n${LADO} ${LADO}\n255\n`)
      writeFileSync(join(carpetaVolcado, nombre.replace(/[^a-z0-9]+/gi, '_') + '.pgm'), Buffer.concat([cab, Buffer.from(g.px)]))
    }
    const ok = (texto) => texto === payload

    if (ok(leerAntiguo(rgba, 0.85))) cuenta.antes += 1
    if ([1, 0.85, 0.7].some((f) => ok(leerAntiguo(rgba, f)))) cuenta.foto += 1
    const g = aGris(rgba, LADO, LADO)
    const t0 = performance.now()
    const primera = leerConEstrategias(g, [ROTACION_DEL_BUCLE[0]], jsQR)
    msPasada += performance.now() - t0
    nPasadas += 1
    if (ok(primera?.texto)) cuenta.primera += 1
    if (ok(leerConEstrategias(g, rotacionUnSegundo, jsQR)?.texto)) cuenta.unSegundo += 1
    if (ok(leerConEstrategias(g, ESTRATEGIAS, jsQR)?.texto)) cuenta.todo += 1
    if (POR_ESTRATEGIA) {
      for (const e of ESTRATEGIAS) {
        const t1 = performance.now()
        const leido = ok(leerConEstrategia(g, e, jsQR))
        tiempos[e] = (tiempos[e] || 0) + performance.now() - t1
        cuenta.estrategias[e] = (cuenta.estrategias[e] || 0) + (leido ? 1 : 0)
      }
    }
  }
  const pct = (v) => `${Math.round((100 * v) / TOMAS)}%`.padStart(5)
  console.log(
    `  ${nombre.padEnd(44)} ${pct(cuenta.antes)}  ${pct(cuenta.foto)}  │ ${pct(cuenta.primera)}  ${pct(cuenta.unSegundo)}  ${pct(cuenta.todo)}`
  )
  resultados.push({ caso: nombre, tomas: TOMAS, ...cuenta })
}

const total = (k) => resultados.reduce((s, r) => s + r[k], 0)
const n = resultados.length * TOMAS
console.log('  ' + '─'.repeat(86))
console.log(
  `  ${'TOTAL'.padEnd(44)} ${`${Math.round((100 * total('antes')) / n)}%`.padStart(5)}  ${`${Math.round((100 * total('foto')) / n)}%`.padStart(5)}  │ ${`${Math.round((100 * total('primera')) / n)}%`.padStart(5)}  ${`${Math.round((100 * total('unSegundo')) / n)}%`.padStart(5)}  ${`${Math.round((100 * total('todo')) / n)}%`.padStart(5)}`
)
console.log()
console.log(`Una pasada del bucle nuevo: ${(msPasada / nPasadas).toFixed(1)} ms de media en este equipo (en un móvil flojo, ×4-×6, y va en un worker).`)

if (POR_ESTRATEGIA) {
  console.log()
  console.log('Por estrategia (tomas leídas de ' + TOMAS + '):')
  console.log('  ' + 'caso'.padEnd(44) + ESTRATEGIAS.map((e) => e.slice(0, 8).padStart(9)).join(''))
  for (const r of resultados) console.log('  ' + r.caso.padEnd(44) + ESTRATEGIAS.map((e) => String(r.estrategias[e] || 0).padStart(9)).join(''))
  const n = resultados.length * TOMAS
  console.log('  ' + 'ms por pasada'.padEnd(44) + ESTRATEGIAS.map((e) => (tiempos[e] / n).toFixed(1).padStart(9)).join(''))
}

// Lo que imprime el panel ha de leerse SIEMPRE en el caso limpio.
const limpio = resultados.find((r) => r.caso.startsWith('limpio'))
if (rutaJson) writeFileSync(rutaJson, JSON.stringify({ tomas: TOMAS, ajustes: AJUSTES, resultados, msPasada: msPasada / nPasadas }, null, 2))
if (limpio && limpio.primera < limpio.tomas) {
  console.log('⚠ El caso limpio no lee al primer fotograma. Algo se ha roto.')
  process.exit(1)
}

// Para los tests: jsQR y el núcleo comparten forma de entrada.
void aRgba

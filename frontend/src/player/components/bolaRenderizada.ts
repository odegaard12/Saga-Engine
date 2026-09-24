import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { EstadoDeNodo, TipoDeNodo } from './nodosTresD'

/**
 * El nodo como POKÉPARADA, renderizada una vez con three.js.
 *
 * Óscar eligió el boceto A (2026-09-23): base blanca con aro de color,
 * poste, cubo con el icono del tipo en las caras y, encima, una MONEDA con
 * el número grande. Como las poképaradas y los gimnasios de Pokémon GO,
 * el COLOR es el TIPO, para distinguirlos de lejos sin leer nada:
 *   checkpoint    verde      bandera a cuadros
 *   qr            azul       código QR
 *   coleccionable dorado     cofre
 *   minijuego     magenta    mando
 * El estado va como en Pokémon GO: el pendiente a todo color; el que toca,
 * más grande y con resplandor (capa de halo del mapa); el hecho, apagado y
 * con un check verde, como una poképarada ya visitada.
 *
 * Se renderiza UNA vez por nodo, con luz de entorno, a tres veces la
 * resolución y con sobremuestreo, en un lienzo propio con antialiasing: lo
 * que sale es una imagen que el mapa coloca como símbolo, sin serrar ni
 * temblar. En dos PARTES con el mismo encuadre: la base (suelo, poste,
 * cubo) y la moneda. El mapa las pone en dos capas y mueve sólo la de la
 * moneda, que flota subiendo y bajando.
 */

/** Grados sobre el horizonte desde los que mira la cámara: el mapa va a 58° de inclinación. */
const ELEVACION_CAMARA_GRADOS = 32
const PHI = (ELEVACION_CAMARA_GRADOS * Math.PI) / 180
/** Escala: píxeles CSS por metro del modelo. La de siempre; lo que crece es el encuadre. */
const PX_POR_METRO = 72 / 5.4
/**
 * Radio del brillo del suelo -el halo-, en metros del modelo. Con 2,65
 * el camino llegaba al nodo y no tocaba el halo: "se quedan aparte".
 */
const RADIO_BRILLO = 4.1
/** Tamaño de la imagen en píxeles CSS: cabe el halo entero sin recortar. */
export const ANCHO_BOLA_PX = 110
export const ALTO_BOLA_PX = 132
const ESCALA = 3
const SOBREMUESTREO = 2
/** Encuadre: medio ancho del mundo visible, y de dónde a dónde en vertical (metros en pantalla). */
const MEDIO_ANCHO = ANCHO_BOLA_PX / PX_POR_METRO / 2
const ABAJO = -(RADIO_BRILLO * Math.sin(PHI) + 0.25)
const ARRIBA = ABAJO + MEDIO_ANCHO * 2 * (ALTO_BOLA_PX / ANCHO_BOLA_PX)
/** Altura del centro de la moneda, en metros. */
const CENTRO_MONEDA = 4.75
const RADIO_MONEDA = 1.3

/** Gris de los nodos ya hechos: todo el nodo, sin color del tipo. */
const GRIS_HECHO = '#9ca3af' // no-tema: color horneado en la imagen del nodo
const GRIS_HECHO_OSCURO = '#4b5563' // no-tema: color horneado en la imagen del nodo

/** Color de cada tipo, y su tono oscuro para los dibujos. */
export const COLOR_TIPO: Record<TipoDeNodo, string> = {
  checkpoint: '#10b981', // no-tema: color del tipo, horneado en la imagen
  qr: '#0ea5e9', // no-tema: color del tipo, horneado en la imagen
  coleccionable: '#f59e0b', // no-tema: color del tipo, horneado en la imagen
  minijuego: '#d946ef', // no-tema: color del tipo, horneado en la imagen
}
export const OSCURO_TIPO: Record<TipoDeNodo, string> = {
  checkpoint: '#065f46', // no-tema: color del tipo, horneado en la imagen
  qr: '#075985', // no-tema: color del tipo, horneado en la imagen
  coleccionable: '#92400e', // no-tema: color del tipo, horneado en la imagen
  minijuego: '#86198f', // no-tema: color del tipo, horneado en la imagen
}

/**
 * Cuánto hay que bajar la imagen (píxeles CSS, con el ancla abajo) para
 * que el punto del suelo caiga sobre la coordenada del nodo.
 */
export const DESPLAZAMIENTO_ANCLA_PX = Math.round((-ABAJO / (ARRIBA - ABAJO)) * ALTO_BOLA_PX)

/** Centro de la moneda en píxeles CSS desde arriba: donde va el halo del nodo en juego. */
export const CENTRO_HALO_3D_PX = Math.round((1 - (CENTRO_MONEDA * Math.cos(PHI) - ABAJO) / (ARRIBA - ABAJO)) * ALTO_BOLA_PX)

export type ParteDeNodo = 'base' | 'moneda'

let renderer: THREE.WebGLRenderer | null = null
let entorno: THREE.Texture | null = null
let intentado = false
const cache = new Map<string, ImageData | null>()

function asegurarRenderer(): THREE.WebGLRenderer | null {
  if (renderer || intentado) return renderer
  intentado = true
  try {
    const lienzo = document.createElement('canvas')
    lienzo.width = ANCHO_BOLA_PX * ESCALA * SOBREMUESTREO
    lienzo.height = ALTO_BOLA_PX * ESCALA * SOBREMUESTREO
    renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, premultipliedAlpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(lienzo.width, lienzo.height, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // Luz de entorno: sin ella el metal del canto sale negro.
    const pmrem = new THREE.PMREMGenerator(renderer)
    entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
  } catch {
    renderer = null
  }
  return renderer
}

// ---------------------------------------------------------------- texturas
function lienzo(tam: number, pintar: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = tam
  const g = c.getContext('2d')
  if (g) pintar(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

/** El dibujo del tipo, en `col` con detalles en `osc`, centrado en (cx, cy) y de lado `s`. */
export function pintarGlifo(g: CanvasRenderingContext2D, tipo: TipoDeNodo, cx: number, cy: number, s: number, col: string, osc: string): void {
  g.save()
  if (tipo === 'checkpoint') {
    g.fillStyle = col
    rr(g, cx - s * 0.44, cy - s * 0.5, s * 0.09, s, s * 0.045)
    g.fill()
    const x0 = cx - s * 0.36
    const y0 = cy - s * 0.45
    const w = s * 0.82
    const h = s * 0.54
    g.beginPath()
    g.moveTo(x0, y0)
    g.bezierCurveTo(x0 + w * 0.35, y0 - h * 0.22, x0 + w * 0.65, y0 + h * 0.22, x0 + w, y0)
    g.lineTo(x0 + w, y0 + h)
    g.bezierCurveTo(x0 + w * 0.65, y0 + h + h * 0.22, x0 + w * 0.35, y0 + h - h * 0.22, x0, y0 + h)
    g.closePath()
    g.fillStyle = col
    g.fill()
    g.clip()
    g.fillStyle = osc
    const nx = 5
    const ny = 3
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < ny; j += 1) {
        if ((i + j) % 2) continue
        const ola = Math.sin(((i + 0.5) / nx) * Math.PI * 2) * -h * 0.1
        g.fillRect(x0 + (i * w) / nx, y0 + (j * h) / ny + ola, w / nx + 1, h / ny + 1)
      }
    }
  } else if (tipo === 'qr') {
    g.fillStyle = col
    rr(g, cx - s * 0.5, cy - s * 0.5, s, s, s * 0.14)
    g.fill()
    const m = s / 9
    const x0 = cx - s * 0.5 + m * 0.9
    const y0 = cy - s * 0.5 + m * 0.9
    const cel = (i: number, j: number, k = 1) => g.fillRect(x0 + i * m, y0 + j * m, k * m, k * m)
    for (const [fi, fj] of [[0, 0], [4.4, 0], [0, 4.4]]) {
      g.fillStyle = osc
      cel(fi, fj, 2.8)
      g.fillStyle = col
      g.fillRect(x0 + (fi + 0.55) * m, y0 + (fj + 0.55) * m, 1.7 * m, 1.7 * m)
      g.fillStyle = osc
      g.fillRect(x0 + (fi + 0.95) * m, y0 + (fj + 0.95) * m, 0.9 * m, 0.9 * m)
    }
    g.fillStyle = osc
    for (const [i, j] of [[4.4, 4.4], [5.5, 5.5], [6.6, 4.4], [4.4, 6.6], [6.6, 6.6], [3.2, 5.5], [5.5, 3.2]]) cel(i, j, 0.85)
  } else if (tipo === 'coleccionable') {
    g.fillStyle = col
    rr(g, cx - s * 0.5, cy - s * 0.02, s, s * 0.5, s * 0.08)
    g.fill()
    g.beginPath()
    g.moveTo(cx - s * 0.5, cy - s * 0.02)
    g.bezierCurveTo(cx - s * 0.5, cy - s * 0.5, cx + s * 0.5, cy - s * 0.5, cx + s * 0.5, cy - s * 0.02)
    g.closePath()
    g.fill()
    g.fillStyle = osc
    g.fillRect(cx - s * 0.5, cy - s * 0.06, s, s * 0.08)
    g.fillRect(cx - s * 0.33, cy - s * 0.36, s * 0.07, s * 0.84)
    g.fillRect(cx + s * 0.26, cy - s * 0.36, s * 0.07, s * 0.84)
    rr(g, cx - s * 0.1, cy - s * 0.08, s * 0.2, s * 0.24, s * 0.04)
    g.fill()
    g.fillStyle = col
    g.beginPath()
    g.arc(cx, cy + s * 0.02, s * 0.035, 0, Math.PI * 2)
    g.fill()
  } else {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(cx - s * 0.28, cy - s * 0.24)
    g.lineTo(cx + s * 0.28, cy - s * 0.24)
    g.bezierCurveTo(cx + s * 0.5, cy - s * 0.24, cx + s * 0.56, cy + s * 0.05, cx + s * 0.54, cy + s * 0.22)
    g.bezierCurveTo(cx + s * 0.52, cy + s * 0.42, cx + s * 0.32, cy + s * 0.42, cx + s * 0.24, cy + s * 0.22)
    g.lineTo(cx - s * 0.24, cy + s * 0.22)
    g.bezierCurveTo(cx - s * 0.32, cy + s * 0.42, cx - s * 0.52, cy + s * 0.42, cx - s * 0.54, cy + s * 0.22)
    g.bezierCurveTo(cx - s * 0.56, cy + s * 0.05, cx - s * 0.5, cy - s * 0.24, cx - s * 0.28, cy - s * 0.24)
    g.closePath()
    g.fill()
    g.fillStyle = osc
    rr(g, cx - s * 0.36, cy - s * 0.04, s * 0.2, s * 0.07, s * 0.02)
    g.fill()
    rr(g, cx - s * 0.295, cy - s * 0.11, s * 0.07, s * 0.2, s * 0.02)
    g.fill()
    for (const [dx, dy] of [[0.26, -0.1], [0.36, 0], [0.16, 0], [0.26, 0.1]]) {
      g.beginPath()
      g.arc(cx + s * dx, cy + s * dy, s * 0.045, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.restore()
}

function texNumero(n: number, tipo: TipoDeNodo, estado: EstadoDeNodo): THREE.CanvasTexture {
  return lienzo(512, (g) => {
    const grad = g.createRadialGradient(200, 170, 20, 256, 256, 250)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(1, estado === 'hecho' ? '#cbd5e1' : '#e8eef5')
    g.fillStyle = grad
    g.beginPath()
    g.arc(256, 256, 256, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 16
    g.strokeStyle = estado === 'hecho' ? '#94a3b8' : COLOR_TIPO[tipo] // no-tema: color horneado en la imagen del nodo
    g.beginPath()
    g.arc(256, 256, 228, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = estado === 'hecho' ? '#475569' : '#0b1220' // no-tema: color horneado en la imagen del nodo
    g.font = `900 ${n >= 10 ? 250 : 300}px "Segoe UI", system-ui, -apple-system, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(n), 256, 272)
  })
}

function texCaraCubo(tipo: TipoDeNodo, fondo: string, oscuro: string): THREE.CanvasTexture {
  return lienzo(512, (g) => {
    g.fillStyle = fondo
    g.fillRect(0, 0, 512, 512)
    pintarGlifo(g, tipo, 256, 256, 300, '#ffffff', oscuro)
  })
}

function texBrillo(hex: string): THREE.CanvasTexture {
  return lienzo(256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 126)
    gr.addColorStop(0, hex + '00')
    gr.addColorStop(0.5, hex + '22')
    gr.addColorStop(0.72, hex + 'cc')
    gr.addColorStop(0.84, hex + '66')
    gr.addColorStop(1, hex + '00')
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 256)
  })
}

function texSombra(): THREE.CanvasTexture {
  return lienzo(256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 126)
    gr.addColorStop(0, 'rgba(0,0,0,0.5)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 256)
  })
}

function texCheck(): THREE.CanvasTexture {
  return lienzo(256, (g) => {
    g.fillStyle = '#16a34a'
    g.beginPath()
    g.arc(128, 128, 118, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 12
    g.strokeStyle = '#ffffff'
    g.stroke()
    g.lineWidth = 30
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(70, 132)
    g.lineTo(110, 172)
    g.lineTo(186, 90)
    g.stroke()
  })
}

// -------------------------------------------------------------- materiales
/** Color del tipo; apagado si el nodo ya está hecho. */
function colorDe(tipo: TipoDeNodo, estado: EstadoDeNodo): THREE.Color {
  // Hecho: gris del todo, sin rastro del color. A medio apagar "queda raro".
  return new THREE.Color(estado === 'hecho' ? GRIS_HECHO : COLOR_TIPO[tipo])
}

const metal = (c: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.22, envMapIntensity: 1.2, ...extra })
const plastico = (c: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color: c, metalness: 0, roughness: 0.35, ...extra })

function plano(tex: THREE.Texture, w: number, h: number, opacidad = 1): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: opacidad })
  )
}

function liberar(escena: THREE.Scene): void {
  escena.traverse((objeto) => {
    const malla = objeto as THREE.Mesh
    if (malla.geometry) malla.geometry.dispose()
    const material = malla.material as
      | (THREE.Material & { map?: THREE.Texture | null })
      | (THREE.Material & { map?: THREE.Texture | null })[]
      | undefined
    const lista = Array.isArray(material) ? material : material ? [material] : []
    for (const m of lista) {
      m.map?.dispose()
      m.dispose()
    }
  })
}

/** Construye la poképarada y devuelve la base y la moneda por separado. */
function construir(escena: THREE.Scene, numero: number, estado: EstadoDeNodo, tipo: TipoDeNodo): { base: THREE.Group; moneda: THREE.Group } {
  const c = colorDe(tipo, estado)
  const base = new THREE.Group()
  const moneda = new THREE.Group()

  // Suelo: sombra y brillo del color del tipo.
  const sombra = plano(texSombra(), 3.4, 3.4)
  sombra.rotation.x = -Math.PI / 2
  sombra.position.y = 0.01
  base.add(sombra)
  const brillo = plano(texBrillo(estado === 'hecho' ? GRIS_HECHO : COLOR_TIPO[tipo]), RADIO_BRILLO * 2, RADIO_BRILLO * 2, estado === 'hecho' ? 0.45 : estado === 'actual' ? 1 : 0.85)
  brillo.rotation.x = -Math.PI / 2
  brillo.position.y = 0.02
  base.add(brillo)

  // Peana blanca con aro del color.
  const peana = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.28, 0.2, 72), plastico(0xf8fafc, { roughness: 0.3 }))
  peana.position.y = 0.1
  base.add(peana)
  const aro = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.11, 20, 96), metal(c))
  aro.rotation.x = Math.PI / 2
  aro.position.y = 0.2
  base.add(aro)

  // Poste.
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.55, 32), metal(c, { roughness: 0.3 }))
  poste.position.y = 2.55 / 2
  base.add(poste)

  // Cubo con el icono del tipo en las caras.
  const cubo = new THREE.Mesh(
    new RoundedBoxGeometry(0.9, 0.9, 0.9, 5, 0.14),
    new THREE.MeshStandardMaterial({
      map: estado === 'hecho' ? texCaraCubo(tipo, GRIS_HECHO, GRIS_HECHO_OSCURO) : texCaraCubo(tipo, COLOR_TIPO[tipo], OSCURO_TIPO[tipo]),
      roughness: 0.35,
    })
  )
  cubo.position.y = 2.85
  cubo.rotation.set(0.12, Math.PI / 4 - 0.15, 0)
  base.add(cubo)

  // La moneda: canto metálico del color del tipo y cara con el número.
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(RADIO_MONEDA, RADIO_MONEDA, 0.24, 96), [
    metal(c),
    plastico(0xf1f5f9),
    plastico(0xf1f5f9),
  ])
  cuerpo.rotation.x = Math.PI / 2
  // La cara, en un círculo aparte: las tapas del cilindro giran la textura.
  const cara = new THREE.Mesh(
    new THREE.CircleGeometry(RADIO_MONEDA * 0.99, 96),
    new THREE.MeshStandardMaterial({ map: texNumero(numero, tipo, estado), roughness: 0.35, envMapIntensity: 0.6 })
  )
  cara.position.z = 0.124
  const canto = new THREE.Mesh(new THREE.TorusGeometry(RADIO_MONEDA, 0.15, 24, 128), metal(c, { roughness: 0.18 }))
  const disco = new THREE.Group()
  disco.add(cuerpo, cara, canto)
  disco.position.y = CENTRO_MONEDA
  disco.rotation.y = -0.45
  moneda.add(disco)

  if (estado === 'hecho') {
    // Check verde, de cara a la cámara, en la esquina de la moneda.
    const check = plano(texCheck(), 1.75, 1.75)
    check.position.set(RADIO_MONEDA * 0.72, CENTRO_MONEDA - RADIO_MONEDA * 0.55, 0.9)
    check.rotation.x = -PHI
    check.renderOrder = 10
    moneda.add(check)
  }

  escena.add(base, moneda)
  if (estado === 'actual') escena.scale.setScalar(1.08)
  return { base, moneda }
}

/**
 * La imagen de una parte del nodo, o null si este navegador no puede
 * renderizarla. Base y moneda comparten encuadre, así que se superponen
 * exactas con el mismo ancla.
 */
export function renderizarBola(numero: number, estado: EstadoDeNodo, tipo: TipoDeNodo, parte: ParteDeNodo = 'base'): ImageData | null {
  const clave = `${numero}-${estado}-${tipo}-${parte}`
  if (cache.has(clave)) return cache.get(clave) ?? null
  const r = asegurarRenderer()
  if (!r) {
    cache.set(clave, null)
    return null
  }
  const escena = new THREE.Scene()
  try {
    escena.environment = entorno
    const sol = new THREE.DirectionalLight(0xfff4e0, 1.6)
    sol.position.set(4, 8, 6)
    escena.add(sol)
    escena.add(new THREE.HemisphereLight(0xffffff, 0x445533, 0.5))

    const { base, moneda } = construir(escena, numero, estado, tipo)
    base.visible = parte === 'base'
    moneda.visible = parte === 'moneda'

    const camara = new THREE.OrthographicCamera(-MEDIO_ANCHO, MEDIO_ANCHO, ARRIBA, ABAJO, 0.1, 100)
    camara.position.set(0, Math.sin(PHI) * 30, Math.cos(PHI) * 30)
    camara.lookAt(0, 0, 0)

    r.render(escena, camara)

    // De 2x a 1x: el sobremuestreo se resuelve al reducir.
    const salida = document.createElement('canvas')
    salida.width = ANCHO_BOLA_PX * ESCALA
    salida.height = ALTO_BOLA_PX * ESCALA
    const g = salida.getContext('2d')
    if (!g) throw new Error('sin canvas 2d')
    g.drawImage(r.domElement, 0, 0, salida.width, salida.height)
    const datos = g.getImageData(0, 0, salida.width, salida.height)
    cache.set(clave, datos)
    return datos
  } catch {
    cache.set(clave, null)
    return null
  } finally {
    liberar(escena)
  }
}

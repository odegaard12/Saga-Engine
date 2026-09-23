import * as THREE from 'three'
import { COLOR, texturaBrillo, texturaNumero, type EstadoDeNodo, type TipoDeNodo } from './nodosTresD'

/**
 * El nodo como OBJETO 3D renderizado una vez.
 *
 * Dibujar los nodos en vivo dentro del lienzo de MapLibre (nodosTresD.ts)
 * salía serrado en el móvil y parpadeaba al girar: cada fotograma se
 * volvía a rasterizar con la matriz nueva, "como si se generara en el
 * momento". Aquí el objeto se renderiza UNA vez con three.js, con luz y
 * sombra, a tres veces la resolución de pantalla y con sobremuestreo, en
 * un lienzo propio con antialiasing. Lo que sale es una imagen que el
 * mapa coloca como símbolo, en el mismo fotograma que el terreno y a su
 * altura; no cambia entre fotogramas y no tiembla. Como se renderiza una
 * vez, aquí sí valen las partes finas (una bandera, un cartel): no hay
 * nada que serrar después.
 *
 * Un objeto por tipo, que se distingue de lejos por la silueta y no por
 * una chapa pequeña:
 *   checkpoint    mástil alto con BANDERA triangular y remate
 *   qr            PANEL cuadrado con un código QR en la cara
 *   coleccionable GEMA facetada flotando, con un destello
 *   minijuego     DADO con sus puntos
 * El COLOR sigue siendo el estado (verde hecho, azul en juego, rojo
 * pendiente). Encima de cada objeto, el cartel con el número.
 */

/** Tamaño de la imagen en píxeles CSS, y a cuánto se hornea. */
export const ANCHO_BOLA_PX = 72
export const ALTO_BOLA_PX = 116
const ESCALA = 3
const SOBREMUESTREO = 2
/** Grados sobre el horizonte desde los que mira la cámara: el mapa va a 58° de inclinación. */
const ELEVACION_CAMARA_GRADOS = 32
const PHI = (ELEVACION_CAMARA_GRADOS * Math.PI) / 180
/** Encuadre: medio ancho del mundo visible, y de dónde a dónde en vertical (metros en pantalla). */
const MEDIO_ANCHO = 2.7
const ABAJO = -(2.1 * Math.sin(PHI) + 0.25)
const ARRIBA = ABAJO + MEDIO_ANCHO * 2 * (ALTO_BOLA_PX / ANCHO_BOLA_PX)
/** Altura del centro del objeto y del cartel, en metros. */
const CENTRO_OBJETO = 4.5
const CENTRO_CARTEL = 6.9

/**
 * Cuánto hay que bajar la imagen (píxeles CSS, con el ancla abajo) para
 * que el punto del suelo caiga sobre la coordenada del nodo: el brillo del
 * suelo sobresale por debajo de ese punto.
 */
export const DESPLAZAMIENTO_ANCLA_PX = Math.round((-ABAJO / (ARRIBA - ABAJO)) * ALTO_BOLA_PX)

/** Centro del objeto en píxeles CSS desde arriba: donde va el halo del nodo en juego. */
export const CENTRO_HALO_3D_PX = Math.round((1 - (CENTRO_OBJETO * Math.cos(PHI) - ABAJO) / (ARRIBA - ABAJO)) * ALTO_BOLA_PX)

let renderer: THREE.WebGLRenderer | null = null
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
  } catch {
    renderer = null
  }
  return renderer
}

function lienzo256(pintar: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  if (g) pintar(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Cara del panel QR: código (de mentira, pero se lee como QR) con marco del color del estado. */
function texturaQR(hex: string): THREE.CanvasTexture {
  return lienzo256((g) => {
    g.fillStyle = hex
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#ffffff'
    g.fillRect(16, 16, 224, 224)
    const n = 9
    const m = 24
    const desde = 20
    g.fillStyle = '#0b1220'
    const finder = (fi: number, fj: number) => {
      g.fillRect(desde + fi * m, desde + fj * m, 3 * m, 3 * m)
      g.fillStyle = '#ffffff'
      g.fillRect(desde + fi * m + m * 0.75, desde + fj * m + m * 0.75, m * 1.5, m * 1.5)
      g.fillStyle = '#0b1220'
      g.fillRect(desde + fi * m + m * 1.1, desde + fj * m + m * 1.1, m * 0.8, m * 0.8)
    }
    finder(0, 0)
    finder(n - 3, 0)
    finder(0, n - 3)
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const enFinder = (i < 3 && j < 3) || (i >= n - 3 && j < 3) || (i < 3 && j >= n - 3)
        if (enFinder) continue
        if ((i * 7 + j * 13 + i * j) % 3 === 0) g.fillRect(desde + i * m + 2, desde + j * m + 2, m - 4, m - 4)
      }
    }
  })
}

/** Cara de dado: fondo del color del estado y puntos blancos. */
function texturaDado(hex: string, puntos: number): THREE.CanvasTexture {
  return lienzo256((g) => {
    g.fillStyle = hex
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = 'rgba(255,255,255,0.14)'
    g.fillRect(0, 0, 256, 18)
    g.fillRect(0, 0, 18, 256)
    const a = 64
    const b = 128
    const c = 192
    const posiciones: Record<number, [number, number][]> = {
      1: [[b, b]],
      2: [[a, a], [c, c]],
      3: [[a, a], [b, b], [c, c]],
      4: [[a, a], [c, a], [a, c], [c, c]],
      5: [[a, a], [c, a], [b, b], [a, c], [c, c]],
      6: [[a, a], [c, a], [a, b], [c, b], [a, c], [c, c]],
    }
    g.fillStyle = '#ffffff'
    for (const [x, y] of posiciones[puntos] || posiciones[1]) {
      g.beginPath()
      g.arc(x, y, 24, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** Destello de cuatro puntas, blanco, para la gema. */
function texturaChispa(): THREE.CanvasTexture {
  return lienzo256((g) => {
    const brillo = g.createRadialGradient(128, 128, 0, 128, 128, 120)
    brillo.addColorStop(0, 'rgba(255,255,255,0.9)')
    brillo.addColorStop(0.25, 'rgba(255,255,255,0.35)')
    brillo.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = brillo
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(128, 8)
    g.quadraticCurveTo(136, 120, 248, 128)
    g.quadraticCurveTo(136, 136, 128, 248)
    g.quadraticCurveTo(120, 136, 8, 128)
    g.quadraticCurveTo(120, 120, 128, 8)
    g.closePath()
    g.fill()
  })
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

/** Mástil blanco desde el suelo hasta `alto` metros. */
function mastil(alto: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.2, alto - 0.15, 20),
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.05 })
  )
  m.position.y = 0.15 + (alto - 0.15) / 2
  return m
}

function deCaraALaCamara(malla: THREE.Object3D, y: number, adelante = 0): void {
  malla.position.set(0, y, 0).add(new THREE.Vector3(0, Math.sin(PHI), Math.cos(PHI)).multiplyScalar(adelante))
  malla.rotation.x = -PHI
}

/** Añade a la escena el objeto del tipo, del color del estado. */
function construirObjeto(escena: THREE.Scene, tipo: TipoDeNodo, color: number, hex: string): void {
  const solido = (extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, ...extra })

  if (tipo === 'checkpoint') {
    // Bandera: mástil alto, banderín triangular y remate.
    escena.add(mastil(5.3))
    const forma = new THREE.Shape()
    forma.moveTo(0, 0.6)
    forma.lineTo(2.1, 0.05)
    forma.lineTo(0, -0.55)
    forma.closePath()
    const bandera = new THREE.Mesh(new THREE.ShapeGeometry(forma), solido({ side: THREE.DoubleSide, emissiveIntensity: 0.45 }))
    bandera.position.set(0.1, 4.55, 0)
    bandera.rotation.y = -0.35
    escena.add(bandera)
    const remate = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 20), solido({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15 }))
    remate.position.y = 5.45
    escena.add(remate)
    return
  }

  if (tipo === 'qr') {
    // Panel cuadrado con el código en la cara.
    escena.add(mastil(3.25))
    const lados = solido()
    const cara = new THREE.MeshStandardMaterial({ map: texturaQR(hex), roughness: 0.5 })
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 0.16), [lados, lados, lados, lados, cara, lados])
    panel.position.y = CENTRO_OBJETO - 0.15
    panel.rotation.y = -0.18
    escena.add(panel)
    return
  }

  if (tipo === 'coleccionable') {
    // Gema facetada flotando, con destello.
    escena.add(mastil(2.9))
    const geometria = new THREE.OctahedronGeometry(1.15, 0)
    geometria.scale(1, 1.45, 1)
    const gema = new THREE.Mesh(geometria, solido({ flatShading: true, roughness: 0.25, metalness: 0.1, emissiveIntensity: 0.5 }))
    gema.position.y = CENTRO_OBJETO + 0.1
    gema.rotation.y = Math.PI / 4 + 0.2
    escena.add(gema)
    const chispa = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: texturaChispa(), transparent: true, depthWrite: false }))
    deCaraALaCamara(chispa, 5.75, 0.9)
    chispa.position.x = 0.95
    chispa.renderOrder = 5
    escena.add(chispa)
    return
  }

  // Minijuego: un dado con sus puntos, de canto.
  escena.add(mastil(3.35))
  const caras = [5, 2, 6, 1, 3, 4].map((p) => new THREE.MeshStandardMaterial({ map: texturaDado(hex, p), roughness: 0.45 }))
  const dado = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 2.0), caras)
  dado.position.y = CENTRO_OBJETO
  dado.rotation.set(0.3, 0.6, 0.12)
  escena.add(dado)
}

/** La imagen del nodo, o null si este navegador no puede renderizarla. */
export function renderizarBola(numero: number, estado: EstadoDeNodo, tipo: TipoDeNodo): ImageData | null {
  const clave = `${numero}-${estado}-${tipo}`
  if (cache.has(clave)) return cache.get(clave) ?? null
  const r = asegurarRenderer()
  if (!r) {
    cache.set(clave, null)
    return null
  }
  const escena = new THREE.Scene()
  try {
    const color = COLOR[estado]
    const hex = '#' + color.toString(16).padStart(6, '0')

    escena.add(new THREE.HemisphereLight(0xffffff, 0xc7cfc4, 1.4))
    const sol = new THREE.DirectionalLight(0xfff3d6, 1.5)
    sol.position.set(1.4, 2.4, 1.8)
    escena.add(sol)
    escena.add(new THREE.AmbientLight(0xffffff, 0.5))

    // Brillo difuminado en el suelo, del color del estado.
    const brillo = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({ map: texturaBrillo(hex), transparent: true, opacity: 0.85, depthWrite: false })
    )
    brillo.rotation.x = -Math.PI / 2
    brillo.position.y = 0.02
    escena.add(brillo)

    construirObjeto(escena, tipo, color, hex)

    // El cartel con el número y la chapa del tipo, encima del objeto.
    const cartel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0),
      new THREE.MeshBasicMaterial({ map: texturaNumero(numero, hex, tipo), transparent: true, depthWrite: false })
    )
    deCaraALaCamara(cartel, CENTRO_CARTEL, 0.4)
    cartel.renderOrder = 10
    escena.add(cartel)

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

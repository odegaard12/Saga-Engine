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
 * Un objeto reconocible por tipo, con sus colores de verdad:
 *   checkpoint    BANDERA A CUADROS ondeando en un poste alto
 *   qr            CARTEL blanco con un código QR
 *   coleccionable COFRE del tesoro abierto, con luz de oro dentro
 *   minijuego     MANDO de juego con sus botones
 * El estado (verde hecho, azul en juego, rojo pendiente) va en el poste,
 * en el brillo del suelo y en el cartel del número, que va encima.
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
const CENTRO_CARTEL = 7.1

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

/** Cara del cartel QR: código con tres localizadores de siete módulos, líneas de tiempo y datos. Se lee como QR. */
function texturaQR(): THREE.CanvasTexture {
  return lienzo256((g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 256, 256)
    const n = 25
    const m = 8
    const desde = 28
    const negro = (i: number, j: number) => g.fillRect(desde + i * m, desde + j * m, m, m)
    g.fillStyle = '#0b1220'
    const finder = (fi: number, fj: number) => {
      for (let i = 0; i < 7; i += 1) {
        for (let j = 0; j < 7; j += 1) {
          const borde = i === 0 || j === 0 || i === 6 || j === 6
          const centro = i >= 2 && i <= 4 && j >= 2 && j <= 4
          if (borde || centro) negro(fi + i, fj + j)
        }
      }
    }
    finder(0, 0)
    finder(n - 7, 0)
    finder(0, n - 7)
    for (let k = 8; k < n - 8; k += 2) {
      negro(k, 6)
      negro(6, k)
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const enFinder = (i < 8 && j < 8) || (i >= n - 8 && j < 8) || (i < 8 && j >= n - 8)
        const enTiempo = i === 6 || j === 6
        if (enFinder || enTiempo) continue
        if ((i * 7 + j * 13 + i * j * 3) % 5 < 2) negro(i, j)
      }
    }
  })
}

/** Bandera a cuadros blancos y negros: la de meta, la de checkpoint. */
function texturaCuadros(): THREE.CanvasTexture {
  return lienzo256((g) => {
    const cx = 8
    const cy = 6
    const w = 256 / cx
    const h = 256 / cy
    for (let i = 0; i < cx; i += 1) {
      for (let j = 0; j < cy; j += 1) {
        g.fillStyle = (i + j) % 2 === 0 ? '#0b1220' : '#ffffff'
        g.fillRect(i * w, j * h, w + 1, h + 1)
      }
    }
  })
}

/** Destello de cuatro puntas, dorado, para el cofre. */
function texturaChispa(): THREE.CanvasTexture {
  return lienzo256((g) => {
    const brillo = g.createRadialGradient(128, 128, 0, 128, 128, 120)
    brillo.addColorStop(0, 'rgba(255,241,180,0.95)')
    brillo.addColorStop(0.3, 'rgba(255,225,120,0.35)')
    brillo.addColorStop(1, 'rgba(255,225,120,0)')
    g.fillStyle = brillo
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#fff7d6'
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

/** Rectángulo con las esquinas redondeadas, para extruir con bisel. */
function rectanguloRedondeado(ancho: number, alto: number, radio: number): THREE.Shape {
  const s = new THREE.Shape()
  const x = -ancho / 2
  const y = -alto / 2
  s.moveTo(x + radio, y)
  s.lineTo(x + ancho - radio, y)
  s.quadraticCurveTo(x + ancho, y, x + ancho, y + radio)
  s.lineTo(x + ancho, y + alto - radio)
  s.quadraticCurveTo(x + ancho, y + alto, x + ancho - radio, y + alto)
  s.lineTo(x + radio, y + alto)
  s.quadraticCurveTo(x, y + alto, x, y + alto - radio)
  s.lineTo(x, y + radio)
  s.quadraticCurveTo(x, y, x + radio, y)
  return s
}

/** Bloque con cantos redondeados y biselados: bonito bajo la luz, sin aristas duras. */
function bloque(ancho: number, alto: number, fondo: number, radio: number, materiales: THREE.Material | THREE.Material[]): THREE.Mesh {
  const geometria = new THREE.ExtrudeGeometry(rectanguloRedondeado(ancho, alto, radio), {
    depth: fondo,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3,
    curveSegments: 8,
  })
  geometria.center()
  return new THREE.Mesh(geometria, materiales)
}

/** Poste del color del estado desde el suelo hasta `alto` metros. */
function poste(alto: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.17, alto - 0.15, 20),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.5 })
  )
  m.position.y = 0.15 + (alto - 0.15) / 2
  return m
}

function deCaraALaCamara(malla: THREE.Object3D, y: number, adelante = 0): void {
  malla.position.set(0, y, 0).add(new THREE.Vector3(0, Math.sin(PHI), Math.cos(PHI)).multiplyScalar(adelante))
  malla.rotation.x = -PHI
}

const mate = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra })

/**
 * Añade a la escena el objeto del tipo. El objeto tiene sus colores de
 * verdad (la bandera a cuadros, el QR blanco y negro, el cofre de madera y
 * oro); el estado va en el poste, en el brillo del suelo y en el cartel.
 */
function construirObjeto(escena: THREE.Scene, tipo: TipoDeNodo, color: number): void {
  if (tipo === 'checkpoint') {
    // Bandera a cuadros ondeando en un poste alto, con remate dorado.
    escena.add(poste(5.4, color))
    const geometria = new THREE.PlaneGeometry(1.9, 1.25, 20, 10)
    const posiciones = geometria.getAttribute('position') as THREE.BufferAttribute
    for (let k = 0; k < posiciones.count; k += 1) {
      const x = posiciones.getX(k) + 0.95
      posiciones.setZ(k, Math.sin(x * 3.4) * 0.11 * (0.25 + x / 1.9))
    }
    geometria.computeVertexNormals()
    const bandera = new THREE.Mesh(
      geometria,
      new THREE.MeshStandardMaterial({ map: texturaCuadros(), side: THREE.DoubleSide, roughness: 0.7 })
    )
    bandera.position.set(1.03, 4.65, 0)
    bandera.rotation.y = -0.3
    escena.add(bandera)
    const remate = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 20), mate(0xd4a017, { metalness: 0.6, roughness: 0.3 }))
    remate.position.y = 5.55
    escena.add(remate)
    return
  }

  if (tipo === 'qr') {
    // Cartel blanco con el código QR, marco del color del estado.
    escena.add(poste(3.2, color))
    const grupo = new THREE.Group()
    const tabla = bloque(2.6, 2.6, 0.18, 0.22, [mate(0xffffff, { roughness: 0.6 }), mate(color, { emissive: color, emissiveIntensity: 0.25 })])
    grupo.add(tabla)
    /**
     * El código va en un plano aparte, pegado a la cara: la geometría
     * extruida reparte la textura por coordenadas del mundo, no de 0 a 1, y
     * el QR salía diminuto en el centro del cartel.
     */
    const codigo = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 2.25), new THREE.MeshStandardMaterial({ map: texturaQR(), roughness: 0.6 }))
    codigo.position.z = 0.09 + 0.05 + 0.01
    grupo.add(codigo)
    grupo.position.y = CENTRO_OBJETO - 0.1
    grupo.rotation.x = -0.35
    escena.add(grupo)
    return
  }

  if (tipo === 'coleccionable') {
    // Cofre del tesoro abierto, con la tapa levantada y luz de oro dentro.
    escena.add(poste(3.1, color))
    const madera = mate(0x8a5a2b, { roughness: 0.75 })
    const maderaOscura = mate(0x5e3a19, { roughness: 0.8 })
    const oro = mate(0xe0b030, { metalness: 0.7, roughness: 0.3, emissive: 0xb07a10, emissiveIntensity: 0.25 })
    const y0 = CENTRO_OBJETO - 0.55
    const cuerpo = bloque(2.3, 1.25, 1.5, 0.12, [madera, maderaOscura])
    cuerpo.position.y = y0
    escena.add(cuerpo)
    for (const x of [-0.72, 0.72]) {
      const banda = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.32, 1.56), oro)
      banda.position.set(x, y0, 0)
      escena.add(banda)
    }
    const cierre = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.14), oro)
    cierre.position.set(0, y0 + 0.2, 0.8)
    escena.add(cierre)
    // Tapa: medio cilindro con bisagra atrás, abierta hacia atrás.
    const tapa = new THREE.Group()
    const cascaron = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.76, 2.3, 28, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.75, side: THREE.DoubleSide })
    )
    cascaron.rotation.z = Math.PI / 2
    cascaron.rotation.y = Math.PI / 2
    cascaron.position.set(0, 0, 0.76)
    tapa.add(cascaron)
    for (const x of [-0.72, 0.72]) {
      const aro = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.09, 8, 28, Math.PI), oro)
      aro.rotation.y = Math.PI / 2
      aro.position.set(x, 0, 0.76)
      tapa.add(aro)
    }
    tapa.position.set(0, y0 + 0.62, -0.75)
    tapa.rotation.x = -1.05
    escena.add(tapa)
    // El tesoro: luz dorada dentro y un destello encima.
    const tesoro = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc83c, emissiveIntensity: 1.4, roughness: 0.4 })
    )
    tesoro.position.set(0, y0 + 0.55, 0.1)
    escena.add(tesoro)
    const chispa = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: texturaChispa(), transparent: true, depthWrite: false }))
    deCaraALaCamara(chispa, y0 + 1.35, 0.9)
    chispa.position.x = 0.55
    chispa.renderOrder = 5
    escena.add(chispa)
    return
  }

  // Minijuego: un mando, del color del estado, con sus botones.
  escena.add(poste(3.3, color))
  const mando = new THREE.Group()
  const carcasa = mate(color, { emissive: color, emissiveIntensity: 0.3, roughness: 0.45 })
  const cuerpo = bloque(2.2, 1.0, 0.5, 0.35, carcasa)
  mando.add(cuerpo)
  for (const lado of [-1, 1]) {
    const asa = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.62, 6, 14), carcasa)
    asa.position.set(lado * 0.78, -0.5, 0.02)
    asa.rotation.z = lado * 0.42
    mando.add(asa)
  }
  const blanco = mate(0xffffff, { roughness: 0.4 })
  const oscuro = mate(0x0b1220, { roughness: 0.5 })
  const cruzH = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.1), blanco)
  cruzH.position.set(-0.68, 0.1, 0.28)
  const cruzV = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.1), blanco)
  cruzV.position.set(-0.68, 0.1, 0.28)
  mando.add(cruzH, cruzV)
  const botones: [number, number][] = [[0.68, 0.34], [0.9, 0.1], [0.46, 0.1], [0.68, -0.14]]
  for (const [x, y] of botones) {
    const boton = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), blanco)
    boton.position.set(x, y, 0.28)
    mando.add(boton)
  }
  for (const x of [-0.3, 0.3]) {
    const palanca = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.18, 16), oscuro)
    palanca.rotation.x = Math.PI / 2
    palanca.position.set(x, -0.28, 0.3)
    mando.add(palanca)
  }
  mando.position.y = CENTRO_OBJETO
  mando.rotation.x = -0.45
  escena.add(mando)
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

    construirObjeto(escena, tipo, color)

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

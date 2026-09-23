import * as THREE from 'three'
import { COLOR, texturaBrillo, texturaNumero, type EstadoDeNodo, type TipoDeNodo } from './nodosTresD'

/**
 * La bola de un nodo como OBJETO 3D renderizado una vez.
 *
 * Dibujar los nodos en vivo dentro del lienzo de MapLibre (nodosTresD.ts)
 * salía serrado en el móvil y parpadeaba al girar: cada fotograma se
 * volvía a rasterizar con la matriz nueva, "como si se generara en el
 * momento". Aquí el objeto se renderiza UNA vez con three.js, con luz,
 * sombra y brillo, a tres veces la resolución de pantalla y con
 * sobremuestreo, en un lienzo propio (con antialiasing, que aquí no rompe
 * nada). Lo que sale es una imagen que el mapa coloca como símbolo: la
 * pinta en el mismo fotograma que el terreno, a su altura, con filtrado
 * de textura; no cambia entre fotogramas y no tiembla.
 *
 * Es una bola sobre un mástil: se ve igual desde cualquier lado, así que
 * un símbolo de frente es indistinguible del objeto girando en el mundo.
 * Se renderiza con la inclinación de la vista 3D del mapa.
 */

/** Tamaño de la imagen en píxeles CSS, y a cuánto se hornea. */
const ANCHO = 64
const ALTO = 92
const ESCALA = 3
const SOBREMUESTREO = 2
/** Grados sobre el horizonte desde los que mira la cámara: el mapa va a 58° de inclinación. */
const ELEVACION_CAMARA_GRADOS = 32
const PHI = (ELEVACION_CAMARA_GRADOS * Math.PI) / 180
/** Encuadre: medio ancho del mundo visible, y de dónde a dónde en vertical (metros en pantalla). */
const MEDIO_ANCHO = 2.4
const ABAJO = -(2.1 * Math.sin(PHI) + 0.25)
const ARRIBA = ABAJO + MEDIO_ANCHO * 2 * (ALTO / ANCHO)

const medidas = (estado: EstadoDeNodo) => ({
  R: estado === 'actual' ? 1.75 : 1.5,
  H: estado === 'actual' ? 4.4 : 3.9,
})

/**
 * Cuánto hay que bajar la imagen (píxeles CSS, con el ancla abajo) para
 * que el punto del suelo caiga sobre la coordenada del nodo: el brillo del
 * suelo sobresale por debajo de ese punto.
 */
export const DESPLAZAMIENTO_ANCLA_PX = Math.round((-ABAJO / (ARRIBA - ABAJO)) * ALTO)

/** Centro de la bola del nodo en juego, en píxeles CSS desde arriba: donde va el halo. */
export const CENTRO_HALO_3D_PX = Math.round((1 - (medidas('actual').H * Math.cos(PHI) - ABAJO) / (ARRIBA - ABAJO)) * ALTO)

/** La geometría del cuerpo según el tipo de nodo. */
function geometriaDelTipo(tipo: TipoDeNodo, R: number): THREE.BufferGeometry {
  if (tipo === 'minijuego') return new THREE.IcosahedronGeometry(R * 1.12, 0)
  if (tipo === 'coleccionable') {
    const gema = new THREE.OctahedronGeometry(R * 1.05, 0)
    gema.scale(1, 1.35, 1)
    return gema
  }
  if (tipo === 'qr') return new THREE.BoxGeometry(R * 1.5, R * 1.5, R * 1.5)
  return new THREE.SphereGeometry(R, 96, 64)
}

let renderer: THREE.WebGLRenderer | null = null
let intentado = false
const cache = new Map<string, ImageData | null>()

function asegurarRenderer(): THREE.WebGLRenderer | null {
  if (renderer || intentado) return renderer
  intentado = true
  try {
    const lienzo = document.createElement('canvas')
    lienzo.width = ANCHO * ESCALA * SOBREMUESTREO
    lienzo.height = ALTO * ESCALA * SOBREMUESTREO
    renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, premultipliedAlpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(lienzo.width, lienzo.height, false)
  } catch {
    renderer = null
  }
  return renderer
}

function liberar(escena: THREE.Scene): void {
  escena.traverse((objeto) => {
    const malla = objeto as THREE.Mesh
    if (malla.geometry) malla.geometry.dispose()
    const material = malla.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined
    if (material && typeof material.dispose === 'function') {
      material.map?.dispose()
      material.dispose()
    }
  })
}

/** La imagen de la bola de un nodo, o null si este navegador no puede renderizarla. */
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
    const { R, H } = medidas(estado)

    escena.add(new THREE.HemisphereLight(0xffffff, 0xc7cfc4, 1.4))
    const sol = new THREE.DirectionalLight(0xfff3d6, 1.4)
    sol.position.set(1.2, 2.2, 1.6)
    escena.add(sol)
    escena.add(new THREE.AmbientLight(0xffffff, 0.55))

    // Brillo difuminado en el suelo, del color del estado.
    const brillo = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({ map: texturaBrillo(hex), transparent: true, opacity: 0.85, depthWrite: false })
    )
    brillo.rotation.x = -Math.PI / 2
    brillo.position.y = 0.02
    escena.add(brillo)

    // Mástil grueso, blanco.
    const mastil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.26, H - 0.2, 24),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.05 })
    )
    mastil.position.y = 0.2 + (H - 0.2) / 2
    escena.add(mastil)

    /**
     * El cuerpo, del color del estado y con la FORMA del tipo: los nodos
     * salían "todos iguales" porque sólo los distinguía la chapa pequeña.
     * Bola lisa el checkpoint; dado de veinte caras el minijuego; gema
     * (octaedro estirado) el coleccionable; cubo el QR. Sólidos y sin
     * partes finas: nada que serrar.
     */
    const facetado = tipo !== 'checkpoint'
    const cuerpo = new THREE.Mesh(
      geometriaDelTipo(tipo, R),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: facetado ? 0.4 : 0.55,
        roughness: facetado ? 0.4 : 0.3,
        flatShading: facetado,
      })
    )
    cuerpo.position.y = H
    if (tipo === 'minijuego') cuerpo.rotation.set(0.35, 0.4, 0)
    if (tipo === 'coleccionable') cuerpo.rotation.set(0, Math.PI / 4, 0)
    if (tipo === 'qr') cuerpo.rotation.set(0, Math.PI / 4, 0)
    escena.add(cuerpo)

    // Cartel con el número y la chapa del tipo, de cara a la cámara y
    // delante de la bola.
    const cartel = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 1.55, R * 1.55),
      new THREE.MeshBasicMaterial({ map: texturaNumero(numero, hex, tipo), transparent: true, depthWrite: false })
    )
    // Delante del cuerpo: las formas con aristas llegan más lejos que la bola.
    cartel.position.set(0, H, 0).add(new THREE.Vector3(0, Math.sin(PHI), Math.cos(PHI)).multiplyScalar(R * (facetado ? 1.35 : 1.02)))
    cartel.rotation.x = -PHI
    cartel.renderOrder = 10
    escena.add(cartel)

    const camara = new THREE.OrthographicCamera(-MEDIO_ANCHO, MEDIO_ANCHO, ARRIBA, ABAJO, 0.1, 100)
    camara.position.set(0, Math.sin(PHI) * 30, Math.cos(PHI) * 30)
    camara.lookAt(0, 0, 0)

    r.render(escena, camara)

    // De 2x a 1x: el sobremuestreo se resuelve al reducir.
    const salida = document.createElement('canvas')
    salida.width = ANCHO * ESCALA
    salida.height = ALTO * ESCALA
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

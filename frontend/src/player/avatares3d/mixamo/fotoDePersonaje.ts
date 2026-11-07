import * as THREE from 'three'
import { crearAvatarParaFoto, liberarAvatar } from './avatar'
import { claveDeAspecto, type Aspecto } from './catalogo'

/**
 * 7/11 (Óscar: «en 3D deben aparecer sí o sí los personajes»): la IMAGEN FIJA de un personaje para quien se queda
 * fuera del tope de cuerpos animados de la calidad (`TOPE_DE_AVATARES`). Su propio personaje, quieto y de frente,
 * horneado UNA vez por aspecto en una textura con el renderizador del mapa, y pintado como un cartel de pie del mismo
 * alto que el cuerpo, con los pies en su sitio. Cuesta dos triángulos: un móvil flojo enseña a todo el grupo.
 *
 * El cartel va en metros del avatar (1,75 m de alto) dentro de su `holder`, así que crece y se coloca como el cuerpo.
 * Se escribe en la profundidad (con recorte por alfa), así que las siluetas de los nodos lo tapan igual que a un cuerpo.
 */

/** El marco del cartel, en metros del avatar: de -PIES a ALTO-PIES de alto, centrado en x. */
export const ANCHO_FOTO_M = 1.0
export const ALTO_FOTO_M = 2.0
const PIES_FOTO_M = 0.04
/** Píxeles de la textura (la mitad de ancho que de alto, como el marco). */
const PX_ANCHO = 192
const PX_ALTO = 384
/** Un poco desde arriba, como se ve el mapa inclinado. */
const ELEVACION_GRADOS = 12

export const geometriaFoto = new THREE.PlaneGeometry(ANCHO_FOTO_M, ALTO_FOTO_M).translate(
  0,
  ALTO_FOTO_M / 2 - PIES_FOTO_M,
  0
)

type Foto = { objetivo: THREE.WebGLRenderTarget; material: THREE.MeshBasicMaterial }
const fotos = new Map<string, Foto>()
let rendererDeLasFotos: THREE.WebGLRenderer | null = null
let estudio: { escena: THREE.Scene; camara: THREE.OrthographicCamera } | null = null

function montarEstudio() {
  if (estudio) return estudio
  const escena = new THREE.Scene()
  // Las mismas luces que la escena del mapa (nodosTresD.ts), con el cielo en +y (aquí la escena es three.js normal).
  const cielo = new THREE.HemisphereLight(0xffffff, 0xc7cfc4, 1.5)
  cielo.position.set(0, 1, 0)
  const sol = new THREE.DirectionalLight(0xfff3d6, 1.3)
  sol.position.set(0.35, 1, 0.6)
  escena.add(cielo, sol, new THREE.AmbientLight(0xffffff, 0.7))
  const centroY = ALTO_FOTO_M / 2 - PIES_FOTO_M
  const camara = new THREE.OrthographicCamera(
    -ANCHO_FOTO_M / 2,
    ANCHO_FOTO_M / 2,
    ALTO_FOTO_M / 2,
    -ALTO_FOTO_M / 2,
    0.1,
    20
  )
  const a = (ELEVACION_GRADOS * Math.PI) / 180
  camara.position.set(0, centroY + 5 * Math.sin(a), 5 * Math.cos(a))
  camara.lookAt(0, centroY, 0)
  estudio = { escena, camara }
  return estudio
}

/** ¿Ya está horneada la imagen de este aspecto (con este renderizador)? */
export function hayFotoDe(renderer: THREE.WebGLRenderer, a: Aspecto): boolean {
  return renderer === rendererDeLasFotos && fotos.has(claveDeAspecto(a))
}

/**
 * El material con la imagen fija de este aspecto. La primera vez la hornea (un avatar quieto, una pasada a una
 * textura y se suelta), así que el que llama decide cuándo (como mucho una por fotograma). El modelo del personaje
 * tiene que estar ya en memoria.
 */
export function materialDeFoto(renderer: THREE.WebGLRenderer, a: Aspecto): THREE.MeshBasicMaterial {
  // Otro renderizador (contexto WebGL recuperado): las texturas viejas ya no valen.
  if (renderer !== rendererDeLasFotos) {
    liberarFotos()
    rendererDeLasFotos = renderer
  }
  const clave = claveDeAspecto(a)
  const hecha = fotos.get(clave)
  if (hecha) return hecha.material
  const { escena, camara } = montarEstudio()
  const objetivo = new THREE.WebGLRenderTarget(PX_ANCHO, PX_ALTO, {
    samples: 4,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  })
  const av = crearAvatarParaFoto(a)
  if (av.blob) av.blob.visible = false
  escena.add(av.root)
  const previo = renderer.getRenderTarget()
  // MapLibre acaba de usar el contexto: three.js no sabe en qué estado lo dejó.
  renderer.resetState()
  renderer.setRenderTarget(objetivo)
  renderer.setClearColor(0x000000, 0)
  renderer.clear(true, true, false)
  renderer.render(escena, camara)
  renderer.setRenderTarget(previo)
  liberarAvatar(av)
  const material = new THREE.MeshBasicMaterial({
    map: objetivo.texture,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  })
  fotos.set(clave, { objetivo, material })
  return material
}

/** Suelta todas las texturas (al quitar la capa o cambiar de renderizador). */
export function liberarFotos(): void {
  for (const f of fotos.values()) {
    f.material.dispose()
    f.objetivo.dispose()
  }
  fotos.clear()
  rendererDeLasFotos = null
}

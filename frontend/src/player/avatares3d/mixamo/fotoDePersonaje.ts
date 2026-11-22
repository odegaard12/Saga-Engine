import * as THREE from 'three'
import { guardarHorneada, leerHorneadas, type Horneada } from '../../offline/horneadas'
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

type Foto = { textura: THREE.Texture | THREE.WebGLRenderTarget; material: THREE.MeshBasicMaterial }
const fotos = new Map<string, Foto>()

/**
 * 22/11: las imágenes fijas horneadas en otra apertura (misma versión de la app), por aspecto. Con ellas no se monta
 * el personaje entero para una foto (medido: ~2,9 s de CPU por minuto con 15 jugadores al arrancar). Son los mismos
 * píxeles que dejó el horneado, así que se ven igual.
 */
let guardadas = new Map<string, Horneada>()
let leidas: Promise<void> | null = null
export function cargarFotosGuardadas(): Promise<void> {
  leidas ??= leerHorneadas('foto')
    .then((m) => {
      guardadas = m
    })
    .catch(() => undefined)
  return leidas
}

/** ¿Hay imagen fija guardada de este aspecto? Hacer su material no cuesta un horneado. */
export function hayFotoGuardada(a: Aspecto): boolean {
  return guardadas.has(claveDeAspecto(a))
}
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
  const guardada = guardadas.get(clave)
  if (guardada) {
    // Como el destino del horneado: RGBA de 8 bits, filas de abajo arriba, con mipmaps y filtro lineal.
    const textura = new THREE.DataTexture(new Uint8Array(guardada.datos.buffer), guardada.ancho, guardada.alto)
    textura.generateMipmaps = true
    textura.minFilter = THREE.LinearMipmapLinearFilter
    textura.magFilter = THREE.LinearFilter
    textura.needsUpdate = true
    const material = new THREE.MeshBasicMaterial({ map: textura, alphaTest: 0.45, side: THREE.DoubleSide })
    fotos.set(clave, { textura, material })
    return material
  }
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
  // 22/11: se lee para la próxima apertura unos fotogramas después (`guardarFotosHorneadas`): leerla ya hacía esperar a la GPU.
  porGuardar.push({ clave, objetivo, desde: performance.now() })
  renderer.setRenderTarget(previo)
  liberarAvatar(av)
  const material = new THREE.MeshBasicMaterial({
    map: objetivo.texture,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  })
  fotos.set(clave, { textura: objetivo, material })
  return material
}

const porGuardar: { clave: string; objetivo: THREE.WebGLRenderTarget; desde: number }[] = []
/** 22/11: las lecturas en curso (WebGL2): los píxeles van a un búfer de la GPU y se recogen cuando la GPU avisa. */
const leyendo: { clave: string; gl: WebGL2RenderingContext; pbo: WebGLBuffer; aviso: WebGLSync }[] = []

/**
 * Lee UNA imagen fija horneada hace al menos 100 ms y la guarda para la próxima apertura. Se llama dentro del pintado
 * de la capa, con el renderizador de las fotos.
 *
 * 22/11: `readPixels` directo paraba el hilo principal ~70 ms por imagen (CPU ×4) aunque la GPU ya la tuviera: espera a
 * que el proceso de la GPU vacíe TODO lo pendiente. Con WebGL2 se pide la lectura a un búfer de la GPU (PBO) y se
 * recoge en un fotograma posterior, cuando su aviso (`fenceSync`) ya saltó: sin esperar nunca. Mismos píxeles.
 */
export function guardarFotosHorneadas(renderer: THREE.WebGLRenderer, ahora: number): boolean {
  const gl = renderer.getContext()
  const l = leyendo[0]
  if (l) {
    if (l.gl !== gl) {
      // 22/11 (auditoría): el búfer y el aviso son del contexto viejo: se sueltan allí, no se dejan colgando.
      l.gl.deleteBuffer(l.pbo)
      l.gl.deleteSync(l.aviso)
      leyendo.shift()
      return false
    }
    const g2 = l.gl
    const estado = g2.clientWaitSync(l.aviso, 0, 0)
    if (estado !== g2.ALREADY_SIGNALED && estado !== g2.CONDITION_SATISFIED) return false
    leyendo.shift()
    const pixeles = new Uint8Array(PX_ANCHO * PX_ALTO * 4)
    try {
      g2.bindBuffer(g2.PIXEL_PACK_BUFFER, l.pbo)
      g2.getBufferSubData(g2.PIXEL_PACK_BUFFER, 0, pixeles)
      guardarHorneada('foto', l.clave, PX_ANCHO, PX_ALTO, pixeles)
    } catch {
      // sin leerla: la próxima vez se hornea otra vez
    } finally {
      g2.bindBuffer(g2.PIXEL_PACK_BUFFER, null)
      g2.deleteBuffer(l.pbo)
      g2.deleteSync(l.aviso)
    }
    return false
  }
  const f = porGuardar[0]
  if (!f || ahora - f.desde < 100) return false
  porGuardar.shift()
  if (renderer !== rendererDeLasFotos || fotos.get(f.clave)?.textura !== f.objetivo) return false
  if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
    // Como `readRenderTargetPixels`: del framebuffer ya resuelto del objetivo, y se deja puesto el que había.
    const props = (o: THREE.WebGLRenderTarget | null) =>
      o ? (renderer.properties.get(o) as { __webglFramebuffer?: WebGLFramebuffer }).__webglFramebuffer ?? null : null
    const fb = props(f.objetivo)
    const pbo = gl.createBuffer()
    if (fb && pbo) {
      try {
        renderer.state.bindFramebuffer(gl.FRAMEBUFFER, fb)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo)
        gl.bufferData(gl.PIXEL_PACK_BUFFER, PX_ANCHO * PX_ALTO * 4, gl.STREAM_READ)
        gl.readPixels(0, 0, PX_ANCHO, PX_ALTO, gl.RGBA, gl.UNSIGNED_BYTE, 0)
        const aviso = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        if (aviso) leyendo.push({ clave: f.clave, gl, pbo, aviso })
        else gl.deleteBuffer(pbo)
      } catch {
        gl.deleteBuffer(pbo)
      } finally {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
        renderer.state.bindFramebuffer(gl.FRAMEBUFFER, props(renderer.getRenderTarget()))
      }
      return true
    }
    // 22/11 (auditoría): sin framebuffer, el PBO recién creado no se usa: se suelta antes de leer a la antigua.
    if (pbo) gl.deleteBuffer(pbo)
  }
  const pixeles = new Uint8Array(PX_ANCHO * PX_ALTO * 4)
  try {
    renderer.readRenderTargetPixels(f.objetivo, 0, 0, PX_ANCHO, PX_ALTO, pixeles)
    guardarHorneada('foto', f.clave, PX_ANCHO, PX_ALTO, pixeles)
  } catch {
    // sin leerla: la próxima vez se hornea otra vez
  }
  return true
}

/** Suelta todas las texturas (al quitar la capa o cambiar de renderizador). */
export function liberarFotos(): void {
  for (const f of fotos.values()) {
    f.material.dispose()
    f.textura.dispose()
  }
  fotos.clear()
  porGuardar.length = 0
  for (const l of leyendo.splice(0)) {
    l.gl.deleteBuffer(l.pbo)
    l.gl.deleteSync(l.aviso)
  }
  rendererDeLasFotos = null
}

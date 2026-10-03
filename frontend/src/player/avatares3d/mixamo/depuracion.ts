import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { crearAvatarTienda, type AvatarMotor } from './avatar'
import { cargarPersonaje } from './cargador'
import { MX_IDS, type Aspecto, type MxId } from './catalogo'

/**
 * Herramientas de desarrollo de los avatares 3D. Sólo se instalan con
 * `?depurar-mapa` (ver MapSurfaceGL y TiendaDeRopa): no es una puerta para
 * jugadores. Sirven para regenerar lo que se hornea en el repo:
 *
 *   await __sagaAvataresDev.retratos()  -> las caras de `assets_privados/avatares/` (ver scripts/hornear_avatares_mixamo.py)
 */

const ASPECTO_NEUTRO = (mx: MxId): Aspecto => ({ mx, top: 0, pants: 10, hair: 4, items: {} })

/** La cara de cada personaje (webp, cuadrada) con el mismo encuadre del banco (`makeFaces`). */
async function retratos(lado = 192, ids: readonly MxId[] = MX_IDS) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  r.outputColorSpace = THREE.SRGBColorSpace
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 0.9
  r.setPixelRatio(1)
  r.setSize(lado, lado, false)
  const pmrem = new THREE.PMREMGenerator(r)
  const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  const salida: Record<string, string> = {}
  for (const id of ids) {
    await cargarPersonaje(id, { permitirRed: true })
    const a: AvatarMotor = crearAvatarTienda(ASPECTO_NEUTRO(id))
    a.advance(0.2)
    a.root.updateMatrixWorld(true)
    const sc = new THREE.Scene()
    sc.background = new THREE.Color(0xdfe7ee)
    sc.environment = entorno
    const luz = new THREE.DirectionalLight(0xffffff, 2.2)
    luz.position.set(2, 3, 4)
    sc.add(luz, a.root)
    const t = new THREE.Vector3(0, a.lm.topB - 0.11, a.lm.headZ)
    const cm = new THREE.PerspectiveCamera(22, 1, 0.05, 20)
    cm.position.set(0.25, t.y + 0.02, 1.1)
    cm.lookAt(t)
    r.render(sc, cm)
    salida[id] = r.domElement.toDataURL('image/webp', 0.82)
  }
  r.dispose()
  return salida
}

export function instalarDepuracion() {
  ;(window as unknown as { __sagaAvataresDev?: unknown }).__sagaAvataresDev = {
    retratos,
  }
}

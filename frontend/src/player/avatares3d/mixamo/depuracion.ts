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

/**
 * Una foto del avatar con su aspecto entero (ropa, colores, objetos), para revisar combinaciones y agarres:
 * `az` (rad, 0 = de frente), `el` (rad), `cerca` (encuadre de la mano derecha en vez del cuerpo), `andar` (m/s),
 * `segundos` de animación antes de la foto y `gesto` (clip `ge__*`).
 */
async function foto(
  a: Aspecto,
  o: {
    az?: number
    el?: number
    cerca?: boolean
    andar?: number
    segundos?: number
    gesto?: string
    lado?: number
  } = {}
) {
  const lado = o.lado ?? 320
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
  r.outputColorSpace = THREE.SRGBColorSpace
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 0.9
  r.setPixelRatio(1)
  r.setSize(lado, lado, false)
  await cargarPersonaje(a.mx, { permitirRed: true })
  const av: AvatarMotor = crearAvatarTienda(a)
  av.fijarObjetos()
  if (o.andar) av.setSpeed(o.andar)
  if (o.gesto) av.gesture(o.gesto)
  av.advance(o.segundos ?? 0.5)
  // Andando, el avatar de la tienda avanza solo: se devuelve al centro de la foto.
  av.root.position.set(0, 0, 0)
  av.root.updateMatrixWorld(true)
  const sc = new THREE.Scene()
  sc.background = new THREE.Color(0xdfe7ee)
  sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture
  const luz = new THREE.DirectionalLight(0xffffff, 2.2)
  luz.position.set(2, 3, 4)
  sc.add(luz, av.root)
  const mano = av.model.getObjectByName('mixamorigRightHand')
  const t =
    o.cerca && mano ? mano.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0.95, 0)
  const d = o.cerca ? 0.75 : 3.6
  const az = o.az ?? 0.5
  const el = o.el ?? 0.08
  const cm = new THREE.PerspectiveCamera(30, 1, 0.05, 30)
  cm.position.set(
    t.x + d * Math.sin(az) * Math.cos(el),
    t.y + d * Math.sin(el),
    t.z + d * Math.cos(az) * Math.cos(el)
  )
  cm.lookAt(t)
  r.render(sc, cm)
  const url = r.domElement.toDataURL('image/jpeg', 0.85)
  r.dispose()
  return url
}

export function instalarDepuracion() {
  ;(window as unknown as { __sagaAvataresDev?: unknown }).__sagaAvataresDev = {
    retratos,
    foto,
  }
}

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { crearAvatarTienda, liberarAvatar, type AvatarMotor } from './avatar'
import { mirarA, ojosDe, ponerCorneas } from './cara'
import { cargarPersonaje } from './cargador'
import { MX_IDS, type Aspecto, type MxId } from './catalogo'
import { lucesDeEstudio } from './escenaTienda'

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
    /** Encuadre de la cara (ojos, piel, expresión). */
    cara?: boolean
    /** Con `cerca`, la mano izquierda en vez de la derecha. */
    mano?: 'L' | 'R'
    /** Distancia de la cámara (m) en vez de la del encuadre. */
    d?: number
    /** Altura del objetivo (m) en el encuadre del cuerpo. */
    y?: number
    andar?: number
    segundos?: number
    gesto?: string
    lado?: number
    /** false = sin córneas (para comparar el brillo de los ojos). */
    natural?: boolean
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
  sc.add(...lucesDeEstudio(), av.root)
  const mano = av.model.getObjectByName(o.mano === 'L' ? 'mixamorigLeftHand' : 'mixamorigRightHand')
  const cabeza = av.model.getObjectByName('mixamorigHead')
  const t =
    o.cara && cabeza
      ? cabeza.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0))
      : o.cerca && mano
        ? mano.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(0, o.y ?? 0.95, 0)
  const d = o.d ?? (o.cara ? 0.62 : o.cerca ? 0.75 : 3.6)
  const az = o.az ?? 0.5
  const el = o.el ?? 0.08
  const cm = new THREE.PerspectiveCamera(30, 1, 0.05, 30)
  cm.position.set(
    t.x + d * Math.sin(az) * Math.cos(el),
    t.y + d * Math.sin(el),
    t.z + d * Math.cos(az) * Math.cos(el)
  )
  cm.lookAt(t)
  // Como en la tienda: córneas y la cabeza buscando la cámara.
  if (o.natural !== false) ponerCorneas(av)
  mirarA(av, cm.position, 2)
  r.render(sc, cm)
  const url = r.domElement.toDataURL('image/jpeg', 0.85)
  r.dispose()
  return url
}

const posDe = (av: AvatarMotor, hueso: string, v = new THREE.Vector3()) => {
  const b = av.model.getObjectByName('mixamorig' + hueso)
  return b ? b.getWorldPosition(v) : v.set(0, 0, 0)
}

/**
 * Cuánto se nota un gesto: lo que se separan manos y cabeza de un avatar gemelo que sigue quieto (mismo
 * reloj, misma pose de reposo), fotograma a fotograma. Metros reales (el avatar mide 1,75 m).
 */
async function medirGesto(mx: MxId, clip: string) {
  await cargarPersonaje(mx, { permitirRed: true })
  const quieto = crearAvatarTienda(ASPECTO_NEUTRO(mx))
  const av = crearAvatarTienda(ASPECTO_NEUTRO(mx))
  quieto.advance(0.5)
  av.advance(0.5)
  av.gesture(clip)
  const dur = (av.gest[0] as { dur?: number } | undefined)?.dur ?? 0
  const huesos = ['LeftHand', 'RightHand', 'Head', 'Spine2']
  const max: Record<string, number> = {}
  const suma: Record<string, number> = {}
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const qa = new THREE.Quaternion()
  const qb = new THREE.Quaternion()
  let giro = 0
  let n = 0
  for (let t = 0; t < dur; t += 1 / 30) {
    av.update(1 / 30)
    quieto.update(1 / 30)
    av.root.updateMatrixWorld(true)
    quieto.root.updateMatrixWorld(true)
    for (const h of huesos) {
      const d = posDe(av, h, a).distanceTo(posDe(quieto, h, b))
      max[h] = Math.max(max[h] ?? 0, d)
      suma[h] = (suma[h] ?? 0) + d
    }
    av.model.getObjectByName('mixamorigHead')?.getWorldQuaternion(qa)
    quieto.model.getObjectByName('mixamorigHead')?.getWorldQuaternion(qb)
    giro = Math.max(giro, (qa.angleTo(qb) * 180) / Math.PI)
    n += 1
  }
  liberarAvatar(av)
  liberarAvatar(quieto)
  const r2 = (x: number) => Math.round(x * 100) / 100
  return {
    clip,
    dur: r2(dur),
    manoMax: r2(Math.max(max.LeftHand ?? 0, max.RightHand ?? 0)),
    manoMedia: r2(Math.max(suma.LeftHand ?? 0, suma.RightHand ?? 0) / Math.max(1, n)),
    cabezaMax: r2(max.Head ?? 0),
    giroCabeza: Math.round(giro),
    pechoMax: r2(max.Spine2 ?? 0),
  }
}

/**
 * Pies que patinan: con el avatar andando a `v` m/s (la raíz avanza sola, como en la tienda), lo que se
 * mueve en horizontal el pie que está apoyado (el más bajo de los dos, cerca del suelo). 0 = no patina.
 */
async function medirPaso(mx: MxId, v: number) {
  await cargarPersonaje(mx, { permitirRed: true })
  const av = crearAvatarTienda(ASPECTO_NEUTRO(mx))
  av.setSpeed(v)
  av.advance(2.5, 1 / 60)
  const dt = 1 / 120
  const prev = { L: new THREE.Vector3(), R: new THREE.Vector3() }
  const cur = new THREE.Vector3()
  let suma = 0
  let n = 0
  let primero = true
  for (let t = 0; t < 2.4; t += dt) {
    av.update(dt)
    av.root.updateMatrixWorld(true)
    const yL = posDe(av, 'LeftToeBase', cur).y
    const yR = posDe(av, 'RightToeBase', cur).y
    const lado = yL < yR ? 'L' : 'R'
    for (const s of ['L', 'R'] as const) {
      posDe(av, s === 'L' ? 'LeftToeBase' : 'RightToeBase', cur)
      if (!primero && s === lado) {
        suma += Math.hypot(cur.x - prev[s].x, cur.z - prev[s].z) / dt
        n += 1
      }
      prev[s].copy(cur)
    }
    primero = false
  }
  liberarAvatar(av)
  return { v, patina: Math.round((suma / Math.max(1, n)) * 100) / 100, zancada: zancada(mx, v) }
}

/**
 * La velocidad a la que va de verdad el paso que se dibuja a `v`: con la raíz fija, lo que retrocede el pie
 * apoyado (m/s). Si sale igual que `v`, el pie no patina.
 */
function zancada(mx: MxId, v: number) {
  const av = crearAvatarTienda(ASPECTO_NEUTRO(mx))
  ;(av as unknown as { opts: { fija: boolean } }).opts.fija = true
  av.setSpeed(v)
  av.advance(2.5, 1 / 60)
  const dt = 1 / 120
  const a = new THREE.Vector3()
  const prevZ = { L: 0, R: 0 }
  let suma = 0
  let n = 0
  for (let t = 0; t < 2.4; t += dt) {
    av.update(dt)
    av.root.updateMatrixWorld(true)
    const p = {
      L: av.root.worldToLocal(posDe(av, 'LeftToeBase', a).clone()),
      R: av.root.worldToLocal(posDe(av, 'RightToeBase', a).clone()),
    }
    const lado = p.L.y < p.R.y ? 'L' : 'R'
    if (t > 0) {
      suma += (prevZ[lado] - p[lado].z) / dt
      n += 1
    }
    prevZ.L = p.L.z
    prevZ.R = p.R.z
  }
  liberarAvatar(av)
  return Math.round((suma / Math.max(1, n)) * 100) / 100
}

export function instalarDepuracion() {
  ;(window as unknown as { __sagaAvataresDev?: unknown }).__sagaAvataresDev = {
    retratos,
    foto,
    medirGesto,
    medirPaso,
    /** Dónde encuentra los ojos de cada personaje (o null). */
    ojos: async (mx: MxId) => {
      await cargarPersonaje(mx, { permitirRed: true })
      const av = crearAvatarTienda(ASPECTO_NEUTRO(mx))
      const o = ojosDe(av)
      liberarAvatar(av)
      return (
        o?.map((x) => ({ pos: x.pos.toArray().map((v) => +v.toFixed(4)), r: +x.r.toFixed(4) })) ??
        null
      )
    },
  }
}

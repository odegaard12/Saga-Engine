import * as THREE from 'three'
import type { AvatarMotor } from './avatar'

/**
 * La cara de cerca (tienda y ficha de jugador): brillo en los ojos y la cabeza que busca la cámara.
 *
 * Los personajes no traen ni morphs ni huesos de párpado u ojo (sólo `Head`): el párpado se fabrica como morph
 * de la piel (ver `ponerParpados`). Los ojos son dos esferas pintadas dentro de la malla del cuerpo, mates como la piel. Aquí se les pone
 * delante una CÓRNEA: un casquete transparente que sólo suma el reflejo (mezcla aditiva sobre negro), de modo que
 * la luz de estudio deja su puntito de brillo en el ojo. Se busca la posición de los ojos en la geometría una vez
 * por personaje (las dos piezas sueltas pequeñas y simétricas de la cabeza) y la córnea va colgada del hueso de la
 * cabeza, que es el que mueve los ojos.
 */

/** `vertices`: los del globo del ojo en la geometría de la piel (para el párpado). */
type Ojo = { pos: THREE.Vector3; r: number; adelante: THREE.Vector3; vertices: number[] }
const OJOS = new Map<string, Ojo[] | null>()
const CORNEA = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }>()

/** Las piezas sueltas (conectadas por triángulos o por vértices en el mismo sitio) de una geometría. */
function piezasSueltas(g: THREE.BufferGeometry): Int32Array {
  const pos = g.attributes.position
  const n = pos.count
  const padre = new Int32Array(n)
  for (let i = 0; i < n; i += 1) padre[i] = i
  const raiz = (i: number): number => {
    while (padre[i] !== i) {
      padre[i] = padre[padre[i]]
      i = padre[i]
    }
    return i
  }
  const unir = (a: number, b: number) => {
    const x = raiz(a)
    const y = raiz(b)
    if (x !== y) padre[x] = y
  }
  const visto = new Map<string, number>()
  for (let i = 0; i < n; i += 1) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`
    const j = visto.get(k)
    if (j === undefined) visto.set(k, i)
    else unir(i, j)
  }
  const idx = g.index
  if (idx)
    for (let t = 0; t + 2 < idx.count; t += 3) {
      unir(idx.getX(t), idx.getX(t + 1))
      unir(idx.getX(t), idx.getX(t + 2))
    }
  for (let i = 0; i < n; i += 1) padre[i] = raiz(i)
  return padre
}

/**
 * Los dos ojos del personaje, en el espacio del hueso de la cabeza (con el avatar en reposo), o null si no se
 * encuentran con seguridad (y entonces no se toca nada).
 */
export function ojosDe(av: AvatarMotor): Ojo[] | null {
  if (OJOS.has(av.id)) return OJOS.get(av.id) ?? null
  let ojos: Ojo[] | null = null
  try {
    ojos = buscarOjos(av)
  } catch {
    ojos = null
  }
  OJOS.set(av.id, ojos)
  return ojos
}

function buscarOjos(av: AvatarMotor): Ojo[] | null {
  const piel = av.parts.find((p) => p.role === 'skin')?.mesh
  const cabeza = av.model.getObjectByName('mixamorigHead')
  if (!piel || !cabeza) return null
  av.root.updateMatrixWorld(true)
  piel.skeleton.update()
  const g = piel.geometry
  const pieza = piezasSueltas(g)
  const grupos = new Map<number, number[]>()
  for (let i = 0; i < pieza.length; i += 1) {
    const l = grupos.get(pieza[i])
    if (l) l.push(i)
    else grupos.set(pieza[i], [i])
  }
  // En el mundo, con el avatar en reposo; al final se pasa al espacio del hueso de la cabeza.
  const centroCabeza = cabeza.getWorldPosition(new THREE.Vector3())
  const candidatos: { c: THREE.Vector3; r: number; frente: THREE.Vector3; indice: number }[] = []
  for (const vertices of grupos.values()) {
    if (vertices.length < 30 || vertices.length > 3000) continue
    const puntos = vertices.map((i) =>
      piel.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(piel.matrixWorld)
    )
    // Un ojo es un casquete de globo de 1 a 2 cm de radio, cerca de la cabeza y por encima de su hueso.
    const e = esfera(puntos)
    if (!e || e.r < 0.01 || e.r > 0.02 || e.error > e.r * 0.08) continue
    if (e.c.y < centroCabeza.y || e.c.distanceTo(centroCabeza) > 0.2) continue
    // Hacia dónde mira: del centro del globo al centro de lo que se ve de él.
    const medio = puntos.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(puntos.length)
    const frente = medio.sub(e.c)
    if (frente.length() < e.r * 0.2) continue
    candidatos.push({ c: e.c, r: e.r, frente: frente.normalize(), indice: vertices[0] })
  }
  // La pareja más parecida (mismo radio, mirando a lo mismo) a 3,5-9 cm una de otra.
  let mejor: [number, number] | null = null
  let error = Infinity
  for (let a = 0; a < candidatos.length; a += 1)
    for (let b = a + 1; b < candidatos.length; b += 1) {
      const A = candidatos[a]
      const B = candidatos[b]
      const sep = A.c.distanceTo(B.c)
      if (sep < 0.035 || sep > 0.09) continue
      const e = Math.abs(A.r - B.r) + (1 - A.frente.dot(B.frente)) * 0.05
      if (e < error) {
        error = e
        mejor = [a, b]
      }
    }
  if (!mejor || error > 0.006) return null
  const inv = new THREE.Matrix4().copy(cabeza.matrixWorld).invert()
  const escala = new THREE.Vector3().setFromMatrixScale(cabeza.matrixWorld).x
  return mejor.map((k) => ({
    pos: candidatos[k].c.clone().applyMatrix4(inv),
    // El radio en unidades del hueso (la cabeza puede llevar la escala del modelo).
    r: candidatos[k].r / escala,
    adelante: candidatos[k].frente.clone().transformDirection(inv).normalize(),
    vertices: grupos.get(pieza[candidatos[k].indice]) ?? [],
  }))
}

/** La esfera que mejor pasa por unos puntos (mínimos cuadrados algebraicos), con su error medio, o null. */
export function esfera(
  puntos: THREE.Vector3[]
): { c: THREE.Vector3; r: number; error: number } | null {
  // x²+y²+z² = 2a·x + 2b·y + 2c·z + d  ->  ecuaciones normales 4x4.
  // Centrados en su media (si no, con coordenadas de 1,6 m y radios de 1,5 cm, la cuenta pierde precisión).
  const m = puntos
    .reduce((s, p) => s.add(p), new THREE.Vector3())
    .divideScalar(Math.max(1, puntos.length))
  const M = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0])
  for (const q of puntos) {
    const p = q.clone().sub(m)
    const f = [2 * p.x, 2 * p.y, 2 * p.z, 1]
    const w = p.x * p.x + p.y * p.y + p.z * p.z
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) M[i][j] += f[i] * f[j]
      M[i][4] += f[i] * w
    }
  }
  for (let i = 0; i < 4; i += 1) {
    let piv = i
    for (let k = i + 1; k < 4; k += 1) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k
    if (Math.abs(M[piv][i]) < 1e-12) return null
    ;[M[i], M[piv]] = [M[piv], M[i]]
    for (let k = 0; k < 4; k += 1) {
      if (k === i) continue
      const f = M[k][i] / M[i][i]
      for (let j = i; j < 5; j += 1) M[k][j] -= f * M[i][j]
    }
  }
  const [a, b, c, d] = M.map((fila, i) => fila[4] / fila[i])
  const r = Math.sqrt(Math.max(0, d + a * a + b * b + c * c))
  const centro = new THREE.Vector3(a, b, c).add(m)
  const error = puntos.reduce((s, p) => s + Math.abs(p.distanceTo(centro) - r), 0) / puntos.length
  return { c: centro, r, error }
}

function cornea(id: string, r: number) {
  let c = CORNEA.get(id)
  if (!c) {
    // Un casquete de 28° alrededor de +y (sólo el centro del ojo); se orienta a «adelante» al colgarlo. Con 50° asomaba por
    // encima de la abertura del ojo y el reflejo dejaba manchas de brillo en el párpado (17/10/2026).
    const geo = new THREE.SphereGeometry(r * 1.02, 20, 6, 0, Math.PI * 2, 0, 0.49)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.06,
      metalness: 0,
      envMapIntensity: 3,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    c = { geo, mat }
    CORNEA.set(id, c)
  }
  return c
}

/** Pone las córneas (brillo de los ojos) a un avatar de la tienda o la ficha. No hace nada si no encuentra los ojos. */
export function ponerCorneas(av: AvatarMotor): boolean {
  const ojos = ojosDe(av)
  const cabeza = av.model.getObjectByName('mixamorigHead')
  if (!ojos || !cabeza) return false
  for (const o of ojos) {
    const { geo, mat } = cornea(av.id, o.r)
    const m = new THREE.Mesh(geo, mat)
    m.name = 'cornea'
    m.position.copy(o.pos)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), o.adelante)
    m.renderOrder = 2
    cabeza.add(m)
  }
  ponerParpados(av)
  return true
}

/**
 * El PÁRPADO (17/10/2026: «no se siente vivo»). Los modelos no traen morphs ni huesos de párpado, así que se le
 * fabrica a la piel uno (lo que sería una shape key de Blender): la piel de encima de cada ojo gira alrededor del
 * eje que une los dos ojos hasta tapar el globo, y la de debajo sube un poco a su encuentro. Es la piel de verdad
 * (con su textura, pestañas y sombra) la que baja. Primero se probó una media esfera lisa pegada delante del ojo:
 * con el ojo cerrado la cara quedaba como de maniquí y daba más miedo.
 *
 * Todo en el espacio de la geometría de la piel (la pose de reposo, antes de los huesos): el morph se aplica antes
 * del esqueleto y se mueve con la cabeza.
 */
const PARPADO = new Map<THREE.BufferGeometry, THREE.BufferGeometry | null>()

function suave(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Delta del párpado para cada vértice de la piel, o null si los ojos no salen claros en la geometría. */
export function deltaDeParpados(g: THREE.BufferGeometry, ojos: number[][]): Float32Array | null {
  const pos = g.attributes.position
  const n = pos.count
  const P = (i: number, v = new THREE.Vector3()) => v.fromBufferAttribute(pos, i)
  const globos = ojos.map((vs) => {
    const puntos = vs.map((i) => P(i))
    const e = esfera(puntos)
    if (!e) return null
    const medio = puntos.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(puntos.length)
    return { c: e.c, r: e.r, frente: medio.sub(e.c).normalize() }
  })
  if (globos.length !== 2 || !globos[0] || !globos[1]) return null
  const [A, B] = globos as { c: THREE.Vector3; r: number; frente: THREE.Vector3 }[]
  // Ejes del ojo: L entre los dos ojos, F adelante, U arriba (hacia el lado contrario del centro del cuerpo).
  const L = B.c.clone().sub(A.c).normalize()
  const F = A.frente.clone().add(B.frente).normalize()
  F.addScaledVector(L, -F.dot(L)).normalize()
  const U = new THREE.Vector3().crossVectors(L, F).normalize()
  const centro = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let i = 0; i < n; i += 1) centro.add(P(i, v))
  centro.divideScalar(n)
  if (U.dot(A.c.clone().sub(centro)) < 0) U.negate()
  const enOjo = new Set(ojos.flat())
  const delta = new Float32Array(n * 3)
  for (const { c, r } of [A, B]) {
    const local = (i: number) => {
      P(i, v).sub(c)
      return { x: v.dot(L), y: v.dot(U), z: v.dot(F) }
    }
    // Los bordes de la abertura (el canto que se ve: piel por fuera del globo; la de dentro de la cuenca está más
    // cerca del centro y con ella el párpado se quedaba corto): el ángulo (desde adelante, + arriba) del vértice de piel más cercano por arriba y
    // por abajo, en la franja central del ojo.
    let arriba = Infinity
    let abajo = -Infinity
    for (let i = 0; i < n; i += 1) {
      if (enOjo.has(i)) continue
      const { x, y, z } = local(i)
      const rho = Math.hypot(y, z)
      if (Math.abs(x) > r * 0.4 || rho < r * 1.0 || rho > r * 1.35 || z < 0) continue
      const t = Math.atan2(y, z)
      if (t > 0 && t < arriba) arriba = t
      if (t < 0 && t > abajo) abajo = t
    }
    if (!Number.isFinite(arriba) || !Number.isFinite(abajo) || arriba - abajo < 0.2) return null
    // Sólo la piel pegada al ojo: con más (hasta 1,2 rad y 1,85 r) bajaba también la ceja y al de barba le
    // quedaba una mancha oscura sobre el ojo cerrado.
    // Se juntan algo por debajo de la mitad, como un párpado de verdad (el de arriba hace casi todo el viaje), y se
    // pasan un poco uno sobre otro: si sólo se tocan, queda una raya del blanco del ojo.
    const juntos = abajo + (arriba - abajo) * 0.3
    for (let i = 0; i < n; i += 1) {
      if (enOjo.has(i)) continue
      const { x, y, z } = local(i)
      const rho = Math.hypot(y, z)
      if (z < -r * 0.3 || rho > r * 1.9 || Math.abs(x) > r * 1.4) continue
      const t = Math.atan2(y, z)
      const enLado = 1 - suave(r * 0.75, r * 1.35, Math.abs(x))
      const enHondo = 1 - suave(r * 1.15, r * 1.5, rho)
      let giro = 0
      if (t >= arriba - 0.05) giro = -(arriba - juntos + 0.06) * (1 - suave(arriba + 0.4, arriba + 0.75, t))
      else if (t <= abajo + 0.05) giro = (juntos - abajo + 0.04) * (1 - suave(-abajo + 0.3, -abajo + 0.9, -t))
      giro *= enLado * enHondo
      if (Math.abs(giro) < 1e-4) continue
      const t2 = t + giro
      // Por fuera del globo (en ese corte mide sqrt(r²-x²)), para que no lo atraviese.
      const corte = Math.sqrt(Math.max(0, r * r - x * x))
      const rho2 = Math.max(rho, corte * 1.06)
      const nuevo = c
        .clone()
        .addScaledVector(L, x)
        .addScaledVector(U, rho2 * Math.sin(t2))
        .addScaledVector(F, rho2 * Math.cos(t2))
      P(i, v)
      delta[i * 3] += nuevo.x - v.x
      delta[i * 3 + 1] += nuevo.y - v.y
      delta[i * 3 + 2] += nuevo.z - v.z
    }
  }
  return delta
}

/** La geometría de la piel con el párpado como morph (comparte todo con la original salvo el morph). */
function conParpado(g: THREE.BufferGeometry, ojos: Ojo[]): THREE.BufferGeometry | null {
  if (PARPADO.has(g)) return PARPADO.get(g) ?? null
  let nueva: THREE.BufferGeometry | null = null
  try {
    const delta = deltaDeParpados(g, ojos.map((o) => o.vertices))
    if (delta) {
      nueva = new THREE.BufferGeometry()
      nueva.setIndex(g.index)
      for (const [k, a] of Object.entries(g.attributes)) nueva.setAttribute(k, a)
      for (const gr of g.groups) nueva.addGroup(gr.start, gr.count, gr.materialIndex)
      nueva.morphAttributes.position = [new THREE.BufferAttribute(delta, 3)]
      nueva.morphTargetsRelative = true
      nueva.boundingBox = g.boundingBox
      nueva.boundingSphere = g.boundingSphere
    }
  } catch {
    nueva = null
  }
  PARPADO.set(g, nueva)
  return nueva
}

/**
 * A quien no le cierra bien (revisado uno a uno en el banco el 17/10/2026): Ch26 se quedaba con el ojo a medio
 * tapar y el blanco a la vista. Mejor sin parpadeo que así. (A Ch23 no se le encuentran los bordes: ya sale sin él.)
 */
const SIN_PARPADO = new Set<string>(['Ch26'])

/** Pone el párpado a la piel de un avatar de la tienda o la ficha. */
export function ponerParpados(av: AvatarMotor): boolean {
  const ojos = ojosDe(av)
  const piel = av.parts.find((p) => p.role === 'skin')?.mesh
  if (!ojos || !piel || SIN_PARPADO.has(av.id)) return false
  if (piel.morphTargetInfluences) return true
  const g = conParpado(piel.geometry, ojos)
  if (!g) return false
  piel.geometry = g
  piel.updateMorphTargets()
  return true
}

/** Cierre del párpado (0 abierto, 1 cerrado) a los `t` segundos de empezar el parpadeo: baja en 70 ms y sube en 110. */
export function cierre(t: number): number {
  if (t < 0 || t > 0.18) return 0
  return t < 0.07 ? t / 0.07 : 1 - (t - 0.07) / 0.11
}

/** Deja los párpados cerrados en `c` (0-1). También para el banco (`retratos(lado, ids, cierre)`). */
export function cerrarParpados(av: AvatarMotor, c: number): void {
  const piel = av.parts.find((p) => p.role === 'skin')?.mesh
  if (!piel?.morphTargetInfluences) return
  piel.morphTargetInfluences[0] = c
  // El brillo de la córnea asomaba por la juntura de los párpados: con el ojo casi cerrado, fuera.
  for (const h of av.model.getObjectByName('mixamorigHead')?.children ?? []) if (h.name === 'cornea') h.visible = c < 0.4
}

/**
 * La cabeza que sigue a la cámara (tienda y ficha): un giro suave del cuello y la cabeza, con tope, que se suma a la
 * animación. Cuando la cámara queda detrás (el personaje gira en la peana), la cabeza vuelve a lo suyo.
 */
const MIRADA = new WeakMap<
  AvatarMotor,
  { yaw: number; pitch: number; reloj: number; parpadeo: number; vistazo: number; dx: number; dy: number }
>()
const LIMITE_YAW = 0.7
const LIMITE_ARRIBA = 0.22
const LIMITE_ABAJO = 0.12
const _q = new THREE.Quaternion()
const _p = new THREE.Quaternion()
const _r = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _eje = new THREE.Vector3()

function girarEnMundo(hueso: THREE.Object3D, eje: THREE.Vector3, angulo: number) {
  if (!hueso.parent || Math.abs(angulo) < 1e-5) return
  // local' = P⁻¹ · R · P · local (R en el espacio del mundo).
  hueso.parent.getWorldQuaternion(_p)
  _r.setFromAxisAngle(eje, angulo)
  _q.copy(_p).invert().multiply(_r).multiply(_p)
  hueso.quaternion.premultiply(_q)
  hueso.updateMatrixWorld(true)
}

/**
 * La pose de la animación de cada hueso, sin la mirada encima.
 *
 * three.js NO reescribe un hueso si la animación le da el mismo valor que el fotograma anterior. Con la gaita la
 * cabeza va en una pose fija (el agarre la sujeta), así que el giro de la mirada se SUMABA en cada fotograma: la
 * cabeza acababa torcida 40-55° y dando vueltas (16/10/2026). Ahora, si el hueso sigue como lo dejó la mirada, se
 * parte de la pose guardada en vez de la ya girada.
 */
const POSE = new WeakMap<THREE.Object3D, { base: THREE.Quaternion; puesta: THREE.Quaternion }>()

function partirDeLaAnimacion(hueso: THREE.Object3D) {
  const p = POSE.get(hueso)
  if (p && hueso.quaternion.equals(p.puesta)) hueso.quaternion.copy(p.base)
  else if (p) p.base.copy(hueso.quaternion)
  else POSE.set(hueso, { base: hueso.quaternion.clone(), puesta: new THREE.Quaternion() })
}

function anotarPuesta(hueso: THREE.Object3D) {
  POSE.get(hueso)?.puesta.copy(hueso.quaternion)
}

export function mirarA(av: AvatarMotor, punto: THREE.Vector3, dt: number): void {
  const cuello = av.model.getObjectByName('mixamorigNeck')
  const cabeza = av.model.getObjectByName('mixamorigHead')
  if (!cuello || !cabeza) return
  partirDeLaAnimacion(cuello)
  partirDeLaAnimacion(cabeza)
  cuello.updateMatrixWorld(true)
  let m = MIRADA.get(av)
  if (!m) {
    m = { yaw: 0, pitch: 0, reloj: 0, parpadeo: 2.5 + Math.random() * 2, vistazo: 1.5, dx: 0, dy: 0 }
    MIRADA.set(av, m)
  }
  // Vivo: parpadea cada 2,5-6 s (a veces dos seguidos) y cambia un poco hacia dónde mira cada 1,5-4 s.
  m.reloj += dt
  if (m.reloj > m.parpadeo + 0.18)
    m.parpadeo = m.reloj + (Math.random() < 0.15 ? 0.25 : 2.5 + Math.random() * 3.5)
  if (m.reloj > m.vistazo) {
    m.vistazo = m.reloj + 1.5 + Math.random() * 2.5
    m.dx = (Math.random() - 0.5) * 0.16
    m.dy = (Math.random() - 0.5) * 0.08
  }
  cerrarParpados(av, cierre(m.reloj - m.parpadeo))
  // Hacia dónde queda el punto visto desde la cabeza, en el marco del cuerpo (+z = adelante).
  const desde = cabeza.getWorldPosition(_v)
  const d = av.root.worldToLocal(punto.clone()).sub(av.root.worldToLocal(desde.clone()))
  const yaw = Math.atan2(d.x, d.z)
  const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
  // Detrás (más de ~110°): no se retuerce, vuelve al frente.
  const quiere = Math.abs(yaw) < 1.9
  const yawObj = quiere ? Math.max(-LIMITE_YAW, Math.min(LIMITE_YAW, yaw + m.dx)) : 0
  const pitchObj = quiere ? Math.max(-LIMITE_ABAJO, Math.min(LIMITE_ARRIBA, pitch + 0.12 + m.dy)) : 0
  const k = 1 - Math.exp(-dt * 4)
  m.yaw += (yawObj - m.yaw) * k
  m.pitch += (pitchObj - m.pitch) * k
  av.root.updateMatrixWorld(true)
  const arriba = _eje.set(0, 1, 0).transformDirection(av.root.matrixWorld)
  girarEnMundo(cuello, arriba, m.yaw * 0.45)
  girarEnMundo(cabeza, arriba, m.yaw * 0.55)
  // Cabeceo alrededor del eje lateral del cuerpo (−x del avatar: positivo = mirar arriba).
  const lado = new THREE.Vector3(-1, 0, 0).transformDirection(av.root.matrixWorld)
  girarEnMundo(cuello, lado, m.pitch * 0.4)
  girarEnMundo(cabeza, lado, m.pitch * 0.6)
  anotarPuesta(cuello)
  anotarPuesta(cabeza)
}

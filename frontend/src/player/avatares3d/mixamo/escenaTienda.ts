import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { aplicarAspecto, crearAvatarTienda, liberarAvatar, OBJETOS_DE_MANO, type AvatarMotor } from './avatar'
import { cargarPersonaje, personajeCargado, recursosDeAvatar } from './cargador'
import type { Aspecto, Complemento, MxId } from './catalogo'
import { ITEMS } from './motor/acc'

/**
 * El escenario 3D de la tienda de ropa: el personaje girando despacio sobre una
 * peana, con luces de estudio. Tiene su PROPIO renderizador (la tienda es una
 * pantalla a parte, no el mapa), que se suelta al cerrarla.
 *
 * Cuesta poco: sin sombras proyectadas (el avatar lleva su sombra de mancha),
 * resolución limitada a 2x y a 30 fotogramas por segundo. Si el móvil pierde el
 * contexto WebGL se avisa (`alPerderContexto`) y la tienda sigue funcionando con
 * los retratos y los botones.
 */

export type OpcionesDeEscena = {
  /** Se puede bajar un modelo que falte (la tienda es una pantalla a propósito, con su indicador). */
  permitirRed: boolean
  alProgreso?: (cargado: number, total: number) => void
  alPerderContexto?: () => void
}

export interface EscenaDeTienda {
  /** Cambia de personaje (y baja su modelo si falta). */
  mostrar(aspecto: Aspecto): Promise<void>
  /** Cambia colores y complementos del personaje que ya se ve. */
  aplicar(aspecto: Aspecto): void
  gesto(clip: string): void
  /** Retratos de los complementos, hechos con el personaje que se ve (uno por llamada). */
  miniaturaDe(item: Complemento): string | null
  destruir(): void
  /** Nombre del personaje que se ve ahora. */
  actual(): MxId | null
}

/** Desde dónde se fotografía cada complemento: [acimut, elevación, (lado fijo del encuadre)]. */
const TH: Record<Complemento, number[]> = {
  gaita: [0.5, 0.15],
  mochila: [Math.PI + 0.6, 0.15],
  mochilaP: [Math.PI + 0.6, 0.15],
  bordon: [0.6, 0.1, 0.55],
  casco: [0.5, 0.1],
  boina: [0.5, 0.25],
  sombrero: [0.5, 0.3],
  paraguas: [0.6, 0.3],
  cesta: [0.5, 0.35],
  zocas: [0.7, 0.3],
}

/**
 * Las piezas de un objeto de mano (horneado en `hold-<Ch>.glb`) sueltas y en su propio marco:
 * la primera pieza de referencia, las demás colocadas respecto a ella.
 */
function piezasDeObjetoDeMano(id: MxId, item: string): THREE.Object3D[] {
  const lista = recursosDeAvatar(id).agarre.items[item] as { node: THREE.Object3D }[] | undefined
  if (!lista?.length) return []
  const inv = lista[0].node.matrixWorld.clone().invert()
  return lista.map((p) => {
    const c = p.node.clone(true)
    new THREE.Matrix4().multiplyMatrices(inv, p.node.matrixWorld).decompose(c.position, c.quaternion, c.scale)
    return c
  })
}

export function crearEscenaDeTienda(
  contenedor: HTMLElement,
  opc: OpcionesDeEscena
): EscenaDeTienda {
  const r = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  r.outputColorSpace = THREE.SRGBColorSpace
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 0.9
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  r.setPixelRatio(dpr)
  // El lienzo ocupa el escenario MENOS la zona de arriba (muesca y barra de iconos): ahí no cabe la cabeza del
  // personaje. `touch-action: none`: el arrastre horizontal gira al personaje y no desplaza la hoja ni la página.
  r.domElement.style.cssText =
    'position:absolute;left:0;right:0;top:var(--tienda-escena-arriba,0px);width:100%;height:calc(100% - var(--tienda-escena-arriba,0px));display:block;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none'
  contenedor.appendChild(r.domElement)
  let perdido = false
  r.domElement.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault()
    perdido = true
    opc.alPerderContexto?.()
  })

  const escena = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(r)
  const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04)
  escena.environment = entorno.texture
  const llave = new THREE.DirectionalLight(0xffe4bd, 2.1)
  llave.position.set(2, 3.2, 3.5)
  const relleno = new THREE.DirectionalLight(0xa9c9ff, 0.9)
  relleno.position.set(-5, 2.5, 2.5)
  const contra = new THREE.DirectionalLight(0xd6ecff, 1.5)
  contra.position.set(-1.5, 3.5, -6)
  escena.add(llave, relleno, contra)
  const peana = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 48),
    new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 1 })
  )
  peana.rotation.x = -Math.PI / 2
  escena.add(peana)
  const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  const objetivo = new THREE.Vector3(0, 0.95, 0)

  function colocarCamara() {
    const ancho = r.domElement.clientWidth || contenedor.clientWidth || 300
    const alto = r.domElement.clientHeight || contenedor.clientHeight || 300
    camara.aspect = ancho / alto
    // Que quepa el cuerpo entero (1,75 m + sombrero: ±1 m del objetivo; el lienzo ya empieza bajo la muesca) y, en pantallas estrechas, los objetos anchos.
    const t = Math.tan((camara.fov * Math.PI) / 360)
    const d = Math.max(1.04 / t, 0.8 / camara.aspect / t)
    const az = 0.5
    const el = 0.08
    camara.position.set(
      objetivo.x + d * Math.sin(az) * Math.cos(el),
      objetivo.y + d * Math.sin(el),
      objetivo.z + d * Math.cos(az) * Math.cos(el)
    )
    camara.lookAt(objetivo)
    camara.updateProjectionMatrix()
    r.setSize(ancho, alto, false)
  }
  colocarCamara()
  const observador = new ResizeObserver(colocarCamara)
  observador.observe(contenedor)

  let av: AvatarMotor | null = null
  let aspectoActual: Aspecto | null = null
  let versionDeMostrar = 0
  const miniaturas = new Map<Complemento, string>()
  let miniaturasDe: MxId | null = null

  async function mostrar(a: Aspecto) {
    const version = (versionDeMostrar += 1)
    aspectoActual = a
    if (av && av.id === a.mx) {
      aplicarAspecto(av, a, true)
      return
    }
    if (!personajeCargado(a.mx))
      await cargarPersonaje(a.mx, { permitirRed: opc.permitirRed, alAvanzar: opc.alProgreso })
    // Si mientras bajaba se pidió otro, éste ya no importa.
    if (version !== versionDeMostrar || perdido) return
    if (av) {
      escena.remove(av.root)
      liberarAvatar(av)
    }
    av = crearAvatarTienda(a)
    escena.add(av.root)
    av.advance(0.6)
    miniaturas.clear()
    miniaturasDe = null
  }

  function aplicar(a: Aspecto) {
    aspectoActual = a
    if (av && av.id === a.mx) aplicarAspecto(av, a, true)
  }

  /** Foto cuadrada de un complemento, con el mismo método que el banco (`renderThumb`). */
  function miniatura(item: Complemento): string | null {
    if (!av || perdido) return null
    if (miniaturasDe !== av.id) {
      miniaturas.clear()
      miniaturasDe = av.id
    }
    const guardada = miniaturas.get(item)
    if (guardada) return guardada
    const sc = new THREE.Scene()
    sc.environment = escena.environment
    const geometrias: THREE.BufferGeometry[] = []
    if (OBJETOS_DE_MANO.has(item)) {
      // Comparten geometría y materiales con los avatares: no se liberan.
      for (const p of piezasDeObjetoDeMano(av.id, item)) sc.add(p)
    } else {
      const D = (ITEMS as unknown as Record<string, { build: (lm: unknown, o: unknown) => any }>)[item]
      const res = D.build(av.lm, { thumb: true })
      if (res.parts) res.parts.forEach((p: { g: THREE.Object3D }) => sc.add(p.g))
      else sc.add(res.g)
      sc.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) geometrias.push(m.geometry)
      })
    }
    const l1 = new THREE.DirectionalLight(0xffffff, 2.2)
    l1.position.set(3, 5, 4)
    sc.add(l1, new THREE.AmbientLight(0xffffff, 0.5))
    const bb = new THREE.Box3().setFromObject(sc)
    const c = bb.getCenter(new THREE.Vector3())
    const sz = bb.getSize(new THREE.Vector3())
    const th = TH[item]
    if (th[2]) {
      c.y = bb.max.y - th[2] / 2
      sz.set(th[2], th[2], th[2])
    }
    const R = Math.max(sz.x, sz.y, sz.z) * 0.62
    const cm = new THREE.PerspectiveCamera(28, 1, 0.05, 50)
    const d = R / Math.tan((14 * Math.PI) / 180)
    cm.position.set(
      c.x + d * Math.sin(th[0]) * Math.cos(th[1]),
      c.y + d * Math.sin(th[1]),
      c.z + d * Math.cos(th[0]) * Math.cos(th[1])
    )
    cm.lookAt(c)
    const N = 160
    r.setPixelRatio(1)
    r.setSize(N, N, false)
    r.setClearColor(0x000000, 0)
    r.render(sc, cm)
    const lienzo = document.createElement('canvas')
    lienzo.width = lienzo.height = N
    lienzo.getContext('2d')?.drawImage(r.domElement, 0, 0, N, N)
    const url = lienzo.toDataURL('image/webp', 0.85)
    r.setPixelRatio(dpr)
    colocarCamara()
    for (const g of geometrias) g.dispose()
    miniaturas.set(item, url)
    return url
  }

  /**
   * Girar al personaje con el dedo. Un arrastre horizontal gira el cuerpo sobre su eje (`angulo`), con
   * inercia al soltar que se va apagando hasta el giro lento de siempre. El giro automático sigue
   * mientras no se toca; mientras se arrastra, manda el dedo. Un toque suelto no mueve nada.
   */
  const RADIANES_POR_PX = 0.011
  const GIRO_AUTOMATICO = 0.35
  let angulo = 0.25
  let velocidad = GIRO_AUTOMATICO
  let arrastrando: { id: number; x: number; t: number } | null = null
  const lienzo = r.domElement
  const alBajar = (ev: PointerEvent) => {
    if (arrastrando || (ev.pointerType === 'mouse' && ev.button !== 0)) return
    arrastrando = { id: ev.pointerId, x: ev.clientX, t: ev.timeStamp }
    velocidad = 0
    try {
      lienzo.setPointerCapture(ev.pointerId)
    } catch {
      // Sin captura: se sigue con los eventos que lleguen.
    }
    lienzo.style.cursor = 'grabbing'
    ev.preventDefault()
  }
  const alMover = (ev: PointerEvent) => {
    if (!arrastrando || ev.pointerId !== arrastrando.id) return
    const dx = ev.clientX - arrastrando.x
    const dt = Math.max(1, ev.timeStamp - arrastrando.t) / 1000
    angulo += dx * RADIANES_POR_PX
    // La velocidad del dedo (suavizada) es la inercia con la que se suelta.
    velocidad = velocidad * 0.6 + ((dx * RADIANES_POR_PX) / dt) * 0.4
    arrastrando = { id: arrastrando.id, x: ev.clientX, t: ev.timeStamp }
    ev.preventDefault()
  }
  const alSoltar = (ev: PointerEvent) => {
    if (!arrastrando || ev.pointerId !== arrastrando.id) return
    // Si el dedo llevaba rato quieto antes de soltar, no hay inercia.
    if (ev.timeStamp - arrastrando.t > 90) velocidad = 0
    velocidad = Math.max(-9, Math.min(9, velocidad))
    arrastrando = null
    lienzo.style.cursor = 'grab'
  }
  lienzo.addEventListener('pointerdown', alBajar)
  lienzo.addEventListener('pointermove', alMover)
  lienzo.addEventListener('pointerup', alSoltar)
  lienzo.addEventListener('pointercancel', alSoltar)

  let ultimo = performance.now()
  let reloj = 0
  let vivo = true
  const bucle = (ahora: number) => {
    if (!vivo) return
    reloj = window.requestAnimationFrame(bucle)
    if (document.visibilityState !== 'visible' || perdido) return
    if (ahora - ultimo < 30) return
    const dt = Math.min(0.05, (ahora - ultimo) / 1000)
    ultimo = ahora
    if (av) {
      if (!arrastrando) {
        // Inercia: la velocidad vuelve sola al giro lento de siempre.
        velocidad = GIRO_AUTOMATICO + (velocidad - GIRO_AUTOMATICO) * Math.exp(-dt * 2.4)
        angulo += velocidad * dt
      }
      av.heading = av.goal = angulo
      av.update(dt)
    }
    r.render(escena, camara)
  }
  reloj = window.requestAnimationFrame(bucle)

  return {
    mostrar,
    aplicar,
    gesto: (clip) => av?.gesture(clip),
    miniaturaDe: miniatura,
    actual: () => (av ? av.id : (aspectoActual?.mx ?? null)),
    destruir() {
      vivo = false
      lienzo.removeEventListener('pointerdown', alBajar)
      lienzo.removeEventListener('pointermove', alMover)
      lienzo.removeEventListener('pointerup', alSoltar)
      lienzo.removeEventListener('pointercancel', alSoltar)
      window.cancelAnimationFrame(reloj)
      observador.disconnect()
      if (av) {
        escena.remove(av.root)
        liberarAvatar(av)
        av = null
      }
      entorno.dispose()
      pmrem.dispose()
      peana.geometry.dispose()
      ;(peana.material as THREE.Material).dispose()
      r.dispose()
      r.forceContextLoss()
      r.domElement.remove()
    },
  }
}


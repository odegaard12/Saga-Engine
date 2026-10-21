import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import {
  aplicarAspecto,
  crearAvatarTienda,
  liberarAvatar,
  OBJETOS_DE_MANO,
  type AvatarMotor,
} from './avatar'
import { mirarA, ponerCorneas } from './cara'
import { cargarPersonaje, personajeCargado, recursosDeAvatar } from './cargador'
import { gestoVigente, type Aspecto, type Complemento, type MxId } from './catalogo'
import { ITEMS, MANO_PROCEDURAL, objetoDeMano } from './motor/acc'

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
  /** La peana bajo los pies (la tienda sí; la ficha del mapa, que es más baja, no: se cortaba por los lados). */
  peana?: boolean
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
  /** De cerca (busto: se ve la cara) o el cuerpo entero. La cámara va de un encuadre a otro sin saltos. */
  enfocar(nivel: number, frente?: number): void
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
  monteira: [0.5, 0.2],
  pano: [2.4, 0.2],
  sueste: [1.0, 0.25],
  gorra: [0.6, 0.2],
  coroza: [Math.PI + 0.6, 0.15],
  faixa: [0.5, 0.2],
  cabaza: [0.5, 0.15],
  mochila_vikinga: [Math.PI + 0.6, 0.15],
  sacho: [0.6, 0.1, 0.55],
  hacha: [0.6, 0.1, 0.55],
  maza: [0.6, 0.2],
  gorro_lana: [0.5, 0.2],
  cinta: [0.5, 0.25],
  mochila_dia: [Math.PI + 0.6, 0.15],
  rinonera: [0.5, 0.25],
  baston: [0.6, 0.1],
  linterna: [0.6, 0.2],
  gafas_sol: [0.6, 0.05],
  gafas_monte: [0.6, 0.05],
  buff: [0.6, 0.1],
}

/**
 * Las piezas de un objeto de mano (horneado en `hold-<Ch>.glb`) sueltas y en su propio marco:
 * la primera pieza de referencia, las demás colocadas respecto a ella.
 */
function piezasDeObjetoDeMano(id: MxId, item: string): THREE.Object3D[] {
  // Sacho, hacha y maza: hechos por código (no están en el GLB de agarres).
  if (item in MANO_PROCEDURAL) return [objetoDeMano(item) as THREE.Object3D]
  const lista = recursosDeAvatar(id).agarre.items[item] as { node: THREE.Object3D }[] | undefined
  if (!lista?.length) return []
  const inv = lista[0].node.matrixWorld.clone().invert()
  return lista.map((p) => {
    const c = p.node.clone(true)
    new THREE.Matrix4()
      .multiplyMatrices(inv, p.node.matrixWorld)
      .decompose(c.position, c.quaternion, c.scale)
    return c
  })
}

/** Las luces de estudio de la tienda (y de las fotos de depuración, para que se vean igual). */
export function lucesDeEstudio(): THREE.Object3D[] {
  const llave = new THREE.DirectionalLight(0xffe4bd, 2.1)
  llave.position.set(2, 3.2, 3.5)
  // 16/10: el relleno azul y frío dejaba la piel pálida (las caras «daban algo de miedo»): neutro y cálido.
  const relleno = new THREE.DirectionalLight(0xdfe6f5, 0.8)
  relleno.position.set(-5, 2.5, 2.5)
  const contra = new THREE.DirectionalLight(0xd6ecff, 1.5)
  contra.position.set(-1.5, 3.5, -6)
  // Relleno suave desde la cámara a la altura de la cara: sin él, las cuencas de los ojos quedaban en sombra
  // (la llave viene de arriba) y la cara se veía apagada.
  const cara = new THREE.DirectionalLight(0xffe3cc, 0.85)
  cara.position.set(1.7, 1.75, 3.4)
  cara.target.position.set(0, 1.55, 0)
  return [llave, relleno, contra, cara, cara.target]
}

export function crearEscenaDeTienda(
  contenedor: HTMLElement,
  opc: OpcionesDeEscena
): EscenaDeTienda {
  const r = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    // Revisión 19/10 de batería: sin 'high-performance' (en móviles con dos GPU despertaba la grande para un muñeco).
  })
  r.outputColorSpace = THREE.SRGBColorSpace
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 1.0
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
  escena.add(...lucesDeEstudio())
  const peana = new THREE.Mesh(
    // 5.58: más pequeña y gris azulado; la crema clara se veía como un foco blanco cortado bajo la hoja.
    new THREE.CircleGeometry(0.8, 48),
    new THREE.MeshStandardMaterial({ color: 0x55607a, roughness: 1 })
  )
  peana.rotation.x = -Math.PI / 2
  if (opc.peana !== false) escena.add(peana)
  const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  const objetivo = new THREE.Vector3(0, 0.95, 0)

  /**
   * 17/10/2026: en el iPhone el escenario mide ~200 px y con el cuerpo entero la cara (la que se está eligiendo en
   * «Personaje») quedaba del tamaño de un botón. Con `cerca` la cámara se acerca al busto; en las demás pestañas
   * vuelve al cuerpo entero (ahí importan la ropa, los zapatos y lo que se lleva en la mano).
   */
  let av: AvatarMotor | null = null
  let cerca = 0
  let quiereCerca = 0
  /** Si no es null, el personaje se queda mirando hacia ahí (no gira solo): lo que se está mirando se ve bien. */
  let quiereFrente: number | null = null
  function encuadrar() {
    // Que quepa el cuerpo entero (1,75 m + sombrero: ±1 m del objetivo; el lienzo ya empieza bajo la muesca) y, en
    // pantallas estrechas, los objetos anchos. De cerca: la cabeza y los hombros (±0,4 m alrededor de la barbilla).
    const t = Math.tan((camara.fov * Math.PI) / 360)
    // Lienzo ESTRECHO (la tienda lado a lado: el personaje en una columna a la izquierda, 20/10): menos holgura a los
    // lados (±0,5 m: el cuerpo y los brazos) para que no salga diminuto; los objetos más anchos los tapa, como mucho,
    // el borde de la hoja.
    const estrecho = camara.aspect < 0.6
    const lejos = Math.max(1.04 / t, (estrecho ? 0.42 : 0.8) / camara.aspect / t)
    const busto = Math.max(0.4 / t, (estrecho ? 0.27 : 0.36) / camara.aspect / t)
    const k = cerca * cerca * (3 - 2 * cerca)
    const d = lejos + (busto - lejos) * k
    const alturaBusto = av ? av.lm.topB - 0.22 : 1.45
    objetivo.set(0, 0.95 + (alturaBusto - 0.95) * k, 0)
    const az = 0.5 - 0.3 * k
    const el = 0.08
    camara.position.set(
      objetivo.x + d * Math.sin(az) * Math.cos(el),
      objetivo.y + d * Math.sin(el),
      objetivo.z + d * Math.cos(az) * Math.cos(el)
    )
    camara.lookAt(objetivo)
    camara.updateProjectionMatrix()
  }
  function colocarCamara() {
    const ancho = r.domElement.clientWidth || contenedor.clientWidth || 300
    const alto = r.domElement.clientHeight || contenedor.clientHeight || 300
    camara.aspect = ancho / alto
    encuadrar()
    r.setSize(ancho, alto, false)
  }
  colocarCamara()
  const observador = new ResizeObserver(colocarCamara)
  observador.observe(contenedor)

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
    av = crearAvatarTienda(a, r.getContextAttributes()?.antialias !== false)
    ponerCorneas(av)
    escena.add(av.root)
    av.advance(0.6)
    miniaturas.clear()
    miniaturasDe = null
  }

  function aplicar(a: Aspecto) {
    aspectoActual = a
    if (av && av.id === a.mx) aplicarAspecto(av, a, true)
  }

  /**
   * Pinta una escena en un lienzo aparte (render target) y la devuelve como imagen. Antes se encogía el lienzo de la
   * tienda a 160×160 para cada foto y se volvía a agrandar: en Safari (iPhone), tras eso el personaje no volvía a
   * verse (17/10/2026, el escenario vacío en Ropa, Conjuntos, Objetos y Gestos). Fuera de pantalla three.js no
   * aplica ni el tono ACES ni el sRGB, así que se hacen aquí al leer los píxeles (las mismas cuentas del shader).
   */
  function fotoAparte(sc: THREE.Scene, cm: THREE.Camera, lado = 160): string {
    // Al doble y reducida (suaviza los bordes): un render target con MSAA se leía vacío en Safari.
    const N = lado * 2
    const rt = new THREE.WebGLRenderTarget(N, N)
    const fondo = r.getClearColor(new THREE.Color())
    const alfa = r.getClearAlpha()
    const px = new Uint8Array(N * N * 4)
    try {
      r.setRenderTarget(rt)
      r.setClearColor(0x000000, 0)
      r.clear()
      r.render(sc, cm)
      r.readRenderTargetPixels(rt, 0, 0, N, N, px)
    } finally {
      r.setRenderTarget(null)
      r.setClearColor(fondo, alfa)
      rt.dispose()
    }
    const lienzo = document.createElement('canvas')
    lienzo.width = lienzo.height = N
    const ctx = lienzo.getContext('2d')
    if (!ctx) return ''
    const img = ctx.createImageData(N, N)
    const k = r.toneMappingExposure / 0.6
    const srgb = (x: number) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
    const ajuste = (v: number) =>
      (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
    for (let y = 0; y < N; y += 1)
      for (let x = 0; x < N; x += 1) {
        const i = ((N - 1 - y) * N + x) * 4 // el render target va de abajo arriba
        const o = (y * N + x) * 4
        const a = px[i + 3] / 255
        if (a <= 0) continue
        const R = (px[i] / 255 / a) * k
        const G = (px[i + 1] / 255 / a) * k
        const B = (px[i + 2] / 255 / a) * k
        // ACES (entrada, curva y salida), como ACESFilmicToneMapping de three.
        const r1 = ajuste(0.59719 * R + 0.35458 * G + 0.04823 * B)
        const g1 = ajuste(0.076 * R + 0.90834 * G + 0.01566 * B)
        const b1 = ajuste(0.0284 * R + 0.13383 * G + 0.83777 * B)
        const c = [
          1.60475 * r1 - 0.53108 * g1 - 0.07367 * b1,
          -0.10208 * r1 + 1.10813 * g1 - 0.00605 * b1,
          -0.00327 * r1 - 0.07276 * g1 + 1.07602 * b1,
        ]
        for (let j = 0; j < 3; j += 1)
          img.data[o + j] = Math.round(srgb(Math.min(1, Math.max(0, c[j]))) * 255)
        img.data[o + 3] = px[i + 3]
      }
    ctx.putImageData(img, 0, 0)
    const final = document.createElement('canvas')
    final.width = final.height = lado
    const fctx = final.getContext('2d')
    if (!fctx) return ''
    fctx.imageSmoothingQuality = 'high'
    fctx.drawImage(lienzo, 0, 0, lado, lado)
    return final.toDataURL('image/webp', 0.85)
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
      const D = (ITEMS as unknown as Record<string, { build: (lm: unknown, o: unknown) => any }>)[
        item
      ]
      const res = D.build(av.lm, { thumb: true })
      if (res.parts) res.parts.forEach((p: { g: THREE.Object3D }) => sc.add(p.g))
      else sc.add(res.g)
      sc.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) geometrias.push(m.geometry)
      })
    }
    // Todo lo del objeto en un grupo (para poder girarlo); las luces van aparte.
    const objeto = new THREE.Group()
    objeto.add(...sc.children)
    sc.add(objeto)
    const bb = new THREE.Box3().setFromObject(objeto)
    const c = bb.getCenter(new THREE.Vector3())
    const sz = bb.getSize(new THREE.Vector3())
    const th = TH[item]
    const cm = new THREE.PerspectiveCamera(28, 1, 0.05, 50)
    const mirar = (d: number) => {
      cm.position.set(
        c.x + d * Math.sin(th[0]) * Math.cos(th[1]),
        c.y + d * Math.sin(th[1]),
        c.z + d * Math.cos(th[0]) * Math.cos(th[1])
      )
      cm.lookAt(c)
      cm.updateMatrixWorld(true)
    }
    const lados = [sz.x, sz.y, sz.z].sort((x, y) => y - x)
    if (lados[0] > lados[1] * 2.5) {
      // 18/10: los objetos largos (bordón, sacho, hacha, maza) salían como un palito pegado al borde de arriba (se
      // encuadraba sólo la punta) y en las tarjetas de conjuntos ni se veían. Ahora se giran para cruzar la foto
      // en diagonal y se encuadran enteros.
      mirar(3)
      const largo =
        sz.x >= sz.y && sz.x >= sz.z
          ? new THREE.Vector3(1, 0, 0)
          : sz.y >= sz.z
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(0, 0, 1)
      const derecha = new THREE.Vector3().setFromMatrixColumn(cm.matrixWorld, 0)
      const arriba = new THREE.Vector3().setFromMatrixColumn(cm.matrixWorld, 1)
      const diagonal = derecha.add(arriba).normalize()
      const giro = new THREE.Quaternion().setFromUnitVectors(largo, diagonal)
      objeto.position.sub(c).applyQuaternion(giro).add(c)
      objeto.quaternion.premultiply(giro)
      objeto.updateMatrixWorld(true)
      const esfera = new THREE.Box3().setFromObject(objeto).getBoundingSphere(new THREE.Sphere())
      c.copy(esfera.center)
      mirar((esfera.radius * 0.8) / Math.tan((14 * Math.PI) / 180))
    } else {
      if (th[2]) {
        c.y = bb.max.y - th[2] / 2
        sz.set(th[2], th[2], th[2])
      }
      mirar((Math.max(sz.x, sz.y, sz.z) * 0.62) / Math.tan((14 * Math.PI) / 180))
    }
    const l1 = new THREE.DirectionalLight(0xffffff, 2.2)
    l1.position.set(3, 5, 4)
    sc.add(l1, new THREE.AmbientLight(0xffffff, 0.5))
    const url = fotoAparte(sc, cm)
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
  /** Hacia dónde mira el cuerpo de cerca: de frente a la cámara del busto (que está a 0,2 rad). */
  const FRENTE_DE_CERCA = 0.2
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
        // Inercia: la velocidad vuelve sola al giro lento de siempre. De cerca no gira solo (la cara se iba de
        // perfil): la inercia se apaga y el personaje vuelve despacio a mirar a la cámara.
        const base = quiereFrente !== null ? 0 : GIRO_AUTOMATICO
        velocidad = base + (velocidad - base) * Math.exp(-dt * 2.4)
        angulo += velocidad * dt
        if (quiereFrente !== null && Math.abs(velocidad) < 0.3) {
          const frente =
            quiereFrente + Math.round((angulo - quiereFrente) / (2 * Math.PI)) * 2 * Math.PI
          angulo += (frente - angulo) * (1 - Math.exp(-dt * 2.2))
        }
      }
      av.heading = av.goal = angulo
      av.update(dt)
      if (cerca !== quiereCerca) {
        const paso = dt / 0.45
        cerca =
          quiereCerca > cerca
            ? Math.min(quiereCerca, cerca + paso)
            : Math.max(quiereCerca, cerca - paso)
        encuadrar()
      }
      mirarA(av, camara.position, dt)
    }
    r.render(escena, camara)
  }
  reloj = window.requestAnimationFrame(bucle)

  return {
    mostrar,
    aplicar,
    gesto: (clip) => {
      const vigente = gestoVigente(clip)
      if (vigente) av?.gesture(vigente)
    },
    miniaturaDe: miniatura,
    actual: () => (av ? av.id : (aspectoActual?.mx ?? null)),
    enfocar: (nivel, frente) => {
      quiereCerca = Math.min(1, Math.max(0, nivel))
      quiereFrente = frente ?? null
      // Sin animación si se pidió así: directo al encuadre.
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        cerca = quiereCerca
        encuadrar()
      }
    },
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

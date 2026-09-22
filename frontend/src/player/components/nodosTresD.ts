import * as THREE from 'three'
import * as maplibregl from 'maplibre-gl'

/**
 * Los nodos como objetos 3D de verdad dentro del mapa.
 *
 * Es una capa personalizada de MapLibre que dibuja con three.js sobre el
 * mismo lienzo WebGL: recibe la matriz de proyección del mapa en cada
 * fotograma, así que los modelos viven en metros sobre el terreno y se
 * inclinan, se tapan y se escalan con el relieve como cualquier otra cosa
 * del mapa. Nada de calcomanías.
 *
 * El diseño acordado: monolito blanco, sobrio; la BASE y la tapa con la
 * forma del tipo de nodo (redonda checkpoint, cuadrada QR, triangular
 * minijuego, hexagonal coleccionable); el COLOR es el estado (verde hecho, azul en juego, rojo
 * pendiente) en una franja de luz vertical, la tapa y un disco en el suelo;
 * el número grande siempre de frente e icono pequeño del tipo debajo. La
 * animación es mínima: la luz respira; el nodo en juego lleva un anillo
 * fino girando y un pulso suave en el suelo.
 *
 * En cuesta: el zócalo se hunde 30 cm en el terreno y es alto, así que en
 * una ladera "muerde" el suelo por el lado de arriba en vez de quedar
 * flotando por el de abajo.
 */

export type TipoDeNodo = 'checkpoint' | 'qr' | 'minijuego' | 'coleccionable'

/**
 * Zoom por debajo del cual NO se pintan los modelos: manda la chincheta
 * plana del mapa.
 *
 * Un modelo que mantiene su tamaño en pantalla mide cientos de metros al
 * desampliar —a zoom 12 harían falta ocho kilómetros de monolito para que
 * siguiera midiendo 118 píxeles—: atraviesa los montes, se amontona con
 * los vecinos y queda fatal. De lejos, chincheta; de cerca, modelo.
 */
export const ZOOM_MINIMO_3D = 16.5

/**
 * Altura máxima del modelo en el mundo, en metros. Por encima de esto deja
 * de crecer y empieza a encogerse en pantalla, hasta que a ZOOM_MINIMO_3D
 * toma el relevo la chincheta.
 */
const ALTURA_MAX_MUNDO = 120
export type EstadoDeNodo = 'hecho' | 'actual' | 'pendiente'

export type NodoTresD = {
  id: string
  lat: number
  lon: number
  numero: number
  tipo: TipoDeNodo
  estado: EstadoDeNodo
}

const COLOR: Record<EstadoDeNodo, number> = { hecho: 0x22c55e, actual: 0x3b82f6, pendiente: 0xef4444 }

function lienzoCrudo(pintar: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  if (g) pintar(g)
  return c
}

function lienzo(pintar: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = lienzoCrudo(pintar)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function texturaNumero(numero: number, hex: string, tipo: TipoDeNodo): THREE.CanvasTexture {
  return lienzo((g) => {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.roundRect(16, 62, 190, 154, 38)
    g.fill()
    g.lineWidth = 14
    g.strokeStyle = hex
    g.stroke()
    g.font = `900 ${numero >= 10 ? 96 : 116}px system-ui, -apple-system, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#0b1220'
    g.fillText(String(numero), 111, 141)
    /**
     * El icono del tipo va DENTRO del cartel, como una chapa en la esquina.
     * Antes era un plano de 1,2 m pegado al cuerpo del monolito: a la
     * distancia a la que se juega no se leía, así que el jugador no sabía
     * si el nodo era un minijuego o algo que recoger.
     */
    g.beginPath()
    g.arc(200, 76, 48, 0, Math.PI * 2)
    g.fillStyle = hex
    g.fill()
    g.drawImage(lienzoIcono(tipo), 160, 36, 80, 80)
  })
}

/** El glifo del tipo: círculo blanco con el dibujo dentro, en 256×256. */
function pintarIcono(g: CanvasRenderingContext2D, tipo: TipoDeNodo): void {
  {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(128, 128, 112, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#0b1220'
    g.strokeStyle = '#0b1220'
    g.lineWidth = 18
    g.lineJoin = 'round'
    g.lineCap = 'round'
    if (tipo === 'checkpoint') {
      g.beginPath()
      g.moveTo(92, 66)
      g.lineTo(92, 196)
      g.stroke()
      g.beginPath()
      g.moveTo(92, 68)
      g.lineTo(178, 68)
      g.lineTo(158, 100)
      g.lineTo(178, 132)
      g.lineTo(92, 132)
      g.closePath()
      g.fill()
    } else if (tipo === 'qr') {
      const q = (x: number, y: number, s: number) => g.fillRect(x, y, s, s)
      q(64, 64, 48)
      q(144, 64, 48)
      q(64, 144, 48)
      g.fillStyle = '#ffffff'
      q(78, 78, 20)
      q(158, 78, 20)
      q(78, 158, 20)
      g.fillStyle = '#0b1220'
      q(148, 148, 16)
      q(176, 176, 16)
      q(148, 176, 12)
      q(176, 148, 12)
    } else if (tipo === 'coleccionable') {
      // Gema: algo que se recoge y se guarda en la mochila.
      g.beginPath()
      g.moveTo(128, 58)
      g.lineTo(198, 112)
      g.lineTo(170, 198)
      g.lineTo(86, 198)
      g.lineTo(58, 112)
      g.closePath()
      g.fill()
      g.strokeStyle = '#ffffff'
      g.lineWidth = 9
      g.beginPath()
      g.moveTo(90, 112)
      g.lineTo(166, 112)
      g.moveTo(128, 58)
      g.lineTo(108, 112)
      g.lineTo(128, 198)
      g.lineTo(148, 112)
      g.closePath()
      g.stroke()
    } else {
      g.beginPath()
      g.roundRect(52, 102, 152, 72, 36)
      g.fill()
      g.fillStyle = '#ffffff'
      g.fillRect(76, 130, 38, 12)
      g.fillRect(89, 117, 12, 38)
      g.beginPath()
      g.arc(158, 130, 8, 0, Math.PI * 2)
      g.fill()
      g.beginPath()
      g.arc(182, 148, 8, 0, Math.PI * 2)
      g.fill()
    }
  }
}

const lienzoIcono = (tipo: TipoDeNodo) => lienzoCrudo((g) => pintarIcono(g, tipo))

/**
 * Invierte el sentido de las caras de una geometría.
 *
 * En Mercator la y crece hacia el sur, así que la matriz que coloca el
 * modelo (x este, y arriba, z sur) tiene determinante negativo y three.js
 * pasa a `frontFace(CW)`. Pero la proyección de MapLibre no espeja nada:
 * en pantalla las caras delanteras siguen siendo CCW y WebGL las
 * descartaba. Medido en el banco: los planos del número y del icono y los
 * anillos del suelo (una sola cara) no se veían nunca, y de los sólidos
 * se pintaba el interior. Invertir el índice lo cuadra sin tocar las
 * normales, así la luz sigue siendo correcta.
 */
function invertirCaras(g: THREE.BufferGeometry): void {
  const idx = g.getIndex()
  if (!idx) return
  const a = idx.array
  for (let i = 0; i + 2 < a.length; i += 3) {
    const t = a[i + 1]
    a[i + 1] = a[i + 2]
    a[i + 2] = t
  }
  idx.needsUpdate = true
}

/** Base y tapa con la forma del tipo: redonda, cuadrada o triangular. */
function formaDelTipo(tipo: TipoDeNodo, radio: number, alto: number): THREE.BufferGeometry {
  if (tipo === 'qr') return new THREE.BoxGeometry(radio * 1.8, alto, radio * 1.8)
  if (tipo === 'minijuego') return new THREE.CylinderGeometry(radio * 1.15, radio * 1.15, alto, 3)
  if (tipo === 'coleccionable') return new THREE.CylinderGeometry(radio * 1.05, radio * 1.05, alto, 6)
  return new THREE.CylinderGeometry(radio, radio, alto, 48)
}

type Pieza = {
  grupo: THREE.Group
  nodo: NodoTresD
  franjas: THREE.Mesh[]
  tapa: THREE.Mesh
  anillo: THREE.Mesh | null
  pulso: THREE.Mesh | null
  carteles: THREE.Mesh[]
  altura: number
  elevacion: number
  elevacionEn: number
}

export type CapaNodosTresD = {
  capa: maplibregl.CustomLayerInterface
  setNodos: (nodos: NodoTresD[]) => void
  setVisible: (visible: boolean) => void
  /** Empieza a pedir fotogramas (~20/s). Se llama cuando el mapa ha pintado. */
  arrancarAnimacion: () => void
  estadisticas: () => {
    piezas: number
    visible: boolean
    anadida: boolean
    animar: boolean
    renders: number
    rendersConPiezas: number
    ultimoError: string
    ultimoClip: { ndc: number[]; pantalla: number[]; mc: number[]; altura: number } | null
    ultimasOpciones: unknown
    diagnosticoPixel: { fbAlEntrar: string; antes: number[]; despues: number[]; en: number[] } | null
  }
  interno: () => { escena: THREE.Scene; piezas: unknown[]; renderer: THREE.WebGLRenderer | null }
}

export function crearCapaNodosTresD(id: string): CapaNodosTresD {
  let mapa: maplibregl.Map | null = null
  let renderer: THREE.WebGLRenderer | null = null
  const escena = new THREE.Scene()
  const camara = new THREE.Camera()
  const piezas: Pieza[] = []
  let pendientes: NodoTresD[] | null = null
  let visible = true
  let anadida = false
  let repintadoProgramado = false
  let animar = false
  let renders = 0
  let rendersConPiezas = 0
  let ultimoError = ''
  /** Diagnóstico: dónde cae el primer nodo en el espacio de recorte (-1..1) y en pantalla. */
  let ultimoClip: { ndc: number[]; pantalla: number[]; mc: number[]; altura: number } | null = null
  /** Diagnóstico: lo último que MapLibre pasó a render(), tal cual. */
  let ultimasOpciones: unknown = null
  /** Diagnóstico: framebuffer enlazado al entrar, y el píxel del nodo antes y después de pintar. */
  let diagnosticoPixel: { fbAlEntrar: string; antes: number[]; despues: number[]; en: number[] } | null = null
  const reloj = new THREE.Clock()

  /** Altura total del modelo con cartel, en metros. */
  const alturaTotal = (p: Pieza) => p.altura + 5.1

  /** Píxeles de pantalla que se quieren por nodo según su estado. */
  const objetivoPx = (p: Pieza) => (p.nodo.estado === 'actual' ? 118 : p.nodo.estado === 'pendiente' ? 76 : 92)

  /**
   * Factor de escala para que el nodo mida `objetivoPx` en pantalla, entre
   * su tamaño real y ALTURA_MAX_MUNDO.
   *
   * Sin tope, al desampliar el factor se dispara —a zoom 12 pasa de 800— y
   * el monolito se vuelve un pilar de kilómetros que cruza los montes.
   * Tampoco sirve `map.project` para un nodo detrás de la cámara: devuelve
   * un disparate, y el tope también lo corta.
   */
  function escalaDePantalla(p: Pieza): number {
    if (!mapa) return 1
    const a = mapa.project([p.nodo.lon, p.nodo.lat])
    const b = mapa.project([p.nodo.lon, p.nodo.lat + 1 / 111320])
    const pxPorMetro = Math.hypot(a.x - b.x, a.y - b.y)
    if (!Number.isFinite(pxPorMetro) || pxPorMetro <= 0) return 1
    const tope = ALTURA_MAX_MUNDO / alturaTotal(p)
    return Math.min(tope, Math.max(1, objetivoPx(p) / (pxPorMetro * alturaTotal(p))))
  }

  const cuerpoMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.05 })
  const zocaloMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, metalness: 0.05 })

  function limpiar() {
    for (const p of piezas) {
      escena.remove(p.grupo)
      p.grupo.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat && mat !== cuerpoMat && mat !== zocaloMat) mat.dispose()
      })
    }
    piezas.length = 0
  }

  function construir(nodo: NodoTresD): Pieza {
    const color = COLOR[nodo.estado]
    const hex = '#' + color.toString(16).padStart(6, '0')
    const g = new THREE.Group()
    g.matrixAutoUpdate = false
    const H = nodo.estado === 'actual' ? 4.6 : 4.0
    const luz = (k: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 })

    // Zócalo hundido: muerde la ladera en vez de flotar.
    const zocalo = new THREE.Mesh(formaDelTipo(nodo.tipo, 1.3, 0.9), zocaloMat)
    zocalo.position.y = 0.15
    g.add(zocalo)
    const disco = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.8, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }))
    disco.rotation.x = -Math.PI / 2
    disco.position.y = 0.62
    g.add(disco)

    // Cuerpo con la forma del tipo, blanco mate.
    const cuerpo = new THREE.Mesh(formaDelTipo(nodo.tipo, 0.85, H), cuerpoMat)
    cuerpo.position.y = 0.6 + H / 2
    g.add(cuerpo)

    // Franja de luz en cuatro caras.
    const franjas: THREE.Mesh[] = []
    for (let i = 0; i < 4; i += 1) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, H - 1.0, 0.03), luz(1.1))
      const a = (i / 4) * Math.PI * 2
      f.position.set(Math.sin(a) * 0.86, 0.6 + H / 2 - 0.1, Math.cos(a) * 0.86)
      f.rotation.y = a
      g.add(f)
      franjas.push(f)
    }
    const tapa = new THREE.Mesh(formaDelTipo(nodo.tipo, 0.9, 0.18), luz(1.4))
    tapa.position.y = 0.6 + H + 0.08
    g.add(tapa)

    // Cartel con el número y, debajo, el icono. Se orientan a la cámara en cada fotograma.
    const carteles: THREE.Mesh[] = []
    const numero = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: texturaNumero(nodo.numero, hex, nodo.tipo), transparent: true, depthWrite: false })
    )
    numero.position.y = 0.6 + H + 3.0
    numero.renderOrder = 10
    // Capa 1: el cartel se pinta en una segunda pasada, por encima del
    // terreno, para no perderlo detrás de una loma. Ver render().
    numero.layers.set(1)
    g.add(numero)
    carteles.push(numero)

    let anillo: THREE.Mesh | null = null
    let pulso: THREE.Mesh | null = null
    if (nodo.estado === 'actual') {
      anillo = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.05, 10, 96), luz(1.2))
      anillo.position.y = 0.6 + H - 0.4
      anillo.rotation.x = Math.PI / 2 + 0.2
      g.add(anillo)
      pulso = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.55, 64), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }))
      pulso.rotation.x = -Math.PI / 2
      pulso.position.y = 0.64
      g.add(pulso)
    }
    g.traverse((o) => {
      const malla = o as THREE.Mesh
      if (!malla.isMesh) return
      invertirCaras(malla.geometry)
      // El recorte por frustum de three.js con la matriz de MapLibre
      // descartaba 71 de 102 mallas que estaban en pantalla. Son cien
      // mallas: se pintan todas y punto.
      malla.frustumCulled = false
    })
    escena.add(g)
    return { grupo: g, nodo, franjas, tapa, anillo, pulso, carteles, altura: H, elevacion: Number.NaN, elevacionEn: 0 }
  }

  function aplicarNodos(nodos: NodoTresD[]) {
    limpiar()
    for (const n of nodos) piezas.push(construir(n))
    mapa?.triggerRepaint()
  }

  const capa: maplibregl.CustomLayerInterface = {
    id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      mapa = m
      anadida = true
      // La animación la arranca el mapa cuando ha pintado (ver
      // `arrancarAnimacion`): el mapa nunca llega a "idle" porque el pulso
      // del trazado cambia el estilo diez veces por segundo.
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      // En Mercator el cielo está en +z (no en +y como en three.js por
      // defecto): las luces se orientan a ese eje o el cuerpo blanco sale gris.
      // Las caras laterales de un cilindro tienen la normal horizontal y
      // reciben mitad cielo, mitad suelo: con el suelo verde oscuro el
      // cuerpo blanco salía gris. Suelo claro y más ambiental.
      const cielo = new THREE.HemisphereLight(0xffffff, 0xc7cfc4, 1.5)
      cielo.position.set(0, 0, 1)
      escena.add(cielo)
      const sol = new THREE.DirectionalLight(0xfff3d6, 1.3)
      sol.position.set(0.35, -0.3, 1)
      escena.add(sol)
      escena.add(new THREE.AmbientLight(0xffffff, 0.7))
      if (pendientes) {
        aplicarNodos(pendientes)
        pendientes = null
      }
    },
    onRemove() {
      limpiar()
      renderer?.dispose()
      renderer = null
      anadida = false
      mapa = null
    },
    render(gl, opciones) {
      renders += 1
      ultimasOpciones = opciones
      const fbAlEntrar = gl.getParameter(gl.FRAMEBUFFER_BINDING) ? 'offscreen' : 'lienzo'
      if (!renderer || !mapa || !visible || piezas.length === 0) return
      /**
       * MapLibre 6 pasa un objeto con la matriz dentro
       * (`defaultProjectionData.mainMatrix`); las versiones viejas pasaban
       * la matriz directamente. Leerla "a la antigua" daba una proyección
       * inválida y los nodos no se dibujaban, sin un solo error.
       */
      const bruto = opciones as unknown as { defaultProjectionData?: { mainMatrix?: ArrayLike<number> } } | ArrayLike<number>
      const matriz =
        (bruto as { defaultProjectionData?: { mainMatrix?: ArrayLike<number> } }).defaultProjectionData?.mainMatrix ??
        (bruto as ArrayLike<number>)
      if (!matriz || typeof (matriz as ArrayLike<number>).length !== 'number' || (matriz as ArrayLike<number>).length < 16) {
        ultimoError = 'matriz de proyección no reconocida'
        return
      }
      const t = reloj.getElapsedTime()
      const rumbo = (mapa.getBearing() * Math.PI) / 180
      const inclinacion = (mapa.getPitch() * Math.PI) / 180
      const conTerreno = Boolean(mapa.getTerrain())
      const ahora = performance.now()
      /**
       * Altura ABSOLUTA en unidades Mercator. Medido proyectando a mano el
       * nodo con la matriz que pasa MapLibre: con la elevación absoluta el
       * punto cae donde `map.project` lo pinta (0.105, 0.733 frente a
       * 0.105, 0.737); relativa al objetivo de la cámara se va fuera de
       * plano. Aquí hubo una vuelta con "relativa" que era un error.
       */
      const elevacionObjetivo = 0

      // De lejos mandan las chinchetas planas del mapa: ver ZOOM_MINIMO_3D.
      const zoomDeMas = mapa.getZoom() >= ZOOM_MINIMO_3D
      /**
       * Con el mapa quieto basta medio segundo; mientras se mueve, cada
       * fotograma. Girando o ampliando, con la cota de hace medio segundo
       * el modelo se queda flotando o hundido hasta que el giro termina.
       */
      const enMovimiento = mapa.isMoving() || mapa.isZooming() || mapa.isRotating()

      for (const p of piezas) {
        // Elevación del terreno bajo el nodo, refrescada cada medio segundo:
        // las teselas de elevación llegan cuando llegan.
        if (conTerreno && (enMovimiento || ahora - p.elevacionEn > 500)) {
          const e = mapa.queryTerrainElevation({ lng: p.nodo.lon, lat: p.nodo.lat })
          if (typeof e === 'number' && Number.isFinite(e)) p.elevacion = e
          p.elevacionEn = ahora
        }
        // Con relieve y sin altura conocida todavía, el modelo se quedaría
        // a cota 0: enterrado bajo el monte. Mejor no pintarlo hasta saberla.
        p.grupo.visible = zoomDeMas && (!conTerreno || Number.isFinite(p.elevacion))
        if (!p.grupo.visible) continue
        const mc = maplibregl.MercatorCoordinate.fromLngLat(
          [p.nodo.lon, p.nodo.lat],
          conTerreno ? p.elevacion - elevacionObjetivo - 0.3 : 0
        )
        const s = mc.meterInMercatorCoordinateUnits()
        /**
         * Tamaño de PANTALLA constante, como un pin. A escala real un
         * monolito de 4,6 m mide 2 px a zoom 17 (medido: 0,49 px por
         * metro): se pintaba bien y no se veía. Se mide cuántos píxeles
         * ocupa un metro junto al nodo y se escala el modelo para que mida
         * `objetivoPx`; nunca por debajo de su tamaño real, así al acercarse
         * mucho crece como cualquier cosa del mundo.
         */
        const k = escalaDePantalla(p)
        p.grupo.matrix
          .makeTranslation(mc.x, mc.y, mc.z)
          .multiply(new THREE.Matrix4().makeScale(s * k, -s * k, s * k))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        /**
         * Con `matrixAutoUpdate` apagado, three.js NO recalcula la matriz
         * de mundo aunque `matrix` cambie: hay que marcarlo. Sin esto los
         * monolitos se quedaban en el origen del espacio Mercator (lat
         * 85° N, lon -180°), invisibles, sin un solo error.
         */
        p.grupo.matrixWorldNeedsUpdate = true

        // Carteles siempre de frente: giran con el rumbo y se tumban con la inclinación.
        for (const c of p.carteles) c.rotation.set(-(Math.PI / 2 - inclinacion), -rumbo, 0, 'YXZ')

        const v = p.nodo.estado === 'pendiente' ? 0.35 : 1
        const respira = (p.nodo.estado === 'actual' ? 1.2 : 0.8) + 0.35 * Math.sin(t * 1.6 * v)
        for (const f of p.franjas) (f.material as THREE.MeshStandardMaterial).emissiveIntensity = respira
        ;(p.tapa.material as THREE.MeshStandardMaterial).emissiveIntensity = respira + 0.2
        if (p.anillo) p.anillo.rotation.z = t * 0.6
        if (p.pulso) {
          const f = (t * 0.45) % 1
          p.pulso.scale.setScalar(1 + f * 1.4)
          ;(p.pulso.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - f)
        }
      }

      camara.projectionMatrix.fromArray(Array.from(matriz as ArrayLike<number>))
      if (piezas.length && piezas[0].grupo.visible) {
        // Proyectar a mano el origen del primer nodo: si no cae en -1..1,
        // la convención de la matriz no es la que se cree.
        const p0 = piezas[0]
        const mc0 = maplibregl.MercatorCoordinate.fromLngLat(
          [p0.nodo.lon, p0.nodo.lat],
          conTerreno ? p0.elevacion - elevacionObjetivo : 0
        )
        const v = new THREE.Vector4(mc0.x, mc0.y, mc0.z, 1).applyMatrix4(camara.projectionMatrix)
        const pt = mapa.project([p0.nodo.lon, p0.nodo.lat])
        ultimoClip = {
          ndc: [v.x / v.w, v.y / v.w, v.z / v.w].map((k) => Math.round(k * 1000) / 1000),
          pantalla: [Math.round(pt.x), Math.round(pt.y)],
          mc: [mc0.x, mc0.y, mc0.z],
          altura: conTerreno ? p0.elevacion - elevacionObjetivo : 0,
        }
      }
      try {
        /**
         * MapLibre deja puestos su viewport, su recorte y su búfer de
         * profundidad (el del terreno). Con la proyección ya medida y
         * correcta, los modelos seguían sin verse: o el recorte los
         * descartaba o la profundidad del terreno los tapaba. Se fija el
         * viewport entero, se quita el recorte y se limpia la profundidad
         * antes de pintar: los nodos van siempre encima del terreno, que
         * es además lo que se quiere para un señalizador.
         */
        renderer.resetState()
        const lienzo = mapa.getCanvas()
        renderer.setViewport(0, 0, lienzo.width, lienzo.height)
        renderer.setScissorTest(false)
        // Píxel del nodo ANTES de pintar (lo que MapLibre dejó) …
        const px = ultimoClip ? [ultimoClip.pantalla[0], ultimoClip.pantalla[1]] : null
        const leer = () => {
          if (!px) return [-1, -1, -1, -1]
          const escala = lienzo.width / Math.max(1, lienzo.clientWidth)
          const x = Math.round(px[0] * escala)
          const y = Math.round(lienzo.height - px[1] * escala)
          const buf = new Uint8Array(4)
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf)
          return Array.from(buf)
        }
        const antes = leer()
        /**
         * Dos pasadas. La primera respeta la profundidad que deja MapLibre:
         * el monte que haya delante tapa el monolito, que es lo que hace
         * que parezca plantado en el terreno y no pegado al cristal. La
         * segunda limpia la profundidad y pinta sólo los carteles (capa 1),
         * así el número nunca se pierde detrás de una loma.
         */
        camara.layers.set(0)
        renderer.render(escena, camara)
        renderer.clearDepth()
        camara.layers.set(1)
        renderer.render(escena, camara)
        camara.layers.set(0)
        // … y DESPUÉS: si no cambia, no se está dibujando en este framebuffer.
        const despues = leer()
        diagnosticoPixel = { fbAlEntrar, antes, despues, en: px || [] }
        rendersConPiezas += 1
      } catch (fallo) {
        ultimoError = String(fallo).slice(0, 200)
      }

      /**
       * La animación necesita fotogramas: se pide el siguiente a ~20 por
       * segundo, sólo con la pestaña visible y sólo cuando el mapa ya ha
       * estado "idle" una vez. Pedir repintados desde el primer fotograma
       * hacía que el mapa nunca llegara a idle, y de idle dependen el
       * aviso de "mapa pintado" y la carga de la red de caminos: sin él,
       * la guía fuera del trazado volvía a salir recta.
       */
      if (animar && !repintadoProgramado && document.visibilityState === 'visible') {
        repintadoProgramado = true
        window.setTimeout(() => {
          repintadoProgramado = false
          mapa?.triggerRepaint()
        }, 50)
      }
    },
  }

  return {
    capa,
    setNodos(nodos) {
      if (!anadida) {
        pendientes = nodos
        return
      }
      aplicarNodos(nodos)
    },
    setVisible(v) {
      visible = v
      mapa?.triggerRepaint()
    },
    arrancarAnimacion() {
      animar = true
      mapa?.triggerRepaint()
    },
    estadisticas: () => ({ piezas: piezas.length, visible, anadida, animar, renders, rendersConPiezas, ultimoError, ultimoClip, ultimasOpciones, diagnosticoPixel }),
    /** Solo depuración: la escena viva, para tocar materiales desde el banco. */
    interno: () => ({ escena, piezas, renderer }),
  }
}

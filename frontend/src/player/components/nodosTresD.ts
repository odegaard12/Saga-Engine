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
 * El diseño: una BOLA del color del estado (verde hecho, azul en juego,
 * rojo pendiente) flotando sobre un mástil fino, con el número en un
 * cartel redondo delante y la chapa del tipo en su esquina; la PEANA en
 * el suelo lleva la forma del tipo (redonda checkpoint, cuadrada QR,
 * triangular minijuego, hexagonal coleccionable) y un aro de color. Óscar
 * lo pidió así: "prefería las bolas". Y tiene una ventaja que el monolito
 * no tenía: una esfera se ve igual desde cualquier lado, así que ni se
 * deforma al girar ni al acercarse mucho. La animación es mínima: la
 * bola flota despacio y su halo respira; el nodo en juego lleva un anillo
 * girando y un pulso en el suelo.
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
export const ZOOM_MINIMO_3D = 0

/**
 * Tope de cordura para la altura del modelo en el mundo, en metros.
 *
 * NO es un tamaño: con 120 m, al zoom al que se juega —16— el nodo medía
 * treinta píxeles y no se veía nada en 3D, sólo las chinchetas planas. Un
 * señalizador que mantiene su tamaño en pantalla mide lo que tenga que
 * medir; esto sólo corta un disparate.
 */
const ALTURA_MAX_MUNDO = 2500

/**
 * De lejos el nodo mengua: a ZOOM_MINIMO_3D ocupa la mitad que de cerca,
 * así diez nodos juntos no tapan el mapa antes de que tomen el relevo las
 * chinchetas.
 */
const menguaPorZoom = (z: number) => Math.min(1, Math.max(0.5, (z - 13.5) / 3))
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
  // 512 px, dibujando a escala 2: el cartel se ve nítido también de
  // cerca, cuando ocupa más de cien píxeles de pantalla.
  c.width = c.height = 512
  const g = c.getContext('2d')
  if (g) {
    g.scale(2, 2)
    pintar(g)
  }
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
    // Cartel redondo, a juego con la bola.
    g.beginPath()
    g.arc(128, 128, 116, 0, Math.PI * 2)
    g.fillStyle = '#ffffff'
    g.fill()
    g.lineWidth = 12
    g.strokeStyle = hex
    g.stroke()
    g.font = `900 ${numero >= 10 ? 104 : 122}px system-ui, -apple-system, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#0b1220'
    g.fillText(String(numero), 122, 140)
    /**
     * El icono del tipo va DENTRO del cartel, como una chapa en la esquina.
     * Antes era un plano de 1,2 m pegado al cuerpo del monolito: a la
     * distancia a la que se juega no se leía, así que el jugador no sabía
     * si el nodo era un minijuego o algo que recoger.
     */
    g.beginPath()
    g.arc(192, 66, 40, 0, Math.PI * 2)
    g.fillStyle = hex
    g.fill()
    g.drawImage(lienzoIcono(tipo), 160, 34, 64, 64)
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
 * Aro de luz difuminado para el suelo, como textura.
 *
 * El aro era geometría: un anillo de 30 cm que a la distancia de juego
 * mide dos píxeles. Una línea de dos píxeles sobre foto aérea se ve
 * serrada por narices, con o sin antialiasing, y al mover el mapa tiembla
 * porque cae entre píxeles distintos en cada fotograma. Un degradado con
 * transparencia no tiene canto que serrar: se ve suave a cualquier tamaño
 * y en cuesta se lee como luz sobre el suelo, no como un plato flotando.
 */
function texturaBrillo(hex: string): THREE.CanvasTexture {
  return lienzo((g) => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 124)
    grad.addColorStop(0, hex + '00')
    grad.addColorStop(0.5, hex + '1f')
    grad.addColorStop(0.74, hex + 'b3')
    grad.addColorStop(0.86, hex + '73')
    grad.addColorStop(1, hex + '00')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
  })
}

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
  /** Altura del centro de la bola sobre el suelo, en metros. */
  altura: number
  /** Fase del vaivén, distinta en cada nodo para que no floten a la vez. */
  fase: number
  /** Factor de escala del fotograma anterior: punto de partida de la medida. */
  escala: number
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

  /**
   * Antialiasing PROPIO, sin depender del lienzo del mapa.
   *
   * MapLibre crea su lienzo sin multimuestreo, y pedírselo rompía las
   * fotos (con relieve decide qué símbolos tapa el terreno leyendo
   * profundidad, y con el lienzo multimuestreado esa lectura falla). Así
   * que la escena 3D se pinta en un objetivo nuestro con 4 muestras por
   * píxel (WebGL2) y luego se vuelca al lienzo del mapa como una textura
   * ya suavizada. El mapa no se entera de nada. Es la "calidad alta sin
   * depender del antialiasing" que pidió Óscar.
   */
  let objetivo: THREE.WebGLRenderTarget | null = null
  const objetivoDe = (ancho: number, alto: number): THREE.WebGLRenderTarget => {
    if (!objetivo || objetivo.width !== ancho || objetivo.height !== alto) {
      objetivo?.dispose()
      objetivo = new THREE.WebGLRenderTarget(ancho, alto, { samples: 4, depthBuffer: true, stencilBuffer: false })
      materialVolcado.map = objetivo.texture
      materialVolcado.needsUpdate = true
    }
    return objetivo
  }
  /**
   * El volcado: un rectángulo a pantalla completa con la textura del
   * objetivo. La resolución del multimuestreo deja el color multiplicado
   * por la cobertura (los bordes se promedian con transparente), así que
   * se mezcla como premultiplicado: UNO y UNO-MENOS-ALFA. Con la mezcla
   * normal los bordes salían con un cerco oscuro.
   */
  const materialVolcado = new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  })
  const escenaVolcado = new THREE.Scene()
  const camaraVolcado = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const rectanguloVolcado = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materialVolcado)
  rectanguloVolcado.frustumCulled = false
  escenaVolcado.add(rectanguloVolcado)
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
  const alturaTotal = (p: Pieza) => p.altura + 2.4

  /** Píxeles de pantalla que se quieren por nodo según su estado. */
  const objetivoPx = (p: Pieza) => (p.nodo.estado === 'actual' ? 118 : p.nodo.estado === 'pendiente' ? 76 : 92)

  /** Altura del nodo "normal" a zoom 17, en metros: la que se veía bien. */
  const ALTURA_A_ZOOM_17 = 70

  /**
   * Factor de escala que depende SÓLO del zoom, igual para todos los nodos.
   *
   * Se probó medir cada nodo con la perspectiva para que ocupara siempre
   * los mismos píxeles, y era peor: al girar el mapa la perspectiva de
   * cada nodo cambia a su aire, así que cada uno cambiaba de tamaño por su
   * cuenta, fotograma a fotograma; Óscar lo vio como parpadeo. Con el
   * zoom como única entrada, todos los nodos miden lo mismo en el mundo,
   * el cercano se ve mayor que el lejano —como todo lo demás del mapa— y
   * nada cambia de tamaño si no cambia el zoom. La altura se dobla por
   * cada nivel de zoom que se aleja, de lejos mengua a la mitad y nunca
   * baja del tamaño real ni pasa del tope.
   */
  function escalaPorZoom(p: Pieza, zoom: number): number {
    const tope = ALTURA_MAX_MUNDO / alturaTotal(p)
    const relativo = objetivoPx(p) / 92
    /**
     * Exponente 0,85 y no 1: con tamaño de pantalla exactamente constante,
     * al acercarse el nodo parecía cada vez más pequeño frente a las
     * casas y los caminos, que sí crecen. Así crece un poco al acercarse
     * y mengua un poco más al alejarse.
     */
    const altura = ALTURA_A_ZOOM_17 * Math.pow(2, (17 - zoom) * 0.85) * menguaPorZoom(zoom) * relativo
    return Math.min(tope, Math.max(1, altura / alturaTotal(p)))
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
    /** Radio de la bola y altura de su centro sobre el suelo, en metros. */
    const R = nodo.estado === 'actual' ? 1.75 : 1.5
    const H = nodo.estado === 'actual' ? 4.4 : 3.9
    const luz = (k: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 })

    // Peana oscura con la forma del tipo: redonda, cuadrada, triangular o hexagonal.
    const peana = new THREE.Mesh(formaDelTipo(nodo.tipo, 1.0, 0.5), zocaloMat)
    peana.position.y = 0.1
    g.add(peana)

    // Aro del color del estado en el suelo.
    const brillo = texturaBrillo(hex)
    const disco = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: brillo, transparent: true, opacity: 0.85, depthWrite: false }))
    disco.rotation.x = -Math.PI / 2
    disco.position.y = 0.3
    g.add(disco)

    // Mástil fino de la peana a la bola.
    const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, H - 0.35, 12), cuerpoMat)
    mastil.position.y = 0.35 + (H - 0.35) / 2
    g.add(mastil)

    // La bola, del color del estado. Una esfera se ve igual desde cualquier
    // lado: ni se deforma al girar ni al acercarse.
    const bola = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 44), luz(0.55))
    bola.position.y = H
    g.add(bola)

    /**
     * Sin halo ni anillo alrededor de la bola. Eran dos superficies finas y
     * transparentes que, vistas desde el móvil, salían como un aro dentado
     * ("el aro de alrededor se ve con píxeles"), y ninguna medida de
     * suavizado las arregla del todo. La bola sola, lisa; el nodo en juego
     * se distingue por el pulso en el suelo y por respirar más.
     */
    const franjas: THREE.Mesh[] = []

    // Cartel redondo con el número y la chapa del tipo, delante de la bola,
    // siempre de frente. Más pequeño que la bola: queda un aro de color
    // alrededor y se lee como una bola con etiqueta.
    const carteles: THREE.Mesh[] = []
    const numero = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 1.55, R * 1.55),
      new THREE.MeshBasicMaterial({ map: texturaNumero(nodo.numero, hex, nodo.tipo), transparent: true, depthWrite: false })
    )
    numero.position.y = H
    numero.renderOrder = 10
    // Capa 1: el cartel se pinta en una segunda pasada, por encima de todo.
    numero.layers.set(1)
    g.add(numero)
    carteles.push(numero)

    const anillo: THREE.Mesh | null = null
    let pulso: THREE.Mesh | null = null
    if (nodo.estado === 'actual') {
      pulso = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: brillo, transparent: true, depthWrite: false }))
      pulso.rotation.x = -Math.PI / 2
      pulso.position.y = 0.34
      g.add(pulso)
    }
    g.traverse((o) => {
      const malla = o as THREE.Mesh
      if (!malla.isMesh) return
      invertirCaras(malla.geometry)
      // El recorte por frustum de three.js con la matriz de MapLibre
      // descartaba mallas que estaban en pantalla. Se pintan todas.
      malla.frustumCulled = false
    })
    escena.add(g)
    return {
      grupo: g,
      nodo,
      franjas,
      tapa: bola,
      anillo,
      pulso,
      carteles,
      altura: H,
      fase: Math.random() * Math.PI * 2,
      escala: 1,
      elevacion: Number.NaN,
      elevacionEn: 0,
    }
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
      objetivo?.dispose()
      objetivo = null
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
      camara.projectionMatrix.fromArray(Array.from(matriz as ArrayLike<number>))
      const zoomActual = mapa.getZoom()

      for (const p of piezas) {
        // Elevación del terreno bajo el nodo, refrescada cada medio segundo:
        // las teselas de elevación llegan cuando llegan.
        /**
         * La cota se toma con el mapa QUIETO, cada medio segundo, y al
         * instante sólo si aún no se conoce. Consultarla en cada fotograma
         * mientras se mueve parecía lo correcto y era el origen de los
         * saltos: al desplazar o ampliar, el terreno cambia de tesela y la
         * consulta devuelve una cota distinta a cada fotograma, así que el
         * nodo subía y bajaba a tirones. Quieto, un ajuste por gesto como
         * mucho; y la bola flota sobre un mástil, medio metro de más o de
         * menos no se nota.
         */
        const sinCota = !Number.isFinite(p.elevacion)
        if (conTerreno && (sinCota || (!enMovimiento && ahora - p.elevacionEn > 500))) {
          const e = mapa.queryTerrainElevation({ lng: p.nodo.lon, lat: p.nodo.lat })
          /**
           * Al instante, sin arrastre. Se probó llegar a la cota nueva en
           * unos fotogramas y al hacer zoom el modelo se veía subir y bajar
           * despacio, "arriba abajo, como loco". La malla del terreno
           * cambia de golpe al cambiar de tesela; el nodo, igual.
           */
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
         * monolito de 4,6 m mide 2 px a zoom 17: se pintaba bien y no se
         * veía. Nunca por debajo de su tamaño real, así al acercarse mucho
         * crece como cualquier cosa del mundo.
         */
        const k = escalaPorZoom(p, zoomActual)
        p.escala = k
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
        // La bola flota: sube y baja despacio, cada nodo con su fase.
        const flota = p.altura + 0.22 * Math.sin(t * 1.1 * v + p.fase)
        p.tapa.position.y = flota
        for (const f of p.franjas) f.position.y = flota
        for (const c of p.carteles) c.position.y = flota
        if (p.anillo) p.anillo.position.y = flota
        if (p.pulso) {
          const f = (t * 0.45) % 1
          p.pulso.scale.setScalar(1 + f * 1.4)
          ;(p.pulso.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - f)
        }
      }

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
        /**
         * Sin oclusión por el terreno, tampoco para el cuerpo. Se probó
         * respetar la profundidad del relieve para que un monte tapara el
         * nodo: de cerca la malla del terreno es basta (teselas z14 vistas
         * a z19), su superficie queda metros por encima o por debajo del
         * suelo real y se comía trozos del modelo; y como eso cambia con el
         * ángulo, al mover la cámara los trozos aparecían y desaparecían.
         * "Se buguean". Un señalizador se ve entero, siempre.
         */
        // Las dos pasadas van al objetivo multimuestreado (ver `objetivoDe`).
        renderer.setRenderTarget(objetivoDe(lienzo.width, lienzo.height))
        renderer.setClearColor(0x000000, 0)
        renderer.clear(true, true, false)
        camara.layers.set(0)
        renderer.render(escena, camara)
        renderer.clearDepth()
        camara.layers.set(1)
        renderer.render(escena, camara)
        camara.layers.set(0)
        // Y el volcado, ya suavizado, al lienzo del mapa.
        renderer.setRenderTarget(null)
        renderer.setViewport(0, 0, lienzo.width, lienzo.height)
        renderer.render(escenaVolcado, camaraVolcado)
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
      /**
       * Treinta fotogramas por segundo, con temporizador. A veinte (50 ms)
       * la bola flotaba a tirones; a la cadencia de la pantalla (rAF) el
       * mapa entero se repintaba sin parar y las fotos parpadeaban. Treinta
       * es fluido a la vista y deja respirar al móvil.
       */
      if (animar && !repintadoProgramado && document.visibilityState === 'visible') {
        repintadoProgramado = true
        window.setTimeout(() => {
          repintadoProgramado = false
          mapa?.triggerRepaint()
        }, 33)
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

import { anotarAndandoPropio, brujulaVigente, escucharBrujula, rumboDelCuerpo } from '../../avatares/rumboPropio'
import * as THREE from 'three'
import * as maplibregl from 'maplibre-gl'
import type { ComplementoDeCapa, ContextoDeFotograma } from '../../components/nodosTresD'
import { ahorroActivo, ahorroEnAutomatico, anotarFpsBajos, avisarCambioDeAhorro } from '../../components/conmutadoresMapa'
import { VigilanteDeFps } from '../../components/ahorroPorFps'
import { congelarPose, crearAvatarMapa, dibujosDe, liberarAvatar, ponerMalla, prepararCuerpoParaElMapa, simplificadorListo, type AvatarMotor } from './avatar'
import { cargarPersonaje, olvidarFallos, personajeCargado, resumenDeCarga, seIntentoCargar } from './cargador'
import { claveDeAspecto, GESTO_AL_TOCARLO, GESTOS_DE_FESTEJO, gestoVigente, type Aspecto } from './catalogo'
import { motivoDeRetrato, type EstadoDelModelo, type MotivoDeRetrato } from './diagnosticoMapa'
import {
  cargarFotosGuardadas,
  geometriaFoto,
  guardarFotosHorneadas,
  hayFotoDe,
  hayFotoGuardada,
  liberarFotos,
  materialDeFoto,
} from './fotoDePersonaje'
import {
  alturaVirtualM,
  anadirMuestra,
  calidadInicial,
  entornoDelMovil,
  type CandidatoLod,
  elegirEnTresD,
  tratoDelCuerpo,
  ESTATURA_REAL_M,
  formaQuePermiteTresD,
  pasoDeMezcla,
  INCLINACION_MINIMA_GRADOS,
  TOPE_DE_AVATARES,
  TopePorTareasLargas,
  ZOOM_MINIMO_AVATARES,
  GobernadorDeCalidad,
  MS_ENTRE_FOTOGRAMAS,
  elegirTocado,
  factorDeEntrada,
  factorDeSalida,
  SALIDA_MS,
  elegirMarcha,
  pasoDeMarcha,
  type MarchaDelCuerpo,
  giroDelMotor,
  estadoDeMarcha,
  orientacionDelCartel,
  type Calidad,
  type MuestraDePosicion,
} from './lodAvatares'

/**
 * Los avatares 3D de los jugadores en el mapa.
 *
 * Es un COMPLEMENTO de la capa three.js de los nodos (`nodosTresD.ts`): comparte
 * con ella el renderizador, la escena, la proyección de MapLibre, el objetivo
 * multimuestreado y el ritmo de fotogramas. Cada avatar cuelga de un grupo que se
 * coloca igual que un nodo (metros sobre el terreno, espejado en y porque en
 * Mercator la y crece hacia el sur) y que crece con el zoom para conservar un
 * tamaño de pantalla razonable.
 *
 * Quién va en 3D y con cuánto detalle lo decide `lodAvatares.ts`. Los demás,
 * y todos cuando el zoom es lejano, el mapa está plano, falta el modelo en el
 * móvil o hay demasiada gente, siguen con su retrato redondo (`retratoDeMapa.ts`): la
 * capa avisa de quién va en 3D (`alCambiar`) para que el mapa deje de pintar su
 * retrato (y deje un hueco invisible tocable).
 */

export type JugadorAvatar = {
  clave: string
  lat: number
  lon: number
  /** Grados (0 = norte, horario) hacia donde camina, o null si no se sabe. */
  rumbo: number | null
  /** 20/11: su posición REAL (sin el apartado del reparto, que cambia con el zoom): de ella salen la velocidad y el andar. */
  real?: { lat: number; lon: number }
  aspecto: Aspecto
  esYo: boolean
  /** Color de su equipo (#rrggbb): el aro del suelo. */
  color: string
  /** 12/11: sin conexión (su última posición conocida): su aro va más tenue, como su retrato. */
  tenue?: boolean
  /** 24/11: su velocidad de VERDAD (m/s, `FuentePosicion.velocidadReal`): el clip anda a su paso aunque su punto se ponga al día. */
  velocidad?: number | null
}

type Entrada = {
  clave: string
  jugador: JugadorAvatar
  claveAspecto: string
  holder: THREE.Group
  /** El aro del equipo, tumbado EN el suelo bajo los pies (no flota a la cintura como lo hacía el símbolo del mapa). */
  aro: THREE.Group | null
  aroColor: string
  avatar: AvatarMotor | null
  muestras: MuestraDePosicion[]
  elevacion: number
  elevacionEn: number
  acumulado: number
  fotograma: number
  vistaEn: number
  /** 20/11: su último rumbo conocido (grados), para el cartel plano y para el cuerpo cuando no llega ninguno vigente. */
  ultimoRumbo: number | null
  /** Andaba en el fotograma anterior (histéresis de la velocidad). */
  andando: boolean
  /** 24/11: el clip que lleva (quieto/andar/correr) y desde cuándo va rápido (`elegirMarcha`). */
  marcha: MarchaDelCuerpo
  /** Se estaba pintando en el fotograma anterior, y desde cuándo (ms): la entrada crece en vez de saltar. */
  estabaVisible: boolean
  apareceEn: number
  /** Cuándo se creó (ms): sólo crece al aparecer quien acaba de llegar, no quien pasa de retrato a 3D. */
  creadaEn: number
  /** Su jugador ya no está: se encoge desde aquí (ms) y se quita. 0 = sigue. */
  saleEn: number
  /** 24/11: cuánto se ve su cuerpo (1) frente a su retrato (0) en el fundido al cambiar de vista (`pasoDeMezcla`). */
  mezcla: number
  /** Dónde está en pantalla (px CSS): los pies y la coronilla. Sirve para saber a quién se toca. */
  pantalla: { x: number; pies: number; cabeza: number } | null
  ultimoGesto: number
  /** Hasta cuándo mira a la cámara porque lo tocaron (ms, `performance.now()`). */
  mirarHasta: number
  /** Milisegundos medios que cuesta animarlo (diagnóstico y presupuesto). */
  costeMs: number
  /** Por qué NO va en 3D en este fotograma (`null` = va en 3D). Sólo para `?depurar-mapa`. */
  motivo: MotivoDeRetrato | null
  /** Desde cuándo no se conoce la cota de su terreno (ms), para el plan B. */
  sinCotaDesde: number
  /** Dónde se pinta (Mercator), para medir desde fuera con `?depurar-mapa` (ver `dibujado`). */
  dibujado: { x: number; y: number } | null
  /** 7/11: su imagen fija (fuera del tope de cuerpos animados), ver fotoDePersonaje.ts; y de qué aspecto es. */
  foto: THREE.Mesh | null
  /** 23/11: la malla que lleva ahora el cuerpo (ver `ponerMalla`). */
  malla: 'completa' | 'baja'
  /** Fotogramas seguidos con la misma colocación (para congelar a quien está quieto, ver `congelarPose`). */
  estable: number
  fotoAspecto: string
  /** Última vez que se pintó su CUERPO animado (ms): pasados 20 s como imagen fija, se suelta el modelo. */
  cuerpoEn: number
  /** 22/11 (r2): los materiales de su cuerpo recién montado que aún se compilan (ver `compilarEnSegundoPlano`). */
  compilando: { pendientes: Set<THREE.Material>; desde: number } | null
}

const _s = new THREE.Matrix4()
const _colocacion = new THREE.Matrix4()
const _r = new THREE.Matrix4().makeRotationX(Math.PI / 2)
const _v = new THREE.Vector4()
/** Sólo para `compilarEnSegundoPlano`: con la capa 0, la de la primera pasada (y sus luces). */
const camaraDeCompilar = new THREE.Camera()
/** Lo que espera como mucho un cuerpo a sus programas; luego se pinta como antes (compilándolos al pintarlo). */
const ESPERA_DE_COMPILAR_MS = 2000

/**
 * El aro del equipo: dos anillos planos (el del color y un canto blanco por dentro) en el plano del suelo del
 * avatar. Se mide en metros del propio avatar (1,75 m de alto), así que crece con él y apoya donde pisa.
 * Opaco y sin escribir profundidad: no tapa nada ni se ve a través de nada.
 */
/**
 * 12/11 (Óscar: «que no quede forzado»): el aro era ancho, opaco y con canto blanco, y competía con los nodos. Ahora es
 * un anillo fino y semitransparente, sin canto (una malla menos por jugador); el tuyo, algo más ancho y casi opaco, y
 * el de quien está sin conexión, más tenue.
 */
const R_ARO_M = { dentro: 0.4, fuera: 0.47, fueraYo: 0.52 }
const OPACIDAD_ARO = { otros: 0.55, yo: 0.9, tenue: 0.22 }
const geometriaAroColor = new THREE.RingGeometry(R_ARO_M.dentro, R_ARO_M.fuera, 40).rotateX(-Math.PI / 2)
const geometriaAroYo = new THREE.RingGeometry(R_ARO_M.dentro, R_ARO_M.fueraYo, 40).rotateX(-Math.PI / 2)

/** El color tal como se ve en pantalla: el objetivo de la escena no convierte a sRGB, así que se escribe tal cual. */
function colorDeAro(hex: string): THREE.Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0x3b82f6
  return new THREE.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, THREE.LinearSRGBColorSpace)
}

function crearAro(hex: string, esYo = false): THREE.Group {
  const g = new THREE.Group()
  g.name = 'aro-equipo'
  const color = new THREE.Mesh(
    esYo ? geometriaAroYo : geometriaAroColor,
    new THREE.MeshBasicMaterial({
      color: colorDeAro(hex),
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
      // 22/11: un anillo plano se ve igual en una pasada: con las dos de three.js (transparente y de doble cara), cada aro
      // marcaba su material como cambiado dos veces por fotograma y three.js volvía a buscar su programa (getProgram).
      forceSinglePass: true,
      opacity: esYo ? OPACIDAD_ARO.yo : OPACIDAD_ARO.otros,
    })
  )
  // Pegado al suelo y por debajo de los pies en el orden de pintado (los pies siempre ganan).
  color.position.y = 0.012
  color.renderOrder = -2
  g.add(color)
  return g
}

export type OpcionesDeAvatares = {
  /** Los jugadores de ahora mismo con su posición deslizada. Se llama en cada fotograma. */
  proveedor: () => readonly JugadorAvatar[]
  /** Cambió la lista de los que van en 3D (el mapa decide qué retrato pintar). */
  alCambiar: (tresD: ReadonlySet<string>) => void
  /** Pide un fotograma al mapa (un modelo acaba de cargarse). */
  pedirFotograma: () => void
  calidad?: Calidad
  /**
   * 7/11: los que el mapa ha recogido en el abanico (no caben sin tapar un nodo u otro jugador). Siguen contando como
   * personaje (no vuelven a retrato) pero no se pintan: los enseña el abanico. Tú nunca.
   */
  ocultos?: () => ReadonlySet<string>
  /** 24/11: la vista que eligió el jugador (true = 3D). Si la da, manda ella y no la inclinación (`formaQuePermiteTresD`). */
  vista3D?: () => boolean
  /** 24/11: cambió la mezcla cuerpo/retrato de alguien (fundido de `FUNDIDO_VISTA_MS`): el mapa ajusta sus retratos (`mezcla`). */
  alMezclar?: () => void
}

export interface ComplementoDeAvatares extends ComplementoDeCapa {
  /** Los que se están pintando ahora en 3D. */
  enTresD(): ReadonlySet<string>
  /** 24/11: cuánto se ve su cuerpo (0-1) en el fundido con su retrato; el retrato se pinta con `1 - mezcla`. */
  mezcla(clave: string): number
  /** Un gesto del clip `ge__*` (parte alta del cuerpo; se puede andar mientras). */
  gesto(clave: string, clip: string): boolean
  /**
   * Festejar un nodo completado: un gesto alegre, rotando; o `clip` (el saludo al llegar). No con «reducir
   * movimiento»: es adorno, no lo ha pedido el jugador.
   */
  festejar(clave: string, clip?: string): boolean
  /** 24/10: tocas a otro jugador y su muñeco se gira hacia ti (la cámara) y hace un gesto alegre. */
  reaccionarAlToque(clave: string): boolean
  /**
   * A quién se toca en este punto de pantalla (px CSS), o `null`. Por proyección, no por `queryRenderedFeatures`
   * (que no vale en algunos móviles con relieve) ni por el hueco del símbolo (que MapLibre alza 3 m: con el cuerpo
   * más pequeño, tocar el cuerpo no daba en él).
   */
  tocado(x: number, y: number): string | null
  /** Encima de su cabeza en pantalla (px CSS) si va en 3D y se ve; si no, null (5.59: los bocadillos). */
  cabeza(clave: string): { x: number; y: number } | null
  /** Dónde se pinta su cuerpo (lat/lon), o null si no se pinta. Sólo para medir (`?depurar-mapa`). */
  dibujado(clave: string): { lat: number; lon: number } | null
  /** Vuelve a intentar los modelos que fallaron (volvió la red, terminó de bajarse la caché). */
  reintentarCarga(): void
  calidad(): Calidad
  fijarCalidad(c: Calidad): void
  estadisticas(): Record<string, unknown>
  /** Para `?depurar-mapa`: la calidad, el tope, los fps y el motivo de cada jugador que NO va en 3D. */
  diagnostico(): {
    calidad: Calidad
    tope: number
    fps: number
    motivos: ReadonlyMap<string, MotivoDeRetrato | null>
    tresD: ReadonlySet<string>
  }
  /** Los personajes de los jugadores a la vista cuyo modelo aún no está en memoria (para el botón del panel de depuración). */
  modelosQueFaltan(): Aspecto['mx'][]
  /** Los que ya se intentaron leer de la caché del móvil y NO están (ni se están cargando): lo que enseña el aviso del mapa. */
  modelosPerdidos(): Aspecto['mx'][]
  /** Tras bajar modelos desde el panel: prepara los cuerpos, olvida los fallos y pide un fotograma. */
  alTerminarDeBajarModelos(): Promise<void>
  /** Suelta materiales, esqueletos y aros de todos (al quitar la capa: revisión 19/10 de batería, era una fuga). */
  liberar(): void
}

/** Lo que mira a la cámara quien tocas: lo que dura su gesto (unos 2 s); luego vuelve a su rumbo y el mapa se queda quieto. */
const MIRAR_AL_TOQUE_MS = 2200
/** 24/11: lo más que avanza el fundido cuerpo/retrato en un fotograma (ver `pasoDeMezcla`): ~6 fotogramas como poco. */
const MS_MAX_POR_FOTOGRAMA_DE_FUNDIDO = 40

export function crearComplementoDeAvatares(opciones: OpcionesDeAvatares): ComplementoDeAvatares {
  const grupo = new THREE.Group()
  grupo.name = 'avatares'
  const entradas = new Map<string, Entrada>()
  let enTresD: Set<string> = new Set()
  /** 23/11: quiénes van con cuerpo completo (los demás son 3D baratos: ver `tratoDelCuerpo`). */
  let completos: Set<string> = new Set()
  // 05/11: en modo ahorro de batería, calidad baja (20 fotogramas/s andando en vez de 30) y sin que el medidor la suba.
  const enAhorro = typeof window !== 'undefined' && ahorroActivo(window.localStorage)
  let calidad: Calidad = opciones.calidad ?? (enAhorro ? 'baja' : calidadInicial(entornoDelMovil()))
  const gobernador = new GobernadorDeCalidad(calidad)
  const vigilanteDeFps = new VigilanteDeFps()
  // 22/11: menos cuerpos animados mientras el hilo principal vaya ahogado (ver `TopePorTareasLargas`).
  const topePorLargas = new TopePorTareasLargas()
  let observadorDeLargas: PerformanceObserver | null = null
  try {
    observadorDeLargas = new PerformanceObserver((l) => {
      for (const t of l.getEntries()) topePorLargas.anotar(t.duration)
    })
    observadorDeLargas.observe({ type: 'longtask' })
  } catch {
    observadorDeLargas = null
  }
  // Las imágenes fijas de otra apertura: con ellas no hace falta montar a nadie para su foto.
  void cargarFotosGuardadas()
  let hayAlgunoVisible = false
  /** Se horneó una imagen fija en este fotograma: la capa tiene que pintar (y dejar el contexto como lo espera MapLibre). */
  let hornoEnEsteFotograma = false
  let hayMovimiento = false
  let construcciones = 0
  let ultimaConstruccion = 0
  let ultimoCosteMs = 0
  let fotogramas = 0
  let indiceFestejo = 0
  /** Lo que se le pidió esperar al mapa antes de este fotograma (el medidor mide el exceso sobre esto). */
  let esperaPedida = 0
  /** Desde cuándo nadie anda ni hace un gesto (revisión 19/10 de batería: ver `esperaHastaElSiguiente`). */
  let quietoDesde = 0
  const intentando = new Set<string>()
  /** Último error de carga por personaje y desde cuándo se está cargando (diagnóstico). */
  const ultimoError = new Map<string, string>()
  const cargandoDesde = new Map<string, number>()
  /** FPS suavizados (diagnóstico). */
  let fpsMedios = 0
  const reducido = (() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return false
    }
  })()

  /**
   * Los modelos se leen de UNO en UNO y con una pausa entre dos: leer un GLB (descomprimir, decodificar sus
   * texturas, simplificar el cuerpo) es lo más caro que hace el mapa, y con diez personajes a la vez el móvil
   * se quedaba sin fotogramas varios segundos.
   */
  let colaDeCarga: Promise<unknown> = Promise.resolve()
  const pausa = (ms: number) => new Promise<void>((ok) => window.setTimeout(ok, ms))
  function encolarCarga(mx: Aspecto['mx']): Promise<void> {
    const trabajo = colaDeCarga.then(async () => {
      // El simplificador (WebAssembly) tiene que estar listo antes de crear el primer cuerpo; si falla, se pinta entero.
      await Promise.all([cargarPersonaje(mx), simplificadorListo.catch(() => undefined)])
      for (let resto = 1, hechas = 0; resto > 0; hechas += 1) {
        await pausa(40)
        resto = prepararCuerpoParaElMapa(mx, hechas)
      }
    })
    colaDeCarga = trabajo.catch(() => undefined).then(() => pausa(80))
    return trabajo
  }

  /** El modelo de este personaje: en memoria, o se pide a la caché del móvil (nunca a la red). */
  function disponible(mx: Aspecto['mx']): boolean {
    if (personajeCargado(mx)) return true
    if (!intentando.has(mx) && !seIntentoCargar(mx)) {
      intentando.add(mx)
      cargandoDesde.set(mx, performance.now())
      ultimoError.delete(mx)
      encolarCarga(mx)
        .catch((e) => {
          // Sin el modelo en el móvil el jugador se queda con su retrato; el motivo queda en la consola.
          ultimoError.set(mx, e instanceof Error ? e.message : String(e))
          console.warn('avatares:', e instanceof Error ? e.message : e)
        })
        .finally(() => {
          intentando.delete(mx)
          cargandoDesde.delete(mx)
          // Ya está (o ya no hay remedio): que el siguiente fotograma lo recoja.
          opciones.pedirFotograma()
        })
    }
    return false
  }
  let pendienteConstruir = false

  function crearEntrada(j: JugadorAvatar): Entrada {
    const holder = new THREE.Group()
    holder.matrixAutoUpdate = false
    holder.visible = false
    grupo.add(holder)
    return {
      clave: j.clave,
      jugador: j,
      claveAspecto: '',
      holder,
      aro: null,
      aroColor: '',
      avatar: null,
      muestras: [],
      elevacion: Number.NaN,
      elevacionEn: 0,
      acumulado: 0,
      fotograma: 0,
      vistaEn: 0,
      ultimoRumbo: null,
      andando: false,
      marcha: { marcha: 'quieto', rapidaDesde: Number.NaN },
      estabaVisible: false,
      apareceEn: 0,
      creadaEn: performance.now(),
      saleEn: 0,
      mezcla: 0,
      pantalla: null,
      ultimoGesto: 0,
      dibujado: null,
      mirarHasta: 0,
      costeMs: 0,
      motivo: null,
      sinCotaDesde: 0,
      foto: null,
      malla: 'completa',
      estable: 0,
      fotoAspecto: '',
      cuerpoEn: 0,
      compilando: null,
    }
  }

  /**
   * 22/11 (r2): los programas de un cuerpo recién montado, pedidos al momento y compilados en segundo plano
   * (KHR_parallel_shader_compile): antes se compilaban al pintarlo por primera vez, con el mapa parado ese fotograma.
   * Igual que los pinta la capa: a su objetivo (sin pasar a sRGB, como decide `getParameters` de three.js) y con las
   * luces de su escena. Hasta que estén, se sigue viendo lo que había (su imagen fija o su retrato). Sin la extensión no
   * se sabe cuándo terminan: como antes.
   */
  function compilarEnSegundoPlano(renderer: THREE.WebGLRenderer, raiz: THREE.Object3D): Entrada['compilando'] {
    const escena = grupo.parent
    if (!(escena instanceof THREE.Scene) || !renderer.extensions.has('KHR_parallel_shader_compile')) return null
    const salida = renderer.outputColorSpace
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    try {
      return { pendientes: renderer.compile(raiz, camaraDeCompilar, escena), desde: performance.now() }
    } catch {
      return null
    } finally {
      renderer.outputColorSpace = salida
    }
  }

  /** ¿Ya tiene su cuerpo todos sus programas (o se cansó de esperar)? */
  function cuerpoCompilado(e: Entrada, renderer: THREE.WebGLRenderer, ahora: number): boolean {
    const c = e.compilando
    if (!c) return true
    for (const m of c.pendientes) {
      const programa = (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram
      if (!programa || programa.isReady()) c.pendientes.delete(m)
    }
    if (c.pendientes.size === 0 || ahora - c.desde > ESPERA_DE_COMPILAR_MS) e.compilando = null
    return e.compilando === null
  }

  /**
   * Su imagen fija lista para pintar (la hornea si hace falta y `puedeHornear`: como mucho una por fotograma).
   * Devuelve false si aún no está.
   */
  function prepararFoto(e: Entrada, renderer: THREE.WebGLRenderer, puedeHornear: boolean): boolean {
    const clave = claveDeAspecto(e.jugador.aspecto)
    if (e.foto && e.fotoAspecto === clave && hayFotoDe(renderer, e.jugador.aspecto)) return true
    if (!hayFotoDe(renderer, e.jugador.aspecto) && !hayFotoGuardada(e.jugador.aspecto) && !puedeHornear) return false
    const material = materialDeFoto(renderer, e.jugador.aspecto)
    if (!e.foto) {
      e.foto = new THREE.Mesh(geometriaFoto, material)
      e.foto.name = 'foto-personaje'
      e.foto.visible = false
      e.holder.add(e.foto)
    } else e.foto.material = material
    e.fotoAspecto = clave
    if (!e.aro) {
      e.aro = crearAro(e.jugador.color, e.jugador.esYo)
      e.aroColor = e.jugador.color
      e.holder.add(e.aro)
    }
    return true
  }

  function quitarModelo(e: Entrada) {
    if (!e.avatar) return
    liberarAvatar(e.avatar)
    e.avatar = null
    e.claveAspecto = ''
  }

  function descartar(e: Entrada) {
    quitarModelo(e)
    e.foto?.removeFromParent()
    e.foto = null
    if (e.aro) {
      ;((e.aro.children[0] as THREE.Mesh).material as THREE.Material).dispose()
      e.aro.removeFromParent()
      e.aro = null
    }
    grupo.remove(e.holder)
    entradas.delete(e.clave)
  }

  function construir(e: Entrada) {
    quitarModelo(e)
    const av = crearAvatarMapa(e.jugador.aspecto)
    // 25/10: tú también en la primera pasada, con profundidad. En la segunda (encima de todo) se te veía de pie
    // sobre el cubo o el poste de un nodo que tenías DELANTE (Oscar: «personajes encima de nodo... mal»).
    e.holder.add(av.root)
    if (!e.aro) {
      e.aro = crearAro(e.jugador.color, e.jugador.esYo)
      e.aroColor = e.jugador.color
      e.holder.add(e.aro)
    }
    e.avatar = av
    e.malla = 'completa'
    e.estable = 0
    e.claveAspecto = claveDeAspecto(e.jugador.aspecto)
    construcciones += 1
    ultimaConstruccion = performance.now()
  }

  /** No se pinta este fotograma. */
  function ocultar(e: Entrada) {
    e.holder.visible = false
    // 22/11 (r2): oculto, three.js no tiene por qué rehacer las matrices de su esqueleto (lo hace aunque no se pinte).
    e.holder.matrixWorldAutoUpdate = false
    e.estable = 0
    e.estabaVisible = false
    if (e.mezcla !== 0) {
      e.mezcla = 0
      mezclaCambio = true
    }
  }

  let ultimoCtx: ContextoDeFotograma | null = null
  /** 24/11: alguna mezcla cuerpo/retrato cambió en este fotograma (se avisa al mapa con `alMezclar`). */
  let mezclaCambio = false
  function alRenderizar(ctx: ContextoDeFotograma) {
    ultimoCtx = ctx
    mezclaCambio = false
    const t0 = performance.now()
    fotogramas += 1
    // Leer una imagen fija toca el contexto como hornearla: la capa pinta y lo deja como lo espera MapLibre.
    hornoEnEsteFotograma = guardarFotosHorneadas(ctx.renderer, t0)
    const lista = opciones.proveedor()

    // --- altas y bajas ---
    const vivos = new Set<string>()
    for (const j of lista) {
      vivos.add(j.clave)
      let e = entradas.get(j.clave)
      if (!e) {
        e = crearEntrada(j)
        entradas.set(j.clave, e)
      }
      e.jugador = j
      e.saleEn = 0
    }
    // Quien deja de estar: si se veía en 3D se encoge (~0,2 s) y luego se quita; si no, se quita ya.
    for (const e of [...entradas.values()]) {
      if (vivos.has(e.clave)) continue
      if (e.saleEn === 0 && e.avatar && e.holder.visible && !reducido) e.saleEn = ctx.ahora
      if (e.saleEn === 0 || ctx.ahora - e.saleEn >= SALIDA_MS) descartar(e)
    }

    // --- quién va en 3D ---
    const permitido = formaQuePermiteTresD(ctx.zoom, (ctx.inclinacion * 180) / Math.PI, opciones.vista3D?.())
    const centro = ctx.mapa.getCenter()
    // Dónde cae cada uno en pantalla: lo que se sale del mapa no ocupa plaza, y quien caería
    // encima de otro cuerpo se queda en retrato (ver `elegirEnTresD`).
    const lienzo = ctx.mapa.getCanvas()
    const ancho = lienzo.clientWidth
    const alto = lienzo.clientHeight
    // 11/11: los del abanico no se pintan: que no gasten plaza de cuerpo animado (van los últimos del orden). Siguen
    // contando como personaje para el mapa, que los sigue midiendo en el reparto.
    const ocultos = opciones.ocultos?.() ?? new Set<string>()
    const cands: CandidatoLod[] = []
    const dentro = new Set<string>()
    const incl = (ctx.inclinacion * 180) / Math.PI
    if (permitido) {
      for (const j of lista) {
        const e = entradas.get(j.clave)
        /**
         * 22/11: en pantalla con la matriz de la capa y la cota ya guardada (0 si aún no se sabe), no con `map.project`:
         * con relieve, cada `project` consulta la cota del terreno (~3 % del hilo principal con 15 jugadores, CPU ×4).
         */
        const sitio = maplibregl.MercatorCoordinate.fromLngLat(
          [j.lon, j.lat],
          ctx.conTerreno && e && Number.isFinite(e.elevacion) ? e.elevacion : 0
        )
        _v.set(sitio.x - ctx.origen.x, sitio.y - ctx.origen.y, sitio.z, 1).applyMatrix4(ctx.proyeccion)
        const p =
          _v.w > 0
            ? { x: (0.5 + _v.x / _v.w / 2) * ancho, y: (0.5 - _v.y / _v.w / 2) * alto }
            : { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }
        if (!j.esYo && (p.x < -0.1 * ancho || p.x > 1.1 * ancho || p.y < -0.1 * alto || p.y > 1.2 * alto)) continue
        dentro.add(j.clave)
        // La cota del terreno ya aquí: quien no la tiene no puede pintarse y NO debe gastar una plaza del tope
        // (antes se quedaba su retrato, sin cuerpo, y además ocupaba hueco). Pasado un segundo sin cota (el relieve
        // de ese punto no está cargado) se usa la del centro del mapa, y se corrige sola cuando llegue la buena.
        let cota = true
        if (e && ctx.conTerreno && !Number.isFinite(e.elevacion)) {
          const el = ctx.mapa.queryTerrainElevation({ lng: j.lon, lat: j.lat })
          if (typeof el === 'number' && Number.isFinite(el)) {
            e.elevacion = el
            e.elevacionEn = ctx.ahora
            e.sinCotaDesde = 0
          } else {
            if (e.sinCotaDesde === 0) e.sinCotaDesde = ctx.ahora
            const repuesto = ctx.mapa.queryTerrainElevation(centro)
            if (ctx.ahora - e.sinCotaDesde > 1000 && !j.esYo) {
              e.elevacion = typeof repuesto === 'number' && Number.isFinite(repuesto) ? repuesto : 0
              e.elevacionEn = ctx.ahora
            } else cota = false
          }
        }
        cands.push({
          clave: j.clave,
          esYo: j.esYo,
          // Distancia en PANTALLA al centro del mapa (a quien se mira): la misma para todos.
          distancia: !j.esYo && ocultos.has(j.clave) ? Infinity : Math.hypot(p.x - ancho / 2, p.y - alto / 2),
          disponible: cota && disponible(j.aspecto.mx),
          // 23/11: la histéresis ahora es la de cuerpo COMPLETO (todos van en 3D): que no parpadeen al cruzarse dos distancias.
          yaEnTresD: completos.has(j.clave),
          seMueve: e?.andando === true,
        })
      }
    }
    // 20/11: el ahorro de batería baja los fotogramas, NO cuántos cuerpos (con el tope de 3 de 'baja' el 4.º compañero pasaba a
    // cartel que mira siempre a la cámara y giraba con la vista): el tope en ahorro es el de 'media'.
    const calidadDelTope = enAhorro && calidad === 'baja' ? 'media' : calidad
    const sel = elegirEnTresD(cands, calidadDelTope, topePorLargas.tope(TOPE_DE_AVATARES[calidadDelTope], ctx.ahora))
    const porTope = new Set(sel.porTope)
    const baratos = new Set(sel.baratos)
    completos = new Set(sel.tresD.filter((c) => !baratos.has(c)))
    // --- diagnóstico: por qué cada uno va o no en 3D (sólo se lee con `?depurar-mapa`) ---
    for (const j of lista) {
      const e = entradas.get(j.clave)
      if (!e) continue
      const mx = j.aspecto.mx
      const modelo: EstadoDelModelo = personajeCargado(mx)
        ? 'listo'
        : intentando.has(mx)
          ? 'cargando'
          : seIntentoCargar(mx)
            ? (ultimoError.get(mx) ?? '').includes('no está en el móvil')
              ? 'no_esta'
              : 'fallo'
            : 'pendiente'
      e.motivo = motivoDeRetrato({
        tienePosicion: true,
        presencia: 'live',
        agrupado: false,
        zoomAlto: ctx.zoom >= ZOOM_MINIMO_AVATARES,
        inclinado: incl >= INCLINACION_MINIMA_GRADOS,
        dentroDePantalla: dentro.has(j.clave),
        modelo,
        elegido: !porTope.has(j.clave),
        cotaConocida: !ctx.conTerreno || Number.isFinite(e.elevacion),
      })
    }
    const rango = new Map(sel.tresD.map((c, i) => [c, i]))

    // --- construir lo que falte (uno por fotograma, sin atropellar un gesto del mapa) ---
    let construido = false
    pendienteConstruir = false
    for (const clave of sel.tresD) {
      const e = entradas.get(clave) as Entrada
      const hayQueRehacer = !e.avatar || e.claveAspecto !== claveDeAspecto(e.jugador.aspecto)
      if (!hayQueRehacer) continue
      if (construido || (!e.jugador.esYo && e.avatar && ctx.ahora - ultimaConstruccion < 250)) {
        pendienteConstruir = true
        continue
      }
      // Quien ya se ve con su cuerpo (lo rehace un cambio de aspecto) no espera: un retrato en medio sería un parpadeo.
      const yaConCuerpo = enTresD.has(e.clave) && e.estabaVisible && !e.foto?.visible
      construir(e)
      e.compilando = yaConCuerpo ? null : compilarEnSegundoPlano(ctx.renderer, e.holder)
      construido = true
    }
    // 7/11: las imágenes fijas de los que se quedan fuera del tope (una horneada por fotograma, y no a la vez que un cuerpo).
    let horneada = construido
    for (const clave of sel.porTope) {
      const e = entradas.get(clave)
      if (!e) continue
      const yaEstaba = hayFotoDe(ctx.renderer, e.jugador.aspecto) || hayFotoGuardada(e.jugador.aspecto)
      if (prepararFoto(e, ctx.renderer, !horneada)) {
        if (!yaEstaba) horneada = hornoEnEsteFotograma = true
      } else pendienteConstruir = true
    }

    // --- colocar y animar ---
    /**
     * Todo lo de un jugador cambia JUNTO y en el mismo fotograma: su cuerpo 3D (con su aro y su sombra) aquí, y su
     * retrato, su aro de símbolo y su aura en el mapa (estado `tresD` de su punto, ver `alCambiar`). El mapa aplica
     * ese estado en su SIGUIENTE fotograma, así que aquí el cuerpo sigue lo que ya se publicó: quien entra en 3D
     * aparece un fotograma después de pedirlo, y quien sale se sigue pintando ese fotograma. Así nunca queda un
     * halo sin jugador ni un jugador repetido.
     */
    const ahoraEn3D = new Set<string>()
    hayAlgunoVisible = false
    hayMovimiento = false
    const escalaZoom = alturaVirtualM(ctx.zoom, centro.lat) / ESTATURA_REAL_M
    for (const e of entradas.values()) {
      const i = rango.get(e.clave)
      const j = e.jugador
      const saliendo = e.saleEn > 0
      // 7/11: fuera del tope, su imagen fija (en cuanto está horneada; mientras, su retrato).
      const comoFoto =
        i === undefined && porTope.has(e.clave) && !saliendo && e.foto !== null && e.fotoAspecto === claveDeAspecto(j.aspecto)
      const quiere = (i !== undefined || comoFoto) && !saliendo
      // 24/11: quien deja de ir en 3D sigue pintándose mientras se funde con su retrato (`mezcla` > 0), en el mismo sitio.
      const fundiendose = !quiere && !saliendo && e.mezcla > 0
      const pinta = quiere || saliendo || fundiendose || enTresD.has(e.clave)
      // 22/11 (r2): su cuerpo recién montado, sin sus programas todavía: sigue como estaba (ver `compilarEnSegundoPlano`).
      const cuerpoListo = cuerpoCompilado(e, ctx.renderer, ctx.ahora)
      if (!cuerpoListo) pendienteConstruir = true
      // Quien sale (o deja de ir en 3D) se pinta un fotograma más como estaba.
      const usaFoto = comoFoto || ((!quiere || !cuerpoListo) && e.foto !== null && e.foto.visible)
      if (!pinta || (usaFoto ? !e.foto : !e.avatar || !cuerpoListo)) {
        ocultar(e)
        continue
      }
      if (e.avatar) e.avatar.root.visible = !usaFoto
      if (e.foto) e.foto.visible = usaFoto
      // La cota del terreno, como los nodos: al instante si no se conoce, y quieto cada medio segundo.
      if (
        ctx.conTerreno &&
        (!Number.isFinite(e.elevacion) || (!ctx.enMovimiento && ctx.ahora - e.elevacionEn > 500))
      ) {
        const el = ctx.mapa.queryTerrainElevation({ lng: j.lon, lat: j.lat })
        if (typeof el === 'number' && Number.isFinite(el)) e.elevacion = el
        e.elevacionEn = ctx.ahora
      }
      if (ctx.conTerreno && !Number.isFinite(e.elevacion)) {
        ocultar(e)
        continue
      }
      if (e.aro) {
        const material = (e.aro.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial
        if (e.aroColor !== j.color) {
          e.aroColor = j.color
          material.color.copy(colorDeAro(j.color))
        }
        const opacidad = j.esYo ? OPACIDAD_ARO.yo : j.tenue ? OPACIDAD_ARO.tenue : OPACIDAD_ARO.otros
        if (material.opacity !== opacidad) material.opacity = opacidad
      }
      const k = escalaZoom
      const real = maplibregl.MercatorCoordinate.fromLngLat([j.lon, j.lat], ctx.conTerreno ? e.elevacion : 0)
      const m = real.meterInMercatorCoordinateUnits()
      // Fuera de la pantalla: ni se anima ni se pinta (lo decide su punto real, como su retrato).
      _v.set(real.x - ctx.origen.x, real.y - ctx.origen.y, real.z, 1).applyMatrix4(ctx.proyeccion)
      const fuera = _v.w <= 0 || Math.abs(_v.x / _v.w) > 1.5 || Math.abs(_v.y / _v.w) > 1.6
      if (fuera) {
        ocultar(e)
        e.acumulado = 0
        continue
      }
      if (quiere) ahoraEn3D.add(e.clave)
      // En el abanico: sigue siendo personaje para el mapa, pero no se pinta.
      if (!j.esYo && ocultos.has(e.clave)) {
        ocultar(e)
        continue
      }
      // Quien entra en 3D se pinta cuando el mapa ya ha quitado su retrato (siguiente fotograma).
      if (!saliendo && !fundiendose && !enTresD.has(e.clave)) {
        ocultar(e)
        continue
      }
      // 24/11: el fundido con su retrato: el cuerpo crece desde sus pies (o encoge hacia ellos) en `FUNDIDO_VISTA_MS`.
      // Avanza con el fotograma, como mucho 40 ms por fotograma: si el móvil se atasca al cambiar de vista (el mapa monta los
      // retratos), el fundido sigue después del atasco en vez de acabarse de golpe durante él.
      const hacia = saliendo || quiere ? 1 : 0
      const mezcla = saliendo ? 1 : pasoDeMezcla(e.mezcla, hacia, Math.min(MS_MAX_POR_FOTOGRAMA_DE_FUNDIDO, ctx.dt * 1000), reducido)
      if (mezcla !== e.mezcla) {
        e.mezcla = mezcla
        mezclaCambio = true
      }
      if (mezcla <= 0 && hacia === 0) {
        ocultar(e)
        continue
      }
      if (mezcla < 1) hayMovimiento = true
      e.holder.visible = true
      e.holder.matrixWorldAutoUpdate = true
      // Sólo crece quien ACABA de llegar (no quien pasa de retrato a 3D al hacer zoom: ese ya se veía, y del
      // mismo tamaño). Quien se va, se encoge.
      if (!e.estabaVisible) e.apareceEn = ctx.ahora - e.creadaEn < 1500 && !reducido ? ctx.ahora : -1e9
      e.estabaVisible = true
      const crece = (saliendo ? factorDeSalida(ctx.ahora - e.saleEn) : factorDeEntrada(ctx.ahora - e.apareceEn)) * Math.max(0.02, mezcla * mezcla * (3 - 2 * mezcla))
      if (crece < 1) hayMovimiento = true
      hayAlgunoVisible = true

      // 23/11: el cuerpo va EXACTAMENTE en `dibujo` (j.lat/j.lon, de la fuente de posición: real + apartado del poste, y tú
      // siempre en tu real): esta capa no suma nada y la cámara sólo proyecta. La velocidad se mide con `j.real`.
      const mc = real
      e.dibujado = mc
      const rx = mc.x - ctx.origen.x
      const ry = mc.y - ctx.origen.y

      // Pies y coronilla en pantalla (para saber a quién se toca).
      _v.set(rx, ry, mc.z + ESTATURA_REAL_M * m * k * crece, 1).applyMatrix4(ctx.proyeccion)
      const cabezaY = _v.w > 0 ? (0.5 - _v.y / _v.w / 2) * alto : Number.NaN
      _v.set(rx, ry, mc.z, 1).applyMatrix4(ctx.proyeccion)
      e.pantalla =
        _v.w > 0
          ? { x: (0.5 + _v.x / _v.w / 2) * ancho, pies: (0.5 - _v.y / _v.w / 2) * alto, cabeza: cabezaY }
          : null

      _s.makeScale(m * k * crece, -m * k * crece, m * k * crece)
      _colocacion.makeTranslation(rx, ry, mc.z).multiply(_s).multiply(_r)
      // 23/11: quieto y barato (pose congelada) con la MISMA colocación que el fotograma anterior (orbitar, inclinar, mover el mapa
      // no la cambia): ni se rehacen sus 65 huesos ni se suben a la GPU. Se descongela en cuanto algo cambia.
      const igual = _colocacion.equals(e.holder.matrix)
      e.estable = igual ? e.estable + 1 : 0
      if (!igual) {
        e.holder.matrix.copy(_colocacion)
        e.holder.matrixWorldNeedsUpdate = true
      }
      if (usaFoto && e.foto) {
        // 20/11: la imagen fija con el rumbo del MUNDO de su jugador (brújula/GPS, el mismo que el cuerpo), no «de cara a la
        // cámara»: se ve según (rumbo − bearing), limitado, y en espejo si mira de espaldas. No anda ni gesticula.
        const rb = j.esYo ? rumboDelCuerpo({ brujula: brujulaVigente(ctx.ahora), gps: j.rumbo, andando: false, ultimo: e.ultimoRumbo }) : (j.rumbo ?? e.ultimoRumbo)
        if (rb !== null) e.ultimoRumbo = rb
        const cartel = orientacionDelCartel(rb, ctx.rumbo)
        e.foto.rotation.y = cartel.rotY
        e.foto.scale.x = cartel.espejo ? -1 : 1
        continue
      }
      e.cuerpoEn = ctx.ahora

      // Velocidad por desplazamiento neto en la ventana (metros de su punto real).
      // 20/11: con la posición REAL (no la apartada: el apartado se reescala con el zoom y parecía que andaba).
      const sitioReal = j.real ? maplibregl.MercatorCoordinate.fromLngLat([j.real.lon, j.real.lat]) : real
      // (y con SU escala: dividir por la `m` del punto apartado inventaba metros al cambiar el apartado de latitud)
      const mReal = sitioReal.meterInMercatorCoordinateUnits()
      anadirMuestra(e.muestras, { t: ctx.ahora, x: sitioReal.x / mReal, y: sitioReal.y / mReal })
      const v = saliendo ? 0 : estadoDeMarcha(e.muestras, ctx.ahora, e.andando).velocidadMps
      e.andando = v > 0.05
      // 24/11: si su punto se mueve, el clip va con la velocidad de VERDAD (la de su filtro o su último tramo), no con la del
      // deslizamiento: tu GPS con ruido o un compañero que se pone al día tras un corte andan a su paso, sin acelerones.
      const vm = v > 0.05 && typeof j.velocidad === 'number' && j.velocidad > 0.05 ? j.velocidad : v
      const marcha = elegirMarcha(e.marcha, vm, ctx.ahora, reducido)
      const av = e.avatar as AvatarMotor
      // El clip, por la velocidad REAL con histéresis (24/11, `elegirMarcha`: correr sólo sostenido); el ritmo del paso, por la
      // que se VE (el muñeco va mucho más grande que una persona).
      av.setSpeed(vm, pasoDeMarcha(marcha, vm, k))
      // Girar en el sitio también es movimiento: con los fotogramas de reposo (uno cada 250 ms) se vería a saltos.
      if (v > 0.05 || av.v > 0.05 || av.turn) hayMovimiento = true
      // 20/11: hacia dónde mira en el MUNDO (brújula del móvil quieto, rumbo GPS andando), nunca según la cámara.
      // 24/11: el rumbo es del JUGADOR, no del cuerpo: si no llega ninguno vigente vale el último, también para un cuerpo rehecho
      // (cambio de calidad, zoom, memoria), que antes nacía mirando a 0 rad (el sur) y se quedaba así: 90° de golpe sin moverse.
      if (j.rumbo !== null) e.ultimoRumbo = j.rumbo
      let rumboCuerpo = e.ultimoRumbo
      if (j.esYo) {
        anotarAndandoPropio(e.andando)
        rumboCuerpo = rumboDelCuerpo({ brujula: brujulaVigente(ctx.ahora), gps: j.rumbo, andando: e.andando, ultimo: e.ultimoRumbo })
        if (rumboCuerpo !== null) e.ultimoRumbo = rumboCuerpo
      }
      if (ctx.ahora < e.mirarHasta) {
        // Lo acaban de tocar: de cara a quien mira el mapa mientras dura el gesto; después, a su rumbo.
        av.goal = -ctx.rumbo
      } else {
        // Sin rumbo conocido: el de reposo FIJO en el mundo (nunca el de la cámara: girar el mapa no lo gira).
        av.goal = giroDelMotor(rumboCuerpo)
      }
      // Recién llegado: ya mirando hacia donde toca, sin girar delante de todos.
      // 24/11: y aplicado ya al cuerpo: uno rehecho quieto y barato (pose congelada) no pasa por `update` y se quedaba a 0 rad.
      if (av.time < 0.3) av.root.rotation.y = av.heading = av.goal
      // Con el giro a medias no es «parado»: un cuerpo barato congelado no llegaba nunca a su rumbo y giraba de golpe al cambiar de trato.
      const girando = Math.abs(Math.atan2(Math.sin(av.goal - av.heading), Math.cos(av.goal - av.heading))) > 1e-3
      if (girando) hayMovimiento = true

      e.acumulado += ctx.dt
      e.fotograma += 1
      /**
       * Revisión 19/10 de batería: el mixer de quien está parado y sin gesto (sólo respira) se avanza uno de
       * cada 3 fotogramas como poco, con el tiempo acumulado, así que no va más lento, sólo a menos saltos.
       * El propio, siempre.
       */
      const parado = !girando && v <= 0.05 && av.v <= 0.05 && !av.turn && av.gest.length === 0 && ctx.ahora - e.ultimoGesto > 600
      const trato = tratoDelCuerpo({
        esYo: e.jugador.esYo,
        barato: baratos.has(e.clave),
        parado,
        rango: i ?? 99,
        calidad,
      })
      // Misma malla en otra versión (mismos vértices, hueso y textura): ni se mueve ni cambia de luz, sólo tiene menos triángulos.
      if (e.malla !== trato.malla) {
        ponerMalla(av, trato.malla)
        e.malla = trato.malla
      }
      const congelado = trato.cada === null && e.estable >= 3
      congelarPose(av, congelado)
      e.holder.matrixWorldAutoUpdate = !congelado
      if (trato.cada === null) {
        // Quieto y barato: pose congelada (sin avanzar su mixer ni subir sus huesos).
        e.acumulado = 0
      } else if (e.fotograma % trato.cada === 0 && e.acumulado > 0) {
        const t1 = performance.now()
        av.update(Math.min(0.1, e.acumulado))
        e.costeMs += (performance.now() - t1 - e.costeMs) * 0.1
        e.acumulado = 0
      }
    }
    if (ahoraEn3D.size !== enTresD.size || [...ahoraEn3D].some((c) => !enTresD.has(c))) {
      enTresD = ahoraEn3D
      opciones.alCambiar(enTresD)
      // El cambio se ve en el siguiente fotograma (a la vez en el mapa y aquí): que lo haya.
      hayMovimiento = true
      opciones.pedirFotograma()
    }
    if (mezclaCambio) opciones.alMezclar?.()

    // --- tirar lo que lleva tiempo sin verse (memoria) ---
    for (const e of entradas.values()) {
      if (e.holder.visible) e.vistaEn = ctx.ahora
      else if (e.avatar && ctx.ahora - e.vistaEn > 20000 && !rango.has(e.clave)) quitarModelo(e)
      // Como imagen fija desde hace 20 s: su cuerpo animado sobra en memoria.
      if (e.avatar && e.foto?.visible && !rango.has(e.clave) && ctx.ahora - e.cuerpoEn > 20000) quitarModelo(e)
    }

    // --- medir el ritmo y, si no llega, bajar la calidad ---
    ultimoCosteMs = performance.now() - t0
    if (ctx.dt > 0 && ctx.dt < 0.4) fpsMedios = fpsMedios ? fpsMedios * 0.9 + (1 / ctx.dt) * 0.1 : 1 / ctx.dt
    if (hayAlgunoVisible && ctx.dt > 0) {
      const nueva = gobernador.muestra(ctx.dt * 1000, ctx.ahora, esperaPedida)
      if (nueva && !enAhorro) calidad = nueva
    }
    // 20/11: ahorro «Auto» por RENDIMIENTO (Safari no da la batería): sólo en Auto, sin ahorro ya puesto, con algo moviéndose
    // (quieto, el mapa repinta a 4 fps a propósito), en la calidad más baja y 30 s seguidos por debajo de 14 fps.
    if (
      !enAhorro &&
      (hayMovimiento || ctx.enMovimiento) &&
      vigilanteDeFps.muestra(ctx.dt * 1000, fpsMedios, calidad === 'baja') &&
      ahorroEnAutomatico(window.localStorage)
    ) {
      anotarFpsBajos(window.localStorage)
      avisarCambioDeAhorro()
    }
  }

  escucharBrujula()
  const complemento: ComplementoDeAvatares = {
    grupo,
    // 22/11: `entradas` primero: el proveedor rehace la lista entera (posiciones deslizadas) y esto se pregunta 3 veces por fotograma.
    activo: () => entradas.size > 0 || opciones.proveedor().length > 0,
    hayQueDibujar: () => hayAlgunoVisible || hornoEnEsteFotograma,
    alRenderizar,
    esperaHastaElSiguiente: () => {
      let e: number | null
      if (!hayAlgunoVisible) e = intentando.size > 0 || pendienteConstruir ? 120 : null
      else {
        /**
         * Revisión 19/10 de batería: con todos quietos se pedían 12-20 fotogramas por segundo sólo para que
         * respiraran. Ahora, quietos, uno cada 250 ms, y pasados 5 s ninguno: el mapa repinta igual cuando
         * alguien se mueve (setData de su punto) o hace un gesto (`gesto` pide fotograma), y entonces se
         * vuelve a la cadencia normal. Una pausa larga no baja la calidad: el medidor ignora dt > 400 ms.
         */
        const ahora = performance.now()
        if (hayMovimiento || hayGestoEnCurso() || pendienteConstruir) {
          quietoDesde = ahora
          e = MS_ENTRE_FOTOGRAMAS[calidad]
        } else e = ahora - quietoDesde > 5000 ? null : 250
      }
      esperaPedida = e ?? 0
      return e
    },
    enTresD: () => enTresD,
    mezcla: (clave) => entradas.get(clave)?.mezcla ?? 0,
    gesto(clave, clip) {
      const e = entradas.get(clave)
      // Un gesto quitado (r16) hace el que lo sustituye; uno desconocido, nada.
      const vigente = gestoVigente(clip)
      if (!e?.avatar || !e.holder.visible || !e.avatar.root.visible || !vigente) return false
      e.avatar.gesture(vigente)
      e.ultimoGesto = performance.now()
      // Con todos quietos la capa puede llevar rato sin pedir fotogramas: el gesto la despierta.
      opciones.pedirFotograma()
      return true
    },
    festejar(clave, clip) {
      if (reducido) return false
      if (!clip) {
        clip = GESTOS_DE_FESTEJO[indiceFestejo % GESTOS_DE_FESTEJO.length]
        indiceFestejo += 1
      }
      return complemento.gesto(clave, clip)
    },
    reaccionarAlToque(clave) {
      const e = entradas.get(clave)
      if (reducido || !e?.avatar || !e.holder.visible) return false
      e.mirarHasta = performance.now() + MIRAR_AL_TOQUE_MS
      return complemento.gesto(clave, GESTO_AL_TOCARLO)
    },
    tocado(x, y) {
      const sitios = [...entradas.values()]
        .filter((e) => e.holder.visible && (e.avatar || e.foto?.visible) && e.pantalla)
        .map((e) => ({ clave: e.clave, esYo: e.jugador.esYo, ...(e.pantalla as NonNullable<Entrada['pantalla']>) }))
      return elegirTocado(sitios, x, y)
    },
    dibujado(clave) {
      const e = entradas.get(clave)
      if (!e?.holder.visible || !e.dibujado) return null
      const p = new maplibregl.MercatorCoordinate(e.dibujado.x, e.dibujado.y).toLngLat()
      return { lat: p.lat, lon: p.lng }
    },
    cabeza(clave) {
      const e = entradas.get(clave)
      if (!e || !(e.avatar || e.foto?.visible) || !e.holder.visible || !e.pantalla || !Number.isFinite(e.pantalla.cabeza)) return null
      return { x: e.pantalla.x, y: e.pantalla.cabeza - 8 }
    },
    reintentarCarga() {
      if (Object.keys(resumenDeCarga().fallos).length === 0) return
      olvidarFallos()
      opciones.pedirFotograma()
    },
    calidad: () => calidad,
    diagnostico: () => ({
      calidad,
      tope: TOPE_DE_AVATARES[calidad],
      fps: fpsMedios,
      motivos: new Map([...entradas.values()].map((e) => [e.clave, e.motivo])),
      tresD: enTresD,
    }),
    modelosQueFaltan: () => [...new Set([...entradas.values()].map((e) => e.jugador.aspecto.mx))].filter((mx) => !personajeCargado(mx)),
    modelosPerdidos: () =>
      [...new Set([...entradas.values()].map((e) => e.jugador.aspecto.mx))].filter(
        (mx) => !personajeCargado(mx) && !intentando.has(mx) && seIntentoCargar(mx)
      ),
    async alTerminarDeBajarModelos() {
      for (const mx of [...new Set([...entradas.values()].map((e) => e.jugador.aspecto.mx))].filter((m) => personajeCargado(m))) {
        await encolarCarga(mx).catch(() => undefined)
      }
      olvidarFallos()
      opciones.pedirFotograma()
    },
    fijarCalidad(c) {
      calidad = c
      gobernador.calidad = c
      // Fijada a mano (pruebas, panel de depuración): no vuelve a subir por encima.
      gobernador.techo = c
    },
    liberar() {
      for (const e of [...entradas.values()]) descartar(e)
      enTresD = new Set()
      liberarFotos()
      observadorDeLargas?.disconnect()
    },
    estadisticas: () => ({
      calidad,
      entradas: entradas.size,
      enTresD: [...enTresD],
      visibles: [...entradas.values()].filter((e) => e.holder.visible && e.avatar).length,
      // 7/11: los que se pintan con su imagen fija (fuera del tope de cuerpos animados).
      // 23/11: dónde apoya cada cuerpo (mercator, para comprobar que NADIE se mueve al orbitar ni al cambiar de trato) y su malla.
      suelo: Object.fromEntries([...entradas.values()].filter((e) => e.avatar && e.holder.visible && e.dibujado).map((e) => [e.clave, [e.dibujado?.x, e.dibujado?.y, e.avatar?.root.rotation.y, e.holder.matrix.elements[0]]])),
      mallas: Object.fromEntries([...entradas.values()].filter((e) => e.avatar && e.holder.visible).map((e) => [e.clave, e.malla])),
      completos: [...completos],
      fotos: [...entradas.values()].filter((e) => e.holder.visible && e.foto?.visible).map((e) => e.clave),
      construcciones,
      // 23/11: llamadas de dibujo de cada cuerpo y de todo el último fotograma de la capa (cuerpos + nodos 3D).
      dibujosPorCuerpo: Object.fromEntries([...entradas.values()].filter((e) => e.avatar && e.holder.visible).map((e) => [e.clave, dibujosDe(e.avatar as AvatarMotor)])),
      llamadas: ultimoCtx?.renderer.info.render.calls ?? null,
      costeMs: Math.round(ultimoCosteMs * 100) / 100,
      fotogramas,
      carga: resumenDeCarga(),
      objetosDeMano: Object.fromEntries([...entradas.values()].filter((e) => e.avatar).map((e) => [e.clave, Object.keys(e.avatar?.items ?? {})])),
      costePorAvatarMs: Object.fromEntries([...entradas.values()].filter((e) => e.avatar).map((e) => [e.clave, Math.round(e.costeMs * 10) / 10])),
      // Dónde se pinta cada cuerpo (pies, px CSS) y el punto que lo coloca: para medir que nadie se mueve por la cámara.
      // Diagnóstico: orientación RENDERIZADA = pies y un punto 1 unidad delante de la malla (frente local +z), en px de pantalla.
      frente: Object.fromEntries(
        [...entradas.values()]
          .filter((e) => e.avatar && e.holder.visible && ultimoCtx)
          .map((e) => {
            const c = ultimoCtx as ContextoDeFotograma
            e.holder.updateMatrixWorld(true)
            const a = (e.avatar as AvatarMotor).root
            const px = (v: THREE.Vector3) => {
              const q = maplibregl.MercatorCoordinate.fromLngLat([0, 0])
              q.x = v.x + c.origen.x
              q.y = v.y + c.origen.y
              q.z = 0
              const ll = q.toLngLat()
              const r = c.mapa.project(ll)
              return [r.x, r.y]
            }
            return [e.clave, { pies: px(a.localToWorld(new THREE.Vector3(0, 0, 0))), frente: px(a.localToWorld(new THREE.Vector3(0, 0, 1))) }]
          })
      ),
      marcha: Object.fromEntries([...entradas.values()].filter((e) => e.avatar).map((e) => { const a = e.avatar as AvatarMotor; return [e.clave, { v: a.v, heading: a.heading, goal: a.goal, andando: e.andando, giro: Boolean(a.turn) }] })),
      pantalla: Object.fromEntries([...entradas.values()].filter((e) => e.holder.visible && e.pantalla).map((e) => [e.clave, { ...e.pantalla, lat: e.jugador.lat, lon: e.jugador.lon, real: e.jugador.real }])),
    }),
  }

  function hayGestoEnCurso() {
    const ahora = performance.now()
    for (const e of entradas.values()) {
      if (e.avatar && e.avatar.gest.length > 0) return true
      if (ahora - e.ultimoGesto < 600) return true
    }
    return false
  }

  return complemento
}

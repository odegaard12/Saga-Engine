import * as THREE from 'three'
import * as maplibregl from 'maplibre-gl'
import type { ComplementoDeCapa, ContextoDeFotograma } from '../../components/nodosTresD'
import { crearAvatarMapa, liberarAvatar, prepararCuerpoParaElMapa, simplificadorListo, type AvatarMotor } from './avatar'
import { cargarPersonaje, olvidarFallos, personajeCargado, resumenDeCarga, seIntentoCargar } from './cargador'
import { claveDeAspecto, GESTOS_DE_FESTEJO, type Aspecto } from './catalogo'
import {
  alturaEnPantallaPx,
  alturaVirtualM,
  anadirMuestra,
  CADA_N_FOTOGRAMAS_LEJANOS,
  calidadInicial,
  type CandidatoLod,
  elegirEnTresD,
  ESTATURA_REAL_M,
  formaQuePermiteTresD,
  GobernadorDeCalidad,
  MS_ENTRE_FOTOGRAMAS,
  elegirTocado,
  factorDeEntrada,
  velocidadDePaso,
  velocidadPorVentana,
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
  aspecto: Aspecto
  esYo: boolean
  /** Color de su equipo (#rrggbb): el aro del suelo. */
  color: string
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
  tuvoRumbo: boolean
  /** Andaba en el fotograma anterior (histéresis de la velocidad). */
  andando: boolean
  /** Se estaba pintando en el fotograma anterior, y desde cuándo (ms): la entrada crece en vez de saltar. */
  estabaVisible: boolean
  apareceEn: number
  /** Dónde está en pantalla (px CSS): los pies y la coronilla. Sirve para saber a quién se toca. */
  pantalla: { x: number; pies: number; cabeza: number } | null
  ultimoGesto: number
  /** Milisegundos medios que cuesta animarlo (diagnóstico y presupuesto). */
  costeMs: number
}

const _s = new THREE.Matrix4()
const _r = new THREE.Matrix4().makeRotationX(Math.PI / 2)
const _v = new THREE.Vector4()

function fijarCapa(o: THREE.Object3D, capa: number) {
  o.traverse((n) => n.layers.set(capa))
}

/**
 * El aro del equipo: dos anillos planos (el del color y un canto blanco por dentro) en el plano del suelo del
 * avatar. Se mide en metros del propio avatar (1,75 m de alto), así que crece con él y apoya donde pisa.
 * Opaco y sin escribir profundidad: no tapa nada ni se ve a través de nada.
 */
const R_ARO_M = { dentro: 0.44, fuera: 0.58 }
const geometriaAroColor = new THREE.RingGeometry(R_ARO_M.dentro, R_ARO_M.fuera, 48).rotateX(-Math.PI / 2)
const geometriaAroCanto = new THREE.RingGeometry(R_ARO_M.dentro - 0.07, R_ARO_M.dentro, 48).rotateX(-Math.PI / 2)
const materialAroCanto = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1, 1, 1, THREE.LinearSRGBColorSpace), side: THREE.DoubleSide, depthWrite: false })

/** El color tal como se ve en pantalla: el objetivo de la escena no convierte a sRGB, así que se escribe tal cual. */
function colorDeAro(hex: string): THREE.Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0x3b82f6
  return new THREE.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, THREE.LinearSRGBColorSpace)
}

function crearAro(hex: string): THREE.Group {
  const g = new THREE.Group()
  g.name = 'aro-equipo'
  const color = new THREE.Mesh(
    geometriaAroColor,
    new THREE.MeshBasicMaterial({ color: colorDeAro(hex), side: THREE.DoubleSide, depthWrite: false })
  )
  const canto = new THREE.Mesh(geometriaAroCanto, materialAroCanto)
  for (const m of [color, canto]) {
    // Pegado al suelo y por debajo de los pies en el orden de pintado (los pies siempre ganan).
    m.position.y = 0.012
    m.renderOrder = -2
    g.add(m)
  }
  return g
}

function entornoDelMovil() {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    memoriaGB: nav.deviceMemory ?? null,
    nucleos: nav.hardwareConcurrency ?? null,
    densidad: window.devicePixelRatio ?? 1,
    ancho: window.innerWidth,
  }
}

export type OpcionesDeAvatares = {
  /** Los jugadores de ahora mismo con su posición deslizada. Se llama en cada fotograma. */
  proveedor: () => readonly JugadorAvatar[]
  /** Cambió la lista de los que van en 3D (el mapa decide qué retrato pintar). */
  alCambiar: (tresD: ReadonlySet<string>) => void
  /** Pide un fotograma al mapa (un modelo acaba de cargarse). */
  pedirFotograma: () => void
  calidad?: Calidad
}

export interface ComplementoDeAvatares extends ComplementoDeCapa {
  /** Los que se están pintando ahora en 3D. */
  enTresD(): ReadonlySet<string>
  /** Un gesto del clip `ge__*` (parte alta del cuerpo; se puede andar mientras). */
  gesto(clave: string, clip: string): boolean
  /** Festejar un nodo completado: un gesto alegre, rotando. */
  festejar(clave: string): boolean
  /**
   * A quién se toca en este punto de pantalla (px CSS), o `null`. Por proyección, no por `queryRenderedFeatures`
   * (que no vale en algunos móviles con relieve) ni por el hueco del símbolo (que MapLibre alza 3 m: con el cuerpo
   * más pequeño, tocar el cuerpo no daba en él).
   */
  tocado(x: number, y: number): string | null
  /** Vuelve a intentar los modelos que fallaron (volvió la red, terminó de bajarse la caché). */
  reintentarCarga(): void
  calidad(): Calidad
  fijarCalidad(c: Calidad): void
  estadisticas(): Record<string, unknown>
}

export function crearComplementoDeAvatares(opciones: OpcionesDeAvatares): ComplementoDeAvatares {
  const grupo = new THREE.Group()
  grupo.name = 'avatares'
  const entradas = new Map<string, Entrada>()
  let enTresD: Set<string> = new Set()
  let calidad: Calidad = opciones.calidad ?? calidadInicial(entornoDelMovil())
  const gobernador = new GobernadorDeCalidad(calidad)
  let hayAlgunoVisible = false
  let hayMovimiento = false
  let construcciones = 0
  let ultimaConstruccion = 0
  let ultimoCosteMs = 0
  let fotogramas = 0
  let indiceFestejo = 0
  /** Lo que se le pidió esperar al mapa antes de este fotograma (el medidor mide el exceso sobre esto). */
  let esperaPedida = 0
  const intentando = new Set<string>()
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
      encolarCarga(mx)
        .catch((e) => {
          // Sin el modelo en el móvil el jugador se queda con su retrato; el motivo queda en la consola.
          console.warn('avatares:', e instanceof Error ? e.message : e)
        })
        .finally(() => {
          intentando.delete(mx)
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
      tuvoRumbo: false,
      andando: false,
      estabaVisible: false,
      apareceEn: 0,
      pantalla: null,
      ultimoGesto: 0,
      costeMs: 0,
    }
  }

  function quitarModelo(e: Entrada) {
    if (!e.avatar) return
    liberarAvatar(e.avatar)
    e.avatar = null
    e.claveAspecto = ''
  }

  function descartar(e: Entrada) {
    quitarModelo(e)
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
    // Tú siempre encima: se pinta en la segunda pasada, tras limpiar la profundidad.
    if (e.jugador.esYo) fijarCapa(av.root, 1)
    e.holder.add(av.root)
    if (!e.aro) {
      e.aro = crearAro(e.jugador.color)
      e.aroColor = e.jugador.color
      if (e.jugador.esYo) fijarCapa(e.aro, 1)
      e.holder.add(e.aro)
    }
    e.avatar = av
    e.claveAspecto = claveDeAspecto(e.jugador.aspecto)
    construcciones += 1
    ultimaConstruccion = performance.now()
  }

  function alRenderizar(ctx: ContextoDeFotograma) {
    const t0 = performance.now()
    fotogramas += 1
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
    }
    for (const e of [...entradas.values()]) if (!vivos.has(e.clave)) descartar(e)

    // --- quién va en 3D ---
    const permitido = formaQuePermiteTresD(ctx.zoom, (ctx.inclinacion * 180) / Math.PI)
    const centro = ctx.mapa.getCenter()
    // Dónde cae cada uno en pantalla: lo que se sale del mapa no ocupa plaza, y quien caería
    // encima de otro cuerpo se queda en retrato (ver `elegirEnTresD`).
    const lienzo = ctx.mapa.getCanvas()
    const ancho = lienzo.clientWidth
    const alto = lienzo.clientHeight
    const altoPx = alturaEnPantallaPx(ctx.zoom, centro.lat)
    const cands: CandidatoLod[] = []
    if (permitido) {
      for (const j of lista) {
        const p = ctx.mapa.project([j.lon, j.lat])
        if (!j.esYo && (p.x < -0.1 * ancho || p.x > 1.1 * ancho || p.y < -0.1 * alto || p.y > 1.2 * alto)) continue
        cands.push({
          clave: j.clave,
          esYo: j.esYo,
          distancia: Math.hypot(
            (j.lon - centro.lng) * Math.cos((j.lat * Math.PI) / 180),
            j.lat - centro.lat
          ),
          disponible: disponible(j.aspecto.mx),
          pantalla: { x: p.x, y: p.y },
        })
      }
    }
    const sel = elegirEnTresD(cands, calidad, {
      rx: Math.max(14, altoPx * 0.4),
      ry: Math.max(10, altoPx * 0.3),
      yaEnTresD: enTresD,
    })
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
      construir(e)
      construido = true
    }

    // --- colocar y animar ---
    let nuevoEn3D: Set<string> | null = null
    const ahoraEn3D = new Set<string>()
    hayAlgunoVisible = false
    hayMovimiento = false
    const escalaZoom = alturaVirtualM(ctx.zoom, centro.lat) / ESTATURA_REAL_M
    for (const e of entradas.values()) {
      const i = rango.get(e.clave)
      const j = e.jugador
      if (i === undefined || !e.avatar) {
        e.holder.visible = false
        e.estabaVisible = false
        continue
      }
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
        e.holder.visible = false
        e.estabaVisible = false
        continue
      }
      if (e.aro && e.aroColor !== j.color) {
        e.aroColor = j.color
        const color = e.aro.children[0] as THREE.Mesh
        ;(color.material as THREE.MeshBasicMaterial).color.copy(colorDeAro(j.color))
      }
      const k = escalaZoom
      const mc = maplibregl.MercatorCoordinate.fromLngLat(
        [j.lon, j.lat],
        ctx.conTerreno ? e.elevacion : 0
      )
      const m = mc.meterInMercatorCoordinateUnits()
      // Fuera de la pantalla: ni se anima ni se pinta.
      const rx = mc.x - ctx.origen.x
      const ry = mc.y - ctx.origen.y
      _v.set(rx, ry, mc.z, 1).applyMatrix4(ctx.proyeccion)
      const fuera = _v.w <= 0 || Math.abs(_v.x / _v.w) > 1.5 || Math.abs(_v.y / _v.w) > 1.6
      e.holder.visible = !fuera
      if (fuera) {
        e.acumulado = 0
        e.estabaVisible = false
        continue
      }
      // Recién aparecido (de retrato a 3D, o llegado a la pantalla): crece en ~0,2 s en vez de saltar.
      if (!e.estabaVisible) e.apareceEn = ctx.ahora
      e.estabaVisible = true
      const crece = factorDeEntrada(ctx.ahora - e.apareceEn)
      if (crece < 1) hayMovimiento = true
      ahoraEn3D.add(e.clave)
      hayAlgunoVisible = true
      // Pies y coronilla en pantalla (para saber a quién se toca).
      _v.set(rx, ry, mc.z + ESTATURA_REAL_M * m * k * crece, 1).applyMatrix4(ctx.proyeccion)
      const cabezaY = _v.w > 0 ? (0.5 - _v.y / _v.w / 2) * alto : Number.NaN
      _v.set(rx, ry, mc.z, 1).applyMatrix4(ctx.proyeccion)
      e.pantalla =
        _v.w > 0
          ? { x: (0.5 + _v.x / _v.w / 2) * ancho, pies: (0.5 - _v.y / _v.w / 2) * alto, cabeza: cabezaY }
          : null

      _s.makeScale(m * k * crece, -m * k * crece, m * k * crece)
      e.holder.matrix.makeTranslation(rx, ry, mc.z).multiply(_s).multiply(_r)
      e.holder.matrixWorldNeedsUpdate = true

      // Velocidad por desplazamiento neto en la ventana (metros de este punto).
      anadirMuestra(e.muestras, { t: ctx.ahora, x: mc.x / m, y: mc.y / m })
      const v = velocidadPorVentana(e.muestras, ctx.ahora, undefined, e.andando)
      e.andando = v > 0.05
      const av = e.avatar
      // El paso se anima a la velocidad que se VE (el muñeco va mucho más grande que una persona).
      av.setSpeed(v, velocidadDePaso(v, k))
      if (v > 0.05 || av.v > 0.05) hayMovimiento = true
      if (j.rumbo !== null) {
        av.goal = Math.PI - (j.rumbo * Math.PI) / 180
        e.tuvoRumbo = true
      } else if (!e.tuvoRumbo) {
        // Sin rumbo conocido: de cara a quien mira el mapa.
        av.goal = -ctx.rumbo
      }
      // Recién llegado: ya mirando hacia donde toca, sin girar delante de todos.
      if (av.time < 0.3) av.heading = av.goal

      e.acumulado += ctx.dt
      e.fotograma += 1
      const cada = i < 3 || e.jugador.esYo ? 1 : CADA_N_FOTOGRAMAS_LEJANOS[calidad]
      if (e.fotograma % cada === 0 && e.acumulado > 0) {
        const t1 = performance.now()
        av.update(Math.min(0.1, e.acumulado))
        e.costeMs += (performance.now() - t1 - e.costeMs) * 0.1
        e.acumulado = 0
      }
    }
    if (ahoraEn3D.size !== enTresD.size || [...ahoraEn3D].some((c) => !enTresD.has(c)))
      nuevoEn3D = ahoraEn3D
    if (nuevoEn3D) {
      enTresD = nuevoEn3D
      opciones.alCambiar(enTresD)
    }

    // --- tirar lo que lleva tiempo sin verse (memoria) ---
    for (const e of entradas.values()) {
      if (e.holder.visible) e.vistaEn = ctx.ahora
      else if (e.avatar && ctx.ahora - e.vistaEn > 20000 && !rango.has(e.clave)) quitarModelo(e)
    }

    // --- medir el ritmo y, si no llega, bajar la calidad ---
    ultimoCosteMs = performance.now() - t0
    if (hayAlgunoVisible && ctx.dt > 0) {
      const nueva = gobernador.muestra(ctx.dt * 1000, ctx.ahora, esperaPedida)
      if (nueva) calidad = nueva
    }
  }

  const complemento: ComplementoDeAvatares = {
    grupo,
    activo: () => opciones.proveedor().length > 0 || entradas.size > 0,
    hayQueDibujar: () => hayAlgunoVisible,
    alRenderizar,
    esperaHastaElSiguiente: () => {
      let e: number | null
      if (!hayAlgunoVisible) e = intentando.size > 0 || pendienteConstruir ? 120 : null
      else {
        const base = MS_ENTRE_FOTOGRAMAS[calidad]
        e = hayMovimiento || hayGestoEnCurso() || pendienteConstruir ? base : Math.round(base * 1.6)
      }
      esperaPedida = e ?? 0
      return e
    },
    enTresD: () => enTresD,
    gesto(clave, clip) {
      const e = entradas.get(clave)
      if (!e?.avatar || !e.holder.visible) return false
      e.avatar.gesture(clip)
      e.ultimoGesto = performance.now()
      return true
    },
    festejar(clave) {
      if (reducido) return false
      const clip = GESTOS_DE_FESTEJO[indiceFestejo % GESTOS_DE_FESTEJO.length]
      indiceFestejo += 1
      return complemento.gesto(clave, clip)
    },
    tocado(x, y) {
      const sitios = [...entradas.values()]
        .filter((e) => e.holder.visible && e.avatar && e.pantalla)
        .map((e) => ({ clave: e.clave, esYo: e.jugador.esYo, ...(e.pantalla as NonNullable<Entrada['pantalla']>) }))
      return elegirTocado(sitios, x, y)
    },
    reintentarCarga() {
      if (Object.keys(resumenDeCarga().fallos).length === 0) return
      olvidarFallos()
      opciones.pedirFotograma()
    },
    calidad: () => calidad,
    fijarCalidad(c) {
      calidad = c
      gobernador.calidad = c
    },
    estadisticas: () => ({
      calidad,
      entradas: entradas.size,
      enTresD: [...enTresD],
      visibles: [...entradas.values()].filter((e) => e.holder.visible && e.avatar).length,
      construcciones,
      costeMs: Math.round(ultimoCosteMs * 100) / 100,
      fotogramas,
      carga: resumenDeCarga(),
      objetosDeMano: Object.fromEntries([...entradas.values()].filter((e) => e.avatar).map((e) => [e.clave, Object.keys(e.avatar?.items ?? {})])),
      costePorAvatarMs: Object.fromEntries([...entradas.values()].filter((e) => e.avatar).map((e) => [e.clave, Math.round(e.costeMs * 10) / 10])),
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

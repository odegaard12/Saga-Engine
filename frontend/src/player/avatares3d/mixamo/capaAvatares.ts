import * as THREE from 'three'
import * as maplibregl from 'maplibre-gl'
import type { ComplementoDeCapa, ContextoDeFotograma } from '../../components/nodosTresD'
import { crearAvatarMapa, liberarAvatar, prepararCuerpoParaElMapa, simplificadorListo, type AvatarMotor } from './avatar'
import { cargarPersonaje, olvidarFallos, personajeCargado, resumenDeCarga, seIntentoCargar } from './cargador'
import { claveDeAspecto, GESTOS_DE_FESTEJO, gestoVigente, type Aspecto } from './catalogo'
import { motivoDeRetrato, type EstadoDelModelo, type MotivoDeRetrato } from './diagnosticoMapa'
import {
  alturaVirtualM,
  anadirMuestra,
  CADA_N_FOTOGRAMAS_LEJANOS,
  calidadInicial,
  entornoDelMovil,
  type CandidatoLod,
  elegirEnTresD,
  ESTATURA_REAL_M,
  formaQuePermiteTresD,
  INCLINACION_MINIMA_GRADOS,
  TOPE_DE_AVATARES,
  ZOOM_MINIMO_AVATARES,
  GobernadorDeCalidad,
  MS_ENTRE_FOTOGRAMAS,
  elegirTocado,
  factorDeEntrada,
  factorDeSalida,
  SALIDA_MS,
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
  /** Cuándo se creó (ms): sólo crece al aparecer quien acaba de llegar, no quien pasa de retrato a 3D. */
  creadaEn: number
  /** Su jugador ya no está: se encoge desde aquí (ms) y se quita. 0 = sigue. */
  saleEn: number
  /** Dónde está en pantalla (px CSS): los pies y la coronilla. Sirve para saber a quién se toca. */
  pantalla: { x: number; pies: number; cabeza: number } | null
  ultimoGesto: number
  /** Milisegundos medios que cuesta animarlo (diagnóstico y presupuesto). */
  costeMs: number
  /** Por qué NO va en 3D en este fotograma (`null` = va en 3D). Sólo para `?depurar-mapa`. */
  motivo: MotivoDeRetrato | null
  /** Desde cuándo no se conoce la cota de su terreno (ms), para el plan B. */
  sinCotaDesde: number
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
      tuvoRumbo: false,
      andando: false,
      estabaVisible: false,
      apareceEn: 0,
      creadaEn: performance.now(),
      saleEn: 0,
      pantalla: null,
      ultimoGesto: 0,
      costeMs: 0,
      motivo: null,
      sinCotaDesde: 0,
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

  /** No se pinta este fotograma. */
  function ocultar(e: Entrada) {
    e.holder.visible = false
    e.estabaVisible = false
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
      e.saleEn = 0
    }
    // Quien deja de estar: si se veía en 3D se encoge (~0,2 s) y luego se quita; si no, se quita ya.
    for (const e of [...entradas.values()]) {
      if (vivos.has(e.clave)) continue
      if (e.saleEn === 0 && e.avatar && e.holder.visible && !reducido) e.saleEn = ctx.ahora
      if (e.saleEn === 0 || ctx.ahora - e.saleEn >= SALIDA_MS) descartar(e)
    }

    // --- quién va en 3D ---
    const permitido = formaQuePermiteTresD(ctx.zoom, (ctx.inclinacion * 180) / Math.PI)
    const centro = ctx.mapa.getCenter()
    // Dónde cae cada uno en pantalla: lo que se sale del mapa no ocupa plaza, y quien caería
    // encima de otro cuerpo se queda en retrato (ver `elegirEnTresD`).
    const lienzo = ctx.mapa.getCanvas()
    const ancho = lienzo.clientWidth
    const alto = lienzo.clientHeight
    const cands: CandidatoLod[] = []
    const dentro = new Set<string>()
    const incl = (ctx.inclinacion * 180) / Math.PI
    if (permitido) {
      for (const j of lista) {
        const p = ctx.mapa.project([j.lon, j.lat])
        if (!j.esYo && (p.x < -0.1 * ancho || p.x > 1.1 * ancho || p.y < -0.1 * alto || p.y > 1.2 * alto)) continue
        const e = entradas.get(j.clave)
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
          distancia: Math.hypot(p.x - ancho / 2, p.y - alto / 2),
          disponible: cota && disponible(j.aspecto.mx),
          yaEnTresD: enTresD.has(j.clave),
        })
      }
    }
    const sel = elegirEnTresD(cands, calidad)
    const porTope = new Set(sel.porTope)
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
      construir(e)
      construido = true
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
      const quiere = i !== undefined && !saliendo
      const pinta = quiere || saliendo || enTresD.has(e.clave)
      if (!pinta || !e.avatar) {
        ocultar(e)
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
        ocultar(e)
        continue
      }
      if (e.aro && e.aroColor !== j.color) {
        e.aroColor = j.color
        const color = e.aro.children[0] as THREE.Mesh
        ;(color.material as THREE.MeshBasicMaterial).color.copy(colorDeAro(j.color))
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
      // Quien entra en 3D se pinta cuando el mapa ya ha quitado su retrato (siguiente fotograma).
      if (!saliendo && !enTresD.has(e.clave)) {
        ocultar(e)
        continue
      }
      e.holder.visible = true
      // Sólo crece quien ACABA de llegar (no quien pasa de retrato a 3D al hacer zoom: ese ya se veía, y del
      // mismo tamaño). Quien se va, se encoge.
      if (!e.estabaVisible) e.apareceEn = ctx.ahora - e.creadaEn < 1500 && !reducido ? ctx.ahora : -1e9
      e.estabaVisible = true
      const crece = saliendo ? factorDeSalida(ctx.ahora - e.saleEn) : factorDeEntrada(ctx.ahora - e.apareceEn)
      if (crece < 1) hayMovimiento = true
      hayAlgunoVisible = true

      // El cuerpo va SIEMPRE en su punto (el corro, si lo hay, ya viene en el suelo: ver `corroEnMetros`).
      const mc = real
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
      e.holder.matrix.makeTranslation(rx, ry, mc.z).multiply(_s).multiply(_r)
      e.holder.matrixWorldNeedsUpdate = true

      // Velocidad por desplazamiento neto en la ventana (metros de su punto real).
      anadirMuestra(e.muestras, { t: ctx.ahora, x: real.x / m, y: real.y / m })
      const v = saliendo ? 0 : velocidadPorVentana(e.muestras, ctx.ahora, undefined, e.andando)
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
      const cada = (i !== undefined && i < 3) || e.jugador.esYo ? 1 : CADA_N_FOTOGRAMAS_LEJANOS[calidad]
      if (e.fotograma % cada === 0 && e.acumulado > 0) {
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

    // --- tirar lo que lleva tiempo sin verse (memoria) ---
    for (const e of entradas.values()) {
      if (e.holder.visible) e.vistaEn = ctx.ahora
      else if (e.avatar && ctx.ahora - e.vistaEn > 20000 && !rango.has(e.clave)) quitarModelo(e)
    }

    // --- medir el ritmo y, si no llega, bajar la calidad ---
    ultimoCosteMs = performance.now() - t0
    if (ctx.dt > 0 && ctx.dt < 0.4) fpsMedios = fpsMedios ? fpsMedios * 0.9 + (1 / ctx.dt) * 0.1 : 1 / ctx.dt
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
      // Un gesto quitado (r16) hace el que lo sustituye; uno desconocido, nada.
      const vigente = gestoVigente(clip)
      if (!e?.avatar || !e.holder.visible || !vigente) return false
      e.avatar.gesture(vigente)
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
      // Dónde se pinta cada cuerpo (pies, px CSS) y el punto que lo coloca: para medir que nadie se mueve por la cámara.
      pantalla: Object.fromEntries([...entradas.values()].filter((e) => e.holder.visible && e.pantalla).map((e) => [e.clave, { ...e.pantalla, lat: e.jugador.lat, lon: e.jugador.lon }])),
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

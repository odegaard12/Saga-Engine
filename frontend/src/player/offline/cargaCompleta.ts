import type { PlayerGamePayload, PlayerStage, PublicConfig } from '../../types/player'
import { fetchFieldProofs, fetchPlayerGame } from '../../shared/api'
import { getCachedPublicConfig } from '../../shared/offlinePublicConfig'
import { esErrorDeCuota } from './almacenamiento'
import { obtenerConfigDeLaMision } from './configDeMision'
import {
  cacheCarasDelGrupo,
  cacheFieldProofAssets,
  cacheFieldProofs,
  carasDelGrupoQueFaltan,
  olvidarFotosRetiradas,
  urlsDeCarasDelGrupo,
} from './fieldProofCache'
import {
  comprobarMapaGuardado,
  fijarVersionDeRedDeCaminos,
  prefetchMissionMapTiles,
} from './mapTileCache'
import {
  contarAvancesPendentes,
  getStoredMissionPack,
  listarPacksGuardados,
  saveMissionPack,
  syncPendingOfflineEvents,
  type MissionPack,
} from './missionPack'
import { combinarConGuardado, pedirPartidaCompleta } from './missionSync'
import {
  comprobarPartes,
  algunaFallo,
  descargarPartes,
  hayQueBajar,
  partesSinCompletar,
  reabrirFallidas,
  type AvanceDeParte,
  type EstadoDeCarga,
  type ParteDeCarga,
  type ParteId,
} from './motorDeCarga'
import { descargarPaquetesDelJugador, verificarPaquetesDelJugador } from './pwaShell'
import { registrarHoraDelServidor } from './relojDelServidor'
import { aplicarResetDelServidor } from './reseteoDelServidor'
import {
  esConfigDeRespaldo,
  evaluarLoGuardado,
  evaluarMision,
  mantenerNivel,
  paqueteCompleto,
  reconciliacionDelNivel,
  revisionDelServidor,
  type EstadoDeLoGuardado,
} from './revisiones'

/**
 * La comprobación y la descarga de TODO lo que el móvil necesita para jugar sin
 * cobertura: la aplicación, la misión del jugador y el mapa de su ruta.
 *
 * Se hace en dos sitios, con este mismo código:
 *
 *  - al ENTRAR (login o reabrir), con cobertura: una comprobación de lo que hay
 *    frente a lo último publicado; si algo falta o ha cambiado, pantalla de
 *    carga con una barra por parte, y no se entra hasta tenerlo. Si nada cambió,
 *    se entra sin pantalla.
 *  - en «Prepararse», días antes de la salida: la misma comprobación y la misma
 *    descarga en la misma pantalla, más los permisos.
 *
 * Y NADA más baja cosas mientras se juega.
 */

export type ModoDeCarga = 'entrada' | 'preparacion'

export interface OpcionesDeCarga {
  modo: ModoDeCarga
  /** Ruta de la página del jugador (`/player/NOMBRE`), para comprobar el shell. */
  playerUrl: string
  /**
   * Cada cambio del estado de la carga. `null` = todavía no hay nada que enseñar
   * por partes (pantalla neutra, con `detalle`).
   */
  alCambiar(estado: EstadoDeCarga | null, detalle: string): void
  /**
   * Se sabe cuál es la configuración de la misión (el tema, sobre todo). Sale en
   * cuanto llega, antes de bajar nada: la carga puede durar minutos la primera
   * vez, y no puede pasársela entera con el tema equivocado.
   */
  alConocerConfig?(config: PublicConfig): void
  /** La pantalla ya no está (cambió de jugador, se desmontó). */
  cancelado(): boolean
  /** El jugador pulsó «Entrar igualmente». */
  entrarIgualmente(): boolean
  /**
   * Cuántas veces ha pulsado «Reintentar». Cada vez que sube, se vuelve a
   * intentar lo que falló. Sólo en la entrada: «Prepararse» reintenta volviendo
   * a llamar a `cargarTodo`.
   */
  reintentos?(): number
  /** La partida que se ve ahora mismo, para no hacer retroceder el nivel. */
  payloadEnPantalla(): PlayerGamePayload | null
}

export interface ResultadoDeCarga {
  /** El servidor contestó. */
  cobertura: boolean
  /** La partida con la que entrar (o con la que seguir, en «Prepararse»). */
  payload: PlayerGamePayload | null
  config: PublicConfig | null
  /** La configuración es de ahora (no una copia guardada). */
  configFresca: boolean
  /** Hora del móvil (ms) a la que llegó la configuración, si fue ahora. */
  configRecibidaEn: number | null
  huboReset: boolean
  /** Cómo quedó cada parte; `null` si no hubo comprobación (sin cobertura). */
  partes: EstadoDeCarga | null
  /** Partes que NO quedaron listas. Vacío = todo en orden. */
  faltan: ParteId[]
  /** Sin cobertura: qué tiene de malo lo guardado. */
  loGuardado: EstadoDeLoGuardado | null
  /** El jugador entró sin esperar a que terminase. */
  entroIgualmente: boolean
  /** Se enseñó la pantalla de carga con descargas. */
  huboPantalla: boolean
}

interface Contexto {
  user: string
  playerUrl: string
  ligero: PlayerGamePayload
  config: PublicConfig
  configRecibidaEn: number | null
  guardado: MissionPack | null
  stagesIniciales: PlayerStage[]
  /** Lo fija la parte «Misión» cuando termina de bajar y guardar. */
  payloadFinal: PlayerGamePayload | null
  reconciliar(servidor: PlayerGamePayload): Promise<PlayerGamePayload>
  detenido(): boolean
  /** «Prepararse»: además, se refrescan los otros jugadores de este móvil. */
  refrescarOtros: boolean
}

/* ------------------------------------------------------------------ *
 * Parte «App»
 * ------------------------------------------------------------------ */

function parteApp(ctx: Contexto): ParteDeCarga {
  return {
    id: 'app',

    async comprobar() {
      const informe = await verificarPaquetesDelJugador(ctx.playerUrl)

      if (informe.sinLista) {
        // Sin lista de archivos (servidor viejo, primera visita sin red) no hay con
        // qué comparar: no se bloquea a nadie por lo que no se puede comprobar.
        return { pendiente: false, motivo: null, detalle: 'Sin lista de archivos que comprobar' }
      }

      if (informe.completo) {
        // Las fotos de perfil del grupo (el mapa 2D pinta a cada uno con la suya) también se bajan AQUÍ,
        // en la pantalla de carga, y no de fondo mientras se juega.
        const caras = await carasDelGrupoQueFaltan(urlsDeCarasDelGrupo(ctx.config.player_profiles))
        if (caras.length > 0) {
          return {
            pendiente: true,
            motivo: 'version_nueva',
            detalle: `Faltan ${caras.length} fotos del grupo`,
            hecho: informe.total,
            total: informe.total + caras.length,
          }
        }
        return {
          pendiente: false,
          motivo: null,
          detalle: `${informe.total} archivos de la aplicación guardados`,
          hecho: informe.total,
          total: informe.total,
        }
      }

      return {
        pendiente: true,
        // Con casi nada guardado es la primera vez; con casi todo, una versión nueva.
        motivo: informe.guardados <= 3 ? 'primera_vez' : 'version_nueva',
        detalle: `Faltan ${informe.faltan.length} de ${informe.total} archivos`,
        hecho: informe.guardados,
        total: informe.total,
      }
    },

    async descargar(alAvanzar) {
      const informe = await descargarPaquetesDelJugador(ctx.playerUrl, alAvanzar, {
        cancelado: ctx.detenido,
      })

      if (informe.completo && informe.avataresSinBajar.length > 0 && !ctx.detenido()) {
        // Los modelos de los personajes SÍ están en el servidor y no llegaron: sin ellos los compañeros se
        // ven como retratos. No se da por buena la carga; «Reintentar» los vuelve a pedir.
        return {
          ok: false,
          error: `Faltan ${informe.avataresSinBajar.length} archivos de los personajes por bajar`,
        }
      }

      if (informe.completo) {
        // Las caras del grupo no son la aplicación: si alguna no llega, el mapa 2D usa la de su personaje.
        const caras = urlsDeCarasDelGrupo(ctx.config.player_profiles)
        if (caras.length > 0 && !ctx.detenido()) {
          alAvanzar({
            hecho: informe.total,
            total: informe.total + caras.length,
            detalle: `Guardando las fotos del grupo (${caras.length})…`,
          })
          const r = await cacheCarasDelGrupo(caras, { cancelado: ctx.detenido }).catch(() => null)
          if (r?.sinEspacio)
            return { ok: false, sinEspacio: true, error: 'Sin espacio en el móvil' }
        }
        return { ok: true, detalle: `${informe.total} archivos de la aplicación guardados` }
      }
      return {
        ok: false,
        sinEspacio: informe.sinEspacio,
        error: informe.sinEspacio
          ? 'Sin espacio en el móvil'
          : `Faltan ${informe.faltan.length} archivos de la aplicación`,
      }
    },
  }
}

/* ------------------------------------------------------------------ *
 * Parte «Misión»
 * ------------------------------------------------------------------ */

/** Las fotos de campo del jugador: la lista y las imágenes, saltándose las que ya están. */
async function bajarFotosDeCampo(user: string, cancelado: () => boolean) {
  try {
    const respuesta = await fetchFieldProofs(user)
    const fotos = Array.isArray(respuesta.proofs) ? respuesta.proofs : []
    cacheFieldProofs(user, fotos)
    await olvidarFotosRetiradas(fotos)
    return await cacheFieldProofAssets(fotos, { cancelado })
  } catch {
    // Las fotos de campo no son la misión: si no llegan, la misión sigue valiendo.
    return { total: 0, nuevas: 0, fallos: 0, sinEspacio: false }
  }
}

/**
 * Los OTROS jugadores que han usado este móvil.
 *
 * Antes el login bajaba las catorce misiones en cada carga, con las fotos dentro
 * del JSON: unos 3 MB y seis peticiones por perfil, para jugadores que casi nunca
 * iban a entrar desde este teléfono. Ahora sólo se refrescan los que ya tienen
 * paquete AQUÍ, y sólo en la pantalla de carga o «Prepararse». Se mira su
 * revisión y se baja únicamente el que haya cambiado.
 *
 * Pedir la partida de otro jugador cambia la cookie de sesión al suyo: por eso
 * al terminar se vuelve a pedir la de quien está jugando.
 */
export async function refrescarPerfilesDeEsteTelefono(args: {
  usuarioActual: string
  config: PublicConfig
  cancelado: () => boolean
  alAvanzar?: (avance: AvanceDeParte) => void
}): Promise<{ revisados: number; refrescados: number; fallos: number }> {
  const packs = (await listarPacksGuardados().catch(() => [] as MissionPack[]))
    .filter((pack) => pack.user && pack.user !== args.usuarioActual)
    .slice(0, 8)

  let refrescados = 0
  let fallos = 0

  for (let i = 0; i < packs.length; i += 1) {
    if (args.cancelado()) break
    const pack = packs[i]
    args.alAvanzar?.({
      hecho: i,
      total: packs.length,
      detalle: `Otros jugadores de este móvil (${i + 1} de ${packs.length})`,
    })

    try {
      const ligero = await fetchPlayerGame(pack.user)
      if (evaluarMision({ pack, ligero, config: args.config }).estado === 'ok') continue

      const partida = await pedirPartidaCompleta(pack.user, {
        forzarPaquete: true,
        ligero,
        config: args.config,
      })
      if (args.cancelado()) break

      // Aunque no sea el jugador de ahora, su nivel tampoco retrocede.
      const pendientes = await contarAvancesPendentes(pack.user).catch(() => 0)
      const reconciliacion = reconciliacionDelNivel({
        pendientes,
        huboReset: false,
        alArrancar: true,
        enPantalla: null,
        guardada: pack.payload,
      })
      const payload = mantenerNivel(
        reconciliacion.base,
        partida.payload,
        reconciliacion.permitirBajar
      )

      await saveMissionPack({
        user: pack.user,
        config: args.config,
        payload,
        mission_revision: partida.revision,
      })
      refrescados += 1
    } catch {
      fallos += 1
    }
  }

  if (packs.length > 0) {
    // La sesión vuelve a ser la de quien juega.
    await fetchPlayerGame(args.usuarioActual).catch(() => undefined)
  }

  return { revisados: packs.length, refrescados, fallos }
}

/** Tiempo máximo para repasar a los otros jugadores: pasado esto se sigue sin ellos. */
export const TOPE_OTROS_JUGADORES_MS = 8000

/**
 * `refrescarPerfilesDeEsteTelefono` con un tope de tiempo y sin lanzar nunca:
 * lo que no llegue a tiempo se deja para otra vez, la carga no espera.
 */
async function refrescarConTope(
  args: Parameters<typeof refrescarPerfilesDeEsteTelefono>[0]
): Promise<void> {
  let agotado = false
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const tope = new Promise<void>((resolver) => {
    temporizador = setTimeout(() => {
      agotado = true
      resolver()
    }, TOPE_OTROS_JUGADORES_MS)
  })
  const trabajo = refrescarPerfilesDeEsteTelefono({
    ...args,
    cancelado: () => agotado || args.cancelado(),
  })
    .then(() => undefined)
    .catch(() => undefined)
  try {
    await Promise.race([trabajo, tope])
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}

function parteMision(ctx: Contexto): ParteDeCarga {
  return {
    id: 'mision',

    async comprobar() {
      const evaluacion = evaluarMision({
        pack: ctx.guardado,
        ligero: ctx.ligero,
        config: ctx.config,
      })

      if (evaluacion.estado === 'ok') {
        const nodos = ctx.guardado?.payload?.stages?.length ?? 0
        return {
          pendiente: false,
          motivo: null,
          detalle: `${nodos} nodos guardados, al día`,
          hecho: 1,
          total: 1,
        }
      }

      const detalle =
        evaluacion.motivo === 'primera_vez'
          ? 'Falta bajar la misión'
          : evaluacion.motivo === 'mision_cambiada'
            ? 'La misión ha cambiado'
            : 'La misión guardada está incompleta'

      return { pendiente: true, motivo: evaluacion.motivo, detalle }
    },

    async descargar(alAvanzar) {
      alAvanzar({ hecho: 0, total: 4, detalle: 'Bajando los nodos y sus fotos…' })

      // Los nodos enteros (minijuegos, códigos, fotos del mosaico): se piden por
      // URL, cacheables, y se guardan dentro del paquete.
      const partida = await pedirPartidaCompleta(ctx.user, {
        forzarPaquete: true,
        ligero: ctx.ligero,
        config: ctx.config,
      })
      if (ctx.detenido()) return { ok: false, error: 'Interrumpido' }

      alAvanzar({ hecho: 1, total: 4, detalle: 'Guardando la misión en el móvil…' })

      // El nivel NO retrocede por bajar la misión: con nodos hechos sin cobertura
      // que el servidor aún no conoce, manda el móvil.
      const payload = await ctx.reconciliar(partida.payload)

      try {
        await saveMissionPack({
          user: payload.user || ctx.user,
          config: ctx.config,
          payload,
          mission_revision: partida.revision,
          config_recibida_en: ctx.configRecibidaEn ?? undefined,
        })
      } catch (error) {
        // Sin sitio no se dice «listo»: el paquete no está guardado.
        if (esErrorDeCuota(error)) {
          return { ok: false, sinEspacio: true, error: 'Sin espacio en el móvil' }
        }
        return { ok: false, error: 'No se pudo guardar la misión en el móvil' }
      }

      // Se relee lo guardado: es lo que se jugará sin cobertura.
      const releido = await getStoredMissionPack(payload.user || ctx.user).catch(() => null)
      if (!paqueteCompleto(releido).completo) {
        return { ok: false, error: 'La misión guardada quedó incompleta' }
      }
      ctx.payloadFinal = payload

      alAvanzar({ hecho: 2, total: 4, detalle: 'Guardando las fotos de campo…' })
      const fotos = await bajarFotosDeCampo(ctx.user, ctx.detenido)
      if (fotos.sinEspacio) return { ok: false, sinEspacio: true, error: 'Sin espacio en el móvil' }

      // Refrescar a los OTROS jugadores nunca bloquea la entrada: sólo se hace en
      // «Prepararse», y aun así con un tope de tiempo.
      if (ctx.refrescarOtros) {
        alAvanzar({
          hecho: 3,
          total: 4,
          detalle: 'Repasando las misiones de otros jugadores de este móvil…',
        })
        await refrescarConTope({
          usuarioActual: ctx.user,
          config: ctx.config,
          cancelado: ctx.detenido,
        })
      }

      alAvanzar({ hecho: 4, total: 4, detalle: `${payload.stages?.length ?? 0} nodos guardados` })
      return { ok: true, detalle: `${payload.stages?.length ?? 0} nodos guardados` }
    },
  }
}

/* ------------------------------------------------------------------ *
 * Parte «Mapa»
 * ------------------------------------------------------------------ */

function parteMapa(ctx: Contexto): ParteDeCarga {
  const nodos = () => ctx.payloadFinal?.stages ?? ctx.stagesIniciales
  let motivoDeLaComprobacion: 'primera_vez' | 'ruta_cambiada' | 'incompleto' | null = null
  let grafoGuardado = false

  return {
    id: 'mapa',

    async comprobar() {
      // Sin Cache Storage (una dirección http sin cifrar, un navegador antiguo) no
      // hay dónde guardar el mapa: no es algo que esperar ni reintentar.
      if (typeof caches === 'undefined') {
        return {
          pendiente: false,
          motivo: null,
          detalle: 'Este navegador no puede guardar el mapa para jugar sin cobertura',
        }
      }

      fijarVersionDeRedDeCaminos(ctx.config.road_graph_version)
      const comprobacion = await comprobarMapaGuardado(nodos())
      motivoDeLaComprobacion = comprobacion.evaluacion.motivo
      grafoGuardado = comprobacion.grafo === 'ok'

      if (comprobacion.evaluacion.estado === 'ok') {
        return {
          pendiente: false,
          motivo: null,
          detalle: comprobacion.sinRuta
            ? 'La misión no tiene nodos con coordenadas'
            : 'Mapa guardado, al día',
          hecho: 1,
          total: 1,
        }
      }

      const faltan = comprobacion.faltan
      return {
        pendiente: true,
        motivo: comprobacion.evaluacion.motivo,
        detalle:
          comprobacion.evaluacion.motivo === 'ruta_cambiada'
            ? 'La ruta ha cambiado'
            : faltan !== null && faltan > 0
              ? `Faltan ${faltan.toLocaleString('es')} teselas del mapa`
              : comprobacion.grafo === 'falta'
                ? 'Falta la red de caminos'
                : 'Falta bajar el mapa',
      }
    },

    async descargar(alAvanzar) {
      const resumen = await prefetchMissionMapTiles(
        nodos(),
        (progreso) => {
          // Sólo la descarga real lleva número: comprobar y calcular no miden nada
          // que se pueda mostrar sin que la barra retroceda.
          const numerico = progreso.label === 'Mapa offline'
          alAvanzar({
            hecho: numerico ? progreso.done : 0,
            total: numerico ? progreso.total : 0,
            detalle: progreso.detail || progreso.label,
          })
        },
        {
          // La ruta cambió: la red de caminos también puede ser otra.
          forzarGrafo: motivoDeLaComprobacion === 'ruta_cambiada' && grafoGuardado,
          cancelado: ctx.detenido,
        }
      )

      if (resumen.completo) {
        return { ok: true, detalle: `${resumen.saved.toLocaleString('es')} teselas guardadas` }
      }
      return {
        ok: false,
        sinEspacio: Boolean(resumen.sin_espacio),
        error: resumen.sin_espacio
          ? 'Sin espacio en el móvil'
          : `Faltan ${(resumen.faltan ?? 0).toLocaleString('es')} teselas del mapa${resumen.grafo === 'error' ? ' y la red de caminos' : ''}`,
      }
    },
  }
}

/* ------------------------------------------------------------------ *
 * La carga entera
 * ------------------------------------------------------------------ */

/**
 * Comprueba y completa lo que el móvil tiene frente a lo último publicado.
 *
 * `entrada` devuelve la partida con la que entrar; `preparacion`, la partida
 * puesta al día. Sin cobertura no se descarga nada: en `entrada` se devuelve lo
 * guardado (con qué tiene de malo), y en `preparacion` se avisa de que no hay red.
 */
export async function cargarTodo(
  user: string,
  opciones: OpcionesDeCarga
): Promise<ResultadoDeCarga> {
  // Cuando la carga termina (o el jugador entra igualmente), lo que quedara bajando
  // no puede seguir moviendo la pantalla: una barra que llega tarde volvería a
  // poner «cargando» encima del juego.
  let cerrado = false
  const envuelto: OpcionesDeCarga = {
    ...opciones,
    alCambiar: (estado, detalle) => {
      if (!cerrado) opciones.alCambiar(estado, detalle)
    },
  }

  try {
    return await cargarTodoInterno(user, envuelto)
  } finally {
    cerrado = true
  }
}

async function cargarTodoInterno(
  user: string,
  opciones: OpcionesDeCarga
): Promise<ResultadoDeCarga> {
  const enPreparacion = opciones.modo === 'preparacion'
  const detenido = () => opciones.cancelado() || opciones.entrarIgualmente()

  opciones.alCambiar(null, 'Conectando con la misión…')

  const guardado = await getStoredMissionPack(user).catch(() => null)

  // Antes de mirar al servidor: en «Prepararse» se sube lo pendiente, para que el
  // servidor no vaya por detrás del móvil y la descarga no le haga retroceder.
  if (enPreparacion) await syncPendingOfflineEvents(user).catch(() => undefined)

  let ligero: PlayerGamePayload
  try {
    ligero = await fetchPlayerGame(user)
  } catch (error) {
    /* -------------------------- SIN COBERTURA -------------------------- */
    if (enPreparacion) {
      return {
        cobertura: false,
        payload: null,
        config: null,
        configFresca: false,
        configRecibidaEn: null,
        huboReset: false,
        partes: null,
        faltan: [],
        loGuardado: null,
        entroIgualmente: false,
        huboPantalla: false,
      }
    }

    // Se entra directo con lo guardado. Si no hay nada, no hay con qué entrar.
    if (!guardado?.payload || !guardado.config) throw error

    if (typeof guardado.config_recibida_en === 'number') {
      registrarHoraDelServidor(guardado.config.server_time_ms, guardado.config_recibida_en)
    }

    const app = await verificarPaquetesDelJugador(opciones.playerUrl).catch(() => null)
    const mapa = await comprobarMapaGuardado(guardado.payload.stages || [], { sinRed: true }).catch(
      () => null
    )

    // La del paquete si es buena; si no (nunca llegó una de verdad), la copia
    // que el navegador guardó de la última vez que hubo red.
    const configGuardada = esConfigDeRespaldo(guardado.config)
      ? (getCachedPublicConfig() ?? guardado.config)
      : guardado.config

    return {
      cobertura: false,
      payload: guardado.payload,
      config: configGuardada,
      configFresca: false,
      configRecibidaEn: guardado.config_recibida_en ?? null,
      huboReset: false,
      partes: null,
      faltan: [],
      loGuardado: evaluarLoGuardado({
        pack: guardado,
        ahoraMs: Date.now(),
        app: app ? { faltan: app.faltan.length, sinLista: app.sinLista } : null,
        mapa: mapa ? mapa.evaluacion : null,
      }),
      entroIgualmente: false,
      huboPantalla: false,
    }
  }

  /* --------------------------- CON COBERTURA --------------------------- */
  const cfg = await obtenerConfigDeLaMision({
    user,
    guardada: guardado?.config,
    guardadaRecibidaEn: guardado?.config_recibida_en,
  })
  if (!cfg.esRespaldo) opciones.alConocerConfig?.(cfg.config)

  // Un reinicio del organizador (nivel o mochila) se obedece aquí, sea cual sea
  // la vía por la que llegue la partida.
  const huboReset = await aplicarResetDelServidor(user, ligero)
  const pendientes = huboReset ? 0 : await contarAvancesPendentes(user).catch(() => 0)

  const reconciliar = async (servidor: PlayerGamePayload) => {
    const reconciliacion = reconciliacionDelNivel({
      pendientes,
      huboReset,
      alArrancar: !enPreparacion,
      enPantalla: opciones.payloadEnPantalla(),
      guardada: guardado?.payload,
    })
    return mantenerNivel(reconciliacion.base, servidor, reconciliacion.permitirBajar)
  }

  const combinado = combinarConGuardado(ligero, guardado)

  const contexto: Contexto = {
    user,
    playerUrl: opciones.playerUrl,
    ligero,
    config: cfg.config,
    configRecibidaEn: cfg.fresca ? cfg.recibidaEn : null,
    guardado,
    stagesIniciales: combinado?.stages ?? ligero.stages ?? [],
    payloadFinal: null,
    reconciliar,
    detenido,
    refrescarOtros: enPreparacion,
  }

  const partes = [parteApp(contexto), parteMision(contexto), parteMapa(contexto)]

  if (!enPreparacion) opciones.alCambiar(null, 'Comprobando lo que hay guardado…')

  // La comprobación es lo único que se hace siempre. En la entrada no se enseña
  // por partes hasta saber si hay algo que bajar; en «Prepararse» ya está a la vista.
  const estadoInicial = await comprobarPartes(
    partes,
    enPreparacion ? (estado) => opciones.alCambiar(estado, '') : undefined
  )

  const revision = revisionDelServidor(ligero, cfg.config)
  const guardarNivelDeAhora = async (payload: PlayerGamePayload) => {
    await saveMissionPack({
      user: payload.user || user,
      config: cfg.config,
      payload,
      mission_revision: revision,
      config_recibida_en: contexto.configRecibidaEn ?? undefined,
    }).catch(() => undefined)
  }

  /* ---- Nada cambió: se entra en 1-2 s, sin pantalla. ---- */
  if (!enPreparacion && !hayQueBajar(estadoInicial)) {
    const payload = await reconciliar(combinado ?? ligero)
    await guardarNivelDeAhora(payload)

    return {
      cobertura: true,
      payload,
      config: cfg.config,
      configFresca: cfg.fresca,
      configRecibidaEn: contexto.configRecibidaEn,
      huboReset,
      partes: estadoInicial,
      faltan: [],
      loGuardado: null,
      entroIgualmente: false,
      huboPantalla: false,
    }
  }

  /* ---- Hay algo que bajar: pantalla de carga, una barra por parte. ---- */
  opciones.alCambiar(estadoInicial, '')

  let final = await descargarPartes(partes, estadoInicial, {
    cancelado: detenido,
    alCambiar: (estado) => opciones.alCambiar(estado, ''),
  })

  /**
   * No se entra con algo a medias. Si una parte falló se queda la pantalla, con
   * el error a la vista, hasta que el jugador reintente (se vuelve a intentar sólo
   * lo que falló) o pulse «Entrar igualmente». Sin esto un fallo de red al bajar
   * el mapa dejaba entrar como si nada y el aviso de «listo» mentía.
   */
  if (!enPreparacion) {
    let reintentosVistos = opciones.reintentos?.() ?? 0
    while (algunaFallo(final) && !detenido()) {
      const reintentosAhora = opciones.reintentos?.() ?? 0
      if (reintentosAhora !== reintentosVistos) {
        reintentosVistos = reintentosAhora
        final = await descargarPartes(partes, reabrirFallidas(final), {
          cancelado: detenido,
          alCambiar: (estado) => opciones.alCambiar(estado, ''),
        })
        continue
      }
      await new Promise<void>((resolver) => setTimeout(resolver, 250))
    }
  }

  // «Prepararse» revisa además a los otros jugadores de este móvil aunque la
  // misión de éste estuviera al día (si no, sólo lo hace la descarga de la misión).
  if (enPreparacion && final.mision.estado === 'al_dia' && !detenido()) {
    await refrescarConTope({
      usuarioActual: user,
      config: cfg.config,
      cancelado: detenido,
    })
  }

  let payload = contexto.payloadFinal
  if (!payload) {
    payload = await reconciliar(combinado ?? ligero)
    // Con la misión al día se guarda el nivel de ahora; si no llegó a bajarse,
    // NO se toca el paquete guardado: la partida ligera no lo sustituye.
    if (combinado && final.mision.estado === 'al_dia') await guardarNivelDeAhora(payload)
  }

  return {
    cobertura: true,
    payload,
    config: cfg.config,
    configFresca: cfg.fresca,
    configRecibidaEn: contexto.configRecibidaEn,
    huboReset,
    partes: final,
    faltan: partesSinCompletar(final),
    loGuardado: null,
    entroIgualmente: opciones.entrarIgualmente() && partesSinCompletar(final).length > 0,
    huboPantalla: true,
  }
}

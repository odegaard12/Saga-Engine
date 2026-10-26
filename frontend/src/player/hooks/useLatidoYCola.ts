import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import { sendHeartbeat } from '../../shared/api'
import type { PlayerGamePayload, PublicConfig, TeamProfileLiveStatus } from '../../types/player'
import { rumboParaLatido } from '../avatares/rumboPropio'
import { anotarMuestraGps, registrarProveedorDePosicion } from '../avance/evidencia'
import type { UiNotice } from '../components/ToastNotice'
import { contarPendientes, saveLocalProgressSnapshot, saveMissionPack } from '../offline/missionPack'
import { pedirPartidaCompleta } from '../offline/missionSync'
import { refrescarConfigDeLaMision } from '../offline/configDeMision'
import { aplicarResetDelServidor } from '../offline/reseteoDelServidor'
import { flushOfflineEvents } from '../offline/localFirst'
import { cacheTeamProfiles, envejecerPresencia, getCachedTeamProfiles } from '../offline/teamPresence'
import { apuntarPosicionSinRed, volcarRastro } from '../offline/rastroSinRed'
import { conexionAhorradora, consumirRedRecuperada, sinCoberturaAhora } from '../offline/redEstado'
import { trasLatidoBueno } from '../registro/bitacora'
import { NOTICES, mantenerNivel, vibrate, type LoadState } from '../playerAppBase'

type Punto = { lat: number; lon: number }

/**
 * El latido, el refresco de la partida y la subida de la cola.
 *
 * Salido de `PlayerApp.tsx` (auditoría 23/10) tal cual, sin cambiar lo que
 * hace: vivía en mitad del componente, entre la carga y el GPS, y era lo más
 * delicado de leer — qué sube con la pantalla apagada, cuándo toca el refresco
 * pesado y qué se manda (o no) de dónde está el jugador.
 *
 * Lo que necesita del componente llega por argumentos: los refs que comparte
 * con el resto (la partida en pantalla, la configuración, si ya terminó la
 * carga), los setters y la posición de ahora. Las dependencias de los efectos
 * son las MISMAS que tenían allí; lo demás son refs y setters estables.
 */
export function useLatidoYCola({
  user,
  status,
  interactionOpen,
  submitting,
  initialLoadDoneRef,
  payloadRef,
  configRef,
  setState,
  setMapRefreshToken,
  repasarFotosPendentes,
  localDebugPosition,
  browserGpsFresh,
  browserGpsPosition,
  browserGpsAccuracy,
  setUiNotice,
  N,
  setTeamProfiles,
}: {
  user: string
  status: LoadState['status']
  interactionOpen: boolean
  submitting: boolean
  initialLoadDoneRef: MutableRefObject<boolean>
  payloadRef: MutableRefObject<PlayerGamePayload | null>
  configRef: MutableRefObject<PublicConfig | null>
  setState: Dispatch<SetStateAction<LoadState>>
  setMapRefreshToken: Dispatch<SetStateAction<number>>
  repasarFotosPendentes: (user: string) => Promise<unknown>
  localDebugPosition: Punto | null
  browserGpsFresh: boolean
  browserGpsPosition: Punto | null
  browserGpsAccuracy: number | null
  setUiNotice: Dispatch<SetStateAction<UiNotice>>
  N: (typeof NOTICES)[keyof typeof NOTICES]
  setTeamProfiles: (profiles: TeamProfileLiveStatus[]) => void
}) {
  /**
   * Coordina el refresco pesado (`pedirPartida`, ~214 KB) con el latido
   * ligero de cada 30 s.
   *
   * Antes los dos vivían en intervalos de 30 s independientes: el refresco
   * pesado se pedía siempre, tocase lo que tocase, mientras que el latido ya
   * traía consigo `live_status.level`/`.finished` (ver /api/heartbeat) sin que
   * nadie lo aprovechara. Con muchos jugadores a la vez eso es la mayor parte
   * del ancho de banda que satura la Raspberry, no la CPU.
   *
   * Ahora el latido, que es barato, avisa aquí si el nivel del servidor
   * cambió; el refresco pesado solo se dispara cuando hace falta de verdad
   * (avanzó un nodo, terminó la misión) o como red de seguridad cada
   * `HEAVY_REFRESH_MIN_INTERVAL_MS` por si algo se edita desde admin sin que
   * cambie el nivel (mensajes, objetos entregados a mano).
   */
  const heavyRefreshDueRef = useRef(false)
  const lastHeavyRefreshAtRef = useRef(0)

  const prevTeamStatusRef = useRef<Record<string, string>>({})

  /**
   * Volvió la red y todavía no se ha avisado de que la cola subió (revisión 19/10). En un ref: el efecto de abajo se
   * rehace al abrir y cerrar retos, y un `let` dentro se perdía.
   */
  const avisarRedOkRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let running = false

    async function refreshMissionFromServer(options: { force?: boolean } = {}) {
      if (running) return
      // No pisar la carga inicial (descarga de teselas) con un 'ready'.
      if (!initialLoadDoneRef.current) return
      if (interactionOpen || submitting) return

      /**
       * Con la pantalla apagada la cola SI sube; lo que no se hace es el
       * refresco pesado.
       *
       * Antes este `return` cortaba las dos cosas a la vez, y medido el
       * 2026-08-17 eso significaba que un movil en el bolsillo no subia nada:
       * ocho segundos con red perfecta y servidor sano, el servidor en 0 y el
       * movil en 1. Solo se reconciliaba al volver a mirar la pantalla. Quien
       * acaba la ruta y guarda el movil podia dejar su tiempo sin registrar
       * todo el dia.
       *
       * Pero no son dos cosas del mismo precio: vaciar la cola es un POST
       * diminuto -y con la cola vacia, ni eso-, mientras que `pedirPartida` son
       * 214 KB. Lo caro se salta; lo barato, no.
       *
       * OJO CON LO QUE ESTO NO ARREGLA: si el navegador CONGELA la pagina -app
       * en segundo plano un rato largo en Android- aqui no corre nada, ni esto
       * ni ninguna otra cosa. Para ese caso hace falta Background Sync de
       * verdad, con service worker. Esto cubre la pantalla apagada con la
       * pagina viva, que es el caso corriente al guardarse el movil un momento.
       */
      const oculto = typeof document !== 'undefined' && document.visibilityState !== 'visible'

      running = true

      try {
        /**
         * Primero los nodos completados, y de uno en uno.
         *
         * Estas dos colas iban lanzadas a la vez contra el mismo endpoint. El
         * servidor aplica los avances en el orden en que le llegan, asi que dos
         * peticiones simultaneas se pisaban: el nivel que salia dependia de
         * cual contestase antes. La de IndexedDB es la que lleva los nodos
         * superados, asi que va primera y se espera a que termine.
         */
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          // flushOfflineEvents ya sube la cola de IndexedDB primero (syncPendingOfflineEvents); llamarla también aquí
          // eran dos lecturas completas de la cola cada 30 s (auditoría 25/10).
          await flushOfflineEvents(user).catch(() => undefined)

          /**
           * La cola ya subió tras volver la red: ahora le toca al resto (revisión 19/10).
           *
           * Antes la caja negra, el aviso de desbloqueos y este ciclo escuchaban 'online' cada uno por su lado y
           * salían todos a la vez por la primera barra que aparecía: los avances del jugador competían con
           * diagnósticos. Ahora sólo este ciclo escucha 'online'; los demás esperan a 'saga:red-ok'.
           */
          // También si una petición llegó tras un fallo de red: iOS a menudo no dispara 'online' al volver la cobertura.
          if (consumirRedRecuperada()) avisarRedOkRef.current = true
          if (avisarRedOkRef.current && (await contarPendientes(user).catch(() => 1)) === 0) {
            avisarRedOkRef.current = false
            window.dispatchEvent(new CustomEvent('saga:red-ok', { detail: { user } }))
          }
        }

        // Hasta aqui llega el movil guardado en el bolsillo. Lo de abajo es
        // para cuando hay alguien mirando.
        if (oculto) return

        /**
         * Repasar tambien las fotos que estaban esperando.
         *
         * Este ciclo no las miraba, asi que una foto guardada sin cobertura se
         * quedaba pintada como pendiente DESPUES de haber subido, junto a la
         * de verdad: la misma foto contada dos veces -"fotos de campo 1/2"-, y
         * ahi se quedaba porque nada volvia a mirarlo.
         *
         * El aviso al subir ya lo arregla al momento; esto es la red por si
         * ese aviso se pierde.
         */
        void repasarFotosPendentes(user)

        // 16/10: era 90 s «por si acaso» (~200 KB cada vez: unos 8 MB por hora y móvil). El latido ya avisa
        // de un nivel o una misión distintos (heavyRefreshDueRef), así que esto queda de red de seguridad.
        const HEAVY_REFRESH_MIN_INTERVAL_MS = 10 * 60_000
        const ahora = Date.now()
        const tocaRefrescoPesado =
          options.force ||
          heavyRefreshDueRef.current ||
          ahora - lastHeavyRefreshAtRef.current >= HEAVY_REFRESH_MIN_INTERVAL_MS
        if (!tocaRefrescoPesado) return
        heavyRefreshDueRef.current = false
        lastHeavyRefreshAtRef.current = ahora

        const partida = await pedirPartidaCompleta(user, { enPartida: true })
        const nextPayload = partida.payload

        // Un reseteo desde administración es la única vez que el servidor puede
        // mandar un nivel más bajo y tener razón. Se obedece por completo: el
        // nivel, la cola de nodos sin subir y la mochila (contrato 4: bajar de
        // nivel o vaciar la mochila también lo suben).
        const huboReset = await aplicarResetDelServidor(user, nextPayload)

        /**
         * En plena partida el nivel no baja salvo por un reseteo.
         *
         * Este ciclo corre cada 30 s, al volver a la app y al recuperar la red:
         * justo los momentos en los que llega una respuesta vieja o a medias.
         * La reconciliación hacia abajo se hace al arrancar la aplicación, que
         * es cuando una respuesta no puede venir atrasada.
         */
        const permitirBajar = huboReset

        // La configuración de la misión no cambia mientras se camina, así que
        // no se vuelve a pedir en cada refresco (vale cinco minutos). Si no
        // llega, se sigue con la que había: la de respaldo no pisa a la buena.
        const nextConfig = await refrescarConfigDeLaMision(configRef.current, user)

        const reconciliado = mantenerNivel(payloadRef.current, nextPayload, permitirBajar)

        // Se guarda lo reconciliado, no lo que dijo el servidor: si no, el
        // paquete offline perdia los nodos hechos sin cobertura y al arrancar
        // la app mandaba a repetirlos.
        // Partida ligera (cambió el nº de nodos en plena ruta): sólo el estado; los nodos guardados se quedan.
        await (partida.soloEstado
          ? saveLocalProgressSnapshot(reconciliado)
          : saveMissionPack({
              user: reconciliado.user || user,
              config: nextConfig,
              payload: reconciliado,
              mission_revision: partida.revision,
            })
        ).catch(() => undefined)

        if (!cancelled) {
          setState({ status: 'ready', payload: reconciliado, config: nextConfig })
          setMapRefreshToken((value) => value + 1)
        }
      } catch {
        // Keep the currently loaded mission while offline.
      } finally {
        running = false
      }
    }

    const refresh = () => {
      void refreshMissionFromServer()
    }

    // Al volver la red: la cola sube enseguida, pero la partida completa sólo si toca (el latido avisa si cambió algo).
    // Antes eran DOS refrescos pesados forzados por cada `online`, y con cobertura que va y viene saltan muchos.
    // Revisión 19/10: un solo intento, tras 0-3 s al azar (los quince móviles del grupo recuperan la red a la vez al
    // salir del mismo valle, y además algunos anuncian 'online' antes de que la red sirva). Si aún no va, lo
    // recoge el ciclo de 30 s, y 'saga:red-ok' sale cuando la cola quede subida de verdad.
    const refreshAfterReconnect = () => {
      avisarRedOkRef.current = true
      window.setTimeout(() => void refreshMissionFromServer(), Math.random() * 3000)
    }

    window.addEventListener('focus', refresh)
    window.addEventListener('online', refreshAfterReconnect)
    document.addEventListener('visibilitychange', refresh)

    const intervalId = window.setInterval(refresh, 30000)

    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refreshAfterReconnect)
      // En `document`, igual que se añadió: con `window` no se quitaba nunca y se acumulaba un oyente más en cada
      // apertura o cierre de reto (auditoría 23/10).
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(intervalId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mismas dependencias que en PlayerApp (refs y setters estables)
  }, [user, interactionOpen, submitting])

  /**
   * Pinta la tabla de equipo. La trae el latido, no una petición aparte.
   *
   * Aquí había un ciclo propio pidiendo /api/team cada 5 segundos, en paralelo
   * al latido que ya iba cada 5 segundos: «aquí estoy yo» y «dónde están los
   * demás» son la misma conversación. Medido sobre la misión real: 1 440
   * peticiones por hora y por móvil, tres cuartas partes de todo lo que le
   * llegaba a la Raspberry. Ahora el latido devuelve las dos cosas.
   */
  const aplicarEquipo = (recibidos: TeamProfileLiveStatus[], desdeLoGuardado = false) => {
    // La copia guardada NO se vuelve a guardar: re-guardarla en cada latido
    // fallido le ponía la hora de ahora y nunca caducaba (auditoría T1).
    if (!desdeLoGuardado) cacheTeamProfiles(user, recibidos)
    const profiles = envejecerPresencia(recibidos)

    const prevStatuses = prevTeamStatusRef.current
    profiles.forEach((p) => {
      const oldStatus = prevStatuses[p.user]
      if (oldStatus && oldStatus !== p.status && p.status && !p.is_self) {
        setUiNotice({
          id: Date.now() + Math.random(),
          title: N.progresoDeEquipo,
          message: `${p.display_name || p.user} » ${p.status}`,
          tone: 'success',
        })
        vibrate([10, 30, 10])
      }
      prevStatuses[p.user] = p.status || ''
    })

    setTeamProfiles(profiles)
  }

  const aplicarEquipoRef = useRef(aplicarEquipo)
  aplicarEquipoRef.current = aplicarEquipo

  // Última posición conocida para el latido, sin recrear el temporizador.
  const heartbeatPositionRef = useRef<{ lat: number; lon: number } | null>(null)
  const heartbeatSourceRef = useRef<string>('player')
  // Precisión del fix, en metros. Sólo tiene sentido con GPS real: el modo
  // de depuración pone la posición a mano, no hay "ruido" que medir.
  const gpsAccRef = useRef<number | undefined>(undefined)
  heartbeatPositionRef.current = localDebugPosition || (browserGpsFresh ? browserGpsPosition : null)
  // 'manual' marca explícitamente que esta posición se puso a mano (modo
  // prueba/debug), NUNCA GPS real: el servidor la excluye de la
  // comprobación de velocidad y la anota como nota neutra, no sospecha (ver
  // backend/app/runtime/anti_cheat.py, MANUAL_POSITION_SOURCE).
  heartbeatSourceRef.current = localDebugPosition
    ? 'manual'
    : browserGpsPosition
      ? 'browser_gps'
      : 'player'
  gpsAccRef.current =
    !localDebugPosition && browserGpsFresh ? (browserGpsAccuracy ?? undefined) : undefined

  // La evidencia de cada nodo lleva las últimas posiciones (ver
  // avance/evidencia.ts): se le dice cómo leer la de ahora mismo.
  useEffect(() => {
    registrarProveedorDePosicion(() => {
      const posicion = heartbeatPositionRef.current
      if (!posicion) return null
      return {
        lat: posicion.lat,
        lon: posicion.lon,
        acc: gpsAccRef.current,
        src: heartbeatSourceRef.current === 'manual' ? 'manual' : 'real',
      }
    })
    return () => registrarProveedorDePosicion(null)
  }, [])

  useEffect(() => {
    if (status !== 'ready') return

    let intervalId: number | null = null

    let latidosSinRed = 0
    let ultimaDiferencia = ''
    async function publishHeartbeat() {
      /**
       * Con la pantalla apagada no se late.
       *
       * En una ruta de tres horas el móvil pasa la mayor parte del tiempo en el
       * bolsillo. El navegador ya frena los temporizadores de fondo, pero no
       * siempre ni en todos: decirlo aquí quita peticiones que no sirven para
       * nada, porque nadie está mirando el mapa. Al volver a la pantalla se
       * manda una enseguida.
       */
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      // 25/10 (auditoría, batería): sin cobertura reciente se intenta uno de cada cuatro latidos; los otros sólo
      // apuntan la posición en el móvil (sube en bloque al volver la red). Con una barra intermitente la radio
      // pasaba casi siempre despierta reintentando cada 30 s.
      latidosSinRed = sinCoberturaAhora() ? latidosSinRed + 1 : 0
      if (latidosSinRed % 4 !== 0) {
        if (!payloadRef.current?.finished) apuntarPosicionSinRed(user, anotarMuestraGps(false))
        return
      }

      try {
        /**
         * Con la mision terminada NO se manda donde esta la gente.
         *
         * Medido sobre la mision real: de 14 posiciones guardadas, 9 estaban a
         * mas de 3 km de la ruta -hasta 70 km-, y una de hacia poco mas de un
         * dia, con la ruta jugada una semana antes. No eran posiciones de
         * juego: eran casas y trabajos, de gente que abrio la aplicacion para
         * mirar la clasificacion.
         *
         * El latido sigue yendo, porque es lo que trae la tabla del grupo. Lo
         * que deja de ir son las coordenadas. Contra los datos de personas lo
         * que protege de verdad no es el permiso firmado, sino no tener lo que
         * no hace falta.
         */
        const misionRematada = Boolean(payloadRef.current?.finished)
        const effectivePosition = misionRematada ? null : heartbeatPositionRef.current

        // Una muestra por latido, llegue o no: es el rastro que va en la
        // evidencia de los nodos y el que se sube si no hay cobertura.
        if (!misionRematada) anotarMuestraGps(true)

        const respuesta = await sendHeartbeat({
          user,
          ...(effectivePosition
            ? {
                lat: effectivePosition.lat,
                lon: effectivePosition.lon,
                accuracy: gpsAccRef.current,
                heading: rumboParaLatido(performance.now()),
                gps_status: 'ok',
              }
            : {
                gps_status: 'unavailable',
              }),
          source: heartbeatSourceRef.current,
          // Que traiga de vuelta dónde va el resto del grupo.
          equipo: true,
        })

        const profiles = respuesta?.team?.profiles
        if (Array.isArray(profiles)) {
          aplicarEquipoRef.current(profiles)
        }

        // Volvió la red: lo apuntado sin cobertura pasa a la cola de eventos.
        void volcarRastro(user)
        // La radio ya está despierta: la caja negra sube ahora si le toca, no por su cuenta (revisión 19/10).
        trasLatidoBueno()

        // El latido ya trae el nivel real del servidor (ver /api/heartbeat,
        // live_status.level): si no coincide con lo que se está pintando, o
        // si la misión acaba de terminar, el refresco pesado de 214 KB pasa
        // a ser urgente en vez de esperar a la red de seguridad de 90 s.
        const liveStatus = respuesta?.live_status
        const nivelServidor = Number(liveStatus?.level)
        const remataServidor = Boolean(liveStatus?.finished)
        const nivelPintado = Number(payloadRef.current?.level || 0)
        const remataPintado = Boolean(payloadRef.current?.finished)
        // 25/10 (auditoría): sólo si el servidor va POR DELANTE o si la diferencia cambió. Con el móvil por delante
        // para siempre (un avance de la cola rechazado), cada latido pedía la partida entera: cada 30 s en vez de 10 min.
        const diferencia = Number.isFinite(nivelServidor)
          ? `${nivelServidor - nivelPintado}/${remataServidor}/${remataPintado}`
          : ''
        if (
          Number.isFinite(nivelServidor) &&
          (nivelServidor > nivelPintado ||
            (remataServidor && !remataPintado) ||
            ((nivelServidor !== nivelPintado || remataServidor !== remataPintado) &&
              diferencia !== ultimaDiferencia))
        ) {
          heavyRefreshDueRef.current = true
        }
        ultimaDiferencia = diferencia
        // Y si la misión cambió en el panel (nodos, fotos, mapa): la huella llega en el mismo latido.
        const revisionServidor = respuesta?.mission_revision
        if (revisionServidor && revisionServidor !== payloadRef.current?.mission_revision) {
          heavyRefreshDueRef.current = true
        }
      } catch {
        // Sin cobertura el latido no llega, pero la posición no se pierde: se
        // guarda y se sube en bloque, con su hora, al volver la red.
        if (!payloadRef.current?.finished) apuntarPosicionSinRed(user, anotarMuestraGps(false))

        // Sin cobertura se pinta el último equipo conocido en vez de vaciar la
        // pantalla: los compañeros siguen donde estaban, que es más útil que
        // un mapa en blanco.
        const guardado = getCachedTeamProfiles(user)
        if (guardado.profiles.length) aplicarEquipoRef.current(guardado.profiles, true)
      }
    }

    publishHeartbeat()
    // Con poca cobertura o el ahorro de datos del móvil puesto, la mitad de latidos (16/10).
    intervalId = window.setInterval(publishHeartbeat, conexionAhorradora() ? 60000 : 30000)

    // Volver a la aplicación tiene que refrescar el mapa del grupo al momento,
    // no esperar al siguiente ciclo.
    // Al guardar el móvil, el rastro sin red que esperaba en memoria pasa a la cola guardada: si el sistema congela o
    // mata la pestaña en el bolsillo, se perdían hasta 4 muestras (revisión 19/10).
    const alVolver = () => {
      if (document.visibilityState === 'visible') void publishHeartbeat()
      else void volcarRastro(user)
    }
    const alSalir = () => void volcarRastro(user)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('pagehide', alSalir)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('pagehide', alSalir)
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
    // OJO con las dependencias: antes entraban aquí la posición y el estado del
    // GPS, así que el efecto se recreaba con CADA lectura del GPS y cada
    // recreación disparaba un latido inmediato. Resultado medido: ~1 petición
    // por segundo y el 60% devolviendo 429 del propio limitador. La posición se
    // lee ahora de un ref, así que el temporizador de 5 s no se reinicia nunca.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mismas dependencias que en PlayerApp (refs y setters estables)
  }, [user, status])
}

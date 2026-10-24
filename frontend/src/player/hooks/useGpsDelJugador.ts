import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { PlayerGpsStatus } from '../../types/player'
import { gpsEnLaCaja } from '../registro/bitacora'
import { usePlayerStore } from '../store/usePlayerStore'
import { getDistanceMeters } from '../utils/geo'
import {
  hasRememberedGpsReady,
  readStoredGpsPosition,
  rememberGpsPosition,
  rememberGpsReady,
} from '../utils/gpsStorage'
import { NOTICES, type FocusRequest, type NoticeTone } from '../playerAppBase'

type Punto = { lat: number; lon: number }

/**
 * El GPS del jugador: el `watchPosition`, sus tres modos (preciso, barato y por
 * red), el arranque al abrir la app y cuándo una posición deja de ser fresca.
 *
 * Salido de `PlayerApp.tsx` (auditoría 23/10) tal cual, sin cambiar lo que
 * hace. Lo que lee el resto de la pantalla —la posición, la precisión, si es
 * fresca— sigue en el store (`usePlayerStore`), y se devuelve desde aquí con
 * sus setters, igual que antes se leía allí.
 *
 * ⚠️ Es un hook más: se llama arriba, con los demás, y nunca detrás de un
 * `return` temprano (error 310 de React, ya visto en producción).
 */
export function useGpsDelJugador({
  user,
  localDebugEnabled,
  setLocalDebugEnabled,
  setLocalDebugPosition,
  followPlayerRef,
  setFocusRequest,
  setFollowPlayer,
  setOfflinePrepVisible,
  showNotice,
  N,
}: {
  user: string
  localDebugEnabled: boolean
  setLocalDebugEnabled: Dispatch<SetStateAction<boolean>>
  setLocalDebugPosition: Dispatch<SetStateAction<Punto | null>>
  followPlayerRef: MutableRefObject<boolean>
  setFocusRequest: Dispatch<SetStateAction<FocusRequest>>
  setFollowPlayer: (val: boolean | ((curr: boolean) => boolean)) => void
  setOfflinePrepVisible: (visible: boolean) => void
  showNotice: (message: string, tone: NoticeTone) => void
  N: (typeof NOTICES)[keyof typeof NOTICES]
}) {
  const browserGpsPosition = usePlayerStore((s) => s.gpsPosition)
  const setBrowserGpsPosition = usePlayerStore((s) => s.setGpsPosition)
  const browserGpsStatus = usePlayerStore((s) => s.gpsStatus)
  const setBrowserGpsStatus = usePlayerStore((s) => s.setGpsStatus)
  const browserGpsStatusRef = useRef<PlayerGpsStatus>(browserGpsStatus)
  useEffect(() => {
    browserGpsStatusRef.current = browserGpsStatus
  }, [browserGpsStatus])
  const browserGpsFresh = usePlayerStore((s) => s.gpsFresh)
  const setBrowserGpsFresh = usePlayerStore((s) => s.setGpsFresh)
  const browserGpsAccuracy = usePlayerStore((s) => s.gpsAccuracy)
  const setBrowserGpsAccuracy = usePlayerStore((s) => s.setGpsAccuracy)
  const browserGpsCapturedAt = usePlayerStore((s) => s.gpsCapturedAt)
  const setBrowserGpsCapturedAt = usePlayerStore((s) => s.setGpsCapturedAt)

  const gpsWatchRef = useRef<number | null>(null)
  const gpsCenteredRef = useRef(false)
  const gpsNoticeShownRef = useRef(false)

  /**
   * De precisión (chip GPS) a por red, y vuelta, según lo que responda.
   *
   * En el monte, bajo árboles o entre paredes de piedra, el chip GPS puede
   * no conseguir un fix NUNCA -no es lento, no llega-, mientras que la
   * ubicación por red (wifi/antena, mucho menos precisa) sí suele
   * responder. Antes `enableHighAccuracy: true` era la única vía: un
   * TIMEOUT (código 3) se trataba siempre como "sigue buscando", nunca
   * como "prueba otra cosa". El síntoma real reportado: varios jugadores
   * con el permiso YA concedido y sin ubicación en toda la ruta, en zona
   * de monte cerrado.
   */
  const gpsTimeoutsSeguidosRef = useRef(0)
  /**
   * 'barato' = sin precisión porque el nodo queda lejos (elegido, no fallo); 'por_red' = el preciso falló.
   * Revisión 19/10 de batería: antes los dos eran 'por_red' y el intervalo de 90 s relanzaba el GPS de
   * precisión cada minuto y medio durante todo el camino lejos de los nodos.
   */
  const gpsModoRef = useRef<'preciso' | 'barato' | 'por_red'>('preciso')
  /** Último fix publicado al estado (revisión 19/10 de batería: no se re-renderiza la app por cada fix). */
  const ultimoFixPublicadoRef = useRef<{
    lat: number
    lon: number
    precision: number | null
    t: number
  } | null>(null)
  const gpsAvisoModoRef = useRef(false)

  /**
   * Batería: el chip GPS de precisión (`enableHighAccuracy: true`) en
   * `watchPosition` continuo es lo que más consume, con diferencia, de
   * toda la app. La mayor parte de una ruta se anda LEJOS de cualquier
   * nodo -no hace falta precisión de satélite para saber que quedan 800m,
   * solo hace falta saberlo, no acertar el metro-. Solo al acercarse de
   * verdad (radio de nodo típico: 50m, aquí 250m de margen) hace falta la
   * precisión que sí gasta batería. `null` -sin nodo o sin fix todavía- se
   * trata como "lejos": mejor arrancar en modo barato y subir a preciso en
   * cuanto haya un primer punto de referencia, que arrancar gastando de más
   * sin necesidad.
   */
  const DISTANCIA_MODO_PRECISO_M = 250
  const distanciaAlNodoRef = useRef<number | null>(null)
  const handleRequestLiveGpsRef = useRef<
    ((options?: { silent?: boolean; forceFocus?: boolean }) => Promise<void>) | null
  >(null)

  /**
   * Cada 90s, en los dos sentidos -sube a preciso si está cerca y en modo
   * barato, baja a barato si está lejos y en modo preciso-. Los dos casos
   * leen refs (`gpsModoRef`, `distanciaAlNodoRef`), nunca una const del
   * render: por eso este efecto puede vivir aquí, antes de cualquier
   * "return" temprano, sin depender de que el componente ya esté 'ready'.
   *
   * Subir: si se cayó a ubicación por red, probar de vez en cuando si el
   * GPS de precisión ya responde -el jugador puede haber salido del monte
   * cerrado desde entonces-. `handleRequestLiveGps` ya limpia el watch
   * actual y arranca uno de precisión desde cero cada vez que se llama.
   *
   * Bajar: ahorra batería de forma activa, no sólo como reacción a un
   * fallo. 400m de margen -no los mismos 250 de subir- para no oscilar de
   * modo cerca del borde, y para no pelearse con un fallback a por_red por
   * fallo real cerca de un nodo con cobertura mala.
   */
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      const distancia = distanciaAlNodoRef.current
      // Por fallo, se reintenta siempre; en barato (lejos a propósito), si ya está cerca, no se sabe, o la ubicación
      // barata NO está funcionando (posición de más de 100 m de error o sin llegar hace un minuto). Esto último es el
      // monte en modo avión: sin wifi ni antena la ubicación barata puede no dar nada, y sin una lectura precisa de vez
      // en cuando el móvil nunca sabría que se acerca al nodo (revisión 19/10: el ahorro de batería no puede dejar a
      // nadie sin poder abrir un nodo).
      const fix = ultimoFixPublicadoRef.current
      const baratoNoVale = !fix || Date.now() - fix.t > 60_000 || (fix.precision ?? Infinity) > 100
      if (
        gpsModoRef.current === 'por_red' ||
        (gpsModoRef.current === 'barato' &&
          (distancia === null || distancia <= DISTANCIA_MODO_PRECISO_M || baratoNoVale))
      ) {
        void handleRequestLiveGpsRef.current?.({ silent: true })
        return
      }
      if (gpsModoRef.current === 'preciso' && distancia !== null && distancia > 400) {
        void handleRequestLiveGpsRef.current?.({ silent: true })
      }
    }, 90000)
    return () => window.clearInterval(intervalo)
  }, [])

  useEffect(() => {
    const storedGps = readStoredGpsPosition(user)
    if (storedGps) {
      setBrowserGpsPosition(storedGps)
      setBrowserGpsStatus('stale')
      setBrowserGpsFresh(false)
      setBrowserGpsAccuracy(typeof storedGps.accuracy === 'number' ? storedGps.accuracy : null)
      setBrowserGpsCapturedAt(null)
      // La ubicación almacenada sirve como respaldo,
      // pero nunca debe centrar el mapa al arrancar.
      setFollowPlayer(true)
      gpsCenteredRef.current = false
    }

    if (hasRememberedGpsReady(user)) {
      setOfflinePrepVisible(false)
    }

    /**
     * Arranque del GPS al abrir la app.
     *
     * Antes se lanzaba a ciegas 300 ms después de montar, en silencio. Si el
     * navegador no lo concedía en ese momento —lo normal cuando el permiso está
     * en "preguntar", porque muchos navegadores sólo enseñan el aviso si lo pide
     * un toque del jugador— fallaba sin decir nada: se entraba al juego sin
     * flecha y sin líneas, y sólo aparecía al ir a Herramientas y darle a
     * Activar GPS, que sí es un toque.
     *
     * Ahora se mira primero si el permiso YA está concedido. Si lo está, se
     * arranca solo y no hay aviso ninguno. Si no, se deja la pantalla de
     * preparación a la vista para que el jugador lo conceda con un toque.
     */
    let cancelado = false

    async function arrancarUbicacion() {
      const permisos = navigator.permissions
      if (!permisos?.query) {
        // Sin forma de consultar: se intenta igual, como hasta ahora.
        window.setTimeout(() => {
          if (!cancelado) void handleRequestLiveGps({ silent: true, forceFocus: true })
        }, 300)
        return
      }

      try {
        const estado = await permisos.query({ name: 'geolocation' as PermissionName })
        if (cancelado) return

        if (estado.state === 'granted') {
          void handleRequestLiveGps({ silent: true, forceFocus: true })
        } else {
          // Hace falta un toque: que se vea el botón en vez de fallar callando.
          setOfflinePrepVisible(true)
        }

        estado.addEventListener?.('change', () => {
          if (!cancelado && estado.state === 'granted') {
            void handleRequestLiveGps({ silent: true, forceFocus: true })
          }
        })
      } catch {
        window.setTimeout(() => {
          if (!cancelado) void handleRequestLiveGps({ silent: true, forceFocus: true })
        }, 300)
      }
    }

    void arrancarUbicacion()

    return () => {
      cancelado = true
    }
  }, [user])

  useEffect(() => {
    if (!browserGpsFresh || browserGpsCapturedAt === null) {
      return
    }

    const ageMs = Math.max(0, Date.now() - browserGpsCapturedAt)

    const remainingMs = Math.max(1000, 45000 - ageMs)

    const timeoutId = window.setTimeout(() => {
      setBrowserGpsFresh(false)
      setBrowserGpsStatus('stale')
    }, remainingMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [browserGpsFresh, browserGpsCapturedAt])

  async function handleRequestLiveGps(
    options: { silent?: boolean; forceFocus?: boolean; exitingDebug?: boolean } = {}
  ) {
    if (typeof window === 'undefined' || !window.navigator.geolocation) {
      setBrowserGpsStatus('unavailable')
      if (!options.silent) showNotice(N.gpsNoDisponibleDispositivo, 'warn')
      return
    }

    if (!window.isSecureContext) {
      setBrowserGpsStatus('error')
      setBrowserGpsFresh(false)
      if (!options.silent) showNotice(N.gpsRequiereHttps, 'warn')
      return
    }

    if (localDebugEnabled && !options.exitingDebug) {
      return
    }

    // Reactivar GPS debe crear un watch nuevo, no reutilizar uno bloqueado.
    if (gpsWatchRef.current !== null) {
      window.navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }

    setLocalDebugEnabled(false)
    setLocalDebugPosition(null)

    if (browserGpsStatusRef.current !== 'ready') {
      setBrowserGpsStatus('searching')
      setBrowserGpsFresh(false)
      setBrowserGpsCapturedAt(null)
    }

    if (!options.silent) showNotice(N.solicitandoPermisoUbicacion, 'info')

    // function, no const con flecha: onSuccess, cambiarAModoPorRed y onError
    // se referencian entre sí -cambiarAModoPorRed llama a onError dentro de
    // watchPosition, onError llama a cambiarAModoPorRed-. Con `const` eso
    // seguía dando en producción "Cannot access 'X' before initialization"
    // en CADA actualización de posición -reproducido y comprobado que
    // persistía tanto con esbuild como con terser, dos minificadores
    // distintos: no era cosa de uno en concreto, era este cruce en sí-. Una
    // `function` está izada entera (nombre Y cuerpo) en todo el ámbito, así
    // que el orden en que se escriban ya no puede importarle a nada.
    function onSuccess(position: GeolocationPosition) {
      if (localDebugEnabled) {
        return
      }

      // Un fix -en el modo que sea- demuestra que la vía actual funciona.
      gpsTimeoutsSeguidosRef.current = 0
      gpsEnLaCaja(true)

      const next = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      }

      const nextAccuracy =
        typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
          ? Math.max(0, position.coords.accuracy)
          : null

      const capturedAt =
        typeof position.timestamp === 'number' && Number.isFinite(position.timestamp)
          ? position.timestamp
          : Date.now()

      /**
       * Revisión 19/10 de batería: cada fix (1 por segundo andando) re-renderizaba PlayerApp entero. Se
       * publica sólo si te has movido 2 m, la precisión cambió más de un 25 %, pasaron 10 s o el GPS no
       * estaba «listo». Los umbrales de frescura (45 s) y de abrir nodo (3 min) quedan muy por encima.
       */
      const previo = ultimoFixPublicadoRef.current
      const ahoraFix = Date.now()
      const publicar =
        previo === null ||
        browserGpsStatusRef.current !== 'ready' ||
        ahoraFix - previo.t >= 10_000 ||
        getDistanceMeters(previo, next) >= 2 ||
        (previo.precision === null) !== (nextAccuracy === null) ||
        (previo.precision !== null &&
          nextAccuracy !== null &&
          Math.abs(nextAccuracy - previo.precision) > 0.25 * Math.max(previo.precision, 1))
      setBrowserGpsStatus('ready')
      setBrowserGpsFresh(true)
      if (publicar) {
        ultimoFixPublicadoRef.current = { ...next, precision: nextAccuracy, t: ahoraFix }
        setBrowserGpsPosition(next)
        setBrowserGpsAccuracy(nextAccuracy)
        setBrowserGpsCapturedAt(capturedAt)
        rememberGpsPosition(user, next, {
          accuracy: nextAccuracy ?? undefined,
          capturedAt,
        })
      }
      rememberGpsReady(user)
      // El cierre del panel "misión offline lista" al conseguir GPS vive en
      // un efecto aparte (más abajo, sobre browserGpsFresh) y no aquí
      // dentro. Aquí dentro -en el propio callback del navegador- cualquier
      // variable adicional de fuera de handleRequestLiveGps, sea const o
      // ref, disparaba en producción "Cannot access 'X' before
      // initialization" en cada actualización de posición -reproducido de
      // forma determinista con Playwright/CDP, persistente cambiando el
      // nombre, el tipo de declaración Y el minificador (esbuild y
      // terser)-. Sea cual sea la causa exacta, la forma robusta de
      // evitarlo es no depender de nada ahí dentro que no sea del propio
      // handleRequestLiveGps: dejar que React reaccione al cambio de
      // estado, no leerlo a mano en un callback nativo del navegador.
      setLocalDebugEnabled(false)
      setLocalDebugPosition(null)

      if (options?.forceFocus && followPlayerRef.current) {
        gpsCenteredRef.current = true
        setFocusRequest({
          target: 'player',
          token: Date.now(),
        })
      }

      // Debouncing: el latido ('ok') se acumulará en heartbeatPositionRef
      // y se enviará agrupado cada 30 segundos mediante publishHeartbeat(),
      // ahorrando batería al no despertar la antena de red en cada paso.

      if (!options.silent && !gpsNoticeShownRef.current) {
        gpsNoticeShownRef.current = true
        showNotice(N.gpsRealActivado, 'success')
      }
    }

    // Bajar de precisión: el chip GPS pide fix de satélite, que bajo monte
    // cerrado o entre paredes de piedra puede no llegar NUNCA -no es que
    // tarde-. La ubicación por red (wifi/antena) es mucho menos precisa
    // -puede que no baste para entrar en un radio de 50m-, pero suele
    // responder donde el chip no lo hace, y es mejor tener un punto
    // aproximado que ninguno.
    function cambiarAModoPorRed() {
      if (gpsModoRef.current === 'por_red') return
      gpsModoRef.current = 'por_red'

      if (gpsWatchRef.current !== null) {
        window.navigator.geolocation.clearWatch(gpsWatchRef.current)
      }
      gpsWatchRef.current = window.navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: false,
        maximumAge: 15000,
        timeout: 20000,
      })

      if (!gpsAvisoModoRef.current) {
        gpsAvisoModoRef.current = true
        showNotice(N.gpsPrecisoNoResponde, 'info')
      }
    }

    function onError(error: GeolocationPositionError) {
      // TIMEOUT (code 3) while watching means the hardware GPS is still acquiring signal
      // (e.g. airplane mode with GPS chip active, or first cold fix outdoors).
      // Keep 'searching' so the UI shows "Buscando señal…" instead of a hard error.
      const isTimeout = error.code === 3 // GeolocationPositionError.TIMEOUT
      const sinSenal = error.code === error.POSITION_UNAVAILABLE
      const denied = error.code === error.PERMISSION_DENIED
      // A la caja negra sólo la caída de verdad (un timeout suelto es el chip buscando), una vez hasta que vuelva.
      if (denied || sinSenal) gpsEnLaCaja(false, error.code)

      // Ni denegado ni un timeout puntual: el chip -o el navegador- ya ha
      // tirado la toalla en modo preciso. Cada fallo de este tipo cuenta;
      // dos seguidos (o el equivalente en tiempo con TIMEOUT) y se cambia
      // a ubicación por red en vez de seguir insistiendo con lo mismo.
      if ((isTimeout || sinSenal) && gpsModoRef.current === 'preciso') {
        gpsTimeoutsSeguidosRef.current += 1
        if (gpsTimeoutsSeguidosRef.current >= 2) {
          cambiarAModoPorRed()
          return
        }
      }

      if (isTimeout) {
        // GPS hardware still working - don't flag as error
        if (browserGpsStatusRef.current !== 'ready') {
          setBrowserGpsStatus('searching')
        }
        // Don't show any notice for silent timeout retries
        return
      }

      // sinSenal en modo por_red: ni el chip ni la red han dado nada. Esto
      // sí es un error de verdad, no una vía que probar aparte -ya se probó-.
      setBrowserGpsStatus('error')
      setBrowserGpsFresh(false)
      if (!options.silent) {
        showNotice(denied ? N.permisoUbicacionDenegado : N.noSePudoObtenerUbicacion, 'warn')
      }
    }

    // getCurrentPosition: short timeout is fine for a quick first-fix attempt.
    // Siempre con satélite: es UNA lectura (lo que gasta es el seguimiento continuo, que lejos va en barato) y es la
    // que garantiza una posición de verdad sin wifi ni antena (revisión 19/10).
    window.navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    })

    if (gpsWatchRef.current === null) {
      // Lejos del nodo (o todavía sin ningún punto de referencia): arrancar
      // ya en modo barato ahorra batería desde el primer segundo, no solo
      // tras fallar en preciso. Cerca, al revés: preciso desde ya, porque
      // ahí sí hace falta acertar el radio del nodo.
      const lejos =
        distanciaAlNodoRef.current === null || distanciaAlNodoRef.current > DISTANCIA_MODO_PRECISO_M
      // 'barato', no 'por_red': lejos es una elección, no un fallo (ver el intervalo de 90 s).
      gpsModoRef.current = lejos ? 'barato' : 'preciso'
      gpsTimeoutsSeguidosRef.current = 0
      // watchPosition: long timeout so the GPS chip can finish a cold fix
      // even in airplane mode (GPS satellite signal is independent of cellular/wifi)
      gpsWatchRef.current = window.navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: !lejos,
        maximumAge: lejos ? 15000 : 5000,
        timeout: 20000,
      })
    }
  }

  handleRequestLiveGpsRef.current = handleRequestLiveGps

  return {
    browserGpsPosition,
    setBrowserGpsPosition,
    browserGpsStatus,
    setBrowserGpsStatus,
    browserGpsFresh,
    setBrowserGpsFresh,
    browserGpsAccuracy,
    setBrowserGpsAccuracy,
    browserGpsCapturedAt,
    setBrowserGpsCapturedAt,
    gpsWatchRef,
    gpsCenteredRef,
    distanciaAlNodoRef,
    handleRequestLiveGpsRef,
    handleRequestLiveGps,
  }
}

import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import type { PlayerStage } from '../../types/player'
import { FamilyRuntimeHost, precargarJuego, resolveStageMinigame } from '../minigames/core'
import { useTextos } from '../minigames/core/useTextos'
import { renderMarkdown } from '../utils/formatMarkdown'
import { abrirNodo, tiempoDelNodo } from '../nodeClock'
import { PENALIZACION_POR_SALIDA_MS, useAntiTrampas } from '../hooks/useAntiTrampas'
import { useCubreElMapa } from '../hooks/useCubreElMapa'
import { usePrefiereMenosMovimiento, usePresencia, useValorCongelado } from '../ui/movimiento'
import { SinRetoContext } from '../hooks/useSinRetoEnPantalla'
import { useWakeLock } from '../hooks/useWakeLock'
import { queuePhysicalEvent } from '../offline/physicalEvents'

interface InteractionSheetProps {
  open: boolean
  user: string
  currentStage: PlayerStage | null
  helperText: string
  submitting: boolean
  onClose: () => void
  onSubmitCode: (
    code: string,
    timeSpentMs?: number,
    penaltyMs?: number,
    aMano?: boolean
  ) => Promise<boolean>
  /** Posición que ya conoce la app, para no abrir un segundo GPS. */
  appPosition?: { lat: number; lon: number } | null
  /** Precisión (m) de esa posición, para descontar el mismo margen que el mapa. */
  appAccuracy?: number | null
  onShowHistory?: () => void
  totalTimeMs?: number
}

function vibrate(pattern: number | number[]) {
  if (typeof window === 'undefined') return
  if (!('navigator' in window)) return
  if (typeof window.navigator.vibrate !== 'function') return
  window.navigator.vibrate(pattern)
}

function isMotionStage(stage: PlayerStage | null) {
  if (!stage) return false
  const config = stage.config && typeof stage.config === 'object' ? stage.config : {}
  const runtimeConfig =
    stage.minigame?.config && typeof stage.minigame.config === 'object' ? stage.minigame.config : {}
  const gameId = String(
    (config as Record<string, unknown>).game_id ||
      (runtimeConfig as Record<string, unknown>).game_id ||
      ''
  )
  return (
    stage.minigame?.type === 'motion_challenge' ||
    stage.type === 'motion_challenge' ||
    gameId === 'shake_charge'
  )
}

function isQrCameraStage(stage: PlayerStage | null) {
  if (!stage) return false
  const s = stage as any
  return Boolean(s.qr_payload || s.physical_qr)
}

function isStageCollectible(stage: PlayerStage | null) {
  if (!stage) return false
  const s = stage as any
  const flatKind = s.physical_node_kind || s.physical_item_kind
  if (flatKind === 'collectible') return true
  const physicalQr = s.physical_qr
  if (physicalQr && typeof physicalQr === 'object') {
    return (physicalQr as Record<string, unknown>).kind === 'collectible'
  }
  const config = s.config && typeof s.config === 'object' ? s.config : {}
  if (config.is_map_collectible || s.is_map_collectible) return true
  return false
}

function getCompactLine(stage: PlayerStage | null) {
  if (isMotionStage(stage)) return ''

  const hint = String(stage?.messages?.hint || '').trim()
  if (hint) return hint

  const text = String(stage?.content || '').trim()
  if (!text) return ''
  if (text.toUpperCase() === 'PUT NODE TEXT HERE') return ''
  return text
}

export function InteractionSheet({
  open,
  user,
  currentStage: currentStageProp,
  helperText,
  submitting,
  onClose,
  onSubmitCode,
  appPosition = null,
  appAccuracy = null,
  onShowHistory,
  totalTimeMs = 0,
}: InteractionSheetProps) {
  const t = useTextos()
  const [dragOffset, setDragOffset] = useState(0)

  /**
   * Abrir y cerrar se ven, como en las demas hojas.
   *
   * Antes `if (!open) return null`: al cerrar la hoja desaparecia en seco y al
   * abrir entraba con una `animation` de CSS que peleaba con la `transform` del
   * arrastre. Ahora se queda montada mientras se va (`usePresencia`) y el
   * nodo se CONGELA durante la salida: al superar un nodo el padre cierra la
   * hoja y cambia `currentStage` en el mismo instante, y sin congelarlo el
   * juego nuevo se montaba dentro de una hoja que se estaba yendo.
   */
  const reducido = usePrefiereMenosMovimiento()
  const presencia = usePresencia(open && Boolean(currentStageProp))
  const currentStage = useValorCongelado(currentStageProp, open)

  /**
   * La pantalla no se apaga mientras la hoja está abierta.
   *
   * Sin esto el móvil se autobloqueaba a los 30 s sin tocarlo -el laberinto se
   * juega inclinando el móvil, no tocándolo-, y la página oculta se leía como
   * «se fue a mirar otra app». El mapa pide lo mismo mientras se ve (ver
   * MapSurfaceGL); el gestor lleva la cuenta y suelta cuando ninguno lo pide.
   */
  useWakeLock(open)

  /** El mapa no late mientras esta hoja lo tapa: es trabajo tirado (ver useCubreElMapa). */
  useCubreElMapa(open)

  /**
   * El juego declara cuándo no hay un reto delante (reglas, «has ganado»,
   * «has fallado»): ahí salir de la app no es hacer trampa.
   */
  const [sinReto, setSinReto] = useState(false)

  const touchStartYRef = useRef<number | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const dragEnabledRef = useRef(false)

  const stageId = currentStage?.id ?? null
  const stageType = currentStage?.minigame?.type ?? currentStage?.type ?? null

  const resolvedStageMinigame = resolveStageMinigame(currentStage)
  const resolvedRuntime = resolvedStageMinigame?.resolved ?? null

  /**
   * Juegos que avisan ellos mismos de cuando empiezan.
   *
   * Son los que tienen pantalla de explicacion con un boton: hasta que no se
   * pulsa, el reloj no debe correr. Los demas no avisan, asi que su reloj
   * arranca al abrir la hoja, como siempre.
   *
   * Esta lista importa: si un juego no esta aqui y tampoco avisa, su reloj no
   * arrancaria nunca y el nodo contaria CERO sin dar ningun error. Ya ha pasado
   * en este proyecto que un cero en pantalla fuese en realidad algo que no se
   * guardo.
   */
  const XOGOS_QUE_AVISAN = ['tilt_maze', 'spark_radar', 'logic_circuit', 'place_mosaic']
  const xogoAvisaElMesmo = XOGOS_QUE_AVISAN.includes(
    String((resolvedRuntime?.config as { game_id?: unknown } | undefined)?.game_id || '')
  )
  const shouldRenderFamilyRuntime = Boolean(
    resolvedRuntime && resolvedRuntime.compatibility === 'native'
  )

  // Cualquier minijuego ya contiene su propio título,
  // instrucciones, estado y botones. El contenedor exterior
  // no debe repetir esa información.
  const compactGameMode = shouldRenderFamilyRuntime

  const compactLine = getCompactLine(currentStage)

  /**
   * El paquete del juego se baja en cuanto se sabe cual es el nodo, no al
   * abrir la hoja: asi, al abrirla, el juego entra sin pasar por el esqueleto.
   * En un rato libre del navegador, para no competir con el mapa.
   */
  useEffect(() => {
    if (!shouldRenderFamilyRuntime || !resolvedRuntime) return undefined
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opciones?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const llamar = () => precargarJuego(resolvedRuntime)
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(llamar, { timeout: 4000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(llamar, 1500)
    return () => window.clearTimeout(id)
    // Solo cuando cambia el nodo: `resolvedRuntime` se recalcula en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, shouldRenderFamilyRuntime])

  /**
   * Salir de la aplicación en medio de un reto tiene consecuencia.
   *
   * Sólo se vigila mientras hay un minijuego delante Y la hoja está abierta: en
   * un coleccionable o en un nodo de cámara no hay nada que memorizar fuera, y
   * penalizar por mirar el mapa sería castigar el uso normal.
   *
   * `open` es imprescindible. Faltaba, y este componente está montado siempre
   * (con la hoja cerrada devuelve null, pero sus hooks siguen vivos): cada vez
   * que el jugador bloqueaba el móvil o miraba otra app CAMINANDO hacia un nodo
   * con minijuego, se anotaban +30 s y una «sospecha de trampa» sin que hubiera
   * ningún reto delante. Ver también salidasDeLaApp.ts (autobloqueo) y
   * useSinRetoEnPantalla.ts (pantalla de reglas y de resultado).
   */
  const antiTrampas = useAntiTrampas(
    open && shouldRenderFamilyRuntime && !isStageCollectible(currentStage),
    String(stageId ?? ''),
    sinReto
  )

  /**
   * Cada salida detectada por `useAntiTrampas` viaja al servidor.
   *
   * Va por la misma cola offline-first que un escaneo QR o un código manual
   * (`queuePhysicalEvent`), no por un endpoint aparte: así funciona igual sin
   * cobertura, y el servidor la anota como sospecha de trampa (ver
   * `apply_synced_player_event` en main.py) con la razón, el nodo y el
   * minijuego, para que salga en el panel de administración.
   *
   * `eventosReportadosRef` sólo avanza, nunca retrocede: si `antiTrampas`
   * reinicia su lista al cambiar de nodo, este contador se reinicia con ella
   * más abajo -no antes de leer los que quedaban sin reportar de ESTE nodo-.
   */
  const eventosReportadosRef = useRef(0)
  useEffect(() => {
    eventosReportadosRef.current = 0
  }, [stageId])

  useEffect(() => {
    const nuevos = antiTrampas.eventos.slice(eventosReportadosRef.current)
    eventosReportadosRef.current = antiTrampas.eventos.length
    if (!nuevos.length) return

    const gameId = String(
      (resolvedRuntime?.config as { game_id?: unknown } | undefined)?.game_id || stageType || ''
    )

    for (const evento of nuevos) {
      void queuePhysicalEvent({
        user,
        source: 'manual',
        node_id: String(currentStage?.id ?? ''),
        payload: {
          anti_cheat_reason:
            evento.motivo === 'selector_apps'
              ? 'opened_app_switcher_during_minigame'
              : 'left_app_during_minigame',
          game_id: gameId,
          stage_title: currentStage?.title || '',
        },
      }).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antiTrampas.eventos])

  const [activeMs, setActiveMs] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  /** Candado de avance: impide completar el mismo nodo dos veces. */
  const winLockRef = useRef(false)
  /**
   * El último intento de completar el nodo no se aceptó.
   *
   * Con él se ofrece «Reintentar» sin volver a jugar el reto: `ultimaVictoriaRef`
   * guarda lo que el juego mandó (penalización y tiempo de partida).
   */
  const [envioFallido, setEnvioFallido] = useState(false)
  const ultimaVictoriaRef = useRef<{ penaltyMs?: number; tempoDaPartidaMs?: number } | null>(null)
  /** Con cuántas salidas se anotó ya la nota resumen de este nodo. */
  const salidasNotadasRef = useRef(0)
  // En los nodos de cámara el código de rescate sale ABIERTO: las pegatinas
  // impresas con el logo grande no las lee ningún escáner, así que el código
  // manual es la vía fiable y no puede estar escondida tras un botón.
  const [fallbackOpen, setFallbackOpen] = useState(() => isQrCameraStage(currentStage))
  const [fallbackInputCode, setFallbackInputCode] = useState('')
  const [fallbackSubmitting, setFallbackSubmitting] = useState(false)

  useEffect(() => {
    setDragOffset(0)
    setFallbackOpen(isQrCameraStage(currentStage))
    setFallbackInputCode('')
    // Nodo nuevo, candado nuevo.
    winLockRef.current = false
    setIsCompleted(false)
    setEnvioFallido(false)
    ultimaVictoriaRef.current = null
    salidasNotadasRef.current = 0
    // `sinReto` NO se reinicia aquí: lo declara el juego (`useSinRetoEnPantalla`)
    // al montarse y lo suelta al desmontarse. Un efecto del padre corre DESPUÉS
    // que los de sus hijos, así que ponerlo a falso aquí pisaría lo que acaba de
    // declarar el juego nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId])

  useEffect(() => {
    if (open && currentStage) {
      vibrate(10)
    }
  }, [open, stageId, currentStage])

  useEffect(() => {
    if (!open) {
      // El candado NO se suelta aquí: si el nodo se superó, sigue cerrado hasta
      // que cambie el nodo (arriba). Si el envío falló, `handleNativeWin` ya lo
      // soltó en el momento del fallo.
      setIsCompleted(false)
      setEnvioFallido(false)
      ultimaVictoriaRef.current = null
    }
  }, [open])

  useEffect(() => {
    // El reloj del nodo NO vive aquí: vive en nodeClock, anclado al instante en
    // que se abrió el nodo por primera vez. Aquí sólo se lee.
    //
    // Antes el contador era estado local y se ponía a cero al cerrar la hoja:
    // cerrar el nodo y volver a entrar devolvía el tiempo atrás, o sea que se
    // podía parar el reloj cuando se quisiera. Ahora cerrar no para nada.
    if (!(open && currentStage && !isCompleted)) return

    /**
     * Un coleccionable no consume tiempo.
     *
     * Se llega, se toca el boton y ya: no hay prueba que cronometrar. El reloj
     * corria igual y se veia correr, que es lo que hacia pensar que ese rato
     * contaba. Ni corre ni se pinta.
     */
    if (isStageCollectible(currentStage)) {
      setActiveMs(0)
      return
    }

    const stageKey = String(stageId ?? '')
    if (!stageKey) return

    /**
     * El reloj se ve, pero no corre hasta Comenzar.
     *
     * Aqui se arrancaba nada mas abrir la hoja, asi que la pantalla que explica
     * el reto ya sumaba: en el laberinto se veian pasar mas de treinta segundos
     * antes de tocar la bola. Lo que se guardaba al final si era correcto -cada
     * juego mide su partida-, y por eso el numero de la pantalla y el del
     * marcador no coincidian. Confuso y feo.
     *
     * Ahora lo arranca el propio juego, cuando el jugador pulsa Comenzar. Hasta
     * entonces `tiempoDelNodo` devuelve 0 y el reloj se queda quieto en 00:00.
     */
    // Si este juego no avisa de su arranque, el reloj empieza aqui: mas vale
    // contar de mas que no contar nada.
    if (!xogoAvisaElMesmo) abrirNodo(user, stageKey)

    setActiveMs(tiempoDelNodo(user, stageKey))

    const interval = window.setInterval(() => {
      setActiveMs(tiempoDelNodo(user, stageKey))
    }, 250)

    return () => window.clearInterval(interval)
  }, [open, currentStage, stageId, user, isCompleted, xogoAvisaElMesmo])

  if (!presencia.montada || !currentStage) return null

  /**
   * Completa el nodo. UNA sola vez.
   *
   * Antes esperaba 2 segundos antes de enviar y el botón sólo se deshabilitaba
   * con `submitting`, que no se pone a true hasta que el envío arranca. O sea:
   * durante esos 2 segundos el botón seguía activo y, como parecía colgado, el
   * jugador volvía a pulsarlo. Cada pulsación encolaba otro envío de 'OK', y
   * 'OK' lo acepta CUALQUIER nodo, así que tres toques completaban tres nodos
   * seguidos: se recogía el 5 y aparecías en el 8.
   *
   * Ahora se envía en el momento y el candado es un ref, no un estado: los
   * estados de React se actualizan de forma asíncrona y no frenan dos
   * llamadas seguidas dentro del mismo tick.
   */
  /**
   * Completa el nodo con el tiempo que toque.
   *
   * Por defecto vale el reloj de la ficha, que arranca al abrirla. Pero un
   * minijuego puede mandar el suyo, y entonces manda ése: en el laberinto y en
   * Caza-Señales el reto empieza al pulsar Comezar, y contar desde antes
   * penaliza por leer las instrucciones.
   */
  /** Lo llama el juego al pulsar Comenzar: ahi empieza a contar el nodo. */
  function comezarOReloxo() {
    const stageKey = String(stageId ?? '')
    if (!stageKey) return
    if (isStageCollectible(currentStage)) return
    abrirNodo(user, stageKey)
    setActiveMs(tiempoDelNodo(user, stageKey))
  }

  /**
   * Devuelve si el nodo se superó: `true` sí, `false` no se aceptó (el juego
   * puede volver a ofrecer «Continuar») y `undefined` si esta llamada se ignoró
   * porque ya había un envío en marcha (no es un fallo: el juego no debe soltar
   * su propio candado, o se enviaría dos veces).
   */
  async function handleNativeWin(
    penaltyMs?: number,
    tempoDaPartidaMs?: number
  ): Promise<boolean | undefined> {
    if (winLockRef.current || submitting) return undefined
    winLockRef.current = true
    setEnvioFallido(false)

    vibrate([12, 20, 12])
    setIsCompleted(true)
    // La penalización por fallos viaja APARTE del tiempo del nodo. El total es
    // la suma de los tiempos de cada nodo más las penalizaciones, y el servidor
    // guarda cada cosa en su sitio: si se metiera aquí dentro, se contaría dos
    // veces.
    /**
     * Un coleccionable no suma tiempo.
     *
     * Recoger un objeto no es una prueba: se llega, se toca el botón y ya. El
     * reloj corría igual, y ese rato acababa en la clasificación, así que dos
     * jugadores que hicieron lo mismo salían con tiempos distintos según lo que
     * tardasen en leer la pantalla.
     */
    const tempo = isStageCollectible(currentStage)
      ? 0
      : typeof tempoDaPartidaMs === 'number' && Number.isFinite(tempoDaPartidaMs)
        ? Math.max(0, Math.round(tempoDaPartidaMs))
        : activeMs

    // Para «Reintentar» tras un fallo de envío: el tiempo es el del momento de
    // ganar, no el de cuando se vuelva a pulsar.
    ultimaVictoriaRef.current = { penaltyMs, tempoDaPartidaMs: tempo }

    // La penalización del reto y la de haber salido de la aplicación van
    // juntas: las dos son tiempo que se suma al total, no al reloj del nodo.
    const castigo =
      Math.max(0, Math.round(penaltyMs || 0)) + antiTrampas.penalizacionMs

    /**
     * Que quede constancia de las salidas.
     *
     * En el marcador sólo se ve tiempo de más, y eso no distingue a quien tardó
     * de quien salió cuatro veces. Va como evento aparte para que en el panel se
     * pueda mirar quién, en qué nodo y cuántas veces.
     */
    if (antiTrampas.salidas > 0 && antiTrampas.salidas !== salidasNotadasRef.current) {
      // Una sola nota por cuenta de salidas: un «Reintentar» tras un fallo de
      // envío no la repite.
      salidasNotadasRef.current = antiTrampas.salidas
      void queuePhysicalEvent({
        user,
        source: 'manual',
        node_id: String(currentStage?.id ?? ''),
        payload: {
          salidas_da_aplicacion: antiTrampas.salidas,
          penalizacion_ms: antiTrampas.penalizacionMs,
          stage_title: currentStage?.title || '',
        },
      }).catch(() => undefined)
    }

    /**
     * Si el envío no se acepta, el candado se suelta.
     *
     * Estaba puesto hasta que cambiase el nodo: con un fallo de envío (sin
     * cobertura y sin poder guardar en el móvil, un rechazo del servidor) el
     * nodo no cambiaba nunca, y cerrar la hoja y volver a ganar no hacía nada;
     * el laberinto se quedaba en «Avanzando…» para siempre. Ahora se suelta
     * tanto si `onSubmitCode` devuelve `false` como si lanza.
     */
    let superado = false
    try {
      superado = await onSubmitCode('OK', tempo, castigo)
    } finally {
      if (!superado) {
        winLockRef.current = false
        setIsCompleted(false)
        setEnvioFallido(true)
      }
    }

    return superado
  }

  /** Vuelve a mandar lo mismo que se ganó, sin volver a jugar el reto. */
  function reintentarEnvio() {
    const ultima = ultimaVictoriaRef.current
    if (!ultima) return
    void handleNativeWin(ultima.penaltyMs, ultima.tempoDaPartidaMs)
  }

  async function handleSheetFallbackSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = fallbackInputCode.trim().toUpperCase()
    if (!clean || submitting || fallbackSubmitting) return

    try {
      setFallbackSubmitting(true)
      vibrate([12, 20, 12])
      // Los 2 minutos van como penalización, no dentro del tiempo del nodo.
      // El cuarto argumento marca que lo ha escrito el jugador: así el aviso
      // interno de los minijuegos no vale escrito aquí.
      /**
       * Sólo se cierra la casilla si el código se aceptó.
       *
       * `onSubmitCode` devuelve si el nodo llegó a superarse —el escáner de QR
       * ya mira ese valor para no cantar victoria en falso—, y aquí se
       * ignoraba: con un código equivocado salía el aviso, el nodo no avanzaba,
       * y la casilla se cerraba y se vaciaba igual.
       *
       * Lo mas probable en un código escrito a mano es una errata. Cerrar tira
       * lo tecleado y obliga a reabrir y reescribirlo entero, de noche y con el
       * móvil en una mano. Si no se acepta, se deja ahí para corregir una letra.
       */
      const superado = await onSubmitCode(clean, activeMs || 0, 120000, true)

      if (superado) {
        setFallbackInputCode('')
        setFallbackOpen(false)
      }
    } finally {
      setFallbackSubmitting(false)
    }
  }

  function handleClose() {
    vibrate(10)
    onClose()
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    if (!dragEnabledRef.current) return
    if (event.touches.length !== 1) return
    touchStartYRef.current = event.touches[0].clientY
    touchStartXRef.current = event.touches[0].clientX
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
    if (!dragEnabledRef.current) return
    if (touchStartYRef.current === null || touchStartXRef.current === null) return

    const deltaY = event.touches[0].clientY - touchStartYRef.current
    const deltaX = event.touches[0].clientX - touchStartXRef.current

    if (Math.abs(deltaX) > Math.abs(deltaY)) return
    if (deltaY <= 0) {
      setDragOffset(0)
      return
    }

    setDragOffset(Math.min(deltaY, 140))
  }

  function handleTouchEnd() {
    if (!dragEnabledRef.current) return

    if (dragOffset > 90 && !submitting) {
      vibrate([8, 12, 8])
      onClose()
    }

    dragEnabledRef.current = false
    setDragOffset(0)
    touchStartYRef.current = null
    touchStartXRef.current = null
  }

  function beginDrag() {
    dragEnabledRef.current = true
  }

  const fueraDePantalla = presencia.estado !== 'abierta'
  const duracion = presencia.estado === 'saliendo' ? 'var(--saga-motion-sale)' : 'var(--saga-motion-entra)'
  const curva = presencia.estado === 'saliendo' ? 'var(--saga-curva-sale)' : 'var(--saga-curva-entra)'

  return (
    <>
      <style>{sheetAnimations}</style>

      <div
        style={{
          ...(compactGameMode ? compactGameOverlay : overlay),
          pointerEvents: presencia.estado === 'saliendo' ? 'none' : undefined,
        }}
      >
        <div
          className="saga-mov-capa"
          data-saga-anim="interaccion-fondo"
          data-estado={presencia.estado}
          data-animando={presencia.animando ? 'true' : 'false'}
          style={backdrop}
          onClick={submitting ? undefined : handleClose}
        />

        <section
          data-saga-anim="interaccion-hoja"
          data-estado={presencia.estado}
          style={{
            ...(compactGameMode ? compactGameSheet : sheet),
            transform: fueraDePantalla
              ? reducido
                ? 'none'
                : compactGameMode
                  ? 'translate3d(0, 24px, 0) scale(0.985)'
                  : 'translate3d(0, 100%, 0)'
              : `translate3d(0, ${dragOffset}px, 0)`,
            opacity: fueraDePantalla ? 0 : 1,
            transition:
              dragOffset === 0
                ? `transform ${duracion} ${curva}, opacity ${duracion} ${curva}`
                : 'none',
            willChange: presencia.animando || dragOffset > 0 ? 'transform, opacity' : undefined,
            pointerEvents: presencia.estado === 'saliendo' ? 'none' : undefined,
          }}
          onTransitionEnd={presencia.alTerminar}
          aria-modal="true"
          role="dialog"
        >
          {compactGameMode ? (
            /**
             * Barra propia encima del juego, no flotando por encima.
             *
             * Estaba en position:absolute sobre la esquina del panel y se comía
             * el título del reto quedaba debajo del reloj, y
             * la ? y la X caían sobre el contenido. Ahora ocupa su fila: el
             * juego empieza por debajo y no se solapa nada.
             */
            <div style={compactGameTopBar}>
              {/*
                En un coleccionable no hay reloj NI su recuadro: sólo hay que
                tocar un botón, y una casilla vacía en la esquina hace dudar.
              */}
              <div
                style={
                  isStageCollectible(currentStage)
                    ? { display: 'none' as const }
                    : compactGameClock
                }
              >
                {isStageCollectible(currentStage) ? null : '⏱️ '}
                {isStageCollectible(currentStage)
                  ? ''
                  : Math.floor((totalTimeMs + activeMs) / 60000).toString().padStart(2, '0') +
                    ':' +
                    Math.floor(((totalTimeMs + activeMs) % 60000) / 1000)
                      .toString()
                      .padStart(2, '0')}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {onShowHistory && !isStageCollectible(currentStage) && (
                  <button
                    type="button"
                    style={compactGameBarButton}
                    onClick={(e) => { e.preventDefault(); onShowHistory(); }}
                    disabled={submitting}
                    aria-label={t.hoja.verHistoriaDelNodo}
                    title={t.hoja.verHistoria}
                  >
                    ❓
                  </button>
                )}
                <button
                  type="button"
                  style={compactGameBarButton}
                  onClick={handleClose}
                  disabled={submitting}
                  aria-label={t.hoja.cerrarJuego}
                  title={t.hoja.cerrarJuego}
                >
                  ×
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                style={dragHandleWrap}
                onTouchStart={(event) => {
                  beginDrag()
                  handleTouchStart(event)
                }}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div style={dragHandle} />
              </div>

              <div style={headerRow}>
                <div style={headerCopy}>
                  <div style={title}>{currentStage.title}</div>

                  <div style={subRow}>
                    {resolvedRuntime ? (
                      <span style={miniBadge}>{resolvedRuntime.label}</span>
                    ) : null}

                    <span style={userText}>{user}</span>
                  </div>

                  {compactLine ? <div style={compactLineText}>{compactLine}</div> : null}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {onShowHistory && !isStageCollectible(currentStage) && (
                    <button
                      type="button"
                      style={{ ...closeButton, background: 'rgba(255,255,255,0.1)' }}
                      onClick={(e) => { e.preventDefault(); onShowHistory(); }}
                      disabled={submitting}
                      title={t.hoja.historia}
                    >
                      ❓
                    </button>
                  )}
                  <button
                    type="button"
                    style={closeButton}
                    onClick={handleClose}
                    disabled={submitting}
                  >
                    {t.hoja.cerrar}
                  </button>
                </div>
              </div>
            </>
          )}

          {isStageCollectible(currentStage) ? (
            <div style={collectibleCardStyle}>
              <div style={collectibleIconContainerStyle}>
                <div style={collectibleIconStyle}>
                  {(currentStage as any).physical_icon || (currentStage as any).config?.physical_icon || '⭐'}
                </div>
              </div>
              <h4 style={collectibleTitleStyle}>
                {(currentStage as any).physical_item_label || currentStage.title || t.hoja.objetoDeMision}
              </h4>
              <div style={collectibleDescStyle}>
                {(currentStage as any).intro_body ? (
                  renderMarkdown((currentStage as any).intro_body)
                ) : (
                  <p style={{ margin: 0 }}>{t.hoja.coleccionable}</p>
                )}
              </div>
              <button
                type="button"
                style={collectibleBtnStyle}
                // isCompleted además de submitting: se apaga en el mismo toque,
                // sin esperar a que el envío arranque.
                disabled={submitting || isCompleted}
                // Sin envolver, React le pasaría el evento del ratón como
                // penalización y el tiempo del nodo saldría NaN.
                onClick={() => void handleNativeWin()}
              >
                {submitting || isCompleted ? t.hoja.guardando : t.hoja.recogerObjeto}
              </button>
            </div>
          ) : shouldRenderFamilyRuntime && resolvedRuntime ? (
            <>
              {antiTrampas.acabaDeVolver ? (
                /* Un solo idioma: el del jugador. Antes un motivo salía en
                   castellano y el otro en gallego, según cuál fuese. */
                <div style={avisoAntiTrampas}>
                  {antiTrampas.eventos[antiTrampas.eventos.length - 1]?.motivo === 'selector_apps'
                    ? t.antiTrampas.selectorApps(PENALIZACION_POR_SALIDA_MS / 1000)
                    : t.antiTrampas.salioApp(PENALIZACION_POR_SALIDA_MS / 1000)}
                </div>
              ) : null}

              {/*
                La `key` cambia en cada salida, así que React rearma el juego
                entero: patrón nuevo, piezas revueltas otra vez. Es la parte que
                de verdad quita la ventaja de haber mirado fuera; el tiempo es
                sólo el recargo.
              */}
              <SinRetoContext.Provider value={setSinReto}>
                <FamilyRuntimeHost
                  key={`reto-${stageId}-${antiTrampas.reinicios}`}
                  resolved={resolvedRuntime}
                  stage={currentStage}
                  helperText={helperText}
                  submitting={submitting}
                  onWin={handleNativeWin}
                  onComezar={comezarOReloxo}
                  appPosition={appPosition}
                  appAccuracy={appAccuracy}
                />
              </SinRetoContext.Provider>

              {/*
                Si el envío de un reto ganado no se aceptó, el jugador no se
                queda mirando un juego que ya no responde: puede volver a
                mandarlo sin volver a jugar.
              */}
              {envioFallido && !submitting ? (
                <div style={avisoAntiTrampas} role="alert">
                  <div>{t.hoja.envioFallido}</div>
                  <button type="button" style={reintentarEnvioBoton} onClick={reintentarEnvio}>
                    {t.hoja.reintentarEnvio}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <section style={bridgeCard}>
              <div style={bridgeText}>
                {helperText || t.hoja.sinJuego}
              </div>
            </section>
          )}

          {/*
            Código de rescate en todo menos en los coleccionables.
            En los nodos de cámara es imprescindible, que es donde falla el
            escáner. En un coleccionable no pinta nada: no hay reto que
            saltarse, sólo un botón de recoger, y ofrecer un rescate con dos
            minutos de penalización por eso sólo lleva a que alguien lo use sin
            necesitarlo.
          */}
          {!isStageCollectible(currentStage) && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                onClick={() => setFallbackOpen(!fallbackOpen)}
                style={{
                  background: fallbackOpen ? 'transparent' : 'rgba(251,191,36,0.14)',
                  border: fallbackOpen ? 'none' : '1px solid rgba(251,191,36,0.45)',
                  borderRadius: 'var(--theme-radius-card)',
                  padding: fallbackOpen ? 0 : '10px 16px',
                  color: '#fbbf24',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  margin: '0 auto',
                }}
              >
                🔑 {fallbackOpen ? t.hoja.respaldoOcultar : t.hoja.respaldoAbrir}
              </button>

              {fallbackOpen && (
                <form onSubmit={handleSheetFallbackSubmit} style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <input
                    type="text"
                    value={fallbackInputCode}
                    onChange={(e) => setFallbackInputCode(e.target.value)}
                    placeholder={t.hoja.respaldoPlaceholder}
                    disabled={submitting || fallbackSubmitting}
                    style={{
                      background: 'rgba(var(--theme-ink), 0.85)',
                      border: '1px solid rgba(251,191,36,0.4)',
                      color: '#ffffff',
                      borderRadius: 'var(--theme-radius-card)',
                      padding: '6px 12px',
                      fontSize: 16,
                      textTransform: 'uppercase',
                      outline: 'none',
                      width: '180px',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting || fallbackSubmitting || !fallbackInputCode.trim()}
                    style={{
                      background: '#d97706',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--theme-radius-card)',
                      padding: '6px 14px',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer',
                      opacity: (submitting || fallbackSubmitting || !fallbackInputCode.trim()) ? 0.6 : 1,
                    }}
                  >
                    {fallbackSubmitting ? '...' : t.hoja.respaldoValidar}
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
}

/**
 * Los minijuegos van CENTRADOS, no pegados al borde de abajo.
 *
 * Anclada abajo con 2 px de margen, la hoja llegaba justo al último píxel de la
 * pantalla: en el laberinto el pad de dirección y el botón de código de
 * respaldo quedaban por debajo del borde, y en cuanto el navegador del móvil
 * mostraba su barra desaparecían del todo. Centrada queda el mismo aire arriba
 * que abajo y siempre sobra sitio.
 */
const compactGameOverlay: CSSProperties = {
  ...overlay,
  alignItems: 'center',
  padding: 10,
  paddingTop: 'calc(10px + env(safe-area-inset-top))',
  paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
}

const backdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(var(--theme-ink-deep), .56)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
}

const sheet: CSSProperties = {
  position: 'relative',
  width: 'min(100%, 840px)',
  // Safe-area del iPhone: el notch/isla dinámica se comía la cabecera de los
  // minijuegos y los botones de arriba quedaban debajo de la cámara.
  maxHeight: 'calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  borderRadius: 'var(--theme-radius-panel)',
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(var(--theme-ink-deep), .98), rgba(var(--theme-ink), .94))',
  boxShadow: '0 18px 40px rgba(var(--theme-ink-deep), .30)',
  color: '#f8fafc',
  padding: 14,
  paddingTop: 'calc(14px + env(safe-area-inset-top))',
  paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
  display: 'grid',
  gap: 10,
}

const compactGameSheet: CSSProperties = {
  ...sheet,
  width: 'min(100%, 1080px)',
  maxHeight: 'calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
  overflowX: 'hidden',
  overflowY: 'auto',
  // Columna para que la barra de arriba ocupe su fila y el juego vaya debajo.
  display: 'flex',
  flexDirection: 'column',
  padding: 0,
  paddingTop: 0,
  paddingBottom: 0,
  gap: 0,
  border: 'none',
  borderRadius: 'var(--theme-radius-panel)',
  background: 'transparent',
  boxShadow: 'none',
}

/**
 * Fila de cabecera del juego: reloj a la izquierda, ? y X a la derecha.
 *
 * Va con flex-end y el reloj empujando: repartiendo el hueco, cuando el reloj
 * no esta —en los coleccionables— los botones se quedaban colgando a la
 * izquierda, que es donde nadie los busca.
 */
const compactGameTopBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  flex: '0 0 auto',
  padding: '0 2px 8px',
}

const compactGameClock: CSSProperties = {
  marginRight: 'auto',
  display: 'flex',
  alignItems: 'center',
  height: 38,
  padding: '0 14px',
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(var(--theme-ink), 0.72)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  border: '1px solid rgba(255,255,255,0.15)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  color: '#e0f2fe',
  fontSize: 14,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.02em',
}

const compactGameBarButton: CSSProperties = {
  width: 38,
  height: 38,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(255,255,255,.22)',
  background: 'rgba(var(--theme-ink-deep), .86)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  boxShadow: '0 7px 20px rgba(var(--theme-ink-deep), .38)',
  color: '#fff',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  cursor: 'pointer',
}


const dragHandleWrap: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: 2,
  paddingBottom: 2,
  touchAction: 'none',
}

const dragHandle: CSSProperties = {
  width: 42,
  height: 5,
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(255,255,255,.18)',
}

const headerRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const headerCopy: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 6,
}

const title: CSSProperties = {
  color: '#f8fafc',
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1.02,
  letterSpacing: '-0.03em',
}

const subRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
}

const miniBadge: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(22,163,74,.16)',
  border: '1px solid rgba(var(--theme-done), .20)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
}

const userText: CSSProperties = {
  color: 'rgba(255,255,255,.62)',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
}

const compactLineText: CSSProperties = {
  color: 'rgb(var(--theme-line-soft))',
  fontSize: 14,
  lineHeight: 1.35,
}

const closeButton: CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.10em',
}

const bridgeCard: CSSProperties = {
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
}

const bridgeText: CSSProperties = {
  color: 'rgb(var(--theme-line-soft))',
  fontSize: 14,
  lineHeight: 1.5,
}

const collectibleCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  padding: '24px 20px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 'var(--theme-radius-panel)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  margin: '12px 0',
}

const collectibleIconContainerStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  marginBottom: 16,
}

const collectibleIconStyle: CSSProperties = {
  fontSize: 64,
  lineHeight: 1,
  filter: 'drop-shadow(0 0 16px rgba(251, 191, 36, 0.4))',
  animation: 'sagaIconFloat 3s ease-in-out infinite',
}

const collectibleTitleStyle: CSSProperties = {
  color: '#ffffff',
  fontSize: 22,
  fontWeight: 900,
  margin: '0 0 8px 0',
  letterSpacing: '-0.02em',
}

const collectibleDescStyle: CSSProperties = {
  color: 'rgb(var(--theme-line-soft))',
  fontSize: 14,
  lineHeight: 1.5,
  margin: '0 0 24px 0',
  maxWidth: '100%',
  textAlign: 'left',
}

const collectibleBtnStyle: CSSProperties = {
  width: '100%',
  minHeight: 52,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 'var(--theme-radius-card)',
  border: 'none',
  background: 'linear-gradient(135deg, rgb(var(--theme-ok)), rgb(var(--theme-ok-deep)))',
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: '0.05em',
  boxShadow: '0 8px 20px rgba(var(--theme-ok), 0.3)',
  cursor: 'pointer',
  transition: 'transform 0.15s ease, opacity 0.15s ease',
}

const sheetAnimations = `
@keyframes sagaIconFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
`




const avisoAntiTrampas: CSSProperties = {
  background: 'rgba(216, 122, 42, 0.16)',
  border: '1px solid rgba(216, 122, 42, 0.45)',
  color: '#ffd7ab',
  borderRadius: 'var(--theme-radius-card)',
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 10,
  textAlign: 'center',
}

const reintentarEnvioBoton: CSSProperties = {
  marginTop: 8,
  minHeight: 40,
  padding: '0 18px',
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(255, 215, 171, 0.6)',
  background: 'rgba(216, 122, 42, 0.3)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
}

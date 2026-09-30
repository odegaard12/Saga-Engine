import { useEffect, useRef, useState } from 'react'
import { fueDentroDeUnaPeticionDePermisoPropia } from '../utils/permissionPromptGuard'
import {
  crearVigilanteDeSalidas,
  hayInteraccionReciente,
  PENALIZACION_POR_SALIDA_MS,
  vigilarInteraccion,
  type EventoSalida,
  type MotivoSalida,
  type VigilanteDeSalidas,
} from './salidasDeLaApp'

/**
 * Salir de la aplicación en medio de un reto tiene consecuencia.
 *
 * Hasta ahora no había ninguna: nada miraba si el jugador se iba del juego,
 * buscaba la respuesta y volvía. Con un mosaico o un Simón delante, salir y
 * volver era gratis.
 *
 * Lo que hace, y por qué así:
 *
 *  1. **Reinicia el reto.** Es la parte que de verdad quita la ventaja: al
 *     volver, el patrón es otro y lo que hubiera memorizado fuera ya no vale.
 *     Castiga la trampa, no el descuido.
 *
 *  2. **Suma tiempo.** Treinta segundos por salida, que se anotan como
 *     penalización del nodo igual que el código de respaldo.
 *
 *  3. **Lo cuenta, y lo manda al servidor.** El jugador ve que ha pasado y
 *     por qué; sin eso, un patrón que se reinicia solo parece un fallo de la
 *     aplicación. Y cada salida queda además en `eventos`, para que quien
 *     use el hook la reporte al servidor (ver InteractionSheet.tsx) y
 *     aparezca en el panel de administración, en "Sospechas de trampa".
 *
 * Dos señales, no una, y distintas en el móvil:
 *
 *  - **Salir de la app** (`visibilitychange` a `hidden`, o `pagehide` -que es
 *    lo que dispara iOS al cambiar de aplicación cuando `visibilitychange`
 *    no llega-): la pantalla deja de estar visible del todo.
 *  - **Abrir el selector de apps / multitarea** sin llegar a soltar la
 *    pestaña: en Android, la vista de tareas puede dejar la página
 *    "visible" para `document.visibilityState` y sólo quitarle el foco a la
 *    ventana (`blur`). Es la señal que queda cuando no hay `hidden` que
 *    contar.
 *
 * Qué NO cuenta (las reglas viven en `salidasDeLaApp.ts`, aquí sólo se cablean
 * los eventos):
 *
 *  - Una salida sin que el jugador hubiera tocado la pantalla hace poco: el
 *    autobloqueo del móvil no es hacer trampa.
 *  - Una salida mientras hay reglas, resultado o nada en pantalla (`sinReto`).
 *  - Una salida con la hoja del reto cerrada (`activo` es falso): el jugador
 *    está andando con el mapa, no jugando.
 *  - La propia app pidiendo un permiso, y las salidas de menos de 1,5 s.
 *
 * ⚠️ Screenshots en sí NO se pueden detectar desde la web -no hay ninguna API
 * para ello-; lo que se detecta es la salida o el gesto de multitarea que
 * hace falta para hacer una, o para mirar algo en otra app. Tampoco distingue
 * eso de una llamada entrante: nadie puede, el navegador sólo dice que la
 * página perdió el foco o dejó de estar visible. Por eso la penalización es
 * moderada y se avisa antes de empezar, en vez de intentar adivinar
 * intenciones.
 */

export { PENALIZACION_POR_SALIDA_MS }
export type { EventoSalida, MotivoSalida }

export type AntiTrampas = {
  /** Veces que ha salido de la aplicación durante este reto. */
  salidas: number
  /** Lo que suman esas salidas, para el tiempo del nodo. */
  penalizacionMs: number
  /** Cambia en cada salida: úsalo como `key` para rearmar el reto. */
  reinicios: number
  /** Para avisar en pantalla. Se apaga solo. */
  acabaDeVolver: boolean
  /**
   * Cada salida detectada desde que se abrió este nodo, con su motivo.
   * Crece de forma acumulativa -no se vacía sola-, para que quien la lea
   * (InteractionSheet) pueda saber cuáles ya reportó y cuáles no.
   */
  eventos: EventoSalida[]
}

/**
 * @param activo Se vigila sólo mientras es cierto: la hoja del reto abierta y
 *   un reto delante. Con la hoja cerrada no hay nada que vigilar.
 * @param nodoId Nodo nuevo, cuenta nueva.
 * @param sinReto Ahora mismo no hay reto en pantalla (pantalla de reglas,
 *   resultado). Se lee en el instante de salir, no reengancha los oyentes: una
 *   salida que ya había empezado se cuenta aunque el juego cambie de fase
 *   mientras la página está oculta.
 */
export function useAntiTrampas(activo: boolean, nodoId: string, sinReto = false): AntiTrampas {
  const [salidas, setSalidas] = useState(0)
  const [acabaDeVolver, setAcabaDeVolver] = useState(false)
  const [eventos, setEventos] = useState<EventoSalida[]>([])

  const sinRetoRef = useRef(sinReto)
  sinRetoRef.current = sinReto

  const vigilanteRef = useRef<VigilanteDeSalidas | null>(null)
  if (!vigilanteRef.current) {
    vigilanteRef.current = crearVigilanteDeSalidas({
      ahora: Date.now,
      permisoPropio: fueDentroDeUnaPeticionDePermisoPropia,
      interaccionReciente: () => hayInteraccionReciente(),
      sinReto: () => sinRetoRef.current,
    })
  }

  // Nodo nuevo, cuenta nueva.
  useEffect(() => {
    setSalidas(0)
    setAcabaDeVolver(false)
    setEventos([])
    vigilanteRef.current?.descartar()
  }, [nodoId])

  useEffect(() => {
    const vigilante = vigilanteRef.current
    if (!vigilante) return undefined

    if (!activo) {
      vigilante.descartar()
      return undefined
    }

    const dejarDeVigilarToques = vigilarInteraccion()

    /**
     * Empieza a contar una posible salida.
     *
     * Si ya hay una en curso, la primera señal manda -`visibilitychange` y
     * `blur` pueden disparar los dos para la misma salida, sobre todo en
     * iOS-. Y si el aviso de un permiso propio (cámara, movimiento, GPS)
     * saltó hace poco, o no hay reto en pantalla, o el jugador no tocaba la
     * pantalla, se ignora entera (ver salidasDeLaApp.ts).
     */
    function empezar(motivo: MotivoSalida) {
      vigilante?.empezar(motivo)
    }

    function terminar() {
      const evento = vigilante?.terminar()
      if (!evento) return

      setSalidas((n) => n + 1)
      setAcabaDeVolver(true)
      setEventos((lista) => [...lista, evento])
    }

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        empezar('salio_app')
        return
      }
      terminar()
    }

    /**
     * `blur` sin `hidden` es multitarea sin soltar del todo la pestaña -la
     * vista de tareas de Android, por ejemplo-. Si `visibilitychange` ya
     * clasificó esta salida como `hidden`, `empezar` no hace nada -no pisa
     * una salida ya en curso-.
     */
    const alPerderFoco = () => {
      if (document.visibilityState === 'hidden') return
      empezar('selector_apps')
    }
    const alGanarFoco = () => terminar()

    // `pagehide` es lo que dispara iOS al cambiar de aplicación, donde
    // `visibilitychange` no siempre llega.
    const alIrse = () => empezar('salio_app')
    // Vuelta desde `pagehide` -con Back-Forward Cache, sobre todo en iOS-,
    // donde ni `focus` ni `visibilitychange` garantizan disparar solos.
    const alVolver = () => terminar()

    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('blur', alPerderFoco)
    window.addEventListener('focus', alGanarFoco)
    window.addEventListener('pagehide', alIrse)
    window.addEventListener('pageshow', alVolver)

    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('blur', alPerderFoco)
      window.removeEventListener('focus', alGanarFoco)
      window.removeEventListener('pagehide', alIrse)
      window.removeEventListener('pageshow', alVolver)
      dejarDeVigilarToques()
    }
  }, [activo, nodoId])

  // El aviso se apaga solo: es para enterarse, no para tener que cerrarlo.
  useEffect(() => {
    if (!acabaDeVolver) return
    const id = window.setTimeout(() => setAcabaDeVolver(false), 6000)
    return () => window.clearTimeout(id)
  }, [acabaDeVolver])

  return {
    salidas,
    penalizacionMs: salidas * PENALIZACION_POR_SALIDA_MS,
    reinicios: salidas,
    acabaDeVolver,
    eventos,
  }
}

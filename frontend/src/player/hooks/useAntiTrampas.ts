import { useEffect, useRef, useState } from 'react'
import { fueDentroDeUnaPeticionDePermisoPropia } from '../utils/permissionPromptGuard'

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
 * ⚠️ Screenshots en sí NO se pueden detectar desde la web -no hay ninguna API
 * para ello-; lo que se detecta es la salida o el gesto de multitarea que
 * hace falta para hacer una, o para mirar algo en otra app. Tampoco distingue
 * eso de una llamada entrante: nadie puede, el navegador sólo dice que la
 * página perdió el foco o dejó de estar visible. Por eso la penalización es
 * moderada y se avisa antes de empezar, en vez de intentar adivinar
 * intenciones.
 */

/** Lo que cuesta cada salida, en milisegundos. */
export const PENALIZACION_POR_SALIDA_MS = 30_000

/**
 * Salidas más cortas que esto no cuentan.
 *
 * Bajar la persiana de notificaciones, que el móvil apague la pantalla un
 * segundo o un cambio de aplicación fallido dejan la página oculta un
 * instante. Buscar una respuesta fuera lleva más. También es el filtro que
 * absorbe una notificación que aparece y desaparece sola sin que el jugador
 * llegue a tocarla: en la mayoría de móviles ni siquiera dispara `blur`,
 * pero si lo hace, dura menos que esto.
 *
 * Mismo umbral para iOS: deslizar el Centro de Control o la bandeja de
 * notificaciones desde el borde superior quita el foco a la página
 * (`blur` SIN `hidden`, motivo `selector_apps`) igual que la vista de
 * tareas de Android, pero un vistazo típico dura mucho menos de 1,5 s. Con
 * el mismo `terminar()` de abajo para las dos señales, ese gesto honesto no
 * penaliza -no llega a los 1 500 ms-. No se manda al servidor como sospecha
 * NI como nota: por debajo de este umbral se descarta entera, a propósito,
 * para no generar ruido por cada vistazo a la hora.
 */
const SALIDA_MINIMA_MS = 1_500

/** Por qué se clasificó cada salida (ver el bloque de señales arriba). */
export type MotivoSalida = 'salio_app' | 'selector_apps'

export type EventoSalida = {
  motivo: MotivoSalida
  at: number
}

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

export function useAntiTrampas(activo: boolean, nodoId: string): AntiTrampas {
  const [salidas, setSalidas] = useState(0)
  const [acabaDeVolver, setAcabaDeVolver] = useState(false)
  const [eventos, setEventos] = useState<EventoSalida[]>([])
  const enCurso = useRef<{ desde: number; motivo: MotivoSalida } | null>(null)

  // Nodo nuevo, cuenta nueva.
  useEffect(() => {
    setSalidas(0)
    setAcabaDeVolver(false)
    setEventos([])
    enCurso.current = null
  }, [nodoId])

  useEffect(() => {
    if (!activo) {
      enCurso.current = null
      return
    }

    /**
     * Empieza a contar una posible salida.
     *
     * Si ya hay una en curso, la primera señal manda -`visibilitychange` y
     * `blur` pueden disparar los dos para la misma salida, sobre todo en
     * iOS-. Y si el aviso de un permiso propio (cámara, movimiento, GPS)
     * saltó hace poco, se ignora entera: no es que el jugador se fuera, es la
     * aplicación pidiendo permiso (ver permissionPromptGuard.ts).
     */
    function empezar(motivo: MotivoSalida) {
      if (enCurso.current) return
      if (fueDentroDeUnaPeticionDePermisoPropia()) return
      enCurso.current = { desde: Date.now(), motivo }
    }

    function terminar() {
      const estado = enCurso.current
      enCurso.current = null
      if (!estado) return
      if (Date.now() - estado.desde < SALIDA_MINIMA_MS) return

      setSalidas((n) => n + 1)
      setAcabaDeVolver(true)
      setEventos((lista) => [...lista, { motivo: estado.motivo, at: Date.now() }])
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

import { fueDentroDeUnaPeticionDePermisoPropia } from '../utils/permissionPromptGuard'

/**
 * Núcleo del anti-trampas de «salir de la app en medio de un reto».
 *
 * Sin React ni DOM al cargarse: se puede ejecutar en Node
 * (`tests/js/logica_jugador.cjs`) y razonar sobre él entero. `useAntiTrampas`
 * (la salida a la app) y `useRegenerarAoOcultar` (el patrón que se rehace)
 * comparten estas reglas, que es lo importante: si cada uno decidiera por su
 * cuenta qué es «irse», el móvil que se apaga solo castigaría por un lado y no
 * por el otro.
 *
 * Qué cuenta como una salida, y qué no:
 *
 *  1. **Que el jugador tocara la pantalla hace poco.** Un móvil que se
 *     autobloquea a los 30 s sin que nadie lo toque deja la página oculta igual
 *     que el selector de apps, pero no es hacer trampa: el jugador estaba
 *     mirando, o inclinando el móvil en el laberinto, o pensando. Lo que sí
 *     hace falta para irse a propósito (deslizar hacia arriba, el botón de
 *     multitarea, cambiar de app) es tocar el móvil. Si la última interacción
 *     con la página es más vieja que `VENTANA_INTERACCION_MS`, la salida no
 *     cuenta.
 *
 *     ⚠️ Hay un hueco conocido y aceptado: quien se queda 10 s sin tocar y
 *     luego se va no cuenta. Se prefiere eso a castigar con +30 s y reinicio a
 *     un jugador honrado cuyo móvil se apagó en pleno monte. (El Wake Lock de
 *     `useWakeLock` evita casi todos los autobloqueos, pero no se usa como
 *     prueba de nada: en iOS 16.4-18.3 la app instalada acepta la petición y
 *     el móvil se apaga igual.)
 *
 *  2. **Que no sea la propia app pidiendo un permiso** (cámara, movimiento,
 *     micrófono, GPS): ver `permissionPromptGuard.ts`.
 *
 *  3. **Que haya un reto en pantalla.** En la pantalla de reglas, en la de
 *     «has ganado» o en la de «has fallado» no hay nada que memorizar fuera.
 *
 *  4. **Que dure al menos `SALIDA_MINIMA_MS`.** Bajar la persiana de
 *     notificaciones o un vistazo a la hora no penalizan.
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
 * tareas de Android, pero un vistazo típico dura mucho menos de 1,5 s. No se
 * manda al servidor como sospecha NI como nota: por debajo de este umbral se
 * descarta entera, a propósito, para no generar ruido por cada vistazo a la
 * hora.
 */
export const SALIDA_MINIMA_MS = 1_500

/**
 * Cuánto tiempo, hacia atrás, vale «el jugador tocó la pantalla hace poco».
 *
 * Por debajo del autobloqueo más corto que traen los móviles (15 s en
 * Android, 30 s en iOS): si el móvil se apaga solo, la última pulsación es más
 * vieja que esto y la salida no cuenta.
 */
export const VENTANA_INTERACCION_MS = 10_000

/** Por qué se clasificó cada salida. */
export type MotivoSalida = 'salio_app' | 'selector_apps'

export type EventoSalida = {
  motivo: MotivoSalida
  at: number
}

export type Reloj = () => number

/* ------------------------------------------------------------------ */
/* Interacción reciente                                                 */
/* ------------------------------------------------------------------ */

export type RegistroDeInteraccion = {
  marcar: () => void
  ultima: () => number
  reciente: (ventanaMs?: number) => boolean
}

export function crearRegistroDeInteraccion(ahora: Reloj = Date.now): RegistroDeInteraccion {
  let ultima = ahora()

  return {
    marcar() {
      ultima = ahora()
    },
    ultima() {
      return ultima
    },
    reciente(ventanaMs = VENTANA_INTERACCION_MS) {
      return ahora() - ultima < ventanaMs
    },
  }
}

/**
 * Lo que cuenta como «tocar el móvil».
 *
 * A propósito NO están `deviceorientation` ni `devicemotion`: inclinar el móvil
 * en el laberinto no evita el autobloqueo, así que no puede servir de prueba de
 * que el jugador estaba ahí en el sentido que interesa aquí. Sí se cuenta el
 * arrastre (`touchmove`), para que una pieza que se arrastra despacio no deje
 * la última pulsación diez segundos atrás.
 */
const EVENTOS_DE_INTERACCION = [
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchmove',
  'touchend',
  'keydown',
  'click',
] as const

type ObjetivoDeEventos = {
  addEventListener(tipo: string, oyente: () => void, opciones?: unknown): void
  removeEventListener(tipo: string, oyente: () => void, opciones?: unknown): void
}

/** Un único registro para toda la app: lo escriben los eventos, lo leen los hooks. */
const registroGlobal = crearRegistroDeInteraccion()
let usosDeLaVigilancia = 0
let dejarDeEscuchar: (() => void) | null = null

/**
 * Empieza a anotar cuándo toca el jugador la pantalla. Devuelve la función que
 * lo suelta: se cuenta cuántos lo piden, y los oyentes se quitan con el último.
 *
 * La primera vez marca una interacción «ahora»: quien empieza a vigilar lo hace
 * porque el jugador acaba de pulsar algo (Iniciar, abrir el nodo).
 */
export function vigilarInteraccion(
  objetivo: ObjetivoDeEventos = window as unknown as ObjetivoDeEventos
): () => void {
  if (usosDeLaVigilancia === 0) {
    registroGlobal.marcar()
    const anotar = () => registroGlobal.marcar()
    for (const tipo of EVENTOS_DE_INTERACCION) {
      objetivo.addEventListener(tipo, anotar, { capture: true, passive: true })
    }
    dejarDeEscuchar = () => {
      for (const tipo of EVENTOS_DE_INTERACCION) {
        objetivo.removeEventListener(tipo, anotar, { capture: true })
      }
    }
  }

  usosDeLaVigilancia += 1
  let soltado = false

  return () => {
    if (soltado) return
    soltado = true
    usosDeLaVigilancia -= 1
    if (usosDeLaVigilancia <= 0) {
      usosDeLaVigilancia = 0
      dejarDeEscuchar?.()
      dejarDeEscuchar = null
    }
  }
}

export function hayInteraccionReciente(ventanaMs?: number): boolean {
  return registroGlobal.reciente(ventanaMs)
}

/**
 * ¿Esta pérdida de visibilidad es un jugador que se va, y no el móvil que se
 * apaga o la app pidiendo un permiso? La regla compartida por
 * `useAntiTrampas` y `useRegenerarAoOcultar`.
 */
export function esSalidaDeliberada(
  permisoPropio: () => boolean = fueDentroDeUnaPeticionDePermisoPropia,
  interaccionReciente: () => boolean = () => hayInteraccionReciente()
): boolean {
  return !permisoPropio() && interaccionReciente()
}

/* ------------------------------------------------------------------ */
/* Máquina de estados de una salida                                     */
/* ------------------------------------------------------------------ */

export type DependenciasDelVigilante = {
  ahora: Reloj
  /** La app está pidiendo un permiso ahora mismo (ver permissionPromptGuard). */
  permisoPropio: () => boolean
  /** El jugador tocó la pantalla dentro de `VENTANA_INTERACCION_MS`. */
  interaccionReciente: () => boolean
  /** No hay reto en pantalla: reglas, «ganaste» o «fallaste». No se cuenta. */
  sinReto: () => boolean
}

export type VigilanteDeSalidas = {
  /** La página deja de verse (`hidden`, `pagehide`) o pierde el foco (`blur`). */
  empezar: (motivo: MotivoSalida) => void
  /** La página vuelve. Devuelve la salida si hay que contarla. */
  terminar: () => EventoSalida | null
  /** Tira la salida en curso, sin contarla. */
  descartar: () => void
  enCurso: () => boolean
}

export function crearVigilanteDeSalidas(dep: DependenciasDelVigilante): VigilanteDeSalidas {
  let enCurso: { desde: number; motivo: MotivoSalida; cuenta: boolean } | null = null

  return {
    /**
     * Si ya hay una salida en curso, la primera señal manda: `visibilitychange`
     * y `blur` pueden disparar los dos para la misma salida, sobre todo en iOS.
     *
     * Todo se decide AL SALIR y no al volver: al volver, la última pulsación ya
     * no es la de antes de irse.
     */
    empezar(motivo) {
      if (enCurso) return
      if (dep.permisoPropio()) return
      if (dep.sinReto()) return
      enCurso = { desde: dep.ahora(), motivo, cuenta: dep.interaccionReciente() }
    },

    terminar() {
      const estado = enCurso
      enCurso = null
      if (!estado || !estado.cuenta) return null

      const ahora = dep.ahora()
      if (ahora - estado.desde < SALIDA_MINIMA_MS) return null

      return { motivo: estado.motivo, at: ahora }
    },

    descartar() {
      enCurso = null
    },

    enCurso() {
      return enCurso !== null
    },
  }
}

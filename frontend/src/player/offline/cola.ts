/**
 * La cola de eventos sin red, y la única puerta para usarla.
 *
 * Hay UNA cola: la de IndexedDB (`event_queue`, en missionPack.ts, que es quien la guarda, la ordena y la manda a
 * /api/events/sync; el service worker sube la misma). Hubo otra en `localStorage` que se vaciaba contra el mismo
 * endpoint, y dos almacenes eran dos verdades sobre lo que faltaba por subir. El resto de la aplicación encola, sube
 * y cuenta sólo por aquí:
 *
 * - `encolar(evento)`: lo guarda en el móvil, haya red o no.
 * - `subir(user)`: lo manda. Una subida a la vez (ver abajo).
 * - `contarPendientes(user)` / `contarAvancesPendentes(user)`: lo que falta por subir (todo / sólo nodos).
 *
 * Las tres pasan antes por `mudarColaVieja`: lo que un móvil ya instalado tuviera en la cola de `localStorage` se
 * mete una vez en la buena, con su mismo `client_event_id`, y no se pierde al actualizar.
 */
import {
  contarAvancesPendentes as contarAvancesEnLaCola,
  contarPendientes as contarEnLaCola,
  queueOfflineEvent,
  syncPendingOfflineEvents,
} from './missionPack'

export type EventoParaLaCola = Parameters<typeof queueOfflineEvent>[0]
export type ResultadoDeSubida = Awaited<ReturnType<typeof syncPendingOfflineEvents>>

export function encolar(evento: EventoParaLaCola) {
  // El turno (`seq`) se pide en el acto, sin esperar a nada: con una espera aquí, lo que missionPack encola justo
  // después (el avance del nodo) cogía turno antes que este evento (la recogida del objeto) y subía delante.
  if (!mudanzas.has(evento.user) && hayColaVieja(evento.user)) {
    return mudarColaVieja(evento.user).then(() => queueOfflineEvent(evento))
  }
  return queueOfflineEvent(evento)
}

export async function contarPendientes(user: string): Promise<number> {
  await mudarColaVieja(user)
  return contarEnLaCola(user)
}

export async function contarAvancesPendentes(user: string): Promise<number> {
  await mudarColaVieja(user)
  return contarAvancesEnLaCola(user)
}

/**
 * Sube la cola. Una subida a la vez, también entre llamadas que llegan a la vez desde sitios distintos (el ciclo de
 * 30 s, la vuelta de la red, EVENTO_SUBIR_COLA, el reintento de un avance, «Prepararse»).
 *
 * Quien llama con una subida en marcha no se va con las manos vacías ni lanza otra en paralelo: se apunta a la
 * SIGUIENTE, que sale cuando acabe la actual y recoge lo que se encoló mientras tanto. Todos los que llegan durante
 * una subida comparten esa siguiente, y dos llamadas a la vez son una sola petición. Así, al volver de `await subir()`,
 * lo encolado antes de llamar ya se ha intentado subir (antes, con una subida en marcha, se volvía al momento con un
 * «ok» sin haber mandado nada).
 *
 * La espera tras un fallo de red sigue siendo la de missionPack.ts (de 3 s a 1 min), y entre la página y el service
 * worker sigue el candado de Web Locks.
 */
let ultimaSubida: Promise<unknown> = Promise.resolve()
const siguienteSubida = new Map<string, Promise<ResultadoDeSubida>>()

export function subir(user: string): Promise<ResultadoDeSubida> {
  const apuntada = siguienteSubida.get(user)
  if (apuntada) return apuntada

  const subida = ultimaSubida.then(async () => {
    // Sale ya: quien llame desde aquí va a la siguiente, para no quedarse sin lo que encole ahora.
    siguienteSubida.delete(user)
    await mudarColaVieja(user)
    return syncPendingOfflineEvents(user)
  })
  siguienteSubida.set(user, subida)
  ultimaSubida = subida.catch(() => undefined)
  return subida
}

/* ------------------------------------------------------------------ *
 * La cola vieja de localStorage
 * ------------------------------------------------------------------ */

/** El formato y la clave de `loadOfflineSnapshot` (localFirst.ts): `saga:offline:<jugador>`, con `queued_events`. */
type EventoViejo = {
  client_event_id?: string
  type?: string
  node_id?: string
  team_id?: string
  source?: string
  payload?: Record<string, unknown>
}

function claveVieja(user: string): string {
  return `saga:offline:${String(user || 'anonymous').trim() || 'anonymous'}`
}

function leerInstantanea(user: string): Record<string, unknown> | null {
  try {
    const crudo = globalThis.localStorage?.getItem(claveVieja(user))
    const leida: unknown = crudo ? JSON.parse(crudo) : null
    return leida && typeof leida === 'object' ? (leida as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const mudanzas = new Map<string, Promise<void>>()

function hayColaVieja(user: string): boolean {
  const viejos = leerInstantanea(user)?.queued_events
  return Array.isArray(viejos) && viejos.length > 0
}

/**
 * Pasa a la cola buena lo que un jugador tuviera en la vieja.
 *
 * Sin esto, quien estuviera a mitad de ruta con escaneos sin subir los perdería al actualizar la aplicación: se
 * quedarían en `localStorage` sin que nadie los volviera a mirar.
 *
 * - Con su `client_event_id` como id en la cola: si el servidor ya lo tenía (una respuesta perdida antes de
 *   actualizar), lo reconoce como repetido y no lo aplica dos veces; y si la mudanza se corta a medias y se repite,
 *   el mismo id pisa el mismo registro en vez de duplicarlo.
 * - Sólo sale de `localStorage` lo que se guardó en IndexedDB: si falla la escritura, se queda para la próxima.
 * - Una vez por jugador y sesión, y nunca dos a la vez; si quedó algo sin mudar, se reintenta en la siguiente llamada.
 */
function mudarColaVieja(user: string): Promise<void> {
  let mudanza = mudanzas.get(user)
  if (!mudanza) {
    mudanza = mudarUnaVez(user).then(
      (quedaAlgo) => {
        if (quedaAlgo) mudanzas.delete(user)
      },
      () => {
        mudanzas.delete(user)
      }
    )
    mudanzas.set(user, mudanza)
  }
  return mudanza
}

/** Devuelve si quedó algo sin mudar. */
async function mudarUnaVez(user: string): Promise<boolean> {
  const instantanea = leerInstantanea(user)
  const viejos = Array.isArray(instantanea?.queued_events) ? (instantanea.queued_events as EventoViejo[]) : []
  if (!instantanea || !viejos.length) return false

  const quedan: EventoViejo[] = []
  for (const evento of viejos) {
    if (!evento || typeof evento.type !== 'string') continue
    try {
      await queueOfflineEvent({
        user,
        type: evento.type,
        source: evento.source,
        node_id: evento.node_id,
        team_id: evento.team_id,
        id: evento.client_event_id || undefined,
        payload: {
          ...(evento.payload || {}),
          client_event_id: evento.client_event_id,
          mudado_de_la_cola_vieja: true,
        },
      })
    } catch {
      quedan.push(evento)
    }
  }

  try {
    globalThis.localStorage?.setItem(claveVieja(user), JSON.stringify({ ...instantanea, queued_events: quedan }))
  } catch {
    // Sin poder reescribirla, la próxima mudanza vuelve a pasar los mismos: mismo id, mismo registro.
  }
  return quedan.length > 0
}

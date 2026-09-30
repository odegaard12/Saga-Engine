/**
 * Cómo enseña el panel de Actividad la lista de eventos que le llega.
 *
 * - El servidor devuelve como mucho `limit` eventos, así que contar los
 *   «pendientes» entre los que llegan da 200 como máximo aunque haya miles
 *   (informe A17). Si el servidor manda el total, se usa; si no, y la lista
 *   llega al tope, se dice «200+» en vez de afirmar un número falso.
 * - El orden lo decide la fecha del evento, no el orden en que llegan: el
 *   servidor puede devolverlos del más viejo al más nuevo o al revés, y el panel
 *   invertía siempre a ciegas.
 */
import type { AdminEvent } from './adminApi'

export const EVENTS_PAGE_LIMIT = 200

export function describePendingCount(
  events: Array<Pick<AdminEvent, 'status'>>,
  limit: number = EVENTS_PAGE_LIMIT,
  apiPendingCount?: number | null
): { text: string; exact: boolean } {
  if (typeof apiPendingCount === 'number' && Number.isFinite(apiPendingCount) && apiPendingCount >= 0) {
    return { text: String(Math.floor(apiPendingCount)), exact: true }
  }

  const pendientes = events.filter((evento) => evento.status === 'pending').length
  if (events.length >= limit) {
    // La lista está cortada: puede haber más pendientes de los que se ven.
    return { text: `${pendientes}+`, exact: false }
  }

  return { text: String(pendientes), exact: true }
}

/** Más recientes primero, por la fecha del evento. Sin fecha válida, por orden de llegada inverso. */
export function sortEventsNewestFirst<T extends Pick<AdminEvent, 'created_at'>>(events: T[]): T[] {
  return events
    .map((evento, indice) => {
      const instante = Date.parse(String(evento.created_at || ''))
      return { evento, indice, instante: Number.isFinite(instante) ? instante : Number.NEGATIVE_INFINITY }
    })
    .sort((a, b) => (b.instante === a.instante ? b.indice - a.indice : b.instante - a.instante))
    .map((par) => par.evento)
}

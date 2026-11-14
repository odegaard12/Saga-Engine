/**
 * El reloj de la sesión del panel (13/11).
 *
 * La sesión es deslizante: cada petición válida la renueva, y el servidor lo dice en dos cabeceras de TODAS sus
 * respuestas de `/api/admin/*`: `X-Admin-Session-Expires` (cuándo caduca por falta de uso) y `X-Admin-Session-Absolute`
 * (el tope de 12 h desde que se abrió, que no se renueva). Aquí se leen para que el panel pueda avisar 5 minutos antes.
 *
 * Módulo puro (sin React): `adminSessionClock.cjs` lo prueba en Node.
 */

export const AVISO_ANTES_DE_CADUCAR_S = 300

export type SessionClock = {
  /** Segundos desde 1970 en que caduca por falta de uso; 0 si no se sabe. */
  expiresAt: number
  /** Segundos desde 1970 del tope absoluto; 0 si no se sabe. */
  absoluteAt: number
}

let reloj: SessionClock = { expiresAt: 0, absoluteAt: 0 }
const oyentes = new Set<() => void>()

export function getSessionClock(): SessionClock {
  return reloj
}

export function noteSessionClock(expiresAt: number, absoluteAt = 0) {
  const e = Number(expiresAt)
  if (!(e > 0)) return
  const a = Number(absoluteAt)
  reloj = { expiresAt: e, absoluteAt: a > 0 ? a : reloj.absoluteAt }
  oyentes.forEach((f) => f())
}

export function resetSessionClock() {
  reloj = { expiresAt: 0, absoluteAt: 0 }
  oyentes.forEach((f) => f())
}

export function onSessionClock(f: () => void): () => void {
  oyentes.add(f)
  return () => {
    oyentes.delete(f)
  }
}

export function noteSessionHeaders(headers: { get(name: string): string | null }) {
  const e = Number(headers.get('x-admin-session-expires'))
  const a = Number(headers.get('x-admin-session-absolute'))
  if (e > 0) noteSessionClock(e, a)
}

/** Lo que hay que enseñar ahora: nada, «caduca por falta de uso» (se puede renovar) o «tope de 12 h» (no se puede). */
export type SessionWarning = { tipo: 'inactividad' | 'tope'; segundos: number } | null

export function sessionWarning(
  r: SessionClock,
  ahoraS: number,
  antesS = AVISO_ANTES_DE_CADUCAR_S
): SessionWarning {
  if (!(r.expiresAt > 0)) return null
  const quedan = r.expiresAt - ahoraS
  if (quedan <= 0 || quedan > antesS) return null
  // Si la caducidad por inactividad ya coincide con el tope absoluto, renovar no sirve de nada.
  const esTope = r.absoluteAt > 0 && r.expiresAt >= r.absoluteAt - 1
  return { tipo: esTope ? 'tope' : 'inactividad', segundos: Math.max(1, Math.round(quedan)) }
}

let instalado = false

/** Una vez por pestaña: lee las cabeceras de la sesión en cada respuesta de `/api/admin/*`. */
export function installAdminFetchClock() {
  if (instalado || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  instalado = true
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init)
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/api/admin/')) noteSessionHeaders(res.headers)
    } catch {
      // Sólo es un aviso: si algo raro pasa con la cabecera, la petición sigue igual.
    }
    return res
  }
}

/**
 * Errores del panel de administración, con su texto en castellano.
 *
 * Hasta ahora, cuando una petición al servidor fallaba, el panel enseñaba
 * `Request failed: HTTP 429` o `HTTP 400 | HTTP 400 | HTTP 400...` (el guardado
 * probaba quince formas de la misma petición y juntaba los quince errores). El
 * organizador no podía saber si se había equivocado de contraseña, si llevaba
 * media hora bloqueado por intentos fallidos o si la sesión había caducado.
 *
 * Este módulo es puro (no toca React ni el DOM salvo para avisar a la ventana
 * de que la sesión caducó), así que se puede probar sin navegador.
 */

/** Evento que se lanza en `window` cuando el servidor contesta 403 a la sesión. */
export const ADMIN_SESSION_EXPIRED_EVENT = 'saga-admin-session-expired'

export class AdminHttpError extends Error {
  status: number
  detail: string
  body: unknown

  constructor(status: number, detail: string, body: unknown = null) {
    super(detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`)
    this.name = 'AdminHttpError'
    this.status = status
    this.detail = detail
    this.body = body
  }
}

export function isAdminHttpError(value: unknown): value is AdminHttpError {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { name?: unknown }).name === 'AdminHttpError' &&
    typeof (value as { status?: unknown }).status === 'number'
  )
}

type ValidationItem = { index?: number | null; field?: string; detail?: string }

const VALIDACIONES: Array<[RegExp, string]> = [
  [/^title is required$/i, 'el título es obligatorio'],
  [/^lat is required for gps entry$/i, 'falta la latitud (el nodo entra por GPS)'],
  [/^lon is required for gps entry$/i, 'falta la longitud (el nodo entra por GPS)'],
  [/^radius must be > 0 for gps entry$/i, 'el radio tiene que ser mayor que 0'],
  [/^unsupported entry mode: (.+)$/i, 'modo de entrada no admitido: $1'],
  [/^unsupported minigame type: (.+)$/i, 'tipo de juego no admitido: $1'],
  [/^minigame type is required$/i, 'falta el tipo de juego'],
  [/^config must be an object$/i, 'la configuración del juego no es válida'],
]

function traducirValidacion(detalle: string): string {
  for (const [patron, texto] of VALIDACIONES) {
    if (patron.test(detalle)) return detalle.replace(patron, texto)
  }
  return detalle
}

/** «Nodo 3 · título: el título es obligatorio». Nunca más de `max` líneas. */
export function describeValidationErrors(errors: unknown, max = 6): string {
  if (!Array.isArray(errors) || errors.length === 0) return ''
  const partes = (errors as ValidationItem[]).slice(0, max).map((item) => {
    const nodo = typeof item?.index === 'number' ? `Nodo ${item.index + 1}` : 'Misión'
    const campo = item?.field ? ` · ${item.field}` : ''
    return `${nodo}${campo}: ${traducirValidacion(String(item?.detail || 'no válido'))}`
  })
  const resto = errors.length > max ? ` (y ${errors.length - max} más)` : ''
  return partes.join('; ') + resto
}

/** Lo que dice el servidor en el cuerpo de un error, sea cual sea su forma. */
export function extractErrorDetail(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const record = body as Record<string, unknown>

  if (typeof record.detail === 'string' && record.detail.trim()) return record.detail.trim()
  if (Array.isArray(record.detail)) {
    // FastAPI, 422: [{ loc, msg, type }]
    const mensajes = record.detail
      .map((item) => (item && typeof item === 'object' ? String((item as { msg?: unknown }).msg || '') : ''))
      .filter(Boolean)
    if (mensajes.length > 0) return mensajes.join('; ')
  }
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim()
  if (typeof record.reason === 'string' && record.reason.trim()) return record.reason.trim()
  return ''
}

/** El servidor rechazó la petición por su ORIGEN (CSRF): no es una sesión caducada y no hay que volver al login. */
export function isCrossSiteBlocked(status: number, detail: string): boolean {
  return status === 403 && /cross-site/i.test(detail)
}

/**
 * La sesión de administración ha caducado (o se ha perdido la cookie).
 *
 * 13/11: un 403 de ORIGEN (`cross-site request blocked`) ya no cuenta (devolvía al login a quien tenía la sesión
 * sana), y el 401 `mission key required` sí: con la clave de misión puesta, una sesión de admin caducada recibía ese
 * 401 y el panel se quedaba sin vida. (El servidor ya da 403 en /api/admin, esto cubre un servidor viejo.)
 */
export function isSessionExpired(status: number, detail: string): boolean {
  if (status === 401) return /mission key required/i.test(detail)
  if (status !== 403) return false
  return !/password change required/i.test(detail) && !isCrossSiteBlocked(status, detail)
}

/** El servidor exige cambiar la contraseña antes de dejar hacer nada. */
export function isPasswordChangeRequired(status: number, detail: string): boolean {
  return status === 403 && /password change required/i.test(detail)
}

/** Avisa a la aplicación de que hay que volver al login SIN perder el trabajo. */
export function notifyAdminSessionExpired(status: number, detail: string) {
  if (!isSessionExpired(status, detail)) return
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(
      new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT, { detail: { status, detail } })
    )
  } catch {
    // Sin CustomEvent (entorno raro): la petición que falló ya devuelve su error.
  }
}

/** El 429 del ritmo de peticiones por IP (`rate limit exceeded`): NO es un bloqueo de acceso. */
export function isRateLimited(err: unknown): boolean {
  return isAdminHttpError(err) && err.status === 429 && /rate limit/i.test(err.detail)
}

/**
 * Segundos de bloqueo de ACCESO: el del 429 («retry in Ns») o, si un fallo de contraseña ya deja bloqueado, el
 * `retry_in` de su 401. Null si no hay bloqueo (y para el 429 de ritmo, que es otra cosa).
 */
export function lockoutSeconds(err: unknown): number | null {
  if (!isAdminHttpError(err)) return null
  if (err.status === 401) {
    const espera = Number((err.body as { retry_in?: unknown } | null)?.retry_in)
    return espera > 0 ? Math.round(espera) : null
  }
  if (err.status !== 429 || isRateLimited(err)) return null
  const encontrado = /retry in (\d+)\s*s/i.exec(err.detail)
  if (encontrado) return Math.max(1, Number(encontrado[1]))
  return 60
}

export function formatWait(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 90) return `${total} s`
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`
}

export type AdminErrorContext = 'login' | 'guardar' | 'cargar' | 'accion'

function esFalloDeRed(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const nombre = String((err as { name?: unknown }).name || '')
  const mensaje = String((err as { message?: unknown }).message || '')
  if (nombre === 'AbortError') return true
  return nombre === 'TypeError' && /fetch|network|load failed|conexi/i.test(mensaje)
}

/**
 * El texto que se le enseña al organizador. Siempre en castellano y, cuando se
 * sabe, con lo que tiene que hacer a continuación.
 */
export function describeAdminError(err: unknown, context: AdminErrorContext = 'accion'): string {
  if (isAdminHttpError(err)) {
    const { status, detail } = err

    if (status === 429) {
      if (isRateLimited(err)) {
        return 'El servidor está recibiendo muchas peticiones desde esta red. Espera unos segundos y vuelve a intentarlo.'
      }
      const segundos = lockoutSeconds(err) ?? 60
      return `Demasiados intentos fallidos: el acceso está bloqueado. Espera ${formatWait(segundos)} y vuelve a intentarlo.`
    }
    if (status === 401) {
      if (isSessionExpired(status, detail)) return 'La sesión de administración ha caducado. Vuelve a entrar.'
      if (context === 'login') {
        const cuerpo = (err.body || {}) as { remaining_attempts?: unknown; retry_in?: unknown }
        const espera = Number(cuerpo.retry_in)
        const quedan = Number(cuerpo.remaining_attempts)
        if (espera > 0) {
          return `Contraseña incorrecta. Acceso bloqueado: espera ${formatWait(espera)} y vuelve a intentarlo.`
        }
        if (Number.isFinite(quedan) && cuerpo.remaining_attempts !== undefined) {
          return quedan === 1
            ? 'Contraseña incorrecta. Te queda 1 intento antes del bloqueo.'
            : `Contraseña incorrecta. Te quedan ${quedan} intentos antes del bloqueo.`
        }
        return 'Contraseña incorrecta.'
      }
      return 'No tienes permiso para esta acción. Vuelve a entrar.'
    }
    if (isPasswordChangeRequired(status, detail)) {
      return 'Hay que cambiar la contraseña de administración antes de seguir.'
    }
    if (isCrossSiteBlocked(status, detail)) {
      return 'El servidor ha rechazado la petición por su origen. Abre el panel desde la dirección oficial de SAGA (la misma con la que lo abriste la última vez) y vuelve a intentarlo.'
    }
    if (status === 403) {
      return 'La sesión de administración ha caducado. Vuelve a entrar.'
    }
    if (status === 409) {
      return 'La misión ha cambiado en otra pestaña o por otra persona mientras la editabas.'
    }
    if (status === 413) {
      return 'Lo que envías pesa demasiado (probablemente una foto). Usa una imagen más pequeña.'
    }
    if (status === 404) {
      return 'El servidor no encuentra lo que se le pide (¿jugador o nodo borrado?). Recarga el panel.'
    }
    if (status === 400 || status === 422) {
      const validaciones = describeValidationErrors(
        (err.body as { errors?: unknown } | null)?.errors
      )
      if (validaciones) return `El servidor ha rechazado los datos: ${validaciones}.`
      if (/missing_config/i.test(detail)) {
        return 'El servidor no ha recibido la configuración a guardar (missing_config).'
      }
      return `El servidor ha rechazado los datos${detail ? `: ${traducirValidacion(detail)}` : ''}.`
    }
    if (status === 502 || status === 503 || status === 504) {
      // Lo que contesta Cloudflare (con HTML, sin JSON) cuando la Raspberry se está reiniciando o no responde.
      return 'El servidor se está reiniciando o no tiene conexión. Espera un minuto y vuelve a intentarlo; tus cambios siguen aquí.'
    }
    if (status >= 500) {
      return `El servidor ha fallado (HTTP ${status}). Inténtalo de nuevo; si sigue así, avisa a quien lo administra.`
    }
    return `El servidor ha contestado con un error (HTTP ${status}${detail ? `: ${detail}` : ''}).`
  }

  if (esFalloDeRed(err)) {
    return context === 'guardar'
      ? 'Sin conexión con el servidor: no se ha guardado nada. Tus cambios siguen aquí; reintenta cuando haya red.'
      : 'Sin conexión con el servidor. Comprueba la red e inténtalo de nuevo.'
  }

  const mensaje = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return mensaje.trim() || 'Error desconocido.'
}

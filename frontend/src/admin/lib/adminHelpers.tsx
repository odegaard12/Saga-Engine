import { generarPayloadQr } from '../../shared/qrPayload'

/**
 * Funciones puras y tarjetas pequeñas del panel de administración.
 *
 * Vivían al principio y al final de `AdminApp.tsx`, alrededor del componente de
 * 1 400 líneas. Se sacan tal cual: sin cambios de lógica ni de nombres.
 */

export function slugifyMissionItemId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

export function buildTemplatePhysicalFields(
  kind: 'collectible' | 'requirement' | 'clue' | 'bonus',
  label: string
) {
  const itemId = slugifyMissionItemId(label) || 'objeto_qr'
  // Código al azar, no el id sacado del título: ver shared/qrPayload.ts.
  const payload = generarPayloadQr()

  return {
    physical_node_kind: kind,
    physical_item_kind: kind,
    physical_item_id: itemId,
    physical_item_label: label,
    physical_qr: {
      kind,
      item_id: itemId,
      label,
      payload,
    },
    qr_payload: payload,
  }
}

export function preservePhysicalStageFields<T extends Record<string, unknown>>(previous: T, next: T): T {
  const keys = [
    'physical_node_kind',
    'physical_item_kind',
    'physical_item_id',
    'physical_item_label',
    'physical_qr',
    'qr_payload',
  ] as const

  const merged = { ...next } as Record<string, unknown>
  const clearPhysical =
    merged._clear_physical_fields === true ||
    merged._physical_node_mode === 'normal' ||
    merged.physical_node_kind === null ||
    merged.physical_item_kind === null

  if (clearPhysical) {
    for (const key of keys) {
      delete merged[key]
    }
    delete merged._clear_physical_fields
    delete merged._physical_node_mode
    return merged as T
  }

  for (const key of keys) {
    if (!(key in merged) && key in previous) {
      merged[key] = previous[key]
    }
  }

  return merged as T
}

export function formatCoords(lat?: number | null, lon?: number | null) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return '—'
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

/**
 * La fecha de salida se guarda CON zona horaria.
 *
 * El <input type="datetime-local"> da "2026-02-14T09:00", sin zona. Guardado
 * tal cual, el servidor (un contenedor en UTC) y el móvil (hora local) lo
 * leían en husos distintos: la cortina se levantaba a la hora y el servidor
 * seguía rechazando avanzar durante dos horas. Con la zona del navegador del
 * organizador dentro -"2026-02-14T09:00:00+01:00"- no hay nada que asumir.
 */
export function fechaConZona(valor: string): string {
  const texto = String(valor || '').trim()
  if (!texto) return ''
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(texto)) return texto
  const ms = Date.parse(texto)
  if (!Number.isFinite(ms)) return texto
  const fecha = new Date(ms)
  const dos = (n: number) => String(n).padStart(2, '0')
  const desfase = -fecha.getTimezoneOffset()
  const signo = desfase >= 0 ? '+' : '-'
  const abs = Math.abs(desfase)
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` +
    `T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:00` +
    `${signo}${dos(Math.floor(abs / 60))}:${dos(abs % 60)}`
  )
}

/** Lo contrario: de la fecha guardada (con zona) a lo que entiende el input, en hora local. */
export function fechaParaElInput(valor: string): string {
  const texto = String(valor || '').trim()
  if (!texto) return ''
  const ms = Date.parse(texto)
  if (!Number.isFinite(ms)) return texto
  const fecha = new Date(ms)
  const dos = (n: number) => String(n).padStart(2, '0')
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` +
    `T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
  )
}

/**
 * Una marca de hora del servidor, en la hora de quien mira el panel (revisión 23/10/2026).
 *
 * El mapa 3D y la red de caminos guardan `built_at` con `time.strftime("%Y-%m-%dT%H:%M:%S%z")`: en el contenedor,
 * que va en UTC, sale «2026-10-23T08:00:00+0000», y el panel lo pegaba tal cual. Dos horas menos que en España, y
 * en un formato que no es para leer. Se pasa a la hora local; lo que no se entiende se deja como venía.
 */
export function fechaDelServidor(valor?: string | null): string {
  const texto = String(valor || '').trim()
  // `+0000` sin dos puntos no lo entiende cualquier navegador: se le ponen.
  const ms = Date.parse(texto.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  if (!texto || !Number.isFinite(ms)) return texto
  return new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

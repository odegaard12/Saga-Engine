import { createClientEventId } from './localFirst'
import { queueOfflineEvent } from './missionPack'

export type PhysicalEventSource = 'qr' | 'nfc' | 'manual'

export type QueuePhysicalEventInput = {
  user: string
  source: PhysicalEventSource
  node_id?: string
  physical_id?: string
  raw_value?: string
  url?: string
  code?: string
  payload?: Record<string, unknown>
}

export type QueueQrScanInput = Omit<QueuePhysicalEventInput, 'source'>
export type QueueNfcOpenInput = Omit<QueuePhysicalEventInput, 'source'>
export type QueueManualCodeInput = Omit<QueuePhysicalEventInput, 'source' | 'url'>

const MAX_PHYSICAL_TEXT_LENGTH = 300

function cleanText(value: unknown, maxLength = MAX_PHYSICAL_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined

  const clean = value.trim()
  if (!clean) return undefined

  return clean.slice(0, maxLength)
}

function cleanPayload(payload: Record<string, unknown> = {}): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (!key || key.length > 64) continue

    if (typeof value === 'string') {
      const clean = cleanText(value)
      if (clean) cleaned[key] = clean
      continue
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      cleaned[key] = value
    }
  }

  return cleaned
}

function eventTypeForSource(source: PhysicalEventSource): 'qr_scanned' | 'nfc_url_opened' {
  if (source === 'nfc') return 'nfc_url_opened'
  return 'qr_scanned'
}

function physicalPayload(input: QueuePhysicalEventInput): Record<string, unknown> {
  return {
    ...cleanPayload(input.payload),
    capture_source: input.source,
    physical_id: cleanText(input.physical_id),
    raw_value: cleanText(input.raw_value),
    url: cleanText(input.url, 500),
    code: cleanText(input.code, 120),
  }
}

/**
 * Encola un evento físico —escaneo, NFC, código a mano— en LA cola.
 *
 * Antes había dos: ésta escribía en `localStorage` y los nodos completados en
 * IndexedDB, y las dos se vaciaban contra el mismo endpoint. Dos almacenes
 * significan dos verdades sobre lo que falta por subir, y de ahí salieron los
 * nodos que se repetían. Ahora todo va al mismo sitio, en orden.
 *
 * Es asíncrono porque IndexedDB lo es. Quien encola no necesita esperar: puede
 * soltar la promesa y seguir.
 */
export function queuePhysicalEvent(input: QueuePhysicalEventInput) {
  const user = cleanText(input.user, 120)

  if (!user) {
    throw new Error('user is required to queue a physical event')
  }

  return queueOfflineEvent({
    user,
    type: eventTypeForSource(input.source),
    source: input.source,
    node_id: cleanText(input.node_id, 120),
    payload: {
      ...physicalPayload(input),
      client_event_id: createClientEventId(`physical_${input.source}`),
    },
  })
}

export function queueQrScan(input: QueueQrScanInput) {
  return queuePhysicalEvent({ ...input, source: 'qr' })
}

export function queueNfcOpen(input: QueueNfcOpenInput) {
  return queuePhysicalEvent({ ...input, source: 'nfc' })
}

export function queueManualCode(input: QueueManualCodeInput) {
  return queuePhysicalEvent({
    ...input,
    source: 'manual',
    payload: {
      ...input.payload,
      manual_entry: true,
    },
  })
}

import type { PlayerGamePayload, PublicConfig, TeamStatusPayload } from '../types/player'

type AdvanceResponse = {
  status: 'ok' | 'fail'
  user: string
}

export type AdminReactOverviewStage = {
  id?: number | string
  index: number
  title: string
  type: string
  label?: string
  lat?: number | null
  lon?: number | null
  radius?: number | null
  entry_mode?: string
  require_proximity?: boolean
  has_hint?: boolean
  has_manual_fallback?: boolean
  content?: string
  objective?: string
  config_summary?: string[]
  messages?: {
    hint?: string
    gps_unavailable?: string
    locked?: string
  }
}

export type AdminRawStage = Record<string, unknown>

export type AdminStagesResponse = {
  status: 'ok' | 'fail'
  message?: string
  stages?: AdminRawStage[]
}

export type AdminSaveResponse = {
  status: 'ok' | 'fail'
  message?: string
}

export type AdminReactOverviewProfile = {
  id: string
  display_name: string
  mode?: string
  status?: string
  level?: number | null
  finished?: boolean
  presence?: string
  gps_status?: string
  last_seen?: number | string | null
}

export type AdminReactOverviewResponse = {
  status: 'ok' | 'fail' | 'password_change_required'
  message?: string
  config?: {
    site_name?: string
    admin_title?: string
    admin_subtitle?: string
    player_theme?: string
    map_center?: [number, number]
    map_zoom?: number
  }
  counts?: {
    players: number
    profiles: number
    stages: number
    finished_profiles: number
    family_counts: Record<string, number>
  }
  families?: Array<{ id: string; label: string }>
  stages?: AdminReactOverviewStage[]
  profiles?: AdminReactOverviewProfile[]
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Request failed: HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

export async function fetchPlayerGame(user: string): Promise<PlayerGamePayload> {
  const res = await fetch(`/api/game/${encodeURIComponent(user)}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to load player payload: HTTP ${res.status}`)
  }

  return res.json() as Promise<PlayerGamePayload>
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const res = await fetch('/api/config', {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to load config: HTTP ${res.status}`)
  }

  return res.json() as Promise<PublicConfig>
}

export async function fetchTeamStatus(user: string): Promise<TeamStatusPayload> {
  const res = await fetch(`/api/team/${encodeURIComponent(user)}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to load team payload: HTTP ${res.status}`)
  }

  return res.json() as Promise<TeamStatusPayload>
}

export function advancePlayer(user: string, code: string) {
  return postJson<AdvanceResponse>('/api/advance', { user, code })
}

export function sendHeartbeat(args: {
  user: string
  lat?: number
  lon?: number
  gps_status?: string
  source?: string
}) {
  return postJson('/api/heartbeat', args)
}


export function fetchAdminReactOverview(password: string) {
  return postJson<AdminReactOverviewResponse>('/api/admin/react-overview', { password })
}



async function adminPostJsonResilient(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let payload: unknown = null

  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message)
        : `HTTP ${res.status}`

    throw new Error(message)
  }

  return payload
}

async function adminGetJsonResilient(url: string): Promise<unknown> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  let payload: unknown = null

  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message)
        : `HTTP ${res.status}`

    throw new Error(message)
  }

  return payload
}

function adminPayloadVariantsResilient(password: string, extra: Record<string, unknown> = {}) {
  return [
    { password, ...extra },
    { admin_password: password, ...extra },
    { admin_pass: password, ...extra },
    { admin_key: password, ...extra },
    { key: password, ...extra },
  ]
}

function adminQueryVariantsResilient(password: string) {
  const keys = ['password', 'admin_password', 'admin_pass', 'admin_key', 'key']
  return keys.map((key) => `/api/admin/stages?${key}=${encodeURIComponent(password)}`)
}

function normalizeAdminStagesPayloadResilient(payload: unknown): AdminStagesResponse {
  if (Array.isArray(payload)) {
    return { status: 'ok', stages: payload as AdminRawStage[] }
  }

  if (!payload || typeof payload !== 'object') {
    return { status: 'fail', message: 'Empty response from admin stages endpoint.' }
  }

  const obj = payload as Record<string, unknown>
  const rawStatus = typeof obj.status === 'string' ? obj.status : 'ok'
  const message = typeof obj.message === 'string' ? obj.message : undefined

  const stages =
    Array.isArray(obj.stages)
      ? obj.stages
      : Array.isArray(obj.data)
        ? obj.data
        : Array.isArray(obj.items)
          ? obj.items
          : Array.isArray(obj.nodes)
            ? obj.nodes
            : undefined

  if (rawStatus === 'fail') {
    return { status: 'fail', message: message || 'Admin stages endpoint returned fail.' }
  }

  if (!stages) {
    return { status: 'fail', message: message || 'Admin stages response did not include stages.' }
  }

  return { status: 'ok', stages: stages as AdminRawStage[] }
}

function normalizeAdminSavePayloadResilient(payload: unknown): AdminSaveResponse {
  if (!payload || typeof payload !== 'object') {
    return { status: 'ok' }
  }

  const obj = payload as Record<string, unknown>
  const rawStatus = typeof obj.status === 'string' ? obj.status : 'ok'
  const message = typeof obj.message === 'string' ? obj.message : undefined

  if (rawStatus === 'fail') {
    return { status: 'fail', message: message || 'Admin save endpoint returned fail.' }
  }

  return { status: 'ok', message }
}


export async function fetchAdminStages(password: string): Promise<AdminStagesResponse> {
  const errors: string[] = []

  for (const body of adminPayloadVariantsResilient(password)) {
    try {
      const payload = await adminPostJsonResilient('/api/admin/stages', body)
      const normalized = normalizeAdminStagesPayloadResilient(payload)

      if (normalized.status === 'ok') {
        return normalized
      }

      errors.push(normalized.message || 'Unknown stages POST response error.')
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Unknown stages POST request error.')
    }
  }

  for (const url of adminQueryVariantsResilient(password)) {
    try {
      const payload = await adminGetJsonResilient(url)
      const normalized = normalizeAdminStagesPayloadResilient(payload)

      if (normalized.status === 'ok') {
        return normalized
      }

      errors.push(normalized.message || 'Unknown stages GET response error.')
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Unknown stages GET request error.')
    }
  }

  return {
    status: 'fail',
    message: errors.filter(Boolean).join(' | ') || 'Could not load raw admin stages.',
  }
}

export async function saveAdminStages(
  password: string,
  stages: AdminRawStage[]
): Promise<AdminSaveResponse> {
  const errors: string[] = []

  const payloads = [
    ...adminPayloadVariantsResilient(password, { stages }),
    ...adminPayloadVariantsResilient(password, { data: stages }),
    ...adminPayloadVariantsResilient(password, { nodes: stages }),
  ]

  for (const body of payloads) {
    try {
      const payload = await adminPostJsonResilient('/api/admin/save', body)
      const normalized = normalizeAdminSavePayloadResilient(payload)

      if (normalized.status === 'ok') {
        return normalized
      }

      errors.push(normalized.message || 'Unknown save response error.')
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Unknown save request error.')
    }
  }

  return {
    status: 'fail',
    message: errors.filter(Boolean).join(' | ') || 'Could not save admin stages.',
  }
}

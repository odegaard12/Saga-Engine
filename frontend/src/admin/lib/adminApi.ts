export type AdminPhysicalNodeKind = 'collectible' | 'requirement' | 'clue' | 'bonus'

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
  intro_title?: string
  intro_body?: string
  objective?: string
  config_summary?: string[]
  messages?: {
    hint?: string
    gps_unavailable?: string
    locked?: string
  }
  physical_node_kind?: AdminPhysicalNodeKind
  physical_item_kind?: AdminPhysicalNodeKind
  physical_item_id?: string
  physical_item_label?: string
  qr_payload?: string
  physical_qr?: {
    item_id: string
    label: string
    kind: AdminPhysicalNodeKind
    payload: string
    card_text?: string
    updated_at?: string
  }
}

export type AdminRawStage = Record<string, unknown>

export type AdminProfileAction = 'reset_profile' | 'level_prev' | 'level_next' | 'mark_finished'

export type AdminProfileActionResponse = {
  status: 'ok' | 'error' | 'fail'
  detail?: string
  message?: string
  profile_id?: string
  action?: AdminProfileAction
  previous_level?: number
  level?: number
  finished?: boolean
  total_stages?: number
}

export type AdminConfigSaveResponse = {
  status: 'ok' | 'fail'
  message?: string
}

export type AdminLoginResponse = {
  status: 'ok' | 'fail' | 'password_change_required'
  message?: string
  must_change?: boolean
}

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
  color?: string
  avatar_url?: string
  avatar_initials?: string
  level?: number | null
  finished?: boolean
  presence?: string
  gps_status?: string
  last_seen?: number | string | null
  inventory_snapshot?: any
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

async function adminPostJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
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

export function loginAdmin(password: string) {
  return adminPostJson<AdminLoginResponse>('/api/admin/login', { password })
}

export function logoutAdmin() {
  return adminPostJson<AdminLoginResponse>('/api/admin/logout', {})
}

export function fetchAdminReactOverview(password?: string) {
  return adminPostJson<AdminReactOverviewResponse>(
    '/api/admin/react-overview',
    password ? { password } : {}
  )
}

async function adminPostJsonResilient(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
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
    credentials: 'same-origin',
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

function adminPayloadVariantsResilient(password?: string, extra: Record<string, unknown> = {}) {
  if (!password) {
    return [{ ...extra }]
  }

  return [
    { password, ...extra },
    { admin_password: password, ...extra },
    { admin_pass: password, ...extra },
    { admin_key: password, ...extra },
    { key: password, ...extra },
  ]
}

function adminQueryVariantsResilient(password?: string) {
  if (!password) {
    return ['/api/admin/stages']
  }

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

  const stages = Array.isArray(obj.stages)
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
    return {
      status: 'fail',
      message: 'Admin save returned an empty response.',
    }
  }

  const obj = payload as Record<string, unknown>
  const rawStatus = typeof obj.status === 'string' ? obj.status.toLowerCase() : ''

  const message =
    typeof obj.message === 'string'
      ? obj.message
      : typeof obj.detail === 'string'
        ? obj.detail
        : undefined

  if (rawStatus !== 'ok' && rawStatus !== 'success') {
    return {
      status: 'fail',
      message: message || `Admin save returned status ${rawStatus || 'missing'}.`,
    }
  }

  return {
    status: 'ok',
    message,
  }
}

export async function fetchAdminStages(password?: string): Promise<AdminStagesResponse> {
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
  password: string | undefined,
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

function normalizeAdminConfigSavePayload(payload: unknown): AdminConfigSaveResponse {
  if (!payload || typeof payload !== 'object') {
    return {
      status: 'fail',
      message: 'Admin config save returned an empty response.',
    }
  }

  const obj = payload as Record<string, unknown>
  const rawStatus = typeof obj.status === 'string' ? obj.status.toLowerCase() : ''

  const message =
    typeof obj.message === 'string'
      ? obj.message
      : typeof obj.detail === 'string'
        ? obj.detail
        : undefined

  if (rawStatus !== 'ok' && rawStatus !== 'success') {
    return {
      status: 'fail',
      message: message || `Admin config save returned status ${rawStatus || 'missing'}.`,
    }
  }

  return {
    status: 'ok',
    message,
  }
}

function adminConfigPayloadVariants(password: string | undefined, config: Record<string, unknown>) {
  if (!password) {
    return [{ config }, { data: config }, { ...config }]
  }

  return [
    { password, config },
    { admin_password: password, config },
    { admin_pass: password, config },
    { admin_key: password, config },
    { key: password, config },
    { password, data: config },
    { password, ...config },
  ]
}

export async function saveAdminConfig(
  password: string | undefined,
  config: Record<string, unknown>
): Promise<AdminConfigSaveResponse> {
  const errors: string[] = []

  for (const body of adminConfigPayloadVariants(password, config)) {
    try {
      const res = await fetch('/api/admin/save-config', {
        method: 'POST',
        credentials: 'same-origin',
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

        errors.push(message)
        continue
      }

      const normalized = normalizeAdminConfigSavePayload(payload)

      if (normalized.status === 'ok') {
        return normalized
      }

      errors.push(normalized.message || 'Unknown config save response error.')
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Unknown config save request error.')
    }
  }

  return {
    status: 'fail',
    message: errors.filter(Boolean).join(' | ') || 'Could not save admin config.',
  }
}

export function runAdminProfileAction(profileId: string, action: AdminProfileAction) {
  return adminPostJson<AdminProfileActionResponse>('/api/admin/profile-action', {
    profile_id: profileId,
    action,
  })
}

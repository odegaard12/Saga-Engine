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

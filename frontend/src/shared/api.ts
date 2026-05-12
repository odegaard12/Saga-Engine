import type { PlayerGamePayload, PublicConfig, TeamStatusPayload } from '../types/player'

type AdvanceResponse = {
  status: 'ok' | 'fail'
  user: string
  reason?: string
  requirement?: Record<string, unknown>
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

export async function fetchPlayerGame(
  user: string,
  options: { offlinePack?: boolean } = {},
): Promise<PlayerGamePayload> {
  const suffix = options.offlinePack ? '?offline_pack=true' : ''
  const res = await fetch(`/api/game/${encodeURIComponent(user)}${suffix}`, {
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

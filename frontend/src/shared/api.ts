import type { PlayerGamePayload, PublicConfig } from '../types/player'

type AdvanceResponse = {
  status: 'ok' | 'fail'
  user: string
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

export function advancePlayer(user: string, code: string) {
  return postJson<AdvanceResponse>('/api/advance', { user, code })
}

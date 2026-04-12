import type { PlayerGamePayload } from '../types/player'

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

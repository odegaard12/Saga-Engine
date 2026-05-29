import type { FieldProofsPayload, FieldProofUploadResponse, PlayerGamePayload, PublicConfig, TeamStatusPayload } from '../types/player'

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


export async function fetchFieldProofs(user: string): Promise<FieldProofsPayload> {
  const res = await fetch(`/api/field-proofs?user=${encodeURIComponent(user)}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to load field proofs: HTTP ${res.status}`)
  }

  return res.json() as Promise<FieldProofsPayload>
}

export function uploadFieldProof(args: {
  user: string
  image_data_url: string
  lat: number
  lon: number
  note?: string
  stage_id?: string
  stage_title?: string
}) {
  return postJson<FieldProofUploadResponse>('/api/field-proofs', args)
}


export async function deleteFieldProof(user: string, proofId: string): Promise<{ status: 'ok'; id: string }> {
  const res = await fetch(`/api/field-proofs/${encodeURIComponent(proofId)}?user=${encodeURIComponent(user)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to delete field proof: HTTP ${res.status}`)
  }

  return res.json() as Promise<{ status: 'ok'; id: string }>
}


export function getFieldProofsDownloadUrl(user: string): string {
  return `/api/field-proofs/download?user=${encodeURIComponent(user)}`
}

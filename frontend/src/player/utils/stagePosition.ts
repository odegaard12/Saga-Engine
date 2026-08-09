import type { PlayerGamePayload, PlayerGpsStatus, PlayerStage } from '../../types/player'
import { toFiniteNumber, type LatLon } from './geo'

export function getCurrentStage(payload: PlayerGamePayload): PlayerStage | null {
  if (payload.finished) return null
  return payload.current_stage || payload.stages?.[payload.level] || null
}

export function normalizeGpsStatus(status?: string): PlayerGpsStatus {
  if (!status) return 'unavailable'

  const value = status.toLowerCase()

  if (value === 'ok' || value === 'ready' || value === 'active' || value === 'available') {
    return 'ready'
  }

  if (value === 'stale') return 'stale'
  if (value === 'searching' || value === 'pending') return 'searching'
  if (value === 'error' || value === 'denied') return 'error'

  return 'unavailable'
}

export function getPlayerPosition(payload: PlayerGamePayload): LatLon | null {
  const lat = payload.live_status?.lat
  const lon = payload.live_status?.lon

  if (typeof lat !== 'number' || typeof lon !== 'number') return null

  return { lat, lon }
}

export function getStagePosition(stage: PlayerStage | null): LatLon | null {
  const lat = toFiniteNumber(stage?.lat)
  const lon = toFiniteNumber(stage?.lon)

  if (lat === null || lon === null) return null

  return { lat, lon }
}

export function getStageRadius(stage: PlayerStage | null): number | null {
  const radius = toFiniteNumber(stage?.radius)
  return radius !== null && radius > 0 ? radius : null
}

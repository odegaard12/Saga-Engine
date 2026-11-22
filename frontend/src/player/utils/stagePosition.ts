import type { PlayerGamePayload, PlayerStage } from '../../types/player'
import { toFiniteNumber, type LatLon } from './geo'

export function getCurrentStage(payload: PlayerGamePayload): PlayerStage | null {
  if (payload.finished) return null
  return payload.current_stage || payload.stages?.[payload.level] || null
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

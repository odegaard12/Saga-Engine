import type { PlayerStage } from '../../../types/player'
import {
  getStageResolvedFamily,
  getStageResolvedLabel,
  resolveStageMinigame,
} from './runtime-bridge'

const samples: PlayerStage[] = [
  {
    title: 'Legacy circuit',
    lat: 0,
    lon: 0,
    radius: 30,
    type: 'signal_hunt',
    config: {},
  },
  {
    title: 'Native bearing',
    lat: 0,
    lon: 0,
    radius: 30,
    minigame: {
      type: 'bearing_hunt',
      version: 'v1',
      config: {},
    },
  },
]

for (const stage of samples) {
  const resolved = resolveStageMinigame(stage)
  console.log({
    title: stage.title,
    family: getStageResolvedFamily(stage),
    label: getStageResolvedLabel(stage),
    has_resolved: Boolean(resolved?.resolved),
  })
}

import { createElement } from 'react'

import type {
  PlayerMinigameDefinition,
  PlayerMinigameProps,
} from './types'

export type RegisteredMinigameType = 'signal_hunt' | 'bearing_hunt' | 'circuit_matrix' | 'audio_challenge'

export type RegisteredMinigame = PlayerMinigameDefinition & {
  id: RegisteredMinigameType
  family: RegisteredMinigameType
  title: string
  name: string
  description: string
  status: 'native'
  runtime: 'family-native'
  emoji: string
  icon: string
}

function FamilyNativeRuntimeNotice(_props: PlayerMinigameProps) {
  return createElement(
    'div',
    {
      className:
        'rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-200',
    },
    createElement(
      'div',
      { className: 'mb-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200' },
      'Family-native runtime',
    ),
    createElement(
      'p',
      { className: 'text-zinc-300' },
      'This minigame is resolved through the family-native runtime host.',
    ),
  )
}

export const MINIGAME_REGISTRY: Record<RegisteredMinigameType, RegisteredMinigame> = {
  signal_hunt: {
    type: 'signal_hunt',
    id: 'signal_hunt',
    family: 'signal_hunt',
    label: 'Signal Hunt',
    title: 'Signal Hunt',
    name: 'Signal Hunt',
    description: 'Family-native GPS/proximity signal lock runtime.',
    version: 'v1',
    status: 'native',
    runtime: 'family-native',
    supportsManualFallback: false,
    component: FamilyNativeRuntimeNotice,
    emoji: '📡',
    icon: '📡',
  },
  bearing_hunt: {
    type: 'bearing_hunt',
    id: 'bearing_hunt',
    family: 'bearing_hunt',
    label: 'Bearing Hunt',
    title: 'Bearing Hunt',
    name: 'Bearing Hunt',
    description: 'Family-native compass and orientation runtime.',
    version: 'v1',
    status: 'native',
    runtime: 'family-native',
    supportsManualFallback: false,
    component: FamilyNativeRuntimeNotice,
    emoji: '🧭',
    icon: '🧭',
  },
  circuit_matrix: {
    type: 'circuit_matrix',
    id: 'circuit_matrix',
    family: 'circuit_matrix',
    label: 'Circuit Matrix',
    title: 'Circuit Matrix',
    name: 'Circuit Matrix',
    description: 'Family-native logic/grid runtime.',
    version: 'v1',
    status: 'native',
    runtime: 'family-native',
    supportsManualFallback: false,
    component: FamilyNativeRuntimeNotice,
    emoji: '🧩',
    icon: '🧩',
  },
  audio_challenge: {
    type: 'audio_challenge',
    id: 'audio_challenge',
    family: 'audio_challenge',
    label: 'Audio Challenge',
    title: 'Audio Challenge',
    name: 'Audio Challenge',
    description: 'Mic volume based mini-game.',
    version: 'v1',
    status: 'native',
    runtime: 'family-native',
    supportsManualFallback: false,
    component: FamilyNativeRuntimeNotice,
    emoji: '🎤',
    icon: '🎤',
  },
}

export const minigameRegistry = MINIGAME_REGISTRY
export const MINIGAMES = MINIGAME_REGISTRY
export const minigames = MINIGAME_REGISTRY

export function listRegisteredMinigames(): RegisteredMinigame[] {
  return Object.values(MINIGAME_REGISTRY)
}

export function getRegisteredMinigame(type: string | null | undefined): RegisteredMinigame | null {
  const normalized = String(type || '').trim().toLowerCase() as RegisteredMinigameType
  return MINIGAME_REGISTRY[normalized] || null
}

export function isRegisteredMinigame(type: string | null | undefined): type is RegisteredMinigameType {
  return Boolean(getRegisteredMinigame(type))
}

export function resolveMinigameDefinition(type: string | null | undefined): PlayerMinigameDefinition | null {
  return getRegisteredMinigame(type)
}

export function listMinigameDefinitions(): PlayerMinigameDefinition[] {
  return listRegisteredMinigames()
}

export function isSupportedMinigame(type: string | null | undefined): type is RegisteredMinigameType {
  return isRegisteredMinigame(type)
}

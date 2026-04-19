export type GameCatalogEntry = {
  id: string
  label: string
  category: 'logic' | 'team' | 'sensor' | 'field'
  status: 'legacy' | 'react_native' | 'planned'
  supportsSolo: boolean
  supportsTeam: boolean
  needsGps: boolean
  needsMotion: boolean
  needsMic: boolean
  notes: string
}

export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    id: 'circuit_hack',
    label: 'Circuit Hack',
    category: 'logic',
    status: 'react_native',
    supportsSolo: true,
    supportsTeam: false,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'First React-native minigame checkpoint.',
  },
  {
    id: 'cryptex',
    label: 'Cryptex',
    category: 'logic',
    status: 'react_native',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Rotating word lock tuned for mobile play.',
  },
  {
    id: 'simon_says',
    label: 'Simon Says',
    category: 'logic',
    status: 'react_native',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Fast tactile sequence challenge.',
  },
  {
    id: 'bearing_lock',
    label: 'Bearing Lock',
    category: 'sensor',
    status: 'planned',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: true,
    needsMotion: true,
    needsMic: false,
    notes: 'Compass/orientation-based field lock.',
  },
  {
    id: 'memory_relay',
    label: 'Memory Relay',
    category: 'team',
    status: 'planned',
    supportsSolo: false,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Each player sees part of the sequence.',
  },
  {
    id: 'reactor_sync',
    label: 'Reactor Sync',
    category: 'team',
    status: 'planned',
    supportsSolo: false,
    supportsTeam: true,
    needsGps: true,
    needsMotion: true,
    needsMic: false,
    notes: 'Co-op synchronized multi-device challenge.',
  },
  {
    id: 'signal_hunt',
    label: 'Signal Hunt',
    category: 'field',
    status: 'planned',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: true,
    needsMotion: false,
    needsMic: false,
    notes: 'Map search + field clues + fallback flow.',
  },
  {
    id: 'acoustic_gate',
    label: 'Acoustic Gate',
    category: 'sensor',
    status: 'planned',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: true,
    notes: 'Microphone-driven pattern or tone puzzle.',
  },
  {
    id: 'role_split',
    label: 'Role Split',
    category: 'team',
    status: 'planned',
    supportsSolo: false,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Different screens and roles across players.',
  },
]

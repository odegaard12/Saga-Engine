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
    notes: 'Dial alignment node.',
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
    notes: 'Word-lock puzzle.',
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
    notes: 'Sequence memory challenge.',
  },
  {
    id: 'digital_tuner',
    label: 'Digital Tuner',
    category: 'logic',
    status: 'react_native',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Frequency lock challenge.',
  },
  {
    id: 'radio_azimuth',
    label: 'Radio Azimuth',
    category: 'field',
    status: 'react_native',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Bearing alignment challenge.',
  },
  {
    id: 'gyro_storm',
    label: 'Gyro Storm',
    category: 'sensor',
    status: 'react_native',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Tap-sequence version of the gyro flow.',
  },
  {
    id: 'switchboard',
    label: 'Switchboard',
    category: 'logic',
    status: 'react_native',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Restore switch pattern.',
  },
  {
    id: 'compass_blow',
    label: 'Compass Blow',
    category: 'sensor',
    status: 'react_native',
    supportsSolo: true,
    supportsTeam: true,
    needsGps: false,
    needsMotion: false,
    needsMic: false,
    notes: 'Basic airflow direction puzzle.',
  },
]

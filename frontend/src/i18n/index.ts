export type Locale = 'en' | 'es'

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_STORAGE_KEY = 'saga_locale'

const messages = {
  en: {
    common: {
      language: 'Language',
      save: 'Save',
      close: 'Close',
      loading: 'Loading…',
      error: 'Error',
    },
    admin: {
      missionControl: 'Mission Control',
      nodeEditor: 'Node editor',
      addNode: 'Add node',
      settings: 'Settings',
      players: 'Players',
    },
    player: {
      mission: 'Mission',
      tools: 'Tools',
      inventory: 'Inventory',
      offlineSync: 'Offline sync',
    },
  },
  es: {
    common: {
      language: 'Idioma',
      save: 'Guardar',
      close: 'Cerrar',
      loading: 'Cargando…',
      error: 'Error',
    },
    admin: {
      missionControl: 'Control de misión',
      nodeEditor: 'Editor de nodo',
      addNode: 'Añadir nodo',
      settings: 'Ajustes',
      players: 'Jugadores',
    },
    player: {
      mission: 'Misión',
      tools: 'Herramientas',
      inventory: 'Inventario',
      offlineSync: 'Sincronización offline',
    },
  },
} as const

export type TranslationKey =
  | 'common.language'
  | 'common.save'
  | 'common.close'
  | 'common.loading'
  | 'common.error'
  | 'admin.missionControl'
  | 'admin.nodeEditor'
  | 'admin.addNode'
  | 'admin.settings'
  | 'admin.players'
  | 'player.mission'
  | 'player.tools'
  | 'player.inventory'
  | 'player.offlineSync'

function isLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'es'
}

export function getLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

export function setLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore storage failures.
  }

  window.dispatchEvent(new CustomEvent('saga:locale-change', { detail: { locale } }))
}

function readMessage(locale: Locale, key: TranslationKey): string | undefined {
  const parts = key.split('.')
  let current: unknown = messages[locale]

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined
    }

    current = (current as Record<string, unknown>)[part]
  }

  return typeof current === 'string' ? current : undefined
}

export function t(key: TranslationKey, locale: Locale = getLocale()) {
  return readMessage(locale, key) || readMessage(DEFAULT_LOCALE, key) || key
}

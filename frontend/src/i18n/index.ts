export type Locale = 'en' | 'es'

export const DEFAULT_LOCALE: Locale = 'es'
export const LOCALE_STORAGE_KEY = 'saga_locale'

export const messages = {
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
    editor: {
      gameAuthoring: {
        title: 'Game authoring',
        subtitle: 'Define how this node plays.',
        completionTitle: 'How players complete this node',
        completionHelp: 'Foundation only: this metadata is saved but not enforced yet.',
        completionMethod: 'Completion method',
        methodProximity: 'Reach the place',
        methodManualCode: 'Enter a code',
        methodQr: 'Scan QR',
        methodNfc: 'Open NFC',
        methodMinigame: 'Complete minigame',
        methodItem: 'Use item',
        requiredItemTitle: 'Required item',
        requiredItemId: 'Item id',
        requiredItemLabel: 'Player label',
        requiredItemQuantity: 'Quantity',
        consumeItem: 'Consume item when used',
        rewardTitle: 'Reward',
        rewardItemId: 'Reward item id',
        rewardItemLabel: 'Reward label',
        rewardMessage: 'Completion message',
      },
    },
    player: {
      mission: 'Mission',
      missionEntry: 'Mission entry',
      tools: {
        button: 'Tools',
        close: 'Close tools',
        title: 'Player tools',
        subtitle: 'Offline sync, items and quick links.',
        enableDebug: 'Enable local debug',
        disableDebug: 'Disable local debug',
      },
      hud: {
        details: 'Details',
        hideDetails: 'Hide details',
      },
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
    editor: {
      gameAuthoring: {
        title: 'Autoría de juego',
        subtitle: 'Define cómo se juega este nodo.',
        completionTitle: 'Cómo se completa este nodo',
        completionHelp: 'Solo foundation: esta metadata se guarda, pero todavía no se aplica.',
        completionMethod: 'Método de completado',
        methodProximity: 'Llegar al sitio',
        methodManualCode: 'Introducir código',
        methodQr: 'Escanear QR',
        methodNfc: 'Abrir NFC',
        methodMinigame: 'Completar minijuego',
        methodItem: 'Usar objeto',
        requiredItemTitle: 'Objeto requerido',
        requiredItemId: 'ID del objeto',
        requiredItemLabel: 'Etiqueta visible',
        requiredItemQuantity: 'Cantidad',
        consumeItem: 'Consumir objeto al usarlo',
        rewardTitle: 'Recompensa',
        rewardItemId: 'ID del objeto de recompensa',
        rewardItemLabel: 'Etiqueta de recompensa',
        rewardMessage: 'Mensaje al completar',
      },
    },
    player: {
      mission: 'Misión',
      missionEntry: 'Entrada de misión',
      tools: {
        button: 'Herramientas',
        close: 'Cerrar herramientas',
        title: 'Herramientas del jugador',
        subtitle: 'Sincronización offline, objetos y accesos rápidos.',
        enableDebug: 'Activar debug local',
        disableDebug: 'Desactivar debug local',
      },
      hud: {
        details: 'Detalles',
        hideDetails: 'Ocultar detalles',
      },
      inventory: 'Inventario',
      offlineSync: 'Sincronización offline',
    },
  },
} as const

type Messages = typeof messages.en

type Join<K, P> = K extends string
  ? P extends string
    ? `${K}.${P}`
    : never
  : never

type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T]: T[K] extends string ? K : Join<K, Leaves<T[K]>>
    }[keyof T]

export type TranslationKey = Leaves<Messages>

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

export type Locale = 'es' | 'gl' | 'en'

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
      liveMission: 'Live mission',
      nodes: 'nodes',
      profiles: 'profiles',
      mapped: 'mapped',
      refresh: 'Refresh',
      saving: 'Saving…',
      saved: 'Saved',
      families: 'Families',
      route: 'Route',
      untitledNode: 'Untitled node',
      emptyRouteHelp: 'Click Add node to create an empty node or start from a template.',
      builder: 'Builder',
      settingsPanel: {
        title: 'Mission settings',
        subtitle: 'Configure admin copy, player intro text and map defaults.',
        themeLabel: 'theme',
        identity: 'Identity',
        identitySubtitle: 'Visible names and admin labels',
        siteName: 'Site name',
        adminTitle: 'Admin title',
        adminSubtitle: 'Admin subtitle',
        loginSubtitle: 'Login subtitle',
        mapDefaults: 'Map defaults',
        mapDefaultsSubtitle: 'Initial center and zoom',
        latitude: 'Latitude',
        longitude: 'Longitude',
        zoom: 'Zoom',
        mapboxTitle: 'Mapbox Configuration',
        mapboxSubtitle: 'Tiles and styling',
        mapboxWarningTitle: '⚠️ Mapbox Quota Warning',
        mapboxWarningText:
          'The free tier limit is 200,000 requests per month. If you configure a Mapbox token, please monitor your usage at console.mapbox.com to avoid unexpected charges. SAGA offline downloads rely on these requests.',
        mapboxToken: 'Mapbox Access Token',
        mapboxStyle: 'Mapbox Style URL (Optional)',
        story: 'Story',
        storySubtitle: 'Player-facing mission narrative',
        storyTitle: 'Story title',
        storyText: 'Story text',
        prologue: 'Prologue',
        prologueSubtitle: 'Opening screen before gameplay',
        prologueTitle: 'Prologue title',
        prologueSubtitle2: 'Prologue subtitle',
        prologueBody: 'Prologue body',
        saveFailed: 'Settings save failed',
        saving: 'Saving settings…',
        saved: 'Settings saved',
        save: 'Save settings',
      },
    },
    editor: {
      gameAuthoring: {
        title: 'Game authoring',
        subtitle: 'Define how this node plays.',
        completionTitle: 'How players complete this node',
        completionHelp:
          'Offline plan: saved with the node; runtime-ready games already apply their own completion.',
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
        title: 'Tools',
        subtitle: 'Offline, photos & help',
        enableDebug: 'Enable local debug',
        disableDebug: 'Disable local debug',
        offlineOp: 'Offline Operation',
        fieldActions: 'Field Actions',
        downloadPhotos: 'Download photos',
        noPhotos: 'No photos in route',
        altCode: 'Alternative Code',
        altCodeHelp: 'Use it if you cannot scan the QR.',
        hideForm: 'Hide form',
        manualCode: 'Enter manual code',
        codePlaceholder: 'ENTER CODE',
        verifying: 'Verifying...',
        completeNode: 'Complete node',
        deviceSettings: 'Device Settings',
        language: 'Language / Lingua',
        adminPanel: 'Admin Panel',
        exitDebug: 'Exit GPS Test',
        debugMode: 'GPS Test Mode',
        switchPlayer: 'Switch Player / Back to Selection',
      },
      hud: {
        details: 'Details',
        hideDetails: 'Hide details',
      },
      inventory: 'Inventory',
      offlineSync: 'Offline sync',
      requirements: {
        title: 'Node requirement',
        needs: 'Needs',
        youHave: 'You have it',
        missing: 'Missing item',
        quantity: 'Quantity',
        consume: 'Will be consumed when used',
        previewOnly: 'Preview only: backend enforcement comes later.',
      },
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
      liveMission: 'Misión activa',
      nodes: 'nodos',
      profiles: 'perfiles',
      mapped: 'mapeados',
      refresh: 'Recargar',
      saving: 'Guardando…',
      saved: 'Guardado',
      families: 'Familias',
      route: 'Ruta',
      untitledNode: 'Nodo sin título',
      emptyRouteHelp: 'Pulsa Añadir nodo para crear un nodo suelto o arrancar una plantilla.',
      builder: 'Crear',
      settingsPanel: {
        title: 'Ajustes de la misión',
        subtitle: 'Configura textos del admin, introducción para jugadores y mapa.',
        themeLabel: 'tema',
        identity: 'Identidad',
        identitySubtitle: 'Nombres visibles y etiquetas del admin',
        siteName: 'Nombre del sitio',
        adminTitle: 'Título admin',
        adminSubtitle: 'Subtítulo admin',
        loginSubtitle: 'Subtítulo del login',
        mapDefaults: 'Valores del mapa',
        mapDefaultsSubtitle: 'Centro y zoom iniciales',
        latitude: 'Latitud',
        longitude: 'Longitud',
        zoom: 'Zoom',
        mapboxTitle: 'Configuración de Mapbox',
        mapboxSubtitle: 'Mapas y diseño premium',
        mapboxWarningTitle: '⚠️ Aviso de Cuota Mapbox',
        mapboxWarningText:
          'El límite gratuito es de 200.000 peticiones al mes. Si configuras un token, vigila tu consumo en console.mapbox.com para evitar cargos sorpresa. Las descargas offline de SAGA consumen estas peticiones.',
        mapboxToken: 'Token de Mapbox',
        mapboxStyle: 'URL del Estilo (Opcional)',
        story: 'Historia',
        storySubtitle: 'Narrativa de la misión para el jugador',
        storyTitle: 'Título de la historia',
        storyText: 'Texto de la historia',
        prologue: 'Prólogo',
        prologueSubtitle: 'Pantalla inicial antes de jugar',
        prologueTitle: 'Título del prólogo',
        prologueSubtitle2: 'Subtítulo del prólogo',
        prologueBody: 'Cuerpo del prólogo',
        saveFailed: 'Error al guardar ajustes',
        saving: 'Guardando ajustes…',
        saved: 'Ajustes guardados',
        save: 'Guardar ajustes',
      },
    },
    editor: {
      gameAuthoring: {
        title: 'Autoría de juego',
        subtitle: 'Define cómo se juega este nodo.',
        completionTitle: 'Cómo se completa este nodo',
        completionHelp:
          'Plan offline: se guarda con el nodo; los juegos marcados como jugables ya aplican su finalización.',
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
        title: 'Herramientas',
        subtitle: 'Offline, fotos y ayuda',
        enableDebug: 'Activar debug local',
        disableDebug: 'Desactivar debug local',
        offlineOp: 'Operación Offline',
        fieldActions: 'Acciones de Campo',
        downloadPhotos: 'Descargar fotos',
        noPhotos: 'Sin fotos en ruta',
        altCode: 'Código alternativo',
        altCodeHelp: 'Úsalo si no puedes escanear el QR.',
        hideForm: 'Ocultar formulario',
        manualCode: 'Introducir código manual',
        codePlaceholder: 'INGRESA EL CÓDIGO',
        verifying: 'Verificando...',
        completeNode: 'Completar nodo',
        deviceSettings: 'Ajustes de Dispositivo',
        language: 'Idioma / Lingua',
        adminPanel: 'Panel Admin',
        exitDebug: 'Salir de Prueba GPS',
        debugMode: 'Modo Prueba GPS',
        switchPlayer: 'Cambiar de Jugador / Volver a Selección',
      },
      hud: {
        details: 'Detalles',
        hideDetails: 'Ocultar detalles',
      },
      inventory: 'Inventario',
      offlineSync: 'Sincronización offline',
      requirements: {
        title: 'Requisito del nodo',
        needs: 'Necesitas',
        youHave: 'Lo tienes',
        missing: 'Te falta',
        quantity: 'Cantidad',
        consume: 'Se consumirá al usarlo',
        previewOnly: 'Solo vista previa: la validación backend viene después.',
      },
    },
  },
  gl: {
    common: {
      language: 'Lingua',
      save: 'Gardar',
      close: 'Pechar',
      loading: 'Cargando…',
      error: 'Erro',
    },
    admin: {
      missionControl: 'Control de misión',
      nodeEditor: 'Editor de nodo',
      addNode: 'Engadir nodo',
      settings: 'Axustes',
      players: 'Xogadores',
      liveMission: 'Misión activa',
      nodes: 'nodos',
      profiles: 'perfiles',
      mapped: 'mapeados',
      refresh: 'Recargar',
      saving: 'Gardando…',
      saved: 'Gardado',
      families: 'Familias',
      route: 'Ruta',
      untitledNode: 'Nodo sen título',
      emptyRouteHelp: 'Preme Engadir nodo para crear un nodo solto ou arrancar unha plantilla.',
      builder: 'Crear',
      settingsPanel: {
        title: 'Axustes da misión',
        subtitle: 'Configura textos do admin, introdución para xogadores e mapa.',
        themeLabel: 'tema',
        identity: 'Identidade',
        identitySubtitle: 'Nomes visibles e etiquetas do admin',
        siteName: 'Nome do sitio',
        adminTitle: 'Título admin',
        adminSubtitle: 'Subtítulo admin',
        loginSubtitle: 'Subtítulo do login',
        mapDefaults: 'Valores do mapa',
        mapDefaultsSubtitle: 'Centro e zoom iniciais',
        latitude: 'Latitude',
        longitude: 'Lonxitude',
        zoom: 'Zoom',
        mapboxTitle: 'Configuración de Mapbox',
        mapboxSubtitle: 'Mapas e deseño premium',
        mapboxWarningTitle: '⚠️ Aviso de Cota Mapbox',
        mapboxWarningText:
          'O límite gratuíto é de 200.000 peticións ao mes. Se configuras un token, vixía o teu consumo en console.mapbox.com para evitar cargos sorpresa.',
        mapboxToken: 'Token de Mapbox',
        mapboxStyle: 'URL do Estilo (Opcional)',
        story: 'Historia',
        storySubtitle: 'Narrativa da misión para o xogador',
        storyTitle: 'Título da historia',
        storyText: 'Texto da historia',
        prologue: 'Prólogo',
        prologueSubtitle: 'Pantalla inicial antes de xogar',
        prologueTitle: 'Título do prólogo',
        prologueSubtitle2: 'Subtítulo do prólogo',
        prologueBody: 'Cuerpo do prólogo',
        saveFailed: 'Erro ao gardar axustes',
        saving: 'Gardando axustes…',
        saved: 'Axustes gardados',
        save: 'Gardar axustes',
      },
    },
    editor: {
      gameAuthoring: {
        title: 'Autoría de xogo',
        subtitle: 'Define como se xoga este nodo.',
        completionTitle: 'Como se completa este nodo',
        completionHelp:
          'Plan sen conexión: gárdase co nodo; os xogos marcados como xogables xa aplican o seu remate.',
        completionMethod: 'Método de completado',
        methodProximity: 'Chegar ao lugar',
        methodManualCode: 'Introducir código',
        methodQr: 'Escanear QR',
        methodNfc: 'Abrir NFC',
        methodMinigame: 'Completar minixogo',
        methodItem: 'Usar obxecto',
        requiredItemTitle: 'Obxecto requirido',
        requiredItemId: 'ID do obxecto',
        requiredItemLabel: 'Etiqueta visible',
        requiredItemQuantity: 'Cantidade',
        consumeItem: 'Consumir obxecto ao usalo',
        rewardTitle: 'Recompensa',
        rewardItemId: 'ID do obxecto de recompensa',
        rewardItemLabel: 'Etiqueta de recompensa',
        rewardMessage: 'Mensaxe ao completar',
      },
    },
    player: {
      mission: 'Misión',
      missionEntry: 'Entrada de misión',
      tools: {
        button: 'Ferramentas',
        close: 'Pechar ferramentas',
        title: 'Ferramentas',
        subtitle: 'Sen conexión, fotos e axuda',
        enableDebug: 'Activar debug local',
        disableDebug: 'Desactivar debug local',
        offlineOp: 'Operación Sen Conexión',
        fieldActions: 'Accións de Campo',
        downloadPhotos: 'Descargar fotos',
        noPhotos: 'Sen fotos na ruta',
        altCode: 'Código alternativo',
        altCodeHelp: 'Úsao se non podes escanear o QR.',
        hideForm: 'Ocultar formulario',
        manualCode: 'Introducir código manual',
        codePlaceholder: 'INTRODUCE O CÓDIGO',
        verifying: 'Verificando...',
        completeNode: 'Completar nodo',
        deviceSettings: 'Axustes de Dispositivo',
        language: 'Idioma / Lingua',
        adminPanel: 'Panel Admin',
        exitDebug: 'Saír de Proba GPS',
        debugMode: 'Modo Proba GPS',
        switchPlayer: 'Cambiar de Xogador / Volver á Selección',
      },
      hud: {
        details: 'Detalles',
        hideDetails: 'Ocultar detalles',
      },
      inventory: 'Inventario',
      offlineSync: 'Sincronización sen conexión',
      requirements: {
        title: 'Requisito do nodo',
        needs: 'Necesitas',
        youHave: 'Tolo tes',
        missing: 'Fáltache',
        quantity: 'Cantidade',
        consume: 'Consumirase ao usalo',
        previewOnly: 'Só vista previa: a validación backend vén despois.',
      },
    },
  },
} as const

type Messages = typeof messages.en

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never

type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T]: T[K] extends string ? K : Join<K, Leaves<T[K]>>
    }[keyof T]

export type TranslationKey = Leaves<Messages>

export function isLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'es' || value === 'gl'
}

/**
 * Idioma de la misión: el que el admin puso en `ui_lang`.
 *
 * No se guarda en localStorage a propósito. Ahí sólo va lo que el jugador elige
 * a mano, y esa elección tiene que seguir mandando aunque cambie la misión.
 */
let localeDeLaMision: Locale | null = null

function localeElegidoAMano(): Locale | null {
  if (typeof window === 'undefined') return null
  try {
    const val = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isLocale(val)) return val
  } catch {
    // Ignore storage failures.
  }
  return null
}

/**
 * Adopta el idioma que trae la configuración pública.
 *
 * Sin esto la app arrancaba SIEMPRE en castellano aunque la misión estuviese en
 * gallego: `ui_lang` sólo lo leía la pantalla de login. Los jugadores veían los
 * textos de la historia en gallego y los botones en castellano, y para
 * arreglarlo tenían que entrar en Herramientas uno a uno.
 */
export function adoptarIdiomaDeLaMision(uiLang?: string | null) {
  const raw = String(uiLang || '').trim().toLowerCase()
  const siguiente: Locale | null = raw.startsWith('gl')
    ? 'gl'
    : raw.startsWith('en')
      ? 'en'
      : raw.startsWith('es')
        ? 'es'
        : null

  if (!siguiente || siguiente === localeDeLaMision) return

  localeDeLaMision = siguiente

  // Si el jugador ya eligió idioma, el suyo manda y no se avisa a nadie.
  if (localeElegidoAMano()) return

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('saga:locale-change', { detail: { locale: siguiente } }))
  }
}

export function getLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const aMano = localeElegidoAMano()
  if (aMano) return aMano
  return localeDeLaMision || DEFAULT_LOCALE
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


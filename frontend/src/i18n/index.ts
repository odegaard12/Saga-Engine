export type Locale = 'es' | 'gl' // 13/11: sin inglés (decisión de Óscar); un `en` guardado cae a `es`

export const DEFAULT_LOCALE: Locale = 'es'
export const LOCALE_STORAGE_KEY = 'saga_locale'

export const messages = {
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
        title: 'Ajustes',
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
    player: {
      mission: 'Misión',
      missionEntry: 'Entrada de misión',
      backpack: { button: 'Mochila', close: 'Cerrar' },
      tools: {
        button: 'Herramientas',
        close: 'Cerrar herramientas',
        title: 'Herramientas',
        subtitle: 'Offline, fotos y ayuda',
        offlineOp: 'Operación sin conexión',
        fieldActions: 'Acciones de campo',
        downloadPhotos: 'Descargar fotos',
        noPhotos: 'Sin fotos en ruta',
        photosPending: 'sin subir',
        altCode: 'Código alternativo',
        altCodeHelp: 'Úsalo si no puedes escanear el QR.',
        hideForm: 'Ocultar formulario',
        manualCode: 'Introducir código manual',
        codePlaceholder: 'INTRODUCE EL CÓDIGO',
        verifying: 'Verificando...',
        completeNode: 'Completar nodo',
        deviceSettings: 'Ajustes del dispositivo',
        language: 'Idioma / Lingua',
        exitDebug: 'Salir de Prueba GPS',
        debugMode: 'Modo Prueba GPS',
      },
      hud: {
      },
      mapaMudo: {
        clueTitle: 'Pista',
        cluePhotoAlt: 'Foto de la pista',
        hotColdLabel: '¿Qué tan cerca estoy?',
        cold: 'Frío',
        warm: 'Templado',
        hot: 'Caliente',
      },
      inventory: 'Inventario',
      offlineSync: 'Sincronización offline',
      minigames: {
        rumboDoble: {
          progress: 'Objetivo {current}/{total}',
          locked: 'Rumbo bloqueado',
          holdSteady: 'Mantén el móvil quieto',
        },
        cuentaSenales: {
          attempt: 'Intento {current}/{total}',
          wrong: 'Respuesta incorrecta. Inténtalo de nuevo.',
          penalty: '{attempts} fallos. +{seconds}s de penalización, pero puedes seguir intentándolo.',
          approach: 'Acércate al punto para ver la pregunta.',
        },
        pulsoHierro: {
          roundProgress: 'Ronda {current}/{total}',
          holdSteady: 'Sujeta el móvil lo más quieto posible',
          watchSequence: 'Observa la secuencia…',
          yourTurn: 'Tu turno: repite la secuencia',
          unstable: 'Demasiado movimiento: ronda reiniciada',
          restabilize: 'Vuelve a estar quieto para continuar',
          completed: 'Secuencia completa',
        },
        wordTrap: {
          round: 'Ronda {current}/{total}',
          correct: '¡Correcto!',
          wrong: 'Trampa. Sigue con la siguiente.',
          timeout: 'Se acabó el tiempo. Sigue con la siguiente.',
          penalty: '+{seconds}s de penalización, pero puedes seguir.',
        },
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
        title: 'Axustes',
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
    player: {
      mission: 'Misión',
      missionEntry: 'Entrada de misión',
      backpack: { button: 'Mochila', close: 'Pechar' },
      tools: {
        button: 'Ferramentas',
        close: 'Pechar ferramentas',
        title: 'Ferramentas',
        subtitle: 'Sen conexión, fotos e axuda',
        offlineOp: 'Operación sen conexión',
        fieldActions: 'Accións de campo',
        downloadPhotos: 'Descargar fotos',
        noPhotos: 'Sen fotos na ruta',
        photosPending: 'sen subir',
        altCode: 'Código alternativo',
        altCodeHelp: 'Úsao se non podes escanear o QR.',
        hideForm: 'Ocultar formulario',
        manualCode: 'Introducir código manual',
        codePlaceholder: 'INTRODUCE O CÓDIGO',
        verifying: 'Verificando...',
        completeNode: 'Completar nodo',
        deviceSettings: 'Axustes do dispositivo',
        language: 'Idioma / Lingua',
        exitDebug: 'Saír de Proba GPS',
        debugMode: 'Modo Proba GPS',
      },
      hud: {
      },
      mapaMudo: {
        clueTitle: 'Pista',
        cluePhotoAlt: 'Foto da pista',
        hotColdLabel: 'Que preto estou?',
        cold: 'Frío',
        warm: 'Morno',
        hot: 'Quente',
      },
      inventory: 'Inventario',
      offlineSync: 'Sincronización sen conexión',
      minigames: {
        rumboDoble: {
          progress: 'Obxectivo {current}/{total}',
          locked: 'Rumbo bloqueado',
          holdSteady: 'Mantén o móbil quieto',
        },
        cuentaSenales: {
          attempt: 'Intento {current}/{total}',
          wrong: 'Resposta incorrecta. Téntao de novo.',
          penalty: '{attempts} fallos. +{seconds}s de penalización, pero podes seguir tentándoo.',
          approach: 'Achégate ao punto para ver a pregunta.',
        },
        pulsoHierro: {
          roundProgress: 'Rolda {current}/{total}',
          holdSteady: 'Suxeita o móbil o máis quieto posible',
          watchSequence: 'Observa a secuencia…',
          yourTurn: 'A túa vez: repite a secuencia',
          unstable: 'Demasiado movemento: rolda reiniciada',
          restabilize: 'Volve estar quieto para continuar',
          completed: 'Secuencia completa',
        },
        wordTrap: {
          round: 'Rolda {current}/{total}',
          correct: 'Correcto!',
          wrong: 'Trampa. Segue coa seguinte.',
          timeout: 'Acabouse o tempo. Segue coa seguinte.',
          penalty: '+{seconds}s de penalización, pero podes seguir.',
        },
      },
    },
  },
} as const

type Messages = typeof messages.es

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never

type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T]: T[K] extends string ? K : Join<K, Leaves<T[K]>>
    }[keyof T]

export type TranslationKey = Leaves<Messages>

export function isLocale(value: string | null): value is Locale {
  return value === 'es' || value === 'gl'
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
    // Quien tenía guardado `en` (ya no existe) pasa a castellano sin error: se olvida la elección.
    if (val) window.localStorage.removeItem(LOCALE_STORAGE_KEY)
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


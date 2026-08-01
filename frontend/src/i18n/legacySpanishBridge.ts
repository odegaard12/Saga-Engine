import { getLocale } from './index'

const sources = new WeakMap<Text, string>()

const ES: Record<string, string> = {
  'Locked / success copy': 'Mensaje de bloqueo / éxito',
  'Source radius meters': 'Radio de origen',
  'Lock threshold': 'Umbral de captura',
  'Hold milliseconds': 'Tiempo de confirmación',
  'Contenido del nodo': 'Texto principal del nodo',
  'Player-facing copy': 'Textos que verá el jugador',
  'GPS unavailable message.':
    'No se pudo obtener la posición GPS. Revisa permisos o usa el código de emergencia.',
  'Move closer to unlock this node.': 'Acércate al nodo para desbloquearlo.',
  'Player added locally. Save players to persist.':
    'Jugador añadido en local. Pulsa Guardar jugadores para persistir.',
  'Player removed locally. Save players to persist.':
    'Jugador eliminado en local. Pulsa Guardar jugadores para persistir.',
  'Saved using fallback payload. Mission data reloaded.':
    'Guardado con payload de respaldo. Datos de misión recargados.',
  'Saved to backend. Mission data reloaded.': 'Guardado en backend. Datos de misión recargados.',
  'Route order updated locally. Save changes to persist.':
    'Orden de ruta actualizado en local. Pulsa Guardar para persistir.',
  'Node moved on map. Save changes to persist the new position.':
    'Nodo movido en el mapa. Pulsa Guardar para persistir la nueva posición.',
  Language: 'Idioma',
  Save: 'Guardar',
  Saved: 'Guardado',
  Refresh: 'Actualizar',
  Close: 'Cerrar',
  Unlock: 'Desbloquear',
  Add: 'Añadir',
  Delete: 'Eliminar',

  'Protected admin access': 'Acceso de administración protegido',
  'ADMIN PASSWORD': 'CLAVE DE ADMIN',
  'Admin password': 'Clave de admin',
  'Enter admin password once': 'Introduce la clave de admin una vez',
  'No mission data is shown before unlock.': 'No se muestran datos de misión antes de desbloquear.',
  'Player entry': 'Entrada de jugador',

  'MISSION ENTRY': 'ENTRADA DE MISIÓN',
  'Enter mission': 'Entrar en misión',
  'Tap an operator to continue.': 'Toca un operador para continuar.',
  Enter: 'Entrar',

  'Mission Control': 'Control de misión',
  'Live mission': 'Misión activa',
  'Mission settings': 'Ajustes de misión',
  Players: 'Jugadores',
  players: 'jugadores',
  Profiles: 'Perfiles',
  profiles: 'perfiles',
  Nodes: 'Nodos',
  nodes: 'nodos',
  mapped: 'en mapa',
  Settings: 'Ajustes',
  Families: 'Familias',
  'Families / labels': 'Familias / etiquetas',
  Route: 'Ruta',
  'Add node': 'Añadir nodo',
  '+ Add node': '+ Añadir nodo',
  Unsaved: 'Sin guardar',
  'Local changes only': 'Cambios locales solamente',
  'Node created from map click. Edit details, then save changes.': '',

  'Node editor': 'Editor de nodo',
  'Untitled node': 'Nodo sin título',
  Basics: 'Básico',
  Location: 'Ubicación',
  Game: 'Juego',
  Messages: 'Mensajes',
  Advanced: 'Avanzado',
  Title: 'Título',
  Family: 'Familia',
  'Node content': 'Contenido del nodo',
  'Core node identity': 'Identidad principal del nodo',
  Latitude: 'Latitud',
  Longitude: 'Longitud',
  'Radius meters': 'Radio en metros',
  'Entry mode': 'Modo de entrada',
  'Require proximity': 'Requerir proximidad',
  'Game config': 'Configuración del juego',
  Objective: 'Objetivo',
  Hint: 'Pista',
  'Live local preview · use Save in Mission Control to persist':
    'Vista local en vivo · usa Guardar en Control de misión para persistir',

  'Players & teams': 'Jugadores y equipos',
  'Manage who can play this mission. Save players to persist changes.':
    'Gestiona quién puede jugar esta misión. Guarda jugadores para persistir los cambios.',
  'Solo profile · active': 'Perfil individual · activo',
  'Player ID': 'ID de jugador',
  'Display name': 'Nombre visible',
  Mode: 'Modo',
  Status: 'Estado',
  'Add player': 'Añadir jugador',
  'Save players': 'Guardar jugadores',
  'Available family-native runtime labels.':
    'Etiquetas disponibles del runtime nativo por familias.',

  'FIELD SESSION': 'SESIÓN DE CAMPO',
  TEAM: 'EQUIPO',
  SOLO: 'SOLO',
  PLAYERS: 'JUGADORES',
  Mission: 'Misión',
  MISSION: 'MISIÓN',
  'Mission complete': 'Misión completada',
  Tools: 'Herramientas',
  'Player tools': 'Herramientas del jugador',
  'Offline sync, items and quick links.': 'Sincronización offline, objetos y accesos rápidos.',
  Details: 'Detalles',
  'Hide details': 'Ocultar detalles',
  FOLLOW: 'SEGUIR',
  'OPEN INTERACTION': 'ABRIR INTERACCIÓN',
  'NO RANGE': 'SIN DISTANCIA',
  'NO GPS': 'SIN GPS',
  'GPS LIVE': 'GPS ACTIVO',
  'GPS REQUIRED': 'GPS REQUERIDO',
  'Position is not ready yet.': 'La posición aún no está lista.',
  'GPS no disponible.': 'GPS no disponible.',

  'OFFLINE MISSION': 'MISIÓN OFFLINE',
  'Download for field play': 'Guardar para jugar en ruta',
  'NOT SAVED': 'SIN GUARDAR',
  READY: 'LISTA',
  'Download mission': 'Descargar misión',
  'Update download': 'Actualizar descarga',
  'Save progress': 'Guardar progreso',
  'Sync pending': 'Sincronizar pendientes',
  'Guardar this mission to the phone before the route. If coverage drops later, SAGA can open the stored mission and keep local progress ready for sync.':
    'Guarda esta misión en el móvil antes de salir. Si luego hay mala cobertura, SAGA podrá abrir la misión guardada y mantener el progreso local listo para sincronizar.',
  'Offline sync': 'Sincronización offline',
  'Offline queue': 'Cola offline',
  Pending: 'Pendientes',
  pending: 'pendientes',
  Level: 'Nivel',
  'Sync now': 'Sincronizar ahora',
  Synced: 'Sincronizado',
  'Never synced': 'Nunca sincronizado',
  'Auto-sync every 20s when pending events exist. Never synced.':
    'Sincronización automática cada 20 s si hay acciones pendientes. Nunca sincronizado.',
  Inventory: 'Inventario',
  Items: 'Objetos',
  items: 'objetos',
  EMPTY: 'VACÍO',
  'No local items yet. QR/NFC/manual item collection can fill this panel next.':
    'Aún no hay objetos. Puedes recogerlos con QR, NFC o código manual.',
  'updated now · local-first gameplay state':
    'actualizado ahora · estado guardado en este dispositivo',
  'Manual item': 'Objeto manual',
  'Manual code': 'Código manual',
  'Collect local inventory': 'Recoger objeto local',
  'Use ITEM:id or ITEM:id:Label': 'Usa ITEM:id o ITEM:id:Etiqueta',
  'Enable local debug': 'Activar debug local',
  'Disable local debug': 'Desactivar debug local',
  'Classic runtime': 'Runtime clásico',

  'Signal Hunt': 'Checkpoint',
  'SIGNAL HUNT TEST NODE': 'NODO DE PRUEBA BÚSQUEDA DE SEÑAL',
  'Bearing Hunt': 'Búsqueda por rumbo',
  'Circuit Matrix': 'Matriz de circuitos',
  '0 pending · ONLINE': '0 pendientes · ONLINE',
  '1 pending · ONLINE': '1 pendiente · ONLINE',
  '0 items': '0 objetos',
  '1 items': '1 objeto',
  'Auto-sync every 20s when pending events exist. Nunca sincronizado.':
    'Sincronización automática cada 20 s si hay acciones pendientes. Nunca sincronizado.',
  'Open interaction': 'Abrir interacción',
  'Configure admin copy, player intro text and map defaults.':
    'Configura textos del admin, introducción del jugador y valores iniciales del mapa.',
  classic: 'clásico',
  theme: 'tema',
  Identity: 'Identidad',
  'Visible names and admin labels': 'Nombres visibles y etiquetas del admin',
  'Site name': 'Nombre del sitio',
  'Admin title': 'Título del admin',
  'Admin subtitle': 'Subtítulo del admin',
  'Map-first control panel': 'Panel de control con mapa',
  'Login subtitle': 'Subtítulo de login',
  'Protected access': 'Acceso protegido',
  'Map defaults': 'Mapa por defecto',
  'Initial center and zoom': 'Centro inicial y zoom',
  'Player theme': 'Tema del jugador',
  Story: 'Historia',
  'Para el jugador mission narrative': 'Narrativa visible para el jugador',
  'Story title': 'Título de historia',
  'Story text': 'Texto de historia',
  Prologue: 'Prólogo',
  'Opening screen before gameplay': 'Pantalla inicial antes de jugar',
  'Prologue title': 'Título del prólogo',
  'Prologue subtitle': 'Subtítulo del prólogo',
  'Prologue body': 'Texto del prólogo',
  'Save settings': 'Guardar ajustes',
  'not synced': 'sin sincronizar',
  updated: 'actualizado',
  'updated now': 'actualizado ahora',
  'local-first gameplay state': 'estado guardado en este dispositivo',
}

const GL: Record<string, string> = {
  'Mochila': 'Mochila',
  'Cerrar mochila': 'Pechar mochila',
  'Herramientas': 'Ferramentas',
  'Cerrar herramientas': 'Pechar ferramentas',
  'Jugadores': 'Xogadores',
  'CONTROL DE EQUIPO': 'CONTROL DE EQUIPO',
  'Centrar en mi ubicación': 'Centrar na miña localización',
  'CENTRAR': 'CENTRAR',
  'Ver todos los nodos': 'Ver todos os nodos',
  'Volver a mi ubicación y seguirme': 'Volver á miña localización e me seguir',
  'Hacer foto de campo': 'Facer foto de campo',
  'Leer historia': 'Ler historia',
  'Historia': 'Historia',
  'Detalles': 'Detalles',
  'Ocultar detalles': 'Ocultar detalles',
  'Inventario': 'Inventario',
  'Sincronización offline': 'Sincronización sen conexión',
  'Requisito del nodo': 'Requisito do nodo',
  'Necesitas': 'Necesitas',
  'Lo tienes': 'Tolo tes',
  'Te falta': 'Fáltache',
  'Cantidad': 'Cantidade',
  'Foto de campo': 'Foto de campo',
  'Linterna ON': 'Lanterna ON',
  'Linterna OFF': 'Lanterna OFF',
  'Cam. Trasera': 'Cám. Traseira',
  'Cam. Frontal': 'Cám. Frontal',
  'Guardar en mapa': 'Gardar no mapa',
  'Repetir foto': 'Repetir foto',
  'Añade una nota a la foto (opcional)...': 'Engade unha nota á foto (opcional)...',
  'Acceso Bloqueado': 'Acceso Bloqueado',
  'Sin cobertura GPS': 'Sen cobertura GPS',
  'GPS ACTIVO': 'GPS ACTIVO',
  'ÚLTIMA POS.': 'ÚLTIMA POS.',
  'BUSCANDO GPS': 'BUSCANDO GPS',
  'ERROR GPS': 'ERRO GPS',
  'SIN GPS': 'SEN GPS',
  'EN LÍNEA': 'EN LÍÑA',
  'RECIENTE': 'RECENTE',
  'SIN SEÑAL': 'SEN SEÑAL',
  'conectado': 'conectado',
  'conectados': 'conectados',
  'jugador': 'xogador',
  'jugadores': 'xogadores',
  'total': 'total',
  'Ningún jugador conectado aún': 'Ningún xogador conectado aínda',
  'Desactivar debug local': 'Desactivar debug local',
  'Activar debug local': 'Activar debug local',
  'Operación Offline': 'Operación Sen Conexión',
  'Acciones de Campo': 'Accións de Campo',
  'Descargar fotos': 'Descargar fotos',
  'Sin fotos en ruta': 'Sen fotos na ruta',
  'Código alternativo': 'Código alternativo',
  'Úsalo si no puedes escanear el QR.': 'Úsao se non podes escanear o QR.',
  'Ocultar formulario': 'Ocultar formulario',
  'Introducir código manual': 'Introducir código manual',
  'INGRESA EL CÓDIGO': 'INTRODUCE O CÓDIGO',
  'Verificando...': 'Verificando...',
  'Completar nodo': 'Completar nodo',
  'Ajustes de Dispositivo': 'Axustes de Dispositivo',
  'Panel Admin': 'Panel Admin',
  'Salir de Prueba GPS': 'Saír de Proba GPS',
  'Modo Prueba GPS': 'Modo Proba GPS',
  'Cambiar de Jugador / Volver a Selección': 'Cambiar de Xogador / Volver á Selección',
  '¡Bien hecho! Has desbloqueado la siguiente pista.': '¡Ben feito! Desbloqueaches a seguinte pista.',
  'Acércate para abrir este nodo.': 'Acércate máis para abrir este nodo.',
  'Acércate más para abrir este nodo.': 'Acércate máis para abrir este nodo.',
  'Ya puedes abrir este nodo.': 'Xa podes abrir este nodo.',
  'Nodo completado.': 'Nodo completado.',
  'Idioma / Lingua': 'Idioma / Lingua',
  'Idioma': 'Lingua',
  'Guardar': 'Gardar',
  'Guardado': 'Gardado',
  'Actualizar': 'Actualizar',
  'Cerrar': 'Pechar',
  'Desbloquear': 'Desbloquear',
  'Añadir': 'Engadir',
  'Eliminar': 'Eliminar',

  // Pack offline & sync
  'Juego offline': 'Xogo sen conexión',
  'Actualizar juego offline': 'Actualizar xogo sen conexión',
  'Preparar juego offline': 'Preparar xogo sen conexión',
  'OFFLINE LISTO': 'SEN CONEXIÓN LISTO',
  'POR PREPARAR': 'POR PREPARAR',
  'SIN CONEXIÓN': 'SEN CONEXIÓN',
  'Guardar progreso': 'Gardar progreso',
  'Guardando…': 'Gardando…',
  'Sincronizando…': 'Sincronizando…',
  'Todo al día': 'Todo ao día',
  'Sincronizar': 'Sincronizar',
  'Descargar paquete offline': 'Descargar paquete sen conexión',
  'Descargar mapas y contenido para jugar sin cobertura': 'Descargar mapas e contido para xogar sen cobertura',

  // Mochila & Guía
  'Guia, objetos y respaldo': 'Guía, obxectos e respaldo',
  'Guía, objetos y respaldo': 'Guía, obxectos e respaldo',
  'Guia': 'Guía',
  'Guía': 'Guía',
  'Objetos': 'Obxectos',
  'Mesa': 'Mesa',
  'Sin radio': 'Sen radio',
  'GUÍA DEL NODO': 'GUÍA DO NODO',
  'Sin nodo seleccionado': 'Sen nodo seleccionado',
  'Selecciona un nodo en el mapa para ver sus detalles.': 'Selecciona un nodo no mapa para ver os seus detalles.',
  'GUÍA PASO A PASO': 'GUÍA PASO A PASO',
  'Misión Activa': 'Misión Activa',
  'Ve al punto en el mapa': 'Vai ao punto no mapa',
  'Equipa el objeto necesario': 'Equipa o obxecto necesario',
  'Captura la señal de radio': 'Captura a sinal de radio',
  'Calibra y triangula': 'Calibra e triangula',
  'Resuelve el código lógico': 'Resolve o código lóxico',
  'Recoge el objeto especial': 'Recolle o obxecto especial',
  'Escanea el objetivo físico': 'Escanea o obxectivo físico',
  'Sigue las instrucciones': 'Sigue as instrucións',
  'Para poder interactuar con este nodo, necesitas tener esto en tu mochila:': 'Para poder interactuar con este nodo, necesitas ter isto na túa mochila:',
  'Acércate para recoger este objeto.': 'Acércate para recoller este obxecto.',
  'Activa GPS para poder recoger el objeto.': 'Activa GPS para poder recoller o obxecto.',
  'Muévete al punto para recoger el objeto.': 'Móvete ao punto para recoller o obxecto.',
  'Un objeto coleccionable se encuentra en esta ubicación. Acércate para recogerlo.': 'Un obxecto coleccionable atópase nesta localización. Acércate para recollelo.',
  'Acércate al nodo para desbloquearlo.': 'Acércate ao nodo para desbloquealo.',
  'Una vez en la zona, mantén tu posición y no salgas del perímetro hasta que la barra de descarga llegue al 100%.': 'Unha vez na zona, mantén a túa posición e non saias do perímetro ata que a barra de descarga chegue ao 100%.',
  'Usa la brújula de tu dispositivo. Gira lentamente sobre ti mismo hasta apuntar en la dirección correcta para revelar la información.': 'Usa a compás do teu dispositivo. Xira lentamente sobre ti mesmo ata apuntar na dirección correcta para revelar a información.',
  'Observa tu entorno real y las pistas que tienes. Deberás introducir una clave, patrón o secuencia correcta para avanzar.': 'Observa o teu contorno real e as pistas que tes. Deberás introducir unha clave, patrón ou secuencia correcta para me avanzar.',
  'Este nodo contiene un objeto. Una vez estés dentro del rango, podrás recogerlo y se guardará automáticamente en tu mochila para usarlo más adelante.': 'Este nodo contén un obxecto. Unha vez esteas dentro do rango, poderás recollelo e gardarase automaticamente na túa mochila para usalo máis adiante.',
  'Debes buscar físicamente un código QR o etiqueta NFC oculta en la vida real. Usa tu cámara para escanearlo cuando lo encuentres.': 'Debes buscar fisicamente un código QR ou etiqueta NFC oculta na vida real. Usa a túa cámara para escanealo cando o atopes.',
  'Lee cuidadosamente la descripción de la misión para saber qué hacer a continuación.': 'Lee coidadosamente a descrición da misión para saber qué facer a continuación.',
}

const GL_TO_ES: Record<string, string> = Object.fromEntries(
  Object.entries(GL).map(([es, gl]) => [gl, es])
)

function translateDynamic(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const isGl = getLocale() === 'gl'

  let match = normalized.match(/^(\d+)\s+pending\s+·\s+ONLINE$/i)
  if (match) return isGl ? `${match[1]} pendentes · ONLINE` : `${match[1]} pendientes · ONLINE`

  match = normalized.match(/^(\d+)\s+items$/i)
  if (match) return isGl ? `${match[1]} obxectos` : `${match[1]} objetos`

  match = normalized.match(/^(\d+)\s*M\s+IN$/i) || normalized.match(/^(\d+)M\s+IN$/i) || normalized.match(/^(\d+)\s*M\s+DENTRO$/i)
  if (match) return isGl ? `${match[1]} M PRETO` : `${match[1]} M CERCA`

  match = normalized.match(/^(\d+)\s*M\s+AWAY$/i) || normalized.match(/^(\d+)M\s+AWAY$/i)
  if (match) return `${match[1]} M`

  match = normalized.match(/^Radio\s+(\d+)\s*m\.?$/i) || normalized.match(/^Raio\s+(\d+)\s*m\.?$/i)
  if (match) return isGl ? `Raio ${match[1]} m.` : `Radio ${match[1]} m.`

  match = normalized.match(/^(?:Radio|Raio)\s+(\d+)\s*m\s+(?:Ya\s+puedes|Xa podes)\s+abrir\s+este\s+nodo\.?$/i)
  if (match) return isGl ? `Raio ${match[1]} m. Xa podes abrir este nodo.` : `Radio ${match[1]} m. Ya puedes abrir este nodo.`

  match = normalized.match(/^(?:Radio|Raio)\s+(\d+)\s*m\s+Acércate\s+(?:máis\s+)?para\s+abrir\s+este\s+nodo\.?$/i)
  if (match) return isGl ? `Raio ${match[1]} m. Acércate máis para abrir este nodo.` : `Radio ${match[1]} m. Acércate para abrir este nodo.`

  return null
}

function translateText(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  const locale = getLocale()
  if (locale === 'gl') {
    if (GL[normalized]) return GL[normalized]
    const foundGl = Object.entries(GL).find(([key]) => key.toLowerCase() === normalized.toLowerCase())
    if (foundGl) return foundGl[1]
  } else if (locale === 'es') {
    if (GL_TO_ES[normalized]) return GL_TO_ES[normalized]
    const foundEs = Object.entries(GL_TO_ES).find(([key]) => key.toLowerCase() === normalized.toLowerCase())
    if (foundEs) return foundEs[1]
  }

  const dynamic = translateDynamic(normalized)
  if (dynamic) return dynamic

  if (ES[normalized]) return ES[normalized]

  const found = Object.entries(ES).find(([key]) => key.toLowerCase() === normalized.toLowerCase())
  return found ? found[1] : null
}

function shouldSkip(text: Text): boolean {
  const parent = text.parentElement
  if (!parent) return true

  return Boolean(
    parent.closest(
      'script,style,code,pre,textarea,input,.leaflet-container,.leaflet-pane,[data-saga-i18n-skip]'
    )
  )
}

function translateNode(text: Text) {
  if (shouldSkip(text)) return

  const current = text.nodeValue || ''
  const source = sources.get(text) || current

  if (!sources.has(text)) {
    sources.set(text, source)
  }

  const locale = getLocale()
  if (locale === 'en') {
    if (text.nodeValue !== source) text.nodeValue = source
    return
  }

  const translated = translateText(source)
  const target = translated || (locale === 'es' && GL_TO_ES[source] ? GL_TO_ES[source] : locale === 'es' ? source : null)
  if (!target) return

  const prefix = source.match(/^\s*/)?.[0] || ''
  const suffix = source.match(/\s*$/)?.[0] || ''
  text.nodeValue = `${prefix}${target}${suffix}`
}

function translateAttributes() {
  document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((element) => {
    for (const attr of ['placeholder', 'aria-label', 'title']) {
      const current = element.getAttribute(attr)
      if (!current) continue

      const sourceAttr = `data-saga-i18n-${attr}`
      const source = element.getAttribute(sourceAttr) || current

      if (!element.hasAttribute(sourceAttr)) {
        element.setAttribute(sourceAttr, source)
      }

      const locale = getLocale()
      if (locale === 'en') {
        element.setAttribute(attr, source)
        continue
      }

      const translated = translateText(source) || (locale === 'es' ? GL_TO_ES[source] || source : null)
      if (translated) element.setAttribute(attr, translated)
    }
  })
}

function walk() {
  translateAttributes()

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    translateNode(node as Text)
    node = walker.nextNode()
  }
}

let observer: MutationObserver | null = null
let scheduled = false

function scheduleWalk() {
  if (scheduled) return
  scheduled = true
  window.requestAnimationFrame(() => {
    scheduled = false
    walk()
  })
}

export function setupLegacySpanishBridge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (observer) return

  observer = new MutationObserver(scheduleWalk)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'title'],
  })

  window.addEventListener('saga:locale-change', scheduleWalk)
  scheduleWalk()
}

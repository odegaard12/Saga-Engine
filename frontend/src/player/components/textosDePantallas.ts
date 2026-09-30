import type { Locale } from '../../i18n'

/**
 * Textos de las pantallas del jugador que estaban escritas en un solo idioma
 * (o en dos a la vez): la pantalla final, la hoja de clasificación, «usar el
 * objeto» y los avisos del escáner de pegatinas.
 *
 * Mismo mecanismo y mismas razones que `minigames/core/textos.ts`: cada texto
 * existe en es, gl y en, `gl` y `en` son del tipo de `es` (si falta una clave, o
 * una función cambia de parámetros, no compila), y no se toca `i18n/index.ts`.
 * Donde ya había una versión en gallego se ha respetado tal cual.
 */

const es = {
  final: {
    titulo: 'Misión completada',
    subtituloAntes: 'Ruta completa, agente ',
    subtituloDespues: (nodos: number) => `. Has recorrido los ${nodos} nodos de la travesía.`,
    nodos: 'Nodos',
    tiempoTotal: 'Tiempo total',
    fotos: 'Fotos',
    bannerFinalAntes: 'Clasificación final · ',
    // `: string` a propósito: sin él TypeScript infiere la unión de literales y
    // ' xogador' (gl) no encajaría con el tipo de `es`.
    bannerFinalDespues: (n: number): string => (n === 1 ? ' jugador' : ' jugadores'),
    bannerEsperaAntes: 'Esperando a que terminen los demás · ',
    tituloFinal: '🏁 CLASIFICACIÓN FINAL',
    tituloProvisional: '⏳ CLASIFICACIÓN PROVISIONAL',
    regla: 'Solo cuenta el tiempo dentro de cada nodo. El camino entre ellos no puntúa.',
    revisadaTitulo: 'Clasificación revisada.',
    revisadaTexto:
      ' Se corrigieron los relojes que siguieron corriendo sin jugar y se retiraron las penalizaciones que vienen de un fallo del lector de pegatinas. El detalle de cada cambio está en la página de la clasificación.',
    tu: 'tú',
    nodoDe: (nivel: number, total: number) => `Nodo ${nivel}/${total}`,
    verMapa: 'Ver mapa de la ruta',
    salir: 'Salir',
  },

  clasificacion: {
    titulo: 'Clasificación',
    jugadores: (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`,
    enLinea: (n: number) => ` · ${n} en línea`,
    vacioTitulo: 'Todavía no hay tiempos',
    vacioDetalle: 'Aparecerán en cuanto alguien complete un nodo.',
    tu: 'Tú',
    nodo: (n: number) => `Nodo ${n}`,
    cerrar: 'Cerrar',
  },

  usarObjeto: {
    hechoTitulo: 'La puerta cede',
    hechoTexto: (objeto: string) => `${objeto} ha encajado en su sitio.`,
    usandoTitulo: 'Encajando…',
    usandoTexto: 'No lo sueltes.',
    listoTexto: 'Llévalo encima. Este nodo no se abre sin él: úsalo para entrar.',
    usar: (objeto: string) => `Usar ${objeto}`,
    ahoraNo: 'Ahora no',
  },

  escaner: {
    inicial: 'Escanea una tarjeta QR de SAGA. Se guardará automáticamente en Objetos.',
    apunta: 'Apunta la cámara a la tarjeta QR de SAGA.',
    noSeLee: 'No se lee sola: pulsa 📸 Hacer foto y validar.',
    noSeVe: 'No se ve bien. Otra foto, más cerca y sin mover.',
    falloAlLeer: 'Fallo al leer. Escribe el código abajo.',
    qrNoLeido: 'QR no leído. Prueba otra vez o usa Mochila > Respaldo.',
    pegatinaRegistrando: 'Pegatina correcta. Registrando el nodo…',
    guardado: (tipos: number) =>
      `Guardado en Objetos. Tienes ${tipos} tipo${tipos === 1 ? '' : 's'} de objeto.`,
    noRegistrado:
      'Leí la pegatina, pero el nodo no llegó a registrarse. Prueba otra vez o usa el código de respaldo.',
    pegatinaCompletada: 'Pegatina correcta. Nodo completado.',
    noSePudoGuardar: 'No se pudo guardar en este dispositivo. Usa Mochila > Respaldo.',
    camaraNoDisponible: 'La cámara no está disponible. Usa Mochila > Respaldo.',
    noSePudoAbrirCamara: 'No se pudo abrir la cámara. Usa Mochila > Respaldo.',
    sinLinterna: 'Este móvil no deja encender la linterna desde la aplicación.',
  },

  /** Lo que se ve al tocar a un compañero en el mapa (`jugadoresEnMapa.ts`). */
  popup: {
    jugador: 'Jugador',
    enLinea: 'EN LÍNEA',
    reciente: 'RECIENTE',
    sinConexion: 'SIN CONEXIÓN',
    terminado: 'Terminado',
    nodoTiempo: (nodo: string, tiempo: string) => `Nodo ${nodo} · Tiempo ${tiempo}`,
    visto: (cuando: string) => `Visto ${cuando}`,
    sinActualizar: 'sin actualizar',
    haceSegundos: (n: number) => `hace ${n}s`,
    haceMinutos: (n: number) => `hace ${n}min`,
    haceHoras: (n: number) => `hace ${n}h`,
    jugadoresCerca: 'Jugadores cerca',
    ariaGrupo: (n: number) => `${n} jugadores cerca`,
  },
}

export type TextosDePantallas = typeof es

const gl: TextosDePantallas = {
  final: {
    titulo: 'Misión completada',
    subtituloAntes: 'Ruta completa, axente ',
    subtituloDespues: (nodos: number) => `. Percorriches os ${nodos} nodos da travesía.`,
    nodos: 'Nodos',
    tiempoTotal: 'Tempo total',
    fotos: 'Fotos',
    bannerFinalAntes: 'Clasificación final · ',
    bannerFinalDespues: (n: number) => (n === 1 ? ' xogador' : ' xogadores'),
    bannerEsperaAntes: 'Agardando a que rematen os demais · ',
    tituloFinal: '🏁 CLASIFICACIÓN FINAL',
    tituloProvisional: '⏳ CLASIFICACIÓN PROVISIONAL',
    regla: 'Só conta o tempo dentro de cada nodo. O camiño entre eles non puntúa.',
    revisadaTitulo: 'Clasificación revisada.',
    revisadaTexto:
      ' Corrixíronse os reloxos que seguiron correndo sen xogar e retiráronse as penalizacións que veñen dun fallo do lector de pegatinas. O detalle de cada cambio está na páxina da clasificación.',
    tu: 'ti',
    nodoDe: (nivel: number, total: number) => `Nodo ${nivel}/${total}`,
    verMapa: 'Ver mapa da ruta',
    salir: 'Saír',
  },

  clasificacion: {
    titulo: 'Clasificación',
    jugadores: (n: number) => `${n} ${n === 1 ? 'xogador' : 'xogadores'}`,
    enLinea: (n: number) => ` · ${n} en liña`,
    vacioTitulo: 'Aínda non hai tempos',
    vacioDetalle: 'Aparecerán en canto alguén complete un nodo.',
    tu: 'Ti',
    nodo: (n: number) => `Nodo ${n}`,
    cerrar: 'Pechar',
  },

  usarObjeto: {
    hechoTitulo: 'A porta cede',
    hechoTexto: (objeto: string) => `${objeto} encaixou no seu sitio.`,
    usandoTitulo: 'Encaixando…',
    usandoTexto: 'Non o soltes.',
    listoTexto: 'Lévalo encima. Este nodo non abre sen el: úsao para entrar.',
    usar: (objeto: string) => `Usar ${objeto}`,
    ahoraNo: 'Agora non',
  },

  escaner: {
    inicial: 'Escanea unha tarxeta QR de SAGA. Gardarase automaticamente en Obxectos.',
    apunta: 'Apunta a cámara á tarxeta QR de SAGA.',
    noSeLee: 'Non se le soa: pulsa 📸 Facer foto e validar.',
    noSeVe: 'Non se ve ben. Outra foto, máis preto e sen mover.',
    falloAlLeer: 'Fallo ao ler. Escribe o código abaixo.',
    qrNoLeido: 'QR non lido. Proba outra vez ou usa Mochila > Respaldo.',
    pegatinaRegistrando: 'Pegatina correcta. Rexistrando o nodo…',
    guardado: (tipos: number) =>
      `Gardado en Obxectos. Tes ${tipos} tipo${tipos === 1 ? '' : 's'} de obxecto.`,
    noRegistrado:
      'Lin a pegatina, pero o nodo non chegou a rexistrarse. Proba outra vez ou usa o código de respaldo.',
    pegatinaCompletada: 'Pegatina correcta. Nodo completado.',
    noSePudoGuardar: 'Non se puido gardar neste dispositivo. Usa Mochila > Respaldo.',
    camaraNoDisponible: 'A cámara non está dispoñible. Usa Mochila > Respaldo.',
    noSePudoAbrirCamara: 'Non se puido abrir a cámara. Usa Mochila > Respaldo.',
    sinLinterna: 'Este móbil non deixa encender a lanterna desde a aplicación.',
  },

  popup: {
    jugador: 'Xogador',
    enLinea: 'EN LIÑA',
    reciente: 'RECENTE',
    sinConexion: 'SEN CONEXIÓN',
    terminado: 'Rematou',
    nodoTiempo: (nodo: string, tiempo: string) => `Nodo ${nodo} · Tempo ${tiempo}`,
    visto: (cuando: string) => `Visto ${cuando}`,
    sinActualizar: 'sen actualizar',
    haceSegundos: (n: number) => `hai ${n}s`,
    haceMinutos: (n: number) => `hai ${n}min`,
    haceHoras: (n: number) => `hai ${n}h`,
    jugadoresCerca: 'Xogadores preto',
    ariaGrupo: (n: number) => `${n} xogadores preto`,
  },
}

const en: TextosDePantallas = {
  final: {
    titulo: 'Mission completed',
    subtituloAntes: 'Route complete, agent ',
    subtituloDespues: (nodos: number) => `. You covered all ${nodos} nodes of the crossing.`,
    nodos: 'Nodes',
    tiempoTotal: 'Total time',
    fotos: 'Photos',
    bannerFinalAntes: 'Final ranking · ',
    bannerFinalDespues: (n: number) => (n === 1 ? ' player' : ' players'),
    bannerEsperaAntes: 'Waiting for the others to finish · ',
    tituloFinal: '🏁 FINAL RANKING',
    tituloProvisional: '⏳ PROVISIONAL RANKING',
    regla: 'Only the time spent inside each node counts. The way between them does not score.',
    revisadaTitulo: 'Ranking reviewed.',
    revisadaTexto:
      ' Clocks that kept running while nobody was playing were corrected, and penalties caused by a sticker-reader failure were removed. The detail of every change is on the ranking page.',
    tu: 'you',
    nodoDe: (nivel: number, total: number) => `Node ${nivel}/${total}`,
    verMapa: 'See the route map',
    salir: 'Exit',
  },

  clasificacion: {
    titulo: 'Ranking',
    jugadores: (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`,
    enLinea: (n: number) => ` · ${n} online`,
    vacioTitulo: 'No times yet',
    vacioDetalle: 'They will appear as soon as someone completes a node.',
    tu: 'You',
    nodo: (n: number) => `Node ${n}`,
    cerrar: 'Close',
  },

  usarObjeto: {
    hechoTitulo: 'The door gives way',
    hechoTexto: (objeto: string) => `${objeto} fits into place.`,
    usandoTitulo: 'Fitting it in…',
    usandoTexto: "Don't let go.",
    listoTexto: 'Carry it with you. This node does not open without it: use it to get in.',
    usar: (objeto: string) => `Use ${objeto}`,
    ahoraNo: 'Not now',
  },

  escaner: {
    inicial: 'Scan a SAGA QR card. It will be saved automatically under Items.',
    apunta: 'Point the camera at the SAGA QR card.',
    noSeLee: 'It cannot be read on its own: press 📸 Take photo and validate.',
    noSeVe: 'Cannot see it well. Another photo, closer and without moving.',
    falloAlLeer: 'Could not read it. Type the code below.',
    qrNoLeido: 'QR not read. Try again or use Backpack > Backup.',
    pegatinaRegistrando: 'Sticker correct. Registering the node…',
    guardado: (tipos: number) => `Saved under Items. You have ${tipos} kind${tipos === 1 ? '' : 's'} of item.`,
    noRegistrado:
      'I read the sticker, but the node did not get registered. Try again or use the backup code.',
    pegatinaCompletada: 'Sticker correct. Node completed.',
    noSePudoGuardar: 'It could not be saved on this device. Use Backpack > Backup.',
    camaraNoDisponible: 'The camera is not available. Use Backpack > Backup.',
    noSePudoAbrirCamara: 'The camera could not be opened. Use Backpack > Backup.',
    sinLinterna: 'This phone does not let the app turn the torch on.',
  },

  popup: {
    jugador: 'Player',
    enLinea: 'ONLINE',
    reciente: 'RECENT',
    sinConexion: 'OFFLINE',
    terminado: 'Finished',
    nodoTiempo: (nodo: string, tiempo: string) => `Node ${nodo} · Time ${tiempo}`,
    visto: (cuando: string) => `Seen ${cuando}`,
    sinActualizar: 'not updated',
    haceSegundos: (n: number) => `${n}s ago`,
    haceMinutos: (n: number) => `${n}min ago`,
    haceHoras: (n: number) => `${n}h ago`,
    jugadoresCerca: 'Players nearby',
    ariaGrupo: (n: number) => `${n} players nearby`,
  },
}

const TEXTOS: Record<Locale, TextosDePantallas> = { es, gl, en }

/** Los textos de un idioma. Un idioma desconocido cae en castellano. */
export function textosDePantallasDe(locale: string | null | undefined): TextosDePantallas {
  return TEXTOS[(locale as Locale) in TEXTOS ? (locale as Locale) : 'es']
}

/** Para los tests y para quien necesite recorrerlos todos. */
export const TEXTOS_DE_PANTALLAS: Readonly<Record<Locale, TextosDePantallas>> = TEXTOS

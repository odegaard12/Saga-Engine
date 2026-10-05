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
    otroNodo: (n: number) => `Esa pegatina es del nodo ${n}, no de este. Busca la de aquí.`,
    nodoYaSuperado: (n: number) => `Esa pegatina es del nodo ${n}, que ya superaste.`,
    qrNoValido: 'Ese QR no es de SAGA. Busca la pegatina del nodo.',
    masLuz: 'Falta luz: busca claridad o enciende la linterna.',
    sinMover: 'Imagen movida: apoya el codo y quédate quieto un segundo.',
    acercate: 'Acércate: que la pegatina llene el recuadro, a un palmo.',
    permisoDenegado: 'Sin permiso de cámara. Actívalo en los ajustes del navegador (en iPhone: Ajustes > Safari > Cámara) o usa el código de respaldo.',
    camaraOcupada: 'Otra aplicación está usando la cámara. Ciérrala y vuelve a probar.',
    pista: 'Encuadra la pegatina en el recuadro: se lee sola. 📸 prueba más a fondo.',
    analizando: 'Analizando la pegatina...',
    activando: 'Activando la cámara...',
  },

  /** El mapa (MapSurfaceGL): aviso sin WebGL. */
  mapa: {
    sinWebGLTitulo: 'Mapa 3D no disponible',
    sinWebGL: 'Este dispositivo no puede mostrar el mapa (WebGL no disponible).',
    sigueJugando: 'Puedes seguir jugando: usa la brújula, la lista de nodos y el QR.',
    colocarmeEnNodo: 'Modo prueba: colocarme en el nodo',
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
    haceSegundos: (n: number) => `hace ${n} s`,
    haceMinutos: (n: number) => `hace ${n} min`,
    haceHoras: (n: number) => `hace ${n} h`,
    jugadoresCerca: 'Jugadores cerca',
    ariaGrupo: (n: number) => `${n} jugadores cerca`,
    distancia: (cuanto: string) => `A ${cuanto} de ti`,
    distanciaDesconocida: 'Distancia desconocida',
    equipo: (miembros: string) => `Equipo: ${miembros}`,
    cerrar: 'Cerrar',
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
    otroNodo: (n: number) => `Esa pegatina é do nodo ${n}, non deste. Busca a de aquí.`,
    nodoYaSuperado: (n: number) => `Esa pegatina é do nodo ${n}, que xa superaches.`,
    qrNoValido: 'Ese QR non é de SAGA. Busca a pegatina do nodo.',
    masLuz: 'Falta luz: busca claridade ou acende a lanterna.',
    sinMover: 'Imaxe movida: apoia o cóbado e queda quieto un segundo.',
    acercate: 'Achégate: que a pegatina enche o recadro, a unha cuarta.',
    permisoDenegado: 'Sen permiso de cámara. Actívao nos axustes do navegador (no iPhone: Axustes > Safari > Cámara) ou usa o código de respaldo.',
    camaraOcupada: 'Outra aplicación está a usar a cámara. Péchaa e proba de novo.',
    pista: 'Encadra a pegatina no recadro: lese soa. 📸 proba máis a fondo.',
    analizando: 'Analizando a pegatina...',
    activando: 'Activando a cámara...',
  },

  mapa: {
    sinWebGLTitulo: 'Mapa 3D non dispoñible',
    sinWebGL: 'Este dispositivo non pode amosar o mapa (WebGL non dispoñible).',
    sigueJugando: 'Podes seguir xogando: usa a brúxula, a lista de nodos e o QR.',
    colocarmeEnNodo: 'Modo proba: poñerme no nodo',
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
    haceSegundos: (n: number) => `hai ${n} s`,
    haceMinutos: (n: number) => `hai ${n} min`,
    haceHoras: (n: number) => `hai ${n} h`,
    jugadoresCerca: 'Xogadores preto',
    ariaGrupo: (n: number) => `${n} xogadores preto`,
    distancia: (cuanto: string) => `A ${cuanto} de ti`,
    distanciaDesconocida: 'Distancia descoñecida',
    equipo: (miembros: string) => `Equipo: ${miembros}`,
    cerrar: 'Pechar',
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
    otroNodo: (n: number) => `That sticker belongs to node ${n}, not this one. Find the one here.`,
    nodoYaSuperado: (n: number) => `That sticker belongs to node ${n}, which you already passed.`,
    qrNoValido: 'That QR is not a SAGA code. Find the node sticker.',
    masLuz: 'Not enough light: find some or turn the torch on.',
    sinMover: 'Blurry image: rest your elbow and hold still for a second.',
    acercate: 'Get closer: make the sticker fill the frame, about a hand away.',
    permisoDenegado: 'No camera permission. Enable it in the browser settings (iPhone: Settings > Safari > Camera) or use the backup code.',
    camaraOcupada: 'Another app is using the camera. Close it and try again.',
    pista: 'Frame the sticker in the square: it reads by itself. 📸 tries harder.',
    analizando: 'Analysing the sticker...',
    activando: 'Starting the camera...',
  },

  mapa: {
    sinWebGLTitulo: '3D map not available',
    sinWebGL: 'This device cannot show the map (WebGL not available).',
    sigueJugando: 'You can keep playing: use the compass, the node list and the QR.',
    colocarmeEnNodo: 'Test mode: put me on the node',
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
    haceSegundos: (n: number) => `${n} s ago`,
    haceMinutos: (n: number) => `${n} min ago`,
    haceHoras: (n: number) => `${n} h ago`,
    jugadoresCerca: 'Players nearby',
    ariaGrupo: (n: number) => `${n} players nearby`,
    distancia: (cuanto: string) => `${cuanto} from you`,
    distanciaDesconocida: 'Distance unknown',
    equipo: (miembros: string) => `Team: ${miembros}`,
    cerrar: 'Close',
  },
}

const TEXTOS: Record<Locale, TextosDePantallas> = { es, gl, en }

/** Los textos de un idioma. Un idioma desconocido cae en castellano. */
export function textosDePantallasDe(locale: string | null | undefined): TextosDePantallas {
  return TEXTOS[(locale as Locale) in TEXTOS ? (locale as Locale) : 'es']
}

/** Para los tests y para quien necesite recorrerlos todos. */
export const TEXTOS_DE_PANTALLAS: Readonly<Record<Locale, TextosDePantallas>> = TEXTOS

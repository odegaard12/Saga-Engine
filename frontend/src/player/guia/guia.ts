import type { PlayerStage } from '../../types/player'
import { configDelNodo } from '../configDelNodo'

/**
 * La Guía que sabe en qué estás (5/11, versión C elegida por Óscar).
 *
 * Una sola función decide el estado del jugador y otra lo dice en su idioma: qué hacer AHORA y qué viene DESPUÉS.
 * Lo leen la línea bajo el botón grande del mapa (sólo «Ahora»), la pestaña Guía de la mochila (las dos cosas) y la
 * ficha del «?» de un juego. Sin React ni almacén: todo llega por parámetro, para poder probar cada estado.
 */

export type Idioma = 'es' | 'gl' | 'en'

export type EstadoGuia =
  | 'antes_de_empezar'
  | 'terminada'
  | 'esperando_nodo'
  | 'reglas'
  | 'jugando'
  | 'falta_objeto'
  | 'sin_red'
  | 'sin_gps'
  | 'gps_rendido'
  | 'qr'
  | 'coleccionable'
  | 'dentro_del_radio'
  | 'camino_cerca'
  | 'camino_lejos'
  | 'mapa_mudo'

export type Motivo =
  | 'finished'
  | 'missing_stage'
  | 'free_entry'
  | 'within_radius'
  | 'out_of_range'
  | 'gps_unavailable'
  | 'distance_unknown'
  | 'gps_rendido'
  | 'missing_item'

// La distancia no va en el texto: el botón grande ya la dice («Acércate más · 667 m») y repetirla era ruido.
export interface EntradaGuia {
  terminada: boolean
  /** «18:30» si la misión aún no ha empezado; null si ya está en marcha. */
  horaDeInicio: string | null
  motivo: Motivo | null
  distancia: number | null
  radio: number | null
  /** Número del nodo (1, 2…). */
  numero: number
  juego: ClaveDeJuego | null
  esQr: boolean
  esColeccionable: boolean
  objeto: string
  enLinea: boolean
  pendientes: number
  /** Dentro de la hoja de un juego: 'reglas' (el reloj aún no corre) o 'jugando'. */
  enJuego: 'reglas' | 'jugando' | null
  /** «1 min»: lo que suma el código de respaldo del nodo. */
  respaldo: string
  /** Jugadores que ya han terminado y cuántos son, si se sabe. */
  terminados?: number
  total?: number
}

/** Cerca = a menos de tres radios o de 100 m del borde: ahí ya se busca el círculo, no el camino. */
function cerca(distancia: number, radio: number): boolean {
  return distancia <= Math.max(radio * 3, radio + 100)
}

export function estadoDeLaGuia(e: EntradaGuia): EstadoGuia {
  if (e.terminada || e.motivo === 'finished') return 'terminada'
  if (e.horaDeInicio) return 'antes_de_empezar'
  if (e.enJuego) return e.enJuego
  if (e.motivo === 'missing_stage') return 'esperando_nodo'
  if (e.motivo === 'missing_item') return 'falta_objeto'
  // Sin red sólo importa si hay algo esperando a subir; si no, el juego sigue igual y no hay nada que contar.
  if (!e.enLinea && e.pendientes > 0) return 'sin_red'
  if (e.motivo === 'gps_rendido') return 'gps_rendido'
  if (e.motivo === 'gps_unavailable' || e.motivo === 'distance_unknown') return 'sin_gps'
  if (e.motivo === 'within_radius' || e.motivo === 'free_entry') {
    return e.esQr ? 'qr' : e.esColeccionable ? 'coleccionable' : 'dentro_del_radio'
  }
  if (e.juego === 'mapa_mudo') return 'mapa_mudo'
  if (e.distancia !== null && e.radio !== null && cerca(e.distancia, e.radio)) return 'camino_cerca'
  return 'camino_lejos'
}

/* ─────────────── Los juegos: nombre y su regla en una línea ─────────────── */

export type ClaveDeJuego =
  | 'mosaico'
  | 'trampa'
  | 'cuenta'
  | 'control'
  | 'pulso'
  | 'laberinto'
  | 'dinamo'
  | 'chispas'
  | 'eco'
  | 'matriz'
  | 'rumbo'
  | 'mastermind'
  | 'balanza'
  | 'interrogatorio'
  | 'mapa_mudo'
  | 'relevo'
  | 'audio'
  | 'qr'
  | 'coleccionable'

/**
 * Cada línea resume la regla que el juego ya enseña en su pantalla (core/textos.ts, logica/textos.ts): no es otra
 * explicación, es la misma en una frase. Si cambia la regla de un juego, se cambia aquí también.
 */
const JUEGOS: Record<ClaveDeJuego, Record<Idioma, [string, string]>> = {
  mosaico: {
    es: [
      'Mosaico del lugar',
      'Memoriza la foto antes de que se haga piezas; luego colócalas y responde lo que ves en el sitio.',
    ],
    gl: [
      'Mosaico do lugar',
      'Memoriza a foto antes de que se faga pezas; logo colócaas e responde o que ves no sitio.',
    ],
    en: [
      'Place mosaic',
      'Memorise the photo before it turns into pieces; then place them and answer what you see on site.',
    ],
  },
  trampa: {
    es: ['Trampa de palabras', 'Lee con calma: hay opciones casi idénticas. Elige la buena.'],
    gl: ['Trampa de palabras', 'Le con calma: hai opcións case idénticas. Escolle a boa.'],
    en: ['Word trap', 'Read carefully: some options are almost identical. Pick the right one.'],
  },
  cuenta: {
    es: ['Cuenta las señales', 'Mira alrededor en el punto real y responde con un número.'],
    gl: ['Conta os sinais', 'Mira arredor no punto real e responde cun número.'],
    en: ['Count the signs', 'Look around at the real spot and answer with a number.'],
  },
  control: {
    es: ['Punto de control', 'Llegar basta: dentro del radio, confírmalo y sigue.'],
    gl: ['Punto de control', 'Chegar abonda: dentro do radio, confírmao e segue.'],
    en: ['Checkpoint', 'Getting there is enough: inside the radius, confirm and move on.'],
  },
  pulso: {
    es: [
      'Pulso de hierro',
      'Sujeta el móvil quieto con una mano y repite con la otra la secuencia de colores.',
    ],
    gl: [
      'Pulso de ferro',
      'Suxeita o móbil quieto cunha man e repite coa outra a secuencia de cores.',
    ],
    en: [
      'Iron pulse',
      'Hold the phone still with one hand and repeat the colour sequence with the other.',
    ],
  },
  laberinto: {
    es: [
      'Laberinto de equilibrio',
      'Inclina el móvil o usa los botones: recoge ◆, evita × y llega a ⚑.',
    ],
    gl: [
      'Labirinto de equilibrio',
      'Inclina o móbil ou usa os botóns: recolle ◆, evita × e chega a ⚑.',
    ],
    en: ['Balance maze', 'Tilt the phone or use the buttons: collect ◆, avoid × and reach ⚑.'],
  },
  dinamo: {
    es: [
      'Cargar antena',
      'Carga la antena con pulsos cortos del móvil, separados medio segundo. Quieto no carga.',
    ],
    gl: [
      'Cargar antena',
      'Carga a antena con pulsos curtos do móbil, separados medio segundo. Quieto non carga.',
    ],
    en: [
      'Charge the antenna',
      'Charge it with short shakes, half a second apart. Holding still does nothing.',
    ],
  },
  chispas: {
    es: ['Caza-señales', 'Toca las chispas verdes y evita las rojas: cada roja suma tiempo.'],
    gl: ['Caza-sinais', 'Toca as chispas verdes e evita as vermellas: cada vermella suma tempo.'],
    en: ['Signal hunt', 'Tap the green sparks and avoid the red ones: each red adds time.'],
  },
  eco: {
    es: ['Eco rítmico', 'Mira (y escucha) los golpes y repítelos en el mismo orden y ritmo.'],
    gl: ['Eco rítmico', 'Mira (e escoita) os golpes e repíteos na mesma orde e ritmo.'],
    en: [
      'Rhythm echo',
      'Watch (and listen to) the beats and repeat them in the same order and rhythm.',
    ],
  },
  matriz: {
    es: [
      'Matriz de circuitos',
      'Fíjate en el trazado que se enciende y márcalo después; a veces, al revés. Cada fallo suma 5 s.',
    ],
    gl: [
      'Matriz de circuítos',
      'Fíxate no trazado que se acende e márcao despois; ás veces, ao revés. Cada fallo suma 5 s.',
    ],
    en: [
      'Circuit matrix',
      'Watch the path light up, then mark it; sometimes backwards. Each mistake adds 5 s.',
    ],
  },
  rumbo: {
    es: ['Fijar rumbo', 'Gira despacio con el móvil hasta apuntar al rumbo y aguanta quieto.'],
    gl: ['Fixar rumbo', 'Xira amodo co móbil ata apuntar ao rumbo e aguanta quieto.'],
    en: [
      'Set the bearing',
      'Turn slowly with the phone until you point at the bearing and hold still.',
    ],
  },
  mastermind: {
    es: [
      'Mastermind',
      'Adivina el código: cada intento dice cuántos están bien colocados y cuántos en otro sitio.',
    ],
    gl: [
      'Mastermind',
      'Adiviña o código: cada intento di cantos están ben colocados e cantos noutro sitio.',
    ],
    en: [
      'Mastermind',
      'Guess the code: each try says how many are in place and how many are elsewhere.',
    ],
  },
  balanza: {
    es: ['Balanza', 'Una bola pesa más que las demás: encuéntrala con las pesadas que tienes.'],
    gl: ['Balanza', 'Unha bóla pesa máis cás demais: atópaa coas pesadas que tes.'],
    en: ['Scales', 'One ball is heavier than the rest: find it with the weighings you have.'],
  },
  interrogatorio: {
    es: [
      'Interrogatorio',
      'Los sospechosos hablan, pero no todos dicen la verdad: razona quién tiene la llave.',
    ],
    gl: [
      'Interrogatorio',
      'Os sospeitosos falan, pero non todos din a verdade: razoa quen ten a chave.',
    ],
    en: [
      'Interrogation',
      'The suspects talk, but not all tell the truth: work out who has the key.',
    ],
  },
  mapa_mudo: {
    es: ['Mapa mudo', 'No hay punto en el mapa: sigue la pista y busca dentro de la zona.'],
    gl: ['Mapa mudo', 'Non hai punto no mapa: segue a pista e busca dentro da zona.'],
    en: ['Blank map', 'There is no pin: follow the clue and search inside the area.'],
  },
  relevo: {
    es: [
      'Relevo de equipo',
      'Tenéis que estar dos o más del equipo en el mismo punto; luego, validad el relevo. Necesita cobertura.',
    ],
    gl: [
      'Relevo de equipo',
      'Tedes que estar dous ou máis do equipo no mesmo punto; logo, validade o relevo. Precisa cobertura.',
    ],
    en: [
      'Team relay',
      'Two or more of the team must be at the same spot; then validate the relay. Needs coverage.',
    ],
  },
  audio: {
    es: ['Desafío de audio', 'Sopla o haz ruido cerca del micrófono para cargar la barra.'],
    gl: ['Desafío de audio', 'Sopra ou fai ruído preto do micrófono para cargar a barra.'],
    en: ['Audio challenge', 'Blow or make noise near the microphone to fill the bar.'],
  },
  qr: {
    es: ['Pegatina QR', 'Busca la pegatina QR en el sitio y escanéala.'],
    gl: ['Pegatina QR', 'Busca a pegatina QR no sitio e escanéaa.'],
    en: ['QR sticker', 'Find the QR sticker on site and scan it.'],
  },
  coleccionable: {
    es: ['Objeto para recoger', 'Se recoge con un toque y va a tu mochila. No suma tiempo.'],
    gl: ['Obxecto para recoller', 'Recóllese cun toque e vai á túa mochila. Non suma tempo.'],
    en: ['Item to pick up', 'One tap picks it up into your backpack. It adds no time.'],
  },
}

export function juegoEnSuIdioma(
  clave: ClaveDeJuego,
  idioma: Idioma
): { nombre: string; regla: string } {
  const [nombre, regla] = JUEGOS[clave][idioma] || JUEGOS[clave].es
  return { nombre, regla }
}

/** Qué juego hay en un nodo, con las mismas reglas que FamilyRuntimeHost. Null si no se reconoce. */
export function claveDeJuego(
  stage: PlayerStage | null | undefined,
  marcas: { esQr?: boolean; esColeccionable?: boolean } = {}
): ClaveDeJuego | null {
  if (!stage) return null
  if (marcas.esColeccionable) return 'coleccionable'
  if (marcas.esQr) return 'qr'
  const cfg = configDelNodo(stage)
  const id = String(cfg.game_id || '')
  if (String(stage.kind || '') === 'mapa_mudo' || id === 'mapa_mudo') return 'mapa_mudo'
  const familia = String(stage.minigame?.type || stage.type || '')
  const directo: Record<string, ClaveDeJuego> = {
    place_mosaic: 'mosaico',
    cuenta_senales: 'cuenta',
    simple_checkpoint: 'control',
    pulso_hierro: 'pulso',
    tilt_maze: 'laberinto',
    spark_radar: 'chispas',
    sequence_code: 'eco',
    rumbo_doble: 'rumbo',
    mastermind: 'mastermind',
    balanza: 'balanza',
    interrogatorio: 'interrogatorio',
    team_relay: 'relevo',
  }
  if (directo[id]) return directo[id]
  if (familia === 'word_trap') return 'trampa'
  if (familia === 'audio_challenge') return 'audio'
  if (familia === 'bearing_hunt') return 'rumbo'
  if (familia === 'circuit_matrix') return 'matriz'
  if (familia === 'motion_challenge') return 'dinamo'
  if (familia === 'signal_hunt' || cfg.objective === 'checkpoint') return 'control'
  return null
}

/* ─────────────── Lo que dice la Guía en cada estado ─────────────── */

export interface TextoGuia {
  ahora: string
  despues: string | null
}

type Plantillas = Record<
  EstadoGuia,
  (e: EntradaGuia, juego: { nombre: string; regla: string } | null) => TextoGuia
>

/** «Después»: el juego que espera allí (su regla ya va en el paso del nodo, no se repite). */
const conNombre = (j: { nombre: string } | null) => (j ? `${j.nombre}.` : null)

const TEXTOS: Record<Idioma, Plantillas> = {
  es: {
    antes_de_empezar: (e) => ({
      ahora: `La misión empieza a las ${e.horaDeInicio}. Ve al punto de salida.`,
      despues: 'El primer nodo se abre al llegar.',
    }),
    terminada: (e) => ({
      ahora: '¡Ruta completa! Tu tiempo ya está guardado.',
      despues: e.total
        ? e.terminados && e.terminados >= e.total
          ? 'Ya habéis terminado todos.'
          : `Esperando a que terminen los demás (${e.terminados || 0} de ${e.total}).`
        : null,
    }),
    esperando_nodo: () => ({ ahora: 'Esperando el siguiente nodo.', despues: null }),
    reglas: () => ({
      ahora: 'Lee las reglas con calma: el reloj no corre hasta «Empezar».',
      despues: 'Al superarlo, al siguiente nodo.',
    }),
    jugando: (e, j) => ({
      ahora: j ? j.regla : 'El reloj corre: resuelve el reto.',
      despues: `¿Atascado? El código de respaldo suma ${e.respaldo}.`,
    }),
    falta_objeto: (e) => ({
      ahora: `Este nodo pide ${e.objeto || 'un objeto'}. Fabrícalo en Mochila › Mesa.`,
      despues: 'Con él encima, el nodo se abre.',
    }),
    sin_red: (e) => ({
      ahora: `Sin cobertura: sigue jugando. ${e.pendientes === 1 ? '1 avance espera' : `${e.pendientes} avances esperan`} y sube${e.pendientes === 1 ? '' : 'n'} solo${e.pendientes === 1 ? '' : 's'}.`,
      despues: 'No hace falta hacer nada.',
    }),
    sin_gps: () => ({
      ahora: 'Buscando señal: sal a cielo abierto un momento.',
      despues: 'Si no llega, en un rato podrás abrir el nodo igual.',
    }),
    gps_rendido: () => ({
      ahora: 'Sin posición fiable: puedes abrir el nodo igual.',
      despues: 'La prueba está dentro.',
    }),
    qr: (e) => ({
      ahora: 'Busca la pegatina QR y pulsa «Abrir QR».',
      despues: `Si no se lee, el código de respaldo suma ${e.respaldo}.`,
    }),
    coleccionable: () => ({
      ahora: 'Pulsa «Recoger»: va a tu mochila y no suma tiempo.',
      despues: 'Luego, al siguiente nodo.',
    }),
    dentro_del_radio: (_e, j) => ({
      ahora: 'Ya estás dentro: pulsa «Abrir nodo».',
      despues: conNombre(j),
    }),
    camino_cerca: (_e, j) => ({
      ahora: 'Ya casi: entra en el círculo y el nodo se abre.',
      despues: conNombre(j),
    }),
    camino_lejos: (e, j) => ({
      ahora: `Camina hacia el nodo ${e.numero} siguiendo la línea del mapa.`,
      despues: conNombre(j),
    }),
    mapa_mudo: () => ({
      ahora: 'Sigue la pista y busca dentro de la zona.',
      despues: 'Sin punto en el mapa: se abre al dar con el sitio.',
    }),
  },
  gl: {
    antes_de_empezar: (e) => ({
      ahora: `A misión comeza ás ${e.horaDeInicio}. Vai ao punto de saída.`,
      despues: 'O primeiro nodo ábrese ao chegar.',
    }),
    terminada: (e) => ({
      ahora: 'Ruta completa! O teu tempo xa está gardado.',
      despues: e.total
        ? e.terminados && e.terminados >= e.total
          ? 'Xa rematastes todos.'
          : `Agardando a que rematen os demais (${e.terminados || 0} de ${e.total}).`
        : null,
    }),
    esperando_nodo: () => ({ ahora: 'Agardando o seguinte nodo.', despues: null }),
    reglas: () => ({
      ahora: 'Le as regras con calma: o reloxo non corre ata «Comezar».',
      despues: 'Ao superalo, ao seguinte nodo.',
    }),
    jugando: (e, j) => ({
      ahora: j ? j.regla : 'O reloxo corre: resolve o reto.',
      despues: `Atascado? O código de respaldo suma ${e.respaldo}.`,
    }),
    falta_objeto: (e) => ({
      ahora: `Este nodo pide ${e.objeto || 'un obxecto'}. Fabrícao en Mochila › Mesa.`,
      despues: 'Con el enriba, o nodo ábrese.',
    }),
    sin_red: (e) => ({
      ahora: `Sen cobertura: segue xogando. ${e.pendientes === 1 ? '1 avance agarda e sobe só' : `${e.pendientes} avances agardan e soben sós`}.`,
      despues: 'Non fai falta facer nada.',
    }),
    sin_gps: () => ({
      ahora: 'Buscando sinal: sae a ceo aberto un momento.',
      despues: 'Se non chega, nun anaco poderás abrir o nodo igual.',
    }),
    gps_rendido: () => ({
      ahora: 'Sen posición fiable: podes abrir o nodo igual.',
      despues: 'A proba está dentro.',
    }),
    qr: (e) => ({
      ahora: 'Busca a pegatina QR e preme «Abrir QR».',
      despues: `Se non se le, o código de respaldo suma ${e.respaldo}.`,
    }),
    coleccionable: () => ({
      ahora: 'Preme «Recoller»: vai á túa mochila e non suma tempo.',
      despues: 'Logo, ao seguinte nodo.',
    }),
    dentro_del_radio: (_e, j) => ({
      ahora: 'Xa estás dentro: preme «Abrir nodo».',
      despues: conNombre(j),
    }),
    camino_cerca: (_e, j) => ({
      ahora: 'Xa case: entra no círculo e o nodo ábrese.',
      despues: conNombre(j),
    }),
    camino_lejos: (e, j) => ({
      ahora: `Camiña cara ao nodo ${e.numero} seguindo a liña do mapa.`,
      despues: conNombre(j),
    }),
    mapa_mudo: () => ({
      ahora: 'Segue a pista e busca dentro da zona.',
      despues: 'Sen punto no mapa: ábrese ao dar co sitio.',
    }),
  },
  en: {
    antes_de_empezar: (e) => ({
      ahora: `The mission starts at ${e.horaDeInicio}. Go to the starting point.`,
      despues: 'The first node opens when you get there.',
    }),
    terminada: (e) => ({
      ahora: 'Route complete! Your time is saved.',
      despues: e.total
        ? e.terminados && e.terminados >= e.total
          ? 'Everyone has finished.'
          : `Waiting for the others to finish (${e.terminados || 0} of ${e.total}).`
        : null,
    }),
    esperando_nodo: () => ({ ahora: 'Waiting for the next node.', despues: null }),
    reglas: () => ({
      ahora: 'Read the rules calmly: the clock does not run until «Start».',
      despues: 'Once you beat it, on to the next node.',
    }),
    jugando: (e, j) => ({
      ahora: j ? j.regla : 'The clock is running: solve the challenge.',
      despues: `Stuck? The backup code adds ${e.respaldo}.`,
    }),
    falta_objeto: (e) => ({
      ahora: `This node needs ${e.objeto || 'an item'}. Craft it in Backpack › Workbench.`,
      despues: 'With it on you, the node opens.',
    }),
    sin_red: (e) => ({
      ahora: `No coverage: keep playing. ${e.pendientes === 1 ? '1 step is waiting' : `${e.pendientes} steps are waiting`} and will upload on their own.`,
      despues: 'You do not need to do anything.',
    }),
    sin_gps: () => ({
      ahora: 'Looking for signal: step into the open for a moment.',
      despues: 'If it does not come, you can open the node anyway in a while.',
    }),
    gps_rendido: () => ({
      ahora: 'No reliable position: you can open the node anyway.',
      despues: 'The challenge is inside.',
    }),
    qr: (e) => ({
      ahora: 'Find the QR sticker and tap «Open QR».',
      despues: `If it will not scan, the backup code adds ${e.respaldo}.`,
    }),
    coleccionable: () => ({
      ahora: 'Tap «Pick up»: it goes to your backpack and adds no time.',
      despues: 'Then, on to the next node.',
    }),
    dentro_del_radio: (_e, j) => ({
      ahora: 'You are inside: tap «Open node».',
      despues: conNombre(j),
    }),
    camino_cerca: (_e, j) => ({
      ahora: 'Almost there: step into the circle and the node opens.',
      despues: conNombre(j),
    }),
    camino_lejos: (e, j) => ({
      ahora: `Walk to node ${e.numero} following the line on the map.`,
      despues: conNombre(j),
    }),
    mapa_mudo: () => ({
      ahora: 'Follow the clue and search inside the area.',
      despues: 'No pin on the map: it opens when you find the spot.',
    }),
  },
}

export function textoDeLaGuia(e: EntradaGuia, idioma: Idioma): TextoGuia & { estado: EstadoGuia } {
  const estado = estadoDeLaGuia(e)
  const juego = e.juego ? juegoEnSuIdioma(e.juego, idioma) : null
  return { estado, ...(TEXTOS[idioma] || TEXTOS.es)[estado](e, juego) }
}

/** Notas que no cambian lo que hay que hacer, sólo en la pestaña Guía. */
export function notasDeLaGuia(
  n: { ahorro: boolean; estrellas: number | null },
  idioma: Idioma
): string[] {
  const t = {
    es: [
      'Modo ahorro: el mapa va más sencillo para que dure la batería. El juego, igual.',
      (s: number) => `Tienes ${s} ★: en la «Tienda de ropa» desbloqueas lo que tenga 🔒.`,
    ],
    gl: [
      'Modo aforro: o mapa vai máis sinxelo para que dure a batería. O xogo, igual.',
      (s: number) => `Tes ${s} ★: na «Tenda de roupa» desbloqueas o que teña 🔒.`,
    ],
    en: [
      'Battery saver: the map is simpler so the battery lasts. The game is the same.',
      (s: number) => `You have ${s} ★: unlock anything with 🔒 in the «Clothes shop».`,
    ],
  }[idioma] as [string, (s: number) => string]
  const notas: string[] = []
  if (n.ahorro) notas.push(t[0])
  if (n.estrellas && n.estrellas > 0) notas.push(t[1](n.estrellas))
  return notas
}

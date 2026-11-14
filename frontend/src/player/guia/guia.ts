import type { PlayerStage } from '../../types/player'
import { configDelNodo } from '../configDelNodo'
import { JUEGOS_EN_UNA_LINEA, type ClaveDeJuego } from '../minigames/core/textos'

/**
 * La Guía que sabe en qué estás (5/11, versión C elegida por Óscar).
 *
 * Una sola función decide el estado del jugador y otra lo dice en su idioma: qué hacer AHORA y qué viene DESPUÉS.
 * Lo leen la línea bajo el botón grande del mapa (sólo «Ahora»), la pestaña Guía de la mochila (las dos cosas) y la
 * ficha del «?» de un juego. Sin React ni almacén: todo llega por parámetro, para poder probar cada estado.
 */

export type Idioma = 'es' | 'gl'

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

export type { ClaveDeJuego }
const JUEGOS = JUEGOS_EN_UNA_LINEA

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
    bearing_hunt: 'caza_rumbo',
    mastermind: 'mastermind',
    balanza: 'balanza',
    interrogatorio: 'interrogatorio',
    team_relay: 'relevo',
  }
  if (directo[id]) return directo[id]
  if (familia === 'word_trap') return 'trampa'
  if (familia === 'audio_challenge') return 'audio'
  if (familia === 'bearing_hunt') return 'caza_rumbo'
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
    jugando: (_e, j) => ({
      ahora: j ? j.regla : 'El reloj corre: resuelve el reto.',
      despues: 'Al superarlo, al siguiente nodo.',
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
    gps_rendido: (e) => ({
      ahora:
        e.juego === 'control'
          ? `Sin posición fiable: puedes abrir el nodo igual. Suma ${e.respaldo}.`
          : 'Sin posición fiable: puedes abrir el nodo igual.',
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
    jugando: (_e, j) => ({
      ahora: j ? j.regla : 'O reloxo corre: resolve o reto.',
      despues: 'Ao superalo, ao seguinte nodo.',
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
    gps_rendido: (e) => ({
      ahora:
        e.juego === 'control'
          ? `Sen posición fiable: podes abrir o nodo igual. Suma ${e.respaldo}.`
          : 'Sen posición fiable: podes abrir o nodo igual.',
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
      'Ahorro de batería: el mapa va más sencillo para que dure la batería. El juego, igual.',
      (s: number) => `Tienes ${s} ★: en la «Tienda de ropa» desbloqueas lo que tenga 🔒.`,
    ],
    gl: [
      'Aforro de batería: o mapa vai máis sinxelo para que dure a batería. O xogo, igual.',
      (s: number) => `Tes ${s} ★: na «Tenda de roupa» desbloqueas o que teña 🔒.`,
    ],
  }[idioma] as [string, (s: number) => string]
  const notas: string[] = []
  if (n.ahorro) notas.push(t[0])
  // 7/11: las estrellas se cuentan sólo en la tienda (su contador y su ayuda); la Guía no las repite.
  return notas
}

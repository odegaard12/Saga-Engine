import type { Locale } from '../../../../i18n'
import type { Dicho, Regla } from './motor'

/** Textos de los juegos de lógica (30/10) en es/gl/en. Viven aquí y no en core/textos.ts: son de estos tres juegos. */
type T = {
  empezar: string
  reintentar: string
  ronda: (i: number, n: number) => string
  enviando: string
  resuelto: string
  penalizacion: (s: number) => string
  fallos: (n: number) => string
  interrogatorio: {
    titulo: string
    intro: string
    caso: (i: number, n: number) => string
    regla: Record<Regla, string>
    pregunta: string
    dicho: (d: Dicho, nombres: string[], quien: number) => string
    mal: (s: number) => string
    /** Fallo en un caso escrito por el organizador: no hay caso nuevo, se repite. */
    malPropio: (s: number) => string
    bien: string
    /** Primero se señala y luego se acusa (un toque suelto no cuesta tiempo). */
    acusar: (nombre: string) => string
    culpable: string
    señala: string
  }
  mastermind: {
    titulo: string
    intro: (largo: number, intentos: number, repetir: boolean) => string
    probar: string
    borrar: string
    quedan: (n: number) => string
    exactas: string
    casi: string
    agotado: (s: number) => string
    simbolo: (i: number) => string
  }
  balanza: {
    titulo: string
    intro: (bolas: number, pesadas: number) => string
    izquierda: string
    derecha: string
    pesar: string
    quedan: (n: number) => string
    señalar: string
    cancelar: string
    eligeBola: string
    resultado: (r: -1 | 0 | 1) => string
    ayuda: string
    mal: (s: number) => string
    bola: (i: number) => string
  }
}

const SIMBOLOS_ES = [
  'círculo',
  'triángulo',
  'cuadrado',
  'rombo',
  'estrella',
  'cruz',
  'corazón',
  'luna',
]
const SIMBOLOS_GL = [
  'círculo',
  'triángulo',
  'cadrado',
  'rombo',
  'estrela',
  'cruz',
  'corazón',
  'lúa',
]
const SIMBOLOS_EN = ['circle', 'triangle', 'square', 'diamond', 'star', 'cross', 'heart', 'moon']

const es: T = {
  empezar: 'Empezar',
  reintentar: 'Reintentar',
  ronda: (i, n) => `Ronda ${i}/${n}`,
  enviando: 'Avanzando…',
  resuelto: '¡Resuelto!',
  penalizacion: (s) => `+${s} s`,
  fallos: (n) => (n === 1 ? '1 fallo' : `${n} fallos`),
  interrogatorio: {
    titulo: 'Interrogatorio',
    intro:
      'Han robado la llave. Los sospechosos hablan, pero no todos dicen la verdad. Razona quién la tiene.',
    caso: (i, n) => `Caso ${i}/${n}`,
    regla: { una_verdad: 'Sólo uno dice la verdad.', una_mentira: 'Sólo uno miente.' },
    pregunta: '¿Quién tiene la llave?',
    dicho: (d, nombres, quien) => {
      const yo = d.sobre === quien
      if (d.tipo === 'tiene')
        return yo ? '«La llave la tengo yo.»' : `«La llave la tiene ${nombres[d.sobre]}.»`
      if (d.tipo === 'no_tiene')
        return yo ? '«Yo no la tengo.»' : `«${nombres[d.sobre]} no la tiene.»`
      if (d.tipo === 'miente') return `«${nombres[d.sobre]} miente.»`
      return `«${nombres[d.sobre]} dice la verdad.»`
    },
    mal: (s) => `No era. +${s} s y caso nuevo.`,
    malPropio: (s) => `No era. +${s} s. Vuelve a pensarlo.`,
    bien: '¡Exacto!',
    culpable: 'Culpable',
    acusar: (n) => `Acusar a ${n}`,
    señala: 'Señala a quien la tiene',
  },
  mastermind: {
    titulo: 'Mastermind',
    intro: (largo, intentos, repetir) =>
      `Adivina el código de ${largo} símbolos en ${intentos} intentos.${repetir ? ' Puede repetir símbolos.' : ''} Cada intento te dice cuántos están bien colocados y cuántos están pero en otro sitio.`,
    probar: 'Probar',
    borrar: 'Borrar',
    quedan: (n) => (n === 1 ? 'Queda 1 intento' : `Quedan ${n} intentos`),
    exactas: 'bien colocados',
    casi: 'en otro sitio',
    agotado: (s) => `Sin intentos. +${s} s y código nuevo.`,
    simbolo: (i) => SIMBOLOS_ES[i],
  },
  balanza: {
    titulo: 'Balanza',
    intro: (bolas, pesadas) =>
      `Hay ${bolas} bolas iguales, pero una pesa más. Tienes ${pesadas} pesadas: toca una bola para ponerla a la izquierda, otra vez a la derecha y otra para quitarla.`,
    izquierda: 'Izquierda',
    derecha: 'Derecha',
    pesar: 'Pesar',
    quedan: (n) => (n === 1 ? 'Queda 1 pesada' : `Quedan ${n} pesadas`),
    señalar: 'Señalar la pesada',
    cancelar: 'Seguir pesando',
    eligeBola: 'Toca la bola que pesa más',
    resultado: (r) =>
      r === 0 ? 'Equilibrio' : r < 0 ? 'Pesa más la izquierda' : 'Pesa más la derecha',
    ayuda: 'Pon bolas en los dos platos',
    mal: (s) => `No era. +${s} s y empiezas de nuevo.`,
    bola: (i) => `Bola ${i + 1}`,
  },
}

const gl: T = {
  ...es,
  empezar: 'Comezar',
  reintentar: 'Tentar de novo',
  ronda: (i, n) => `Rolda ${i}/${n}`,
  enviando: 'Avanzando…',
  resuelto: 'Resolto!',
  fallos: (n) => (n === 1 ? '1 fallo' : `${n} fallos`),
  interrogatorio: {
    ...es.interrogatorio,
    intro:
      'Roubaron a chave. Os sospeitosos falan, pero non todos din a verdade. Razoa quen a ten.',
    caso: (i, n) => `Caso ${i}/${n}`,
    regla: { una_verdad: 'Só un di a verdade.', una_mentira: 'Só un minte.' },
    pregunta: 'Quen ten a chave?',
    dicho: (d, nombres, quien) => {
      const yo = d.sobre === quien
      if (d.tipo === 'tiene')
        return yo ? '«A chave téñoa eu.»' : `«A chave tena ${nombres[d.sobre]}.»`
      if (d.tipo === 'no_tiene') return yo ? '«Eu non a teño.»' : `«${nombres[d.sobre]} non a ten.»`
      if (d.tipo === 'miente') return `«${nombres[d.sobre]} minte.»`
      return `«${nombres[d.sobre]} di a verdade.»`
    },
    mal: (s) => `Non era. +${s} s e caso novo.`,
    malPropio: (s) => `Non era. +${s} s. Volve pensalo.`,
    bien: 'Exacto!',
    culpable: 'Culpable',
    acusar: (n) => `Acusar a ${n}`,
    señala: 'Sinala a quen a ten',
  },
  mastermind: {
    ...es.mastermind,
    intro: (largo, intentos, repetir) =>
      `Adiviña o código de ${largo} símbolos en ${intentos} intentos.${repetir ? ' Pode repetir símbolos.' : ''} Cada intento dite cantos están ben colocados e cantos están pero noutro sitio.`,
    probar: 'Probar',
    borrar: 'Borrar',
    quedan: (n) => (n === 1 ? 'Queda 1 intento' : `Quedan ${n} intentos`),
    exactas: 'ben colocados',
    casi: 'noutro sitio',
    agotado: (s) => `Sen intentos. +${s} s e código novo.`,
    simbolo: (i) => SIMBOLOS_GL[i],
  },
  balanza: {
    ...es.balanza,
    intro: (bolas, pesadas) =>
      `Hai ${bolas} bólas iguais, pero unha pesa máis. Tes ${pesadas} pesadas: toca unha bóla para poñela á esquerda, outra vez á dereita e outra para quitala.`,
    izquierda: 'Esquerda',
    derecha: 'Dereita',
    pesar: 'Pesar',
    quedan: (n) => (n === 1 ? 'Queda 1 pesada' : `Quedan ${n} pesadas`),
    señalar: 'Sinalar a pesada',
    cancelar: 'Seguir pesando',
    eligeBola: 'Toca a bóla que pesa máis',
    resultado: (r) =>
      r === 0 ? 'Equilibrio' : r < 0 ? 'Pesa máis a esquerda' : 'Pesa máis a dereita',
    ayuda: 'Pon bólas nos dous pratos',
    mal: (s) => `Non era. +${s} s e comezas de novo.`,
    bola: (i) => `Bóla ${i + 1}`,
  },
}

const en: T = {
  empezar: 'Start',
  reintentar: 'Retry',
  ronda: (i, n) => `Round ${i}/${n}`,
  enviando: 'Advancing…',
  resuelto: 'Solved!',
  penalizacion: (s) => `+${s} s`,
  fallos: (n) => (n === 1 ? '1 mistake' : `${n} mistakes`),
  interrogatorio: {
    titulo: 'Interrogation',
    intro:
      'The key has been stolen. The suspects talk, but not all of them tell the truth. Work out who has it.',
    caso: (i, n) => `Case ${i}/${n}`,
    regla: { una_verdad: 'Only one tells the truth.', una_mentira: 'Only one lies.' },
    pregunta: 'Who has the key?',
    dicho: (d, nombres, quien) => {
      const yo = d.sobre === quien
      if (d.tipo === 'tiene') return yo ? '“I have the key.”' : `“${nombres[d.sobre]} has the key.”`
      if (d.tipo === 'no_tiene')
        return yo ? '“I don’t have it.”' : `“${nombres[d.sobre]} doesn’t have it.”`
      if (d.tipo === 'miente') return `“${nombres[d.sobre]} is lying.”`
      return `“${nombres[d.sobre]} tells the truth.”`
    },
    mal: (s) => `Wrong. +${s} s and a new case.`,
    malPropio: (s) => `Wrong. +${s} s. Think again.`,
    bien: 'Exactly!',
    culpable: 'Guilty',
    acusar: (n) => `Accuse ${n}`,
    señala: 'Pick who has it',
  },
  mastermind: {
    titulo: 'Mastermind',
    intro: (largo, intentos, repetir) =>
      `Guess the ${largo}-symbol code in ${intentos} tries.${repetir ? ' Symbols can repeat.' : ''} Each try tells you how many are in the right place and how many are elsewhere.`,
    probar: 'Try',
    borrar: 'Clear',
    quedan: (n) => (n === 1 ? '1 try left' : `${n} tries left`),
    exactas: 'right place',
    casi: 'elsewhere',
    agotado: (s) => `Out of tries. +${s} s and a new code.`,
    simbolo: (i) => SIMBOLOS_EN[i],
  },
  balanza: {
    titulo: 'Scales',
    intro: (bolas, pesadas) =>
      `There are ${bolas} identical balls, but one is heavier. You have ${pesadas} weighings: tap a ball once for the left pan, again for the right, and again to remove it.`,
    izquierda: 'Left',
    derecha: 'Right',
    pesar: 'Weigh',
    quedan: (n) => (n === 1 ? '1 weighing left' : `${n} weighings left`),
    señalar: 'Point out the heavy one',
    cancelar: 'Keep weighing',
    eligeBola: 'Tap the heavier ball',
    resultado: (r) => (r === 0 ? 'Balanced' : r < 0 ? 'Left is heavier' : 'Right is heavier'),
    ayuda: 'Put balls on both pans',
    mal: (s) => `Wrong. +${s} s and you start again.`,
    bola: (i) => `Ball ${i + 1}`,
  },
}

const TEXTOS: Record<Locale, T> = { es, gl, en }

export function textosDeLogica(locale: string | null | undefined): T {
  return TEXTOS[(locale as Locale) in TEXTOS ? (locale as Locale) : 'es']
}

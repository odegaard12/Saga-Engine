import type { Locale } from '../../../../i18n'

/** Textos del Eco rítmico (30/10) en es/gl/en. Viven aquí y no en core/textos.ts: son de este juego. */
type T = {
  titulo: string
  intro: (rondas: number, largas: boolean) => string
  empezar: string
  ronda: (i: number, n: number) => string
  escucha: string
  turno: string
  bien: string
  siguiente: string
  malFicha: (s: number) => string
  malRitmo: (s: number) => string
  salio: (s: number) => string
  otra: string
  resuelto: string
  enviando: string
  reintentar: string
  penalizacion: (s: number) => string
  sonido: (on: boolean) => string
  ritmo: string
  corto: string
  largo: string
  fichas: string[]
}

const es: T = {
  titulo: 'Eco rítmico',
  intro: (n, largas) =>
    `Mira (y escucha) los golpes y repítelos en el mismo orden y con el mismo ritmo. ${n} rondas: cada una suma un golpe.${
      largas ? ' Los golpes largos esperan el doble antes del siguiente.' : ''
    }`,
  empezar: 'Empezar',
  ronda: (i, n) => `Ronda ${i}/${n}`,
  escucha: 'Atento…',
  turno: 'Tu turno: repite el ritmo',
  bien: '¡Bien! Ese ritmo era.',
  siguiente: 'Siguiente ronda',
  malFicha: (s) => `Ficha equivocada. +${s} s y otra secuencia.`,
  malRitmo: (s) => `Las fichas bien, el ritmo no. +${s} s y otra secuencia.`,
  salio: (s) => `Saliste a mitad. +${s} s y otra secuencia.`,
  otra: 'Ver la nueva',
  resuelto: '¡Eco perfecto!',
  enviando: 'Enviando…',
  reintentar: 'Reintentar',
  penalizacion: (s) => `+${s} s`,
  sonido: (on) => (on ? 'Sonido activado' : 'Sonido apagado'),
  ritmo: 'Ritmo de la ronda',
  corto: 'corto',
  largo: 'largo',
  fichas: ['círculo', 'triángulo', 'cuadrado', 'rombo', 'estrella', 'cruz'],
}

const gl: T = {
  titulo: 'Eco rítmico',
  intro: (n, largas) =>
    `Mira (e escoita) os golpes e repíteos na mesma orde e co mesmo ritmo. ${n} roldas: cada unha suma un golpe.${
      largas ? ' Os golpes longos agardan o dobre antes do seguinte.' : ''
    }`,
  empezar: 'Comezar',
  ronda: (i, n) => `Rolda ${i}/${n}`,
  escucha: 'Atento…',
  turno: 'A túa quenda: repite o ritmo',
  bien: 'Ben! Ese era o ritmo.',
  siguiente: 'Seguinte rolda',
  malFicha: (s) => `Ficha equivocada. +${s} s e outra secuencia.`,
  malRitmo: (s) => `As fichas ben, o ritmo non. +${s} s e outra secuencia.`,
  salio: (s) => `Saíches a metade. +${s} s e outra secuencia.`,
  otra: 'Ver a nova',
  resuelto: 'Eco perfecto!',
  enviando: 'Enviando…',
  reintentar: 'Tentar de novo',
  penalizacion: (s) => `+${s} s`,
  sonido: (on) => (on ? 'Son activado' : 'Son apagado'),
  ritmo: 'Ritmo da rolda',
  corto: 'curto',
  largo: 'longo',
  fichas: ['círculo', 'triángulo', 'cadrado', 'rombo', 'estrela', 'cruz'],
}

const en: T = {
  titulo: 'Rhythm echo',
  intro: (n, largas) =>
    `Watch (and listen to) the beats, then repeat them in the same order and rhythm. ${n} rounds: each one adds a beat.${
      largas ? ' Long beats wait twice as long before the next one.' : ''
    }`,
  empezar: 'Start',
  ronda: (i, n) => `Round ${i}/${n}`,
  escucha: 'Watch…',
  turno: 'Your turn: repeat the rhythm',
  bien: 'Nice! That was the rhythm.',
  siguiente: 'Next round',
  malFicha: (s) => `Wrong tile. +${s} s and a new sequence.`,
  malRitmo: (s) => `Right tiles, wrong rhythm. +${s} s and a new sequence.`,
  salio: (s) => `You left halfway. +${s} s and a new sequence.`,
  otra: 'Watch the new one',
  resuelto: 'Perfect echo!',
  enviando: 'Sending…',
  reintentar: 'Retry',
  penalizacion: (s) => `+${s} s`,
  sonido: (on) => (on ? 'Sound on' : 'Sound off'),
  ritmo: 'Rhythm of the round',
  corto: 'short',
  largo: 'long',
  fichas: ['circle', 'triangle', 'square', 'diamond', 'star', 'cross'],
}

const TEXTOS: Record<Locale, T> = { es, gl, en }

export function textosDeEco(locale: string | null | undefined): T {
  return TEXTOS[(locale as Locale) in TEXTOS ? (locale as Locale) : 'es']
}

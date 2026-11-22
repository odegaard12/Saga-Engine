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
  fallo: string
  siguiente: string
  malFicha: (s: number) => string
  malRitmo: (s: number, raya: boolean) => string
  salio: (s: number) => string
  otra: string
  resuelto: string
  enviando: string
  reintentar: string
  penalizacion: (s: number) => string
  sonido: (on: boolean) => string
  ritmo: string
  tuyos: string
  punto: string
  raya: string
  leyenda: string
  fichas: string[]
}

const es: T = {
  titulo: 'Eco rítmico',
  intro: (n, largas) =>
    `Mira (y escucha) los golpes y repítelos en el mismo orden y con el mismo ritmo. ${n} rondas: cada una suma un golpe (hasta 6).${
      largas ? ' Hay puntos (cortos) y rayas (largos).' : ''
    }`,
  empezar: 'Empezar',
  ronda: (i, n) => `Ronda ${i}/${n}`,
  escucha: 'Escucha',
  turno: 'Tu turno',
  bien: '¡Bien! Ese ritmo era.',
  fallo: 'Fallo',
  siguiente: 'Siguiente ronda',
  malFicha: (s) => `Ficha equivocada. +${s} s. Es la misma secuencia: aprovecha para memorizarla.`,
  malRitmo: (s, raya) =>
    `La ficha bien, pero era ${raya ? 'una raya: deja el dedo' : 'un punto: toca y suelta'}. +${s} s. Es la misma secuencia.`,
  salio: (s) => `Saliste a mitad. +${s} s. Es la misma secuencia.`,
  otra: 'Verla otra vez',
  resuelto: '¡Eco perfecto!',
  enviando: 'Enviando…',
  reintentar: 'Reintentar',
  penalizacion: (s) => `+${s} s`,
  sonido: (on) => (on ? 'Sonido activado' : 'Sonido apagado'),
  ritmo: 'Ritmo de la ronda',
  tuyos: 'Tus golpes',
  punto: 'punto',
  raya: 'raya',
  leyenda: 'Punto: toca y suelta · Raya: deja el dedo hasta cerrar el aro',
  fichas: ['círculo', 'triángulo', 'cuadrado', 'rombo', 'estrella', 'cruz'],
}

const gl: T = {
  titulo: 'Eco rítmico',
  intro: (n, largas) =>
    `Mira (e escoita) os golpes e repíteos na mesma orde e co mesmo ritmo. ${n} roldas: cada unha suma un golpe (ata 6).${
      largas ? ' Hai puntos (curtos) e raias (longas).' : ''
    }`,
  empezar: 'Comezar',
  ronda: (i, n) => `Rolda ${i}/${n}`,
  escucha: 'Escoita',
  turno: 'A túa quenda',
  bien: 'Ben! Ese era o ritmo.',
  fallo: 'Fallo',
  siguiente: 'Seguinte rolda',
  malFicha: (s) => `Ficha equivocada. +${s} s. É a mesma secuencia: aproveita para memorizala.`,
  malRitmo: (s, raya) =>
    `A ficha ben, pero era ${raya ? 'unha raia: deixa o dedo' : 'un punto: toca e solta'}. +${s} s. É a mesma secuencia.`,
  salio: (s) => `Saíches a metade. +${s} s. É a mesma secuencia.`,
  otra: 'Velo de novo',
  resuelto: 'Eco perfecto!',
  enviando: 'Enviando…',
  reintentar: 'Tentar de novo',
  penalizacion: (s) => `+${s} s`,
  sonido: (on) => (on ? 'Son activado' : 'Son apagado'),
  ritmo: 'Ritmo da rolda',
  tuyos: 'Os teus golpes',
  punto: 'punto',
  raya: 'raia',
  leyenda: 'Punto: toca e solta · Raia: deixa o dedo ata pechar o aro',
  fichas: ['círculo', 'triángulo', 'cadrado', 'rombo', 'estrela', 'cruz'],
}

const TEXTOS: Record<Locale, T> = { es, gl }

export function textosDeEco(locale: string | null | undefined): T {
  return TEXTOS[(locale as Locale) in TEXTOS ? (locale as Locale) : 'es']
}

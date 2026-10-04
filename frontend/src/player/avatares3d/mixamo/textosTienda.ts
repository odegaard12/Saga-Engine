/**
 * Los textos de la tienda de ropa y del menú de gestos, en español y en gallego
 * (el inglés cae en español: la aplicación del jugador sólo tiene esos dos).
 */
export type IdiomaTienda = 'es' | 'gl'

export const TEXTOS_TIENDA = {
  es: {
    titulo: 'Tienda de ropa',
    tituloPrimera: 'Elige tu personaje',
    ayudaPrimera:
      'Así te verán tú y tu equipo en el mapa. Cámbialo cuando quieras con el botón de la camiseta.',
    cerrar: 'Cerrar',
    listo: 'Listo',
    guardando: 'Guardando…',
    cancelar: 'Cancelar',
    pestanas: { pj: 'Personaje', ropa: 'Ropa', con: 'Conjuntos', obj: 'Objetos', ges: 'Gestos' },
    personaje: 'Personaje',
    colorCamiseta: 'Color de camiseta / chaqueta',
    colorPantalon: 'Color de pantalón',
    pelo: 'Pelo',
    conjuntos: 'Conjuntos',
    conjuntosAyuda: 'Un toque y listo: cambian la ropa y los objetos, no el personaje.',
    complementos: 'Complementos',
    equipado: 'Puesto',
    equipadoNada: 'nada',
    manos: 'Manos',
    izq: 'izq.',
    dcha: 'dcha.',
    manoDchaOcupada: 'Mano dcha. ocupada',
    manoIzqOcupada: 'Mano izq. ocupada',
    manosOcupadas: 'Manos ocupadas',
    gestos: 'Gestos',
    gestosAyuda: 'Toca uno para verlo. En el mapa, toca a tu personaje para hacerlo.',
    cargando: 'Preparando el vestuario…',
    sinTresD: 'Tu móvil no puede mostrar el personaje en 3D; puedes elegir igualmente.',
    sinModelo: 'No se pudo bajar el personaje. Revisa la cobertura e inténtalo otra vez.',
    reintentar: 'Reintentar',
    ocupado:
      'Otro jugador ya lleva exactamente este aspecto. Cambia un color o un complemento para ser único.',
    ocupadoTrasGuardar:
      'Justo ahora otro jugador se ha quedado con ese aspecto. Cambia algo y vuelve a probar.',
    sinCobertura: 'Sin cobertura: se guarda en el móvil y se sube cuando vuelva.',
    giraAyuda: 'Desliza para girar',
    enUso: (n: number) => (n === 1 ? 'Lo lleva 1 jugador' : `Lo llevan ${n} jugadores`),
    enUsoAyuda: 'El punto marca los personajes que ya lleva alguien. Puedes elegirlos igual: lo que no se repite es el aspecto entero.',
  },
  gl: {
    titulo: 'Tenda de roupa',
    tituloPrimera: 'Escolle o teu personaxe',
    ayudaPrimera:
      'Así te verán ti e o teu equipo no mapa. Cámbiao cando queiras co botón da camiseta.',
    cerrar: 'Pechar',
    listo: 'Listo',
    guardando: 'Gardando…',
    cancelar: 'Cancelar',
    pestanas: { pj: 'Personaxe', ropa: 'Roupa', con: 'Conxuntos', obj: 'Obxectos', ges: 'Acenos' },
    personaje: 'Personaxe',
    colorCamiseta: 'Cor da camiseta / chaqueta',
    colorPantalon: 'Cor do pantalón',
    pelo: 'Pelo',
    conjuntos: 'Conxuntos',
    conjuntosAyuda: 'Un toque e listo: cambian a roupa e os obxectos, non o personaxe.',
    complementos: 'Complementos',
    equipado: 'Posto',
    equipadoNada: 'nada',
    manos: 'Mans',
    izq: 'esq.',
    dcha: 'dta.',
    manoDchaOcupada: 'Man dta. ocupada',
    manoIzqOcupada: 'Man esq. ocupada',
    manosOcupadas: 'Mans ocupadas',
    gestos: 'Acenos',
    gestosAyuda: 'Toca un para velo. No mapa, toca o teu personaxe para facelo.',
    cargando: 'Preparando o vestiario…',
    sinTresD: 'O teu móbil non pode amosar o personaxe en 3D; podes escoller igualmente.',
    sinModelo: 'Non se puido baixar o personaxe. Revisa a cobertura e téntao outra vez.',
    reintentar: 'Tentar de novo',
    ocupado:
      'Outro xogador xa leva exactamente este aspecto. Cambia unha cor ou un complemento para seres único.',
    ocupadoTrasGuardar:
      'Xusto agora outro xogador quedou con ese aspecto. Cambia algo e proba de novo.',
    sinCobertura: 'Sen cobertura: gárdase no móbil e sobe cando volva.',
    giraAyuda: 'Desliza para xirar',
    enUso: (n: number) => (n === 1 ? 'Úsao 1 xogador' : `Úsano ${n} xogadores`),
    enUsoAyuda: 'O punto marca os personaxes que xa leva alguén. Podes escollelos igual: o que non se repite é o aspecto enteiro.',
  },
} as const

export type TextosTienda = (typeof TEXTOS_TIENDA)['es']

export const TEXTOS_MENU_GESTOS = {
  es: { titulo: 'Tu personaje', ayuda: 'Haz un gesto', tienda: 'Tienda de ropa', cerrar: 'Cerrar' },
  gl: {
    titulo: 'O teu personaxe',
    ayuda: 'Fai un aceno',
    tienda: 'Tenda de roupa',
    cerrar: 'Pechar',
  },
} as const

export function idiomaDeTienda(locale: string): IdiomaTienda {
  return locale === 'gl' ? 'gl' : 'es'
}

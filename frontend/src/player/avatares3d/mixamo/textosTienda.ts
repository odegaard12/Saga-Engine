/**
 * Los textos de la tienda de ropa y del menú de gestos, en español y en gallego
 * (el inglés cae en español: la aplicación del jugador sólo tiene esos dos).
 */
export type IdiomaTienda = 'es' | 'gl'

export const TEXTOS_TIENDA = {
  es: {
    /** Para elegir la pista del servidor en su idioma (`pistaDe`). */
    idioma: 'es' as IdiomaTienda,
    titulo: 'Tienda de ropa',
    tituloPrimera: 'Elige tu personaje',
    ayudaPrimera:
      'Así te verán tú y tu equipo en el mapa. Cámbialo cuando quieras con el botón de la camiseta.',
    cerrar: 'Cerrar',
    listo: 'Listo',
    guardando: 'Guardando…',
    cancelar: 'Cancelar',
    pestanas: { pj: 'Personaje', ropa: 'Ropa', con: 'Conjuntos', obj: 'Accesorios', ges: 'Gestos' },
    personaje: 'Personaje',
    colorCamiseta: 'Color de camiseta / chaqueta',
    colorPantalon: 'Color de pantalón',
    colorCalzado: 'Calzado',
    pelo: 'Pelo',
    conjuntos: 'Conjuntos',
    conjuntosAyuda: 'Un toque y listo: cambian la ropa y los objetos, no el personaje.',
    complementos: 'Complementos',
    equipado: 'Puesto',
    equipadoNada: 'nada',
    manos: 'Manos',
    chipManos: 'Manos',
    izq: 'izq.',
    dcha: 'dcha.',
    manoDchaOcupada: 'Mano dcha. ocupada',
    manoIzqOcupada: 'Mano izq. ocupada',
    manosOcupadas: 'Manos ocupadas',
    sustituye: 'Quita:',
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
    enUsoAyuda:
      'El punto marca los personajes que ya lleva alguien. Puedes elegirlos igual: lo que no se repite es el aspecto entero.',
    // Vestuario desbloqueable
    bloqueado: 'Bloqueado',
    nuevo: 'Nuevo',
    pruebaBloqueado: 'Puedes probarlo, pero aún no es tuyo.',
    quitaParaGuardar: (piezas: string) =>
      `Para guardar, quita lo que aún no has ganado: ${piezas}.`,
    bloqueadoTrasGuardar:
      'Algo de lo que llevas aún no está desbloqueado. Quítalo y vuelve a probar.',
    progreso: (a: number, m: number) => `${a} de ${m}`,
    // Estrellas
    estrellas: (n: number) => (n === 1 ? '1 estrella' : `${n} estrellas`),
    estrellasAyuda: 'Ganas estrellas por cada nodo que superas. Gástalas en lo que esté bloqueado.',
    comprar: 'Comprar',
    comprando: 'Comprando…',
    faltan: (n: number) => (n === 1 ? 'Te falta 1 estrella' : `Te faltan ${n} estrellas`),
    compraSinRed: 'Para comprar necesitas cobertura.',
    compraNoDisponible: 'Esta pieza ya no se puede comprar.',
    comprada: (nombre: string) => `Ya es tuya: ${nombre}`,
    llevasConPrecio: 'Lo que llevas y aún no es tuyo',
  },
  gl: {
    idioma: 'gl' as IdiomaTienda,
    titulo: 'Tenda de roupa',
    tituloPrimera: 'Escolle o teu personaxe',
    ayudaPrimera:
      'Así te verán ti e o teu equipo no mapa. Cámbiao cando queiras co botón da camiseta.',
    cerrar: 'Pechar',
    listo: 'Listo',
    guardando: 'Gardando…',
    cancelar: 'Cancelar',
    pestanas: {
      pj: 'Personaxe',
      ropa: 'Roupa',
      con: 'Conxuntos',
      obj: 'Accesorios',
      ges: 'Acenos',
    },
    personaje: 'Personaxe',
    colorCamiseta: 'Cor da camiseta / chaqueta',
    colorPantalon: 'Cor do pantalón',
    colorCalzado: 'Calzado',
    pelo: 'Pelo',
    conjuntos: 'Conxuntos',
    conjuntosAyuda: 'Un toque e listo: cambian a roupa e os obxectos, non o personaxe.',
    complementos: 'Complementos',
    equipado: 'Posto',
    equipadoNada: 'nada',
    manos: 'Mans',
    chipManos: 'Mans',
    izq: 'esq.',
    dcha: 'dta.',
    manoDchaOcupada: 'Man dta. ocupada',
    manoIzqOcupada: 'Man esq. ocupada',
    manosOcupadas: 'Mans ocupadas',
    sustituye: 'Quita:',
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
    enUsoAyuda:
      'O punto marca os personaxes que xa leva alguén. Podes escollelos igual: o que non se repite é o aspecto enteiro.',
    // Vestiario desbloqueable
    bloqueado: 'Bloqueado',
    nuevo: 'Novo',
    pruebaBloqueado: 'Podes probalo, pero aínda non é teu.',
    quitaParaGuardar: (piezas: string) => `Para gardar, quita o que aínda non gañaches: ${piezas}.`,
    bloqueadoTrasGuardar: 'Algo do que levas aínda non está desbloqueado. Quítao e volve probar.',
    progreso: (a: number, m: number) => `${a} de ${m}`,
    estrellas: (n: number) => (n === 1 ? '1 estrela' : `${n} estrelas`),
    estrellasAyuda: 'Gañas estrelas por cada nodo que superas. Gástaas no que estea bloqueado.',
    comprar: 'Mercar',
    comprando: 'Mercando…',
    faltan: (n: number) => (n === 1 ? 'Fáltache 1 estrela' : `Fáltanche ${n} estrelas`),
    compraSinRed: 'Para mercar precisas cobertura.',
    compraNoDisponible: 'Esta peza xa non se pode mercar.',
    comprada: (nombre: string) => `Xa é túa: ${nombre}`,
    llevasConPrecio: 'O que levas e aínda non é teu',
  },
} as const

export type TextosTienda = (typeof TEXTOS_TIENDA)['es']

export const TEXTOS_MENU_GESTOS = {
  es: {
    titulo: 'Tu personaje',
    ayuda: 'Haz un gesto',
    subtitulo: 'Tócalo y mira a tu muñeco en el mapa: el menú sigue abierto para probar otro.',
    tienda: 'Tienda de ropa',
    cerrar: 'Cerrar',
    filaGestos: 'Gesto',
    filaMensajes: 'Mensaje (lo ve tu grupo)',
    grupos: { saludar: 'Saludar y celebrar', responder: 'Responder', expresar: 'Expresar' },
  },
  gl: {
    titulo: 'O teu personaxe',
    ayuda: 'Fai un aceno',
    subtitulo: 'Tócao e mira o teu boneco no mapa: o menú segue aberto para probar outro.',
    tienda: 'Tenda de roupa',
    cerrar: 'Pechar',
    filaGestos: 'Aceno',
    filaMensajes: 'Mensaxe (veo o teu grupo)',
    grupos: { saludar: 'Saudar e celebrar', responder: 'Responder', expresar: 'Expresar' },
  },
} as const

export function idiomaDeTienda(locale: string): IdiomaTienda {
  return locale === 'gl' ? 'gl' : 'es'
}

/**
 * Qué PIN enseña el panel tras cada acción (revisión 23/10/2026).
 *
 * Los PIN se ven UNA vez. Antes, cada respuesta sustituía a lo que había en pantalla: con un doble toque en
 * «Generar PIN para los que faltan», la segunda respuesta llegaba vacía («todos tienen ya su PIN») y borraba los
 * que acababa de dar la primera. Ya no se podían volver a ver y había que rehacerlos todos.
 *
 * - generar: se añaden los nuevos a los que ya se ven (un PIN rehecho sustituye al suyo); si no llega ninguno,
 *   se queda lo que había.
 * - quitar: los PIN dejan de valer, así que se dejan de enseñar.
 */
export function pinesAEnsenar(
  actuales: Record<string, string>,
  accion: string,
  recibidos: Record<string, string> | undefined
): Record<string, string> {
  if (accion === 'quitar') return {}
  if (accion !== 'generar' || !recibidos || !Object.keys(recibidos).length) return actuales
  return { ...actuales, ...recibidos }
}

/**
 * El aviso al guardar jugadores con los PIN puestos y alguno sin el suyo (revisión 24/10/2026), o null.
 *
 * Un jugador añadido con los PIN activos no tiene PIN: en la portada sólo veía «PIN incorrecto» y no entraba, y
 * nada en el panel lo decía. Generar sólo da PIN a quien le falta: los que ya están repartidos no cambian.
 */
export function avisoJugadoresSinPin(sinPin: string[] | undefined): string | null {
  if (!sinPin || !sinPin.length) return null
  const nombres = sinPin.slice(0, 6).join(', ') + (sinPin.length > 6 ? ` y ${sinPin.length - 6} más` : '')
  return (
    `Jugadores guardados, pero ${sinPin.length === 1 ? 'uno no tiene' : `${sinPin.length} no tienen`} PIN y no ` +
    `${sinPin.length === 1 ? 'podrá' : 'podrán'} entrar: ${nombres}. Dáselo en Ajustes › PIN por jugador › ` +
    '«Generar PIN para los que faltan» (los PIN ya repartidos no cambian).'
  )
}

/** Lo que el servidor dejó fuera al guardar jugadores (13/11): antes se descartaba en silencio y decía «guardado». */
export type JugadoresDescartados = {
  perfiles_de_mas?: number
  fotos_demasiado_grandes?: string[]
  ids_repetidos?: string[]
  ids_parecidos?: string[]
}

function lista(ids: string[]): string {
  return ids.slice(0, 6).join(', ') + (ids.length > 6 ? ` y ${ids.length - 6} más` : '')
}

/** El aviso de lo descartado al guardar jugadores, o null si no se descartó nada. */
export function avisoDescartados(d: JugadoresDescartados | undefined): string | null {
  if (!d) return null
  const partes: string[] = []
  const demas = Number(d.perfiles_de_mas) || 0
  if (demas > 0) {
    partes.push(
      demas === 1
        ? 'un jugador no se ha guardado por pasar del máximo de 60'
        : `${demas} jugadores no se han guardado por pasar del máximo de 60`
    )
  }
  if (d.fotos_demasiado_grandes?.length) {
    partes.push(`sin foto por pesar demasiado (usa una imagen más pequeña): ${lista(d.fotos_demasiado_grandes)}`)
  }
  if (d.ids_repetidos?.length) {
    partes.push(`no se han guardado por repetir el id de otro (sin distinguir mayúsculas): ${lista(d.ids_repetidos)}`)
  }
  if (d.ids_parecidos?.length) {
    partes.push(
      `ids que solo se distinguen por las mayúsculas y comparten partida (conviene renombrar uno): ${lista(d.ids_parecidos)}`
    )
  }
  return partes.length ? `Ojo: ${partes.join('; ')}.` : null
}

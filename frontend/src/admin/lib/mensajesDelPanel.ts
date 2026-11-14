/**
 * Lo que le dice el panel al organizador al actuar sobre un jugador: confirmaciones, avisos de hecho y errores.
 *
 * Puro (sin React). Reglas de redacción: el nombre del jugador (nunca su id), «nodo 4 → 5» como lo ve el jugador (no «nivel
 * 3 → 4»), qué se entrega y cuánto tiempo cuesta, y errores en español sin términos técnicos (profile, stage, reset_at).
 */
import { etiquetaDeSegundos } from './ajusteDeTiempo'

/** Una acción de la ficha, con las palabras con que se nombra (un solo vocabulario). */
export const NOMBRE_DE_ACCION: Record<string, string> = {
  level_prev: 'un nodo atrás',
  level_next: 'un nodo adelante',
  restore_node: 'nodo restaurado',
  mark_finished: 'partida terminada',
  reset_profile: 'partida reiniciada',
  clear_inventory: 'mochila vaciada',
  give_item: 'objeto entregado',
  remove_item: 'objeto retirado',
  ajuste_de_tiempo: 'ajuste de tiempo',
}

export type NodoDeRespuesta = { indice: number; total: number; nombre?: string }

export type RespuestaDeAccion = {
  action?: string
  previous_level?: number
  level?: number
  total_stages?: number
  nodo_antes?: NodoDeRespuesta | null
  nodo_despues?: NodoDeRespuesta | null
  entregado?: Array<{ item_id?: string; label?: string; quantity?: number }>
  desbloqueos?: Array<{ clave?: string; label?: string }>
  tiempo_cobrado_ms?: number
  avisos?: string[]
  mueve_nivel?: { de?: number; a?: number } | null
  objeto_conocido?: boolean
  repetida?: boolean
  aplicado_ms?: number
  total_time_ms?: number
}

/** «Nodo 4» de un nivel (0-based) o de lo que dice el servidor. */
function numeroDeNodo(
  nodo: NodoDeRespuesta | null | undefined,
  nivel: number | undefined
): number | null {
  // `indice` del servidor ya es 1-based («Nodo {indice} de {total}»); `nivel` es 0-based.
  if (nodo && Number.isFinite(nodo.indice) && nodo.indice > 0) return nodo.indice
  return typeof nivel === 'number' ? nivel + 1 : null
}

function lista(partes: string[]): string {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

function cosasEntregadas(r: RespuestaDeAccion): string[] {
  const objetos = (r.entregado || []).map((e) => {
    const nombre = String(e.label || e.item_id || '').trim()
    const cantidad = Number(e.quantity)
    return nombre ? (cantidad > 1 ? `${cantidad} × ${nombre}` : nombre) : ''
  })
  const piezas = (r.desbloqueos || []).map((d) => String(d.label || d.clave || '').trim())
  return [...objetos, ...piezas].filter(Boolean)
}

const AL_RECONECTAR = 'Lo verá en su móvil al reconectar.'

/**
 * El aviso cuando una acción sobre un jugador ha quedado guardada. Con lo que trae la respuesta del servidor
 * (`nodo_antes`, `entregado`, `tiempo_cobrado_ms`…) o, si es un servidor sin esos campos, con los niveles de siempre.
 */
export function textoDeResultado(
  accion: string,
  nombre: string,
  etiqueta: string,
  r: RespuestaDeAccion,
  repetida = false
): string {
  const base = accion.split(':')[0]
  const antes = numeroDeNodo(r.nodo_antes, r.previous_level)
  const despues = numeroDeNodo(r.nodo_despues, r.level)
  const recibe = cosasEntregadas(r)
  const tiempo = Number(r.tiempo_cobrado_ms)
  const partes: string[] = []

  if (base === 'give_item') {
    const que = recibe.length ? recibe.join(', ') : 'el objeto'
    partes.push(`Dado «${que}» a ${nombre}.`)
    // `mueve_nivel` es 1-based. Si el servidor ya lo explica en `avisos` (con los nodos saltados), no se repite.
    if (
      r.mueve_nivel &&
      typeof r.mueve_nivel.de === 'number' &&
      typeof r.mueve_nivel.a === 'number' &&
      !(r.avisos || []).length
    ) {
      partes.push(`Pasa del nodo ${r.mueve_nivel.de} al ${r.mueve_nivel.a}.`)
    }
  } else if (base === 'remove_item') {
    partes.push(`Quitado el objeto a ${nombre}.`)
  } else if (base === 'clear_inventory') {
    partes.push(`Mochila de ${nombre} vaciada.`)
  } else if (base === 'reset_profile') {
    partes.push(`Partida de ${nombre} reiniciada: vuelve al primer nodo.`)
  } else if (base === 'mark_finished') {
    partes.push(`${nombre} termina la partida.`)
    if (recibe.length) partes.push(`Se le da: ${lista(recibe)}.`)
  } else if (base === 'ajuste_de_tiempo') {
    partes.push(`Tiempo de ${nombre}: ${etiqueta}.`)
  } else if (antes !== null && despues !== null && antes !== despues) {
    partes.push(`${nombre} pasa del nodo ${antes} al ${despues}.`)
    if (recibe.length) partes.push(`Se le da: ${lista(recibe)}.`)
  } else {
    partes.push(`${nombre}: ${etiqueta}.`)
  }

  if (base !== 'ajuste_de_tiempo' && Number.isFinite(tiempo) && tiempo > 0) {
    partes.push(`+${etiquetaDeSegundos(tiempo / 1000)} de tiempo.`)
  }
  for (const aviso of r.avisos || []) if (aviso) partes.push(aviso)
  if (base === 'give_item' && r.objeto_conocido === false) {
    partes.push('Ningún nodo de la ruta da ese objeto: si fue una errata, quítaselo de la mochila.')
  }
  if (repetida) partes.push('El servidor ya lo tenía aplicado: no se ha repetido.')
  partes.push(AL_RECONECTAR)
  return partes.join(' ')
}

/** El aviso cuando una acción queda esperando cobertura (o sesión). */
export function textoDePendiente(
  nombre: string,
  etiqueta: string,
  motivo: 'sin_red' | 'sesion' | 'servidor'
): string {
  if (motivo === 'sesion')
    return `${etiqueta} para ${nombre} espera: la sesión ha caducado. Vuelve a entrar y se enviará sola.`
  if (motivo === 'servidor')
    return `${etiqueta} para ${nombre} espera: el servidor no responde. Se enviará solo en cuanto conteste.`
  return `Sin cobertura: «${etiqueta}» para ${nombre} se enviará solo al volver la señal, en orden.`
}

/** Los textos en inglés o técnicos que contesta el servidor, en castellano. Null si no se reconoce. */
export function traducirDetalleDelServidor(detalle: string): string | null {
  const d = String(detalle || '').trim()
  if (!d) return null
  if (/invalid item id/i.test(d))
    return 'El nombre del objeto no es válido (máximo 80 caracteres y sin símbolos raros).'
  if (/op_?id.*(reused|already)/i.test(d))
    return 'Esa acción ya se había enviado. Comprueba cómo está el jugador antes de repetirla.'
  if (/unknown (player|profile)|player not found|profile not found/i.test(d))
    return 'Ese jugador ya no existe en la misión. Recarga el panel.'
  if (/invalid[_ ]rules/i.test(d)) return 'Las reglas no son válidas. Revísalas y vuelve a guardar.'
  if (/revision[_ ]conflict|stale revision/i.test(d))
    return 'Otra persona ha guardado antes que tú. Recarga el panel y vuelve a intentarlo.'
  if (/invalid[_ ]quantity/i.test(d)) return 'La cantidad no es válida.'
  if (/invalid[_ ]time|invalid[_ ]segundos|invalid[_ ]tiempo/i.test(d))
    return 'El tiempo no es válido.'
  if (/player has no pin/i.test(d))
    return 'Ese jugador no tiene PIN: genera los que faltan en Ajustes.'
  return null
}

/** Lo que se enseña bajo cada botón de nodo: qué hará, con palabras del jugador. */
export function efectoDeNodo(accion: 'level_prev' | 'level_next', nodoActual: number): string {
  return accion === 'level_next'
    ? `pasa al nodo ${nodoActual + 2}`
    : `vuelve al nodo ${Math.max(1, nodoActual)}`
}

export type TiempoDeSalto = { modo: 'ninguno' | 'respaldo' | 'cifra'; ms: number }

/** Cómo se dice lo que cuesta de tiempo una elección del selector. */
export function textoDeTiempoElegido(t: TiempoDeSalto): string {
  if (t.modo === 'ninguno') return 'sin tiempo'
  if (t.modo === 'respaldo') return 'con el tiempo del código de respaldo'
  return `+${etiquetaDeSegundos(t.ms / 1000)}`
}

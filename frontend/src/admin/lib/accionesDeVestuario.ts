/**
 * Dar y quitar piezas (accesorios, colores, gestos) y estrellas desde el panel, por la misma cola que el resto de
 * acciones sobre un jugador (15/11): con `op_id`, con reintentos y sin perderse si falta cobertura. Antes iban sueltas
 * a la red: un «Regalar» sin cobertura fallaba y, si la respuesta se perdía, al repetirlo se concedía dos veces.
 *
 * Para «todos los jugadores» el id de la cola es `todos`: se ordena entre sí y no se cruza con ningún jugador.
 */
import { lanzarOperacion, nuevoOpId, type ResultadoOperacion } from './accionesDeJugador'


export const ID_DE_TODOS = 'todos'

export function darPieza(profileId: string, nombre: string, clave: string, pieza: string): Promise<ResultadoOperacion> {
  return lanzarOperacion({
    opId: nuevoOpId(),
    tipo: 'conceder',
    profileId,
    accion: `conceder:${clave}`,
    cuerpo: { jugadores: [profileId], claves: [clave], motivo: 'regalo del panel' },
    etiqueta: `dar «${pieza}» a ${nombre}`,
  })
}

export function darPiezasATodos(claves: string[], piezas: string[], motivo: string): Promise<ResultadoOperacion> {
  return lanzarOperacion({
    opId: nuevoOpId(),
    tipo: 'conceder',
    profileId: ID_DE_TODOS,
    accion: 'conceder:todos',
    cuerpo: { todos: true, claves, motivo },
    etiqueta: `dar ${piezas.join(', ')} a todos los jugadores`,
  })
}

export function quitarPieza(profileId: string, nombre: string, clave: string, pieza: string): Promise<ResultadoOperacion> {
  return lanzarOperacion({
    opId: nuevoOpId(),
    tipo: 'retirar',
    profileId,
    accion: `retirar:${clave}`,
    cuerpo: { jugador: profileId, clave, motivo: 'panel' },
    etiqueta: `quitar «${pieza}» a ${nombre}`,
  })
}

/** `profileId` null = todos los jugadores. */
export function darEstrellasPorCola(profileId: string | null, nombre: string, cantidad: number): Promise<ResultadoOperacion> {
  const quien = profileId === null ? 'todos los jugadores' : nombre
  return lanzarOperacion({
    opId: nuevoOpId(),
    tipo: 'estrellas',
    profileId: profileId ?? ID_DE_TODOS,
    accion: 'estrellas',
    cuerpo: profileId === null ? { todos: true, cantidad } : { jugadores: [profileId], cantidad },
    etiqueta: `${cantidad > 0 ? 'dar' : 'quitar'} ${Math.abs(cantidad)} ${Math.abs(cantidad) === 1 ? 'estrella' : 'estrellas'} a ${quien}`,
  })
}

/** El aviso cuando la acción ya está hecha en el servidor. */
export function textoDeVestuarioHecho(etiqueta: string, repetida: boolean): string {
  const base = `Hecho: ${etiqueta}.`
  return repetida
    ? `${base} El servidor ya lo tenía aplicado: no se ha repetido.`
    : `${base} Lo verá en su móvil al reconectar.`
}

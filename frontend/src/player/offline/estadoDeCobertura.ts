/**
 * El chip de cobertura (D1, 26/10/2026): qué decirle al jugador sobre su conexión, sin pedir nada a la red.
 * Sólo lee lo que el móvil ya sabe: si hay cobertura (redEstado) y cuántos avances de nodo esperan en la cola local.
 * Función pura: es lo que prueba tests/js/estado_de_cobertura.cjs.
 */
export type EstadoDeCobertura = {
  tipo: 'sin_red' | 'esperando' | 'sincronizando' | 'acceso_caducado' | 'perfil_inexistente'
  n: number
}

export function estadoDeCobertura(
  sinRed: boolean,
  pendientes: number,
  accesoCaducado = false,
  perfilNoExiste = false
): EstadoDeCobertura | null {
  const n = Math.max(0, Math.floor(Number(pendientes) || 0))
  if (sinRed) return n > 0 ? { tipo: 'esperando', n } : { tipo: 'sin_red', n: 0 }
  // 14/11: el servidor ya no conoce a este jugador: entrar de nuevo no lo arregla, hay que avisar a la organización.
  if (perfilNoExiste) return { tipo: 'perfil_inexistente', n }
  // 13/11: con red pero el servidor rechazando el acceso, la cola no sube nunca: no es «Sincronizando…».
  if (accesoCaducado) return { tipo: 'acceso_caducado', n }
  return n > 0 ? { tipo: 'sincronizando', n } : null
}

export type TextosDeCobertura = {
  sinRed: string
  esperando: (n: number) => string
  sincronizando: (n: number) => string
  accesoCaducado: string
  perfilInexistente: string
}

export const TEXTOS_DE_COBERTURA: Record<'es' | 'gl', TextosDeCobertura> = {
  es: {
    sinRed: 'Sin cobertura · todo se guarda en tu móvil',
    esperando: (n) => `${n} ${n === 1 ? 'avance esperando' : 'avances esperando'} cobertura`,
    sincronizando: (n) => `Sincronizando… ${n}`,
    accesoCaducado: 'Tu acceso ha caducado · entra de nuevo desde la portada',
    perfilInexistente: 'Tu perfil ya no existe · avisa a la organización',
  },
  gl: {
    sinRed: 'Sen cobertura · todo se garda no teu móbil',
    esperando: (n) => `${n} ${n === 1 ? 'avance agardando' : 'avances agardando'} cobertura`,
    sincronizando: (n) => `Sincronizando… ${n}`,
    accesoCaducado: 'O teu acceso caducou · entra de novo desde a portada',
    perfilInexistente: 'O teu perfil xa non existe · avisa á organización',
  },
}

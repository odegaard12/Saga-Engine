/**
 * El chip de cobertura (D1, 26/10/2026): qué decirle al jugador sobre su conexión, sin pedir nada a la red.
 * Sólo lee lo que el móvil ya sabe: si hay cobertura (redEstado) y cuántos avances de nodo esperan en la cola local.
 * Función pura: es lo que prueba tests/js/estado_de_cobertura.cjs.
 */
export type EstadoDeCobertura = { tipo: 'sin_red' | 'esperando' | 'sincronizando'; n: number }

export function estadoDeCobertura(sinRed: boolean, pendientes: number): EstadoDeCobertura | null {
  const n = Math.max(0, Math.floor(Number(pendientes) || 0))
  if (sinRed) return n > 0 ? { tipo: 'esperando', n } : { tipo: 'sin_red', n: 0 }
  return n > 0 ? { tipo: 'sincronizando', n } : null
}

export type TextosDeCobertura = {
  sinRed: string
  esperando: (n: number) => string
  sincronizando: (n: number) => string
}

export const TEXTOS_DE_COBERTURA: Record<'es' | 'gl' | 'en', TextosDeCobertura> = {
  es: {
    sinRed: 'Sin cobertura · todo se guarda en tu móvil',
    esperando: (n) => `${n} ${n === 1 ? 'avance esperando' : 'avances esperando'} cobertura`,
    sincronizando: (n) => `Sincronizando… ${n}`,
  },
  gl: {
    sinRed: 'Sen cobertura · todo se garda no teu móbil',
    esperando: (n) => `${n} ${n === 1 ? 'avance agardando' : 'avances agardando'} cobertura`,
    sincronizando: (n) => `Sincronizando… ${n}`,
  },
  en: {
    sinRed: 'No signal · everything is saved on your phone',
    esperando: (n) => `${n} ${n === 1 ? 'node' : 'nodes'} waiting for signal`,
    sincronizando: (n) => `Syncing… ${n}`,
  },
}

/**
 * La configuración pública (lo mismo que `/api/config`) que ya trajo la entrada al panel (24/11). Quien la necesite
 * después (las caras de los personajes en la ficha) la lee de aquí en vez de pedirla otra vez.
 *
 * Módulo aparte y sin dependencias: lo importa la entrada del panel, que tiene que pesar poco.
 */
let publica: Record<string, unknown> | null = null

export function guardarPublica(cfg: unknown) {
  if (cfg && typeof cfg === 'object') publica = cfg as Record<string, unknown>
}

export function publicaGuardada(): Record<string, unknown> | null {
  return publica
}

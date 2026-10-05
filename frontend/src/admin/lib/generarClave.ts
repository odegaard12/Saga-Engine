/**
 * Claves de misión fáciles de dictar: 8 caracteres en mayúsculas SIN ambigüedades
 * (sin 0/O, 1/I/L, 5/S, 2/Z, 6/9, 8/B, U/V). Con 21 símbolos a 8 posiciones son
 * ~35 bits: de sobra para una puerta de
 * grupo con bloqueo por intentos. Se sacan de `crypto.getRandomValues`.
 */
export const ALFABETO_CLAVE = 'ACDEFGHJKMNPQRTWXY347'

export function generarClave(largo = 8, aleatorio: (n: number) => Uint32Array = bytes): string {
  const alfabeto = ALFABETO_CLAVE
  // Rechazo de valores sesgados: el módulo sólo es uniforme por debajo del múltiplo exacto.
  const limite = Math.floor(0x100000000 / alfabeto.length) * alfabeto.length
  let salida = ''
  while (salida.length < largo) {
    for (const valor of aleatorio(largo * 2)) {
      if (valor < limite && salida.length < largo) salida += alfabeto[valor % alfabeto.length]
    }
  }
  return salida
}

function bytes(n: number): Uint32Array {
  const lote = new Uint32Array(n)
  crypto.getRandomValues(lote)
  return lote
}

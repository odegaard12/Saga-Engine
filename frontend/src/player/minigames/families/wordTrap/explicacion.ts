/**
 * La explicación de una ronda de «Trampa de palabras», que viaja cifrada.
 *
 * Antes iba en claro en el paquete, con la ronda entera, ANTES de contestar:
 * «la correcta es la B porque…» se leía en DevTools. Ahora el servidor la manda
 * cifrada con la opción correcta como clave (ver `encrypt_word_trap_explanation`
 * en backend/app/runtime/minigames.py) y sólo se abre una vez contestada.
 *
 * Mismo nivel de defensa que el hash de la respuesta: son cuatro claves
 * posibles y se fuerzan al instante. No se lee a ojo ni sale en una captura del
 * paquete, y con eso basta para lo que es.
 */

const MAGIA = 'SAGA1:'

async function sha256Bytes(datos: Uint8Array): Promise<Uint8Array> {
  const resumen = await crypto.subtle.digest('SHA-256', datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer)
  return new Uint8Array(resumen)
}

async function flujo(clave: Uint8Array, longitud: number): Promise<Uint8Array> {
  const salida = new Uint8Array(longitud)
  let escrito = 0
  let contador = 0
  while (escrito < longitud) {
    const bloque = new Uint8Array(clave.length + 4)
    bloque.set(clave)
    new DataView(bloque.buffer).setUint32(clave.length, contador, false)
    const resumen = await sha256Bytes(bloque)
    const cuanto = Math.min(resumen.length, longitud - escrito)
    salida.set(resumen.subarray(0, cuanto), escrito)
    escrito += cuanto
    contador += 1
  }
  return salida
}

/** Abre la explicación con una opción como clave. `null` si no era esa. */
export async function abrirExplicacion(
  cifrada: string,
  sal: string,
  opcion: number
): Promise<string | null> {
  if (!cifrada) return null
  try {
    const crudo = Uint8Array.from(atob(cifrada), (c) => c.charCodeAt(0))
    const clave = await sha256Bytes(new TextEncoder().encode(`${sal}:${opcion}:explicacion`))
    const mascara = await flujo(clave, crudo.length)
    const claro = new Uint8Array(crudo.length)
    for (let i = 0; i < crudo.length; i += 1) claro[i] = crudo[i] ^ mascara[i]
    const texto = new TextDecoder().decode(claro)
    return texto.startsWith(MAGIA) ? texto.slice(MAGIA.length) : null
  } catch {
    return null
  }
}

/** Prueba las opciones hasta dar con la clave. Sólo se llama tras contestar. */
export async function leerExplicacion(
  cifrada: string | undefined,
  sal: string,
  opciones: number
): Promise<string> {
  if (!cifrada) return ''
  for (let opcion = 0; opcion < opciones; opcion += 1) {
    const texto = await abrirExplicacion(cifrada, sal, opcion)
    if (texto !== null) return texto
  }
  return ''
}

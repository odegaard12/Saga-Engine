/**
 * Un `Map` de partidas por nodo que sobrevive a recargar la página.
 *
 * Los juegos guardaban fallos y penalización en un `Map` del módulo: aguantaba
 * cerrar y reabrir la hoja, pero no recargar. Recargar a mitad devolvía la
 * penalización a cero y el nodo salía «perfecto» (revisión 30/10, probado en
 * Trampa, Cuenta las señales y Eco rítmico). Ahora cada `set` se copia en
 * localStorage; `limpiarRelojes` (reinicio de la partida) borra estas claves
 * junto con las de los relojes.
 */
export const PREFIJO_PARTIDAS = 'saga:partida:'

export function partidasGuardadas<T>(juego: string) {
  const memoria = new Map<string, T>()
  const clave = (nodo: string) => `${PREFIJO_PARTIDAS}${juego}:${nodo}`
  return {
    get(nodo: string): T | undefined {
      if (memoria.has(nodo)) return memoria.get(nodo)
      try {
        const texto = window.localStorage.getItem(clave(nodo))
        if (!texto) return undefined
        const valor = JSON.parse(texto) as T
        memoria.set(nodo, valor)
        return valor
      } catch {
        return undefined
      }
    },
    has(nodo: string): boolean {
      return this.get(nodo) !== undefined
    },
    set(nodo: string, valor: T) {
      memoria.set(nodo, valor)
      try {
        window.localStorage.setItem(clave(nodo), JSON.stringify(valor))
      } catch {
        // Sin almacenamiento (modo privado lleno): queda en memoria, como antes.
      }
    },
    delete(nodo: string) {
      memoria.delete(nodo)
      try {
        window.localStorage.removeItem(clave(nodo))
      } catch {
        // idem
      }
    },
  }
}

/**
 * 13/11 (auditoría offline): cuando el servidor rechaza para siempre un «OK» porque el nodo no se abrió
 * (`invalid_completion_code:not_opened`), el móvil se queda ADELANTADO: ya está en el nodo siguiente y no hay forma
 * de reabrir el anterior. El nivel del servidor es el bueno, pero en plena partida el nivel no baja (una respuesta
 * vieja no puede hacer retroceder a nadie). Esta marca dice «en el próximo refresco, con la cola vacía, deja bajar al
 * nivel del servidor». Vive en localStorage para sobrevivir a una recarga; sin almacenamiento, simplemente no hay marca
 * y queda el descenso de siempre al abrir la app.
 */
const clave = (user: string) => `saga:bajar-al-servidor:${user}`

export function marcarBajarAlServidor(user: string): void {
  try {
    localStorage.setItem(clave(user), '1')
  } catch {
    // Sin almacenamiento: el descenso se hará al abrir la app.
  }
}

export function hayQueBajarAlServidor(user: string): boolean {
  try {
    return localStorage.getItem(clave(user)) === '1'
  } catch {
    return false
  }
}

export function olvidarBajarAlServidor(user: string): void {
  try {
    localStorage.removeItem(clave(user))
  } catch {
    // Nada que borrar.
  }
}

/** ¿Este motivo técnico del servidor es el de «no abriste el nodo»? */
export function esRechazoPorNoAbrir(motivoTecnico: unknown): boolean {
  return String(motivoTecnico || '').toLowerCase().includes('not_opened')
}

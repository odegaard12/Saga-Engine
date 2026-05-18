/**
 * navigateTo — navegación con transición de salida visual.
 * Crea un overlay negro que hace fade-in antes de cambiar de ruta,
 * evitando el flash frío de window.location.href directo.
 */
export function navigateTo(url: string, delayMs = 380): void {
  // Crear overlay de transición
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: #080c0f;
    opacity: 0;
    transition: opacity ${delayMs}ms cubic-bezier(0.16,1,0.3,1);
    pointer-events: all;
  `
  document.body.appendChild(overlay)

  // Forzar reflow para que la transición arranque
  overlay.getBoundingClientRect()
  overlay.style.opacity = '1'

  setTimeout(() => {
    window.location.href = url
  }, delayMs)
}

/**
 * Escapa texto para meterlo en HTML.
 *
 * Los tooltips y popups de Leaflet interpretan la cadena que reciben COMO HTML.
 * Los títulos de nodo y los nombres de jugador los escribe el organizador (o un
 * jugador, en su ficha), así que sin escapar un título como `<img src=x onerror=…>`
 * ejecutaba código en el panel del administrador (informe A18, self-XSS).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

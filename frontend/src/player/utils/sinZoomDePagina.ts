/**
 * La app del jugador NUNCA se amplía.
 *
 * Al enfocar un campo de texto con menos de 16 px, iOS Safari amplía la página
 * entera (y no la desampliaba sola): el jugador se encontraba media pantalla
 * fuera de vista. Se cierra por tres lados:
 *  - `<meta viewport>` con `maximum-scale=1, user-scalable=no` (ver `fijarViewport`),
 *  - todo campo de texto a 16 px como mínimo (mobile-shell.css),
 *  - los gestos de pellizco de Safari (`gesture*`), que ignoran el meta desde iOS 10.
 * El MAPA conserva su propio pellizco: MapLibre lo gestiona con eventos táctiles,
 * que estos gestos no tocan.
 */
export const VIEWPORT_SIN_ZOOM =
  'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no, viewport-fit=cover'
export const VIEWPORT_CON_ZOOM = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

/** Pone el `<meta viewport>` según la pantalla: sin ampliar en el juego, normal en el panel. */
export function fijarViewport(sinZoom: boolean): void {
  if (typeof document === 'undefined') return
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.appendChild(meta)
  }
  const contenido = sinZoom ? VIEWPORT_SIN_ZOOM : VIEWPORT_CON_ZOOM
  if (meta.content !== contenido) meta.content = contenido
  document.documentElement.classList.toggle('saga-sin-zoom', sinZoom)
}

/** Bloquea el pellizco de página de Safari (iOS ignora `user-scalable=no`). */
export function bloquearGestosDeZoom(): () => void {
  if (typeof document === 'undefined') return () => undefined
  const impedir = (evento: Event) => {
    if (document.documentElement.classList.contains('saga-sin-zoom')) evento.preventDefault()
  }
  const tipos = ['gesturestart', 'gesturechange', 'gestureend']
  tipos.forEach((tipo) => document.addEventListener(tipo, impedir, { passive: false }))
  return () => tipos.forEach((tipo) => document.removeEventListener(tipo, impedir))
}

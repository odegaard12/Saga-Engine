import type { CSSProperties } from 'react'

/**
 * Estilos en línea de `PlayerApp` (botones del mapa, aviso de conexión no
 * segura...). Estaban al final del fichero de 3 800 líneas; se sacan tal cual.
 */

// SIN CAPSULA.
//
// Cada icono llevaba su propio marco -borde, fondo y un radio de 18 clavado-
// DENTRO de otro marco: tres bordes por boton en una barra de cinco. Ahora el
// icono va suelto y lo que separa es una linea fina, que es lo que hace una
// barra de herramientas de verdad.
//
// El area de toque se queda en 44x40: es lo minimo para el dedo y no depende
// de que se vea un recuadro.
/**
 * Redondo y suelto, con su propio halo -maqueta aprobada tras varias rondas.
 *
 * Antes era una celda cuadrada dentro de una barra compartida, separada de
 * la siguiente por una raya vertical. Ahora cada icono es su propia burbuja
 * -mismo idioma que las fotos redondas del login-, con el velo oscuro de
 * fondo puesto en cada uno en vez de en un contenedor comun.
 */
export const mapRouteToggleInlineButton: CSSProperties = {
  width: 38,
  height: 38,
  minWidth: 38,
  minHeight: 38,
  padding: 0,
  borderRadius: '50%',
  border: 0,
  // SOLIDO, no translucido: mismo motivo que las dos tarjetas -ver la nota
  // de PlayerShell.tsx-. Translucido sobre el mapa daba barro.
  background: 'var(--theme-card)',
  boxShadow: '0 4px 12px rgba(0,0,0,.5)',
  color: '#f1f5f9',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  lineHeight: 1,
  position: 'relative',
  pointerEvents: 'auto',
  touchAction: 'manipulation',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background 0.15s ease',
}

export const mapPrologueButton: CSSProperties = {
  ...mapRouteToggleInlineButton,
}

// Activo: tinte del color del tema en el propio halo, no un azul fijo ni un
// filo abajo -eso solo tenia sentido cuando eran celdas de una barra-.
export const mapQuickButtonActive: CSSProperties = {
  ...mapRouteToggleInlineButton,
  background: 'var(--theme-tint-strong)',
  color: 'var(--theme-primary)',
}

// Ya no envuelve un emoji, envuelve un SVG de trazo (PlayerIcons.tsx) que
// hereda `color` del botón vía `currentColor`. El drop-shadow y el tamaño de
// letra eran para el emoji del sistema; el SVG no los necesita.
export const mapQuickIcon: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export const mapQuickCountPill: CSSProperties = {
  position: 'absolute',
  top: 5,
  right: 5,
  minWidth: 14,
  height: 14,
  padding: '0 3px',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(var(--theme-ink), .56)',
  border: '1px solid rgba(255,255,255,.16)',
  color: '#ffffff',
  fontSize: 8,
  fontWeight: 950,
  lineHeight: 1,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10)',
}

export const insecureNoticeCardStyle: CSSProperties = {
  position: 'absolute',
  top: 140,
  left: 12,
  right: 12,
  padding: 14,
  borderRadius: 20,
  background: 'rgba(220,38,38,.92)',
  border: '1px solid rgba(255,255,255,.2)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.45,
  zIndex: 1200,
  boxShadow: '0 16px 36px rgba(0,0,0,.35)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

export const insecureNoticeTitle: CSSProperties = {
  fontWeight: 900,
  fontSize: 13,
  letterSpacing: '-0.02em',
}

export const insecureNoticeBody: CSSProperties = {
  marginTop: 6,
  opacity: 0.95,
  fontWeight: 700,
}

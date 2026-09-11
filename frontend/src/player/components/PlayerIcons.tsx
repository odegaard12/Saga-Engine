import type { CSSProperties } from 'react'

/**
 * Iconos de trazo, no emoji.
 *
 * Los emoji (📷 📖 🏆 🧭) los rechazó Óscar en la ronda de maquetas: "no me
 * gustan sus iconos". El motivo de fondo, aunque no lo dijera así, es real:
 * un emoji lo dibuja la fuente del sistema operativo -Apple, Google,
 * Samsung tienen cada uno el suyo, con su propio color y su propio grosor-,
 * así que nunca se ve igual en dos móviles y nunca combina con el resto de
 * la interfaz, que sí es nuestro. Estos son SVG propios: trazo de 1.8px,
 * sin relleno, `currentColor` -heredan el color que les ponga quien los use,
 * como cualquier otro texto-.
 *
 * Inline y no una fuente de iconos: una fuente añade una petición de red y
 * un parpadeo mientras carga (FOUT/FOIT), y en una PWA que promete "juega
 * sin cobertura" depender de una fuente externa es justo el tipo de cosa
 * que un día falla en el peor momento. Esto ya está en el bundle.
 */

interface IconoProps {
  size?: number
  style?: CSSProperties
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconoCamara({ size = 20, style }: IconoProps) {
  return (
    <svg width={size} height={size} {...base} style={style} aria-hidden="true">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="14" r="3.5" />
    </svg>
  )
}

export function IconoLibro({ size = 20, style }: IconoProps) {
  return (
    <svg width={size} height={size} {...base} style={style} aria-hidden="true">
      <path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
    </svg>
  )
}

export function IconoTrofeo({ size = 20, style }: IconoProps) {
  return (
    <svg width={size} height={size} {...base} style={style} aria-hidden="true">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5c0 1.9 1.5 3.5 3.4 3.5H8" />
      <path d="M16 5h2.5A1.5 1.5 0 0 1 20 6.5c0 1.9-1.5 3.5-3.4 3.5H16" />
      <path d="M12 13v4" />
      <path d="M9 20h6" />
      <path d="M10.5 17h3l.7 3h-4.4l.7-3Z" />
    </svg>
  )
}

export function IconoBrujula({ size = 20, style }: IconoProps) {
  return (
    <svg width={size} height={size} {...base} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2 13 13l-3.8 1.8L11 11l3.8-1.8Z" />
    </svg>
  )
}

export function IconoDiana({ size = 20, style }: IconoProps) {
  return (
    <svg width={size} height={size} {...base} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconoUbicacion({ size = 20, style }: IconoProps) {
  return (
    <svg width={size} height={size} {...base} style={style} aria-hidden="true">
      <path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  )
}

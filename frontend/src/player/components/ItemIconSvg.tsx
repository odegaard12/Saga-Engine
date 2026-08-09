
export type ItemIconSvgProps = {
  itemId: string
  customIcon?: string
  className?: string
  size?: number
}

export default function ItemIconSvg({ itemId, customIcon, className = '', size = 24 }: ItemIconSvgProps) {
  const id = itemId.toLowerCase()

  // Base style to center the SVG or emoji
  const style = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
  }

  if (customIcon) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-custom ${className}`} style={{ ...style, fontSize: size * 0.8 }}>
        {customIcon}
      </div>
    )
  }

  // Key / Llave
  if (id.includes('llave') || id.includes('key')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-key ${className}`} style={style}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#f59e0b">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      </div>
    )
  }

  // EMP / Bateria / Energía
  if (id.includes('emp') || id.includes('bateria') || id.includes('battery') || id.includes('carga')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-energy ${className}`} style={style}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#3b82f6">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>
    )
  }

  // Board / Placa base / Circuito / Cable
  if (id.includes('placa') || id.includes('cables') || id.includes('board') || id.includes('chip') || id.includes('cobre')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-board ${className}`} style={style}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#8b5cf6">
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
          <path d="M9 9h6v6H9z" />
          <path d="M9 1V4M15 1V4M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
        </svg>
      </div>
    )
  }

  // Tape / Cinta
  if (id.includes('cinta') || id.includes('tape') || id.includes('aislante')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-tape ${className}`} style={style}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#10b981">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v9" />
        </svg>
      </div>
    )
  }

  // Gem / Amulet / Relic / Runa / Orbe
  if (id.includes('gema') || id.includes('amuleto') || id.includes('reliquia') || id.includes('runa') || id.includes('orbe') || id.includes('ojo') || id.includes('cristal')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-gem ${className}`} style={style}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#ec4899">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
          <line x1="12" y1="22" x2="12" y2="15.5" />
          <polyline points="22 8.5 12 15.5 2 8.5" />
          <polyline points="2 15.5 12 15.5 22 15.5" />
        </svg>
      </div>
    )
  }

  // Potion / Elixir / Herbs / Bottle
  if (id.includes('elixir') || id.includes('hierbas') || id.includes('frasco') || id.includes('agua') || id.includes('posicion')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-potion ${className}`} style={style}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#a855f7">
          <path d="M9 3h6M10 3v3L5 15a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4L14 6V3" />
        </svg>
      </div>
    )
  }

  // Shield / Armor
  if (id.includes('escudo') || id.includes('hierro') || id.includes('armadura')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-shield ${className}`} style={style}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#eab308">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
    )
  }

  // Scanner / Tech Sensor / Quantum
  if (id.includes('escaner') || id.includes('sensor') || id.includes('cuantico') || id.includes('antena')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-tech ${className}`} style={style}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#06b6d4">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20" />
        </svg>
      </div>
    )
  }

  // Sello: cuando una misión lo usa como objeto de cierre no puede caer en
  // el icono genérico de caja. Medallón lacrado con cinta.
  if (id.includes('sello') || id.includes('selo') || id.includes('seal')) {
    return (
      <div className={`saga-svg-icon saga-svg-icon-seal ${className}`} style={style}>
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <defs>
            <radialGradient id="sagaSealBody" cx="36%" cy="30%">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="55%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </radialGradient>
          </defs>
          {/* Cintas colgando */}
          <path d="M8.6 15.6 L6.6 22.4 L9.4 20.9 L11 22.6 L11.9 16.6 Z" fill="#b91c1c" />
          <path d="M15.4 15.6 L17.4 22.4 L14.6 20.9 L13 22.6 L12.1 16.6 Z" fill="#dc2626" />
          {/* Disco lacrado */}
          <circle cx="12" cy="9.5" r="7" fill="url(#sagaSealBody)" />
          <circle
            cx="12"
            cy="9.5"
            r="7"
            fill="none"
            stroke="#78350f"
            strokeWidth="1"
            opacity="0.5"
          />
          {/* Marca grabada */}
          <path
            d="M12 5.4 L13.5 8.5 L16.9 9 L14.4 11.4 L15 14.7 L12 13.1 L9 14.7 L9.6 11.4 L7.1 9 L10.5 8.5 Z"
            fill="#7c2d12"
            opacity="0.72"
          />
        </svg>
      </div>
    )
  }

  // Default Item
  return (
    <div className={`saga-svg-icon saga-svg-icon-default ${className}`} style={style}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} color="#94a3b8">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    </div>
  )
}

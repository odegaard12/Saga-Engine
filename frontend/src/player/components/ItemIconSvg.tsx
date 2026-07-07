import React from 'react'

export type ItemIconSvgProps = {
  itemId: string
  className?: string
  size?: number
}

export default function ItemIconSvg({ itemId, className = '', size = 24 }: ItemIconSvgProps) {
  const id = itemId.toLowerCase()

  // Base style to center the SVG
  const style = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
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

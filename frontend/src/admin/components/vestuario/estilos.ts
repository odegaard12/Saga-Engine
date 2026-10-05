import type { CSSProperties } from 'react'

/** Estilos compartidos de los paneles «Desbloqueables» y «Tiempos» (fondo oscuro del panel flotante). */

export const fila: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
}

export const boton: CSSProperties = {
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.06)',
  color: '#e2e8f0',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 12.5,
}

export const botonPrincipal: CSSProperties = {
  ...boton,
  background: '#2563eb',
  border: '1px solid #3b82f6',
  color: '#fff',
}

export const botonPeligro: CSSProperties = {
  ...boton,
  border: '1px solid rgba(248,113,113,.5)',
  color: '#fca5a5',
}

export const selector: CSSProperties = {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(0,0,0,.3)',
  color: '#e2e8f0',
  fontSize: 12.5,
}

export const nota: CSSProperties = { color: '#94a3b8', fontSize: 12, margin: '6px 0 0' }
export const notaError: CSSProperties = { color: '#f87171', fontSize: 12.5, margin: '8px 0 0' }
export const notaOk: CSSProperties = { color: '#86efac', fontSize: 12.5, margin: '8px 0 0' }

export const tablaWrap: CSSProperties = { overflowX: 'auto', maxWidth: '100%' }
export const tabla: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }
export const th: CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  color: '#94a3b8',
  fontWeight: 700,
  borderBottom: '1px solid rgba(255,255,255,.12)',
  whiteSpace: 'nowrap',
}
export const td: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid rgba(255,255,255,.06)',
  color: '#e2e8f0',
  verticalAlign: 'top',
}

export const chip = (activo: boolean, aviso = false): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 9px',
  borderRadius: 999,
  border: `1px solid ${aviso ? 'rgba(251,191,36,.55)' : activo ? 'rgba(134,239,172,.45)' : 'rgba(148,163,184,.35)'}`,
  background: activo ? 'rgba(34,197,94,.12)' : 'rgba(148,163,184,.08)',
  color: activo ? '#bbf7d0' : '#cbd5e1',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
})

export const caja: CSSProperties = {
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 12,
  padding: 12,
  background: 'rgba(15,23,42,.35)',
  marginTop: 10,
}

export function formatoTiempo(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function formatoHora(ms: number | null | undefined): string {
  if (!ms) return '—'
  const fecha = new Date(ms)
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleTimeString()
}

export const ETIQUETA_TIPO_PIEZA: Record<string, string> = {
  mx: 'Personajes',
  ropa: 'Colores de ropa',
  hair: 'Colores de pelo',
  item: 'Complementos',
  gesto: 'Gestos',
}

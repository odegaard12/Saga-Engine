import { useEffect, type CSSProperties, type ReactNode } from 'react'

/**
 * Ventana de aviso del panel de administración.
 *
 * Los avisos de «cambios sin guardar» usaban las clases `saga-modal-overlay` y
 * `saga-modal`, que no existen en ninguna hoja de estilos: la ventana salía como
 * un bloque más al final de la página, fuera de la pantalla. Esta lleva sus
 * estilos puestos (posición fija, centrada, por encima de todo).
 */
export type AdminModalAction = {
  label: string
  onClick: () => void
  tone?: 'primary' | 'danger' | 'ghost'
  disabled?: boolean
}

type AdminModalProps = {
  title: string
  children: ReactNode
  actions: AdminModalAction[]
  /** Si se pasa, Escape cierra la ventana. */
  onClose?: () => void
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 99999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(2, 6, 23, 0.68)',
  backdropFilter: 'blur(4px)',
}

const card: CSSProperties = {
  width: 'min(460px, 100%)',
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: 22,
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: '#0f172a',
  color: '#e2e8f0',
  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
}

function botonEstilo(tone: AdminModalAction['tone']): CSSProperties {
  const base: CSSProperties = {
    padding: '10px 14px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    cursor: 'pointer',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#e2e8f0',
  }
  if (tone === 'primary') {
    return { ...base, background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#020617', border: 0 }
  }
  if (tone === 'danger') {
    return { ...base, background: 'rgba(239, 68, 68, 0.16)', color: '#fca5a5', border: '1px solid rgba(248, 113, 113, 0.45)' }
  }
  return base
}

export default function AdminModal({ title, children, actions, onClose }: AdminModalProps) {
  useEffect(() => {
    if (!onClose) return undefined
    const alPulsar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onClose])

  return (
    <div style={overlay} role="presentation">
      <div style={card} role="alertdialog" aria-modal="true" aria-label={title}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18, color: '#fde047' }}>{title}</h3>
        <div style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>{children}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {actions.map((accion) => (
            <button
              key={accion.label}
              type="button"
              disabled={accion.disabled}
              style={botonEstilo(accion.tone)}
              onClick={accion.onClick}
            >
              {accion.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

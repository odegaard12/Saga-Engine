import { renderMarkdown } from '../utils/formatMarkdown'

interface StoryModalProps {
  title: string
  subtitle?: string
  body: string
  buttonText: string
  onClose: () => void
}

/**
 * Rehecho al idioma "fluido" del login E -maqueta aprobada tras varias
 * rondas de bocetos.
 *
 * Antes era una tarjeta de cristal (fondo con degradado, borde y sombra
 * propios) centrada en un velo, con el título centrado y el botón en
 * mayúsculas con degradado verde. Ahora no hay tarjeta: el texto vive
 * directamente sobre el fondo sólido, alineado a la izquierda como el
 * título del login, y el botón es la misma píldora naranja que "Abrir
 * nodo" en la barra de jugador -misma familia visual en toda la app-.
 */
export function StoryModal({ title, subtitle, body, buttonText, onClose }: StoryModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        // Solido, no un velo sobre el mapa: el prologo es un momento propio,
        // no una capa flotando sobre el juego -y un fondo solido tambien
        // evita el problema de fondo que tuvo esta pantalla una vez: dejar
        // ver cualquier otro overlay que se abriera detras.
        background: 'var(--theme-bg)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '28px 26px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)',
        color: '#fff',
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.2em', color: 'var(--theme-primary)', textTransform: 'uppercase', marginBottom: 10 }}>
          {subtitle || 'Historia'}
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(26px, 7vw, 36px)',
            lineHeight: 1.05,
            fontWeight: 1000,
            letterSpacing: '-0.03em',
            color: '#ffffff',
            marginBottom: 20,
          }}
        >
          {title}
        </h1>

        <div style={{ fontSize: 15, color: 'rgba(255,255,255,.78)', lineHeight: 1.65, marginBottom: 32 }}>
          {renderMarkdown(body)}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            minHeight: 52,
            padding: '0 16px',
            background: 'linear-gradient(180deg, var(--theme-primary), var(--theme-primary-hover))',
            color: '#ffffff',
            border: 0,
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: '.02em',
            cursor: 'pointer',
            boxShadow: 'var(--saga-accent-glow)',
          }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  )
}

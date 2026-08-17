import { renderMarkdown } from '../utils/formatMarkdown'

interface StoryModalProps {
  title: string
  subtitle?: string
  body: string
  buttonText: string
  onClose: () => void
}

export function StoryModal({ title, subtitle, body, buttonText, onClose }: StoryModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(var(--theme-ink-deep), 0.4)',
        backdropFilter: 'var(--theme-blur)',
        WebkitBackdropFilter: 'var(--theme-blur)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        color: '#fff',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '85vh',
          background: 'linear-gradient(180deg, rgba(var(--theme-sheen-a), calc(.46 * var(--theme-solid))), rgba(var(--theme-sheen-b), calc(.34 * var(--theme-solid))))',
          backdropFilter: 'var(--theme-blur)',
          WebkitBackdropFilter: 'var(--theme-blur)',
          borderRadius: '28px',
          boxShadow: '0 22px 60px rgba(var(--theme-ink), .18)',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(255, 255, 255, 0.22)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '28px 24px 16px', textAlign: 'center' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.8rem',
              fontWeight: 900,
              color: '#f8fafc',
              letterSpacing: '-0.02em',
              textShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <h2 style={{ margin: '8px 0 0 0', fontSize: '1.1rem', fontWeight: 600, color: 'rgb(var(--theme-info))' }}>
              {subtitle}
            </h2>
          )}
        </div>

        <div style={{ padding: '0 24px 16px', flex: 1, overflowY: 'auto', fontSize: '1.05rem', color: '#e2e8f0', lineHeight: 1.6 }}>
          {renderMarkdown(body)}
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(180deg, rgba(var(--theme-ok), 0.85) 0%, rgba(var(--theme-ok-deep), 0.95) 100%)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '16px',
              fontSize: '1.1rem',
              fontWeight: 900,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              boxShadow: '0 8px 24px rgba(var(--theme-ok), 0.35)',
              transition: 'transform 0.15s, background 0.15s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.01)')}
            onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  )
}

import React from 'react'
import { renderMarkdown } from '../utils/formatMarkdown'
import { getToastOverlayStyle } from './PlayerLayout' // Reuse a high z-index overlay style if we want, or just custom

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
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999, // Ensure it's on top of everything including map
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#fff',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '100%',
          backgroundColor: 'rgba(30, 30, 35, 0.95)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ padding: '32px 24px 16px', textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#f0b429' }}>
            {title}
          </h1>
          {subtitle && (
            <h2 style={{ margin: '8px 0 0 0', fontSize: '1.2rem', fontWeight: 400, color: '#a0aec0' }}>
              {subtitle}
            </h2>
          )}
        </div>

        <div style={{ padding: '0 24px', flex: 1, overflowY: 'auto', fontSize: '1.1rem' }}>
          {renderMarkdown(body)}
        </div>

        <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={onClose}
            style={{
              padding: '16px 32px',
              fontSize: '1.2rem',
              fontWeight: 600,
              color: '#000',
              backgroundColor: '#f0b429',
              border: 'none',
              borderRadius: '30px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(240, 180, 41, 0.4)',
              transition: 'transform 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  )
}

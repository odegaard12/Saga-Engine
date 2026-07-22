import React from 'react'

interface SplashScreenProps {
  progress?: number
  detail?: string
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ progress, detail }) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#020617',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        zIndex: 999999,
      }}
    >
      <img
        src="/saga-app-icon-192.png"
        alt="SAGA"
        style={{
          width: '120px',
          height: '120px',
          borderRadius: '28px',
          marginBottom: '40px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          animation: 'pulse 2s infinite ease-in-out',
        }}
      />
      
      <div
        style={{
          width: '200px',
          height: '4px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            height: '100%',
            backgroundColor: '#3b82f6',
            borderRadius: '4px',
            width: progress !== undefined ? `${progress}%` : '10%',
            transition: 'width 0.3s ease',
            animation: progress === undefined ? 'indeterminate 1.5s infinite ease-in-out' : 'none',
          }}
        />
      </div>

      <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500, letterSpacing: '0.02em' }}>
        {detail || 'Cargando sistema SAGA...'}
      </div>

      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes indeterminate {
            0% { width: 0%; transform: translateX(-100%); }
            50% { width: 50%; transform: translateX(50%); }
            100% { width: 100%; transform: translateX(200%); }
          }
        `}
      </style>
    </div>
  )
}

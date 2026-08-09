import React from 'react'

interface SplashScreenProps {
  progress?: number
  detail?: string
  /** Trozos de mapa guardados y total, para poder decir algo mas que un %. */
  done?: number
  total?: number
  /** Es la primera vez: no hay nada guardado y toca bajarlo todo. */
  primeiraVez?: boolean
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  progress,
  detail,
  done,
  total,
  primeiraVez,
}) => {
  const known = typeof progress === 'number' && Number.isFinite(progress)
  const pct = known ? Math.max(0, Math.min(100, Math.round(progress))) : 0

  // El mapa son miles de trozos y el porcentaje entero se queda clavado en 0
  // un buen rato: parecia colgado. Con un decimal se ve que avanza desde el
  // primer momento.
  const pctFino =
    known && progress < 10 ? Math.max(0, Math.round(progress * 10) / 10) : pct

  const haiContas = typeof done === 'number' && typeof total === 'number' && total > 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'radial-gradient(circle at 50% 22%, rgba(56,189,248,.16), transparent 46%),' +
          'radial-gradient(circle at 50% 88%, rgba(74,222,128,.12), transparent 44%),' +
          'linear-gradient(180deg, #030b1a 0%, #020617 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        zIndex: 999999,
        padding: '0 26px',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div style={{ position: 'relative', marginBottom: 34 }}>
        {/* Halos girando: dan sensación de actividad aunque la descarga
            tarde, en vez de una pantalla aparentemente congelada. */}
        <span className="saga-splash-ring saga-splash-ring--slow" />
        <span className="saga-splash-ring saga-splash-ring--fast" />
        <img
          src="/saga-app-icon-192.png"
          alt="SAGA"
          style={{
            position: 'relative',
            width: 116,
            height: 116,
            borderRadius: 28,
            boxShadow: '0 10px 40px rgba(0,0,0,.55)',
            animation: 'sagaSplashPulse 2.4s infinite ease-in-out',
          }}
        />
      </div>

      <div
        style={{
          width: 'min(88vw, 300px)',
          height: 8,
          background: 'rgba(255,255,255,.09)',
          borderRadius: 999,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, #22c55e, #38bdf8)',
            width: known ? `${pct}%` : '38%',
            transition: 'width .35s cubic-bezier(.22,1,.36,1)',
            animation: known ? 'none' : 'sagaSplashSlide 1.4s infinite ease-in-out',
            boxShadow: '0 0 14px rgba(56,189,248,.55)',
          }}
        />
      </div>

      {known ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: '-.02em',
            color: '#e2e8f0',
          }}
        >
          {pctFino}%
        </div>
      ) : null}

      <div
        style={{
          marginTop: known ? 4 : 14,
          fontSize: 13,
          color: '#94a3b8',
          fontWeight: 600,
          textAlign: 'center',
          lineHeight: 1.45,
          maxWidth: 320,
        }}
      >
        {known ? '' : detail || 'Preparando la misión…'}
      </div>

      <div
        style={{
          marginTop: 18,
          fontSize: 11,
          color: 'rgba(148,163,184,.7)',
          fontWeight: 600,
          textAlign: 'center',
          maxWidth: 300,
          lineHeight: 1.5,
        }}
      >
        {primeiraVez ? 'Primera vez: se guarda el mapa. Tarda unos minutos.' : ''}
      </div>

      <style>
        {`
          @keyframes sagaSplashPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.045); }
          }
          @keyframes sagaSplashSlide {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(320%); }
          }
          @keyframes sagaSplashSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .saga-splash-ring {
            position: absolute;
            top: 50%;
            left: 50%;
            border-radius: 50%;
            pointer-events: none;
          }
          .saga-splash-ring--slow {
            width: 178px;
            height: 178px;
            margin: -89px 0 0 -89px;
            border: 2px solid transparent;
            border-top-color: rgba(56,189,248,.55);
            border-right-color: rgba(56,189,248,.18);
            animation: sagaSplashSpin 3.2s linear infinite;
          }
          .saga-splash-ring--fast {
            width: 148px;
            height: 148px;
            margin: -74px 0 0 -74px;
            border: 2px solid transparent;
            border-bottom-color: rgba(74,222,128,.6);
            border-left-color: rgba(74,222,128,.16);
            animation: sagaSplashSpin 1.9s linear infinite reverse;
          }
        `}
      </style>
    </div>
  )
}

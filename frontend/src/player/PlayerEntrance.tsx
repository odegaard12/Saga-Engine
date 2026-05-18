import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

interface Props { children: ReactNode }

export default function PlayerEntrance({ children }: Props) {
  const [phase, setPhase] = useState<'entering' | 'visible'>('entering')

  useEffect(() => {
    // Pequeño frame para asegurar que el DOM está montado antes de animar
    const t = requestAnimationFrame(() => {
      setTimeout(() => setPhase('visible'), 60)
    })
    return () => cancelAnimationFrame(t)
  }, [])

  return (
    <div style={{
      ...wrap,
      opacity:    phase === 'visible' ? 1 : 0,
      transform:  phase === 'visible' ? 'scale(1)' : 'scale(1.015)',
      transition: phase === 'visible'
        ? 'opacity 520ms cubic-bezier(0.16,1,0.3,1), transform 520ms cubic-bezier(0.16,1,0.3,1)'
        : 'none',
    }}>
      {children}
    </div>
  )
}

const wrap: CSSProperties = { minHeight: '100dvh', willChange: 'opacity, transform' }

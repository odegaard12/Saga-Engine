import React, { useRef, useState, useEffect, CSSProperties, ReactNode } from 'react'

interface SwipeableSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  sheetStyle?: CSSProperties
}

export function SwipeableSheet({ open, onClose, children, sheetStyle }: SwipeableSheetProps) {
  const [offsetY, setOffsetY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  /**
   * La hoja ahora SE CIERRA, no desaparece.
   *
   * Antes: `if (!open && offsetY === 0) return null`. Al pulsar la X o el
   * fondo, `open` pasaba a falso con el desplazamiento a cero, asi que la
   * condicion se cumplia en el mismo instante y la hoja se DESMONTABA de
   * golpe: el panel mas grande de la pantalla se esfumaba sin transicion.
   * La animacion de bajada solo existia arrastrandola con el dedo mas de
   * 100px, que es el unico camino que alguien habia probado.
   *
   * Ahora se queda montada mientras se desliza hacia abajo y se desmonta
   * cuando termina. Entra y sale por el mismo sitio.
   */
  const [montada, setMontada] = useState(open)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    if (open) {
      setMontada(true)
      setSaliendo(false)
      setOffsetY(0)
      setIsDragging(false)
      return undefined
    }

    if (!montada) return undefined

    setSaliendo(true)
    const id = window.setTimeout(() => {
      setMontada(false)
      setSaliendo(false)
      setOffsetY(0)
    }, 280)
    return () => window.clearTimeout(id)
  }, [open, montada])

  if (!montada) return null

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    startYRef.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const touchY = e.touches[0].clientY
    const deltaY = touchY - startYRef.current

    // Only allow pulling downwards
    if (deltaY > 0) {
      setOffsetY(deltaY)
    } else {
      setOffsetY(0)
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    // If dragged down more than 100px, close it
    if (offsetY > 100) {
      onClose()
      // Wait for animation to finish before resetting
      setTimeout(() => setOffsetY(0), 300)
    } else {
      // Snap back
      setOffsetY(0)
    }
  }

  const dynamicSheetStyle: CSSProperties = {
    ...sheet,
    ...sheetStyle,
    transform: saliendo ? 'translateY(100%)' : `translateY(${offsetY}px)`,
    transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
    // Sin la animacion de entrada mientras sale: se pisaban y la hoja daba
    // un salto hacia arriba justo antes de bajar.
    animation: saliendo ? 'none' : undefined,
  }

  return (
    <div style={overlay}>
      <div
        style={{
          ...backdrop,
          opacity: open && !saliendo ? Math.max(0, 1 - offsetY / 300) : 0,
        }}
        onClick={onClose}
      />

      <aside
        ref={sheetRef}
        // La clase ya NO la pinta el tema: su regla -brasa y esquina cortada
        // con !important- se quito al pasar esta hoja a tarjeta solida del
        // diseño "B", porque le ganaba a los estilos en linea. Se conserva
        // como gancho para poder encontrarla desde fuera (pruebas, medidas).
        className="saga-hoja"
        style={dynamicSheetStyle}
        aria-modal="true"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={dragHandleWrapper}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>
      </aside>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4100,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
  pointerEvents: 'none', // Let children capture events
}

const backdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(var(--theme-ink-deep), .34)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  pointerEvents: 'auto',
  transition: 'opacity 0.3s ease',
}

const sheet: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 'min(100%, 520px)',
  borderRadius: 'var(--theme-radius-panel)',
  background: 'rgba(var(--theme-ink-deep), .95)',
  padding: '8px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '85vh',
  color: '#f8fafc',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  pointerEvents: 'auto',
}

// Zona de arrastre para cerrar deslizando. Llevaba un tirador visual -una
// pildora blanca fija que no seguia al tema y se veia mal sobre la brasa de
// fuego-; se quito el dibujo y se dejo la zona de arrastre, que sigue
// funcionando igual.
const dragHandleWrapper: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '10px 0 12px',
  cursor: 'grab',
}

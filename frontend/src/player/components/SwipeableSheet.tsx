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
  const sheetRef = useRef<HTMLDivElement>(null)
  
  // Reset offset when opened
  useEffect(() => {
    if (open) {
      setOffsetY(0)
      setIsDragging(false)
    }
  }, [open])

  if (!open && offsetY === 0) return null

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only intercept if we touch the sheet directly (not scrolling a list inside ideally, 
    // but for simple sheets this works well)
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const touchY = e.touches[0].clientY
    const rect = sheetRef.current?.getBoundingClientRect()
    if (!rect) return
    
    // Only allow pulling downwards
    const deltaY = touchY - rect.top
    if (deltaY > 0) {
      setOffsetY(deltaY)
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
    transform: `translateY(${offsetY}px)`,
    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
  }

  return (
    <div style={overlay}>
      <div 
        style={{
          ...backdrop, 
          opacity: open ? Math.max(0, 1 - (offsetY / 300)) : 0 
        }} 
        onClick={onClose} 
      />
      
      <aside
        ref={sheetRef}
        style={dynamicSheetStyle}
        aria-modal="true"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={dragHandleWrapper}>
          <div style={dragHandle} />
        </div>
        {children}
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
  background: 'rgba(2,6,23,.34)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  pointerEvents: 'auto',
  transition: 'opacity 0.3s ease',
}

const sheet: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: 'min(100%, 520px)',
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'linear-gradient(180deg, rgba(13,23,42,.88), rgba(20,32,58,.80))',
  boxShadow: '0 26px 60px rgba(2,6,23,.32), inset 0 1px 0 rgba(255,255,255,.08)',
  padding: '8px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  flexDirection: 'column',
  color: '#f8fafc',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  pointerEvents: 'auto',
}

const dragHandleWrapper: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  paddingBottom: 16,
  cursor: 'grab',
}

const dragHandle: CSSProperties = {
  width: 40,
  height: 5,
  borderRadius: 999,
  background: 'rgba(255,255,255,.25)',
}

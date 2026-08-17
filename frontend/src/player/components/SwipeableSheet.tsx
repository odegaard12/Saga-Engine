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

  // Reset offset when opened
  useEffect(() => {
    if (open) {
      setOffsetY(0)
      setIsDragging(false)
    }
  }, [open])

  if (!open && offsetY === 0) return null

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
    transform: `translateY(${offsetY}px)`,
    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
  }

  return (
    <div style={overlay}>
      <div
        style={{
          ...backdrop,
          opacity: open ? Math.max(0, 1 - offsetY / 300) : 0,
        }}
        onClick={onClose}
      />

      <aside
        ref={sheetRef}
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
        >
          <div style={dragHandle} />
        </div>
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
  background: 'rgba(2,6,23,.34)',
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
  background: 'rgba(2,6,23,.95)',
  padding: '8px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '85vh',
  color: '#f8fafc',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
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
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(255,255,255,.25)',
}

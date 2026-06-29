import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from 'react'
import type { PlayerStage } from '../../types/player'
import { FamilyRuntimeHost, resolveStageMinigame } from '../minigames/core'
import { resolveMinigameDefinition } from '../minigames/registry'
import { MinigameHost } from './MinigameHost'

interface InteractionSheetProps {
  open: boolean
  user: string
  currentStage: PlayerStage | null
  helperText: string
  submitting: boolean
  onClose: () => void
  onSubmitCode: (code: string) => Promise<void>
}

function vibrate(pattern: number | number[]) {
  if (typeof window === 'undefined') return
  if (!('navigator' in window)) return
  if (typeof window.navigator.vibrate !== 'function') return
  window.navigator.vibrate(pattern)
}

function isMotionStage(stage: PlayerStage | null) {
  if (!stage) return false
  const config = stage.config && typeof stage.config === 'object' ? stage.config : {}
  const runtimeConfig = stage.minigame?.config && typeof stage.minigame.config === 'object' ? stage.minigame.config : {}
  const gameId = String((config as Record<string, unknown>).game_id || (runtimeConfig as Record<string, unknown>).game_id || '')
  return stage.minigame?.type === 'motion_challenge' || stage.type === 'motion_challenge' || gameId === 'shake_antenna_charge'
}

function getCompactLine(stage: PlayerStage | null) {
  if (isMotionStage(stage)) return ''

  const hint = String(stage?.messages?.hint || '').trim()
  if (hint) return hint

  const text = String(stage?.content || '').trim()
  if (!text) return ''
  if (text.toUpperCase() === 'PUT NODE TEXT HERE') return ''
  return text
}

export function InteractionSheet({
  open,
  user,
  currentStage,
  helperText,
  submitting,
  onClose,
  onSubmitCode,
}: InteractionSheetProps) {
  const [dragOffset, setDragOffset] = useState(0)

  const touchStartYRef = useRef<number | null>(null)
  const touchStartXRef = useRef<number | null>(null)
  const dragEnabledRef = useRef(false)

  const stageId = currentStage?.id ?? null
  const stageType = currentStage?.minigame?.type ?? currentStage?.type ?? null

  const resolvedStageMinigame = resolveStageMinigame(currentStage)
  const resolvedRuntime = resolvedStageMinigame?.resolved ?? null
  const resolvedSourceType = resolvedStageMinigame?.source.type ?? stageType

  const minigameDefinition = resolvedSourceType
    ? resolveMinigameDefinition(resolvedSourceType)
    : null

  const shouldRenderFamilyRuntime = Boolean(
    resolvedRuntime && resolvedRuntime.compatibility === 'native'
  )

  // Cualquier minijuego ya contiene su propio título,
  // instrucciones, estado y botones. El contenedor exterior
  // no debe repetir esa información.
  const compactGameMode =
    shouldRenderFamilyRuntime ||
    Boolean(minigameDefinition)

  const compactLine = getCompactLine(currentStage)

  useEffect(() => {
    setDragOffset(0)
  }, [stageId])

  useEffect(() => {
    if (open && currentStage) {
      vibrate(10)
    }
  }, [open, stageId, currentStage])

  if (!open || !currentStage) return null

  async function handleNativeWin() {
    vibrate([12, 20, 12])
    await onSubmitCode('OK')
  }

  function handleClose() {
    vibrate(10)
    onClose()
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    if (!dragEnabledRef.current) return
    if (event.touches.length !== 1) return
    touchStartYRef.current = event.touches[0].clientY
    touchStartXRef.current = event.touches[0].clientX
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
    if (!dragEnabledRef.current) return
    if (touchStartYRef.current === null || touchStartXRef.current === null) return

    const deltaY = event.touches[0].clientY - touchStartYRef.current
    const deltaX = event.touches[0].clientX - touchStartXRef.current

    if (Math.abs(deltaX) > Math.abs(deltaY)) return
    if (deltaY <= 0) {
      setDragOffset(0)
      return
    }

    setDragOffset(Math.min(deltaY, 140))
  }

  function handleTouchEnd() {
    if (!dragEnabledRef.current) return

    if (dragOffset > 90 && !submitting) {
      vibrate([8, 12, 8])
      onClose()
    }

    dragEnabledRef.current = false
    setDragOffset(0)
    touchStartYRef.current = null
    touchStartXRef.current = null
  }

  function beginDrag() {
    dragEnabledRef.current = true
  }

  return (
    <>
      <style>{sheetAnimations}</style>

      <div
        style={
          compactGameMode
            ? compactGameOverlay
            : overlay
        }
      >
        <div style={backdrop} onClick={submitting ? undefined : handleClose} />

        <section
          style={{
            ...(compactGameMode
              ? compactGameSheet
              : sheet),
            transform: `translateY(${dragOffset}px)`,
            transition:
              dragOffset === 0
                ? 'transform 180ms ease, opacity 160ms ease'
                : 'none',
          }}
          aria-modal="true"
          role="dialog"
        >
          {compactGameMode ? (
            <button
              type="button"
              style={compactGameCloseButton}
              onClick={handleClose}
              disabled={submitting}
              aria-label="Cerrar juego"
              title="Cerrar juego"
            >
              ×
            </button>
          ) : (
            <>
          <div
            style={dragHandleWrap}
            onTouchStart={(event) => {
              beginDrag()
              handleTouchStart(event)
            }}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div style={dragHandle} />
          </div>

          <div style={headerRow}>
            <div style={headerCopy}>
              <div style={title}>{currentStage.title}</div>

              <div style={subRow}>
                {resolvedRuntime ? (
                  <span style={miniBadge}>{resolvedRuntime.label}</span>
                ) : minigameDefinition ? (
                  <span style={miniBadge}>{minigameDefinition.label}</span>
                ) : null}

                <span style={userText}>{user}</span>
              </div>

              {compactLine ? <div style={compactLineText}>{compactLine}</div> : null}
            </div>

            <button
              type="button"
              style={closeButton}
              onClick={handleClose}
              disabled={submitting}
            >
              CLOSE
            </button>
          </div>
            </>
          )}

          {shouldRenderFamilyRuntime && resolvedRuntime ? (
            <FamilyRuntimeHost
              resolved={resolvedRuntime}
              stage={currentStage}
              helperText={helperText}
              submitting={submitting}
              onWin={handleNativeWin}
            />
          ) : minigameDefinition ? (
            <MinigameHost
              definition={minigameDefinition}
              stage={currentStage}
              helperText={helperText}
              submitting={submitting}
              onWin={handleNativeWin}
            />
          ) : (
            <section style={bridgeCard}>
              <div style={bridgeText}>
                {helperText || 'This node is not available in the current family runtime yet.'}
              </div>
            </section>
          )}

        </section>
      </div>
    </>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 12,
}

const compactGameOverlay: CSSProperties = {
  ...overlay,
  padding: 2,
}


const backdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(2,6,23,.56)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  animation: 'sagaFadeIn 160ms ease-out',
}

const sheet: CSSProperties = {
  position: 'relative',
  width: 'min(100%, 840px)',
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'linear-gradient(180deg, rgba(2,6,23,.98), rgba(15,23,42,.94))',
  boxShadow: '0 18px 40px rgba(2,6,23,.30)',
  color: '#f8fafc',
  padding: 14,
  display: 'grid',
  gap: 10,
  animation: 'sagaSheetUp 220ms cubic-bezier(0.22, 1, 0.36, 1)',
  willChange: 'transform',
}

const compactGameSheet: CSSProperties = {
  ...sheet,
  width: 'min(100%, 1080px)',
  maxHeight: 'calc(100dvh - 4px)',
  overflowX: 'hidden',
  overflowY: 'auto',
  padding: 0,
  gap: 0,
  border: 'none',
  borderRadius: 24,
  background: 'transparent',
  boxShadow: 'none',
}


const compactGameCloseButton: CSSProperties = {
  position: 'absolute',
  top: 7,
  right: 7,
  zIndex: 50,
  width: 38,
  height: 38,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.22)',
  background: 'rgba(2,6,23,.86)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: '0 7px 20px rgba(2,6,23,.38)',
  color: '#fff',
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1,
  cursor: 'pointer',
}


const dragHandleWrap: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  paddingTop: 2,
  paddingBottom: 2,
  touchAction: 'none',
}

const dragHandle: CSSProperties = {
  width: 42,
  height: 5,
  borderRadius: 999,
  background: 'rgba(255,255,255,.18)',
}

const headerRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const headerCopy: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 6,
}

const title: CSSProperties = {
  color: '#f8fafc',
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1.02,
  letterSpacing: '-0.03em',
}

const subRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
}

const miniBadge: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 999,
  background: 'rgba(22,163,74,.16)',
  border: '1px solid rgba(34,197,94,.20)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
}

const userText: CSSProperties = {
  color: 'rgba(255,255,255,.62)',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
}

const compactLineText: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.35,
}

const closeButton: CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.06)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.10em',
}

const bridgeCard: CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
}

const bridgeText: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.5,
}

const sheetAnimations = `
@keyframes sagaFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes sagaSheetUp {
  from {
    opacity: 0;
    transform: translateY(18px) scale(.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`

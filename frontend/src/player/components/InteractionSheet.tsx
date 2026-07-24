import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import type { PlayerStage } from '../../types/player'
import { FamilyRuntimeHost, resolveStageMinigame } from '../minigames/core'
import { resolveMinigameDefinition } from '../minigames/registry'
import { MinigameHost } from './MinigameHost'
import { renderMarkdown } from '../utils/formatMarkdown'

interface InteractionSheetProps {
  open: boolean
  user: string
  currentStage: PlayerStage | null
  helperText: string
  submitting: boolean
  onClose: () => void
  onSubmitCode: (code: string, timeSpentMs?: number) => Promise<void>
  onShowHistory?: () => void
  totalTimeMs?: number
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
  const runtimeConfig =
    stage.minigame?.config && typeof stage.minigame.config === 'object' ? stage.minigame.config : {}
  const gameId = String(
    (config as Record<string, unknown>).game_id ||
      (runtimeConfig as Record<string, unknown>).game_id ||
      ''
  )
  return (
    stage.minigame?.type === 'motion_challenge' ||
    stage.type === 'motion_challenge' ||
    gameId === 'shake_antenna_charge'
  )
}

function isStageCollectible(stage: PlayerStage | null) {
  if (!stage) return false
  const s = stage as any
  const flatKind = s.physical_node_kind || s.physical_item_kind
  if (flatKind === 'collectible') return true
  const physicalQr = s.physical_qr
  if (physicalQr && typeof physicalQr === 'object') {
    return (physicalQr as Record<string, unknown>).kind === 'collectible'
  }
  const config = s.config && typeof s.config === 'object' ? s.config : {}
  if (config.is_map_collectible || s.is_map_collectible) return true
  return false
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
  onShowHistory,
  totalTimeMs = 0,
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
  const compactGameMode = shouldRenderFamilyRuntime || Boolean(minigameDefinition)

  const compactLine = getCompactLine(currentStage)

  const [activeMs, setActiveMs] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)

  useEffect(() => {
    setDragOffset(0)
  }, [stageId])

  useEffect(() => {
    if (open && currentStage) {
      vibrate(10)
    }
  }, [open, stageId, currentStage])

  useEffect(() => {
    if (!open) {
      setActiveMs(0)
      setIsCompleted(false)
    }
  }, [open])

  useEffect(() => {
    // El timer arranca 300ms después de abrir (cuando la animación de UI y el puzzle es interactivo)
    // Se detiene al hacer submit o al completarlo
    if (open && currentStage && !submitting && !isCompleted) {
      const timeout = setTimeout(() => {
        const startTime = Date.now() - activeMs
        const timer = setInterval(() => {
          setActiveMs(Date.now() - startTime)
        }, 100)
        return () => clearInterval(timer)
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [open, currentStage, submitting, isCompleted, activeMs])

  if (!open || !currentStage) return null

  async function handleNativeWin() {
    vibrate([12, 20, 12])
    setIsCompleted(true)
    setTimeout(async () => {
      await onSubmitCode('OK', activeMs)
    }, 2000) // Show feedback for 2 seconds
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

      <div style={compactGameMode ? compactGameOverlay : overlay}>
        <div style={backdrop} onClick={submitting ? undefined : handleClose} />

        <section
          style={{
            ...(compactGameMode ? compactGameSheet : sheet),
            transform: `translateY(${dragOffset}px)`,
            transition: dragOffset === 0 ? 'transform 180ms ease, opacity 160ms ease' : 'none',
          }}
          aria-modal="true"
          role="dialog"
        >
          {compactGameMode ? (
            <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 120, display: 'flex', gap: 8 }}>
              {/* Floating Global Timer */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(15,23,42,0.65)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#e0f2fe',
                padding: '0 12px',
                borderRadius: '999px',
                fontSize: 14,
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                height: '38px',
              }}>
                ⏱️ {Math.floor((totalTimeMs + activeMs) / 60000).toString().padStart(2, '0')}:{(Math.floor(((totalTimeMs + activeMs) % 60000) / 1000)).toString().padStart(2, '0')}
              </div>
              {onShowHistory && !isStageCollectible(currentStage) && (
                <button
                  type="button"
                  style={{...compactGameCloseButton, position: 'relative', top: 0, right: 0}}
                  onClick={(e) => { e.preventDefault(); onShowHistory(); }}
                  disabled={submitting}
                  aria-label="Ver historia del nodo"
                  title="Ver historia"
                >
                  ❓
                </button>
              )}
              <button
                type="button"
                style={{...compactGameCloseButton, position: 'relative', top: 0, right: 0}}
                onClick={handleClose}
                disabled={submitting}
                aria-label="Cerrar juego"
                title="Cerrar juego"
              >
                ×
              </button>
            </div>
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

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {onShowHistory && !isStageCollectible(currentStage) && (
                    <button
                      type="button"
                      style={{ ...closeButton, background: 'rgba(255,255,255,0.1)' }}
                      onClick={(e) => { e.preventDefault(); onShowHistory(); }}
                      disabled={submitting}
                      title="Historia"
                    >
                      ❓
                    </button>
                  )}
                  <button
                    type="button"
                    style={closeButton}
                    onClick={handleClose}
                    disabled={submitting}
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            </>
          )}

          {isStageCollectible(currentStage) ? (
            <div style={collectibleCardStyle}>
              <div style={collectibleIconContainerStyle}>
                <div style={collectibleIconStyle}>
                  {(currentStage as any).physical_icon || (currentStage as any).config?.physical_icon || '⭐'}
                </div>
              </div>
              <h4 style={collectibleTitleStyle}>
                {(currentStage as any).physical_item_label || currentStage.title || 'Objeto de misión'}
              </h4>
              <div style={collectibleDescStyle}>
                {(currentStage as any).intro_body ? (
                  renderMarkdown((currentStage as any).intro_body)
                ) : (
                  <p style={{ margin: 0 }}>
                    ¡Has encontrado un objeto coleccionable en esta ubicación!
                    Presiona el botón de abajo para recogerlo y guardarlo en tu mochila.
                  </p>
                )}
              </div>
              <button
                type="button"
                style={collectibleBtnStyle}
                disabled={submitting}
                onClick={handleNativeWin}
              >
                {submitting ? 'Guardando...' : '🎒 RECOGER OBJETO'}
              </button>
            </div>
          ) : shouldRenderFamilyRuntime && resolvedRuntime ? (
            <FamilyRuntimeHost
              resolved={resolvedRuntime}
              stage={currentStage}
              helperText={helperText}
              submitting={submitting}
              onWin={handleNativeWin}
            />
          ) : minigameDefinition ? (
            <div style={{ position: 'relative' }}>
              {activeMs > 0 && !isCompleted && (
                <div style={timerOverlay}>
                  {(activeMs / 1000).toFixed(1)}s
                </div>
              )}

              {isCompleted && (
                <div style={completionOverlay}>
                  <div style={completionText}>
                    RESONANCIA COMPLETA
                    <br />
                    <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                      TEMPO: {(activeMs / 1000).toFixed(1)} s
                    </span>
                  </div>
                </div>
              )}

              <MinigameHost
                definition={minigameDefinition}
                stage={currentStage}
                helperText={helperText}
                submitting={submitting}
                onWin={handleNativeWin}
              />
            </div>
          ) : (
            <section style={bridgeCard}>
              <div style={bridgeText}>
                {helperText || 'Este nodo no tiene un juego configurado aún. El administrador debe asignarle un tipo de minijuego.'}
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

const collectibleCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  padding: '24px 20px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 24,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  margin: '12px 0',
}

const collectibleIconContainerStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  marginBottom: 16,
}

const collectibleIconStyle: CSSProperties = {
  fontSize: 64,
  lineHeight: 1,
  filter: 'drop-shadow(0 0 16px rgba(251, 191, 36, 0.4))',
  animation: 'sagaIconFloat 3s ease-in-out infinite',
}

const collectibleTitleStyle: CSSProperties = {
  color: '#ffffff',
  fontSize: 22,
  fontWeight: 900,
  margin: '0 0 8px 0',
  letterSpacing: '-0.02em',
}

const collectibleDescStyle: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  lineHeight: 1.5,
  margin: '0 0 24px 0',
  maxWidth: '100%',
  textAlign: 'left',
}

const collectibleBtnStyle: CSSProperties = {
  width: '100%',
  minHeight: 52,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 16,
  border: 'none',
  background: 'linear-gradient(135deg, #10b981, #059669)',
  color: '#ffffff',
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: '0.05em',
  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
  cursor: 'pointer',
  transition: 'transform 0.15s ease, opacity 0.15s ease',
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

@keyframes sagaIconFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
`

const timerOverlay: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  zIndex: 130,
  padding: '6px 14px',
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: 12,
  color: '#fff',
  fontWeight: 800,
  fontSize: 14,
  pointerEvents: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
}

const completionOverlay: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 150,
  background: 'rgba(20, 25, 35, 0.7)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 22,
  animation: 'sagaFadeIn 0.3s ease-out',
}

const completionText: CSSProperties = {
  color: '#38bdf8',
  fontSize: 22,
  fontWeight: 900,
  textAlign: 'center',
  textShadow: '0 0 20px rgba(56, 189, 248, 0.6)',
  lineHeight: 1.5,
  letterSpacing: '0.05em',
  animation: 'sagaIconFloat 3s ease-in-out infinite',
}

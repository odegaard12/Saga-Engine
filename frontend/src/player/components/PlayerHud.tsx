import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { PlayerGamePayload, PlayerStage } from '../../types/player'
import type { PrimaryActionTone, StageRuntimeState } from '../runtime'
import { MissionPackPanel } from './MissionPackPanel'
import { InventoryPanel } from './InventoryPanel'
import { CraftingPanel } from './CraftingPanel'
import { RequirementPreviewPanel } from './RequirementPreviewPanel'
import { SwipeableSheet } from './SwipeableSheet'
import { getLocale, setLocale, t, type Locale } from '../../i18n'
import { BuildInfoBadge } from '../../shared/BuildInfoBadge'
import { usePlayerStore } from '../store/usePlayerStore'

type BackpackTab = 'requirements' | 'inventory' | 'crafting'

interface PlayerHudProps {
  user: string
  missionPayload: PlayerGamePayload
  currentStage: PlayerStage | null
  level: number
  finished: boolean
  gpsState: string
  distanceMeters: number | null
  inRange: boolean
  debugEnabled: boolean
  followPlayer: boolean
  toolsOpen: boolean
  playerHref: string
  loginHref: string
  adminHref: string
  primaryLabel: string
  primaryTone: PrimaryActionTone
  primaryDisabled: boolean
  /** Motivo por el que el nodo no se puede abrir, para elegir qué texto mostrar. */
  primaryReason?: StageRuntimeState['reason']
  helperText: string
  detailsOpen: boolean
  onPrimaryAction: () => void
  onToggleDetails: () => void
  onOpenTools: () => void
  onCloseTools: () => void
  onToggleDebug: () => void
  onRequestGps: () => void
  onDownloadFieldProofs?: () => void
  fieldPhotoCount?: number
  submitting?: boolean
  errorMessage?: string | null
  onShowPrologue?: () => void
  onSubmitCode?: (
    code: string,
    timeSpentMs?: number,
    penaltyMs?: number,
    aMano?: boolean
  ) => Promise<boolean>
}

function getGpsDisplay(gpsState: string): string {
  const value = String(gpsState || 'unknown').toLowerCase()
  if (value === 'ready') return 'GPS ACTIVO'
  if (value === 'stale') return 'ÚLTIMA POS.'
  if (value === 'searching') return 'BUSCANDO GPS'
  if (value === 'error') return 'ERROR GPS'
  return 'SIN GPS'
}

function getRangeDisplay(
  finished: boolean,
  distanceMeters: number | null,
  inRange: boolean
): string {
  if (finished) return 'COMPLETADO'
  if (distanceMeters === null) return 'SIN DISTANCIA'
  if (inRange) return `${distanceMeters} M DENTRO`
  return `${distanceMeters} M`
}

export function PlayerHud({
  user,
  missionPayload,
  currentStage,
  finished,
  gpsState,
  distanceMeters,
  inRange,
  debugEnabled,
  followPlayer,
  toolsOpen,
  loginHref,
  primaryLabel,
  primaryTone,
  primaryDisabled,
  primaryReason,
  helperText,
  detailsOpen,
  onPrimaryAction,
  onToggleDetails,
  onOpenTools,
  onCloseTools,
  onToggleDebug,
  onRequestGps,
  onDownloadFieldProofs,
  fieldPhotoCount = 0,
  submitting = false,
  errorMessage = null,
  onSubmitCode,
  onShowPrologue,
}: PlayerHudProps) {
  const [locale, setLocaleState] = useState(getLocale())
  const [backpackTab, setBackpackTab] = useState<BackpackTab>('requirements')
  const [toolsFallbackOpen, setToolsFallbackOpen] = useState(false)
  const [toolsFallbackCode, setToolsFallbackCode] = useState('')
  const gpsAccuracy = usePlayerStore((s) => s.gpsAccuracy)
  
  function getGpsAccuracyColor(acc: number | null) {
    if (!acc) return 'rgba(255, 255, 255, 0.4)'
    if (acc <= 10) return '#4ade80' // Excellent (Green)
    if (acc <= 25) return '#facc15' // Good (Yellow)
    if (acc <= 50) return '#fb923c' // Fair (Orange)
    return '#f87171' // Poor (Red)
  }
  
  function getGpsAccuracyBars(acc: number | null) {
    if (!acc) return 0
    if (acc <= 10) return 4
    if (acc <= 25) return 3
    if (acc <= 50) return 2
    return 1
  }

  useEffect(() => {
    const handleLocaleChange = () => setLocaleState(getLocale())
    window.addEventListener('saga:locale-change', handleLocaleChange)
    return () => window.removeEventListener('saga:locale-change', handleLocaleChange)
  }, [])

  function chooseLocale(nextLocale: Locale) {
    setLocale(nextLocale)
    setLocaleState(nextLocale)
  }

  useEffect(() => {
    if (typeof document === 'undefined') return

    const panelOpen = detailsOpen || toolsOpen
    document.body.classList.toggle('saga-player-panel-open', panelOpen)

    return () => {
      document.body.classList.remove('saga-player-panel-open')
    }
  }, [detailsOpen, toolsOpen])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const panelOpen = detailsOpen || toolsOpen
    document.body.classList.toggle('saga-player-panel-open', panelOpen)

    const hiddenElements: HTMLElement[] = []

    function hideElement(element: HTMLElement) {
      if (element.dataset.sagaPanelHidden === '1') return
      element.dataset.sagaPanelHidden = '1'
      element.dataset.sagaPanelPrevDisplay = element.style.display || ''
      element.dataset.sagaPanelPrevPointerEvents = element.style.pointerEvents || ''
      element.dataset.sagaPanelPrevOpacity = element.style.opacity || ''
      element.style.display = 'none'
      element.style.pointerEvents = 'none'
      element.style.opacity = '0'
      hiddenElements.push(element)
    }

    /**
     * Compara sin acentos: `Ubicacion`, `ubicacion` y `UBICACION` son lo mismo.
     *
     * Aqui habia dos listas, una con tilde y otra sin. La de con tilde estaba
     * rota —alguna herramienta convirtio lo no-ASCII en interrogantes— y no
     * casaba con nada, asi que los botones con tilde en la etiqueta no se
     * escondian y se quedaban encima del panel. Quitando el acento hace falta
     * una sola lista.
     */
    function sinAcentos(valor: string) {
      return valor
        .trim()
        .toLowerCase()
        .normalize('NFD')
        // Con escapes a proposito: poner aqui las marcas de acento literales es
        // volver a meter no-ASCII en el sitio donde ya se rompio una vez.
        .replace(/[\u0300-\u036f]/g, '')
    }

    /**
     * Una etiqueta de un solo caracter que no es letra ni numero.
     *
     * Antes esto eran cuatro comparaciones identicas contra un interrogante:
     * eran cuatro simbolos distintos y la misma herramienta se los comio a los
     * cuatro. Los originales no estan en ninguna parte de la historia -el dano
     * viene del commit raiz-, asi que se reconocen por su forma en vez de por
     * una lista que ya no existe. Y asi vale para cualquier boton de simbolo,
     * no solo para aquellos cuatro.
     */
    function esSimbolo(valor: string) {
      return valor.length > 0 && valor.length <= 2 && !/[\p{L}\p{N}]/u.test(valor)
    }

    function shouldHideButton(button: HTMLButtonElement) {
      const text = sinAcentos(button.textContent || '')
      const label = sinAcentos(button.getAttribute('aria-label') || '')
      const title = sinAcentos(button.getAttribute('title') || '')
      const combined = `${text} ${label} ${title}`

      if (esSimbolo(text)) return true

      return ['ampliar', 'expand', 'centrar', 'ubicacion', 'mi posicion'].some((aguja) =>
        combined.includes(aguja)
      )
    }

    function hideMapControls() {
      if (!panelOpen) return

      document
        .querySelectorAll<HTMLElement>(
          '.leaflet-control-container, .saga-map-control, .saga-map-controls, .saga-map-action, .saga-map-actions, .saga-map-floating-action, .saga-map-floating-actions, [data-saga-map-control]'
        )
        .forEach(hideElement)

      document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        if (shouldHideButton(button)) hideElement(button)
      })
    }

    function restoreHidden() {
      hiddenElements.forEach((element) => {
        element.style.display = element.dataset.sagaPanelPrevDisplay || ''
        element.style.pointerEvents = element.dataset.sagaPanelPrevPointerEvents || ''
        element.style.opacity = element.dataset.sagaPanelPrevOpacity || ''
        delete element.dataset.sagaPanelHidden
        delete element.dataset.sagaPanelPrevDisplay
        delete element.dataset.sagaPanelPrevPointerEvents
        delete element.dataset.sagaPanelPrevOpacity
      })
      hiddenElements.length = 0
    }

    hideMapControls()

    const observer = new MutationObserver(hideMapControls)
    if (panelOpen) {
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      observer.disconnect()
      restoreHidden()
      document.body.classList.remove('saga-player-panel-open')
    }
  }, [detailsOpen, toolsOpen]) // saga-panel-control-hider-v3

  const compact = typeof window !== 'undefined' ? window.innerWidth <= 560 : false
  const gpsDisplay = getGpsDisplay(gpsState)
  const rangeDisplay = getRangeDisplay(finished, distanceMeters, inRange)
  // Kilómetros cuando toca: viniendo de casa salía "ACHÉGATE MÁIS · 25412 m",
  // que es un número que no dice nada de un vistazo.
  const distanceLabel =
    distanceMeters === null
      ? null
      : distanceMeters < 1000
        ? `${distanceMeters} m`
        : `${(distanceMeters / 1000).toFixed(1).replace('.', ',')} km`
  const radiusLabel =
    typeof currentStage?.radius === 'number' ? `Radio ${currentStage.radius} m.` : ''
  // El texto de distancia sólo vale cuando lo que bloquea ES la distancia. Con
  // un nodo cerrado por falta de un objeto salía "Acércate para abrir este
  // nodo" justo debajo del botón "FALTA UN OBXECTO", contradiciéndose en
  // pantalla; y helperText, que trae el motivo real, no se pintaba en ningún
  // sitio.
  // Estando lejos no se añade ningún texto extra: el botón ya dice "ACHÉGATE
  // MÁIS · X km" y la línea roja parpadeando en el mapa dice el resto. Una
  // frase más en la barra sólo era ruido tapando el mapa.
  const helperCopy = finished
    ? 'Nodo completado.'
    : primaryReason === 'missing_item'
      ? helperText
      : inRange
        ? `${radiusLabel} Ya puedes abrir este nodo.`
        : `${radiusLabel} Acércate para abrir este nodo.`

  async function handleToolsFallbackSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const clean = toolsFallbackCode.trim().toUpperCase()
    if (!clean || !onSubmitCode || submitting) return

    // Si usan el código manual de respaldo (saltar nodo), aplicamos una penalización de 2 min (120000 ms)
    await onSubmitCode(clean, 0, 120000, true)
    setToolsFallbackCode('')
    setToolsFallbackOpen(false)
  }

  return (
    <>
      <section
        data-saga-player-hud="bottom"
        style={{
          ...card,
          width: compact ? '100%' : 'min(100%, 720px)',
          padding: compact ? 12 : 14,
        }}
      >
        <button
          type="button"
          style={getPrimaryStyle(primaryTone, primaryDisabled)}
          disabled={primaryDisabled}
          onClick={onPrimaryAction}
        >
          {!finished && !inRange && distanceLabel
            ? `${primaryLabel} · ${distanceLabel}`
            : primaryLabel}
        </button>

        <div style={helper}>{helperCopy}</div>

        <div style={actionRow}>
          <button
            type="button"
            style={detailsOpen ? ghostButtonActive : ghostButton}
            onClick={onToggleDetails}
          >
            {detailsOpen ? 'Cerrar mochila' : 'Mochila'}
          </button>

          <button
            type="button"
            style={toolsOpen ? ghostButtonActive : ghostButton}
            onClick={onOpenTools}
          >
            {toolsOpen ? t('player.tools.close', locale) : 'Herramientas'}
          </button>
        </div>
      </section>

      <SwipeableSheet
        open={detailsOpen}
        onClose={onToggleDetails}
        sheetStyle={getSheetStyle(compact)}
      >
        <div style={sheetHeader}>
          <div>
            <div style={sheetEyebrow}>MOCHILA</div>
            <div style={sheetTitle}>Guia, objetos y respaldo</div>
          </div>

          <button
            type="button"
            aria-label="Cerrar mochila"
            style={closeButton}
            onClick={onToggleDetails}
          >
            ×
          </button>
        </div>

        <div style={tabs}>
          <button
            type="button"
            style={backpackTab === 'requirements' ? tabActive : tabButton}
            onClick={() => setBackpackTab('requirements')}
          >
            Guia
          </button>
          <button
            type="button"
            style={backpackTab === 'inventory' ? tabActive : tabButton}
            onClick={() => setBackpackTab('inventory')}
          >
            Objetos
          </button>
          <button
            type="button"
            style={backpackTab === 'crafting' ? tabActive : tabButton}
            onClick={() => setBackpackTab('crafting')}
          >
            Mesa
          </button>
        </div>

        <div style={statusRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '10px' }}>
              {[1, 2, 3, 4].map((bar) => (
                <div
                  key={bar}
                  style={{
                    width: '3px',
                    height: `${bar * 2.5}px`,
                    background: bar <= getGpsAccuracyBars(gpsAccuracy) ? getGpsAccuracyColor(gpsAccuracy) : 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '1px',
                  }}
                />
              ))}
            </div>
            <span>{distanceMeters === null ? gpsDisplay : rangeDisplay}</span>
            {gpsAccuracy && distanceMeters === null && <span style={{ opacity: 0.7, fontSize: '0.9em' }}>({Math.round(gpsAccuracy)}m)</span>}
          </div>
          <span>
            {typeof currentStage?.radius === 'number'
              ? `Radio ${currentStage.radius} m`
              : 'Sin radio'}
          </span>
        </div>

        <div style={tabPanel}>
          {backpackTab === 'requirements' ? (
            <RequirementPreviewPanel user={user} stage={currentStage} />
          ) : null}

          {backpackTab === 'inventory' ? <InventoryPanel user={user} /> : null}

          {backpackTab === 'crafting' ? (
            <CraftingPanel user={user} stages={missionPayload?.stages} />
          ) : null}
        </div>
      </SwipeableSheet>

      <SwipeableSheet
        open={toolsOpen}
        onClose={onCloseTools}
        sheetStyle={getToolsSheetStyle(compact)}
      >
        <div style={toolsHeader}>
          <div style={toolsHeaderCopy}>
            <div style={toolsTitle}>{t('player.tools.title', locale)}</div>
            <div style={toolsSubtitle}>{t('player.tools.subtitle', locale)}</div>
          </div>

          <button
            type="button"
            aria-label="Cerrar herramientas"
            style={closeButton}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onCloseTools()
            }}
          >
            ×
          </button>
        </div>

        {/* CARD 1: OPERACIÓN OFFLINE */}
        <section style={toolsCardGroup}>
          <div style={toolsCardGroupLabel}>{t('player.tools.offlineOp', locale)}</div>
          <MissionPackPanel user={user} payload={missionPayload} />
        </section>

        {/* CARD 2: ACCIONES DE CAMPO */}
        <section style={toolsCardGroup}>
          <div style={toolsCardGroupLabel}>{t('player.tools.fieldActions', locale)}</div>

          <div style={toolsActionGrid}>
            {onDownloadFieldProofs ? (
              <button
                type="button"
                style={fieldPhotoCount > 0 ? toolsGreenActiveButton : toolsGreenDisabledButton}
                disabled={fieldPhotoCount <= 0}
                onClick={fieldPhotoCount > 0 ? onDownloadFieldProofs : undefined}
              >
                {fieldPhotoCount > 0
                  ? `📥 ${t('player.tools.downloadPhotos', locale)} (${fieldPhotoCount})`
                  : `📥 ${t('player.tools.noPhotos', locale)}`}
              </button>
            ) : null}
          </div>

          {onSubmitCode && currentStage && !finished ? (
            <div style={{ marginTop: 12 }}>
              {/* Fallback de nodo CÓDIGO FALLBACK */}
              <div style={fallbackToolHead}>
                <strong style={{ color: '#fbbf24' }}>🔑 {t('player.tools.altCode', locale)}</strong>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
                  {t('player.tools.altCodeHelp', locale)}
                </span>
              </div>

              <button
                type="button"
                style={toolsFallbackOpen ? fallbackToolButtonActive : fallbackToolButton}
                onClick={() => setToolsFallbackOpen((value) => !value)}
                disabled={submitting}
              >
                {toolsFallbackOpen
                  ? t('player.tools.hideForm', locale)
                  : t('player.tools.manualCode', locale)}
              </button>

              {toolsFallbackOpen ? (
                <form style={fallbackToolForm} onSubmit={handleToolsFallbackSubmit}>
                  <div
                    style={{
                      padding: '0.1rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      letterSpacing: '0.05em',
                      background: 'rgba(0, 0, 0, 0.5)',
                      color: 'white',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <span style={{ fontWeight: 'bold' }}>{getGpsDisplay(gpsState)}</span>
                  </div>
                  <input
                    value={toolsFallbackCode}
                    onChange={(event) => setToolsFallbackCode(event.target.value.toUpperCase())}
                    placeholder="INTRODUCE EL CÓDIGO (EJ: PIEDRA_ROJA)"
                    style={fallbackToolInput}
                    disabled={submitting}
                    autoFocus
                  />

                  <button
                    type="submit"
                    style={fallbackToolSubmit}
                    disabled={submitting || !toolsFallbackCode.trim()}
                  >
                    {submitting
                      ? t('player.tools.verifying', locale)
                      : t('player.tools.completeNode', locale)}
                  </button>

                  {errorMessage ? <div style={fallbackToolError}>{errorMessage}</div> : null}
                </form>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* CARD 3: AJUSTES Y DESARROLLO */}
        <section style={toolsCardGroup}>
          <div style={toolsCardGroupLabel}>{t('player.tools.deviceSettings', locale)}</div>

          {/* Aquí había un enlace al panel de administración pegado encima del
              botón de modo prueba. En el móvil se tocaba sin querer y sacaba al
              jugador de la partida al control de misión, que además no es una
              pantalla que deba tener a mano en plena ruta. El modo prueba se
              queda solo y a lo ancho, que es lo que se usa cuando falla el GPS. */}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              style={{
                ...(debugEnabled ? toolsButtonDangerActive : toolsQuietButton),
                width: '100%',
              }}
              onClick={() => {
                onToggleDebug()
                onCloseTools()
              }}
            >
              {debugEnabled
                ? `🛑 ${t('player.tools.exitDebug', locale)}`
                : `🛠️ ${t('player.tools.debugMode', locale)}`}
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
              onClick={() => {
                onCloseTools()
                window.location.href = '/player/'
              }}
            >
              🚪 {t('player.tools.switchPlayer', locale)}
            </button>
          </div>

          {/* Selector de Idioma (Español / Galego) */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 8, letterSpacing: '0.05em' }}>
              🌐 {t('player.tools.language', locale)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: locale === 'es' ? '1px solid rgba(52, 211, 153, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: locale === 'es' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: locale === 'es' ? '#34d399' : 'rgba(255, 255, 255, 0.7)',
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
                onClick={() => chooseLocale('es')}
              >
                🇪🇸 Español {locale === 'es' ? '✓' : ''}
              </button>

              <button
                type="button"
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: locale === 'gl' ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: locale === 'gl' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: locale === 'gl' ? '#38bdf8' : 'rgba(255, 255, 255, 0.7)',
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
                onClick={() => chooseLocale('gl')}
              >
                🟦 Galego {locale === 'gl' ? '✓' : ''}
              </button>
            </div>
          </div>
        </section>

        <div style={toolsBuildRow}>
          <BuildInfoBadge mode="inline" />
        </div>
      </SwipeableSheet>
    </>
  )
}

function getPrimaryStyle(tone: PrimaryActionTone, disabled: boolean): CSSProperties {
  if (disabled || tone === 'locked') {
    return {
      ...primaryBase,
      background: 'rgba(148,163,184,.22)',
      border: '1px solid rgba(255,255,255,.12)',
      color: 'rgba(255,255,255,.72)',
    }
  }

  if (tone === 'gps') {
    return {
      ...primaryBase,
      background: 'rgba(59,130,246,.18)',
      border: '1px solid rgba(96,165,250,.26)',
      color: '#dbeafe',
    }
  }

  if (tone === 'done') {
    return {
      ...primaryBase,
      background: 'rgba(168,85,247,.18)',
      border: '1px solid rgba(196,181,253,.24)',
      color: '#f3e8ff',
    }
  }

  if (tone === 'warn') {
    return {
      ...primaryBase,
      background: 'rgba(127,29,29,.22)',
      border: '1px solid rgba(248,113,113,.28)',
      color: '#fee2e2',
      boxShadow: '0 10px 24px rgba(127,29,29,.12)',
    }
  }

  return {
    ...primaryBase,
    background: 'linear-gradient(180deg, #22c55e, #16a34a)',
    border: '1px solid rgba(34,197,94,.22)',
    color: '#ffffff',
    boxShadow: '0 14px 30px rgba(34,197,94,.24)',
  }
}

const card: CSSProperties = {
  pointerEvents: 'auto',
  margin: '0 auto',
  display: 'grid',
  gap: 10,
  borderRadius: 28,
  background: 'linear-gradient(180deg, rgba(100,116,139,.46), rgba(71,85,105,.34))',
  border: '1px solid rgba(255,255,255,.22)',
  boxShadow: '0 22px 60px rgba(15,23,42,.18)',
  backdropFilter: 'blur(24px) saturate(1.12)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.12)',
}

const eyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const title: CSSProperties = {
  color: '#ffffff',
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const chipBase: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.12)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const chip: CSSProperties = {
  ...chipBase,
  background: 'rgba(34,197,94,.12)',
  color: '#ecfdf5',
}

const chipMuted: CSSProperties = {
  ...chipBase,
  background: 'rgba(255,255,255,.10)',
  color: 'rgba(255,255,255,.88)',
}

const chipDebug: CSSProperties = {
  ...chipBase,
  background: 'rgba(127,29,29,.24)',
  border: '1px solid rgba(248,113,113,.28)',
  color: '#fecaca',
}

const chipInfo: CSSProperties = {
  ...chipBase,
  background: 'rgba(59,130,246,.18)',
  border: '1px solid rgba(96,165,250,.24)',
  color: '#dbeafe',
}

const primaryBase: CSSProperties = {
  width: '100%',
  minHeight: 48,
  borderRadius: 16,
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const helper: CSSProperties = {
  color: 'rgba(255,255,255,.82)',
  fontSize: 13,
  lineHeight: 1.45,
}
const actionRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const ghostButton: CSSProperties = {
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(15,23,42,.32)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
}

const ghostButtonActive: CSSProperties = {
  ...ghostButton,
  background: 'rgba(59,130,246,.16)',
  border: '1px solid rgba(96,165,250,.18)',
  color: '#dbeafe',
}

function getOverlayStyle(compact: boolean): CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 3600,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: compact ? '0px' : '0 10px calc(8px + env(safe-area-inset-bottom, 0px))',
    pointerEvents: 'auto',
  }
}

const sheetBackdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(2,6,23,.22)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}

function getSheetStyle(compact: boolean): CSSProperties {
  return {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: 10,
    width: compact ? '100%' : 'min(100%, 480px)',
    maxHeight: compact ? '84dvh' : 'min(66vh, 590px)',
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
    borderRadius: compact ? '24px 24px 0 0' : 30,
    border: '1px solid rgba(255,255,255,.22)',
    borderBottom: compact ? 'none' : '1px solid rgba(255,255,255,.22)',
    background: 'linear-gradient(180deg, rgba(100,116,139,.46), rgba(71,85,105,.34))',
    color: '#f8fafc',
    boxShadow: '0 -15px 35px rgba(14,165,233,.08), 0 24px 70px rgba(0,0,0,.6)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
    padding: 14,
    paddingBottom: compact
      ? 'calc(24px + env(safe-area-inset-bottom, 0px))'
      : 'calc(14px + env(safe-area-inset-bottom, 0px))',
    animation: 'sagaLoginRise 260ms cubic-bezier(0.22, 1, 0.36, 1)',
  }
}

const sheetHeader: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 4,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '0 0 12px 0',
  background: 'transparent',
  borderBottom: '1px solid rgba(255,255,255,.10)',
}

const sheetEyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const sheetTitle: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

const tabs: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 6,
  padding: 4,
  borderRadius: 18,
  background: 'rgba(0,0,0,.2)',
  border: '1px solid rgba(255,255,255,.05)',
}

const tabButton: CSSProperties = {
  minHeight: 40,
  border: 'none',
  borderRadius: 14,
  background: 'transparent',
  color: 'rgba(226,232,240,.70)',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const tabActive: CSSProperties = {
  ...tabButton,
  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(16, 185, 129, 0.16))',
  color: '#a7f3d0',
  border: '1px solid rgba(52, 211, 153, 0.35)',
  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
}

const statusRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  borderRadius: 999,
  background: 'rgba(255,255,255,.10)',
  color: 'rgba(248,250,252,.82)',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
}

const tabPanel: CSSProperties = {
  display: 'grid',
  gap: 10,
  minHeight: 0,
}

function getToolsSheetStyle(compact: boolean): CSSProperties {
  return {
    ...getSheetStyle(compact),
    width: compact ? '100%' : 'min(100%, 460px)',
    maxHeight: compact ? '84dvh' : 'min(76dvh, 680px)', // maxHeight: 'min(76dvh, 680px)'
    gap: 14,
    background: 'linear-gradient(180deg, rgba(100,116,139,.46), rgba(71,85,105,.34))',
    border: '1px solid rgba(255, 255, 255, 0.22)',
    boxShadow: '0 -15px 40px rgba(14,165,233,.08), 0 24px 70px rgba(0,0,0,.7)',
  }
}

const toolsHeader: CSSProperties = {
  ...sheetHeader,
  alignItems: 'center',
}

const toolsHeaderCopy: CSSProperties = {
  display: 'grid',
  gap: 3,
  minWidth: 0,
}

const toolsTitle: CSSProperties = {
  ...sheetTitle,
  marginTop: 0,
  fontSize: 21,
}

const toolsSubtitle: CSSProperties = {
  color: 'rgba(226,232,240,.72)',
  fontSize: 11,
  lineHeight: 1.35,
}

const toolsSection: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const toolsSectionHead: CSSProperties = {
  display: 'grid',
  gap: 3,
  padding: '0 2px',
}

const toolsSectionTitle: CSSProperties = {
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 950,
}

const toolsActionGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
}

const toolsSettingsCard: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 8,
  padding: 0,
  background: 'transparent',
}

const toolsLanguageBlock: CSSProperties = {
  display: 'grid',
  gap: 5,
  minWidth: 0,
}

const toolsMiniLabel: CSSProperties = {
  color: 'rgba(187,247,208,.78)',
  fontSize: 9,
  fontWeight: 950,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const toolsButton: CSSProperties = {
  minHeight: 42,
  padding: '0 12px',
  borderRadius: 15,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'linear-gradient(180deg, rgba(100,116,139,.54), rgba(71,85,105,.54))',
  color: '#f8fafc',
  fontSize: 11,
  fontWeight: 900,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
}

const toolsButtonDangerActive: CSSProperties = {
  ...toolsButton,
  minHeight: 36,
  background: 'rgba(220,38,38,.18)',
  border: '1px solid rgba(248,113,113,.22)',
  color: '#fee2e2',
  fontSize: 10,
}

const toolsLoginLink: CSSProperties = {
  minWidth: 84,
  minHeight: 42,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 14px',
  borderRadius: 15,
  border: '1px solid rgba(187,247,208,.18)',
  background: 'rgba(34,197,94,.12)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 900,
  textDecoration: 'none',
}

const toolsLoginLinkMuted: CSSProperties = {
  ...toolsLoginLink,
  minHeight: 36,
  minWidth: 0,
  padding: '0 10px',
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.08)',
  color: 'rgba(226,232,240,.68)',
  fontSize: 10,
}

const toolsQuietButton: CSSProperties = {
  ...toolsButton,
  minHeight: 36,
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.08)',
  color: 'rgba(226,232,240,.78)',
  fontSize: 10,
}

const toolsSecondaryRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  paddingTop: 10,
  borderTop: '1px solid rgba(255,255,255,.08)',
}

const toolsBuildInfo: CSSProperties = {
  display: 'grid',
  justifyItems: 'end',
  gap: 4,
}

const closeButton: CSSProperties = {
  position: 'relative',
  zIndex: 10,
  minWidth: 40,
  width: 40,
  height: 40,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(15,23,42,.70)',
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 950,
  cursor: 'pointer',
  boxShadow: '0 12px 28px rgba(2,6,23,.24)',
}

const fallbackToolPanel: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 20,
  border: '1px solid rgba(251,191,36,.20)',
  background: 'rgba(251,191,36,.08)',
}

const fallbackToolHead: CSSProperties = {
  display: 'grid',
  gap: 4,
  color: '#f8fafc',
  fontSize: 12,
  lineHeight: 1.35,
}

const fallbackToolButton: CSSProperties = {
  minHeight: 40,
  width: '100%',
  borderRadius: 14,
  border: '1px solid rgba(251,191,36,.24)',
  background: 'rgba(251,191,36,.13)',
  color: '#fef3c7',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginTop: 8,
}

const fallbackToolButtonActive: CSSProperties = {
  ...fallbackToolButton,
  background: 'rgba(251,191,36,.20)',
}

const fallbackToolForm: CSSProperties = {
  display: 'grid',
  gap: 8,
  marginTop: 8,
}

const fallbackToolInput: CSSProperties = {
  width: '100%',
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(15,23,42,.52)',
  color: '#ffffff',
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 900,
  outline: 'none',
}

const fallbackToolSubmit: CSSProperties = {
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid rgba(187,247,208,.22)',
  background: 'rgba(34,197,94,.18)',
  color: '#dcfce7',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const fallbackToolError: CSSProperties = {
  color: '#fecaca',
  fontSize: 11,
  fontWeight: 850,
  lineHeight: 1.35,
}

// New premium tools styling variables
const toolsCardGroup: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: '14px 0',
  borderBottom: '1px solid rgba(255,255,255,.05)',
}

const toolsCardGroupLabel: CSSProperties = {
  color: '#34d399',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: 4,
}

const toolsGreenButton: CSSProperties = {
  minHeight: 40,
  padding: '0 12px',
  borderRadius: 14,
  border: '1px solid rgba(52, 211, 153, 0.3)',
  background: 'rgba(16, 185, 129, 0.12)',
  color: '#34d399',
  fontSize: 11,
  fontWeight: 900,
  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)',
}

const toolsGreenActiveButton: CSSProperties = {
  ...toolsGreenButton,
  background: 'rgba(16, 185, 129, 0.22)',
  border: '1px solid rgba(52, 211, 153, 0.45)',
  color: '#34d399',
}

const toolsGreenDisabledButton: CSSProperties = {
  ...toolsGreenButton,
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  color: 'rgba(255, 255, 255, 0.3)',
  cursor: 'not-allowed',
}

const toolsQuietLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 12,
  border: '1px solid rgba(255, 255, 255, 0.08)',
  background: 'rgba(255, 255, 255, 0.04)',
  color: 'rgba(226, 232, 240, 0.8)',
  fontSize: 10,
  fontWeight: 900,
  textDecoration: 'none',
}

const toolsBuildRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  paddingTop: 8,
  paddingBottom: 24,
  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
}

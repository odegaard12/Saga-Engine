import { useEffect, useState, type CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerStage } from '../../types/player'
import type { PrimaryActionTone } from '../runtime'
import { MissionPackPanel } from './MissionPackPanel'
import { OfflineSyncPanel } from './OfflineSyncPanel'
import { InventoryPanel } from './InventoryPanel'
import { ManualInventoryCollectPanel } from './ManualInventoryCollectPanel'
import { RequirementPreviewPanel } from './RequirementPreviewPanel'
import { getLocale, setLocale, t, type Locale } from '../../i18n'

type BackpackTab = 'requirements' | 'inventory' | 'collect'

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
  helperText: string
  detailsOpen: boolean
  onPrimaryAction: () => void
  onToggleDetails: () => void
  onOpenTools: () => void
  onCloseTools: () => void
  onToggleDebug: () => void
  onRequestGps: () => void
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
  helperText,
  detailsOpen,
  onPrimaryAction,
  onToggleDetails,
  onOpenTools,
  onCloseTools,
  onToggleDebug,
  onRequestGps,
}: PlayerHudProps) {
  const [locale, setLocaleState] = useState(getLocale())
  const [backpackTab, setBackpackTab] = useState<BackpackTab>('requirements')

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

    function shouldHideButton(button: HTMLButtonElement) {
      const text = (button.textContent || '').trim().toLowerCase()
      const label = (button.getAttribute('aria-label') || '').trim().toLowerCase()
      const title = (button.getAttribute('title') || '').trim().toLowerCase()
      const combined = `${text} ${label} ${title}`

      if (text === '?' || text === '?' || text === '?' || text === '?') return true
      if (combined.includes('ampliar')) return true
      if (combined.includes('expand')) return true
      if (combined.includes('centrar')) return true
      if (combined.includes('ubicacion')) return true
      if (combined.includes('ubicaci?n')) return true
      if (combined.includes('mi posicion')) return true
      if (combined.includes('mi posici?n')) return true

      return false
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

  const compact =
    typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const gpsDisplay = getGpsDisplay(gpsState)
  const rangeDisplay = getRangeDisplay(finished, distanceMeters, inRange)
  const distanceLabel = distanceMeters !== null ? `${distanceMeters} m` : null
  const radiusLabel =
    typeof currentStage?.radius === 'number' ? `Radio ${currentStage.radius} m.` : ''
  const helperCopy =
    finished
      ? 'Nodo completado.'
      : inRange
        ? `${radiusLabel} Ya puedes abrir este nodo.`
        : `${radiusLabel} Acércate para abrir este nodo.`

  return (
    <>
      <section
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

      {detailsOpen ? (
        <div style={sheetOverlay}>
          <div style={sheetBackdrop} onClick={onToggleDetails} />

          <aside
            style={{
              ...sheet,
              width: compact ? '100%' : 'min(100%, 480px)',
            }}
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
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
                style={backpackTab === 'collect' ? tabActive : tabButton}
                onClick={() => setBackpackTab('collect')}
              >
                Respaldo
              </button>
            </div>

            <div style={statusRow}>
              <span>{distanceMeters === null ? gpsDisplay : rangeDisplay}</span>
              <span>{typeof currentStage?.radius === 'number' ? `Radio ${currentStage.radius} m` : 'Sin radio'}</span>
            </div>

            <div style={tabPanel}>
              {backpackTab === 'requirements' ? (
                <RequirementPreviewPanel user={user} stage={currentStage} />
              ) : null}

              {backpackTab === 'inventory' ? (
                <InventoryPanel user={user} />
              ) : null}

              {backpackTab === 'collect' ? (
                <ManualInventoryCollectPanel user={user} />
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {toolsOpen ? (
        <div style={toolsOverlay}>
          <div style={toolsBackdrop} onClick={onCloseTools} />

          <aside
            style={{
              ...toolsSheet,
              width: compact ? '100%' : 'min(100%, 460px)',
            }}
            aria-modal="true"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={toolsHeader}>
              <div>
                <div style={toolsTitle}>Herramientas</div>
                <div style={toolsSubtitle}>Offline, sync, idioma y soporte</div>
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

            <MissionPackPanel user={user} payload={missionPayload} />
            <OfflineSyncPanel user={user} />

            <div className="saga-tools-language-row">
              <span>{t('common.language', locale)}</span>
              <button
                type="button"
                className={locale === 'en' ? 'active' : ''}
                onClick={() => chooseLocale('en')}
              >
                EN
              </button>
              <button
                type="button"
                className={locale === 'es' ? 'active' : ''}
                onClick={() => chooseLocale('es')}
              >
                ES
              </button>
            </div>

            <button
              type="button"
              style={toolsButton}
              onClick={() => {
                onRequestGps()
                onCloseTools()
              }}
            >
              Reactivar / centrar GPS
            </button>

            <button
              type="button"
              style={debugEnabled ? toolsButtonDangerActive : toolsButton}
              onClick={() => {
                onToggleDebug()
                onCloseTools()
              }}
            >
              {debugEnabled ? 'Desactivar debug GPS' : 'Activar debug GPS'}
            </button>

            <a
              href={loginHref}
              style={toolsLink}
              onClick={onCloseTools}
            >
              Login
            </a>
          </aside>
        </div>
      ) : null}
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
  background:
    'linear-gradient(180deg, rgba(100,116,139,.46), rgba(71,85,105,.34))',
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

const sheetOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3600,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: '0 10px calc(8px + env(safe-area-inset-bottom, 0px))',
  pointerEvents: 'auto',
}

const sheetBackdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(2,6,23,.22)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}

const sheet: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gap: 10,
  maxHeight: 'min(66vh, 590px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
  borderRadius: 30,
  border: '1px solid rgba(255,255,255,.18)',
  background:
    'radial-gradient(circle at top left, rgba(187,247,208,.11), transparent 34%), linear-gradient(180deg, rgba(71,85,105,.92), rgba(51,65,85,.86))',
  color: '#f8fafc',
  boxShadow: '0 24px 70px rgba(2,6,23,.42)',
  backdropFilter: 'blur(24px) saturate(1.08)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.08)',
  padding: 12,
  paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
}

const sheetHeader: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 4,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  margin: '-12px -12px 0',
  padding: '12px 12px 10px',
  borderRadius: '30px 30px 18px 18px',
  background:
    'linear-gradient(180deg, rgba(71,85,105,.96), rgba(71,85,105,.76))',
  borderBottom: '1px solid rgba(255,255,255,.10)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
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
  background: 'rgba(15,23,42,.34)',
  border: '1px solid rgba(255,255,255,.08)',
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
  background: 'rgba(187,247,208,.16)',
  color: '#dcfce7',
  boxShadow: 'inset 0 0 0 1px rgba(187,247,208,.18)',
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

const toolsOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 3600,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: '0 10px calc(8px + env(safe-area-inset-bottom, 0px))',
  pointerEvents: 'auto',
}

const toolsBackdrop: CSSProperties = sheetBackdrop

const toolsSheet: CSSProperties = sheet

const toolsHeader: CSSProperties = sheetHeader

const toolsTitle: CSSProperties = sheetTitle

const toolsSubtitle: CSSProperties = {
  color: 'rgba(226,232,240,.68)',
  fontSize: 12,
  lineHeight: 1.35,
  marginTop: 4,
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

const toolsButton: CSSProperties = {
  minHeight: 46,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 900,
}

const toolsButtonDangerActive: CSSProperties = {
  ...toolsButton,
  background: 'rgba(220,38,38,.18)',
  border: '1px solid rgba(248,113,113,.22)',
  color: '#fee2e2',
}

const toolsLink: CSSProperties = {
  minHeight: 46,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 800,
  textDecoration: 'none',
}

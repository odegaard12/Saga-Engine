import type { CSSProperties } from 'react'
import type { PlayerGpsStatus } from '../../types/player'

interface FieldPrepPanelProps {
  visible: boolean
  mobile: boolean
  hasOfflineMission: boolean
  hasBrowserGps: boolean
  offlinePrepState: 'idle' | 'saving' | 'saved' | 'error'
  browserGpsStatus: PlayerGpsStatus
  onPrepareOfflinePack: () => void
  onRequestGps: () => void
  onDismiss: () => void
}

export function FieldPrepPanel({
  visible,
  mobile,
  hasOfflineMission,
  hasBrowserGps,
  offlinePrepState,
  browserGpsStatus,
  onPrepareOfflinePack,
  onRequestGps,
  onDismiss,
}: FieldPrepPanelProps) {
  if (!visible) return null

  return (
    <div style={getOfflinePrepOverlayStyle(mobile)}>
      <section style={offlinePrepCard}>
        <div>
          <div style={offlinePrepEyebrow}>MODO CAMPO</div>
          <div style={offlinePrepTitle}>
            {hasOfflineMission && hasBrowserGps ? 'Listo para salir' : 'Preparar antes de salir'}
          </div>
          <div style={offlinePrepCopy}>
            {hasOfflineMission ? '✓ Misión descargada en este teléfono.' : '○ Descarga nodos, códigos, reglas y requisitos.'}
            <br />
            {hasBrowserGps ? '✓ GPS activo y listo para entrar en nodos cercanos.' : '○ Activa GPS para calcular distancia, centrar el mapa y desbloquear nodos cercanos.'}
          </div>
        </div>

        <div style={offlinePrepActions}>
          <button
            type="button"
            style={hasOfflineMission ? offlinePrepButtonDone : offlinePrepButton}
            disabled={offlinePrepState === 'saving'}
            onClick={onPrepareOfflinePack}
          >
            {offlinePrepState === 'saving'
              ? 'Descargando…'
              : hasOfflineMission
                ? '✓ Misión descargada'
                : 'Descargar misión'}
          </button>

          <button
            type="button"
            style={hasBrowserGps ? offlinePrepButtonDone : offlinePrepButton}
            onClick={onRequestGps}
          >
            {browserGpsStatus === 'searching'
              ? 'Buscando GPS…'
              : hasBrowserGps
                ? '✓ GPS activo'
                : 'Activar GPS'}
          </button>
        </div>

        <button
          type="button"
          style={hasOfflineMission && hasBrowserGps ? offlinePrepDismiss : offlinePrepDismissLater}
          onClick={onDismiss}
        >
          {hasOfflineMission && hasBrowserGps ? '×' : 'Más tarde'}
        </button>

        {offlinePrepState === 'error' ? (
          <div style={offlinePrepError}>No se pudo descargar. Prueba otra vez desde Herramientas.</div>
        ) : null}
      </section>
    </div>
  )
}

function getOfflinePrepOverlayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: mobile ? 12 : 24,
    right: mobile ? 12 : 'auto',
    top: mobile ? 'calc(env(safe-area-inset-top, 0px) + 230px)' : 86,
    bottom: 'auto',
    width: mobile ? 'auto' : 380,
    zIndex: 1190,
    pointerEvents: 'auto',
  }
}

const offlinePrepCard: CSSProperties = {
  position: 'relative',
  display: 'grid',
  gap: 12,
  borderRadius: 24,
  padding: 14,
  background: 'rgba(15,23,42,.74)',
  border: '1px solid rgba(255,255,255,.14)',
  color: '#f8fafc',
  boxShadow: '0 20px 44px rgba(15,23,42,.25)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
}

const offlinePrepEyebrow: CSSProperties = {
  color: '#bbf7d0',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const offlinePrepTitle: CSSProperties = {
  marginTop: 4,
  color: '#ffffff',
  fontSize: 17,
  fontWeight: 900,
  letterSpacing: '-0.03em',
}

const offlinePrepCopy: CSSProperties = {
  marginTop: 8,
  color: 'rgba(226,232,240,.78)',
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 700,
}

const offlinePrepActions: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const offlinePrepButton: CSSProperties = {
  minHeight: 42,
  borderRadius: 16,
  border: '1px solid rgba(96,165,250,.24)',
  background: 'rgba(59,130,246,.16)',
  color: '#dbeafe',
  fontSize: 11,
  fontWeight: 900,
}

const offlinePrepButtonDone: CSSProperties = {
  ...offlinePrepButton,
  border: '1px solid rgba(34,197,94,.22)',
  background: 'rgba(34,197,94,.14)',
  color: '#dcfce7',
}

const offlinePrepDismiss: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 10,
  width: 28,
  height: 28,
  borderRadius: 999,
  border: 'none',
  background: 'transparent',
  color: 'rgba(226, 232, 240, 0.78)',
  fontSize: 18,
  fontWeight: 900,
  cursor: 'pointer',
}

const offlinePrepDismissLater: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'rgba(226,232,240,.78)',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}

const offlinePrepError: CSSProperties = {
  color: '#fecaca',
  fontSize: 12,
  fontWeight: 800,
}

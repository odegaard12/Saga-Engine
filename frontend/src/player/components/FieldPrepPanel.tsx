import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { PlayerGpsStatus } from '../../types/player'

export type EstadoPermiso = 'idle' | 'pidiendo' | 'ok' | 'error'

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
  /**
   * Cámara y movimiento van POR SEPARADO.
   *
   * Iban juntos en un solo estado y hacía falta que los dos saliesen bien para
   * darlo por hecho: conceder el movimiento no quitaba la fila, porque la cámara
   * había fallado, y no había forma de saber cuál faltaba.
   */
  permisoCamara: EstadoPermiso
  permisoMovimiento: EstadoPermiso
  onRequestCamera: () => void
  onRequestMotion: () => void
}

/**
 * Tarjeta de preparación antes de salir.
 *
 * Centrada y de cristal, como los minijuegos. Sólo enseña lo que falta: una fila
 * por cosa, con su botón. Lo que ya está hecho se resume abajo en una línea.
 */
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
  permisoCamara,
  permisoMovimiento,
  onRequestCamera,
  onRequestMotion,
}: FieldPrepPanelProps) {
  if (!visible) return null

  type Fila = {
    clave: string
    icono: string
    que: string
    para: string
    etiqueta: string
    accion: () => void
    ocupado: boolean
    fallo: boolean
  }

  const pendientes: Fila[] = []

  if (!hasOfflineMission) {
    pendientes.push({
      clave: 'mision',
      icono: '📥',
      que: 'Misión offline',
      para: 'Para jugar sin cobertura',
      etiqueta: offlinePrepState === 'saving' ? 'Descargando…' : 'Descargar',
      accion: onPrepareOfflinePack,
      ocupado: offlinePrepState === 'saving',
      fallo: offlinePrepState === 'error',
    })
  }

  if (!hasBrowserGps) {
    pendientes.push({
      clave: 'gps',
      icono: '📍',
      que: 'Ubicación',
      para: 'Tu flecha y la línea al siguiente nodo',
      etiqueta: browserGpsStatus === 'searching' ? 'Buscando…' : 'Permitir',
      accion: onRequestGps,
      ocupado: browserGpsStatus === 'searching',
      fallo: browserGpsStatus === 'error',
    })
  }

  /**
   * Cámara y movimiento, cada uno con su fila y su botón.
   *
   * Se probó a juntarlos en un botón y salió mal: como el estado de fallo miraba
   * los dos a la vez, conceder uno y que fallase el otro dejaba la fila diciendo
   * "lo denegaste" encima de un permiso que acababas de dar. Son dos avisos
   * distintos del sistema y tienen que verse como dos cosas distintas.
   */
  if (permisoMovimiento !== 'ok') {
    pendientes.push({
      clave: 'movimiento',
      icono: '🧭',
      que: 'Movemento',
      para: 'A brúxula e o labirinto',
      etiqueta: permisoMovimiento === 'pidiendo' ? 'Esperando…' : 'Permitir',
      accion: onRequestMotion,
      ocupado: permisoMovimiento === 'pidiendo',
      fallo: permisoMovimiento === 'error',
    })
  }

  if (permisoCamara !== 'ok') {
    pendientes.push({
      clave: 'camara',
      icono: '📷',
      que: 'Cámara',
      para: 'Escanear as pegatinas QR',
      etiqueta: permisoCamara === 'pidiendo' ? 'Esperando…' : 'Permitir',
      accion: onRequestCamera,
      ocupado: permisoCamara === 'pidiendo',
      fallo: permisoCamara === 'error',
    })
  }

  const listos = [
    hasOfflineMission ? 'misión' : null,
    hasBrowserGps ? 'ubicación' : null,
    permisoMovimiento === 'ok' ? 'movemento' : null,
    permisoCamara === 'ok' ? 'cámara' : null,
  ].filter(Boolean)

  /**
   * El panel se saca al final del documento.
   *
   * Subirle la capa no bastaba: vive dentro del armazon del juego, y ahi hay
   * contenedores con `transform` y `backdrop-filter`. Cualquiera de los dos
   * crea un contexto de apilamiento propio, y dentro de el da igual que pongas
   * 7000 o un millon: la barra de abajo y la clasificacion, que estan FUERA,
   * siguen dibujandose por encima. Sacandolo a document.body deja de tener
   * ancestros que lo encierren.
   */
  const panel = (
    <div style={capa} onClick={onDismiss}>
      <section
        className="saga-glass-panel"
        style={tarjeta(mobile)}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={cabecera}>
          <div>
            <div style={antetitulo}>ANTES DE SALIR</div>
            <strong style={titulo}>
              {pendientes.length === 0
                ? 'Todo listo'
                : pendientes.length === 1
                  ? 'Falta un permiso'
                  : `Faltan ${pendientes.length}`}
            </strong>
          </div>

          {/* Cierra siempre, pase lo que pase con los permisos. */}
          <button type="button" style={cerrar} onClick={onDismiss} aria-label="Cerrar">
            ×
          </button>
        </header>

        {pendientes.map((f) => (
          <div key={f.clave} style={fila}>
            <span style={icono}>{f.icono}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={queEs}>{f.que}</div>
              <div style={{ ...paraQue, ...(f.fallo ? falloTexto : null) }}>
                {f.fallo ? 'Lo denegaste. Ajustes del móvil › Safari.' : f.para}
              </div>
            </div>
            <button type="button" style={boton} disabled={f.ocupado} onClick={f.accion}>
              {f.etiqueta}
            </button>
          </div>
        ))}

        {listos.length > 0 ? <div style={hecho}>✓ {listos.join(' · ')}</div> : null}
      </section>
    </div>
  )

  if (typeof document === 'undefined') return panel

  return createPortal(panel, document.body)
}

const capa: CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Por encima de la barra de abajo (3600) y del botón de clasificación
  // (4600): con 1400 el velo tapaba el mapa pero esos dos seguían asomando por
  // encima de la tarjeta. Por debajo de la cámara (7500), que manda cuando se
  // abre para escanear.
  zIndex: 7000,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  background: 'radial-gradient(circle at 50% 42%, rgba(2,6,23,.42), rgba(2,6,23,.68))',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
}

function tarjeta(mobile: boolean): CSSProperties {
  return {
    width: mobile ? 'min(100%, 340px)' : 'min(100%, 400px)',
    display: 'grid',
    gap: 10,
    padding: 16,
    color: '#e2e8f0',
    borderRadius: 'var(--theme-radius-panel)',
    // El cristal va aquí y no sólo en la clase: comprobado en el navegador,
    // backdrop-filter salía en "none" porque la hoja global no llegaba a
    // aplicarse sobre este elemento, y la tarjeta quedaba opaca y plana.
    background:
      'linear-gradient(180deg, rgba(100,116,139,.34), rgba(30,41,59,.42))',
    border: '1px solid rgba(255,255,255,.24)',
    backdropFilter: 'var(--theme-blur)',
    WebkitBackdropFilter: 'var(--theme-blur)',
    // Brillo de canto arriba y sombra ancha abajo: es lo que separa una lámina
    // de cristal de un rectángulo translúcido.
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,.24), 0 26px 60px rgba(2,6,23,.55)',
  }
}

const cabecera: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const antetitulo: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '.18em',
  color: '#7dd3fc',
}

const titulo: CSSProperties = {
  display: 'block',
  marginTop: 3,
  fontSize: 17,
  fontWeight: 850,
  letterSpacing: '-.015em',
}

const cerrar: CSSProperties = {
  flex: '0 0 auto',
  width: 32,
  height: 32,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(255,255,255,.2)',
  background: 'rgba(255,255,255,.08)',
  color: '#e2e8f0',
  fontSize: 19,
  fontWeight: 900,
  lineHeight: 1,
  cursor: 'pointer',
}

const fila: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 11px',
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid rgba(255,255,255,.14)',
  // Cristal también dentro: el degradado y el desenfoque hacen que la fila
  // flote sobre la tarjeta en vez de parecer un recuadro plano pegado encima.
  background:
    'linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.035))',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14)',
}

const icono: CSSProperties = {
  flex: '0 0 auto',
  fontSize: 17,
  lineHeight: 1,
}

const queEs: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.2,
}

const paraQue: CSSProperties = {
  fontSize: 10.5,
  lineHeight: 1.3,
  color: 'rgba(203,213,225,.68)',
}

const falloTexto: CSSProperties = {
  color: 'rgba(253,224,71,.92)',
}

const boton: CSSProperties = {
  flex: '0 0 auto',
  minHeight: 34,
  padding: '0 13px',
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(125,211,252,.55)',
  background: 'linear-gradient(180deg,rgba(56,189,248,.92),rgba(14,116,190,.92))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3), 0 6px 16px rgba(2,132,199,.35)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 850,
  cursor: 'pointer',
}

const hecho: CSSProperties = {
  fontSize: 10.5,
  color: 'rgba(148,163,184,.75)',
}

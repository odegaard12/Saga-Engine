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
  /** Volver a bajar el mapa: la ruta pudo cambiar desde que se guardó. */
  onRedownloadMap?: () => void
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
  onRedownloadMap,
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

        {/* Cuánto llevas, de un vistazo. Mismo lenguaje que el filo de
            progreso de la barra de arriba: un tramo por cosa, encendido lo
            que ya está. Antes sólo se sabía contando las filas que quedaban. */}
        <div style={riel}>
          {Array.from({ length: listos.length + pendientes.length }).map((_, i) => (
            <span
              key={i}
              style={{
                ...rielTramo,
                background:
                  i < listos.length ? 'rgb(var(--theme-done))' : 'rgba(255,255,255,.16)',
              }}
            />
          ))}
        </div>

        {/* Filas sin caja: icono, texto y botón sobre una línea fina.
            Antes cada fila era un recuadro de cristal DENTRO de la tarjeta de
            cristal -recuadro dentro de recuadro, lo mismo que ensuciaba el
            login-, y el texto de apoyo iba a 10.5px, ilegible en el monte. */}
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

        {/* Con la misión ya guardada: poder volver a bajar el mapa. Si la
            ruta cambió -un nodo movido, uno nuevo- el mapa guardado se queda
            con las teselas viejas y nada lo vuelve a pedir solo. */}
        {hasOfflineMission && onRedownloadMap ? (
          <button type="button" style={botonSecundario} onClick={onRedownloadMap}>
            Volver a bajar el mapa
          </button>
        ) : null}
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
  // Velo neutro: antes era azul marino y teñia la pantalla entera.
  background: 'radial-gradient(circle at 50% 42%, rgba(0,0,0,.42), rgba(0,0,0,.68))',
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
      'linear-gradient(180deg, rgba(var(--theme-sheen-a), calc(.34 * var(--theme-solid))), rgba(var(--theme-ink-soft), .42))',
    border: '1px solid rgba(255,255,255,.24)',
    backdropFilter: 'var(--theme-blur)',
    WebkitBackdropFilter: 'var(--theme-blur)',
    // Brillo de canto arriba y sombra ancha abajo: es lo que separa una lámina
    // de cristal de un rectángulo translúcido.
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,.24), 0 26px 60px rgba(var(--theme-ink-deep), .55)',
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
  color: 'rgb(var(--theme-info-soft))',
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

// Un tramo por cosa que hace falta, encendido lo ya listo.
const riel: CSSProperties = {
  display: 'flex',
  gap: 3,
  height: 3,
  marginTop: 2,
  marginBottom: 4,
}

const rielTramo: CSSProperties = {
  flex: 1,
  height: '100%',
  borderRadius: 2,
}

// Sin caja: sólo una línea fina de separación. Ver la nota del JSX.
const fila: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '11px 2px',
  borderTop: '0.5px solid rgba(255,255,255,.12)',
}

const icono: CSSProperties = {
  flex: '0 0 auto',
  fontSize: 22,
  lineHeight: 1,
  width: 26,
  textAlign: 'center',
}

const queEs: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  lineHeight: 1.2,
  color: '#ffffff',
}

// 12px, no 10.5: esto se lee de pie, en la calle, antes de salir a andar.
const paraQue: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.35,
  marginTop: 2,
  color: 'rgba(var(--theme-line-soft), .72)',
}

const falloTexto: CSSProperties = {
  color: 'rgba(253,224,71,.92)',
}

// Del tema, no azul fijo: con el tema de fuego el único botón de esta
// pantalla salía azul cielo, de otra aplicación.
const boton: CSSProperties = {
  flex: '0 0 auto',
  minHeight: 38,
  padding: '0 16px',
  borderRadius: 'var(--theme-radius-card)',
  border: 0,
  background: 'linear-gradient(180deg, var(--theme-primary), var(--theme-primary-hover))',
  color: '#ffffff',
  fontSize: 12.5,
  fontWeight: 900,
  letterSpacing: '.02em',
  cursor: 'pointer',
}

const botonSecundario: CSSProperties = {
  marginTop: 2,
  width: '100%',
  minHeight: 38,
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid rgba(255,255,255,.20)',
  background: 'rgba(255,255,255,.06)',
  color: 'rgba(255,255,255,.88)',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
}

const hecho: CSSProperties = {
  marginTop: 2,
  paddingTop: 10,
  borderTop: '0.5px solid rgba(255,255,255,.12)',
  fontSize: 12,
  fontWeight: 700,
  color: 'rgb(var(--theme-done))',
}

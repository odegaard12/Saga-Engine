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
        {/* El titulo DICE QUE FALTA, no cuantas cosas faltan.
            "Falta un permiso" obligaba a bajar la vista para saber cual;
            con el nombre delante se resuelve sin leer mas. El recuento va
            debajo en texto pequeño, que es su sitio: es el detalle. */}
        <header style={cabecera}>
          <div style={{ minWidth: 0 }}>
            <div style={antetitulo}>ANTES DE SALIR</div>
            <strong style={titulo}>
              {pendientes.length === 0
                ? 'Todo listo'
                : pendientes.length === 1
                  ? `Falta ${pendientes[0].que.toLowerCase()}`
                  : `Faltan ${pendientes.length} permisos`}
            </strong>
            <div style={recuento}>
              {listos.length} de {listos.length + pendientes.length} listos
            </div>
          </div>

          {/* Cierra siempre, pase lo que pase con los permisos. */}
          <button type="button" style={cerrar} onClick={onDismiss} aria-label="Cerrar">
            ×
          </button>
        </header>

        {/* Filas sin caja: icono, texto y botón entre dos líneas finas.
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

        {/* Una etiqueta por cosa, no una linea de texto separada por puntos:
            asi se lee de un vistazo QUE hay resuelto, sin tener que leer la
            frase entera. Verde universal de "hecho", no el color del tema
            -aqui es una señal, no decoracion de marca-. */}
        {listos.length > 0 ? (
          <div style={hechoFila}>
            {listos.map((nombre) => (
              <span key={String(nombre)} style={hechoEtiqueta}>
                ✓ {nombre}
              </span>
            ))}
          </div>
        ) : null}

        {/* Con la misión ya guardada: poder volver a bajar el mapa. Si la
            ruta cambió -un nodo movido, uno nuevo- el mapa guardado se queda
            con las teselas viejas y nada lo vuelve a pedir solo. */}
        {hasOfflineMission && onRedownloadMap ? (
          <button type="button" style={botonSecundario} onClick={onRedownloadMap}>
            Volver a bajar el mapa
          </button>
        ) : null}

        {/* Salida explicita. La X de arriba ya cerraba, pero era el unico
            camino y no todo el mundo la busca: con permisos denegados desde
            los ajustes del movil, esta pantalla era un callejon aparente. */}
        <button type="button" style={seguirSinEso} onClick={onDismiss}>
          Seguir sen iso
        </button>
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
  // Fondo difuminado, no solo oscurecido: se sigue adivinando el mapa detras
  // -"que difumine todo el fondo y se vea todo eso"- pero nada de lo de
  // debajo compite con la tarjeta.
  background: 'rgba(var(--theme-ink-deep), .84)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}

// Tarjeta SOLIDA, no cristal: mismo lenguaje que el prologo, la mochila y
// las herramientas. Ver la nota larga en PlayerShell.tsx sobre por que los
// translucidos daban barro.
function tarjeta(mobile: boolean): CSSProperties {
  return {
    width: mobile ? 'min(100%, 360px)' : 'min(100%, 420px)',
    display: 'grid',
    gap: 0,
    padding: '22px 19px 19px',
    color: '#e2e8f0',
    borderRadius: 18,
    background: 'var(--theme-card)',
    boxShadow: 'var(--theme-card-shadow)',
  }
}

const cabecera: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const antetitulo: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: '.18em',
  color: 'var(--theme-primary)',
}

const titulo: CSSProperties = {
  display: 'block',
  margin: '6px 0 4px',
  fontSize: 21,
  fontWeight: 900,
  letterSpacing: '-.025em',
  color: '#ffffff',
}

const recuento: CSSProperties = {
  fontSize: 12,
  color: 'rgba(255,255,255,.6)',
  marginBottom: 20,
}

const cerrar: CSSProperties = {
  flex: '0 0 auto',
  width: 30,
  height: 30,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  borderRadius: 10,
  border: 0,
  background: 'var(--theme-card-inset)',
  color: 'rgba(255,255,255,.7)',
  fontSize: 17,
  fontWeight: 900,
  lineHeight: 1,
  cursor: 'pointer',
}

// Entre DOS lineas finas, no solo con una arriba: la fila del permiso es lo
// unico accionable de la tarjeta y asi queda enmarcada sin necesitar caja.
const fila: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '16px 0',
  borderTop: `1px solid var(--theme-hairline)`,
  borderBottom: `1px solid var(--theme-hairline)`,
}

const icono: CSSProperties = {
  flex: '0 0 auto',
  fontSize: 26,
  lineHeight: 1,
  width: 30,
  textAlign: 'center',
}

const queEs: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  lineHeight: 1.2,
  color: '#ffffff',
}

// 12px, no 10.5: esto se lee de pie, en la calle, antes de salir a andar.
const paraQue: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.4,
  marginTop: 3,
  color: 'rgba(255,255,255,.6)',
}

const falloTexto: CSSProperties = {
  color: 'rgba(253,224,71,.92)',
}

// Naranja PLANO con texto oscuro: el degradado se leia apagado sobre la
// tarjeta solida. Es la accion que se espera que pulses, tiene que cantar.
const boton: CSSProperties = {
  flex: '0 0 auto',
  minHeight: 40,
  padding: '0 16px',
  borderRadius: 11,
  border: 0,
  background: 'var(--theme-primary)',
  color: 'var(--theme-card)',
  fontSize: 12.5,
  fontWeight: 900,
  letterSpacing: '.02em',
  cursor: 'pointer',
}

const botonSecundario: CSSProperties = {
  width: '100%',
  minHeight: 44,
  borderRadius: 12,
  border: `1px solid var(--theme-card-inset)`,
  background: 'transparent',
  color: 'rgba(255,255,255,.78)',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
}

// Sin caja ni borde: es una salida, no una accion que se recomiende.
const seguirSinEso: CSSProperties = {
  marginTop: 16,
  width: '100%',
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'rgba(255,255,255,.45)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const hechoFila: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 7,
  margin: '17px 0 20px',
}

// Verde universal de "hecho", no --theme-done: en fuego ese token es naranja
// terracota, y "conseguido" leido en el color de la marca no se distingue de
// lo que aun falta. Es una señal, no decoracion. Mismo criterio que el punto
// de "EN LINEA" de la clasificacion.
const hechoEtiqueta: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: '#7ecb8f',
  background: 'rgba(34,197,94,.13)',
  borderRadius: 7,
  padding: '6px 10px',
}

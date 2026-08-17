import { QRCodeSVG } from 'qrcode.react'

/**
 * La tarjeta QR de SAGA. Una sola definición, para todo.
 *
 * Antes había cuatro sitios distintos generando el mismo código —la hoja de
 * impresión, el estudio de tarjetas, el editor de nodo y el panel de tarjetas
 * físicas— cada uno con sus ajustes. Lo que se imprimía y lo que se veía en
 * pantalla podían no ser el mismo código, y de hecho no lo eran.
 *
 * Lo que se aprendió en la ruta de el monte, y que esta pieza garantiza:
 *
 *  1. NADA encima del código. El logo centrado tapaba la información de formato
 *     (fila 8) y las pautas de temporización, que NO tienen corrección de
 *     errores: por bien que se imprimiera, ningún escáner del mundo podía
 *     leerlo. Hizo falta un motor de visión de 11 MB para reconocer las
 *     pegatinas por comparación de matrices. La marca va en el marco, fuera.
 *
 *  2. Zona de silencio de 4 módulos. Es lo que pide la norma y el generador
 *     traía CERO por defecto: el código salía pegado al borde de la tarjeta y
 *     el decodificador no podía delimitarlo. Es la explicación más probable de
 *     que a unos móviles les entrara y a otros no.
 *
 *  3. Negro sobre blanco. El verde de marca reduce el contraste justo donde
 *     menos sobra: papel mojado, sombra de pinar y cámaras de gama baja.
 *
 *  4. Tamaño físico en milímetros al imprimir, no en píxeles. En píxeles el
 *     tamaño real depende del navegador y de la impresora, y una pegatina
 *     pequeña de más no se lee a un brazo de distancia.
 */

/** Módulos de zona de silencio. La norma dice 4; el generador traía 0. */
const ZONA_DE_SILENCIO = 4

/**
 * Lado del código impreso, sin contar la zona de silencio.
 *
 * 38 mm deja cada módulo en ~1,3 mm en un código de versión 1, que se lee de
 * sobra a un brazo de distancia y con luz mala. Bajar de 25 mm es pedir
 * problemas en el monte.
 */
const LADO_IMPRESO_MM = 38

export type SagaQrCardData = {
  /** Lo que lleva dentro el código: SAGA_01, SAGA_02… */
  payload: string
  /** Lo que se lee debajo: el nombre del nodo. */
  label: string
}

/**
 * El código, y sólo el código.
 *
 * `level="H"` aguanta un 30 % de daño: una pegatina en el monte se moja, se
 * raya y se llena de polen. Con estos payloads tan cortos sale igualmente un
 * código de versión 1, así que la corrección alta no cuesta nada de tamaño.
 */
export function SagaQrCode({
  payload,
  size = 160,
  title,
  estirar = false,
}: {
  payload: string
  size?: number
  title?: string
  /** Ocupar todo el contenedor, para que el tamaño real lo mande el CSS. */
  estirar?: boolean
}) {
  return (
    <QRCodeSVG
      value={payload}
      size={size}
      level="H"
      marginSize={ZONA_DE_SILENCIO}
      bgColor="#ffffff"
      fgColor="#000000"
      title={title || `Código SAGA ${payload}`}
      style={estirar ? { width: '100%', height: '100%', display: 'block' } : undefined}
    />
  )
}

/**
 * La tarjeta entera, lista para pegar en una piedra.
 *
 * El payload va impreso debajo a propósito: es el código de respaldo que el
 * jugador puede teclear si la cámara no colabora, y tenerlo delante ahorra
 * tener que llamar por teléfono desde el monte.
 */
export function SagaQrCard({
  data,
  paraImprimir = false,
}: {
  data: SagaQrCardData
  /** Con `true` el tamaño va en milímetros, no en píxeles. */
  paraImprimir?: boolean
}) {
  const ladoCodigo = paraImprimir ? `${LADO_IMPRESO_MM}mm` : '160px'

  return (
    <div
      className="saga-qr-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: paraImprimir ? '2mm' : '10px',
        padding: paraImprimir ? '4mm' : '14px',
        background: '#ffffff',
        color: '#000000',
        border: '1px solid #000000',
        borderRadius: paraImprimir ? '2mm' : '10px',
        width: 'fit-content',
        breakInside: 'avoid',
      }}
    >
      {/* La marca va AQUÍ, encima y fuera del código. Nunca sobre los módulos. */}
      <div
        style={{
          fontFamily: 'system-ui, Arial, sans-serif',
          fontWeight: 800,
          fontSize: paraImprimir ? '3mm' : '11px',
          letterSpacing: '0.22em',
          color: '#00713f',
        }}
      >
        SAGA
      </div>

      {/* El SVG se estira al contenedor: así el tamaño real lo manda el
          milímetro de aquí y no el píxel del generador. */}
      <div style={{ width: ladoCodigo, height: ladoCodigo }}>
        <SagaQrCode payload={data.payload} size={512} title={data.label} estirar />
      </div>

      <div
        style={{
          fontFamily: 'system-ui, Arial, sans-serif',
          fontWeight: 700,
          fontSize: paraImprimir ? '3.4mm' : '13px',
          textAlign: 'center',
          maxWidth: ladoCodigo,
          overflowWrap: 'anywhere',
        }}
      >
        {data.label}
      </div>

      {/* El código de respaldo, escrito. Si la cámara falla, se teclea. */}
      <div
        style={{
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: paraImprimir ? '3mm' : '12px',
          letterSpacing: '0.1em',
          color: '#333333',
        }}
      >
        {data.payload}
      </div>
    </div>
  )
}

export { LADO_IMPRESO_MM, ZONA_DE_SILENCIO }

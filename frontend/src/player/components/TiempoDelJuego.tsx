import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { fetchConLimite } from '../offline/peticiones'

/**
 * El tiempo en la zona de la misión (`/api/tiempo`, ver
 * backend/app/runtime/integraciones/tiempo.py), servido por MeteoCatoira:
 *
 *  - `TiempoDelJuego`: un chip discreto en el mapa (cielo, temperatura, viento)
 *    y un aviso si viene lluvia fuerte, tormenta o viento fuerte.
 *  - `PrevisionDePartida`: las próximas horas, para la pantalla de carga.
 *
 * El servicio es de MeteoCatoira también fuera de su zona (fuera de Galicia):
 * allí se sirve la previsión de la zona de la misión, y la marca sigue siendo
 * la protagonista. La previsión por horas sale de Open-Meteo, y se dice en
 * pequeño.
 *
 * Con la piel de SAGA, no una propia: iconos de trazo (PlayerIcons.tsx, nada
 * de emoji, que Óscar ya rechazó en los botones), tarjeta sólida del tema como
 * la de permisos y el chip con el mismo halo y alto que los botones redondos.
 *
 * Sin red se enseña lo último guardado en el móvil, con su hora. Si el servidor
 * no tiene tiempo (sin fuentes configuradas), no se enseña nada.
 */

type Cielo = 'despejado' | 'nubes' | 'niebla' | 'llovizna' | 'lluvia' | 'nieve' | 'tormenta'

interface Hora {
  hora: number
  temp: number | null
  cielo: Cielo | null
  prob_lluvia: number | null
  lluvia_mm: number | null
  racha: number | null
}

interface AvisoDelTiempo {
  tipo: 'lluvia' | 'tormenta' | 'viento'
  en_min: number
}

interface Tiempo {
  disponible: true
  actualizado: number
  fuente: string
  ahora: {
    temp: number | null
    viento: number | null
    racha: number | null
    dir: number | null
    cielo: Cielo | null
  } | null
  horas: Hora[]
  avisos: AvisoDelTiempo[]
}

const CLAVE = 'saga_tiempo_v1'
const CADA_MS = 10 * 60_000
/** Pasado esto el chip enseña la hora del dato: puede no ser lo que hace ahora. */
const VIEJO_MS = 30 * 60_000
/** Un aviso de hace más de hora y media ya no dice nada útil. */
const AVISOS_CADUCAN_MS = 90 * 60_000
/** Por debajo de esto la probabilidad de lluvia no se enseña en la previsión. */
const LLUVIA_QUE_SE_DICE = 20

const TEXTOS = {
  es: {
    rumbos: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
    lluvia: (min: number) =>
      min <= 5 ? 'Lluvia fuerte ya: busca refugio' : `Lluvia en ${min} min: busca refugio`,
    tormenta: (min: number) =>
      min <= 5
        ? 'Tormenta encima: baja de zonas altas y busca refugio'
        : `Tormenta en ${min} min: baja de zonas altas y busca refugio`,
    viento: (min: number) =>
      min <= 5
        ? 'Viento fuerte: cuidado en zonas altas'
        : `Viento fuerte en ${min} min: cuidado en zonas altas`,
    entendido: 'Entendido',
    aLas: (hora: string) => `a las ${hora}`,
    prevision: 'Tiempo para la partida',
    datoDe: (hora: string) => `Datos de las ${hora}`,
    chip: 'Tiempo en la zona de la misión',
    servidoPor: 'servido por',
    // La previsión por horas es de Open-Meteo: se dice, en pequeño.
    datosDe: 'datos de Open-Meteo',
    etiqueta: {
      lluvia: (min: number) => (min <= 5 ? 'Lluvia fuerte ya' : `Lluvia en ${min} min`),
      tormenta: (min: number) => (min <= 5 ? 'Tormenta encima' : `Tormenta en ${min} min`),
      viento: (min: number) => (min <= 5 ? 'Viento fuerte' : `Viento fuerte en ${min} min`),
    },
  },
  gl: {
    rumbos: ['N', 'NE', 'L', 'SL', 'S', 'SO', 'O', 'NO'],
    lluvia: (min: number) =>
      min <= 5 ? 'Choiva forte xa: busca refuxio' : `Choiva en ${min} min: busca refuxio`,
    tormenta: (min: number) =>
      min <= 5
        ? 'Treboada enriba: baixa das zonas altas e busca refuxio'
        : `Treboada en ${min} min: baixa das zonas altas e busca refuxio`,
    viento: (min: number) =>
      min <= 5
        ? 'Vento forte: coidado nas zonas altas'
        : `Vento forte en ${min} min: coidado nas zonas altas`,
    entendido: 'Entendido',
    aLas: (hora: string) => `ás ${hora}`,
    prevision: 'Tempo para a partida',
    datoDe: (hora: string) => `Datos das ${hora}`,
    chip: 'Tempo na zona da misión',
    servidoPor: 'servido por',
    datosDe: 'datos de Open-Meteo',
    etiqueta: {
      lluvia: (min: number) => (min <= 5 ? 'Choiva forte xa' : `Choiva en ${min} min`),
      tormenta: (min: number) => (min <= 5 ? 'Treboada enriba' : `Treboada en ${min} min`),
      viento: (min: number) => (min <= 5 ? 'Vento forte' : `Vento forte en ${min} min`),
    },
  },
  en: {
    rumbos: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    lluvia: (min: number) =>
      min <= 5 ? 'Heavy rain now: find shelter' : `Rain in ${min} min: find shelter`,
    tormenta: (min: number) =>
      min <= 5
        ? 'Storm overhead: get off high ground and find shelter'
        : `Storm in ${min} min: get off high ground and find shelter`,
    viento: (min: number) =>
      min <= 5
        ? 'Strong wind: take care on high ground'
        : `Strong wind in ${min} min: take care on high ground`,
    entendido: 'Got it',
    aLas: (hora: string) => `at ${hora}`,
    prevision: 'Weather for the game',
    datoDe: (hora: string) => `Data from ${hora}`,
    chip: 'Weather in the mission area',
    servidoPor: 'served by',
    datosDe: 'data from Open-Meteo',
    etiqueta: {
      lluvia: (min: number) => (min <= 5 ? 'Heavy rain now' : `Rain in ${min} min`),
      tormenta: (min: number) => (min <= 5 ? 'Storm overhead' : `Storm in ${min} min`),
      viento: (min: number) => (min <= 5 ? 'Strong wind' : `Strong wind in ${min} min`),
    },
  },
}

/* ------------------------------------------------------------------ *
 * Iconos de trazo, como los de PlayerIcons.tsx (1.8 px, sin relleno).
 * Sólo dos toques de color, para leerlos de un vistazo: el sol y el rayo
 * en ámbar, el agua en el azul claro del tema.
 * ------------------------------------------------------------------ */

const AMBAR = '#fcd34d'
const AGUA = 'rgb(var(--theme-info-soft))'

const trazo = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Nube alta, para las que llevan algo debajo (lluvia, nieve, rayo). */
const NUBE_ALTA = 'M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25'

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} {...trazo} aria-hidden="true" style={{ flex: 'none' }}>
      {children}
    </svg>
  )
}

function IconoCielo({ cielo, size = 20 }: { cielo: Cielo | null; size?: number }) {
  switch (cielo) {
    case 'despejado':
      return (
        <Svg size={size}>
          <g stroke={AMBAR}>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
          </g>
        </Svg>
      )
    case 'nubes':
      return (
        <Svg size={size}>
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z" />
        </Svg>
      )
    case 'niebla':
      return (
        <Svg size={size}>
          <path d="M4 8h16M2.5 12h19M5 16h14M8 20h8" />
        </Svg>
      )
    case 'llovizna':
      return (
        <Svg size={size}>
          <path d={NUBE_ALTA} />
          <path stroke={AGUA} d="M8 19v1.5M12 21v1.5M16 19v1.5M8 14v1.5M16 14v1.5M12 16v1.5" />
        </Svg>
      )
    case 'lluvia':
      return (
        <Svg size={size}>
          <path d={NUBE_ALTA} />
          <path stroke={AGUA} d="M8 13v8M12 15v8M16 13v8" />
        </Svg>
      )
    case 'nieve':
      return (
        <Svg size={size}>
          <path d={NUBE_ALTA} />
          <path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01" strokeWidth={2.6} />
        </Svg>
      )
    case 'tormenta':
      return (
        <Svg size={size}>
          <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" />
          <path stroke={AMBAR} d="M13 11l-4 6h6l-4 6" />
        </Svg>
      )
    default:
      return (
        <Svg size={size}>
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0Z" />
        </Svg>
      )
  }
}

function IconoViento({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2" />
    </Svg>
  )
}

function IconoAviso({ tipo, size = 16 }: { tipo: AvisoDelTiempo['tipo']; size?: number }) {
  return tipo === 'viento' ? (
    <IconoViento size={size} />
  ) : (
    <IconoCielo cielo={tipo} size={size} />
  )
}

/** «MeteoCatoira», con su marca: «Meteo» en el color del tema y «Catoira» en blanco. */
function Marca() {
  return (
    <span
      style={{
        fontSize: 13.5,
        fontWeight: 900,
        letterSpacing: '-.01em',
        color: '#ffffff',
        whiteSpace: 'nowrap',
      }}
      translate="no"
    >
      <span style={{ color: 'var(--theme-primary)' }}>Meteo</span>Catoira
    </span>
  )
}

function leerGuardado(): Tiempo | null {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) || 'null')
    return crudo && crudo.disponible === true && typeof crudo.actualizado === 'number'
      ? (crudo as Tiempo)
      : null
  } catch {
    return null
  }
}

function useTiempo(): Tiempo | null {
  const [tiempo, setTiempo] = useState<Tiempo | null>(leerGuardado)

  useEffect(() => {
    let vivo = true
    const pedir = async () => {
      try {
        const respuesta = await fetchConLimite(
          '/api/tiempo',
          { cache: 'no-store', credentials: 'same-origin' },
          8000
        )
        if (!respuesta.ok || !vivo) return
        const datos = await respuesta.json()
        if (!vivo) return
        if (datos?.disponible === true) {
          setTiempo(datos as Tiempo)
          try {
            localStorage.setItem(CLAVE, JSON.stringify(datos))
          } catch {
            /* sin sitio: se queda sólo en memoria */
          }
        } else {
          // El servidor dice que no hay tiempo (apagado o sin zona): no se enseña lo viejo.
          setTiempo(null)
          try {
            localStorage.removeItem(CLAVE)
          } catch {
            /* nada */
          }
        }
      } catch {
        /* sin red: vale lo guardado */
      }
    }
    void pedir()
    const id = window.setInterval(() => void pedir(), CADA_MS)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [])

  return tiempo
}

function useTextos() {
  const { locale } = useI18n()
  return TEXTOS[locale === 'gl' || locale === 'en' ? locale : 'es']
}

function horaCorta(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function rumbo(grados: number | null | undefined, rumbos: string[]) {
  if (grados === null || grados === undefined || !Number.isFinite(grados)) return ''
  return rumbos[Math.round((((grados % 360) + 360) % 360) / 45) % 8]
}

/** «12 km/h SO», o «12–30 km/h SO» si las rachas pasan bastante del viento medio. */
function textoDeViento(
  a: { viento: number | null; racha: number | null; dir: number | null },
  rumbos: string[]
) {
  if (a.viento === null) return ''
  const racha = a.racha !== null && a.racha > a.viento + 5 ? `–${Math.round(a.racha)}` : ''
  return `${Math.round(a.viento)}${racha} km/h ${rumbo(a.dir, rumbos)}`.trim()
}

/** Los avisos que siguen valiendo, con los minutos contados desde AHORA. */
function avisosVigentes(tiempo: Tiempo, ahora: number): AvisoDelTiempo[] {
  const pasado = ahora - tiempo.actualizado
  if (pasado > AVISOS_CADUCAN_MS) return []
  return (tiempo.avisos || []).map((aviso) => ({
    ...aviso,
    en_min: Math.max(0, Math.round(aviso.en_min - pasado / 60_000)),
  }))
}

export function TiempoDelJuego({ mobile }: { mobile: boolean }) {
  const tiempo = useTiempo()
  const tx = useTextos()
  const [cerrados, setCerrados] = useState<string[]>([])
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  if (!tiempo) return null

  const actual = tiempo.ahora
  const viejo = ahora - tiempo.actualizado > VIEJO_MS
  const avisos = avisosVigentes(tiempo, ahora).filter(
    (a) => !cerrados.includes(`${a.tipo}:${tiempo.actualizado}`)
  )
  const chip =
    actual && actual.temp !== null ? (
      <div style={estiloChip(mobile)} role="status" aria-label={tx.chip} data-saga-tiempo="chip">
        <IconoCielo cielo={actual.cielo} size={18} />
        <b style={chipTemp}>{Math.round(actual.temp)}°</b>
        {actual.viento !== null ? (
          <span style={{ ...chipViento, ...chipSeparado }}>
            <IconoViento size={14} />
            {textoDeViento(actual, tx.rumbos)}
          </span>
        ) : null}
        {viejo ? (
          <span style={{ ...chipViento, ...chipSeparado }}>
            {tx.aLas(horaCorta(tiempo.actualizado))}
          </span>
        ) : null}
      </div>
    ) : null

  const aviso = avisos[0]
  const banner = aviso ? (
    <div style={estiloAviso(mobile)} role="alert" data-saga-tiempo="aviso">
      <span style={avisoIcono}>
        <IconoAviso tipo={aviso.tipo} size={18} />
      </span>
      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <strong style={{ fontSize: 13.5, lineHeight: 1.3, color: '#ffffff' }}>
          {tx[aviso.tipo](aviso.en_min)}
        </strong>
        {viejo ? (
          <span style={{ fontSize: 11.5, color: 'rgb(var(--theme-line))' }}>
            {tx.datoDe(horaCorta(tiempo.actualizado))}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        style={botonAviso}
        onClick={() => setCerrados((lista) => [...lista, `${aviso.tipo}:${tiempo.actualizado}`])}
      >
        {tx.entendido}
      </button>
    </div>
  ) : null

  // Sin portal: dentro de la capa del jugador, para quedar SIEMPRE por debajo de
  // la carga, la cámara, las hojas, los minijuegos y los menús (que van encima).
  return (
    <>
      {chip}
      {banner}
    </>
  )
}

export function PrevisionDePartida() {
  const tiempo = useTiempo()
  const tx = useTextos()
  if (!tiempo || !tiempo.horas?.length) return null
  const avisos = avisosVigentes(tiempo, Date.now())
  const actual = tiempo.ahora
  const conLluvia = tiempo.horas.some((h) => (h.prob_lluvia ?? 0) >= LLUVIA_QUE_SE_DICE)
  const viejo = Date.now() - tiempo.actualizado > VIEJO_MS

  const horas = tiempo.horas.map((hora) => (
    <div key={hora.hora} style={celda}>
      <span style={horaEstilo}>{new Date(hora.hora).getHours()}h</span>
      <IconoCielo cielo={hora.cielo} size={22} />
      <b style={tempEstilo}>{hora.temp !== null ? `${Math.round(hora.temp)}°` : '—'}</b>
      {hora.racha !== null ? (
        <span style={vientoHora}>
          <IconoViento size={10} />
          {Math.round(hora.racha)}
        </span>
      ) : null}
      {/* La probabilidad de lluvia sólo cuando dice algo: un 0 % en cada hora es ruido. */}
      {conLluvia ? (
        <span style={lluviaEstilo}>
          {(hora.prob_lluvia ?? 0) >= LLUVIA_QUE_SE_DICE
            ? `${Math.round(hora.prob_lluvia ?? 0)}%`
            : ''}
        </span>
      ) : null}
    </div>
  ))

  const etiquetas = avisos.length ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {avisos.map((aviso) => (
        <span key={aviso.tipo} style={etiquetaAviso} data-saga-tiempo-aviso={aviso.tipo}>
          <IconoAviso tipo={aviso.tipo} size={13} />
          {tx.etiqueta[aviso.tipo](aviso.en_min)}
        </span>
      ))}
    </div>
  ) : null

  const ahoraTexto =
    actual && actual.temp !== null ? (
      <span style={ahoraEstilo}>
        <IconoCielo cielo={actual.cielo} size={22} />
        <b style={{ fontSize: 20, fontWeight: 900 }}>{Math.round(actual.temp)}°</b>
      </span>
    ) : null

  const pie = (
    <span style={atribucion} data-saga-tiempo="atribucion">
      {tx.datosDe}
      {viejo ? ` · ${tx.datoDe(horaCorta(tiempo.actualizado))}` : ''}
    </span>
  )

  return (
    <section style={tarjeta} data-saga-tiempo="prevision" aria-label={tx.prevision}>
      <div style={cabecera}>
        <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <span style={rotulo}>{tx.prevision}</span>
          <span style={servido} data-saga-tiempo="marca">
            {tx.servidoPor} <Marca />
          </span>
        </div>
        {ahoraTexto}
      </div>

      <div style={{ ...rejilla, ...lineaArriba, gridTemplateColumns: `repeat(${tiempo.horas.length}, 1fr)` }}>
        {horas}
      </div>

      {etiquetas}
      {pie}
    </section>
  )
}

/**
 * Como los botones redondos del mapa (playerAppEstilos.ts): sólido, sin borde,
 * el mismo halo y 38 px de alto. A la derecha, bajo la barra del nodo.
 */
function estiloChip(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    // Debajo de la barra del nodo, a la derecha: abajo choca con los botones del mapa.
    // Alineado con el filo derecho de la barra del nodo.
    right: mobile ? 20 : 16,
    top: 'calc(env(safe-area-inset-top) + 68px)',
    zIndex: 600, // por debajo de la barra de arriba (1200) y de todo lo que se abre
    boxSizing: 'border-box',
    height: 38,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 13px 0 11px',
    borderRadius: 'var(--theme-radius-pill)',
    fontSize: 12.5,
    fontWeight: 700,
    lineHeight: 1,
    color: '#f1f5f9',
    background: 'var(--theme-card)',
    boxShadow: '0 4px 12px rgba(0,0,0,.5)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  }
}

const chipTemp: CSSProperties = { fontSize: 15, fontWeight: 900, color: '#ffffff' }

const chipViento: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  color: 'rgb(var(--theme-line-soft))',
  fontWeight: 700,
}

const chipSeparado: CSSProperties = {
  marginLeft: 2,
  paddingLeft: 8,
  borderLeft: '1px solid var(--theme-hairline)',
  height: 16,
}

function estiloAviso(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    // Debajo del chip, que sigue a la vista con el aviso abierto.
    top: 'calc(env(safe-area-inset-top) + 114px)',
    left: mobile ? 20 : 12,
    right: mobile ? 20 : 12,
    zIndex: 1150, // por debajo de las hojas (4000+), la cámara y la carga
    margin: '0 auto',
    maxWidth: mobile ? 380 : 440,
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 10,
    padding: '10px 10px 10px 12px',
    borderRadius: 'var(--theme-radius-card)',
    background: 'var(--theme-card)',
    border: '1px solid rgba(250, 204, 21, .45)',
    boxShadow: 'var(--theme-card-shadow)',
  }
}

const avisoIcono: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  color: '#fde68a',
  background: 'rgba(250, 204, 21, .14)',
}

const botonAviso: CSSProperties = {
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 12,
  border: '1px solid var(--theme-hairline)',
  background: 'transparent',
  color: '#ffffff',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
}

/** La misma tarjeta que la de permisos (FieldPrepPanel): sólida, filo fino, radio del tema. */
const tarjeta: CSSProperties = {
  boxSizing: 'border-box',
  width: 'min(100%, 340px)',
  display: 'grid',
  gap: 12,
  padding: '14px 16px 12px',
  borderRadius: 'var(--theme-radius-card)',
  color: '#f8fafc',
  background: 'var(--theme-card)',
  border: 'var(--theme-border-w) solid var(--theme-hairline)',
  boxShadow: 'var(--theme-card-shadow)',
  textAlign: 'left',
}

const cabecera: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
}

/** Como «ANTES DE SALIR» en la tarjeta de permisos. */
const rotulo: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 900,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  color: 'var(--theme-primary)',
}

const servido: CSSProperties = {
  display: 'inline-flex',
  whiteSpace: 'nowrap',
  alignItems: 'baseline',
  gap: 5,
  fontSize: 12,
  fontWeight: 600,
  color: 'rgb(var(--theme-line))',
}

const ahoraEstilo: CSSProperties = {
  display: 'grid',
  gridAutoFlow: 'column',
  alignItems: 'center',
  gap: 5,
  justifyItems: 'end',
  color: '#ffffff',
  whiteSpace: 'nowrap',
}

const lineaArriba: CSSProperties = {
  paddingTop: 12,
  borderTop: '1px solid var(--theme-hairline)',
}

const rejilla: CSSProperties = { display: 'grid', gap: 2 }

const celda: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 4,
  minWidth: 0,
  color: '#f1f5f9',
}

const horaEstilo: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'rgb(var(--theme-line))',
  fontVariantNumeric: 'tabular-nums',
}

const tempEstilo: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: '#ffffff',
  fontVariantNumeric: 'tabular-nums',
}

const vientoHora: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  fontSize: 10.5,
  fontWeight: 700,
  color: 'rgb(var(--theme-line))',
  fontVariantNumeric: 'tabular-nums',
}

const lluviaEstilo: CSSProperties = {
  minHeight: 13,
  fontSize: 10.5,
  fontWeight: 800,
  color: AGUA,
  fontVariantNumeric: 'tabular-nums',
}

const etiquetaAviso: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px 4px 8px',
  borderRadius: 'var(--theme-radius-pill)',
  fontSize: 11.5,
  fontWeight: 800,
  color: '#fde68a',
  background: 'rgba(250, 204, 21, .12)',
  border: '1px solid rgba(250, 204, 21, .35)',
}

const atribucion: CSSProperties = {
  justifySelf: 'end',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'rgba(var(--theme-line), .6)',
}

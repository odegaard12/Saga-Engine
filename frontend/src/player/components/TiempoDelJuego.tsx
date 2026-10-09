import { useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { fetchConLimite } from '../offline/peticiones'

/**
 * El tiempo en la zona de la misión (`/api/tiempo`, ver
 * backend/app/runtime/integraciones/tiempo.py):
 *
 *  - `TiempoDelJuego`: un chip discreto en el mapa (cielo, temperatura, viento)
 *    y un aviso si viene lluvia fuerte, tormenta o viento fuerte.
 *  - `PrevisionDePartida`: las próximas horas, para la pantalla de carga.
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

const ICONO: Record<Cielo, string> = {
  despejado: '☀️',
  nubes: '☁️',
  niebla: '🌫️',
  llovizna: '🌦️',
  lluvia: '🌧️',
  nieve: '❄️',
  tormenta: '⛈️',
}

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
    // La previsión por horas es de Open-Meteo; lo medido, de la estación.
    por: 'por MeteoCatoira y Open-Meteo',
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
    por: 'por MeteoCatoira e Open-Meteo',
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
    por: 'by MeteoCatoira and Open-Meteo',
    etiqueta: {
      lluvia: (min: number) => (min <= 5 ? 'Heavy rain now' : `Rain in ${min} min`),
      tormenta: (min: number) => (min <= 5 ? 'Storm overhead' : `Storm in ${min} min`),
      viento: (min: number) => (min <= 5 ? 'Strong wind' : `Strong wind in ${min} min`),
    },
  },
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
        <span aria-hidden="true" style={{ fontSize: 15 }}>
          {actual.cielo ? ICONO[actual.cielo] : '🌡️'}
        </span>
        <b style={{ fontSize: 14, fontWeight: 900 }}>{Math.round(actual.temp)}°</b>
        {actual.viento !== null ? (
          <span style={chipSecundario}>💨 {textoDeViento(actual, tx.rumbos)}</span>
        ) : null}
        {viejo ? (
          <span style={chipSecundario}>{tx.aLas(horaCorta(tiempo.actualizado))}</span>
        ) : null}
      </div>
    ) : null

  const aviso = avisos[0]
  const banner = aviso ? (
    <div style={estiloAviso(mobile)} role="alert" data-saga-tiempo="aviso">
      <strong style={{ fontSize: 14 }}>
        {aviso.tipo === 'tormenta' ? '⛈️ ' : aviso.tipo === 'lluvia' ? '🌧️ ' : '💨 '}
        {tx[aviso.tipo](aviso.en_min)}
      </strong>
      {viejo ? (
        <span style={{ fontSize: 11.5, opacity: 0.8 }}>
          {tx.datoDe(horaCorta(tiempo.actualizado))}
        </span>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          style={botonAviso}
          onClick={() => setCerrados((lista) => [...lista, `${aviso.tipo}:${tiempo.actualizado}`])}
        >
          {tx.entendido}
        </button>
      </div>
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

  return (
    <section style={tarjeta} data-saga-tiempo="prevision" aria-label={tx.prevision}>
      <div style={cabecera}>
        <span style={rotulo}>{tx.prevision}</span>
        {actual && actual.viento !== null ? (
          <span style={vientoAhora}>💨 {textoDeViento(actual, tx.rumbos)}</span>
        ) : null}
      </div>

      <div style={{ ...rejilla, gridTemplateColumns: `repeat(${tiempo.horas.length}, 1fr)` }}>
        {tiempo.horas.map((hora) => (
          <div key={hora.hora} style={celda}>
            <span style={horaEstilo}>{new Date(hora.hora).getHours()}h</span>
            <span aria-hidden="true" style={{ fontSize: 19, lineHeight: 1.1 }}>
              {hora.cielo ? ICONO[hora.cielo] : '·'}
            </span>
            <b style={tempEstilo}>{hora.temp !== null ? `${Math.round(hora.temp)}°` : '—'}</b>
            {/* La probabilidad de lluvia sólo cuando dice algo: un 0 % en cada hora es ruido. */}
            {conLluvia ? (
              <span style={lluviaEstilo}>
                {(hora.prob_lluvia ?? 0) >= LLUVIA_QUE_SE_DICE ? `${Math.round(hora.prob_lluvia ?? 0)}%` : ''}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {avisos.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {avisos.map((aviso) => (
            <span key={aviso.tipo} style={etiquetaAviso} data-saga-tiempo-aviso={aviso.tipo}>
              {aviso.tipo === 'tormenta' ? '⛈️' : aviso.tipo === 'lluvia' ? '🌧️' : '💨'}{' '}
              {tx.etiqueta[aviso.tipo](aviso.en_min)}
            </span>
          ))}
        </div>
      ) : null}

      <span style={atribucion} data-saga-tiempo="atribucion">
        {tx.por}
        {Date.now() - tiempo.actualizado > VIEJO_MS
          ? ` · ${tx.datoDe(horaCorta(tiempo.actualizado))}`
          : ''}
      </span>
    </section>
  )
}

function estiloChip(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    // Debajo de la barra del nodo, a la derecha: abajo choca con los botones del mapa.
    right: mobile ? 10 : 16,
    top: 'calc(env(safe-area-inset-top) + 68px)',
    zIndex: 600, // por debajo de la barra de arriba (1200) y de todo lo que se abre
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px 5px 9px',
    borderRadius: 'var(--theme-radius-pill)',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.2,
    color: '#f8fafc',
    // Sólida, como las tarjetas del jugador: sobre el satélite se lee de un vistazo.
    background: 'var(--theme-card)',
    border: 'var(--theme-border-w) solid var(--theme-hairline)',
    boxShadow: '0 6px 18px rgba(var(--theme-ink-deep), .45)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  }
}

const chipSecundario: CSSProperties = {
  paddingLeft: 7,
  borderLeft: '1px solid var(--theme-hairline)',
  color: 'rgb(var(--theme-line-soft))',
  fontWeight: 600,
}

function estiloAviso(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    // Debajo del chip, que sigue a la vista con el aviso abierto.
    top: 'calc(env(safe-area-inset-top) + 104px)',
    left: 12,
    right: 12,
    zIndex: 1150, // por debajo de las hojas (4000+), la cámara y la carga
    margin: '0 auto',
    maxWidth: mobile ? 380 : 440,
    display: 'grid',
    gap: 6,
    padding: '12px 14px',
    borderRadius: 'var(--theme-radius-card)',
    color: '#fef3c7',
    background: 'var(--theme-card)',
    border: '1px solid rgba(250, 204, 21, .6)',
    boxShadow: 'var(--theme-card-shadow)',
  }
}

const botonAviso: CSSProperties = {
  minHeight: 36,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid rgba(250, 204, 21, .5)',
  background: 'transparent',
  color: '#fde68a',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}

const tarjeta: CSSProperties = {
  boxSizing: 'border-box',
  width: 'min(100%, 320px)',
  display: 'grid',
  gap: 10,
  padding: '12px 14px 10px',
  borderRadius: 'var(--theme-radius-card)',
  color: '#f8fafc',
  background: 'var(--theme-card)',
  border: 'var(--theme-border-w) solid var(--theme-hairline)',
  boxShadow: 'var(--theme-card-shadow)',
  textAlign: 'left',
}

const cabecera: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 8,
}

const rotulo: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 900,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'rgb(var(--theme-line))',
}

const vientoAhora: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: 'rgb(var(--theme-line-soft))',
  whiteSpace: 'nowrap',
}

const rejilla: CSSProperties = { display: 'grid', gap: 2 }

const celda: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 3,
  minWidth: 0,
}

const horaEstilo: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'rgb(var(--theme-line))',
  fontVariantNumeric: 'tabular-nums',
}

const tempEstilo: CSSProperties = { fontSize: 14, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }

const lluviaEstilo: CSSProperties = {
  minHeight: 13,
  fontSize: 10.5,
  fontWeight: 800,
  color: 'rgb(var(--theme-info-soft))',
  fontVariantNumeric: 'tabular-nums',
}

const etiquetaAviso: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 9px',
  borderRadius: 'var(--theme-radius-pill)',
  fontSize: 11.5,
  fontWeight: 800,
  color: '#fde68a',
  background: 'rgba(250, 204, 21, .12)',
  border: '1px solid rgba(250, 204, 21, .35)',
}

const atribucion: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 600,
  color: 'rgba(var(--theme-line), .75)',
}

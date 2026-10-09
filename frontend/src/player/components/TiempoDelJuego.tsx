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
        <span aria-hidden="true">{actual.cielo ? ICONO[actual.cielo] : '🌡️'}</span>
        <b>{Math.round(actual.temp)}°</b>
        {actual.viento !== null ? (
          <span>
            💨 {Math.round(actual.viento)}
            {actual.racha !== null && actual.racha > actual.viento + 5
              ? `–${Math.round(actual.racha)}`
              : ''}{' '}
            km/h {rumbo(actual.dir, tx.rumbos)}
          </span>
        ) : null}
        {viejo ? (
          <span style={{ opacity: 0.75 }}>· {tx.aLas(horaCorta(tiempo.actualizado))}</span>
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

  return (
    <section style={estiloPrevision} data-saga-tiempo="prevision" aria-label={tx.prevision}>
      <strong style={{ fontSize: 13 }}>{tx.prevision}</strong>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {tiempo.horas.map((hora) => (
          <div key={hora.hora} style={estiloHora}>
            <span style={{ opacity: 0.8 }}>{new Date(hora.hora).getHours()}h</span>
            <span aria-hidden="true" style={{ fontSize: 18 }}>
              {hora.cielo ? ICONO[hora.cielo] : '·'}
            </span>
            <b>{hora.temp !== null ? `${Math.round(hora.temp)}°` : '—'}</b>
            <span style={{ color: '#93c5fd' }}>
              {hora.prob_lluvia !== null ? `${Math.round(hora.prob_lluvia)}%` : ''}
            </span>
          </div>
        ))}
      </div>
      {avisos.map((aviso) => (
        <span key={aviso.tipo} style={{ color: '#fde68a', fontSize: 12.5 }}>
          {tx[aviso.tipo](aviso.en_min)}
        </span>
      ))}
      {Date.now() - tiempo.actualizado > VIEJO_MS ? (
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          {tx.datoDe(horaCorta(tiempo.actualizado))}
        </span>
      ) : null}
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
    padding: '5px 10px',
    borderRadius: 999,
    fontSize: 12,
    lineHeight: 1.2,
    color: '#e2e8f0',
    background: 'rgba(var(--theme-ink), .72)',
    border: '1px solid rgba(255,255,255,.14)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  }
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
    borderRadius: 14,
    color: '#fef3c7',
    background: 'rgba(var(--theme-ink), .95)',
    border: '1px solid rgba(250, 204, 21, .65)',
    boxShadow: '0 12px 32px rgba(0,0,0,.45)',
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

const estiloPrevision: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 12,
  color: '#e2e8f0',
  background: 'rgba(var(--theme-ink), .55)',
  border: '1px solid rgba(255,255,255,.12)',
  textAlign: 'left',
}

const estiloHora: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 2,
  minWidth: 46,
  padding: '6px 4px',
  borderRadius: 10,
  background: 'rgba(255,255,255,.05)',
  fontSize: 12,
}

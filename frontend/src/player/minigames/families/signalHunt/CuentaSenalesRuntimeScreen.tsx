import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedSignalHuntMinigame } from '../../core/resolver'
import { haptics, sounds } from '../../../utils/haptics'
import { useI18n } from '../../../../i18n/useI18n'
import { useTextos } from '../../core/useTextos'
import { registrarEvidencia } from '../../../avance/evidencia'
import { partidasGuardadas } from '../../core/partidasGuardadas'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'

interface Props {
  resolved: ResolvedSignalHuntMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void>
  /** Posición que ya conoce la app (GPS real o modo debug). */
  appPosition?: { lat: number; lon: number } | null
}

type GpsState = 'idle' | 'requesting' | 'tracking' | 'denied' | 'unsupported' | 'missing_source'

type LatLon = { lat: number; lon: number }

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_PENALTY_MS = 30000

/**
 * Los intentos y la penalización de cada nodo, fuera del componente (como
 * `nodeClock`). Revisión 19/10: cerrar y reabrir la hoja desmontaba el juego y
 * devolvía los intentos y la penalización a cero: tras dos fallos bastaba con
 * cerrar y abrir para no pagar nunca. Se borra al acertar.
 */
interface PartidaGuardada {
  attempts: number
  penalty: number
  respuestas: number[]
  /** 5/11: por qué pregunta va (varias por nodo) y las respuestas dadas a cada una. */
  pregunta?: number
  porPregunta?: number[][]
}
type Pregunta = { question: string; hint_image_data_url: string; answer_hashes: string[]; salt: string }
const partidas = partidasGuardadas<PartidaGuardada>('cuenta_senales')

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function haversineMeters(a: LatLon, b: LatLon): number {
  const earthRadius = 6371000
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function formatMeters(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`
  return `${Math.round(value)} m`
}

function getStageCoordinate(stage: PlayerStage): LatLon | null {
  const raw = stage as unknown as Record<string, unknown>
  const location = raw.location as Record<string, unknown> | undefined
  const candidates = [
    { lat: raw.lat, lon: raw.lon },
    { lat: raw.latitude, lon: raw.longitude },
    { lat: location?.lat, lon: location?.lon },
  ]

  for (const item of candidates) {
    const lat = toNumber(item.lat)
    const lon = toNumber(item.lon)
    if (lat !== null && lon !== null) return { lat, lon }
  }

  return null
}

/**
 * sha256(salt + ':' + respuesta), la MISMA función del servidor
 * (hash_cuenta_senales_answer en minigames.py). Web Crypto (SubtleCrypto)
 * funciona sin red: es la razón por la que se pudo elegir hashear en el
 * cliente para un juego que tiene que jugarse offline -no hay ningún
 * endpoint que valide la respuesta en el servidor, igual que NINGÚN otro
 * minijuego de SAGA revalida su partida server-side (ver MINIGAME_OK_CODE):
 * el servidor solo acepta el aviso de "completado". El hash no es una
 * defensa fuerte -un entero pequeño se fuerza en milisegundos-, solo evita
 * que la respuesta se lea a ojo en DevTools o en el payload de red.
 */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const STYLES = `
.csn-root {
  width: 100%;
  margin-top: 8px;
  color: rgba(var(--a-texto-rgb, 255, 255, 255), .96);
}
.csn-card {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  padding: 18px 16px;
  background:
    radial-gradient(circle at 50% 0%, rgba(var(--a-texto-rgb, 255, 255, 255), .10), transparent 34%),
    linear-gradient(180deg, rgba(var(--a-texto-rgb, 255, 255, 255), .075), rgba(var(--a-texto-rgb, 255, 255, 255), .035));
  border: 1px solid rgba(var(--a-texto-rgb, 255, 255, 255), .12);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.13), 0 16px 42px rgba(0,0,0,.16);
  backdrop-filter: blur(22px) saturate(1.18);
  display: grid;
  gap: 14px;
  text-align: center;
}
.csn-overline {
  font-size: 10px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: rgba(var(--a-texto-rgb, 226, 238, 255), .54);
  font-weight: 800;
}
.csn-question {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.35;
}
.csn-hint {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: 14px;
}
.csn-display {
  font-size: 46px;
  font-weight: 900;
  letter-spacing: -0.02em;
  min-height: 56px;
}
.csn-attempts {
  font-size: 12px;
  font-weight: 700;
  color: rgba(var(--a-texto-rgb, 226, 238, 255), .6);
}
.csn-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.csn-key {
  min-height: 64px;
  border: none;
  border-radius: 16px;
  background: rgba(var(--a-texto-rgb, 255, 255, 255), .10);
  color: rgba(var(--a-texto-rgb, 255, 255, 255), .96);
  font-size: 26px;
  font-weight: 900;
  cursor: pointer;
}
.csn-key:active {
  background: rgba(var(--a-texto-rgb, 255, 255, 255), .2);
}
.csn-key.csn-clear {
  background: rgba(var(--a-error-rgb, 248, 113, 113), .18);
  color: var(--s-texto, #fecaca);
  font-size: 16px;
}
.csn-btn {
  width: 100%;
  min-height: 54px;
  border: none;
  border-radius: 18px;
  background: rgb(var(--theme-ok));
  color: var(--s-fondo, #022c22);
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(var(--theme-ok), .35);
}
.csn-btn:disabled {
  background: rgba(var(--a-texto-rgb, 255, 255, 255), .10);
  color: rgba(var(--a-texto-rgb, 255, 255, 255), .45);
  box-shadow: none;
  cursor: default;
}
.csn-status {
  font-size: 13px;
  font-weight: 700;
  color: rgba(var(--a-texto-rgb, 226, 238, 255), .78);
  line-height: 1.4;
}
.csn-status.csn-wrong {
  color: var(--a-error, #fca5a5);
}
.csn-status.csn-penalty {
  color: var(--a-aviso, #fbbf24);
}
`

export function CuentaSenalesRuntimeScreen({ resolved, stage, submitting, onWin, appPosition = null }: Props) {
  const { t } = useI18n()
  const tx = useTextos().cuentaSenales
  const cfg = resolved.config as unknown as Record<string, unknown>

  // 5/11: 1-3 preguntas seguidas (`preguntas` del servidor); un paquete viejo trae sólo la de siempre.
  const preguntas = useMemo<Pregunta[]>(() => {
    const lista = Array.isArray(cfg.preguntas) ? (cfg.preguntas as Record<string, unknown>[]) : []
    const limpias = lista
      .filter((q) => q && Array.isArray(q.answer_hashes))
      .map((q) => ({
        question: String(q.question || ''),
        hint_image_data_url: typeof q.hint_image_data_url === 'string' ? q.hint_image_data_url : '',
        answer_hashes: (q.answer_hashes as unknown[]).map(String),
        salt: String(q.salt || ''),
      }))
    if (limpias.length) return limpias
    return [
      {
        question: String(cfg.question || ''),
        hint_image_data_url: typeof cfg.hint_image_data_url === 'string' ? cfg.hint_image_data_url : '',
        answer_hashes: Array.isArray(cfg.answer_hashes) ? (cfg.answer_hashes as unknown[]).map(String) : [],
        salt: String(cfg.salt || ''),
      },
    ]
  }, [cfg.preguntas, cfg.question, cfg.hint_image_data_url, cfg.answer_hashes, cfg.salt])
  const [preguntaIdx, setPreguntaIdx] = useState(() =>
    Math.min(partidas.get(String(stage.id ?? ''))?.pregunta ?? 0, preguntas.length - 1)
  )
  const actual = preguntas[Math.min(preguntaIdx, preguntas.length - 1)]
  const question = actual.question || tx.preguntaPorDefecto
  const hintImage = actual.hint_image_data_url
  const answerHashes = actual.answer_hashes
  const salt = actual.salt
  const maxAttempts = Number(cfg.max_attempts) > 0 ? Number(cfg.max_attempts) : DEFAULT_MAX_ATTEMPTS
  const penaltyMs = Number(cfg.penalty_ms) >= 0 ? Number(cfg.penalty_ms) : DEFAULT_PENALTY_MS

  // --- Proximidad GPS: la pregunta solo tiene sentido en el punto real. ---
  const source = useMemo(() => getStageCoordinate(stage), [stage])
  const hasSource = source !== null
  const stageRadius = toNumber((stage as unknown as Record<string, unknown>).radius)
  const radius = Math.max(5, Number(stageRadius ?? 50) || 50)
  const requireProximity = (stage as unknown as Record<string, unknown>).require_proximity !== false

  const [gpsState, setGpsState] = useState<GpsState>(hasSource ? 'idle' : 'missing_source')
  const [ownPosition, setOwnPosition] = useState<LatLon | null>(null)
  const position = appPosition || ownPosition
  const watchIdRef = useRef<number | null>(null)

  const distance = useMemo(() => {
    if (!source || !position) return null
    return haversineMeters(position, source)
  }, [position, source])

  useEffect(() => {
    if (!hasSource || !requireProximity) return
    if (appPosition) {
      setGpsState('tracking')
      return
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsState('unsupported')
      return
    }
    setGpsState('requesting')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (reading) => {
        setOwnPosition({ lat: reading.coords.latitude, lon: reading.coords.longitude })
        setGpsState('tracking')
      },
      // Revisión 19/10: cualquier error (también el `timeout` de 12 s o la
      // posición no disponible un momento) se daba por permiso denegado, y
      // eso abre la pregunta lejos del punto. Sólo el código 1 es denegado;
      // con los demás se sigue esperando posición.
      (error) => setGpsState(error.code === 1 ? 'denied' : 'requesting'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
    )
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [hasSource, requireProximity, appPosition])

  const inRange = distance !== null && distance <= radius
  const gpsBroken = gpsState === 'denied' || gpsState === 'unsupported'
  const atNode = !requireProximity || !hasSource || inRange || gpsBroken

  // --- Teclado numérico + intentos + penalización (nunca bloquea). ---
  const [digits, setDigits] = useState('')
  const claveNodo = String(stage.id ?? '')
  const [guardada] = useState(() => partidas.get(claveNodo))
  const [attempts, setAttempts] = useState(guardada?.attempts ?? 0)
  const [penaltyAccumMs, setPenaltyAccumMs] = useState(guardada?.penalty ?? 0)
  const [checking, setChecking] = useState(false)
  const [statusKind, setStatusKind] = useState<'idle' | 'wrong' | 'penalty' | 'bien'>('idle')
  /** 4/11: al agotar los intentos, si se quedó corto o se pasó (sin decir la cifra). */
  const [pista, setPista] = useState<'corto' | 'largo' | null>(null)
  const wonRef = useRef(false)
  const [ganado, setGanado] = useState(false)
  /** Cada respuesta tecleada, en orden: es la evidencia que revisa el servidor. */
  const respuestasRef = useRef<number[]>(guardada?.respuestas ?? [])
  const porPreguntaRef = useRef<number[][]>(guardada?.porPregunta ?? [])
  const guardar = (cambios: Partial<PartidaGuardada>) =>
    partidas.set(claveNodo, {
      attempts,
      penalty: penaltyAccumMs,
      respuestas: [...respuestasRef.current],
      pregunta: preguntaIdx,
      porPregunta: porPreguntaRef.current.map((l) => [...l]),
      ...cambios,
    })

  // Revisión 19/10: hay reto (y salir cuenta) sólo con la pregunta delante.
  useSinRetoEnPantalla(!atNode || ganado)

  function pressDigit(digit: string) {
    if (submitting || checking) return
    setStatusKind('idle')
    setDigits((prev) => (prev.length >= 3 ? prev : prev + digit))
  }

  function clearDigits() {
    if (submitting || checking) return
    setDigits('')
    setStatusKind('idle')
  }

  /** ¿La respuesta buena es mayor que `dicho`? Se busca con los mismos hashes (de 0 a 999), sólo tras agotar intentos. */
  async function direccion(dicho: number): Promise<'corto' | 'largo' | null> {
    for (let n = 0; n <= 999; n += 1) {
      if (answerHashes.includes(await sha256Hex(`${salt}:${n}`))) return n > dicho ? 'corto' : 'largo'
    }
    return null
  }

  async function submitAnswer() {
    if (wonRef.current || submitting || checking || digits === '' || answerHashes.length === 0) return
    setChecking(true)
    setPista(null)
    try {
      const candidate = await sha256Hex(`${salt}:${digits}`)
      const correct = answerHashes.includes(candidate)

      respuestasRef.current.push(Number(digits))
      porPreguntaRef.current[preguntaIdx] = [...(porPreguntaRef.current[preguntaIdx] ?? []), Number(digits)]

      if (correct && preguntaIdx < preguntas.length - 1) {
        // Buena, y quedan preguntas: la siguiente, con los intentos de nuevo a cero (la penalización se queda).
        haptics.signalLock()
        setPreguntaIdx(preguntaIdx + 1)
        setAttempts(0)
        setDigits('')
        setStatusKind('bien')
        guardar({ attempts: 0, pregunta: preguntaIdx + 1 })
        return
      }

      if (correct) {
        wonRef.current = true
        setGanado(true)
        partidas.delete(claveNodo)
        registrarEvidencia(stage.id ?? '', {
          game: 'cuenta_senales',
          answers: respuestasRef.current,
          fallos: respuestasRef.current.length - preguntas.length,
          ...(preguntas.length > 1 ? { respuestas_por_pregunta: porPreguntaRef.current } : {}),
        })
        haptics.signalLock()
        sounds.signalLock()
        await onWin(penaltyAccumMs)
        return
      }

      const nextAttempts = attempts + 1
      haptics.error()
      setDigits('')

      if (nextAttempts >= maxAttempts) {
        // 3 fallos: no se revela nada, se suma la penalización y se deja
        // reintentar sin límite -nunca se bloquea el progreso-.
        setAttempts(0)
        setPenaltyAccumMs(penaltyAccumMs + penaltyMs)
        setStatusKind('penalty')
        void direccion(Number(digits)).then(setPista)
      } else {
        setAttempts(nextAttempts)
        setStatusKind('wrong')
      }
      guardar({
        attempts: nextAttempts >= maxAttempts ? 0 : nextAttempts,
        penalty: nextAttempts >= maxAttempts ? penaltyAccumMs + penaltyMs : penaltyAccumMs,
      })
    } finally {
      setChecking(false)
    }
  }

  const statusText = !atNode
    ? gpsState === 'requesting' || gpsState === 'idle'
      ? tx.buscandoGps
      : t('player.minigames.cuentaSenales.approach')
    : statusKind === 'penalty'
      ? `${t('player.minigames.cuentaSenales.penalty')
          .replace('{attempts}', String(maxAttempts))
          .replace('{seconds}', String(Math.round(penaltyMs / 1000)))}${
          pista === 'corto' ? ` ${tx.teQuedasCorto}` : pista === 'largo' ? ` ${tx.tePasas}` : ''
        }`
      : statusKind === 'wrong'
        ? t('player.minigames.cuentaSenales.wrong')
        : statusKind === 'bien'
          ? tx.bienSiguiente(preguntaIdx + 1, preguntas.length)
          : tx.miraAlrededor

  const attemptLabel = t('player.minigames.cuentaSenales.attempt')
    .replace('{current}', String(Math.min(attempts + 1, maxAttempts)))
    .replace('{total}', String(maxAttempts))

  return (
    <div className="csn-root">
      <style>{STYLES}</style>
      <div className="csn-card">
        <span className="csn-overline">{tx.titulo}</span>

        {!atNode ? (
          <>
            <div className="csn-question">{tx.acercate}</div>
            <div className="csn-status">{tx.zona(formatMeters(distance), Math.round(radius))}</div>
          </>
        ) : (
          <>
            {preguntas.length > 1 ? (
              <div className="csn-attempts">{tx.preguntaDe(preguntaIdx + 1, preguntas.length)}</div>
            ) : null}
            <div className="csn-question">{question}</div>
            {hintImage ? <img className="csn-hint" src={hintImage} alt={tx.altPista} /> : null}
            <div className="csn-display" aria-live="polite">
              {digits || '—'}
            </div>
            <div className="csn-attempts">
              {attemptLabel}
              {penaltyAccumMs > 0 ? tx.penalizacionAcumulada(Math.round(penaltyAccumMs / 1000)) : ''}
            </div>
            <div className="csn-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button key={digit} type="button" className="csn-key" onClick={() => pressDigit(digit)}>
                  {digit}
                </button>
              ))}
              <button type="button" className="csn-key csn-clear" onClick={clearDigits}>
                {tx.borrar}
              </button>
              <button key="0" type="button" className="csn-key" onClick={() => pressDigit('0')}>
                0
              </button>
              <span />
            </div>
            <button
              type="button"
              className="csn-btn"
              disabled={digits === '' || submitting || checking}
              onClick={() => void submitAnswer()}
            >
              {checking ? tx.comprobando : submitting ? tx.registrando : tx.responder}
            </button>
          </>
        )}

        <div
          className={`csn-status${statusKind === 'wrong' ? ' csn-wrong' : ''}${
            statusKind === 'penalty' ? ' csn-penalty' : ''
          }`}
        >
          {statusText}
        </div>
      </div>
    </div>
  )
}

export default CuentaSenalesRuntimeScreen

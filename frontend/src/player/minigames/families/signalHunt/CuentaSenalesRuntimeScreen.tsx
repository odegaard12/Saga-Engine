import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedSignalHuntMinigame } from '../../core/resolver'
import { haptics, sounds } from '../../../utils/haptics'
import { useI18n } from '../../../../i18n/useI18n'
import { registrarEvidencia } from '../../../avance/evidencia'

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
  color: rgba(255,255,255,.96);
}
.csn-card {
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  padding: 18px 16px;
  background:
    radial-gradient(circle at 50% 0%, rgba(255,255,255,.10), transparent 34%),
    linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
  border: 1px solid rgba(255,255,255,.12);
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
  color: rgba(226,238,255,.54);
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
  color: rgba(226,238,255,.6);
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
  background: rgba(255,255,255,.10);
  color: rgba(255,255,255,.96);
  font-size: 26px;
  font-weight: 900;
  cursor: pointer;
}
.csn-key:active {
  background: rgba(255,255,255,.2);
}
.csn-key.csn-clear {
  background: rgba(248,113,113,.18);
  color: #fecaca;
  font-size: 16px;
}
.csn-btn {
  width: 100%;
  min-height: 54px;
  border: none;
  border-radius: 18px;
  background: linear-gradient(135deg, rgb(var(--theme-ok)), rgb(var(--theme-ok-deep)));
  color: #022c22;
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(var(--theme-ok), .35);
}
.csn-btn:disabled {
  background: rgba(255,255,255,.10);
  color: rgba(255,255,255,.45);
  box-shadow: none;
  cursor: default;
}
.csn-status {
  font-size: 13px;
  font-weight: 700;
  color: rgba(226,238,255,.78);
  line-height: 1.4;
}
.csn-status.csn-wrong {
  color: #fca5a5;
}
.csn-status.csn-penalty {
  color: #fbbf24;
}
`

export function CuentaSenalesRuntimeScreen({ resolved, stage, submitting, onWin, appPosition = null }: Props) {
  const { t } = useI18n()
  const cfg = resolved.config as unknown as Record<string, unknown>

  const question = String(cfg.question || '¿Cuánto cuentas?')
  const hintImage = typeof cfg.hint_image_data_url === 'string' ? cfg.hint_image_data_url : ''
  const answerHashes = useMemo(
    () => (Array.isArray(cfg.answer_hashes) ? (cfg.answer_hashes as unknown[]).map(String) : []),
    [cfg.answer_hashes]
  )
  const salt = String(cfg.salt || '')
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
      () => setGpsState('denied'),
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
  const [attempts, setAttempts] = useState(0)
  const [penaltyAccumMs, setPenaltyAccumMs] = useState(0)
  const [checking, setChecking] = useState(false)
  const [statusKind, setStatusKind] = useState<'idle' | 'wrong' | 'penalty'>('idle')
  const wonRef = useRef(false)
  /** Cada respuesta tecleada, en orden: es la evidencia que revisa el servidor. */
  const respuestasRef = useRef<number[]>([])

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

  async function submitAnswer() {
    if (wonRef.current || submitting || checking || digits === '' || answerHashes.length === 0) return
    setChecking(true)
    try {
      const candidate = await sha256Hex(`${salt}:${digits}`)
      const correct = answerHashes.includes(candidate)

      respuestasRef.current.push(Number(digits))

      if (correct) {
        wonRef.current = true
        registrarEvidencia(stage.id ?? '', {
          game: 'cuenta_senales',
          answers: respuestasRef.current,
          fallos: respuestasRef.current.length - 1,
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
        setPenaltyAccumMs((prev) => prev + penaltyMs)
        setStatusKind('penalty')
      } else {
        setAttempts(nextAttempts)
        setStatusKind('wrong')
      }
    } finally {
      setChecking(false)
    }
  }

  const statusText = !atNode
    ? gpsState === 'requesting' || gpsState === 'idle'
      ? 'Buscando tu posición GPS…'
      : t('player.minigames.cuentaSenales.approach')
    : statusKind === 'penalty'
      ? t('player.minigames.cuentaSenales.penalty').replace('{seconds}', String(Math.round(penaltyMs / 1000)))
      : statusKind === 'wrong'
        ? t('player.minigames.cuentaSenales.wrong')
        : 'Mira alrededor y responde con un número.'

  const attemptLabel = t('player.minigames.cuentaSenales.attempt')
    .replace('{current}', String(Math.min(attempts + 1, maxAttempts)))
    .replace('{total}', String(maxAttempts))

  return (
    <div className="csn-root">
      <style>{STYLES}</style>
      <div className="csn-card">
        <span className="csn-overline">🔢 Cuenta las señales</span>

        {!atNode ? (
          <>
            <div className="csn-question">Acércate al punto real</div>
            <div className="csn-status">
              {formatMeters(distance)} · zona de {Math.round(radius)} m
            </div>
          </>
        ) : (
          <>
            <div className="csn-question">{question}</div>
            {hintImage ? <img className="csn-hint" src={hintImage} alt="Pista" /> : null}
            <div className="csn-display" aria-live="polite">
              {digits || '—'}
            </div>
            <div className="csn-attempts">
              {attemptLabel}
              {penaltyAccumMs > 0 ? ` · penalización acumulada: ${Math.round(penaltyAccumMs / 1000)}s` : ''}
            </div>
            <div className="csn-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button key={digit} type="button" className="csn-key" onClick={() => pressDigit(digit)}>
                  {digit}
                </button>
              ))}
              <button type="button" className="csn-key csn-clear" onClick={clearDigits}>
                Borrar
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
              {checking ? 'Comprobando…' : submitting ? 'Registrando…' : '✅ Responder'}
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

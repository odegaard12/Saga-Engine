import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMotionChallengeMinigame } from '../../core/resolver'
import { useI18n } from '../../../../i18n/useI18n'
import { avisarPeticionDePermisoPropia } from '../../../utils/permissionPromptGuard'
import { registrarEvidencia } from '../../../avance/evidencia'
import {
  crearLimitadorDeToques,
  ESPERA_SENSOR_MUDO_MS,
  marcarModoAlternativo,
  penalizacionDelModo,
  puedeUsarModoAlternativo,
  type EstadoDelSensor,
} from '../../core/modoAlternativo'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import {
  baseCalibrada,
  enZona,
  fasesDinamo,
  intensidad,
  pasoDinamo,
  suavizar,
  type EstadoDinamo,
} from './dinamo'

/**
 * Dinamo «Generador de luz» (30/10/2026, propuesta A elegida por Óscar; sustituye la mecánica de «Agita para cargar»).
 * Rotor que gira con tu ritmo, bombilla que se llena de luz y dial en arco con la zona verde, a la vista desde el inicio.
 * Se calibra el ritmo cómodo del jugador y la carga sólo sube con la aguja dentro de la zona; fuera se descarga.
 * Sin sensor (o sin permiso): pulsar al ritmo, con el minuto del modo alternativo.
 */

interface Props {
  resolved: ResolvedMotionChallengeMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void>
}

type Fase = 'reglas' | 'calibrando' | 'jugando' | 'hecho'

const CALIBRAR_MS = 3000

const TX = {
  es: {
    titulo: 'Dinamo',
    kicker: 'Reto de movimiento',
    suave: 'Suave',
    rapido: 'Rápido',
    reglas: 'Agita a tu ritmo: sólo carga con la aguja en la zona verde.',
    enZona: (s: number, t: number) => `${s} de ${t} s en la zona`,
    empezar: 'Empezar · mido tu ritmo 3 s',
    calibrando: 'Agita a tu ritmo cómodo…',
    fase: (a: number, b: number) => `Fase ${a} de ${b}`,
    nFases: (n: number) => `${n} fases`,
    dentro: '¡Dentro! Mantén el ritmo',
    masSuave: 'Más suave',
    masFuerte: 'Más rápido',
    hecho: '¡Dinamo cargada!',
    sinSensor: 'Este móvil no da el movimiento. Puedes jugar pulsando al ritmo (+1 min).',
    jugarTactil: 'Jugar pulsando (+1 min)',
    pulsa: 'Pulsa al ritmo',
    permiso: 'Hace falta permiso de movimiento para jugar.',
  },
  gl: {
    titulo: 'Dínamo',
    kicker: 'Reto de movemento',
    suave: 'Suave',
    rapido: 'Rápido',
    reglas: 'Axita ao teu ritmo: só carga coa agulla na zona verde.',
    enZona: (s: number, t: number) => `${s} de ${t} s na zona`,
    empezar: 'Comezar · mido o teu ritmo 3 s',
    calibrando: 'Axita ao teu ritmo cómodo…',
    fase: (a: number, b: number) => `Fase ${a} de ${b}`,
    nFases: (n: number) => `${n} fases`,
    dentro: 'Dentro! Mantén o ritmo',
    masSuave: 'Máis suave',
    masFuerte: 'Máis rápido',
    hecho: 'Dínamo cargada!',
    sinSensor: 'Este móbil non dá o movemento. Podes xogar premendo ao ritmo (+1 min).',
    jugarTactil: 'Xogar premendo (+1 min)',
    pulsa: 'Preme ao ritmo',
    permiso: 'Fai falta permiso de movemento para xogar.',
  },
  en: {
    titulo: 'Dynamo',
    kicker: 'Motion challenge',
    suave: 'Gentle',
    rapido: 'Fast',
    reglas: 'Shake at your pace: it only charges with the needle in the green zone.',
    enZona: (s: number, t: number) => `${s} of ${t} s in the zone`,
    empezar: 'Start · I measure your pace for 3 s',
    calibrando: 'Shake at a comfortable pace…',
    fase: (a: number, b: number) => `Phase ${a} of ${b}`,
    nFases: (n: number) => `${n} phases`,
    dentro: 'Inside! Keep the rhythm',
    masSuave: 'Gentler',
    masFuerte: 'Faster',
    hecho: 'Dynamo charged!',
    sinSensor: 'This phone gives no motion. You can play by tapping in rhythm (+1 min).',
    jugarTactil: 'Play by tapping (+1 min)',
    pulsa: 'Tap in rhythm',
    permiso: 'Motion permission is needed to play.',
  },
}

type MotionEv = Event & {
  acceleration?: { x: number | null; y: number | null; z: number | null } | null
  accelerationIncludingGravity?: { x: number | null; y: number | null; z: number | null } | null
}

async function pedirPermiso(): Promise<boolean> {
  const ctor = (
    window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }
  ).DeviceMotionEvent
  if (typeof ctor?.requestPermission === 'function') {
    avisarPeticionDePermisoPropia()
    try {
      return (await ctor.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }
  return 'DeviceMotionEvent' in window
}

const ESTILOS = `
.dinamo { display:flex; flex-direction:column; gap:10px; color:#f8fafc; }
.dinamo h2 { margin:0; }
.dn-cabeza { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.dn-kicker { font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--theme-primary); }
.dn-chip { font-size:12px; font-weight:800; padding:4px 10px; border-radius:99px; background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-borde); }
.dn-escena { background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-raya); border-radius:18px; padding:6px 14px 14px; }
.dn-escena svg { display:block; margin:0 auto; width:min(100%, 290px, 36dvh); height:auto; }
.dn-estado { text-align:center; font-weight:800; font-size:18px; margin:6px 0 2px; min-height:24px; }
.dn-sub { text-align:center; font-size:13px; opacity:.66; min-height:18px; }
.dn-linea { text-align:center; font-size:14px; line-height:1.4; opacity:.8; margin:4px 0 0; }
.dn-aviso { text-align:center; font-size:13px; color:#fcd34d; margin:8px 0 0; }
.dn-fases { display:flex; gap:8px; justify-content:center; margin-top:10px; }
.dn-fases i { width:22px; height:6px; border-radius:3px; background:var(--saga-pizarra-borde); }
.dn-fases i.hecha { background:rgb(var(--theme-done)); }
.dn-fases i.ahora { background:var(--theme-primary); }
.dn-boton { min-height:50px; border:0; border-radius:14px; background:var(--theme-primary); color:#0b2440; font-weight:800; font-size:16px; width:100%; margin-top:12px; }
.dn-boton.secundario { background:var(--saga-pizarra-tarjeta); color:#f8fafc; border:1px solid var(--saga-pizarra-borde); }
.dn-tactil { min-height:84px; font-size:20px; }
.dn-rayos { animation: dnLate 1.4s ease-in-out infinite; }
@keyframes dnLate { 50% { opacity:.55; } }
@media (prefers-reduced-motion: reduce) { .dn-rayos { animation:none; } }
`

// El dibujo: 290 de lado; el dial y el anillo de carga son semicírculos arriba (0 = izquierda, 1 = derecha).
const D = 290
const C = D / 2
const R = D / 2
const arco = (a0: number, a1: number, rad: number) => {
  const p = (a: number) => [
    C + rad * Math.cos(Math.PI * (1 + a)),
    C + rad * Math.sin(Math.PI * (1 + a)),
  ]
  const [x0, y0] = p(Math.max(0, Math.min(1, a0)))
  const [x1, y1] = p(Math.max(0, Math.min(1, a1)))
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${rad},${rad} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`
}
const ASPAS = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3
  const r = R * 0.5
  return `M${C},${C} L${C + r * Math.cos(a)},${C + r * Math.sin(a)} A${r},${r} 0 0 1 ${C + r * Math.cos(a + 0.5)},${C + r * Math.sin(a + 0.5)} Z`
})
const RAYOS = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6)
const MOVIMIENTO_REDUCIDO =
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

export function DinamoRuntimeScreen({ resolved, stage, onWin, submitting }: Props) {
  const { locale } = useI18n()
  const tx = TX[(locale as keyof typeof TX) in TX ? (locale as keyof typeof TX) : 'es']
  const cfg = resolved.config as unknown as Record<string, unknown>
  const fases = useMemo(
    () => fasesDinamo(Number(cfg.dinamo_fases) || 3, Number(cfg.dinamo_ancho) || 0.5),
    [cfg.dinamo_fases, cfg.dinamo_ancho]
  )
  const segundosPorFase = Math.max(5, Math.min(90, Number(cfg.dinamo_segundos) || 25))
  const permiteTactil = cfg.allow_touch_fallback !== false

  const [fase, setFase] = useState<Fase>('reglas')
  const [sensor, setSensor] = useState<EstadoDelSensor>('sin_comprobar')
  const [tactil, setTactil] = useState(false)
  const [vista, setVista] = useState<{
    rel: number
    estado: EstadoDinamo
    calib: number
    giro: number
  }>({
    rel: 0,
    estado: { fase: 0, carga: 0, enZonaMs: 0 },
    calib: 0,
    giro: 0,
  })

  const medidaRef = useRef(0)
  const ultimaRef = useRef(0)
  const muestrasRef = useRef<number[]>([])
  const baseRef = useRef(1.2)
  const estadoRef = useRef<EstadoDinamo>({ fase: 0, carga: 0, enZonaMs: 0 })
  const inicioRef = useRef(0)
  const toqueRef = useRef(0)
  const giroRef = useRef(0)
  const limitador = useMemo(() => crearLimitadorDeToques(), [])
  const ganadoRef = useRef(false)

  useSinRetoEnPantalla(fase !== 'calibrando' && fase !== 'jugando')

  // Lecturas del sensor: intensidad suavizada del meneo (sin gravedad).
  useEffect(() => {
    if (fase !== 'calibrando' && fase !== 'jugando') return undefined
    if (tactil) return undefined
    let previo = performance.now()
    const alMoverse = (e: Event) => {
      const ev = e as MotionEv
      const a = ev.acceleration
      let x: number
      if (a && a.x !== null && a.y !== null && a.z !== null) x = intensidad(a.x, a.y ?? 0, a.z ?? 0)
      else {
        const g = ev.accelerationIncludingGravity
        if (!g || g.x === null) return
        x = Math.abs(intensidad(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81)
      }
      const ahora = performance.now()
      medidaRef.current = suavizar(medidaRef.current, x, (ahora - previo) / 1000)
      previo = ahora
      ultimaRef.current = ahora
    }
    window.addEventListener('devicemotion', alMoverse)
    const mudo = window.setTimeout(() => {
      if (ultimaRef.current) return
      // Sin lecturas: de vuelta a las reglas, donde se ofrece jugar sin sensor.
      setSensor('mudo')
      setFase('reglas')
    }, ESPERA_SENSOR_MUDO_MS)
    return () => {
      window.removeEventListener('devicemotion', alMoverse)
      window.clearTimeout(mudo)
    }
  }, [fase, tactil])

  // El reloj del juego: 20 veces por segundo (basta para la aguja y gasta menos que cada fotograma).
  useEffect(() => {
    if (fase !== 'calibrando' && fase !== 'jugando') return undefined
    let previo = performance.now()
    const id = window.setInterval(() => {
      const ahora = performance.now()
      const dt = ahora - previo
      previo = ahora
      if (tactil && ahora - toqueRef.current > 900)
        medidaRef.current = suavizar(medidaRef.current, 0, dt / 1000, 0.8)
      const valor = medidaRef.current
      const rel = valor / Math.max(0.5, baseRef.current)
      // El rotor gira con el ritmo: una vuelta por segundo con el ritmo calibrado.
      if (!MOVIMIENTO_REDUCIDO)
        giroRef.current = (giroRef.current + Math.min(2.5, rel) * 0.36 * dt) % 360
      if (fase === 'calibrando') {
        muestrasRef.current.push(valor)
        const progreso = Math.min(1, (ahora - inicioRef.current) / CALIBRAR_MS)
        setVista((v) => ({ ...v, calib: progreso, rel, giro: giroRef.current }))
        if (progreso >= 1) {
          baseRef.current = baseCalibrada(
            muestrasRef.current.slice(Math.floor(muestrasRef.current.length / 3)),
            tactil ? 1.5 : 1.2
          )
          setFase('jugando')
        }
        return
      }
      estadoRef.current = pasoDinamo(estadoRef.current, rel, dt, fases, segundosPorFase)
      setVista((v) => ({ ...v, rel, estado: estadoRef.current, giro: giroRef.current }))
      if (estadoRef.current.fase >= fases.length && !ganadoRef.current) {
        ganadoRef.current = true
        setFase('hecho')
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [fase, fases, segundosPorFase, tactil])

  useEffect(() => {
    if (fase !== 'hecho') return
    navigator.vibrate?.([20, 40, 60])
    registrarEvidencia(String(stage.id ?? ''), {
      game: 'dinamo',
      fases: fases.length,
      en_zona_ms: Math.round(estadoRef.current.enZonaMs),
      base: Math.round(baseRef.current * 100) / 100,
    })
    if (tactil)
      marcarModoAlternativo(stage.id, sensor === 'sin_comprobar' ? 'no_disponible' : sensor)
    void onWin(penalizacionDelModo(tactil))
  }, [fase]) // eslint-disable-line react-hooks/exhaustive-deps -- una sola vez al terminar

  const empezar = useCallback(async () => {
    if (!('DeviceMotionEvent' in window)) {
      setSensor('no_disponible')
      return
    }
    const ok = await pedirPermiso()
    if (!ok) {
      setSensor('denegado')
      return
    }
    setSensor('disponible')
    muestrasRef.current = []
    inicioRef.current = performance.now()
    setFase('calibrando')
  }, [])

  const empezarTactil = useCallback(() => {
    setTactil(true)
    muestrasRef.current = []
    inicioRef.current = performance.now()
    setFase('calibrando')
  }, [])

  const pulsar = useCallback(() => {
    const ahora = performance.now()
    if (!limitador(ahora)) return
    if (toqueRef.current) {
      const ritmo = 1000 / Math.max(120, ahora - toqueRef.current)
      medidaRef.current = suavizar(medidaRef.current, ritmo, 0.25, 0.6)
    }
    toqueRef.current = ahora
  }, [limitador])

  const ofrecerTactil = puedeUsarModoAlternativo(sensor, permiteTactil)
  const actual = fases[Math.min(vista.estado.fase, fases.length - 1)]
  const jugando = fase === 'jugando'
  const hecho = fase === 'hecho'
  const dentro = jugando && enZona(vista.rel, actual)
  // Dial: de 0 a 2 veces el ritmo calibrado, de izquierda a derecha.
  const enDial = (r: number) => Math.max(0, Math.min(2, r)) / 2
  const total = hecho ? 1 : (vista.estado.fase + vista.estado.carga) / fases.length
  const anillo = fase === 'calibrando' ? vista.calib : hecho ? 1 : vista.estado.carga
  const brillo = fase === 'reglas' ? 0.08 : Math.max(0.08, total)
  const ang = Math.PI * (1 + enDial(vista.rel))
  const estadoTexto =
    fase === 'calibrando'
      ? tx.calibrando
      : hecho
        ? tx.hecho
        : dentro
          ? tx.dentro
          : vista.rel > actual.centro
            ? tx.masSuave
            : tx.masFuerte
  const faseVista = Math.min(vista.estado.fase + 1, fases.length)
  const enZonaS = Math.floor(vista.estado.carga * segundosPorFase)

  return (
    <div className="dinamo">
      <style>{ESTILOS}</style>
      <div className="dn-cabeza">
        <span className="dn-kicker">{tx.kicker}</span>
        <span className="dn-chip">
          {fase === 'reglas' ? tx.nFases(fases.length) : tx.fase(faseVista, fases.length)}
        </span>
      </div>
      <h2>{tx.titulo}</h2>
      <div className="dn-escena">
        <svg
          viewBox={`0 0 ${D} ${D}`}
          role="img"
          aria-label={`${estadoTexto} · ${Math.round(total * 100)}%`}
        >
          <defs>
            <radialGradient id="dn-bombilla" cx="50%" cy="45%">
              <stop offset="0" stopColor="#fff7d6" stopOpacity={brillo} />
              <stop offset=".55" stopColor="#fde68a" stopOpacity={brillo * 0.85} />
              <stop offset="1" stopColor="#f59e0b" stopOpacity={brillo * 0.25} />
            </radialGradient>
            <radialGradient id="dn-halo" cx="50%" cy="50%">
              <stop offset="0" stopColor="#fde68a" stopOpacity={brillo * 0.55} />
              <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={R * 0.62} fill="url(#dn-halo)" />
          <path
            d={arco(0, 1, R - 14)}
            stroke="rgba(255,255,255,.14)"
            strokeWidth="16"
            fill="none"
            strokeLinecap="round"
          />
          {!hecho ? (
            <path
              d={arco(
                enDial(actual.centro - actual.ancho / 2),
                enDial(actual.centro + actual.ancho / 2),
                R - 14
              )}
              style={{ stroke: 'rgb(var(--theme-done))', opacity: dentro ? 1 : 0.75 }}
              strokeWidth="16"
              fill="none"
              strokeLinecap="round"
            />
          ) : null}
          <path
            d={arco(0, 1, R - 34)}
            stroke="rgba(255,255,255,.08)"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          {anillo > 0.005 ? (
            <path
              d={arco(0, anillo, R - 34)}
              style={{ stroke: 'var(--theme-primary)' }}
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
            />
          ) : null}
          <g transform={`rotate(${vista.giro.toFixed(1)} ${C} ${C})`}>
            {ASPAS.map((d, i) => (
              <path
                key={i}
                d={d}
                style={{ fill: 'var(--theme-primary)' }}
                opacity={fase === 'reglas' ? 0.18 : 0.32}
              />
            ))}
          </g>
          <circle
            cx={C}
            cy={C}
            r={R * 0.3}
            style={{ fill: 'var(--saga-pizarra-tarjeta)' }}
            stroke="rgba(255,255,255,.18)"
            strokeWidth="2"
          />
          <circle cx={C} cy={C} r={R * 0.26} fill="url(#dn-bombilla)" />
          <path
            d={`M${C - 9},${C + 6} q9,-18 18,0`}
            stroke={brillo > 0.5 ? '#92400e' : 'rgba(255,255,255,.35)'}
            strokeWidth="3"
            fill="none"
          />
          {hecho ? (
            <g className="dn-rayos">
              {RAYOS.map((a, i) => (
                <line
                  key={i}
                  x1={C + R * 0.34 * Math.cos(a)}
                  y1={C + R * 0.34 * Math.sin(a)}
                  x2={C + R * 0.47 * Math.cos(a)}
                  y2={C + R * 0.47 * Math.sin(a)}
                  stroke="#fde68a"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              ))}
            </g>
          ) : null}
          {fase !== 'reglas' && !hecho ? (
            <line
              x1={C}
              y1={C}
              x2={C + (R - 18) * Math.cos(ang)}
              y2={C + (R - 18) * Math.sin(ang)}
              stroke="#fff"
              strokeWidth="4"
              strokeLinecap="round"
            />
          ) : null}
          <text
            x={C - (R - 34)}
            y={C + 30}
            fill="rgba(248,250,252,.6)"
            fontSize="11"
            fontWeight="800"
            textAnchor="middle"
          >
            {tx.suave}
          </text>
          <text
            x={C + (R - 34)}
            y={C + 30}
            fill="rgba(248,250,252,.6)"
            fontSize="11"
            fontWeight="800"
            textAnchor="middle"
          >
            {tx.rapido}
          </text>
          <text
            x={C}
            y={C + R * 0.62}
            fill="#f8fafc"
            fontSize="26"
            fontWeight="900"
            textAnchor="middle"
          >
            {`${Math.round(total * 100)}%`}
          </text>
        </svg>

        {fase === 'reglas' ? (
          <>
            <p className="dn-linea">{tx.reglas}</p>
            {sensor === 'denegado' ? <p className="dn-aviso">{tx.permiso}</p> : null}
            {ofrecerTactil ? (
              <>
                <p className="dn-aviso">{tx.sinSensor}</p>
                <button
                  type="button"
                  className="dn-boton"
                  onClick={empezarTactil}
                  disabled={submitting}
                >
                  {tx.jugarTactil}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="dn-boton"
                onClick={() => void empezar()}
                disabled={submitting}
              >
                {tx.empezar}
              </button>
            )}
          </>
        ) : (
          <>
            <div
              className="dn-estado"
              aria-live="polite"
              style={{ color: dentro ? 'rgb(var(--theme-done))' : hecho ? '#fde68a' : '#f8fafc' }}
            >
              {estadoTexto}
            </div>
            <div className="dn-sub">
              {jugando
                ? `${tx.fase(faseVista, fases.length)} · ${tx.enZona(enZonaS, segundosPorFase)}`
                : ''}
            </div>
            <div className="dn-fases" aria-hidden="true">
              {fases.map((_, i) => (
                <i
                  key={i}
                  className={
                    i < vista.estado.fase || hecho
                      ? 'hecha'
                      : i === vista.estado.fase && jugando
                        ? 'ahora'
                        : ''
                  }
                />
              ))}
            </div>
            {tactil && !hecho ? (
              <button
                type="button"
                className="dn-boton secundario dn-tactil"
                onPointerDown={pulsar}
              >
                {tx.pulsa}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default DinamoRuntimeScreen

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../../../i18n/useI18n'
import { avisarPeticionDePermisoPropia } from '../../../utils/permissionPromptGuard'
import { registrarEvidencia } from '../../../avance/evidencia'
import {
  ESPERA_SENSOR_MUDO_MS,
  marcarModoAlternativo,
  penalizacionDelModo,
  puedeUsarModoAlternativo,
  type EstadoDelSensor,
} from '../../core/modoAlternativo'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { semillaDelIntento } from '../sequenceCode/semilla'
import {
  delta,
  generarFaros,
  generarSenuelos,
  giroVertical,
  normalizar,
  temperatura,
  type Temperatura,
} from './faros'

/**
 * Faros «Radar del cabo» (30/10/2026, propuesta B elegida por Óscar; sustituye la mecánica de «Rumbo doble»). Vista
 * cenital del mar desde el cabo: el haz barre hacia donde miras y las ondas dicen frío/caliente. Los faros se encienden
 * de uno en uno manteniendo el haz 3 s (si te sales, el aro vuelve a cero); las pistas se debilitan con cada faro y las
 * luces rojas son barcos señuelo (+15 s si los iluminas). El giro es RELATIVO a donde se empezó (giroscopio): sin
 * brújula, no falla con metal cerca. Sin sensor: girar con dos botones (+1 min).
 */

type AnyRecord = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- mismas props que la familia
type Props = {
  resolved?: AnyRecord
  stage?: AnyRecord
  submitting?: boolean
  onWin?: (r?: AnyRecord) => void | Promise<void>
}
type Fase = 'reglas' | 'jugando' | 'hecho'

/** Sentido del giro integrado (gravedad y giroscopio vienen con signos distintos según el sistema): el ajuste. */
const SIGNO_GIRO = -1
const GIRO_BOTONES_GRADOS_S = 70
/** Un barco cuenta como iluminado con el haz encima (±7°) 1,2 s seguidos: pasar por encima girando no cuenta. */
const BARCO_GRADOS = 7
const BARCO_MS = 1200
const BARCO_PENALIZACION_MS = 15000

const TX = {
  es: {
    titulo: 'Faros',
    kicker: 'Reto de giro',
    reglas: (n: number) =>
      `Gira con el móvil y enciende ${n} faros: mantén el haz 3 s. Evita las luces rojas.`,
    nFaros: (n: number) => `${n} faros`,
    empezar: 'Empezar',
    temp: {
      frio: 'Frío',
      templado: 'Templado',
      caliente: 'Caliente',
      ardiendo: '¡Ardiendo! Mantén',
    } as Record<Temperatura, string>,
    encendidos: (a: number, b: number) => `${a} de ${b} faros · las ondas se debilitan`,
    barco: '¡Era un barco! +15 s',
    hecho: '¡El cabo está a salvo!',
    hechoSub: (n: number) => `${n} de ${n} faros encendidos`,
    sinSensor: 'Este móvil no da el giro. Puedes girar con los botones (+1 min).',
    jugarBotones: 'Jugar con botones (+1 min)',
    izquierda: 'Girar a la izquierda',
    derecha: 'Girar a la derecha',
  },
  gl: {
    titulo: 'Faros',
    kicker: 'Reto de xiro',
    reglas: (n: number) =>
      `Xira co móbil e acende ${n} faros: mantén o feixe 3 s. Evita as luces vermellas.`,
    nFaros: (n: number) => `${n} faros`,
    empezar: 'Comezar',
    temp: {
      frio: 'Frío',
      templado: 'Morno',
      caliente: 'Quente',
      ardiendo: 'Ardendo! Mantén',
    } as Record<Temperatura, string>,
    encendidos: (a: number, b: number) => `${a} de ${b} faros · as ondas debilítanse`,
    barco: 'Era un barco! +15 s',
    hecho: 'O cabo está a salvo!',
    hechoSub: (n: number) => `${n} de ${n} faros acesos`,
    sinSensor: 'Este móbil non dá o xiro. Podes xirar cos botóns (+1 min).',
    jugarBotones: 'Xogar con botóns (+1 min)',
    izquierda: 'Xirar á esquerda',
    derecha: 'Xirar á dereita',
  },
  en: {
    titulo: 'Lighthouses',
    kicker: 'Turning challenge',
    reglas: (n: number) =>
      `Turn with the phone and light ${n} lighthouses: hold the beam 3 s. Avoid the red lights.`,
    nFaros: (n: number) => `${n} lighthouses`,
    empezar: 'Start',
    temp: {
      frio: 'Cold',
      templado: 'Warm',
      caliente: 'Hot',
      ardiendo: 'Burning! Hold it',
    } as Record<Temperatura, string>,
    encendidos: (a: number, b: number) => `${a} of ${b} lit · the waves fade`,
    barco: 'That was a boat! +15 s',
    hecho: 'The cape is safe!',
    hechoSub: (n: number) => `${n} of ${n} lighthouses lit`,
    sinSensor: 'This phone gives no rotation. You can turn with the buttons (+1 min).',
    jugarBotones: 'Play with buttons (+1 min)',
    izquierda: 'Turn left',
    derecha: 'Turn right',
  },
}

const COLOR: Record<Temperatura, string> = {
  frio: 'rgb(var(--theme-info))',
  templado: '#f59e0b',
  caliente: '#f97316',
  ardiendo: '#facc15',
}
/** Ondas en la punta del haz: más juntas y más vivas cuanto más caliente. */
const ONDAS: Record<Temperatura, number[]> = {
  frio: [],
  templado: [24, 46],
  caliente: [14, 28, 42],
  ardiendo: [9, 17, 25],
}

async function pedirPermisos(): Promise<boolean> {
  const w = window as unknown as {
    DeviceMotionEvent?: { requestPermission?: () => Promise<string> }
    DeviceOrientationEvent?: { requestPermission?: () => Promise<string> }
  }
  let ok = true
  for (const ctor of [w.DeviceMotionEvent, w.DeviceOrientationEvent]) {
    if (typeof ctor?.requestPermission === 'function') {
      avisarPeticionDePermisoPropia()
      try {
        ok = ok && (await ctor.requestPermission()) === 'granted'
      } catch {
        ok = false
      }
    }
  }
  return ok
}

const ESTILOS = `
.faros { display:flex; flex-direction:column; gap:10px; color:#f8fafc; }
.faros h2 { margin:0; }
.faros-cabeza { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.faros-kicker { font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--theme-primary); }
.faros-chip { font-size:12px; font-weight:800; padding:4px 10px; border-radius:99px; background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-borde); }
.faros-escena { background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-raya); border-radius:18px; padding:6px 14px 14px; }
.faros-escena svg { display:block; margin:0 auto; width:min(100%, 290px, 36dvh); height:auto; }
.faros-barco { animation: farosLate .6s steps(2) infinite; }
.faros-luz { animation: farosLuz 1.6s ease-in-out infinite; }
@keyframes farosLate { 50% { opacity:.35; } }
@keyframes farosLuz { 0%,100% { opacity:.7; } 50% { opacity:1; } }
.faros-estado { text-align:center; font-weight:800; font-size:18px; margin:6px 0 2px; min-height:24px; }
.faros-sub { text-align:center; font-size:13px; opacity:.66; min-height:18px; }
.faros-linea { text-align:center; font-size:14px; line-height:1.4; opacity:.8; margin:4px 0 0; }
.faros-aviso { text-align:center; font-size:13px; color:#fcd34d; margin:8px 0 0; }
.faros-boton { min-height:50px; border:0; border-radius:14px; background:var(--theme-primary); color:#0b2440; font-weight:800; font-size:16px; width:100%; margin-top:12px; }
.faros-giro { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
.faros-giro button { min-height:64px; border-radius:14px; background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-borde); color:#f8fafc; font-size:26px; font-weight:800; touch-action:none; }
@media (prefers-reduced-motion: reduce) { .faros-barco, .faros-luz { animation:none; opacity:1; } }
`

// El dibujo: 290 de lado, el mar es un círculo de radio R; el haz apunta arriba y el grupo gira con el rumbo.
const D = 290
const C = D / 2
const R = D / 2 - 4
const PUNTA = R * 0.62
const HAZ = 0.28 // semiancho del haz (rad)
const enMar = (grados: number, radio: number) => {
  const t = ((grados - 90) * Math.PI) / 180
  return [C + radio * Math.cos(t), C + radio * Math.sin(t)]
}
const PUNTOS = ['N', 'E', 'S', 'O']

export function FarosRuntimeScreen({ resolved, stage, submitting, onWin }: Props) {
  const { locale } = useI18n()
  const tx = TX[(locale as keyof typeof TX) in TX ? (locale as keyof typeof TX) : 'es']
  const cfg = useMemo(() => (resolved?.config ?? {}) as AnyRecord, [resolved?.config])
  const total = Math.max(3, Math.min(6, Number(cfg.faros) || 6))
  const tolerancia = Math.max(4, Math.min(40, Number(cfg.tolerance_deg) || 12))
  const mantenerMs = Math.max(300, Math.min(8000, Number(cfg.hold_ms) || 3000))
  const nBarcos = Math.max(0, Math.min(4, Number(cfg.senuelos ?? 2) || 0))
  const ayudas = cfg.show_compass_ring !== false
  const semilla = semillaDelIntento(cfg, stage?.id, 0)
  const faros = useMemo(() => generarFaros(semilla, total), [semilla, total])
  const barcos = useMemo(
    () => generarSenuelos(semilla, faros, nBarcos, tolerancia + 12),
    [semilla, faros, nBarcos, tolerancia]
  )

  const [fase, setFase] = useState<Fase>('reglas')
  const [sensor, setSensor] = useState<EstadoDelSensor>('sin_comprobar')
  const [botones, setBotones] = useState(false)
  const [encendidos, setEncendidos] = useState<boolean[]>(() => faros.map(() => false))
  const [hundidos, setHundidos] = useState<boolean[]>(() => barcos.map(() => false))
  const [vista, setVista] = useState({ rumbo: 0, sujeto: 0, aviso: 0 })

  const rumboRef = useRef(0)
  const lecturaRef = useRef(0)
  const giroBotonRef = useRef(0)
  const sujetoDesdeRef = useRef<number | null>(null)
  const encendidosRef = useRef<boolean[]>(faros.map(() => false))
  const hundidosRef = useRef<boolean[]>(barcos.map(() => false))
  const barcoDesdeRef = useRef<number[]>(barcos.map(() => 0))
  const avisoHastaRef = useRef(0)
  const penalizacionRef = useRef(0)

  useSinRetoEnPantalla(fase !== 'jugando')

  // Giro relativo: giroscopio proyectado sobre la gravedad; si no hay giroscopio, la orientación menos la inicial.
  useEffect(() => {
    if (fase !== 'jugando' || botones) return undefined
    let previo = 0
    let inicial: number | null = null
    const alMoverse = (e: Event) => {
      const ev = e as Event & {
        rotationRate?: AnyRecord | null
        accelerationIncludingGravity?: AnyRecord | null
      }
      if (!ev.rotationRate || !ev.accelerationIncludingGravity) return
      const w = giroVertical(ev.rotationRate, ev.accelerationIncludingGravity)
      if (w === null || !Number.isFinite(w)) return // eventos vacíos (móvil sin giroscopio): no cuentan como lectura
      const ahora = performance.now()
      if (previo)
        rumboRef.current = normalizar(
          rumboRef.current + SIGNO_GIRO * w * Math.min(0.2, (ahora - previo) / 1000)
        )
      previo = ahora
      lecturaRef.current = ahora
    }
    const alOrientarse = (e: Event) => {
      if (performance.now() - lecturaRef.current < 500 && previo) return // ya manda el giroscopio
      const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number }
      const rumbo =
        typeof ev.webkitCompassHeading === 'number'
          ? ev.webkitCompassHeading
          : ev.alpha !== null
            ? 360 - ev.alpha
            : null
      if (rumbo === null) return
      if (inicial === null) inicial = rumbo
      rumboRef.current = normalizar(rumbo - inicial)
      lecturaRef.current = performance.now()
      previo = 0
    }
    window.addEventListener('devicemotion', alMoverse)
    window.addEventListener('deviceorientation', alOrientarse)
    const mudo = window.setTimeout(() => {
      if (lecturaRef.current) return
      // Sin lecturas: de vuelta a las reglas, donde se ofrece jugar con botones.
      setSensor('mudo')
      setFase('reglas')
    }, ESPERA_SENSOR_MUDO_MS)
    return () => {
      window.removeEventListener('devicemotion', alMoverse)
      window.removeEventListener('deviceorientation', alOrientarse)
      window.clearTimeout(mudo)
    }
  }, [fase, botones])

  // 20 veces por segundo: el haz, la pista, si se sujeta sobre el faro buscado y si se ilumina un barco.
  useEffect(() => {
    if (fase !== 'jugando') return undefined
    let previo = performance.now()
    const id = window.setInterval(() => {
      const ahora = performance.now()
      const dt = (ahora - previo) / 1000
      previo = ahora
      if (botones) rumboRef.current = normalizar(rumboRef.current + giroBotonRef.current * dt)
      const rumbo = rumboRef.current

      barcos.forEach((b, i) => {
        if (hundidosRef.current[i] || Math.abs(delta(rumbo, b)) > BARCO_GRADOS) {
          barcoDesdeRef.current[i] = 0
          return
        }
        if (!barcoDesdeRef.current[i]) barcoDesdeRef.current[i] = ahora
        if (ahora - barcoDesdeRef.current[i] >= BARCO_MS) {
          hundidosRef.current = hundidosRef.current.map((v, j) => v || j === i)
          setHundidos(hundidosRef.current)
          penalizacionRef.current += BARCO_PENALIZACION_MS
          avisoHastaRef.current = ahora + 2500
          navigator.vibrate?.([60, 40, 60])
        }
      })

      // Los faros van de uno en uno: el buscado es el primero sin encender (orden de la semilla).
      const objetivo = encendidosRef.current.indexOf(false)
      let sujeto = 0
      if (objetivo >= 0 && Math.abs(delta(rumbo, faros[objetivo])) <= tolerancia) {
        if (sujetoDesdeRef.current === null) sujetoDesdeRef.current = ahora
        sujeto = Math.min(1, (ahora - sujetoDesdeRef.current) / mantenerMs)
        if (sujeto >= 1) {
          encendidosRef.current = encendidosRef.current.map((v, i) => v || i === objetivo)
          setEncendidos(encendidosRef.current)
          sujetoDesdeRef.current = null
          sujeto = 0
          navigator.vibrate?.([18, 30, 26])
          if (encendidosRef.current.every(Boolean)) setFase('hecho')
        }
      } else sujetoDesdeRef.current = null
      setVista({ rumbo, sujeto, aviso: ahora < avisoHastaRef.current ? 1 : 0 })
    }, 50)
    return () => window.clearInterval(id)
  }, [fase, botones, faros, barcos, tolerancia, mantenerMs])

  useEffect(() => {
    if (fase !== 'hecho') return
    registrarEvidencia(String(stage?.id ?? ''), {
      game: 'rumbo_doble',
      objetivos_ok: faros.length,
      barcos: hundidosRef.current.filter(Boolean).length,
    })
    if (botones)
      marcarModoAlternativo(stage?.id, sensor === 'sin_comprobar' ? 'no_disponible' : sensor)
    void onWin?.({
      type: 'bearing_hunt',
      penaltyMs: penalizacionDelModo(botones) + penalizacionRef.current,
      modo_alternativo: botones,
      status: 'locked',
      game_id: 'rumbo_doble',
      targetsCompleted: faros.length,
    })
  }, [fase]) // eslint-disable-line react-hooks/exhaustive-deps -- una sola vez al terminar

  const empezar = useCallback(async () => {
    if (!('DeviceMotionEvent' in window) && !('DeviceOrientationEvent' in window)) {
      setSensor('no_disponible')
      return
    }
    if (!(await pedirPermisos())) {
      setSensor('denegado')
      return
    }
    setSensor('disponible')
    rumboRef.current = 0
    setFase('jugando')
  }, [])

  const empezarBotones = useCallback(() => {
    setBotones(true)
    rumboRef.current = 0
    setFase('jugando')
  }, [])

  const ofrecerBotones = puedeUsarModoAlternativo(sensor, cfg.allow_touch_fallback !== false)
  const hechos = encendidos.filter(Boolean).length
  const objetivo = encendidos.indexOf(false)
  const jugando = fase === 'jugando'
  const temp: Temperatura =
    fase === 'hecho' || objetivo < 0
      ? 'ardiendo'
      : temperatura(delta(vista.rumbo, faros[objetivo]), tolerancia, hechos / total)
  // Con menos ayudas (niveles 4-5) caliente y templado se dicen igual.
  const tempVista: Temperatura = !ayudas && temp === 'caliente' ? 'templado' : temp
  const anilloHold = 2 * Math.PI * 17

  return (
    <div className="faros">
      <style>{ESTILOS}</style>
      <div className="faros-cabeza">
        <span className="faros-kicker">{tx.kicker}</span>
        <span className="faros-chip">
          {fase === 'reglas' ? tx.nFaros(total) : `${hechos}/${total}`}
        </span>
      </div>
      <h2>{tx.titulo}</h2>
      <div className="faros-escena">
        <svg
          viewBox={`0 0 ${D} ${D}`}
          role="img"
          aria-label={fase === 'reglas' ? tx.titulo : `${tx.temp[tempVista]} · ${hechos}/${total}`}
        >
          <defs>
            <radialGradient id="faros-mar">
              <stop offset="0" stopColor="#2c4a6b" />
              <stop offset="1" stopColor="#1b2c45" />
            </radialGradient>
            <linearGradient id="faros-haz" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#fde68a" stopOpacity=".55" />
              <stop offset="1" stopColor="#fde68a" stopOpacity=".05" />
            </linearGradient>
          </defs>
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="url(#faros-mar)"
            stroke="rgba(255,255,255,.18)"
            strokeWidth="2"
          />
          {[0.33, 0.66].map((k) => (
            <circle
              key={k}
              cx={C}
              cy={C}
              r={R * k}
              fill="none"
              stroke="rgba(255,255,255,.08)"
              strokeDasharray="3 5"
            />
          ))}
          <path
            d={`M${C - R * 0.18},${C - R * 0.05} q${R * 0.1},${-R * 0.16} ${R * 0.26},${-R * 0.04} q${R * 0.08},${R * 0.14} ${-R * 0.04},${R * 0.24} q${-R * 0.16},${R * 0.04} ${-R * 0.22},${-R * 0.2}Z`}
            fill="#2f5a3f"
          />
          {fase !== 'reglas' ? (
            <g transform={`rotate(${vista.rumbo.toFixed(1)} ${C} ${C})`}>
              <path
                d={`M${C},${C} L${C + R * Math.sin(-HAZ)},${C - R * Math.cos(HAZ)} A${R},${R} 0 0 1 ${C + R * Math.sin(HAZ)},${C - R * Math.cos(HAZ)} Z`}
                fill="url(#faros-haz)"
              />
              {jugando
                ? ONDAS[tempVista].map((rr, i) => (
                    <circle
                      key={rr}
                      cx={C}
                      cy={C - PUNTA}
                      r={rr}
                      fill="none"
                      style={{ stroke: COLOR[tempVista] }}
                      strokeWidth="2"
                      opacity={0.7 - i * 0.18}
                    />
                  ))
                : null}
              {vista.sujeto > 0 ? (
                <circle
                  cx={C}
                  cy={C - PUNTA}
                  r="17"
                  fill="none"
                  style={{ stroke: 'var(--theme-primary)' }}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${(anilloHold * vista.sujeto).toFixed(1)} 999`}
                  transform={`rotate(-90 ${C} ${C - PUNTA})`}
                />
              ) : null}
            </g>
          ) : null}
          {fase !== 'reglas'
            ? barcos.map((b, i) => {
                const [x, y] = enMar(b, R * 0.74)
                return hundidos[i] ? (
                  <circle key={`b${i}`} cx={x} cy={y} r="5" fill="rgba(248,113,113,.35)" />
                ) : (
                  <circle
                    key={`b${i}`}
                    className="faros-barco"
                    cx={x}
                    cy={y}
                    r="5"
                    fill="#f87171"
                  />
                )
              })
            : null}
          {faros.map((f, i) => {
            if (!encendidos[i]) return null
            const [x, y] = enMar(f, PUNTA)
            return (
              <g key={i} className="faros-luz">
                <circle cx={x} cy={y} r="14" fill="rgba(253,230,138,.28)" />
                <circle cx={x} cy={y} r="6" fill="#fde68a" />
              </g>
            )
          })}
          <circle
            cx={C}
            cy={C}
            r="9"
            style={{ fill: 'var(--theme-primary)' }}
            stroke="#fff"
            strokeWidth="3"
          />
          {PUNTOS.map((t, i) => {
            const [x, y] = enMar(i * 90, R - 12)
            return (
              <text
                key={t}
                x={x}
                y={y + 4}
                fill="rgba(248,250,252,.45)"
                fontSize="11"
                fontWeight="800"
                textAnchor="middle"
              >
                {t}
              </text>
            )
          })}
        </svg>

        {fase === 'reglas' ? (
          <>
            <p className="faros-linea">{tx.reglas(total)}</p>
            {ofrecerBotones ? (
              <>
                <p className="faros-aviso">{tx.sinSensor}</p>
                <button
                  type="button"
                  className="faros-boton"
                  onClick={empezarBotones}
                  disabled={submitting}
                >
                  {tx.jugarBotones}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="faros-boton"
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
              className="faros-estado"
              aria-live="polite"
              style={{
                color: fase === 'hecho' ? '#fde68a' : vista.aviso ? '#f87171' : COLOR[tempVista],
              }}
            >
              {fase === 'hecho' ? tx.hecho : vista.aviso ? tx.barco : tx.temp[tempVista]}
            </div>
            <div className="faros-sub">
              {fase === 'hecho' ? tx.hechoSub(total) : tx.encendidos(hechos, total)}
            </div>
            {botones && jugando ? (
              <div className="faros-giro">
                <button
                  type="button"
                  aria-label={tx.izquierda}
                  onPointerDown={() => (giroBotonRef.current = -GIRO_BOTONES_GRADOS_S)}
                  onPointerUp={() => (giroBotonRef.current = 0)}
                  onPointerLeave={() => (giroBotonRef.current = 0)}
                >
                  ⟲
                </button>
                <button
                  type="button"
                  aria-label={tx.derecha}
                  onPointerDown={() => (giroBotonRef.current = GIRO_BOTONES_GRADOS_S)}
                  onPointerUp={() => (giroBotonRef.current = 0)}
                  onPointerLeave={() => (giroBotonRef.current = 0)}
                >
                  ⟳
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default FarosRuntimeScreen

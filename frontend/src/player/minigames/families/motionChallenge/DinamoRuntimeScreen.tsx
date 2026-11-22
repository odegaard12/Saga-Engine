import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cabeceraRepetida } from '../../core/cabecera'
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
import { usePrefiereMenosMovimiento } from '../../../ui/movimiento'
import {
  baseCalibrada,
  enZona,
  fasesDinamo,
  intensidad,
  pasoDinamo,
  suavizar,
  type EstadoDinamo,
} from './dinamo'
import { CELEBRAR_MS, crearEscena, leerPaleta, type Escena, type EstadoEscena } from './escenaDinamo'

/**
 * Dinamo «La luz de la bici» (22/11/2026, propuesta C elegida por Óscar; antes «Generador de luz», 30/10).
 * Vas en bici de noche hacia una aldea: agitar es pedalear, y cuanto más rato vas al ritmo bueno más lejos alumbra el
 * faro. Cuando la luz llega a la aldea, sus ventanas se encienden, gira el molino y empieza el tramo siguiente.
 * Las reglas no cambian: se calibra el ritmo cómodo (3 s), cada tramo pide un ritmo (cuesta lento, bajada rápido) y
 * la carga sólo sube dentro de la zona; fuera baja despacio. Sin sensor (o sin permiso): pulsar al ritmo (+1 min).
 * El dibujo vive en escenaDinamo.ts (un lienzo; aquí sólo se le pasan los datos).
 */

interface Props {
  resolved: ResolvedMotionChallengeMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: (penaltyMs?: number) => Promise<void>
  /** 4/11: el reloj del nodo arranca al empezar a jugar, no al abrir (las reglas no cuentan). */
  onComezar?: () => void
}

type Fase = 'reglas' | 'calibrando' | 'jugando' | 'hecho'

const CALIBRAR_MS = 3000

const TX = {
  es: {
    titulo: 'Dinamo',
    kicker: 'Reto de movimiento',
    suave: 'Lento',
    rapido: 'Rápido',
    reglas:
      'Agita el móvil para pedalear. Cada tramo pide un ritmo (lento, rápido, lento): cuanto más rato vas al ritmo bueno, más lejos alumbra el faro. Cuando la luz llega a la aldea, tramo hecho.',
    empezar: 'Empezar · mido tu ritmo 3 s',
    calibrando: 'Pedalea a tu ritmo cómodo…',
    midiendo: (s: number) => `Midiendo tu ritmo · ${s} s`,
    fase: (a: number, b: number) => `Fase ${a} de ${b}`,
    nFases: (n: number) => `${n} fases`,
    tramo: (a: number, b: number) => `Tramo ${a} de ${b}`,
    ritmoLento: 'Cuesta: lento',
    ritmoRapido: 'Bajada: rápido',
    dentro: '¡Así!',
    masSuave: 'Más despacio',
    masFuerte: 'Más rápido',
    luzA: 'La luz llega hasta',
    luzB: (p: number) => `${p} % del camino`,
    tramoHecho: '¡Tramo hecho!',
    aldea: 'Se enciende la aldea',
    hecho: '¡Llegaste a la aldea!',
    sinSensor: 'Este móvil no da el movimiento. Puedes jugar pulsando al ritmo.',
    jugarTactil: 'Jugar pulsando (+1 min)',
    modoBoton: 'Modo botón · +1 min',
    pulsa: 'Pulsa al ritmo',
    permiso: 'Hace falta permiso de movimiento para jugar.',
  },
  gl: {
    titulo: 'Dínamo',
    kicker: 'Reto de movemento',
    suave: 'Lento',
    rapido: 'Rápido',
    reglas:
      'Axita o móbil para pedalear. Cada tramo pide un ritmo (lento, rápido, lento): canto máis tempo vas ao ritmo bo, máis lonxe alumea o faro. Cando a luz chega á aldea, tramo feito.',
    empezar: 'Comezar · mido o teu ritmo 3 s',
    calibrando: 'Pedalea ao teu ritmo cómodo…',
    midiendo: (s: number) => `Medindo o teu ritmo · ${s} s`,
    fase: (a: number, b: number) => `Fase ${a} de ${b}`,
    nFases: (n: number) => `${n} fases`,
    tramo: (a: number, b: number) => `Tramo ${a} de ${b}`,
    ritmoLento: 'Costa: lento',
    ritmoRapido: 'Baixada: rápido',
    dentro: 'Así!',
    masSuave: 'Máis amodo',
    masFuerte: 'Máis rápido',
    luzA: 'A luz chega ata',
    luzB: (p: number) => `${p} % do camiño`,
    tramoHecho: 'Tramo feito!',
    aldea: 'Acéndese a aldea',
    hecho: 'Chegaches á aldea!',
    sinSensor: 'Este móbil non dá o movemento. Podes xogar premendo ao ritmo.',
    jugarTactil: 'Xogar premendo (+1 min)',
    modoBoton: 'Modo botón · +1 min',
    pulsa: 'Preme ao ritmo',
    permiso: 'Fai falta permiso de movemento para xogar.',
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

/*
 * La escena es de noche en todos los temas: sus colores son variables --dn-* (las lee leerPaleta). La tarjeta de
 * alrededor, la franja y los chips siguen el tema (--mg-*).
 */
const ESTILOS = `
.dinamo {
  --dn-cielo-1: #040814;
  --dn-cielo-2: #0e1d3d;
  --dn-cielo-3: #2b3f6e;
  --dn-luna: #fffbe8;
  --dn-estrella: #e8eefc;
  --dn-monte-lejos: #1b2a4c;
  --dn-monte-medio: #0f1a31;
  --dn-suelo: #0a1322;
  --dn-arbol: #050a14;
  --dn-arbol-luz: #6b5530;
  --dn-asfalto: #161c2a;
  --dn-raya: #eef2f8;
  --dn-luz: #ffe7ad;
  --dn-luz-2: #ffc35c;
  --dn-ventana: #ffcc66;
  --dn-reflector: #ff7a33;
  --dn-niebla: #9fb3d9;
  --dn-agua: #3a6299;
  --dn-casa: #0b1220;
  --dn-metal: #56637d;
  --dn-luciernaga: #d9ff8a;
  --dn-cartel: #0b1222;
  --dn-cartel-texto: #f8fafc;
  --dn-cartel-borde: #fbbf24;
  display:flex; flex-direction:column; gap:10px; color:var(--mg-text);
}
.dinamo h2 { margin:0; }
.dn-cabeza { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.dn-kicker { font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--theme-primary); }
.dn-chip { font-size:12px; font-weight:800; padding:4px 10px; border-radius:99px; background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-borde); white-space:nowrap; }
.dn-tarjeta { background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-raya); border-radius:18px; padding:8px; }
.dn-escena { position:relative; height:clamp(230px, 46dvh, 400px); border-radius:14px; overflow:hidden; background:var(--dn-cielo-1); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dn-cielo-3) 60%, transparent); }
.dn-escena.corta { height:clamp(200px, 36dvh, 340px); }
.dn-escena canvas { display:block; width:100%; height:100%; }
.dn-cartel { position:absolute; top:10px; left:10px; padding:6px 10px 7px; border-radius:10px; background:color-mix(in srgb, var(--dn-cartel) 86%, transparent); border:1.5px solid var(--dn-cartel-borde); color:var(--dn-cartel-texto); box-shadow:0 4px 14px color-mix(in srgb, var(--dn-cielo-1) 70%, transparent); max-width:calc(100% - 20px); }
.dn-cartel small { display:block; font-size:10px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; color:var(--dn-cartel-borde); }
.dn-cartel b { display:block; font-size:15px; font-weight:900; white-space:nowrap; }
.dn-modo { position:absolute; top:10px; right:10px; padding:5px 9px; border-radius:99px; font-size:11px; font-weight:900; background:var(--dn-cartel-borde); color:var(--dn-cartel); white-space:nowrap; }
.dn-cartel + .dn-modo { top:auto; bottom:10px; right:10px; }
.dn-banda { display:flex; align-items:center; justify-content:center; gap:10px; min-height:54px; margin-top:8px; padding:6px 12px; border-radius:14px; border:2px solid var(--mg-line); background:var(--mg-cell); font-weight:900; font-size:21px; text-align:center; transition:background-color .25s, border-color .25s; }
.dn-banda.bien { background:var(--mg-good-fondo); border-color:var(--mg-good); }
.dn-banda.aviso { background:var(--mg-warn-fondo); border-color:var(--mg-warn); }
.dn-banda .ic { font-size:24px; line-height:1; }
.dn-banda.salta { animation:dnSalta .5s cubic-bezier(.3,1.6,.5,1); }
@keyframes dnSalta { 0% { transform:scale(.94); } 100% { transform:scale(1); } }
.dn-luzlinea { display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin:8px 4px 0; font-size:13px; color:var(--mg-text-2); min-height:22px; }
.dn-luzlinea b { font-size:17px; font-weight:900; color:var(--mg-text); white-space:nowrap; font-variant-numeric:tabular-nums; }
.dn-tramos { display:flex; gap:6px; margin-top:8px; }
.dn-tramos span { flex:1; min-width:0; text-align:center; font-size:12px; font-weight:800; padding:6px 4px; border-radius:9px; border:1px solid var(--mg-line); color:var(--mg-text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dn-tramos span.hecha { border-color:var(--mg-good); color:var(--mg-good); }
.dn-tramos span.ahora { background:var(--theme-primary); border-color:var(--theme-primary); color:var(--mg-on-primary); }
.dn-linea { text-align:center; font-size:14px; line-height:1.45; color:var(--mg-text-2); margin:10px 4px 0; }
.dn-aviso { text-align:center; font-size:13px; color:var(--mg-warn); margin:8px 0 0; }
.dn-boton { min-height:50px; border:0; border-radius:14px; background:var(--theme-primary); color:var(--mg-on-primary); font-weight:800; font-size:16px; width:100%; margin-top:12px; touch-action:manipulation; }
.dn-boton.secundario { background:var(--mg-cell); color:var(--mg-text); border:2px solid var(--theme-primary); }
.dn-tactil { min-height:84px; font-size:19px; user-select:none; -webkit-user-select:none; }
.dn-tactil:active { transform:scale(.98); }
/* Día pone el texto oscuro en toda la hoja con !important (mobile-themes.css, clase repetida): lo que va sobre la
   noche de la escena o sobre el acento recupera su color con más peso. */
.dinamo.dinamo.dinamo.dinamo.dinamo .dn-cartel b { color:var(--dn-cartel-texto) !important; }
.dinamo.dinamo.dinamo.dinamo.dinamo .dn-cartel small { color:var(--dn-cartel-borde) !important; }
.dinamo.dinamo.dinamo.dinamo.dinamo .dn-modo { color:var(--dn-cartel) !important; }
.dinamo.dinamo.dinamo.dinamo.dinamo .dn-tramos span.ahora { color:var(--mg-on-primary) !important; }
.dinamo.dinamo.dinamo.dinamo.dinamo .dn-tramos span.hecha { color:var(--mg-good) !important; }
.dinamo.dinamo.dinamo.dinamo.dinamo .dn-boton:not(.secundario) { color:var(--mg-on-primary) !important; }
@media (prefers-reduced-motion: reduce) { .dn-banda.salta { animation:none; } .dn-banda { transition:none; } .dn-tactil:active { transform:none; } }
`

export function DinamoRuntimeScreen({ resolved, stage, onWin, submitting, onComezar }: Props) {
  const { locale } = useI18n()
  const tx = TX[(locale as keyof typeof TX) in TX ? (locale as keyof typeof TX) : 'es']
  const cfg = resolved.config as unknown as Record<string, unknown>
  const fases = useMemo(
    () => fasesDinamo(Number(cfg.dinamo_fases) || 3, Number(cfg.dinamo_ancho) || 0.5),
    [cfg.dinamo_fases, cfg.dinamo_ancho]
  )
  const segundosPorFase = Math.max(5, Math.min(90, Number(cfg.dinamo_segundos) || 12))
  const permiteTactil = cfg.allow_touch_fallback !== false

  const [fase, setFase] = useState<Fase>('reglas')
  const [sensor, setSensor] = useState<EstadoDelSensor>('sin_comprobar')
  const [tactil, setTactil] = useState(false)
  const [vista, setVista] = useState<{
    rel: number
    estado: EstadoDinamo
    calib: number
    celebrando: boolean
  }>({
    rel: 0,
    estado: { fase: 0, carga: 0, enZonaMs: 0 },
    calib: 0,
    celebrando: false,
  })

  const medidaRef = useRef(0)
  const ultimaRef = useRef(0)
  const muestrasRef = useRef<number[]>([])
  const baseRef = useRef(1.2)
  const estadoRef = useRef<EstadoDinamo>({ fase: 0, carga: 0, enZonaMs: 0 })
  const inicioRef = useRef(0)
  const toqueRef = useRef(0)
  // 22/11: al terminar un tramo, la aldea se enciende y el juego espera ese momento (no carga ni descarga).
  const pausaRef = useRef(0)
  const limitador = useMemo(() => crearLimitadorDeToques(), [])
  const ganadoRef = useRef(false)
  // 22/11: un doble toque en «Empezar» pedía el permiso dos veces y arrancaba la calibración dos veces.
  const empezandoRef = useRef(false)
  // Antes se leía una vez al cargar el módulo: cambiarlo con el juego abierto no se notaba.
  const reducido = usePrefiereMenosMovimiento()

  // El lienzo: lo que pinta lo lee de aquí en cada fotograma (un único objeto, se reescribe).
  const marcoRef = useRef<HTMLDivElement | null>(null)
  const lienzoRef = useRef<HTMLCanvasElement | null>(null)
  const escenaRef = useRef<Escena | null>(null)
  const datosRef = useRef<EstadoEscena>({
    rel: 0,
    carga: 0,
    lenta: true,
    dentro: false,
    activo: false,
    celebrar: 0,
    hecho: false,
  })
  const animaRef = useRef(false)

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

  // El reloj del juego: 20 veces por segundo. El lienzo va aparte a 60 fps y suaviza entre lecturas.
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
      const datos = datosRef.current
      datos.rel = rel
      datos.activo = true
      if (fase === 'calibrando') {
        muestrasRef.current.push(valor)
        const progreso = Math.min(1, (ahora - inicioRef.current) / CALIBRAR_MS)
        datos.dentro = true
        datos.carga = 0
        setVista((v) => ({ ...v, calib: progreso, rel }))
        if (progreso >= 1) {
          baseRef.current = baseCalibrada(
            muestrasRef.current.slice(Math.floor(muestrasRef.current.length / 3)),
            tactil ? 1.5 : 1.2
          )
          setFase('jugando')
        }
        return
      }
      const celebrando = ahora < pausaRef.current
      if (!celebrando) {
        const antes = estadoRef.current.fase
        estadoRef.current = pasoDinamo(estadoRef.current, rel, dt, fases, segundosPorFase)
        if (estadoRef.current.fase > antes) {
          datos.celebrar = ahora
          pausaRef.current = ahora + CELEBRAR_MS
          navigator.vibrate?.(30)
        }
      }
      const actualAhora = fases[Math.min(estadoRef.current.fase, fases.length - 1)]
      datos.carga = estadoRef.current.carga
      datos.lenta = actualAhora.centro < 1
      datos.dentro = enZona(rel, actualAhora)
      setVista((v) => ({ ...v, rel, estado: estadoRef.current, celebrando: ahora < pausaRef.current }))
      if (estadoRef.current.fase >= fases.length && !ganadoRef.current) {
        ganadoRef.current = true
        datos.hecho = true
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
    // 15/11: sin penalización por fallo (0 s) a propósito: fuera de la zona verde la carga BAJA, así que el fallo ya cuesta
    // tiempo de juego. Sin sensor se queda en 60 s (no los 25 s de Faros/Pulso): tocar un botón es más fácil que agitar a ritmo.
    void onWin(penalizacionDelModo(tactil))
  }, [fase]) // eslint-disable-line react-hooks/exhaustive-deps -- una sola vez al terminar

  // El lienzo: se crea una vez y sigue el tamaño de su marco.
  useEffect(() => {
    const marco = marcoRef.current
    const lienzo = lienzoRef.current
    if (!marco || !lienzo) return undefined
    const escena = crearEscena(lienzo, leerPaleta(marco))
    if (!escena) return undefined
    escenaRef.current = escena
    const medir = () => {
      escena.redimensionar(marco.clientWidth, marco.clientHeight, Math.min(2, window.devicePixelRatio || 1))
      if (!animaRef.current) escena.dibujar(performance.now(), 0, datosRef.current, false)
    }
    medir()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null
    ro?.observe(marco)
    return () => {
      ro?.disconnect()
      escenaRef.current = null
    }
  }, [])

  // 60 fps mientras se pedalea (y al llegar); quieto en las reglas y con movimiento reducido. Pausa con la pestaña oculta.
  const animar = !reducido && fase !== 'reglas'
  useEffect(() => {
    animaRef.current = animar
    if (!animar) return undefined
    let id = 0
    let previo = performance.now()
    const fotograma = (ahora: number) => {
      escenaRef.current?.dibujar(ahora, ahora - previo, datosRef.current, true)
      previo = ahora
      id = requestAnimationFrame(fotograma)
    }
    const alCambiarVisibilidad = () => {
      cancelAnimationFrame(id)
      if (document.visibilityState === 'visible') {
        previo = performance.now()
        id = requestAnimationFrame(fotograma)
      }
    }
    id = requestAnimationFrame(fotograma)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      animaRef.current = false
    }
  }, [animar])
  // Sin animación, la escena se repinta quieta con cada lectura: la luz sigue creciendo.
  useEffect(() => {
    if (!animar) escenaRef.current?.dibujar(performance.now(), 0, datosRef.current, false)
  }, [animar, vista, fase])

  const empezar = useCallback(async () => {
    if (empezandoRef.current) return
    if (!('DeviceMotionEvent' in window)) {
      setSensor('no_disponible')
      return
    }
    empezandoRef.current = true
    const ok = await pedirPermiso().finally(() => (empezandoRef.current = false))
    if (!ok) {
      setSensor('denegado')
      return
    }
    setSensor('disponible')
    onComezar?.()
    muestrasRef.current = []
    inicioRef.current = performance.now()
    setFase('calibrando')
  }, [onComezar])

  const empezarTactil = useCallback(() => {
    setTactil(true)
    onComezar?.()
    muestrasRef.current = []
    inicioRef.current = performance.now()
    setFase('calibrando')
  }, [onComezar])

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
  const celebrando = jugando && vista.celebrando
  const dentro = jugando && enZona(vista.rel, actual)
  // Durante el momento de la aldea se sigue viendo el tramo que se acaba de terminar.
  const faseVista = celebrando ? Math.max(1, vista.estado.fase) : Math.min(vista.estado.fase + 1, fases.length)
  const tramoVista = faseVista
  const faseDelCartel = fases[tramoVista - 1] ?? actual
  const pct = hecho || celebrando ? 100 : Math.round(vista.estado.carga * 100)
  const ritmo = faseDelCartel.centro < 1 ? tx.ritmoLento : tx.ritmoRapido
  // 5/11: cada tramo dice su ritmo (cuesta lento / bajada rápido), que es lo que cambia de uno a otro.
  const ritmoAhora = actual.centro < 1 ? tx.ritmoLento : tx.ritmoRapido

  const banda: { texto: string; icono: string; clase: string } =
    fase === 'calibrando'
      ? { texto: tx.calibrando, icono: '🚲', clase: '' }
      : hecho
        ? { texto: tx.hecho, icono: '🏡', clase: 'bien salta' }
        : celebrando
          ? { texto: tx.tramoHecho, icono: '🏡', clase: 'bien salta' }
          : dentro
            ? { texto: tx.dentro, icono: '✓', clase: 'bien' }
            : actual.centro < vista.rel
              ? { texto: tx.masSuave, icono: '🐢', clase: 'aviso' }
              : { texto: tx.masFuerte, icono: '🐇', clase: 'aviso' }

  return (
    <div className="dinamo">
      <style>{ESTILOS}</style>
      <div className="dn-cabeza">
        <span className="dn-kicker">{cabeceraRepetida(tx.kicker, tx.titulo) ? '' : tx.kicker}</span>
        <span className="dn-chip">
          {/* 22/11: sólo la fase. Con el ritmo detrás, a 360 px el chip partía en dos renglones al empezar y toda la
              hoja bajaba 30 px; el ritmo ya lo dice el cartel de la escena. */}
          {fase === 'reglas' ? tx.nFases(fases.length) : tx.fase(faseVista, fases.length)}
        </span>
      </div>
      <h2>{tx.titulo}</h2>
      <div className="dn-tarjeta">
        <div
          ref={marcoRef}
          className={`dn-escena${tactil && !hecho ? ' corta' : ''}`}
          role="img"
          aria-label={`${tx.tramo(tramoVista, fases.length)} · ${ritmo} · ${tx.luzA} ${tx.luzB(pct)}`}
        >
          <canvas ref={lienzoRef} aria-hidden="true" />
          <div className="dn-cartel" aria-hidden="true">
            <small>{tx.tramo(hecho ? fases.length : tramoVista, fases.length)}</small>
            <b>
              {faseDelCartel.centro < 1 ? '⛰ ' : '↘ '}
              {fase === 'reglas' || fase === 'calibrando' ? ritmoAhora : ritmo}
            </b>
          </div>
          {tactil ? <span className="dn-modo">👆 {tx.modoBoton}</span> : null}
        </div>

        {fase === 'reglas' ? (
          <>
            <p className="dn-linea">{tx.reglas}</p>
            {sensor === 'denegado' ? <p className="dn-aviso">{tx.permiso}</p> : null}
            {ofrecerTactil ? (
              <>
                {/* 22/11: con el permiso denegado ya sale el aviso del permiso; «este móvil no da el movimiento» lo contradecía. */}
                {sensor !== 'denegado' ? <p className="dn-aviso">{tx.sinSensor}</p> : null}
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
              key={banda.clase.includes('salta') ? `salta-${vista.estado.fase}` : 'banda'}
              className={`dn-banda ${banda.clase}`}
              aria-live="polite"
            >
              <span className="ic" aria-hidden="true">
                {banda.icono}
              </span>
              <span>{banda.texto}</span>
            </div>
            <div className="dn-luzlinea">
              {fase === 'calibrando' ? (
                <span>{tx.midiendo(Math.max(1, Math.ceil(3 - vista.calib * 3)))}</span>
              ) : celebrando || hecho ? (
                <>
                  <span>{tx.aldea}</span>
                  <b>100 %</b>
                </>
              ) : (
                <>
                  <span>{tx.luzA}</span>
                  <b>{tx.luzB(pct)}</b>
                </>
              )}
            </div>
            <div className="dn-tramos" aria-hidden="true">
              {fases.map((f, i) => {
                const hechaYa = i < vista.estado.fase || hecho
                return (
                  <span
                    key={i}
                    className={
                      hechaYa
                        ? 'hecha'
                        : i === vista.estado.fase && jugando && !celebrando
                          ? 'ahora'
                          : ''
                    }
                  >
                    {hechaYa ? '✓ ' : ''}
                    {i + 1} · {f.centro < 1 ? tx.suave : tx.rapido}
                  </span>
                )
              })}
            </div>
            {tactil && !hecho ? (
              <button
                type="button"
                className="dn-boton secundario dn-tactil"
                onPointerDown={pulsar}
              >
                <span aria-hidden="true">👆 </span>
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

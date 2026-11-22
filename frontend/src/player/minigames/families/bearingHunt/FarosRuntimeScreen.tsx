import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cabeceraRepetida } from '../../core/cabecera'
import { useI18n } from '../../../../i18n/useI18n'
import { avisarPeticionDePermisoPropia } from '../../../utils/permissionPromptGuard'
import { registrarEvidencia } from '../../../avance/evidencia'
import {
  ESPERA_SENSOR_MUDO_MS,
  marcarModoAlternativo,
  PENALIZACION_MODO_ALTERNATIVO_LENTO_MS,
  penalizacionDelModo,
  puedeUsarModoAlternativo,
  type EstadoDelSensor,
} from '../../core/modoAlternativo'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { semillaDelIntento } from '../sequenceCode/semilla'
import { usePrefiereMenosMovimiento } from '../../../ui/movimiento'
import {
  delta,
  enPanorama,
  generarFaros,
  generarSenuelos,
  giroVertical,
  normalizar,
  temperatura,
  type Temperatura,
} from './faros'

/**
 * Faros «Mirando al mar» (22/11/2026, propuesta B elegida por Óscar; antes «Radar del cabo», vista cenital). Ves el mar
 * de frente, como desde la ventana del faro: al girar tú, el horizonte (una franja de 360°) se desliza y la mirilla del
 * centro es hacia donde apuntas. Los faros se encienden de uno en uno manteniendo la mirilla 3 s (si te sales, el aro
 * vuelve a cero); las pistas se debilitan con cada faro y las luces rojas son barcos señuelo (+10 s si los iluminas).
 * El faro buscado no se ve hasta tenerlo en la mirilla; los encendidos se quedan en el horizonte. El giro es RELATIVO
 * a donde se empezó (giroscopio): sin brújula, no falla con metal cerca. Sin sensor: girar con dos botones (+25 s).
 */

type AnyRecord = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- mismas props que la familia
type Props = {
  resolved?: AnyRecord
  stage?: AnyRecord
  submitting?: boolean
  onWin?: (r?: AnyRecord) => void | Promise<void>
  /** 4/11: el reloj del nodo arranca al empezar a jugar, no al abrir (las reglas no cuentan). */
  onComezar?: () => void
}
type Fase = 'reglas' | 'jugando' | 'hecho'

/** Sentido del giro integrado (gravedad y giroscopio vienen con signos distintos según el sistema): el ajuste. */
const SIGNO_GIRO = -1
const GIRO_BOTONES_GRADOS_S = 70
/** Un barco cuenta como iluminado con el haz encima (±7°) 1,2 s seguidos: pasar por encima girando no cuenta. */
const BARCO_GRADOS = 7
const BARCO_MS = 1200
/** 15/11: unidad común de penalización, 10 s por fallo (antes 15 s). */
const BARCO_PENALIZACION_MS = 10000
/** Grados de horizonte que caben de lado a lado de la escena. */
const CAMPO = 120
/** Cuánto se acerca por segundo lo pintado al rumbo real (suaviza el temblor del sensor y los pasos de 20 Hz). */
const SUAVIZADO = 14
const MARCAS = Array.from({ length: 24 }, (_, i) => i * 15)
const ANILLO = 2 * Math.PI * 23

const TX = {
  es: {
    titulo: 'Faros',
    kicker: 'Reto de giro',
    reglas: (n: number, s: number) =>
      `Gira con el móvil y enciende ${n} faros: mantén la mirilla ${s} s sobre cada uno. Evita las luces rojas.`,
    nFaros: (n: number) => `${n} faros`,
    empezar: 'Empezar',
    temp: {
      frio: 'Frío',
      templado: 'Templado',
      caliente: 'Caliente',
      ardiendo: '¡Aquí!',
    } as Record<Temperatura, string>,
    pista: {
      frio: 'Frío · sigue girando',
      templado: 'Templado · te acercas',
      caliente: 'Caliente · gira despacio',
      ardiendo: '¡Aquí!',
    } as Record<Temperatura, string>,
    quieto: (s: number) => `¡Aquí! Quieto ${s} s más`,
    encendidos: (a: number, b: number) => `${a} de ${b} faros`,
    leyenda: 'Rojo = barco. No lo alumbres (+10 s)',
    barco: '¡Era un barco! +10 s',
    hecho: '¡El cabo está a salvo!',
    sinSensor: 'Este móvil no da el giro. Puedes girar con los botones.',
    // 22/11: con el permiso denegado el móvil SÍ tiene sensor: se dice qué pasó y cómo volver a darlo.
    permisoTitulo: 'Permiso de movimiento denegado',
    permiso:
      'Sin él no se nota cuándo giras. Para darlo otra vez: cierra esta pestaña, vuelve a abrir la web y pulsa «Permitir». En iPhone, mira también Ajustes › Safari › Movimiento y orientación.',
    jugarBotones: 'Jugar con botones (+25 s)',
    // 15/11: la franja es RELATIVA a donde empezaste (no hay norte): frente / derecha / atrás / izquierda.
    puntos: ['Frente', 'Derecha', 'Atrás', 'Izquierda'],
    izquierda: 'Girar a la izquierda',
    derecha: 'Girar a la derecha',
  },
  gl: {
    titulo: 'Faros',
    kicker: 'Reto de xiro',
    reglas: (n: number, s: number) =>
      `Xira co móbil e acende ${n} faros: mantén a mira ${s} s sobre cada un. Evita as luces vermellas.`,
    nFaros: (n: number) => `${n} faros`,
    empezar: 'Comezar',
    temp: {
      frio: 'Frío',
      templado: 'Morno',
      caliente: 'Quente',
      ardiendo: 'Aquí!',
    } as Record<Temperatura, string>,
    pista: {
      frio: 'Frío · segue xirando',
      templado: 'Morno · achégaste',
      caliente: 'Quente · xira amodo',
      ardiendo: 'Aquí!',
    } as Record<Temperatura, string>,
    quieto: (s: number) => `Aquí! Quieto ${s} s máis`,
    encendidos: (a: number, b: number) => `${a} de ${b} faros`,
    leyenda: 'Vermello = barco. Non o alumees (+10 s)',
    barco: 'Era un barco! +10 s',
    hecho: 'O cabo está a salvo!',
    sinSensor: 'Este móbil non dá o xiro. Podes xirar cos botóns.',
    permisoTitulo: 'Permiso de movemento denegado',
    permiso:
      'Sen el non se nota cando xiras. Para dalo outra vez: pecha esta lapela, volve abrir a web e preme «Permitir». No iPhone, mira tamén Axustes › Safari › Movemento e orientación.',
    jugarBotones: 'Xogar con botóns (+25 s)',
    puntos: ['Fronte', 'Dereita', 'Atrás', 'Esquerda'],
    izquierda: 'Xirar á esquerda',
    derecha: 'Xirar á dereita',
  },
}

const ORDEN: Temperatura[] = ['frio', 'templado', 'caliente', 'ardiendo']

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

// Olas y estrellas: baldosas SVG repetidas (colores con nombre, sin hex). Se deslizan con el giro (transform, sin
// repintar) y derivan solas con una animación CSS; con «menos movimiento» sólo siguen al giro.
const ola = (ancho: number, alto: number, grosor: number, opacidad: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${ancho}' height='${alto * 2}'><g fill='none' stroke='lightsteelblue' stroke-width='${grosor}' stroke-linecap='round' stroke-opacity='${opacidad}'><path d='M0 ${alto / 2} Q${ancho / 4} ${alto / 2 - alto / 3} ${ancho / 2} ${alto / 2} T${ancho} ${alto / 2}'/><path d='M${-ancho / 2} ${alto * 1.5} Q${-ancho / 4} ${alto * 1.5 - alto / 3} 0 ${alto * 1.5} T${ancho / 2} ${alto * 1.5} T${ancho} ${alto * 1.5} T${ancho * 1.5} ${alto * 1.5}'/></g></svg>`
  )}")`

const ESTILOS = `
.faros {
  --fs-cielo-1: #030817;
  --fs-cielo-2: #0a1733;
  --fs-cielo-3: #1a3463;
  --fs-mar-1: #0c2142;
  --fs-mar-2: #040b1b;
  --fs-luz: #fde68a;
  --fs-luz-viva: #fde047;
  --fs-luz-suave: rgba(253, 230, 138, 0.38);
  --fs-luz-nada: rgba(253, 230, 138, 0);
  --fs-brillo: rgba(253, 224, 71, 0.75);
  --fs-torre: #e2e8f0;
  --fs-banda: #ef4444;
  --fs-roca: #0b1220;
  --fs-casco: #1e293b; /* no-tema: la escena es de noche en todos los temas */
  --fs-barco: #f87171;
  --fs-raya: rgba(226, 232, 240, 0.3);
  --fs-texto: rgba(248, 250, 252, 0.86);
  --fs-sombra: rgba(2, 6, 18, 0.72);
  --fs-boton: rgba(15, 23, 42, 0.62); /* no-tema: la escena es de noche en todos los temas */
  --fs-tinta: #111827;
  --fs-frio: #7dd3fc;
  --fs-templado: #fbbf24;
  --fs-caliente: #fb923c;
  --fs-aqui: #fde047;
  display:flex; flex-direction:column; gap:10px; color:var(--mg-text);
}
.faros h2 { margin:0; }
.faros-cabeza { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.faros-kicker { font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--theme-primary); }
.faros-chip { font-size:12px; font-weight:800; padding:4px 10px; border-radius:99px; background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-borde); }
.faros-tarjeta { background:var(--saga-pizarra-tarjeta); border:1px solid var(--saga-pizarra-raya, var(--saga-pizarra-borde)); border-radius:18px; padding:8px; display:flex; flex-direction:column; gap:10px; }

.faros-escena { position:relative; height:clamp(180px, 34dvh, 290px); border-radius:13px; overflow:hidden; isolation:isolate;
  background:linear-gradient(180deg, var(--fs-cielo-1) 0%, var(--fs-cielo-2) 30%, var(--fs-cielo-3) 50%, var(--fs-mar-1) 50%, var(--fs-mar-2) 100%); }
.faros-capa { position:absolute; left:-220px; right:-220px; will-change:transform; pointer-events:none; }
.faros-capa > i { position:absolute; inset:0; background-repeat:repeat; }
.faros-estrellas { top:0; height:46%; }
.faros-estrellas > i { background-size:170px 74px; opacity:.75;
  background-image:radial-gradient(1.2px 1.2px at 18px 14px, white 60%, transparent), radial-gradient(1px 1px at 64px 40px, white 60%, transparent),
  radial-gradient(1.4px 1.4px at 121px 22px, white 60%, transparent), radial-gradient(1px 1px at 150px 58px, white 60%, transparent),
  radial-gradient(.9px .9px at 92px 66px, white 60%, transparent), radial-gradient(.9px .9px at 38px 52px, white 60%, transparent); }
.faros-estrellas > i + i { background-size:230px 90px; opacity:.5; animation:farosTitila 4.5s ease-in-out infinite;
  background-image:radial-gradient(1px 1px at 40px 20px, white 60%, transparent), radial-gradient(1.3px 1.3px at 170px 48px, white 60%, transparent),
  radial-gradient(.9px .9px at 110px 74px, white 60%, transparent); }
.faros-bruma { position:absolute; left:0; right:0; top:36%; height:14%; pointer-events:none;
  background:linear-gradient(180deg, transparent, color-mix(in srgb, var(--fs-cielo-3) 70%, var(--fs-frio) 12%)); opacity:.7; }
.faros-horizonte { position:absolute; left:0; right:0; top:50%; height:1px; background:var(--fs-raya); }
.faros-olas-1 { top:50.5%; height:11%; } .faros-olas-1 > i { background-image:${ola(56, 6, 1, 0.2)}; animation:farosDeriva1 9s linear infinite; }
.faros-olas-2 { top:61%; height:15%; } .faros-olas-2 > i { background-image:${ola(120, 11, 1.3, 0.2)}; animation:farosDeriva2 11s linear infinite; }
.faros-olas-3 { top:75%; height:25%; } .faros-olas-3 > i { background-image:${ola(200, 18, 1.8, 0.18)}; animation:farosDeriva3 13s linear infinite; }
@keyframes farosDeriva1 { to { transform:translate3d(-56px,0,0); } }
@keyframes farosDeriva2 { 0% { transform:translate3d(0,0,0); } 50% { transform:translate3d(-60px,1.5px,0); } 100% { transform:translate3d(-120px,0,0); } }
@keyframes farosDeriva3 { 0% { transform:translate3d(0,0,0); } 50% { transform:translate3d(-100px,2.5px,0); } 100% { transform:translate3d(-200px,0,0); } }
@keyframes farosTitila { 50% { opacity:.15; } }

.faros-cono { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; filter:blur(1.5px); opacity:.55; transition:opacity .3s; }
.faros-escena[data-temp="templado"] .faros-cono { opacity:.7; }
.faros-escena[data-temp="caliente"] .faros-cono { opacity:.85; }
.faros-escena[data-temp="ardiendo"] .faros-cono { opacity:1; }

.faros-obj { position:absolute; inset:0; pointer-events:none; visibility:hidden; will-change:transform; }
.faros-obj > div { position:absolute; left:50%; top:50%; transform:translate(-50%,-100%); }
.faros-obj > .faros-en-agua { transform:translate(-50%,-62%); }
.faros-faro { display:block; overflow:visible; }
.faros-faro .t { fill:var(--fs-torre); } .faros-faro .b { fill:var(--fs-banda); } .faros-faro .r { fill:var(--fs-roca); }
.faros-faro .l { fill:var(--fs-luz); } .faros-faro .k { fill:var(--fs-roca); }
.faros-haz-i { fill:url(#faros-haz-i); } .faros-haz-d { fill:url(#faros-haz-d); }
.faros-haz-i { animation:farosGira 3.2s ease-in-out infinite; } .faros-haz-d { animation:farosGira 3.2s ease-in-out -1.6s infinite; }
@keyframes farosGira { 0%,100% { opacity:.1; } 50% { opacity:.85; } }
.faros-silueta { opacity:0; transition:opacity .35s; }
.faros-silueta.ver { opacity:1; }
.faros-silueta path, .faros-silueta rect { fill:none; stroke:var(--fs-texto); stroke-width:1.2; stroke-linejoin:round; }
.faros-barco { display:block; overflow:visible; animation:farosMece 2.6s ease-in-out infinite; transform-origin:50% 80%; }
.faros-barco .c { fill:var(--fs-casco); stroke:var(--fs-raya); stroke-width:.8; } .faros-barco .m { stroke:var(--fs-texto); stroke-width:1.2; }
.faros-barco .z { fill:var(--fs-barco); } .faros-barco .zr { fill:var(--fs-barco); opacity:.35; }
.faros-barco.hundido { animation:none; opacity:.4; transform:translateY(5px) rotate(18deg); }
@keyframes farosMece { 0%,100% { transform:translateY(0) rotate(-3deg); } 50% { transform:translateY(1.6px) rotate(3deg); } }

.faros-brujula { position:absolute; left:0; right:0; bottom:0; height:26px; pointer-events:none; border-top:1px solid var(--fs-raya);
  background:var(--fs-sombra); -webkit-mask-image:linear-gradient(90deg, transparent, black 14%, black 86%, transparent); mask-image:linear-gradient(90deg, transparent, black 14%, black 86%, transparent); }
.faros-brujula .faros-obj > div { top:0; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; }
.faros-marca { width:1px; height:5px; background:var(--fs-raya); }
.faros-marca.m45 { height:9px; background:var(--fs-texto); }
.faros-punto { font-size:11px; font-weight:800; color:var(--fs-texto); line-height:1; margin-top:4px; white-space:nowrap; letter-spacing:.02em; }
.faros-flecha { position:absolute; left:50%; top:-3px; transform:translateX(-50%); width:0; height:0;
  border-left:6px solid transparent; border-right:6px solid transparent; border-top:7px solid var(--fs-luz-viva); }

.faros-mirilla { position:absolute; left:50%; top:50%; width:64px; height:64px; transform:translate(-50%,-50%); pointer-events:none;
  filter:drop-shadow(0 0 5px var(--fs-brillo)); overflow:visible; }
.faros-mirilla .centro { fill:var(--fs-luz-viva); }
.faros-mirilla .aro { fill:none; stroke:var(--fs-luz-viva); stroke-width:2.4; }
.faros-mirilla .cruz { stroke:var(--fs-luz-viva); stroke-width:2.4; stroke-linecap:round; }
.faros-mirilla .pista { fill:none; stroke:var(--fs-luz-suave); stroke-width:4; opacity:0; transition:opacity .25s; }
.faros-mirilla .carga { fill:none; stroke:var(--fs-luz-viva); stroke-width:4.5; stroke-linecap:round; transition:stroke-dashoffset 60ms linear; }
.faros-escena[data-temp="ardiendo"] .faros-mirilla .pista { opacity:1; }

.faros-giro { position:absolute; left:10px; right:10px; bottom:36px; display:flex; justify-content:space-between; pointer-events:none; }
.faros-giro button { pointer-events:auto; width:58px; height:58px; border-radius:50%; background:var(--fs-boton); border:1px solid var(--fs-raya); color:var(--fs-texto); font-size:26px; font-weight:800; line-height:1; touch-action:none; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); }
.faros-giro button:active { background:var(--fs-luz-suave); }

.faros-estado { box-sizing:border-box; border-radius:13px; padding:8px 12px; min-height:50px; display:flex; align-items:center; justify-content:center; text-align:center;
  font-weight:900; font-size:19px; line-height:1.15; color:var(--fs-tinta); background:var(--fs-frio); transition:background-color .25s; }
.faros-estado[data-temp="templado"] { background:var(--fs-templado); }
.faros-estado[data-temp="caliente"] { background:var(--fs-caliente); }
.faros-estado[data-temp="ardiendo"], .faros-estado[data-temp="hecho"] { background:var(--fs-aqui); }
.faros-estado[data-temp="barco"] { background:var(--fs-barco); }
.faros-termo { display:grid; grid-template-columns:repeat(4, 1fr); gap:5px; }
.faros-termo span { min-height:30px; display:flex; align-items:center; justify-content:center; border-radius:9px; font-size:12px; font-weight:800;
  border:1px solid var(--saga-pizarra-borde); opacity:.72; }
.faros-termo span.on { opacity:1; border-color:transparent; color:var(--fs-tinta); }
.faros-termo span.on.frio { background:var(--fs-frio); } .faros-termo span.on.templado { background:var(--fs-templado); }
.faros-termo span.on.caliente { background:var(--fs-caliente); } .faros-termo span.on.ardiendo { background:var(--fs-aqui); }
.faros-termo span.ya { box-shadow:0 0 0 2px var(--mg-text); }
.faros-fila { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; border-radius:11px; border:1px solid var(--saga-pizarra-borde); }
.faros-fila b { font-size:13px; white-space:nowrap; }
.faros-iconos { display:flex; gap:4px; }
.faros-icono { width:18px; height:28px; display:block; }
.faros-icono path, .faros-icono rect { fill:none; stroke:currentColor; stroke-width:1.3; stroke-linejoin:round; opacity:.6; }
.faros-icono.on path, .faros-icono.on rect { fill:var(--fs-luz); stroke:var(--fs-tinta); stroke-width:.8; opacity:1; }
.faros-icono.on .lin { fill:var(--fs-luz-viva); }
.faros-leyenda { display:flex; align-items:center; justify-content:center; gap:6px; font-size:12.5px; margin:0; opacity:.85; text-align:center; }
.faros-leyenda i { width:9px; height:9px; border-radius:50%; background:var(--fs-barco); flex:none; }
.faros-linea { text-align:center; font-size:14px; line-height:1.4; opacity:.85; margin:0; }
.faros-aviso { text-align:center; font-size:13px; color:var(--mg-warn); margin:0; }
.faros-permiso { border:1px solid var(--mg-warn); border-radius:12px; padding:10px 12px; font-size:13px; line-height:1.4; text-align:left; }
.faros-permiso b { display:block; color:var(--mg-warn); font-size:14px; margin-bottom:2px; }
.faros-boton { min-height:50px; border:0; border-radius:14px; background:var(--theme-primary); color:var(--mg-on-primary); font-weight:800; font-size:16px; width:100%; }
@media (prefers-reduced-motion: reduce) {
  .faros-capa > i, .faros-haz-i, .faros-haz-d, .faros-barco { animation:none !important; }
  .faros-haz-i, .faros-haz-d { opacity:.45; }
}
`

/** Faro de rayas sobre su roca; el haz de los encendidos gira (dos abanicos que se alternan). */
function Faro({ encendido }: { encendido: boolean }) {
  return (
    <svg className="faros-faro" width="150" height="40" viewBox="-64 0 150 40" aria-hidden="true">
      {encendido ? (
        <>
          <polygon className="faros-haz-i" points="11,8 -64,2 -64,14" />
          <polygon className="faros-haz-d" points="11,8 86,2 86,14" />
        </>
      ) : null}
      <path className="r" d="M2 40 Q4 34 11 34 Q18 34 20 40Z" />
      <path className="t" d="M7.2 35 L8.6 13 H13.4 L14.8 35Z" />
      <path className="b" d="M7.6 29 L7.9 25 H14.1 L14.4 29Z M8.3 19.5 L8.5 16.5 H13.5 L13.7 19.5Z" />
      <rect className="k" x="6.6" y="11.4" width="8.8" height="1.8" rx=".6" />
      <rect className={encendido ? 'l' : 'k'} x="8.6" y="6" width="4.8" height="5.4" rx=".8" />
      <path className="k" d="M7.8 6 H14.2 L11 2.4Z" />
    </svg>
  )
}

/** El faro buscado, sólo el contorno: aparece al tenerlo en la mirilla. */
function Silueta({ ver }: { ver: boolean }) {
  return (
    <svg className={`faros-faro faros-silueta${ver ? ' ver' : ''}`} width="22" height="40" viewBox="0 0 22 40" aria-hidden="true">
      <path d="M7.2 35 L8.6 13 H13.4 L14.8 35Z" />
      <rect x="8.6" y="6" width="4.8" height="5.4" rx=".8" />
      <path d="M7.8 6 H14.2 L11 2.4Z M3 39 Q5 35 11 35 Q17 35 19 39" />
    </svg>
  )
}

function Barco({ hundido, i }: { hundido: boolean; i: number }) {
  return (
    <svg
      className={`faros-barco${hundido ? ' hundido' : ''}`}
      style={{ animationDelay: `${-i * 0.9}s` }}
      width="30"
      height="22"
      viewBox="0 0 30 22"
      aria-hidden="true"
    >
      <line className="m" x1="14" y1="15" x2="14" y2="4" />
      <path className="c" d="M2 14 H28 L24 20 H6Z" />
      <rect className="c" x="9" y="10" width="8" height="4" rx="1" />
      {hundido ? null : (
        <>
          <circle className="z" cx="14" cy="3.6" r="2.8" />
          <rect className="zr" x="12.6" y="20.5" width="2.8" height="1.5" rx=".7" />
        </>
      )}
    </svg>
  )
}

function Icono({ on }: { on: boolean }) {
  return (
    <svg className={`faros-icono${on ? ' on' : ''}`} viewBox="0 0 18 28" aria-hidden="true">
      <path d="M5 26 L6.4 10 H11.6 L13 26Z" />
      <rect className="lin" x="6.4" y="4" width="5.2" height="5" rx="1" />
      <path d="M5.6 4 H12.4 L9 1Z" />
    </svg>
  )
}

export function FarosRuntimeScreen({ resolved, stage, submitting, onWin, onComezar }: Props) {
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
  // 22/11: el horizonte se pinta con el giro SIN normalizar (sumando el paso más corto): las capas de olas y estrellas
  // se deslizan seguidas al pasar de 359° a 0°, sin saltar.
  const giroPintadoRef = useRef(0)
  const escenaRef = useRef<HTMLDivElement>(null)
  // Un doble toque en «Empezar» pedía los permisos dos veces.
  const empezandoRef = useRef(false)
  const reducido = usePrefiereMenosMovimiento()
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

  // 14/11: con la página oculta el intervalo se suspende pero las marcas «desde» se conservaban (`performance.now()` sigue
  // corriendo): si el haz estaba sobre el faro buscado (o sobre un señuelo), al volver contaba como si se hubiera
  // sostenido todo ese rato (faro encendido al instante; barco hundido y penalización por una llamada).
  useEffect(() => {
    if (fase !== 'jugando') return undefined
    const alOcultarse = () => {
      if (document.visibilityState !== 'hidden') return
      sujetoDesdeRef.current = null
      barcoDesdeRef.current = barcos.map(() => 0)
    }
    document.addEventListener('visibilitychange', alOcultarse)
    return () => document.removeEventListener('visibilitychange', alOcultarse)
  }, [fase, barcos])

  // 20 veces por segundo: la pista, si se sujeta sobre el faro buscado y si se ilumina un barco.
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

  // El horizonte, a cada fotograma y sin pasar por React: lo pintado se acerca al rumbo real por el paso más corto y
  // cada cosa del horizonte (faros, barcos, marcas) se coloca con `enPanorama`; olas y estrellas se deslizan con el
  // giro sin normalizar, en módulo su baldosa, así que dar la vuelta entera no se nota.
  useEffect(() => {
    const escena = escenaRef.current
    if (!escena) return undefined
    const cosas = Array.from(escena.querySelectorAll<HTMLElement>('[data-rumbo]'), (el) => ({
      el,
      rumbo: Number(el.dataset.rumbo),
      visible: false,
    }))
    const capas = Array.from(escena.querySelectorAll<HTMLElement>('[data-baldosa]'), (el) => ({
      el,
      baldosa: Number(el.dataset.baldosa),
    }))
    let id = 0
    let previo = performance.now()
    const pintar = () => {
      const ancho = escena.clientWidth
      const rumbo = normalizar(giroPintadoRef.current)
      for (const c of cosas) {
        const x = enPanorama(rumbo, c.rumbo, CAMPO)
        if (x === null) {
          if (c.visible) c.el.style.visibility = 'hidden'
          c.visible = false
          continue
        }
        if (!c.visible) c.el.style.visibility = 'visible'
        c.visible = true
        c.el.style.transform = `translate3d(${(x * 100).toFixed(2)}%,0,0)`
      }
      const px = (-giroPintadoRef.current / CAMPO) * ancho
      for (const c of capas) {
        const t = c.baldosa
        c.el.style.transform = `translate3d(${(((px % t) + t) % t).toFixed(1)}px,0,0)`
      }
    }
    const paso = (ahora: number) => {
      const k = reducido ? 1 : Math.min(1, ((ahora - previo) / 1000) * SUAVIZADO)
      previo = ahora
      giroPintadoRef.current += delta(normalizar(giroPintadoRef.current), rumboRef.current) * k
      pintar()
      if (fase === 'jugando') id = requestAnimationFrame(paso)
    }
    if (fase === 'jugando') id = requestAnimationFrame(paso)
    else pintar()
    return () => cancelAnimationFrame(id)
  }, [fase, reducido, encendidos, hundidos])

  useEffect(() => {
    if (fase !== 'hecho') return
    registrarEvidencia(String(stage?.id ?? ''), {
      game: 'rumbo_doble',
      objetivos_ok: faros.length,
      barcos: hundidosRef.current.filter(Boolean).length,
    })
    if (botones)
      marcarModoAlternativo(
        stage?.id,
        sensor === 'sin_comprobar' ? 'no_disponible' : sensor,
        PENALIZACION_MODO_ALTERNATIVO_LENTO_MS
      )
    void onWin?.({
      type: 'bearing_hunt',
      penaltyMs: penalizacionDelModo(botones, 0, PENALIZACION_MODO_ALTERNATIVO_LENTO_MS) + penalizacionRef.current,
      modo_alternativo: botones,
      status: 'locked',
      game_id: 'rumbo_doble',
      targetsCompleted: faros.length,
    })
  }, [fase]) // eslint-disable-line react-hooks/exhaustive-deps -- una sola vez al terminar

  const empezar = useCallback(async () => {
    if (empezandoRef.current) return
    if (!('DeviceMotionEvent' in window) && !('DeviceOrientationEvent' in window)) {
      setSensor('no_disponible')
      return
    }
    empezandoRef.current = true
    const ok = await pedirPermisos().finally(() => (empezandoRef.current = false))
    if (!ok) {
      setSensor('denegado')
      return
    }
    setSensor('disponible')
    onComezar?.()
    rumboRef.current = 0
    setFase('jugando')
  }, [onComezar])

  const empezarBotones = useCallback(() => {
    setBotones(true)
    onComezar?.()
    rumboRef.current = 0
    setFase('jugando')
  }, [onComezar])

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
  const segundos = Math.max(1, Math.ceil(((1 - vista.sujeto) * mantenerMs) / 1000))
  const estado =
    fase === 'hecho'
      ? 'hecho'
      : vista.aviso
        ? 'barco'
        : tempVista
  const textoEstado =
    fase === 'hecho'
      ? tx.hecho
      : vista.aviso
        ? tx.barco
        : tempVista === 'ardiendo'
          ? tx.quieto(segundos)
          : tx.pista[tempVista]

  return (
    <div className="faros">
      <style>{ESTILOS}</style>
      <div className="faros-cabeza">
        <span className="faros-kicker">{cabeceraRepetida(tx.kicker, tx.titulo) ? '' : tx.kicker}</span>
        <span className="faros-chip">
          {fase === 'reglas' ? tx.nFaros(total) : `${hechos}/${total}`}
        </span>
      </div>
      <h2>{tx.titulo}</h2>
      <div className="faros-tarjeta">
        <div
          ref={escenaRef}
          className="faros-escena"
          data-temp={jugando ? tempVista : 'frio'}
          role="img"
          aria-label={fase === 'reglas' ? tx.titulo : `${tx.temp[tempVista]} · ${hechos}/${total}`}
        >
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <defs>
              <linearGradient id="faros-haz-d" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" style={{ stopColor: 'var(--fs-luz)', stopOpacity: 0.75 }} />
                <stop offset="1" style={{ stopColor: 'var(--fs-luz)', stopOpacity: 0 }} />
              </linearGradient>
              <linearGradient id="faros-haz-i" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0" style={{ stopColor: 'var(--fs-luz)', stopOpacity: 0.75 }} />
                <stop offset="1" style={{ stopColor: 'var(--fs-luz)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
          </svg>
          <div className="faros-capa faros-estrellas" data-baldosa="170">
            <i />
            <i />
          </div>
          <div className="faros-bruma" />
          <div className="faros-horizonte" />
          <div className="faros-capa faros-olas-1" data-baldosa="56">
            <i />
          </div>
          <div className="faros-capa faros-olas-2" data-baldosa="120">
            <i />
          </div>
          <div className="faros-capa faros-olas-3" data-baldosa="200">
            <i />
          </div>
          <svg className="faros-cono" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="faros-cono-g" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" style={{ stopColor: 'var(--fs-luz)', stopOpacity: 0.42 }} />
                <stop offset=".75" style={{ stopColor: 'var(--fs-luz)', stopOpacity: 0.12 }} />
                <stop offset="1" style={{ stopColor: 'var(--fs-luz)', stopOpacity: 0.04 }} />
              </linearGradient>
            </defs>
            <polygon points="33,100 67,100 51.6,50 48.4,50" fill="url(#faros-cono-g)" />
          </svg>
          {fase !== 'reglas'
            ? barcos.map((b, i) => (
                <div key={`b${i}`} className="faros-obj" data-rumbo={b}>
                  <div className="faros-en-agua">
                    <Barco hundido={hundidos[i]} i={i} />
                  </div>
                </div>
              ))
            : null}
          {faros.map((f, i) =>
            encendidos[i] ? (
              <div key={`f${i}`} className="faros-obj" data-rumbo={f}>
                <div>
                  <Faro encendido />
                </div>
              </div>
            ) : null
          )}
          {jugando && objetivo >= 0 ? (
            <div key={`s${objetivo}`} className="faros-obj" data-rumbo={faros[objetivo]}>
              <div>
                <Silueta ver={tempVista === 'ardiendo'} />
              </div>
            </div>
          ) : null}
          <div className="faros-brujula">
            {MARCAS.map((m) => (
              <div key={m} className="faros-obj" data-rumbo={m}>
                <div>
                  <span className={`faros-marca${m % 45 === 0 ? ' m45' : ''}`} />
                  {m % 90 === 0 ? <span className="faros-punto">{tx.puntos[m / 90]}</span> : null}
                </div>
              </div>
            ))}
            <span className="faros-flecha" />
          </div>
          <svg className="faros-mirilla" viewBox="-32 -32 64 64" aria-hidden="true">
            <circle className="pista" r="23" />
            <circle
              className="carga"
              r="23"
              transform="rotate(-90)"
              strokeDasharray={ANILLO.toFixed(1)}
              strokeDashoffset={(ANILLO * (1 - vista.sujeto)).toFixed(1)}
              style={{ opacity: vista.sujeto > 0 ? 1 : 0 }}
            />
            <circle className="aro" r="15" />
            <path className="cruz" d="M0 -21 V-17 M0 17 V21 M-21 0 H-17 M17 0 H21" />
            <circle className="centro" r="2" />
          </svg>
          {botones && jugando ? (
            <div className="faros-giro">
              <button
                type="button"
                aria-label={tx.izquierda}
                onPointerDown={() => (giroBotonRef.current = -GIRO_BOTONES_GRADOS_S)}
                onPointerUp={() => (giroBotonRef.current = 0)}
                onPointerLeave={() => (giroBotonRef.current = 0)}
                onPointerCancel={() => (giroBotonRef.current = 0)}
                onContextMenu={(e) => e.preventDefault()}
              >
                ⟲
              </button>
              <button
                type="button"
                aria-label={tx.derecha}
                onPointerDown={() => (giroBotonRef.current = GIRO_BOTONES_GRADOS_S)}
                onPointerUp={() => (giroBotonRef.current = 0)}
                onPointerLeave={() => (giroBotonRef.current = 0)}
                onPointerCancel={() => (giroBotonRef.current = 0)}
                onContextMenu={(e) => e.preventDefault()}
              >
                ⟳
              </button>
            </div>
          ) : null}
        </div>

        {fase === 'reglas' ? (
          <>
            <p className="faros-linea">{tx.reglas(total, Math.round(mantenerMs / 1000))}</p>
            {sensor === 'denegado' ? (
              <div className="faros-permiso" role="alert">
                <b>{tx.permisoTitulo}</b>
                {tx.permiso}
              </div>
            ) : null}
            {ofrecerBotones ? (
              <>
                {/* 22/11: con el permiso denegado ya sale su aviso; «este móvil no da el giro» lo contradecía. */}
                {sensor !== 'denegado' ? <p className="faros-aviso">{tx.sinSensor}</p> : null}
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
              <>
                <button
                  type="button"
                  className="faros-boton"
                  onClick={() => void empezar()}
                  disabled={submitting}
                >
                  {tx.empezar}
                </button>
                {/* 4/11: lo que cuesta jugar sin sensor se dice antes de empezar, no sólo al descubrir que falta. */}
              </>
            )}
          </>
        ) : (
          <>
            <div className="faros-estado" data-temp={estado} aria-live="polite">
              {textoEstado}
            </div>
            {jugando ? (
              <div className="faros-termo" aria-hidden="true">
                {ORDEN.map((t, i) => (
                  <span
                    key={t}
                    className={`${t}${i <= ORDEN.indexOf(tempVista) ? ' on' : ''}${t === tempVista ? ' ya' : ''}`}
                  >
                    {tx.temp[t]}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="faros-fila">
              <b>{tx.encendidos(hechos, total)}</b>
              <span className="faros-iconos">
                {encendidos.map((on, i) => (
                  <Icono key={i} on={on} />
                ))}
              </span>
            </div>
            {jugando && barcos.length ? (
              <p className="faros-leyenda">
                <i />
                {tx.leyenda}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default FarosRuntimeScreen

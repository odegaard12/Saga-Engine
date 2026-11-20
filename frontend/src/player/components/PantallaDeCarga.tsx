import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import {
  PARTES,
  algunaFallo,
  faseDeCarga,
  minutosQueQuedan,
  parteEnCurso,
  partesSinCompletar,
  porcentajeGeneral,
  todoListo,
  type EstadoDeCarga,
  type FaseDeCarga,
  type ParteId,
} from '../offline/motorDeCarga'
import { creditosDelMapa } from './creditosMapa'
import { conDatosMoviles } from '../offline/redEstado'
import { useResumenDeDescarga } from './ResumenDeDescarga'
import { ANIMACION_DE_ENTRADA_DE_PANTALLA, consumirEntradaSuave } from '../ui/entradaDePantalla'
// El logo va DENTRO de la página (vectorial): la pantalla se monta otra vez en el velo y, como <img>, ese primer
// fotograma salía con el círculo vacío mientras el mapa ocupaba el hilo (QA 20/11).
import LOGO_SVG from '../../../public/saga-app-icon.svg?raw'

/**
 * La pantalla de carga que lo baja TODO: App, Misión y Mapa, en UNA barra.
 *
 * Sale al abrir la aplicación con cobertura SOLO si algo falta o ha cambiado, y
 * en «Prepararse» (encima del juego, con los permisos debajo). No se entra hasta
 * tenerlo todo; pasado un momento aparece «Entrar igualmente», con una línea
 * corta de lo que faltará sin cobertura.
 *
 * El dueño la quería sin textos de sobra: una barra y, debajo, qué se está
 * preparando dicho en palabras («Bajando el mapa de la ruta…», «Casi listo…»).
 * El tiempo sólo si la espera es larga, y amable («unos 3 minutos»). Los
 * errores sí se dicen, siempre.
 *
 * Al terminar, la MISMA pantalla sigue debajo de los permisos (`continuar`, ver
 * el velo de PlayerApp): la barra llega al 100 % desde donde iba y la tarjeta
 * de permisos sube en el sitio de la previsión, sin cambiar de pantalla.
 */

/** Cuánto se espera antes de ofrecer «Entrar igualmente». */
export const RETRASO_ENTRAR_IGUALMENTE_MS = 6000

const TEXTOS = {
  es: {
    tituloEntrada: 'Preparando tu partida',
    tituloActualizando: 'Actualizando lo que ha cambiado',
    tituloPreparacion: 'Prepararse antes de salir',
    tituloFallo: 'No se ha podido completar',
    tituloListo: 'Todo listo',
    faseMapa: 'Colocando el terreno y los nodos…',
    fases: { app: 'Aplicación', mision: 'Misión', mapa: 'Mapa' } as Record<ParteId, string>,
    que: {
      comprobando: 'Comprobando lo que ya tienes…',
      app: 'Preparando la app y los personajes…',
      mision: 'Guardando los retos de la misión…',
      mapa: 'Bajando el mapa de la ruta…',
      casi: 'Casi listo…',
      listo: 'Todo preparado',
    } as Record<FaseDeCarga, string>,
    quedan: (min: number) =>
      min >= 60
        ? 'Queda más de una hora'
        : min <= 1
          ? 'Queda alrededor de un minuto'
          : `Quedan unos ${min} minutos`,
    fallo: 'No se pudo completar',
    sinEspacio: 'Sin espacio en el móvil',
    entrarIgualmente: 'Entrar igualmente',
    entrarYa: 'Entrar ya',
    datosMoviles: 'Con datos móviles esta descarga gasta unos 300 MB.',
    sinRedDescargando: 'Sin cobertura ahora: la descarga sigue sola cuando vuelva.',
    sinRedGuardado: 'Sin cobertura: preparando el mapa que ya tienes guardado.',
    rutaGuardada: 'Tu ruta ya está guardada. Lo de alrededor sólo se verá con cobertura.',
    reintentar: 'Reintentar',
    partes: { app: 'la app', mision: 'la misión', mapa: 'el mapa' } as Record<ParteId, string>,
    y: 'y',
    faltara: (lista: string) => `Sin cobertura no tendrás ${lista}.`,
    sinCobertura:
      'Sin cobertura: no se puede descargar nada ahora. Conéctate a internet y vuelve a intentarlo.',
  },
  gl: {
    tituloEntrada: 'Preparando a túa partida',
    tituloActualizando: 'Actualizando o que cambiou',
    tituloPreparacion: 'Prepararse antes de saír',
    tituloFallo: 'Non se puido completar',
    tituloListo: 'Todo listo',
    faseMapa: 'Colocando o terreo e os nodos…',
    fases: { app: 'Aplicación', mision: 'Misión', mapa: 'Mapa' } as Record<ParteId, string>,
    que: {
      comprobando: 'Comprobando o que xa tes…',
      app: 'Preparando a app e os personaxes…',
      mision: 'Gardando os retos da misión…',
      mapa: 'Baixando o mapa da ruta…',
      casi: 'Case listo…',
      listo: 'Todo preparado',
    } as Record<FaseDeCarga, string>,
    quedan: (min: number) =>
      min >= 60
        ? 'Queda máis dunha hora'
        : min <= 1
          ? 'Queda arredor dun minuto'
          : `Quedan uns ${min} minutos`,
    fallo: 'Non se puido completar',
    sinEspacio: 'Sen espazo no móbil',
    entrarIgualmente: 'Entrar igualmente',
    entrarYa: 'Entrar xa',
    datosMoviles: 'Con datos móbiles esta descarga gasta uns 300 MB.',
    sinRedDescargando: 'Sen cobertura agora: a descarga segue soa cando volva.',
    sinRedGuardado: 'Sen cobertura: preparando o mapa que xa tes gardado.',
    rutaGuardada: 'A túa ruta xa está gardada. O de arredor só se verá con cobertura.',
    reintentar: 'Tentar de novo',
    partes: { app: 'a app', mision: 'a misión', mapa: 'o mapa' } as Record<ParteId, string>,
    y: 'e',
    faltara: (lista: string) => `Sen cobertura non terás ${lista}.`,
    sinCobertura:
      'Sen cobertura: non se pode descargar nada agora. Conéctate a internet e téntao de novo.',
  },
}

/** «el mapa», «la misión y el mapa», «la app, la misión y el mapa». */
function enumerar(cosas: string[], y: string): string {
  return cosas.length < 2
    ? cosas.join('')
    : `${cosas.slice(0, -1).join(', ')} ${y} ${cosas[cosas.length - 1]}`
}

interface Props {
  partes: EstadoDeCarga
  /** `entrada`: pantalla completa antes del juego. `preparacion`: sobre el juego. */
  modo: 'entrada' | 'preparacion'
  /** «Entrar igualmente»: sólo en la entrada. */
  onEntrarIgualmente?: () => void
  /** Volver a intentar lo que falló. */
  onReintentar?: () => void
  /** No hay red ahora mismo (sólo «Prepararse»). */
  sinCobertura?: boolean
  /** Lo que va debajo de la barra: la previsión y, en «Prepararse», los permisos. */
  children?: ReactNode
  /**
   * La carga ya terminó y la pantalla sigue, con los permisos debajo (el velo de
   * PlayerApp). Sin fundido de entrada: es la misma pantalla que había.
   */
  continuar?: boolean
  /**
   * 31/10: la carga acabó pero el mapa aún no ha pintado su primera vista (hasta 12 s). Antes se quedaba en
   * «Todo listo · 100 %» sin moverse y parecía colgada: ahora es una fase propia con la barra indeterminada.
   */
  preparandoMapa?: boolean
  /** 7/11: de quién comprobar lo descargado al terminar (null = aún no). Se pinta en la línea de la barra. */
  resumenDe?: string | null
  /** 7/11: la tarjeta de permisos va debajo: en pantallas bajas el logo se quita para que quepa. */
  conPermisos?: boolean
}

/**
 * Lo último que enseñó la barra. La pantalla que sigue tras la carga es otro
 * montaje (otra rama de PlayerApp): sin esto nacería ya al 100 % y la barra
 * saltaría; con esto arranca donde iba y se ve llegar al final.
 */
let ultimoPctMostrado = 0
/** Y lo que decía «Entrar…» si estaba a la vista (null: no estaba): tras la carga se apaga diciendo lo mismo. */
let ultimoEntrar: { boton: string; nota: string } | null = null

/**
 * Un texto que cambia sin hueco: el nuevo sustituye al anterior en el acto y se aviva desde medio apagado
 * (RELEVO_SIN_HUECO). Nunca hay un instante vacío ni dos textos encima (con el hilo ocupado montando el mapa, un cruce
 * se quedaba a medias y se leía el amasijo). Al montarse no anima: si la pantalla se vuelve a montar (el velo), el
 * texto ya estaba ahí.
 */
function Relevo({ texto }: { texto: string }) {
  const [primero] = useState(texto)
  return (
    <span key={texto} style={{ animation: texto === primero ? undefined : RELEVO_SIN_HUECO }}>
      {texto}
    </span>
  )
}

export function PantallaDeCarga({
  partes,
  modo,
  onEntrarIgualmente,
  onReintentar,
  sinCobertura = false,
  children,
  continuar = false,
  preparandoMapa = false,
  resumenDe = null,
  conPermisos = false,
}: Props) {
  const { locale } = useI18n()
  // «Entrada» solo se funde si es la primera pantalla de carga de la sesion: si
  // viene de la neutra («Conectando…») aparece ya opaca, sin segundo fundido.
  // «Preparacion» sale sobre el juego ya visible: esa siempre entra fundiendo.
  const [fundirEntrada] = useState(() =>
    continuar ? false : modo === 'entrada' ? consumirEntradaSuave() : true
  )
  const tx = locale === 'gl' ? TEXTOS.gl : TEXTOS.es

  // «Entrar igualmente» tarda un poco en salir: lo normal es esperar, y un botón
  // de salida al alcance desde el primer segundo invita a saltarse la descarga.
  const [esperaAcabada, setEsperaAcabada] = useState(false)
  useEffect(() => {
    if (modo !== 'entrada') return undefined
    const id = window.setTimeout(() => setEsperaAcabada(true), RETRASO_ENTRAR_IGUALMENTE_MS)
    return () => window.clearTimeout(id)
  }, [modo])

  // 5.59: el fallo sólo se dice cuando ya no queda nada en marcha (antes salía mientras el mapa seguía bajando).
  const algoEnMarcha = PARTES.some((id) =>
    ['descargando', 'comprobando', 'pendiente'].includes(partes[id].estado)
  )
  const fallo = algunaFallo(partes) && !algoEnMarcha
  const listo = todoListo(partes)
  const sinCompletar = partesSinCompletar(partes)
  const enCurso = parteEnCurso(partes)

  // La barra nunca retrocede: el mapa cambia de fase (teselas, caminos, casas) y
  // una fase sin número no puede hacer que lo ya bajado parezca perdido.
  const [maximo, setMaximo] = useState(() => (continuar ? ultimoPctMostrado : 0))
  const calculado = porcentajeGeneral(partes)
  if (calculado !== null && calculado > maximo) setMaximo(calculado)
  const real = calculado === null ? null : Math.max(maximo, calculado)
  // Recién montada tras la carga, el primer fotograma pinta la barra donde se
  // quedó; el siguiente la lleva a lo real con la transición de su ancho.
  const [desde, setDesde] = useState<number | null>(() => (continuar ? ultimoPctMostrado : null))
  useEffect(() => {
    if (desde === null) return undefined
    let segundo = 0
    const primero = window.requestAnimationFrame(() => {
      segundo = window.requestAnimationFrame(() => setDesde(null))
    })
    return () => {
      window.cancelAnimationFrame(primero)
      window.cancelAnimationFrame(segundo)
    }
  }, [desde])
  const mapaEnCurso = continuar && preparandoMapa && listo && !fallo
  // 7/11: «Todo descargado ✓ · N MB» y la cuenta atrás, en la línea de la barra (no en una pastilla aparte).
  const resumen = useResumenDeDescarga(listo && !fallo ? resumenDe : null)
  const completo = listo && !fallo && !mapaEnCurso && resumen?.estado === 'completo'
  const pct = mapaEnCurso || real === null ? null : desde === null ? real : Math.min(real, desde)
  useEffect(() => {
    if (real !== null) ultimoPctMostrado = real
  }, [real])

  // «Actualizando» cuando ya se tenía algo y ha cambiado; «Preparando» la primera vez.
  const soloCambios =
    PARTES.every((id) => partes[id].motivo !== 'primera_vez') &&
    PARTES.some((id) => partes[id].motivo !== null)

  const titulo = fallo
    ? tx.tituloFallo
    : modo === 'preparacion'
      ? listo
        ? tx.tituloListo
        : tx.tituloPreparacion
      : // 20/11 (QA): preparando el mapa, el título NO cambia (con «Preparando el mapa…» parecía una segunda carga):
        // lo dice la línea de debajo, y la barra sigue llena.
        listo && continuar && !mapaEnCurso && (completo || !resumen)
          ? tx.tituloListo
          : soloCambios
            ? tx.tituloActualizando
            : tx.tituloEntrada

  // Qué se prepara, en palabras; el tiempo sólo si la espera es larga.
  const fase = mapaEnCurso ? tx.faseMapa : tx.que[faseDeCarga(partes, real)]
  // 20/11: si se corta la cobertura a mitad, se dice (antes seguía «Bajando… 56 %» y «quedan 2 minutos»).
  const [enLinea, setEnLinea] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const si = () => setEnLinea(true)
    const no = () => setEnLinea(false)
    window.addEventListener('online', si)
    window.addEventListener('offline', no)
    return () => {
      window.removeEventListener('online', si)
      window.removeEventListener('offline', no)
    }
  }, [])
  const minutos = enCurso && !listo && enLinea ? minutosQueQuedan(partes[enCurso].restanteMs) : null

  const errores = PARTES.filter((id) => partes[id].estado === 'error').map(
    (id) =>
      `${tx.fases[id]}: ${partes[id].sinEspacio ? tx.sinEspacio : partes[id].error || tx.fallo}`
  )

  // 16/10: con poca cobertura el mapa tarda minutos, pero lo de la ruta (corredor y nodos) baja lo primero.
  // Con eso guardado se ofrece entrar YA, diciendo qué faltará; sólo si lo único a medias es el mapa.
  const rutaGuardada =
    modo === 'entrada' &&
    Boolean(partes.mapa.esencialListo) &&
    !listo &&
    !fallo &&
    sinCompletar.every((id) => id === 'mapa')
  const puedeEntrarIgualmente =
    modo === 'entrada' && Boolean(onEntrarIgualmente) && (esperaAcabada || fallo || rutaGuardada)
  const textoEntrar = {
    boton: rutaGuardada ? tx.entrarYa : tx.entrarIgualmente,
    nota: rutaGuardada
      ? tx.rutaGuardada
      : sinCompletar.length > 0
        ? tx.faltara(enumerar(sinCompletar.map((id) => tx.partes[id]), tx.y))
        : '',
  }
  // Si el botón estaba a la vista y deja de ofrecerse (la carga terminó antes de tiempo, o tras ella en el velo), se
  // apaga en su sitio y diciendo lo mismo (deja el hueco): quitarlo de golpe subiría todo lo de debajo, y cambiarle
  // el texto al irse se leía como otro botón.
  const [entrarAlMontar] = useState(() => (continuar ? ultimoEntrar : null))
  const [entrarVisto, setEntrarVisto] = useState<{ boton: string; nota: string } | null>(null)
  if (puedeEntrarIgualmente && (entrarVisto?.boton !== textoEntrar.boton || entrarVisto?.nota !== textoEntrar.nota))
    setEntrarVisto(textoEntrar)
  const entrarAlApagarse = entrarAlMontar ?? (!continuar && !puedeEntrarIgualmente ? entrarVisto : null)
  const reservarEntrar = modo === 'entrada' && Boolean(onEntrarIgualmente) && !continuar
  const verEntrar = entrarAlApagarse ?? textoEntrar
  // Lo que el velo debe seguir apagando: el botón ofrecido o el que ya se estaba apagando aquí.
  const entrarEnPantalla = puedeEntrarIgualmente ? textoEntrar : entrarAlApagarse
  // Tras cada pintado (sin lista: es sólo apuntar una variable).
  useEffect(() => {
    if (!continuar) ultimoEntrar = entrarEnPantalla
  })

  const cuerpo = (
    <div
      data-saga-anim="pantalla-de-carga"
      data-modo={modo}
      data-continuar={continuar ? '' : undefined}
      data-con-permisos={conPermisos ? '' : undefined}
      style={{
        ...fondo,
        // En «Prepararse» va sobre el juego y sobre el velo de carga.
        zIndex: modo === 'preparacion' ? 1000001 : 999999,
        animation: fundirEntrada ? ANIMACION_DE_ENTRADA_DE_PANTALLA : undefined,
      }}
    >
      <div style={contenido}>
        <div style={centro}>
          <span role="img" aria-label="SAGA" data-saga-logo style={icono} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />

          {/* Al cambiar, el anterior se apaga mientras el nuevo entra: ni sustitución en seco ni hueco vacío. */}
          <strong style={tituloEstilo}>
            <Relevo texto={titulo} />
          </strong>

          {sinCobertura ? (
            <div style={avisoSinRed} role="alert">
              {tx.sinCobertura}
            </div>
          ) : (
            <div style={bloqueBarra}>
              <div
                style={pista}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct ?? undefined}
                aria-valuetext={[fase, pct === null ? '' : `${pct} %`].filter(Boolean).join(' · ')}
                data-saga-carga-barra
              >
                <div
                  data-indeterminada={pct === null ? '' : undefined}
                  style={{
                    ...relleno,
                    // Preparando el mapa, la barra NO vuelve a empezar: sigue llena y late (ya se bajó todo).
                    width: mapaEnCurso ? '100%' : pct === null ? '38%' : `${pct}%`,
                    animation: mapaEnCurso
                      ? LATIDO_DE_LA_BARRA
                      : pct === null
                        ? 'sagaCargaDesliza 1.4s infinite ease-in-out'
                        : 'none',
                    // Lleno y en verde cuando está todo comprobado en el móvil; ámbar si falló.
                    background: fallo ? 'var(--s-aviso)' : completo ? 'var(--s-ok)' : 'var(--s-acento)',
                    // Recién montada tras la carga: el primer fotograma, sin transición.
                    transition: desde !== null ? 'none' : relleno.transition,
                  }}
                />
              </div>
              <div style={filaFase}>
                {/* Una sola línea que se releva: el resumen sustituye a la fase sin quedarse vacía. */}
                <span
                  data-saga-carga-fase
                  data-saga-resumen-descarga={resumen && listo && !mapaEnCurso ? resumen.estado : undefined}
                  style={{ color: completo ? 'var(--s-ok)' : undefined }}
                >
                  <Relevo texto={resumen && listo && !mapaEnCurso ? resumen.texto : fase} />
                </span>
                {listo && !mapaEnCurso && resumen?.cuentaAtras ? (
                  <span style={numero} data-saga-carga-cuenta>
                    {resumen.cuentaAtras}
                  </span>
                ) : pct !== null ? (
                  <span style={numero} data-saga-carga-pct>
                    {pct} %
                  </span>
                ) : null}
              </div>
              {/* Siempre ocupa su línea: que aparezca no empuja lo de debajo. Preparando el mapa, aquí va lo
                  descargado (la barra es del mapa). */}
              {/* Sin relevo: aquí corre la cuenta atrás, que cambia cada segundo. */}
              <span style={notaTiempo} data-saga-carga-tiempo>
                {!enLinea && (!listo || mapaEnCurso)
                  ? listo ? tx.sinRedGuardado : tx.sinRedDescargando
                  : minutos !== null
                  ? tx.quedan(minutos)
                  : mapaEnCurso && resumen
                    ? [resumen.texto, resumen.cuentaAtras].filter(Boolean).join(' · ')
                    : !listo && conDatosMoviles()
                      ? tx.datosMoviles
                      : ''}
              </span>
            </div>
          )}

          {errores.length ? (
            <div style={errorEstilo} role="alert" data-saga-carga-error>
              {errores.map((texto) => (
                <span key={texto}>{texto}</span>
              ))}
            </div>
          ) : null}

          {fallo && onReintentar ? (
            <button type="button" style={botonPrimario} onClick={onReintentar}>
              {tx.reintentar}
            </button>
          ) : null}


          {/* 5.58: en la entrada su hueco está desde el principio (invisible): al salir a los pocos segundos
              ya no empuja hacia abajo la tarjeta del tiempo. */}
          {/* 20/11 (QA): «Entrar igualmente» ENCIMA de la tarjeta (debajo quedaba fuera de la pantalla con los permisos).
              Con su hueco reservado desde el principio no empuja nada; terminada la carga ya no se reserva. */}
          {entrarAlApagarse || ((puedeEntrarIgualmente || reservarEntrar) && !continuar) ? (
            <div
              style={
                entrarAlApagarse
                  ? // 5.59: se apaga Y se pliega, despacio: dejar el hueco empujaba «Todo listo» y los permisos
                    // hasta el borde de abajo; quitarlo de golpe lo hacía saltar.
                    // 20/11: con los permisos desde el principio, plegarlo SUBÍA la tarjeta al 100 %: ahora sólo se apaga y
                    // conserva su hueco (la tarjeta no se mueve en todo el recorrido).
                    { ...bloqueEntrar, animation: SALIDA_EN_SU_SITIO }
                  : puedeEntrarIgualmente
                    ? { ...bloqueEntrar, animation: RELEVO_DE_TEXTO }
                    : { ...bloqueEntrar, visibility: 'hidden' }
              }
              aria-hidden={Boolean(entrarAlApagarse) || !puedeEntrarIgualmente || undefined}
            >
              <button
                type="button"
                style={botonSecundario}
                onClick={onEntrarIgualmente}
                disabled={Boolean(entrarAlApagarse) || !puedeEntrarIgualmente}
              >
                <Relevo texto={verEntrar.boton} />
              </button>
              <span style={nota} data-saga-carga-falta={verEntrar.nota ? '' : undefined}>
                <Relevo texto={verEntrar.nota} />
              </span>
            </div>
          ) : null}

          {children ? <div style={hueco}>{children}</div> : null}

        </div>

        <p style={creditos} data-saga-creditos-mapa>
          {creditosDelMapa(locale)}
        </p>
      </div>

      <style>
        {`
          @keyframes sagaCargaPliega {
            from { max-height: 140px; }
            to { max-height: 0; margin-top: -16px; }
          }
          @keyframes sagaCargaDesliza {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(320%); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-saga-carga-barra] > [data-indeterminada] { animation: none !important; width: 100% !important; opacity: .55; }
          }
          /* 2/11: en pantallas bajas (360x740), con la tarjeta de permisos debajo, el logo sobra: sin él «Seguir sin eso» cabe. */
          @media (max-height: 760px) {
            [data-saga-anim='pantalla-de-carga'][data-con-permisos] [data-saga-logo] { display: none; }
          }
          [data-saga-logo] > svg { display: block; width: 100%; height: 100%; }
          @keyframes sagaCargaTextoAviva {
            from { opacity: .35; }
          }
          /* Sólo opacidad: con «visibility» la animación corre en el hilo principal y, mientras el mapa se monta
             debajo, se quedaba congelada a medias (QA 20/11). */
          @keyframes sagaCargaSale {
            from { opacity: 1; }
            to { opacity: 0; }
          }
        `}
      </style>
    </div>
  )

  if (modo === 'preparacion' && typeof document !== 'undefined') {
    return createPortal(cuerpo, document.body)
  }
  return cuerpo
}

/** Los textos que cambian (título, fase) entran fundiendo, con el ritmo del sistema. */
const RELEVO_DE_TEXTO = 'sagaCapaEntra var(--saga-dur-media) var(--saga-curva-entra) both'

/** El texto que sustituye a otro en su sitio se aviva desde medio apagado (ver `Relevo`): nunca queda vacío. */
const RELEVO_SIN_HUECO = 'sagaCargaTextoAviva var(--saga-dur-media) var(--saga-curva-entra) both'

/**
 * Preparando el mapa (todo bajado), la barra llena late en vez de reiniciarse. Reutiliza el latido de los esqueletos
 * (mobile-themes.css): con «reducir movimiento» `--saga-latido-estado` lo deja quieto.
 */
const LATIDO_DE_LA_BARRA = 'sagaEsqueletoLatido 1.2s ease-in-out infinite var(--saga-latido-estado, running)'

/** Lo que vuelve en su sitio (la previsión, al dar los permisos) entra fundiendo. */
export const ENTRADA_EN_SU_SITIO = RELEVO_DE_TEXTO

/** Lo que se va al pasar a los permisos (la previsión) se apaga en su sitio. */
export const SALIDA_EN_SU_SITIO = 'sagaCargaSale var(--saga-dur-media) var(--saga-curva-sale) both'

const fondo: CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflowY: 'auto',
  // 7/11: tokens --s-* (Pizarra, Día y Solpor): un halo del acento arriba sobre el degradado superficie → fondo.
  background:
    'radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--s-acento) 16%, transparent), transparent 48%),' +
    'linear-gradient(180deg, var(--s-superficie) 0%, var(--s-fondo) 100%)',
  color: 'var(--s-texto)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  paddingTop: 'env(safe-area-inset-top)',
  paddingBottom: 'env(safe-area-inset-bottom)',
}

const contenido: CSSProperties = {
  minHeight: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '24px 22px 14px',
}

const centro: CSSProperties = {
  flex: 1,
  width: '100%',
  maxWidth: 340,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // Arriba, a una altura fija, y no centrado: lo de debajo cambia de alto (la
  // previsión deja sitio a los permisos) y centrado movía el logo y la barra.
  justifyContent: 'flex-start',
  // 7/11: más abajo que antes (9vh): el bloque queda equilibrado y no deja medio móvil vacío sobre los créditos.
  paddingTop: 'clamp(12px, 13vh, 130px)',
  gap: 16,
}

const icono: CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  width: 64,
  height: 64,
  borderRadius: '50%',
  boxShadow: 'var(--s-sombra, 0 8px 24px color-mix(in srgb, black 45%, transparent))',
}

const tituloEstilo: CSSProperties = {
  fontSize: 19,
  fontWeight: 900,
  letterSpacing: '-.02em',
  textAlign: 'center',
  color: 'var(--s-texto)',
  marginBottom: 4,
}

const bloqueBarra: CSSProperties = { width: 'min(100%, 300px)', display: 'grid', gap: 8 }

const pista: CSSProperties = {
  // 7/11: 8 px y una pista que se ve: con 6 px casi transparente, «Preparando el mapa…» parecía una barra vacía.
  height: 8,
  background: 'color-mix(in srgb, var(--s-texto) 16%, transparent)',
  borderRadius: 'var(--theme-radius-pill)',
  overflow: 'hidden',
}

const relleno: CSSProperties = {
  height: '100%',
  borderRadius: 'var(--theme-radius-pill)',
  transition: 'width .5s cubic-bezier(.22,1,.36,1), background-color .4s ease',
  boxShadow: '0 0 12px color-mix(in srgb, var(--s-acento) 55%, transparent)',
}

const filaFase: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 16,
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--s-texto-2)',
}

const notaTiempo: CSSProperties = {
  minHeight: 15,
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--s-texto-2)',
}

const numero: CSSProperties = {
  fontWeight: 900,
  color: 'var(--s-texto)',
  fontVariantNumeric: 'tabular-nums',
}

const errorEstilo: CSSProperties = {
  display: 'grid',
  gap: 2,
  maxWidth: 300,
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 700,
  textAlign: 'center',
  color: 'var(--s-aviso)',
}

const avisoSinRed: CSSProperties = {
  maxWidth: 300,
  padding: '12px 14px',
  borderRadius: 12,
  fontSize: 12.5,
  lineHeight: 1.45,
  fontWeight: 700,
  textAlign: 'center',
  background: 'color-mix(in srgb, var(--s-aviso) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--s-aviso) 40%, transparent)',
  color: 'var(--s-aviso)',
}

const botonPrimario: CSSProperties = {
  minHeight: 44,
  padding: '0 22px',
  borderRadius: 12,
  border: 0,
  background: 'var(--s-acento)',
  color: 'var(--s-acento-texto)',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
}

const bloqueEntrar: CSSProperties = {
  display: 'grid',
  gap: 6,
  justifyItems: 'center',
  maxWidth: 300,
}

const botonSecundario: CSSProperties = {
  minHeight: 44,
  padding: '0 22px',
  borderRadius: 12,
  border: '1px solid var(--s-borde)',
  background: 'transparent',
  color: 'var(--s-texto)',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
}

const nota: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.4,
  // 20/11: siempre el hueco de dos líneas: «Tu ruta ya está guardada…» ocupa dos y movía la previsión al cambiar.
  minHeight: '2.8em',
  fontWeight: 600,
  textAlign: 'center',
  color: 'var(--s-texto-2)',
}

const hueco: CSSProperties = {
  width: '100%',
  display: 'grid',
  placeItems: 'center',
  marginTop: 4,
}

const creditos: CSSProperties = {
  margin: '18px 0 0',
  // 7/11: más estrechos y discretos (ocupaban tres líneas grandes): 10,5 px en el color terciario del tema, sin
  // opacidad (con ella, en Día se perdían). La licencia pide citar, no esconder.
  maxWidth: 300,
  fontSize: 10.5,
  lineHeight: 1.35,
  color: 'var(--s-texto-3)',
  textAlign: 'center',
}

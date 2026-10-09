import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import {
  PARTES,
  algunaFallo,
  parteEnCurso,
  partesSinCompletar,
  porcentajeGeneral,
  textoDeTiempo,
  todoListo,
  type EstadoDeCarga,
  type ParteId,
} from '../offline/motorDeCarga'
import { creditosDelMapa } from './creditosMapa'
import { ANIMACION_DE_ENTRADA_DE_PANTALLA, consumirEntradaSuave } from '../ui/entradaDePantalla'

/**
 * La pantalla de carga que lo baja TODO: App, Misión y Mapa, en UNA barra.
 *
 * Sale al abrir la aplicación con cobertura SOLO si algo falta o ha cambiado, y
 * en «Prepararse» (encima del juego, con los permisos debajo). No se entra hasta
 * tenerlo todo; pasado un momento aparece «Entrar igualmente», con una línea
 * corta de lo que faltará sin cobertura.
 *
 * El dueño la quería sin textos de sobra: una barra, el nombre de lo que baja
 * ahora y, como mucho, el tiempo que queda. Los errores sí se dicen, siempre.
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
    fases: { app: 'Aplicación', mision: 'Misión', mapa: 'Mapa' } as Record<ParteId, string>,
    comprobando: 'Comprobando…',
    listo: 'Listo',
    fallo: 'No se pudo completar',
    sinEspacio: 'Sin espacio en el móvil',
    entrarIgualmente: 'Entrar igualmente',
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
    fases: { app: 'Aplicación', mision: 'Misión', mapa: 'Mapa' } as Record<ParteId, string>,
    comprobando: 'Comprobando…',
    listo: 'Listo',
    fallo: 'Non se puido completar',
    sinEspacio: 'Sen espazo no móbil',
    entrarIgualmente: 'Entrar igualmente',
    reintentar: 'Tentar de novo',
    partes: { app: 'a app', mision: 'a misión', mapa: 'o mapa' } as Record<ParteId, string>,
    y: 'e',
    faltara: (lista: string) => `Sen cobertura non terás ${lista}.`,
    sinCobertura:
      'Sen cobertura: non se pode descargar nada agora. Conéctate a internet e téntao de novo.',
  },
  en: {
    tituloEntrada: 'Getting your game ready',
    tituloActualizando: 'Updating what has changed',
    tituloPreparacion: 'Get ready before heading out',
    tituloFallo: "Couldn't finish",
    tituloListo: 'All set',
    fases: { app: 'App', mision: 'Mission', mapa: 'Map' } as Record<ParteId, string>,
    comprobando: 'Checking…',
    listo: 'Done',
    fallo: "Couldn't finish",
    sinEspacio: 'No space left on this phone',
    entrarIgualmente: 'Enter anyway',
    reintentar: 'Try again',
    partes: { app: 'the app', mision: 'the mission', mapa: 'the map' } as Record<ParteId, string>,
    y: 'and',
    faltara: (lista: string) => `Offline you won't have ${lista}.`,
    sinCobertura:
      'No signal: nothing can be downloaded now. Connect to the internet and try again.',
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
}

export function PantallaDeCarga({
  partes,
  modo,
  onEntrarIgualmente,
  onReintentar,
  sinCobertura = false,
  children,
}: Props) {
  const { locale } = useI18n()
  // «Entrada» solo se funde si es la primera pantalla de carga de la sesion: si
  // viene de la neutra («Conectando…») aparece ya opaca, sin segundo fundido.
  // «Preparacion» sale sobre el juego ya visible: esa siempre entra fundiendo.
  const [fundirEntrada] = useState(() => (modo === 'entrada' ? consumirEntradaSuave() : true))
  const tx = locale === 'gl' ? TEXTOS.gl : locale === 'en' ? TEXTOS.en : TEXTOS.es

  // «Entrar igualmente» tarda un poco en salir: lo normal es esperar, y un botón
  // de salida al alcance desde el primer segundo invita a saltarse la descarga.
  const [esperaAcabada, setEsperaAcabada] = useState(false)
  useEffect(() => {
    if (modo !== 'entrada') return undefined
    const id = window.setTimeout(() => setEsperaAcabada(true), RETRASO_ENTRAR_IGUALMENTE_MS)
    return () => window.clearTimeout(id)
  }, [modo])

  const fallo = algunaFallo(partes)
  const listo = todoListo(partes)
  const sinCompletar = partesSinCompletar(partes)
  const enCurso = parteEnCurso(partes)

  // La barra nunca retrocede: el mapa cambia de fase (teselas, caminos, casas) y
  // una fase sin número no puede hacer que lo ya bajado parezca perdido.
  const [maximo, setMaximo] = useState(0)
  const calculado = porcentajeGeneral(partes)
  if (calculado !== null && calculado > maximo) setMaximo(calculado)
  const pct = calculado === null ? null : Math.max(maximo, calculado)

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
      : soloCambios
        ? tx.tituloActualizando
        : tx.tituloEntrada

  // Una línea: lo que baja ahora y, si se sabe, cuánto queda.
  const restante = enCurso ? textoDeTiempo(partes[enCurso].restanteMs ?? null) : ''
  const fase = listo
    ? tx.listo
    : enCurso
      ? [tx.fases[enCurso], restante].filter(Boolean).join(' · ')
      : pct === null
        ? tx.comprobando
        : ''

  const errores = PARTES.filter((id) => partes[id].estado === 'error').map(
    (id) =>
      `${tx.fases[id]}: ${partes[id].sinEspacio ? tx.sinEspacio : partes[id].error || tx.fallo}`
  )

  const puedeEntrarIgualmente =
    modo === 'entrada' && Boolean(onEntrarIgualmente) && (esperaAcabada || fallo)

  const cuerpo = (
    <div
      data-saga-anim="pantalla-de-carga"
      data-modo={modo}
      style={{
        ...fondo,
        // En «Prepararse» va sobre el juego y sobre el velo de carga.
        zIndex: modo === 'preparacion' ? 1000001 : 999999,
        animation: fundirEntrada ? ANIMACION_DE_ENTRADA_DE_PANTALLA : undefined,
      }}
    >
      <div style={contenido}>
        <div style={centro}>
          <img
            src="/saga-app-icon-192.png?v=redondo"
            alt="SAGA"
            style={icono}
            width={64}
            height={64}
          />

          <strong style={tituloEstilo}>{titulo}</strong>

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
                  style={{
                    ...relleno,
                    width: pct === null ? '38%' : `${pct}%`,
                    animation: pct === null ? 'sagaCargaDesliza 1.4s infinite ease-in-out' : 'none',
                    background: fallo
                      ? '#facc15'
                      : 'linear-gradient(90deg, var(--theme-primary-hover), var(--theme-primary))',
                  }}
                />
              </div>
              <div style={filaFase}>
                <span data-saga-carga-fase>{fase}</span>
                {pct !== null ? (
                  <span style={numero} data-saga-carga-pct>
                    {pct} %
                  </span>
                ) : null}
              </div>
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

          {puedeEntrarIgualmente ? (
            <div style={bloqueEntrar}>
              <button type="button" style={botonSecundario} onClick={onEntrarIgualmente}>
                {tx.entrarIgualmente}
              </button>
              {sinCompletar.length > 0 ? (
                <span style={nota} data-saga-carga-falta>
                  {tx.faltara(
                    enumerar(
                      sinCompletar.map((id) => tx.partes[id]),
                      tx.y
                    )
                  )}
                </span>
              ) : null}
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
          @keyframes sagaCargaDesliza {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(320%); }
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

const fondo: CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflowY: 'auto',
  background:
    'radial-gradient(circle at 50% 22%, var(--theme-tint-strong), transparent 46%),' +
    'radial-gradient(circle at 50% 88%, var(--theme-tint), transparent 44%),' +
    'linear-gradient(180deg, var(--theme-surface) 0%, var(--theme-bg) 100%)',
  color: '#f8fafc',
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
  justifyContent: 'center',
  gap: 16,
}

const icono: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  boxShadow: '0 8px 28px rgba(0,0,0,.5)',
}

const tituloEstilo: CSSProperties = {
  fontSize: 19,
  fontWeight: 900,
  letterSpacing: '-.02em',
  textAlign: 'center',
  color: '#ffffff',
  marginBottom: 4,
}

const bloqueBarra: CSSProperties = { width: 'min(100%, 300px)', display: 'grid', gap: 8 }

const pista: CSSProperties = {
  height: 6,
  background: 'rgba(255,255,255,.09)',
  borderRadius: 'var(--theme-radius-pill)',
  overflow: 'hidden',
}

const relleno: CSSProperties = {
  height: '100%',
  borderRadius: 'var(--theme-radius-pill)',
  transition: 'width .5s cubic-bezier(.22,1,.36,1)',
  boxShadow: '0 0 14px var(--theme-glow)',
}

const filaFase: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 16,
  fontSize: 12,
  fontWeight: 700,
  color: 'rgba(var(--theme-line), .85)',
}

const numero: CSSProperties = {
  fontWeight: 900,
  color: 'rgb(var(--theme-line-soft))',
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
  color: '#fde68a',
}

const avisoSinRed: CSSProperties = {
  maxWidth: 300,
  padding: '12px 14px',
  borderRadius: 12,
  fontSize: 12.5,
  lineHeight: 1.45,
  fontWeight: 700,
  textAlign: 'center',
  background: 'rgba(250, 204, 21, .12)',
  border: '1px solid rgba(250, 204, 21, .4)',
  color: '#fde68a',
}

const botonPrimario: CSSProperties = {
  minHeight: 44,
  padding: '0 22px',
  borderRadius: 12,
  border: 0,
  background: 'var(--theme-primary)',
  color: 'var(--theme-card)',
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
  border: '1px solid var(--theme-hairline)',
  background: 'transparent',
  color: 'rgba(255,255,255,.85)',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
}

const nota: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.4,
  fontWeight: 600,
  textAlign: 'center',
  color: 'rgba(var(--theme-line), .8)',
}

const hueco: CSSProperties = {
  width: '100%',
  display: 'grid',
  placeItems: 'center',
  marginTop: 4,
}

const creditos: CSSProperties = {
  margin: '18px 0 0',
  maxWidth: 340,
  fontSize: 9.5,
  lineHeight: 1.4,
  opacity: 0.45,
  textAlign: 'center',
}

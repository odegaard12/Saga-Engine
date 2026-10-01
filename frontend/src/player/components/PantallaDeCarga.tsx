import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import {
  PARTES,
  algunaFallo,
  partesSinCompletar,
  todoListo,
  type EstadoDeCarga,
  type ParteId,
} from '../offline/motorDeCarga'
import { ProgresoPorPartes } from './ProgresoPorPartes'
import { ANIMACION_DE_ENTRADA_DE_PANTALLA, consumirEntradaSuave } from '../ui/entradaDePantalla'

/**
 * La pantalla de carga que lo baja TODO: App, Misión y Mapa, cada una con su barra.
 *
 * Sale al abrir la aplicación con cobertura SOLO si algo falta o ha cambiado, y
 * en «Prepararse» (encima del juego, con los permisos debajo). No se entra hasta
 * tenerlo todo; pasado un momento aparece «Entrar igualmente», que avisa de lo
 * que falta para jugar sin cobertura.
 *
 * Visualmente es la misma que `SplashScreen` (mismas variables de tema): la que
 * un jugador mira más rato el día que estrena la aplicación.
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
    explicacionEntrada:
      'Se guarda todo en el móvil para poder jugar sin cobertura. Solo se baja lo que ha cambiado.',
    explicacionPreparacion:
      'Comprueba que este móvil tiene la aplicación, la misión y el mapa al día, y pide los permisos.',
    entrarIgualmente: 'Entrar igualmente',
    reintentar: 'Reintentar',
    avisoEntrar: (faltan: string) =>
      `Si entras ahora, esto no estará listo para jugar sin cobertura: ${faltan}.`,
    partes: { app: 'la app', mision: 'la misión', mapa: 'el mapa' } as Record<ParteId, string>,
    sinCobertura: 'Sin cobertura: no se puede descargar nada ahora. Conéctate a internet y vuelve a intentarlo.',
  },
  gl: {
    tituloEntrada: 'Preparando a túa partida',
    tituloActualizando: 'Actualizando o que cambiou',
    tituloPreparacion: 'Prepararse antes de saír',
    tituloFallo: 'Non se puido completar',
    tituloListo: 'Todo listo',
    explicacionEntrada:
      'Gárdase todo no móbil para poder xogar sen cobertura. Só se baixa o que cambiou.',
    explicacionPreparacion:
      'Comproba que este móbil ten a aplicación, a misión e o mapa ao día, e pide os permisos.',
    entrarIgualmente: 'Entrar igualmente',
    reintentar: 'Tentar de novo',
    avisoEntrar: (faltan: string) =>
      `Se entras agora, isto non estará listo para xogar sen cobertura: ${faltan}.`,
    partes: { app: 'a app', mision: 'a misión', mapa: 'o mapa' } as Record<ParteId, string>,
    sinCobertura: 'Sen cobertura: non se pode descargar nada agora. Conéctate a internet e téntao de novo.',
  },
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
  /** Lo que va debajo de las barras: en «Prepararse», los permisos. */
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
  const tx = locale === 'gl' ? TEXTOS.gl : TEXTOS.es

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

  // «Actualizando» cuando ya se tenía algo y ha cambiado; «Preparando» la primera vez.
  const soloCambios =
    PARTES.every((id) => partes[id].motivo !== 'primera_vez') &&
    PARTES.some((id) => partes[id].motivo !== null)

  const titulo =
    modo === 'preparacion'
      ? fallo
        ? tx.tituloFallo
        : listo
          ? tx.tituloListo
          : tx.tituloPreparacion
      : fallo
        ? tx.tituloFallo
        : soloCambios
          ? tx.tituloActualizando
          : tx.tituloEntrada

  const puedeEntrarIgualmente = modo === 'entrada' && Boolean(onEntrarIgualmente) && (esperaAcabada || fallo)

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
        <img
          src="/saga-app-icon-192.png?v=redondo"
          alt="SAGA"
          style={icono}
          width={72}
          height={72}
        />

        <strong style={tituloEstilo}>{titulo}</strong>
        <p style={explicacion}>
          {modo === 'preparacion' ? tx.explicacionPreparacion : tx.explicacionEntrada}
        </p>

        {sinCobertura ? (
          <div style={avisoSinRed} role="alert">
            {tx.sinCobertura}
          </div>
        ) : (
          <ProgresoPorPartes partes={partes} />
        )}

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
              <div style={aviso}>
                {tx.avisoEntrar(sinCompletar.map((id) => tx.partes[id]).join(', '))}
              </div>
            ) : null}
          </div>
        ) : null}

        {children ? <div style={hueco}>{children}</div> : null}
      </div>
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
  justifyContent: 'center',
  gap: 14,
  padding: '28px 26px',
}

const icono: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: '50%',
  boxShadow: '0 8px 28px rgba(0,0,0,.5)',
  marginBottom: 6,
}

const tituloEstilo: CSSProperties = {
  fontSize: 19,
  fontWeight: 900,
  letterSpacing: '-.02em',
  textAlign: 'center',
  color: '#ffffff',
}

const explicacion: CSSProperties = {
  margin: '0 0 8px',
  maxWidth: 300,
  fontSize: 12,
  lineHeight: 1.5,
  fontWeight: 600,
  textAlign: 'center',
  color: 'rgba(var(--theme-line), .7)',
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
  gap: 8,
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

const aviso: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.45,
  fontWeight: 600,
  textAlign: 'center',
  color: '#fde68a',
}

const hueco: CSSProperties = {
  width: '100%',
  display: 'grid',
  placeItems: 'center',
  marginTop: 6,
}

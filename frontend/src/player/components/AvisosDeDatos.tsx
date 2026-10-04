import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import type { PlayerStage } from '../../types/player'
import {
  descartarRechazos,
  listarRechazosDefinitivos,
  type RechazoDefinitivo,
} from '../offline/missionPack'
import type { EstadoDeLoGuardado } from '../offline/revisiones'
import { borrarFotoPendente, listarFotosFallidas, type OfflinePhoto } from '../offline/localFirst'

/**
 * Dos avisos que antes no existían y que el jugador necesita ver:
 *
 *  - «N nodos no aceptados»: el servidor rechazó de forma definitiva un nodo que
 *    el móvil dio por bueno (el organizador cambió un código o un objeto tras la
 *    preparación). El móvil se quedaba adelantado y, al arrancar, volvía atrás
 *    sin que nadie supiera por qué.
 *  - «Sin cobertura: entras con lo guardado»: qué le pasa a lo que hay en el móvil
 *    (incompleto, viejo, faltan archivos o mapa), para no jugar creyendo que
 *    está todo.
 */

const TEXTOS = {
  es: {
    noAceptados: (n: number) =>
      n === 1 ? '1 nodo no aceptado — avisa al organizador' : `${n} nodos no aceptados — avisa al organizador`,
    entendido: 'Entendido',
    verLista: 'Ver cuáles',
    ocultar: 'Ocultar',
    nodo: 'Nodo',
    sinCoberturaTitulo: 'Sin cobertura: entras con lo guardado en el móvil',
    paqueteIncompleto: 'La misión guardada está incompleta (le faltan nodos o fotos).',
    paqueteViejo: (dias: number) => `La misión guardada es de hace ${dias} días.`,
    faltanArchivos: (n: number) => `Faltan ${n} archivos de la aplicación.`,
    mapaIncompleto: 'El mapa guardado no está completo para esta ruta.',
    conCobertura: 'Con cobertura se actualizará todo al abrir la aplicación.',
    fotosFallidas: (n: number) =>
      n === 1 ? '1 foto no se pudo subir' : `${n} fotos no se pudieron subir`,
    fotoMotivo: {
      rechazada: 'el servidor no la acepta',
      demasiado_grande: 'es demasiado grande',
      cupo_lleno: 'has llegado al máximo de fotos',
    } as Record<string, string>,
    quitarDelMovil: 'Quitar del móvil',
  },
  gl: {
    noAceptados: (n: number) =>
      n === 1 ? '1 nodo non aceptado — avisa ao organizador' : `${n} nodos non aceptados — avisa ao organizador`,
    entendido: 'Entendido',
    verLista: 'Ver cales',
    ocultar: 'Agochar',
    nodo: 'Nodo',
    sinCoberturaTitulo: 'Sen cobertura: entras co gardado no móbil',
    paqueteIncompleto: 'A misión gardada está incompleta (faltanlle nodos ou fotos).',
    paqueteViejo: (dias: number) => `A misión gardada é de hai ${dias} días.`,
    faltanArchivos: (n: number) => `Faltan ${n} ficheiros da aplicación.`,
    mapaIncompleto: 'O mapa gardado non está completo para esta ruta.',
    conCobertura: 'Con cobertura actualizarase todo ao abrir a aplicación.',
    fotosFallidas: (n: number) =>
      n === 1 ? '1 foto non se puido subir' : `${n} fotos non se puideron subir`,
    fotoMotivo: {
      rechazada: 'o servidor non a acepta',
      demasiado_grande: 'é demasiado grande',
      cupo_lleno: 'chegaches ao máximo de fotos',
    } as Record<string, string>,
    quitarDelMovil: 'Quitar do móbil',
  },
}

/* ------------------------------------------------------------------ *
 * Nodos no aceptados
 * ------------------------------------------------------------------ */

interface PropsDeRechazos {
  user: string
  /** Los nodos de la misión, para saber a cuál se refiere cada rechazo. */
  stages: PlayerStage[]
  /** Nivel al que va el jugador según el servidor. */
  level: number
  mobile: boolean
}

/**
 * Un rechazo sigue importando mientras su nodo esté por delante del jugador: si
 * el nivel ya lo ha pasado (el organizador lo rescató, o se rehizo bien), ya no
 * hay nada que avisar.
 */
export function rechazosVigentes(
  rechazos: RechazoDefinitivo[],
  stages: PlayerStage[],
  level: number
): RechazoDefinitivo[] {
  return rechazos.filter((rechazo) => {
    const indice = stages.findIndex((s) => String(s?.id ?? '') === rechazo.nodo)
    return indice < 0 || indice >= level
  })
}

/**
 * Los dos avisos de lo que el servidor no acepta: nodos y fotos. Van juntos
 * porque se montan en el mismo sitio de la pantalla del jugador.
 */
export function AvisoDeNodosNoAceptados(props: PropsDeRechazos) {
  return (
    <>
      <AvisoDeRechazos {...props} />
      <AvisoDeFotosFallidas user={props.user} mobile={props.mobile} />
    </>
  )
}

/**
 * Fotos de la cola que el servidor no va a aceptar nunca (demasiado grandes,
 * no válidas, cupo lleno). Antes se reintentaban en silencio toda la ruta; ahora
 * se dejan de subir y se le dice al jugador, que puede quitarlas del móvil.
 */
export function AvisoDeFotosFallidas({ user, mobile }: { user: string; mobile: boolean }) {
  const { locale } = useI18n()
  const tx = locale === 'gl' ? TEXTOS.gl : TEXTOS.es
  const [fallidas, setFallidas] = useState<OfflinePhoto[]>([])

  const leer = useCallback(async () => {
    setFallidas(await listarFotosFallidas(user).catch(() => []))
  }, [user])

  useEffect(() => {
    void leer()
    const alFallar = () => void leer()
    window.addEventListener('saga:foto-fallida', alFallar)
    return () => window.removeEventListener('saga:foto-fallida', alFallar)
  }, [leer])

  if (fallidas.length === 0) return null

  const motivos = [...new Set(fallidas.map((f) => tx.fotoMotivo[String(f.motivo_fallo)] || ''))].filter(Boolean)

  const cuerpo = (
    <div style={{ ...caja(mobile), top: 'calc(env(safe-area-inset-top) + 140px)' }} role="alert" data-saga-aviso="fotos-fallidas">
      <strong style={tituloCaja}>{tx.fotosFallidas(fallidas.length)}</strong>
      {motivos.length ? <span style={pieCaja}>{motivos.join(' · ')}</span> : null}
      <div style={acciones}>
        <button
          type="button"
          style={botonCaja}
          onClick={() => {
            void Promise.all(fallidas.map((f) => borrarFotoPendente(f.id))).then(() => {
              window.dispatchEvent(new CustomEvent('saga:foto-subida', { detail: { user } }))
              return leer()
            })
          }}
        >
          {tx.quitarDelMovil}
        </button>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? cuerpo : createPortal(cuerpo, document.body)
}

function AvisoDeRechazos({ user, stages, level, mobile }: PropsDeRechazos) {
  const { locale } = useI18n()
  const tx = locale === 'gl' ? TEXTOS.gl : TEXTOS.es
  const [rechazos, setRechazos] = useState<RechazoDefinitivo[]>([])
  const [abierta, setAbierta] = useState(false)

  const leer = useCallback(async () => {
    setRechazos(await listarRechazosDefinitivos(user).catch(() => []))
  }, [user])

  useEffect(() => {
    void leer()
    // Al terminar una sincronización que rechaza algo, y de vez en cuando por si
    // el aviso se pierde: es una lectura pequeña del almacén, no una petición.
    const alRechazar = () => void leer()
    window.addEventListener('saga:rechazos', alRechazar)
    const id = window.setInterval(() => void leer(), 20000)
    return () => {
      window.removeEventListener('saga:rechazos', alRechazar)
      window.clearInterval(id)
    }
  }, [leer])

  const visibles = rechazosVigentes(rechazos, stages, level)
  if (visibles.length === 0) return null

  const nombreDe = (rechazo: RechazoDefinitivo) => {
    const stage = stages.find((s) => String(s?.id ?? '') === rechazo.nodo)
    return stage?.title || rechazo.titulo || `${tx.nodo} ${rechazo.nodo}`
  }

  const cuerpo = (
    <div style={caja(mobile)} role="alert" data-saga-aviso="nodos-no-aceptados">
      <strong style={tituloCaja}>{tx.noAceptados(visibles.length)}</strong>

      {abierta ? (
        <ul style={listaCaja}>
          {visibles.map((rechazo) => (
            <li key={rechazo.id}>
              <strong>{nombreDe(rechazo)}</strong>: {rechazo.motivo}
            </li>
          ))}
        </ul>
      ) : null}

      <div style={acciones}>
        <button type="button" style={botonCaja} onClick={() => setAbierta((valor) => !valor)}>
          {abierta ? tx.ocultar : tx.verLista}
        </button>
        <button
          type="button"
          style={botonCaja}
          onClick={() => {
            void descartarRechazos(
              user,
              visibles.map((r) => r.id)
            ).then(leer)
          }}
        >
          {tx.entendido}
        </button>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? cuerpo : createPortal(cuerpo, document.body)
}

/* ------------------------------------------------------------------ *
 * Sin cobertura: lo guardado
 * ------------------------------------------------------------------ */

interface PropsDeGuardado {
  estado: EstadoDeLoGuardado
  mobile: boolean
  onCerrar: () => void
}

/** Las frases de lo que le pasa a lo guardado, en el idioma del jugador. */
export function frasesDeLoGuardado(
  estado: EstadoDeLoGuardado,
  idioma: 'es' | 'gl'
): string[] {
  const tx = idioma === 'gl' ? TEXTOS.gl : TEXTOS.es
  const frases: string[] = []
  if (estado.paqueteIncompleto) frases.push(tx.paqueteIncompleto)
  if (estado.paqueteViejo) frases.push(tx.paqueteViejo(estado.edadDias))
  if (estado.archivosDeAppQueFaltan > 0) frases.push(tx.faltanArchivos(estado.archivosDeAppQueFaltan))
  if (estado.mapaIncompleto) frases.push(tx.mapaIncompleto)
  return frases
}

export function AvisoDeLoGuardado({ estado, mobile, onCerrar }: PropsDeGuardado) {
  const { locale } = useI18n()
  const idioma = locale === 'gl' ? 'gl' : 'es'
  const tx = idioma === 'gl' ? TEXTOS.gl : TEXTOS.es
  const frases = frasesDeLoGuardado(estado, idioma)

  if (estado.todoEnOrden || frases.length === 0) return null

  const cuerpo = (
    <div style={{ ...caja(mobile), top: 'calc(env(safe-area-inset-top) + 72px)' }} role="status" data-saga-aviso="lo-guardado">
      <strong style={tituloCaja}>{tx.sinCoberturaTitulo}</strong>
      <ul style={listaCaja}>
        {frases.map((frase) => (
          <li key={frase}>{frase}</li>
        ))}
      </ul>
      <span style={pieCaja}>{tx.conCobertura}</span>
      <div style={acciones}>
        <button type="button" style={botonCaja} onClick={onCerrar}>
          {tx.entendido}
        </button>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? cuerpo : createPortal(cuerpo, document.body)
}

function caja(mobile: boolean): CSSProperties {
  return {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top) + 64px)',
    left: 12,
    right: 12,
    zIndex: 4700,
    margin: '0 auto',
    maxWidth: mobile ? 380 : 440,
    display: 'grid',
    gap: 8,
    padding: '12px 14px',
    borderRadius: 14,
    fontSize: 12.5,
    lineHeight: 1.45,
    color: '#fef3c7',
    background: 'rgba(56, 38, 4, .94)',
    border: '1px solid rgba(250, 204, 21, .55)',
    boxShadow: '0 12px 32px rgba(0,0,0,.45)',
  }
}

const tituloCaja: CSSProperties = { fontSize: 13.5, color: '#fde68a' }

const listaCaja: CSSProperties = { margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }

const pieCaja: CSSProperties = { fontSize: 11.5, opacity: 0.8 }

const acciones: CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end' }

const botonCaja: CSSProperties = {
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

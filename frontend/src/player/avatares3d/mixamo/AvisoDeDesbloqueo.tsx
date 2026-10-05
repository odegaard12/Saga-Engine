import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getLocale } from '../../../i18n'
import { mapaCubierto } from '../../hooks/useCubreElMapa'
import {
  EVENTO_DESBLOQUEOS,
  leerCopia,
  marcarVisto,
  nombreDeClave,
  pedirDesbloqueos,
  type Desbloqueos,
} from './desbloqueosTienda'
import './aviso.css'

/**
 * El aviso grande de «¡Desbloqueado!» (y los de sustitución: «X ahora se gana en …»).
 *
 * Mira el vestuario del jugador al arrancar, cada minuto, al volver la red y al pasar de nodo (lo que más
 * desbloquea). Si hay piezas nuevas que aún no se anunciaron, espera a que el mapa esté LIBRE —sin hojas, ni
 * tienda, ni ficha, ni minijuego encima— y lo enseña con su animación. «Nuevo» lo sigue marcando la tienda hasta
 * que se ve allí; aquí sólo se recuerda (en el móvil) qué se anunció, para no repetirlo.
 */

const TEXTOS = {
  es: {
    titulo: '¡Desbloqueado!',
    aviso: 'Cambio en el vestuario',
    ver: 'Verlo en la tienda',
    vale: 'Vale',
    yMas: (n: number) => `y ${n} más`,
  },
  gl: {
    titulo: 'Desbloqueado!',
    aviso: 'Cambio no vestiario',
    ver: 'Velo na tenda',
    vale: 'Vale',
    yMas: (n: number) => `e ${n} máis`,
  },
  en: {
    titulo: 'Unlocked!',
    aviso: 'Wardrobe change',
    ver: 'See it in the shop',
    vale: 'OK',
    yMas: (n: number) => `and ${n} more`,
  },
} as const

const claveAnunciados = (u: string) => `saga:desbloqueos-anunciados:${u}`
function leerAnunciados(u: string): Set<string> {
  try {
    const v = JSON.parse(window.localStorage.getItem(claveAnunciados(u)) || '[]')
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}
function guardarAnunciados(u: string, s: Set<string>) {
  try {
    window.localStorage.setItem(claveAnunciados(u), JSON.stringify([...s].slice(-300)))
  } catch {
    // Sin almacenamiento: como mucho se anuncia otra vez.
  }
}

/** Qué hay que anunciar: piezas nuevas no anunciadas y avisos pendientes. Pura (para las pruebas). */
export function pendienteDeAnunciar(
  d: Desbloqueos | null,
  anunciados: ReadonlySet<string>
): { claves: string[]; avisos: Desbloqueos['avisos'] } {
  if (!d || !d.activos) return { claves: [], avisos: [] }
  return { claves: d.nuevos.filter((k) => !anunciados.has(k)), avisos: d.avisos }
}

/** El mapa está libre: nada lo tapa (hojas, minijuego, cámara) ni hay un diálogo abierto encima. */
export function mapaLibre(): boolean {
  if (mapaCubierto()) return false
  return !document.querySelector(
    '.saga-tienda, .saga-gestos, .saga-ficha, [role="dialog"], [aria-modal="true"]'
  )
}

export function AvisoDeDesbloqueo({
  usuario,
  nivel,
  alVerTienda,
}: {
  usuario: string
  /** El nodo en juego: al cambiar se mira si se ganó algo. */
  nivel: number
  alVerTienda: () => void
}) {
  const idioma = getLocale() === 'gl' ? 'gl' : getLocale() === 'en' ? 'en' : 'es'
  const t = TEXTOS[idioma]
  const [datos, setDatos] = useState<Desbloqueos | null>(() =>
    usuario ? leerCopia(usuario) : null
  )
  const [mostrando, setMostrando] = useState<{
    claves: string[]
    avisos: Desbloqueos['avisos']
  } | null>(null)
  const [saliendo, setSaliendo] = useState(false)
  const anunciadosRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    anunciadosRef.current = leerAnunciados(usuario)
  }, [usuario])

  // Pedirlo: al arrancar, cada minuto, al volver la red y al cambiar de nodo.
  useEffect(() => {
    if (!usuario) return undefined
    let vivo = true
    const pedir = () => {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return
      void pedirDesbloqueos(usuario).then((d) => vivo && d && setDatos(d))
    }
    const primero = window.setTimeout(pedir, 4000)
    const reloj = window.setInterval(pedir, 60000)
    const alLlegar = (ev: Event) => {
      const d = (ev as CustomEvent<Desbloqueos>).detail
      if (d) setDatos(d)
    }
    window.addEventListener('online', pedir)
    window.addEventListener(EVENTO_DESBLOQUEOS, alLlegar)
    return () => {
      vivo = false
      window.clearTimeout(primero)
      window.clearInterval(reloj)
      window.removeEventListener('online', pedir)
      window.removeEventListener(EVENTO_DESBLOQUEOS, alLlegar)
    }
  }, [usuario])
  useEffect(() => {
    if (!usuario || nivel <= 0) return undefined
    const reloj = window.setTimeout(
      () => void pedirDesbloqueos(usuario).then((d) => d && setDatos(d)),
      2500
    )
    return () => window.clearTimeout(reloj)
  }, [usuario, nivel])

  // Esperar a que el mapa esté libre para enseñarlo.
  useEffect(() => {
    if (mostrando) return undefined
    const p = pendienteDeAnunciar(datos, anunciadosRef.current)
    if (!p.claves.length && !p.avisos.length) return undefined
    const mirar = () => {
      if (document.visibilityState === 'visible' && mapaLibre()) {
        setSaliendo(false)
        setMostrando(p)
        return true
      }
      return false
    }
    if (mirar()) return undefined
    const reloj = window.setInterval(() => {
      if (mirar()) window.clearInterval(reloj)
    }, 1000)
    return () => window.clearInterval(reloj)
  }, [datos, mostrando])

  const cerrar = useCallback(
    (verTienda: boolean) => {
      if (!mostrando || saliendo) return
      for (const k of mostrando.claves) anunciadosRef.current.add(k)
      guardarAnunciados(usuario, anunciadosRef.current)
      if (mostrando.avisos.length)
        void marcarVisto(usuario, { avisos: mostrando.avisos.map((a) => a.id) })
      setSaliendo(true)
      window.setTimeout(() => {
        setMostrando(null)
        setDatos((d) =>
          d
            ? { ...d, avisos: d.avisos.filter((a) => !mostrando.avisos.some((m) => m.id === a.id)) }
            : d
        )
        if (verTienda) alVerTienda()
      }, 220)
    },
    [mostrando, saliendo, usuario, alVerTienda]
  )

  if (!mostrando) return null
  const nombres = mostrando.claves.map((k) => nombreDeClave(k, idioma === 'gl' ? 'gl' : 'es'))
  const visibles = nombres.slice(0, 4)
  return createPortal(
    <div
      className={`saga-aviso-desbloqueo${saliendo ? ' saga-aviso-desbloqueo-sale' : ''}`}
      role="alertdialog"
      aria-label={t.titulo}
    >
      <div className="saga-aviso-desbloqueo-tarjeta">
        {mostrando.claves.length ? (
          <>
            <div className="saga-aviso-desbloqueo-rayos" aria-hidden="true" />
            <div className="saga-aviso-desbloqueo-icono" aria-hidden="true">
              🔓
            </div>
            <b className="saga-aviso-desbloqueo-titulo">{t.titulo}</b>
            <ul>
              {visibles.map((n) => (
                <li key={n}>{n}</li>
              ))}
              {nombres.length > visibles.length ? (
                <li>{t.yMas(nombres.length - visibles.length)}</li>
              ) : null}
            </ul>
          </>
        ) : (
          <b className="saga-aviso-desbloqueo-titulo saga-aviso-desbloqueo-titulo-suave">
            {t.aviso}
          </b>
        )}
        {mostrando.avisos.map((a) => (
          <p key={a.id} className="saga-aviso-desbloqueo-texto">
            {a.texto}
          </p>
        ))}
        <div className="saga-aviso-desbloqueo-botones">
          {mostrando.claves.length ? (
            <button
              type="button"
              className="saga-aviso-desbloqueo-principal"
              onClick={() => cerrar(true)}
            >
              {t.ver}
            </button>
          ) : null}
          <button type="button" onClick={() => cerrar(false)}>
            {t.vale}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default AvisoDeDesbloqueo

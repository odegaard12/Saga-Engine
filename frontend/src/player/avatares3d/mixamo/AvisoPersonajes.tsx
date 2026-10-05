import { useCallback, useEffect, useRef, useState } from 'react'
import { descargarRutasDeAvatares } from '../../offline/pwaShell'
import type { ComplementoDeAvatares } from './capaAvatares'
import type { MxId } from './catalogo'
import { urlDeAgarre, urlDeAnimaciones, urlDeCara, urlDePersonaje } from './rutas'
import {
  bajarPersonajesQueFaltan,
  faseDelAviso,
  haceFaltaBoton,
  TEXTO_BOTON_DESCARGAR,
  textoDelAviso,
} from './logicaAvisoPersonajes'

/**
 * «Faltan personajes por descargar · Descargar». Pequeño, sobre el mapa. Sólo sale si el mapa intentó leer el
 * modelo de un personaje de la caché del móvil y no estaba. Al tocarlo baja lo que falta con su barra (acción
 * visible y voluntaria; el mapa nunca pide modelos por su cuenta) y al terminar recoge los modelos.
 */

const rutasDe = (mx: MxId): string[] => {
  const cara = urlDeCara(mx)
  return [urlDeAnimaciones(), urlDePersonaje(mx), urlDeAgarre(mx), ...(cara ? [cara] : [])]
}

export function AvisoPersonajes({ comp }: { comp: () => ComplementoDeAvatares | null }) {
  const [faltan, setFaltan] = useState<MxId[]>([])
  const [bajando, setBajando] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [enLinea, setEnLinea] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 })
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    const mirar = () => setFaltan((antes) => {
      const ahora = comp()?.modelosPerdidos() ?? []
      return antes.length === ahora.length && antes.every((m, i) => m === ahora[i]) ? antes : ahora
    })
    const alRed = () => setEnLinea(navigator.onLine !== false)
    mirar()
    const t = window.setInterval(mirar, 1500)
    window.addEventListener('online', alRed)
    window.addEventListener('offline', alRed)
    return () => {
      vivo.current = false
      window.clearInterval(t)
      window.removeEventListener('online', alRed)
      window.removeEventListener('offline', alRed)
    }
  }, [comp])

  const descargar = useCallback(async () => {
    const c = comp()
    if (!c) return
    setBajando(true)
    setFallo(false)
    try {
      const r = await bajarPersonajesQueFaltan(
        c.modelosPerdidos(),
        { rutasDe, descargar: descargarRutasDeAvatares, alTerminar: () => c.alTerminarDeBajarModelos() },
        (hecho, total) => vivo.current && setProgreso({ hecho, total })
      )
      if (vivo.current) setFallo(r.fallo)
    } catch {
      if (vivo.current) setFallo(true)
    } finally {
      if (vivo.current) setBajando(false)
    }
  }, [comp])

  const fase = faseDelAviso({ faltan: faltan.length, bajando, enLinea, fallo })
  if (fase === 'oculto') return null
  const pct = progreso.total > 0 ? Math.round((progreso.hecho / progreso.total) * 100) : 0
  return (
    <div
      role="status"
      data-saga-aviso-personajes={fase}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 'calc(env(safe-area-inset-top, 0px) + 112px)',
        width: 'fit-content',
        maxWidth: 'calc(100% - 32px)',
        margin: '0 auto',
        padding: '6px 8px 6px 12px',
        borderRadius: 999,
        background: 'rgba(var(--theme-ink), .82)',
        color: '#ffffff',
        border: '1px solid rgba(255,255,255,.35)',
        font: '700 12px/1.25 system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 5,
      }}
    >
      <span>
        {textoDelAviso(fase, progreso)}
        {fase === 'bajando' ? (
          <span
            aria-hidden="true"
            style={{ display: 'block', height: 3, marginTop: 4, borderRadius: 2, background: 'rgba(255,255,255,.25)' }}
          >
            <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 2, background: '#fff' }} />
          </span>
        ) : null}
      </span>
      {haceFaltaBoton(fase) ? (
        <button
          type="button"
          onClick={() => void descargar()}
          style={{
            minHeight: 44,
            padding: '0 14px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,.5)',
            background: 'rgba(255,255,255,.18)',
            color: '#fff',
            font: '800 12px system-ui, sans-serif',
            cursor: 'pointer',
          }}
        >
          {fase === 'fallo' ? 'Reintentar' : TEXTO_BOTON_DESCARGAR}
        </button>
      ) : null}
    </div>
  )
}

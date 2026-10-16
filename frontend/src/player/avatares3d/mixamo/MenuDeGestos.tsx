import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getLocale } from '../../../i18n'
import { EVENTO_HOJA_DE_GESTOS } from '../../avatares/GestorDePersonaje'
import { useAreaVisible } from './areaVisible'
import { GESTOS } from './catalogo'
import { claveGesto, estaBloqueada, pistaDe, ultimaConocida } from './desbloqueosTienda'
import { MENSAJES_RAPIDOS } from './reacciones'
import { idiomaDeTienda, TEXTOS_MENU_GESTOS } from './textosTienda'

/**
 * El menú que sale al tocar a tu avatar 3D en el mapa: los gestos para hacer
 * (saludar, aplaudir, asentir...) y un atajo a la tienda de ropa. Tocar fuera lo
 * cierra. Los gestos son los clips `ge__*` de Mixamo; no hay sentarse, saltar ni
 * bailar.
 *
 * 5.52: en tres grupos y con un icono cada uno, en una rejilla de tres columnas que se lee en el móvil. La vista
 * previa es TU muñeco: la hoja es baja y transparente arriba, y tocar un gesto ya no cierra el menú (el gesto suena
 * en el mapa y su ficha se marca mientras dura), así que se prueban uno tras otro. Los bloqueados dicen cómo se ganan.
 */

/** Grupo e icono de cada gesto (el orden de `GESTOS` es el del servidor: aquí sólo se agrupa al pintar). */
export const PRESENTACION_DE_GESTOS: Record<
  string,
  { grupo: 'saludar' | 'responder' | 'expresar'; icono: string }
> = {
  ge__salute: { grupo: 'saludar', icono: '👋' },
  ge__clapping: { grupo: 'saludar', icono: '👏' },
  ge__happy_hand_gesture: { grupo: 'saludar', icono: '🙌' },
  ge__head_nod_yes: { grupo: 'responder', icono: '👍' },
  ge__shaking_head_no: { grupo: 'responder', icono: '🙅' },
  ge__dismissing_gesture: { grupo: 'expresar', icono: '👉' },
  ge__being_cocky: { grupo: 'expresar', icono: '🤷' },
}
const GRUPOS = ['saludar', 'responder', 'expresar'] as const
/** Lo que se marca la ficha del gesto que suena (un gesto de Mixamo dura 2-4 s). */
export const MARCA_MS = 2600

export function MenuDeGestos({
  alGesto,
  alMensaje,
  alTienda,
  alCerrar,
}: {
  alGesto: (clip: string) => void
  /** Un mensaje rápido (5.59): sale en un bocadillo sobre tu muñeco y lo ven los demás. */
  alMensaje: (id: string) => void
  alTienda: () => void
  alCerrar: () => void
}) {
  useAreaVisible()
  const locale = getLocale()
  const idioma = idiomaDeTienda(locale)
  const t = TEXTOS_MENU_GESTOS[idioma]
  // Los gestos que aún no son tuyos salen con candado y su pista; en la tienda se pueden probar.
  const d = ultimaConocida()
  const [sonando, setSonando] = useState<string | null>(null)
  const reloj = useRef(0)
  useEffect(() => () => window.clearTimeout(reloj.current), [])
  useEffect(() => {
    const alTecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [alCerrar])
  // El mapa sube lo que mide la hoja (MapSurfaceGL): tu muñeco queda a la vista encima mientras eliges.
  const hojaRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const hoja = hojaRef.current
    const avisar = (alto: number) => {
      window.dispatchEvent(new CustomEvent(EVENTO_HOJA_DE_GESTOS, { detail: { alto } }))
    }
    // offsetHeight y no la caja en pantalla: la hoja entra deslizándose y al montarse aún está abajo.
    if (hoja) avisar(hoja.offsetHeight + 24)
    return () => avisar(0)
  }, [])
  const hacer = (clip: string) => {
    alGesto(clip)
    setSonando(clip)
    window.clearTimeout(reloj.current)
    reloj.current = window.setTimeout(() => setSonando(null), MARCA_MS)
  }
  return createPortal(
    // 5.59.3: no es modal ni se cierra tocando fuera: con él abierto se mueve el mapa (lo pidió Óscar).
    <div className="saga-gestos" role="dialog" aria-label={t.titulo}>
      <div ref={hojaRef} className="saga-gestos-hoja">
        <button type="button" className="saga-gestos-x" aria-label={t.cerrar} onClick={alCerrar}>
          ×
        </button>
        <div className="saga-gestos-titulo">{t.ayuda}</div>
        {/* 5.59: dos filas que se deslizan en horizontal: los gestos y los mensajes rápidos (bocadillo encima de
            tu muñeco, que también ven los demás). 5.58 ya la había bajado del 60 % de la pantalla. */}
        <div className="saga-gestos-fila-nombre">{t.filaGestos}</div>
        <div className="saga-gestos-rejilla saga-gestos-fila" aria-label={t.subtitulo}>
          {GRUPOS.flatMap((grupo) =>
            GESTOS.filter((g) => (PRESENTACION_DE_GESTOS[g.clip]?.grupo ?? 'expresar') === grupo)
          ).map((g) => {
            const bloqueado = estaBloqueada(d, claveGesto(g.clip))
            const pista = bloqueado ? pistaDe(d, claveGesto(g.clip)) : ''
            return (
              <button
                key={g.clip}
                type="button"
                className={`saga-gestos-ficha${bloqueado ? ' saga-gestos-ficha-bloqueada' : ''}${sonando === g.clip ? ' saga-gestos-ficha-sonando' : ''}`}
                disabled={bloqueado}
                aria-pressed={sonando === g.clip}
                title={pista || undefined}
                onClick={() => hacer(g.clip)}
              >
                <span className="saga-gestos-icono" aria-hidden="true">
                  {bloqueado ? '🔒' : (PRESENTACION_DE_GESTOS[g.clip]?.icono ?? '✨')}
                </span>
                <span className="saga-gestos-nombre">{idioma === 'gl' ? g.gl : g.es}</span>
                {pista ? <span className="saga-gestos-pista">{pista}</span> : null}
              </button>
            )
          })}
        </div>
        <div className="saga-gestos-fila-nombre">{t.filaMensajes}</div>
        <div className="saga-gestos-fila saga-gestos-mensajes" aria-label={t.filaMensajes}>
          {MENSAJES_RAPIDOS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`saga-gestos-mensaje${sonando === m.id ? ' saga-gestos-ficha-sonando' : ''}`}
              onClick={() => {
                alMensaje(m.id)
                setSonando(m.id)
                window.clearTimeout(reloj.current)
                reloj.current = window.setTimeout(() => setSonando(null), MARCA_MS)
              }}
            >
              <span aria-hidden="true">{m.icono}</span> {locale === 'gl' ? m.gl : locale === 'en' ? m.en : m.es}
            </button>
          ))}
        </div>
        <div className="saga-gestos-botones">
          <button type="button" className="saga-gestos-tienda" onClick={alTienda}>
            {t.tienda}
          </button>
          <button type="button" className="saga-gestos-cerrar" onClick={alCerrar}>
            {t.cerrar}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default MenuDeGestos

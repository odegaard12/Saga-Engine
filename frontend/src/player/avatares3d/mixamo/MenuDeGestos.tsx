import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getLocale } from '../../../i18n'
import { useAreaVisible } from './areaVisible'
import { GESTOS } from './catalogo'
import { claveGesto, estaBloqueada, pistaDe, ultimaConocida } from './desbloqueosTienda'
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
const PRESENTACION_DE_GESTOS: Record<
  string,
  { grupo: 'saludar' | 'responder' | 'expresar'; icono: string }
> = {
  ge__salute: { grupo: 'saludar', icono: '👋' },
  ge__clapping: { grupo: 'saludar', icono: '👏' },
  ge__happy_hand_gesture: { grupo: 'saludar', icono: '🙌' },
  ge__head_nod_yes: { grupo: 'responder', icono: '👍' },
  ge__acknowledging: { grupo: 'responder', icono: '👌' },
  ge__shaking_head_no: { grupo: 'responder', icono: '🙅' },
  ge__dismissing_gesture: { grupo: 'expresar', icono: '👉' },
  ge__thoughtful_head_shake: { grupo: 'expresar', icono: '🤔' },
  ge__being_cocky: { grupo: 'expresar', icono: '🤷' },
  ge__look_away_gesture: { grupo: 'expresar', icono: '👀' },
  ge__relieved_sigh: { grupo: 'expresar', icono: '😮‍💨' },
  ge__weight_shift: { grupo: 'expresar', icono: '⏳' },
}
const GRUPOS = ['saludar', 'responder', 'expresar'] as const
/** Lo que se marca la ficha del gesto que suena (un gesto de Mixamo dura 2-4 s). */
const MARCA_MS = 2600

export function MenuDeGestos({
  alGesto,
  alTienda,
  alCerrar,
}: {
  alGesto: (clip: string) => void
  alTienda: () => void
  alCerrar: () => void
}) {
  useAreaVisible()
  const idioma = idiomaDeTienda(getLocale())
  const t = TEXTOS_MENU_GESTOS[idioma]
  // Los gestos que aún no son tuyos salen con candado y su pista; en la tienda se pueden probar.
  const d = ultimaConocida()
  const [sonando, setSonando] = useState<string | null>(null)
  const reloj = useRef(0)
  useEffect(() => () => window.clearTimeout(reloj.current), [])
  const hacer = (clip: string) => {
    alGesto(clip)
    setSonando(clip)
    window.clearTimeout(reloj.current)
    reloj.current = window.setTimeout(() => setSonando(null), MARCA_MS)
  }
  return createPortal(
    <div
      className="saga-gestos"
      role="dialog"
      aria-modal="true"
      aria-label={t.titulo}
      onClick={alCerrar}
    >
      <div className="saga-gestos-hoja" onClick={(ev) => ev.stopPropagation()}>
        <div className="saga-gestos-titulo">{t.ayuda}</div>
        <div className="saga-gestos-sub">{t.subtitulo}</div>
        {GRUPOS.map((grupo) => (
          <section key={grupo} className="saga-gestos-grupo" aria-label={t.grupos[grupo]}>
            <div className="saga-gestos-grupo-nombre">{t.grupos[grupo]}</div>
            <div className="saga-gestos-rejilla">
              {GESTOS.filter(
                (g) => (PRESENTACION_DE_GESTOS[g.clip]?.grupo ?? 'expresar') === grupo
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
          </section>
        ))}
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

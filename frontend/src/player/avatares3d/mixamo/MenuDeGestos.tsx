import { createPortal } from 'react-dom'
import { getLocale } from '../../../i18n'
import { GESTOS } from './catalogo'
import { idiomaDeTienda, TEXTOS_MENU_GESTOS } from './textosTienda'

/**
 * El menú que sale al tocar a tu avatar 3D en el mapa: los gestos para hacer
 * (saludar, aplaudir, asentir...) y un atajo a la tienda de ropa. Tocar fuera lo
 * cierra. Los gestos son los clips `ge__*` de Mixamo; no hay sentarse, saltar ni
 * bailar.
 */
export function MenuDeGestos({
  alGesto,
  alTienda,
  alCerrar,
}: {
  alGesto: (clip: string) => void
  alTienda: () => void
  alCerrar: () => void
}) {
  const idioma = idiomaDeTienda(getLocale())
  const t = TEXTOS_MENU_GESTOS[idioma]
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
        <div className="saga-tienda-fichas">
          {GESTOS.map((g) => (
            <button
              key={g.clip}
              type="button"
              className="saga-tienda-ficha"
              onClick={() => alGesto(g.clip)}
            >
              {idioma === 'gl' ? g.gl : g.es}
            </button>
          ))}
        </div>
        <button type="button" className="saga-gestos-tienda" onClick={alTienda}>
          {t.tienda}
        </button>
        <button type="button" className="saga-gestos-cerrar" onClick={alCerrar}>
          {t.cerrar}
        </button>
      </div>
    </div>,
    document.body
  )
}

export default MenuDeGestos

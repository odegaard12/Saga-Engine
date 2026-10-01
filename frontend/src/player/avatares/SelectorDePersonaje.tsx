import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getLocale } from '../../i18n'
import { lienzoDePersonaje } from './dibujarPersonaje'
import { nombreDePersonaje, PERSONAJES, type Personaje } from './personajes'

const TEXTOS = {
  es: { titulo: 'Elige tu personaje', ayuda: 'Así te verán tú y tu equipo en el mapa. Lo puedes cambiar tocándote en el mapa.', listo: 'Listo', cerrar: 'Cerrar' },
  gl: { titulo: 'Escolle o teu personaxe', ayuda: 'Así te verán ti e o teu equipo no mapa. Podes cambialo tocándote no mapa.', listo: 'Listo', cerrar: 'Pechar' },
  en: { titulo: 'Pick your character', ayuda: 'This is how you and your team see you on the map. Tap yourself on the map to change it.', listo: 'Done', cerrar: 'Close' },
} as const

function Ficha({ id, color }: { id: Personaje; color: string }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const cont = ref.current
    if (!cont) return
    cont.textContent = ''
    const lienzo = lienzoDePersonaje(id, 64, color + '55')
    if (lienzo) {
      lienzo.style.width = '64px'
      lienzo.style.height = '64px'
      cont.appendChild(lienzo)
    }
  }, [id, color])
  return <span ref={ref} className="saga-selector-ficha" aria-hidden="true" />
}

/**
 * La hoja para elegir personaje. Es una capa fija propia (no una hoja del
 * juego): la abre el mapa la primera vez y al tocarte a ti mismo.
 */
export function SelectorDePersonaje({
  actual,
  color,
  alElegir,
  alCerrar,
}: {
  actual: Personaje
  color: string
  alElegir: (personaje: Personaje) => void
  alCerrar: () => void
}) {
  const locale = getLocale()
  const t = TEXTOS[locale in TEXTOS ? locale : 'es']
  // En el `body`: dentro del mapa quedaba por DEBAJO de la barra de iconos y de
  // «Abrir nodo / Herramientas» (otro contexto de apilado) y «Listo» no se podía tocar.
  return createPortal(
    <div className="saga-selector" role="dialog" aria-modal="true" aria-label={t.titulo} onClick={alCerrar}>
      <div className="saga-selector-hoja" onClick={(ev) => ev.stopPropagation()}>
        <div className="saga-selector-titulo">{t.titulo}</div>
        <div className="saga-selector-ayuda">{t.ayuda}</div>
        <div className="saga-selector-rejilla">
          {PERSONAJES.map((id) => (
            <button
              key={id}
              type="button"
              className={`saga-selector-opcion${id === actual ? ' saga-selector-opcion-activa' : ''}`}
              aria-pressed={id === actual}
              onClick={() => alElegir(id)}
            >
              <Ficha id={id} color={color} />
              <span className="saga-selector-nombre">{nombreDePersonaje(id, locale)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="saga-selector-listo" onClick={alCerrar}>
          {t.listo}
        </button>
      </div>
    </div>,
    document.body
  )
}

export default SelectorDePersonaje

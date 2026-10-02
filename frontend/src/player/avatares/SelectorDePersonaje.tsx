import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getLocale } from '../../i18n'
import { lienzoDePersonaje } from './dibujarPersonaje'
import './selector.css'
import { nombreDePersonaje, PERSONAJES, type Personaje } from './personajes'

const TEXTOS = {
  es: { titulo: 'Elige tu personaje', ayuda: 'Así te verán tú y tu equipo en el mapa. Lo puedes cambiar en Herramientas o tocándote en el mapa.', listo: 'Listo', cancelar: 'Cancelar', ocupado: 'Ocupado', guardando: 'Guardando…' },
  gl: { titulo: 'Escolle o teu personaxe', ayuda: 'Así te verán ti e o teu equipo no mapa. Podes cambialo en Ferramentas ou tocándote no mapa.', listo: 'Listo', cancelar: 'Cancelar', ocupado: 'Ocupado', guardando: 'Gardando…' },
  en: { titulo: 'Pick your character', ayuda: 'This is how you and your team see you on the map. Change it later in Tools or by tapping yourself on the map.', listo: 'Done', cancelar: 'Cancel', ocupado: 'Taken', guardando: 'Saving…' },
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
 * La hoja para elegir personaje (sólo presenta: lo que se guarda lo decide
 * `GestorDePersonaje`). Es una capa fija propia, en el `body`.
 *
 * - `ocupados`: los que ya tiene otro jugador; no se pueden tocar.
 * - `pleno`: antes de la pantalla de carga; ocupa toda la pantalla y no se cierra tocando fuera.
 */
export function SelectorDePersonaje({
  seleccionado,
  ocupados,
  color,
  pleno,
  guardando,
  mensaje,
  alSeleccionar,
  alConfirmar,
  alCancelar,
}: {
  seleccionado: Personaje
  ocupados: ReadonlySet<Personaje>
  color: string
  pleno?: boolean
  guardando?: boolean
  mensaje?: string | null
  alSeleccionar: (personaje: Personaje) => void
  alConfirmar: () => void
  alCancelar?: () => void
}) {
  const locale = getLocale()
  const t = TEXTOS[locale in TEXTOS ? locale : 'es']
  // En el `body`: dentro del mapa quedaba por DEBAJO de la barra de iconos y de
  // «Abrir nodo / Herramientas» (otro contexto de apilado) y «Listo» no se podía tocar.
  return createPortal(
    <div
      className={`saga-selector${pleno ? ' saga-selector-pleno' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t.titulo}
      onClick={pleno ? undefined : alCancelar}
    >
      <div className="saga-selector-hoja" onClick={(ev) => ev.stopPropagation()}>
        <div className="saga-selector-titulo">{t.titulo}</div>
        <div className="saga-selector-ayuda">{t.ayuda}</div>
        <div className="saga-selector-rejilla">
          {PERSONAJES.map((id) => {
            const ocupado = ocupados.has(id)
            return (
              <button
                key={id}
                type="button"
                disabled={ocupado || guardando}
                className={`saga-selector-opcion${id === seleccionado ? ' saga-selector-opcion-activa' : ''}${ocupado ? ' saga-selector-opcion-ocupada' : ''}`}
                aria-pressed={id === seleccionado}
                data-ocupado={ocupado ? '1' : undefined}
                onClick={() => alSeleccionar(id)}
              >
                <Ficha id={id} color={color} />
                <span className="saga-selector-nombre">{nombreDePersonaje(id, locale)}</span>
                {ocupado ? <span className="saga-selector-ocupado">{t.ocupado}</span> : null}
              </button>
            )
          })}
        </div>
        {mensaje ? (
          <div className="saga-selector-aviso" role="alert">
            {mensaje}
          </div>
        ) : null}
        <button type="button" className="saga-selector-listo" disabled={guardando} onClick={alConfirmar}>
          {guardando ? t.guardando : t.listo}
        </button>
        {alCancelar && !pleno ? (
          <button type="button" className="saga-selector-listo saga-selector-cancelar" onClick={alCancelar}>
            {t.cancelar}
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export default SelectorDePersonaje

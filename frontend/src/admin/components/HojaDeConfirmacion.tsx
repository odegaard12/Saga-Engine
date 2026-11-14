import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { etiquetaDeSegundos, leerSegundos } from '../lib/ajusteDeTiempo'
import type { TiempoDeSalto } from '../lib/mensajesDelPanel'

type Props = {
  titulo: string
  /** Qué va a pasar, en una frase. */
  intro: string
  /** Lo que se le dará al jugador (objetos, accesorios, estrellas). */
  entrega?: string[]
  avisos?: string[]
  /** Con selector de tiempo: «sin tiempo» (por defecto), «el del código de respaldo» o una cifra. */
  conTiempo?: boolean
  textoConfirmar: string
  peligro?: boolean
  onConfirmar: (tiempo: TiempoDeSalto) => void
  onCancelar: () => void
}

/**
 * La confirmación de una acción que no se deshace sola (mover de nodo, terminar, reiniciar). Sustituye al
 * `window.confirm`: dice qué se entrega, deja elegir el tiempo y cabe en un móvil de 320 px.
 */
export default function HojaDeConfirmacion({
  titulo,
  intro,
  entrega = [],
  avisos = [],
  conTiempo = false,
  textoConfirmar,
  peligro = false,
  onConfirmar,
  onCancelar,
}: Props) {
  const idTitulo = useId()
  const [modo, setModo] = useState<TiempoDeSalto['modo']>('ninguno')
  const [cifra, setCifra] = useState('5:00')
  const hoja = useRef<HTMLDivElement>(null)
  const segundos = modo === 'cifra' ? leerSegundos(cifra) : null
  const cifraMala = modo === 'cifra' && (segundos === null || segundos <= 0)

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    hoja.current?.focus()
    return () => anterior?.focus?.()
  }, [])

  // En el <body>: dentro de la ficha (que es `position: fixed`) quedaría debajo del menú de abajo del móvil.
  return createPortal(
    <div
      className="r8-hoja-fondo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelar()
      }}
    >
      <div
        ref={hoja}
        className="r8-hoja"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancelar()
        }}
      >
        <h3 id={idTitulo}>{titulo}</h3>
        <p>{intro}</p>
        {entrega.length > 0 ? (
          <div className="r8-entrega">
            <strong>Se le da: </strong>
            {entrega.join(', ')}
          </div>
        ) : null}
        {avisos.map((aviso) => (
          <div key={aviso} className="r8-aviso">
            {aviso}
          </div>
        ))}
        {conTiempo ? (
          <fieldset className="r8-opciones">
            <legend>Tiempo que se le cuenta</legend>
            <label className="r8-opcion">
              <input type="radio" name="tiempo-salto" checked={modo === 'ninguno'} onChange={() => setModo('ninguno')} />
              <strong>Ninguno</strong>
              <small>Su tiempo no cambia. Es lo normal si ya jugó o el fallo fue nuestro.</small>
            </label>
            <label className="r8-opcion">
              <input type="radio" name="tiempo-salto" checked={modo === 'respaldo'} onChange={() => setModo('respaldo')} />
              <strong>El del código de respaldo</strong>
              <small>Lo mismo que costaría desbloquear el nodo con el código.</small>
            </label>
            <label className="r8-opcion">
              <input type="radio" name="tiempo-salto" checked={modo === 'cifra'} onChange={() => setModo('cifra')} />
              <strong>Una cifra</strong>
              <small>Minutos y segundos, por ejemplo 5:00.</small>
            </label>
            {modo === 'cifra' ? (
              <>
                <input
                  type="text"
                  inputMode="text"
                  value={cifra}
                  aria-label="Tiempo a sumar (minutos:segundos)"
                  aria-invalid={cifraMala}
                  onChange={(e) => setCifra(e.target.value)}
                />
                {cifraMala ? <small role="alert">Escribe un tiempo válido, como 5:00 o 90.</small> : null}
              </>
            ) : null}
          </fieldset>
        ) : null}
        <div className="r8-pie">
          <button type="button" className="r8-boton" onClick={onCancelar}>
            <strong>Cancelar</strong>
          </button>
          <button
            type="button"
            className={`r8-boton ${peligro ? 'peligro' : 'primario'}`}
            disabled={cifraMala}
            onClick={() =>
              onConfirmar({ modo, ms: modo === 'cifra' && segundos ? Math.abs(segundos) * 1000 : 0 })
            }
          >
            <strong>{textoConfirmar}</strong>
            {modo === 'cifra' && segundos ? <small>+{etiquetaDeSegundos(segundos)}</small> : null}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

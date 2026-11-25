import { leerTiempoDeNodo, relojDeSegundos, SEGUNDOS_MAXIMOS_DE_NODO, tecleadoATexto } from '../lib/ajusteDeTiempo'

/**
 * 24/11: cómo se pide, en «Nodo adelante» de un nodo con juego, el tiempo que tardó el jugador (el que el organizador ve en
 * su móvil). Tres diseños para elegir; se cambia aquí, en una línea:
 *  - `teclado`: el nombre del nodo, el reloj grande y un teclado propio de cifras («2», «5», «4» → 2:54). Sin teclado del
 *    sistema (en el iPhone el numérico no tiene «:» y tapa media hoja). Es el de por defecto.
 *  - `campo`: un campo de texto «m:ss» en la misma hoja. Lo más corto.
 *  - `chips`: el campo y, si el panel sabe desde cuándo está en el nodo, un toque con ese tiempo.
 */
export type DisenoDeTiempo = 'teclado' | 'campo' | 'chips'
export const DISENO_DE_TIEMPO: DisenoDeTiempo = 'teclado'

type Props = {
  diseno?: DisenoDeTiempo
  nombreDelNodo: string
  /** Segundos que lleva en el nodo según el panel (llegada o último avance), si se saben. */
  enNodoS?: number | null
  /** Lo escrito: «2:54» en `campo`/`chips`; las cifras tecleadas («254») en `teclado`. */
  texto: string
  onTexto: (texto: string) => void
  sinTiempo: boolean
  onSinTiempo: (sinTiempo: boolean) => void
}

/** Los segundos de lo escrito en cualquiera de los tres diseños (null si no vale). */
export function segundosDe(diseno: DisenoDeTiempo, texto: string): number | null {
  return leerTiempoDeNodo(diseno === 'teclado' ? tecleadoATexto(texto) : texto)
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'borrar'] as const

export default function TiempoDelNodo({
  diseno = DISENO_DE_TIEMPO,
  nombreDelNodo,
  enNodoS,
  texto,
  onTexto,
  sinTiempo,
  onSinTiempo,
}: Props) {
  const segundos = segundosDe(diseno, texto)
  const malo = !sinTiempo && texto.trim() !== '' && segundos === null
  const sugerido = enNodoS && enNodoS > 0 && enNodoS <= SEGUNDOS_MAXIMOS_DE_NODO ? Math.round(enNodoS) : null

  return (
    <fieldset className={`r8-opciones r8-tiempo-nodo r8-tiempo-${diseno}`}>
      <legend>Tiempo que tardó en «{nombreDelNodo}»</legend>
      {diseno === 'teclado' ? (
        <>
          <output className={`r8-reloj ${sinTiempo ? 'apagado' : ''}`} aria-live="polite">
            {sinTiempo ? 'sin tiempo' : tecleadoATexto(texto) || '0:00'}
          </output>
          <div className="r8-teclado" role="group" aria-label="Teclado de minutos y segundos">
            {TECLAS.map((tecla) => (
              <button
                key={tecla}
                type="button"
                className="r8-tecla"
                disabled={sinTiempo}
                aria-label={tecla === 'borrar' ? 'Borrar la última cifra' : undefined}
                onClick={() => onTexto(tecla === 'borrar' ? texto.slice(0, -1) : (texto + tecla).slice(-4))}
              >
                {tecla === 'borrar' ? 'Borrar' : tecla}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {diseno === 'chips' && sugerido ? (
            <div className="r8-chips-tiempo">
              <button
                type="button"
                className="r8-chip-boton"
                disabled={sinTiempo}
                onClick={() => onTexto(relojDeSegundos(sugerido))}
              >
                <strong>{relojDeSegundos(sugerido)}</strong>
                <small>lleva en el nodo</small>
              </button>
            </div>
          ) : null}
          <input
            type="text"
            inputMode="decimal"
            placeholder="2:54"
            value={texto}
            disabled={sinTiempo}
            aria-label="Tiempo que tardó (minutos:segundos)"
            aria-invalid={malo}
            onChange={(e) => onTexto(e.target.value)}
          />
        </>
      )}
      {malo ? (
        <small role="alert">
          Escribe un tiempo como 2:54 o 174 (segundos), de 0:01 a {relojDeSegundos(SEGUNDOS_MAXIMOS_DE_NODO)}.
        </small>
      ) : null}
      <label className="r8-opcion">
        <input type="checkbox" checked={sinTiempo} onChange={(e) => onSinTiempo(e.target.checked)} />
        <strong>Pasar sin tiempo</strong>
        <small>No se le apunta tiempo en este nodo.</small>
      </label>
    </fieldset>
  )
}

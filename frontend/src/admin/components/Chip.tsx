import type { DatosChip } from '../lib/estadoDeJugador'

/** Los chips de estado de un jugador (presencia, GPS, tiempo…): una lista de píldoras tranquilas, sin mayúsculas. */
export function Chips({ chips, etiqueta }: { chips: DatosChip[]; etiqueta: string }) {
  if (chips.length === 0) return null
  return (
    <ul className="r8-chips" aria-label={etiqueta}>
      {chips.map((chip) => (
        <li key={chip.clave} className={`r8-chip ${chip.tono === 'neutro' ? '' : chip.tono}`.trim()}>
          {chip.punto ? <i aria-hidden="true" /> : null}
          {chip.texto}
        </li>
      ))}
    </ul>
  )
}

import { useState } from 'react'
import type { AdminTiempoDeJugador } from '../lib/adminApi'
import { ajusteConSigno, etiquetaDeSegundos, leerSegundos } from '../lib/ajusteDeTiempo'
import { formatoTiempo } from './vestuario/estilos'

/**
 * «Tiempo» en la ficha de un jugador: cuánto lleva, y sumarle o restarle tiempo a mano.
 *
 * El caso: dice que hizo un juego en 30 s, el organizador lo comprueba, ve que falló algo y le suma lo que toque; o se
 * equivocó y lo quita. NO toca el nodo: el jugador sigue donde iba. Usa los mismos bloques que «Progreso de partida».
 */
type Props = {
  nombre: string
  tiempo?: AdminTiempoDeJugador
  ocupado: boolean
  onAjustar: (segundos: number, motivo: string) => void
}

const ATAJOS: Array<[string, number]> = [
  ['+30 s', 30],
  ['+1 min', 60],
  ['+2 min', 120],
  ['−30 s', -30],
  ['−1 min', -60],
]

export default function AjusteDeTiempo({ nombre, tiempo, ocupado, onAjustar }: Props) {
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const segundos = leerSegundos(texto)
  const mal = texto.trim() !== '' && segundos === null

  return (
    <div className="admin-player-progress-controls" data-ajuste-de-tiempo>
      <div className="admin-player-progress-copy">
        <strong>Tiempo de {nombre}</strong>
        <span>
          {tiempo
            ? `Total ${formatoTiempo(tiempo.total_time_ms)} · penalizaciones ${formatoTiempo(tiempo.penalties_ms)} · ajuste manual ${ajusteConSigno(tiempo.ajuste_admin_ms)}`
            : 'Suma o resta tiempo si comprobaste su juego y algo falló.'}
        </span>
        {mal ? <small>Escribe segundos («45», «-30») o minutos y segundos («1:30»).</small> : null}
      </div>

      <div className="admin-player-progress-buttons">
        {ATAJOS.map(([etiqueta, valor]) => (
          <button
            key={etiqueta}
            type="button"
            className="admin-inline-soft"
            disabled={ocupado}
            onClick={() => setTexto(String(valor))}
            aria-label={`${valor > 0 ? 'Sumar' : 'Restar'} ${etiquetaDeSegundos(valor)}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <label>
        Segundos a sumar (con «−» para restar)
        <input
          value={texto}
          inputMode="text"
          placeholder="45, -30 o 1:30"
          aria-invalid={mal}
          onChange={(event) => setTexto(event.target.value)}
        />
      </label>
      <label>
        Motivo (opcional)
        <input
          value={motivo}
          maxLength={120}
          placeholder="Ej.: falló el mosaico"
          onChange={(event) => setMotivo(event.target.value)}
        />
      </label>

      <div className="admin-player-progress-buttons">
        <button
          type="button"
          className="admin-inline-soft"
          disabled={ocupado || segundos === null}
          onClick={() => {
            if (segundos === null) return
            onAjustar(segundos, motivo.trim())
            setTexto('')
            setMotivo('')
          }}
        >
          {segundos !== null && segundos < 0 ? 'Restar tiempo' : 'Sumar tiempo'}
          {segundos !== null ? ` · ${etiquetaDeSegundos(segundos)}` : ''}
        </button>
      </div>
    </div>
  )
}

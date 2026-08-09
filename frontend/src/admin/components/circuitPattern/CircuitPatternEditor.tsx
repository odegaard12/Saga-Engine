import { useMemo, useState, type CSSProperties } from 'react'
import {
  buildCircuitPath,
  isCircuitPathValid,
  type CellKey,
} from '../../../player/minigames/families/circuitMatrix/circuitPath'

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const CSS = `
.cpe,
.cpe * {
  box-sizing: border-box !important;
}

.cpe {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  display: grid !important;
  gap: 9px !important;
  padding: 11px !important;
  overflow: hidden !important;
  border: 1px solid rgba(255,255,255,.09) !important;
  border-radius: 16px !important;
  background: #151719 !important;
}

.cpe > div:first-child {
  min-width: 0 !important;
}

.cpe h4 {
  margin: 0 !important;
  color: #f4f4f5 !important;
  font-size: 15px !important;
  line-height: 1.1 !important;
}

.cpe p {
  margin: 3px 0 0 !important;
  color: rgba(244,244,245,.58) !important;
  font-size: 11px !important;
  line-height: 1.25 !important;
}

.cpe-modes {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0,1fr)) !important;
  gap: 7px !important;
}

.cpe-mode {
  min-width: 0 !important;
  min-height: 58px !important;
  padding: 8px 9px !important;
  border: 1px solid rgba(255,255,255,.10) !important;
  border-radius: 12px !important;
  background: #23262a !important;
  color: #f4f4f5 !important;
  text-align: left !important;
  cursor: pointer !important;
}

.cpe-mode.active {
  border-color: #68df8a !important;
  background: #203b29 !important;
}

.cpe-mode b,
.cpe-mode small {
  display: block !important;
}

.cpe-mode b {
  font-size: 12px !important;
  line-height: 1.15 !important;
}

.cpe-mode small {
  margin-top: 3px !important;
  color: rgba(244,244,245,.56) !important;
  font-size: 10px !important;
  line-height: 1.2 !important;
}

.cpe-tools {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
}

.cpe-tools button {
  min-height: 32px !important;
  padding: 6px 9px !important;
  border: 1px solid rgba(255,255,255,.10) !important;
  border-radius: 10px !important;
  background: #292d31 !important;
  color: #f4f4f5 !important;
  font-size: 11px !important;
  font-weight: 850 !important;
  cursor: pointer !important;
}

.cpe-tools .primary {
  border-color: transparent !important;
  background: #68df8a !important;
  color: #102416 !important;
}

.cpe-tools button:disabled {
  opacity: .42 !important;
  cursor: default !important;
}

.cpe-board-shell {
  width: min(100%, 330px) !important;
  max-width: 330px !important;
  min-width: 0 !important;
  padding: 6px !important;
  overflow: hidden !important;
  border-radius: 14px !important;
  background: #0f1113 !important;
}

.cpe-board {
  display: grid !important;
  gap: 4px !important;
  width: 100% !important;
  min-width: 0 !important;
}

.cpe-cell {
  display: grid !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  aspect-ratio: 1 !important;
  place-items: center !important;
  padding: 0 !important;
  border: 1px solid rgba(255,255,255,.08) !important;
  border-radius: 8px !important;
  background: #26292d !important;
  color: #f4f4f5 !important;
  font-size: 11px !important;
  font-weight: 900 !important;
  cursor: pointer !important;
}

.cpe-cell.on {
  border-color: #68df8a !important;
  background: #285538 !important;
}

.cpe-cell.last {
  box-shadow: 0 0 0 2px rgba(104,223,138,.27) !important;
}

.cpe-info {
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 3px !important;
  color: rgba(244,244,245,.58) !important;
  font-size: 10px !important;
}

.cpe-info b {
  color: #f4f4f5 !important;
}

.cpe-msg {
  min-height: 14px !important;
  color: #f0b27b !important;
  font-size: 10px !important;
  line-height: 1.2 !important;
}

.cpe-note {
  padding: 10px !important;
  border-radius: 12px !important;
  background: rgba(104,223,138,.08) !important;
  color: rgba(244,244,245,.70) !important;
  font-size: 11px !important;
  line-height: 1.3 !important;
}

/*
 * Patrón fijo en escritorio:
 * controles a la izquierda y tablero completo a la derecha.
 */
@media (min-width: 901px) {
  .cpe:has(.cpe-board-shell) {
    grid-template-columns:
      minmax(245px, .8fr)
      minmax(290px, 1.2fr) !important;

    grid-template-areas:
      "head board"
      "modes board"
      "tools board"
      "info board"
      "message board" !important;

    grid-template-rows:
      auto
      auto
      auto
      auto
      minmax(14px,1fr) !important;

    align-items: start !important;
  }

  .cpe:has(.cpe-board-shell) > div:first-child {
    grid-area: head !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-modes {
    grid-area: modes !important;
    grid-template-columns: 1fr !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-tools {
    grid-area: tools !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-board-shell {
    grid-area: board !important;
    justify-self: center !important;
    align-self: center !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-info {
    grid-area: info !important;
  }

  .cpe:has(.cpe-board-shell) .cpe-msg {
    grid-area: message !important;
  }
}

@media (max-width: 900px) {
  .cpe {
    overflow: visible !important;
  }

  .cpe-modes {
    grid-template-columns: 1fr !important;
  }

  .cpe-board-shell {
    width: min(100%, 360px) !important;
    max-width: 360px !important;
    margin: 0 auto !important;
  }
}
`

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function numberOf(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

function pathOf(value: unknown): CellKey[] {
  if (!Array.isArray(value)) return []

  return value.map(String).filter((item): item is CellKey => /^\d+:\d+$/.test(item))
}

function adjacent(a: CellKey, b: CellKey) {
  const [aRow, aCol] = a.split(':').map(Number)
  const [bRow, bCol] = b.split(':').map(Number)

  return Math.abs(aRow - bRow) + Math.abs(aCol - bCol) === 1
}

function randomSeed() {
  return `admin:${Date.now()}:${Math.random()}`
}

export default function CircuitPatternEditor({ config, onChange }: Props) {
  const [message, setMessage] = useState('')

  const rows = clamp(numberOf(config.grid_rows, 5), 4, 6)
  const cols = clamp(numberOf(config.grid_cols, 5), 4, 6)
  const length = clamp(numberOf(config.path_length, 11), 4, rows * cols)

  const mode = config.pattern_mode === 'fixed' ? 'fixed' : 'random_each_game'

  const path = useMemo(() => pathOf(config.path_cells), [config.path_cells])

  const valid = path.length >= 4 && isCircuitPathValid(path, rows, cols)

  const boardStyle = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  } as CSSProperties

  const generate = () => {
    const next = buildCircuitPath(rows, cols, length, randomSeed())

    onChange({
      game_id: 'logic_circuit',
      completion_method: 'puzzle',
      pattern_mode: 'fixed',
      path_cells: next,
      path_length: next.length,
    })

    setMessage('Patrón generado. Será igual para todos los jugadores.')
  }

  const chooseMode = (next: 'random_each_game' | 'fixed') => {
    if (next === 'random_each_game') {
      onChange({
        game_id: 'logic_circuit',
        completion_method: 'puzzle',
        pattern_mode: next,
        path_cells: [],
      })

      setMessage('Se generará una ruta distinta al pulsar Iniciar.')

      return
    }

    if (valid) {
      onChange({
        game_id: 'logic_circuit',
        completion_method: 'puzzle',
        pattern_mode: 'fixed',
      })

      setMessage('Este patrón fijo será igual para todos.')

      return
    }

    generate()
  }

  const press = (key: CellKey) => {
    if (path.includes(key)) {
      setMessage('Esa celda ya está usada.')
      return
    }

    const last = path[path.length - 1]

    if (last && !adjacent(last, key)) {
      setMessage('La celda debe estar junto a la anterior.')
      return
    }

    const next = [...path, key]

    onChange({
      game_id: 'logic_circuit',
      completion_method: 'puzzle',
      pattern_mode: 'fixed',
      path_cells: next,
      path_length: next.length,
    })

    setMessage(
      next.length >= 4
        ? 'Patrón válido. Guarda el nodo para persistirlo.'
        : 'Añade al menos cuatro celdas.'
    )
  }

  return (
    <section className="cpe">
      <style>{CSS}</style>

      <div>
        <h4>Patrón del circuito</h4>
        <p>Elige si cambia en cada partida o si todos juegan el mismo.</p>
      </div>

      <div className="cpe-modes">
        <button
          type="button"
          className={['cpe-mode', mode === 'random_each_game' ? 'active' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => chooseMode('random_each_game')}
        >
          <b>Aleatorio en cada partida</b>
          <small>Cambia cada vez que el jugador pulsa Iniciar.</small>
        </button>

        <button
          type="button"
          className={['cpe-mode', mode === 'fixed' ? 'active' : ''].filter(Boolean).join(' ')}
          onClick={() => chooseMode('fixed')}
        >
          <b>Patrón fijo</b>
          <small>Lo generas o dibujas aquí y será igual para todos.</small>
        </button>
      </div>

      {mode === 'random_each_game' ? (
        <div className="cpe-note">
          Cada inicio crea una ruta nueva. La ruta no cambia mientras se memoriza o resuelve.
        </div>
      ) : (
        <>
          <div className="cpe-tools">
            <button type="button" className="primary" onClick={generate}>
              Generar otro patrón
            </button>

            <button
              type="button"
              disabled={!path.length}
              onClick={() => {
                const next = path.slice(0, -1)

                onChange({
                  game_id: 'logic_circuit',
                  completion_method: 'puzzle',
                  pattern_mode: 'fixed',
                  path_cells: next,
                  path_length: Math.max(4, next.length),
                })

                setMessage('Última celda eliminada.')
              }}
            >
              Deshacer
            </button>

            <button
              type="button"
              disabled={!path.length}
              onClick={() => {
                onChange({
                  game_id: 'logic_circuit',
                  completion_method: 'puzzle',
                  pattern_mode: 'fixed',
                  path_cells: [],
                  path_length: length,
                })

                setMessage('Tablero limpio. Pulsa una celda para empezar.')
              }}
            >
              Limpiar y dibujar
            </button>
          </div>

          <div className="cpe-board-shell">
            <div className="cpe-board" style={boardStyle}>
              {Array.from({ length: rows * cols }, (_, index) => {
                const row = Math.floor(index / cols)
                const col = index % cols
                const key = `${row}:${col}` as CellKey
                const order = path.indexOf(key)

                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      'cpe-cell',
                      order >= 0 ? 'on' : '',
                      order === path.length - 1 ? 'last' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => press(key)}
                  >
                    {order >= 0 ? order + 1 : ''}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="cpe-info">
            <span>
              Tablero:{' '}
              <b>
                {rows} × {cols}
              </b>
            </span>

            <span>
              Ruta: <b>{path.length}</b>
            </span>

            <span>
              Estado: <b>{valid ? 'válido' : 'incompleto'}</b>
            </span>
          </div>
        </>
      )}

      <div className="cpe-msg">{message}</div>
    </section>
  )
}

import { useMemo, useState } from 'react'

type GuidedStep = 'type' | 'normalGame' | 'qrConfig' | 'config' | 'content' | 'rules' | 'review'
type NodeMode = 'normal' | 'qr_object' | 'qr_key' | 'qr_clue' | 'qr_bonus'
type NormalGame = 'signal_gps' | 'bearing_hunt'

type GuidedNodeEditorFlowProps = {
  stage: any
  onPatch: (patch: Record<string, any>) => void
  onClose: () => void
  onDelete: () => void
}

const qrModes: Array<{
  id: NodeMode
  icon: string
  title: string
  help: string
  itemKind: string
}> = [
  { id: 'qr_object', icon: '⭐', title: 'Objeto QR', help: 'Objeto físico que se recoge', itemKind: 'object' },
  { id: 'qr_key', icon: '🔑', title: 'Llave QR', help: 'Objeto que puede desbloquear otro nodo', itemKind: 'key' },
  { id: 'qr_clue', icon: '🧩', title: 'Pista QR', help: 'Tarjeta física con pista', itemKind: 'clue' },
  { id: 'qr_bonus', icon: '🎁', title: 'Bonus QR', help: 'Extra o recompensa física', itemKind: 'bonus' },
]

const normalGames: Array<{
  id: NormalGame
  icon: string
  title: string
  help: string
  tag: string
}> = [
  {
    id: 'signal_gps',
    icon: '📡',
    title: 'Señal GPS',
    help: 'El jugador llega al radio del nodo y confirma presencia.',
    tag: 'Exterior estable',
  },
  {
    id: 'bearing_hunt',
    icon: '🧭',
    title: 'Rumbo con brújula',
    help: 'El jugador debe orientarse hacia una dirección concreta.',
    tag: 'Orientación',
  },
]

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

function getTitle(stage: any) {
  return String(stage?.title || stage?.name || 'Nodo sin título')
}

function getFallback(stage: any) {
  return String(stage?.fallback_code || stage?.fallbackCode || '')
}

function getRadius(stage: any) {
  const raw = Number(stage?.radius_m ?? stage?.radius ?? 50)
  return Number.isFinite(raw) && raw > 0 ? raw : 50
}

function getNodeMode(stage: any): NodeMode | 'normal' {
  const physicalKind = String(stage?.physical_node_kind || stage?.physical_item_kind || '')
  if (physicalKind === 'key') return 'qr_key'
  if (physicalKind === 'clue') return 'qr_clue'
  if (physicalKind === 'bonus') return 'qr_bonus'
  if (physicalKind === 'object' || stage?.physical_qr || stage?.qr_payload) return 'qr_object'
  return 'normal'
}

function getNormalGame(stage: any): NormalGame {
  const raw = String(stage?.game_template_id || stage?.game_type || stage?.game_family || stage?.game || '')
  if (raw.includes('bearing') || raw.includes('rumbo')) return 'bearing_hunt'
  return 'signal_gps'
}

export default function GuidedNodeEditorFlow({ stage, onPatch, onClose, onDelete }: GuidedNodeEditorFlowProps) {
  const [step, setStep] = useState<GuidedStep>('type')
  const [selectedMode, setSelectedMode] = useState<NodeMode | 'normal'>(() => getNodeMode(stage))
  const [selectedGame, setSelectedGame] = useState<NormalGame>(() => getNormalGame(stage))

  const title = getTitle(stage)
  const itemId = String(stage?.physical_item_id || slugify(title) || 'objeto')
  const itemLabel = String(stage?.physical_item_label || title)
  const fallback = getFallback(stage)

  const messages = useMemo(() => asRecord(stage?.messages), [stage?.messages])

  function patchMessages(patch: Record<string, string>) {
    onPatch({
      messages: {
        ...messages,
        ...patch,
      },
    })
  }

  function generateFallback() {
    const order = Number(stage?.route_order ?? stage?.order ?? stage?.index ?? 0)
    const suffix = Number.isFinite(order) && order > 0 ? String(order).padStart(2, '0') : '01'
    onPatch({ fallback_code: `SAGA-${suffix}` })
  }

  function applyNormalGame(game: NormalGame) {
    setSelectedMode('normal')
    setSelectedGame(game)
    setStep('config')

    if (game === 'signal_gps') {
      onPatch({
        physical_node_kind: '',
        physical_qr: false,
        qr_payload: '',
        physical_item_id: '',
        physical_item_label: '',
        physical_item_kind: '',
        game_template_id: 'signal_gps_easy',
        game_family: 'signal',
        game_type: 'signal_gps',
        radius_m: getRadius(stage) || 50,
        entry_mode: 'gps',
        requires_proximity: true,
        completion_method: 'proximity',
      })
      patchMessages({
        gps_unavailable: messages.gps_unavailable || 'No se pudo obtener la posición GPS. Revisa permisos o usa el código de emergencia.',
        locked: messages.locked || 'Acércate al nodo para desbloquearlo.',
      })
    }

    if (game === 'bearing_hunt') {
      onPatch({
        physical_node_kind: '',
        physical_qr: false,
        qr_payload: '',
        physical_item_id: '',
        physical_item_label: '',
        physical_item_kind: '',
        game_template_id: 'bearing_hunt_easy',
        game_family: 'bearing',
        game_type: 'bearing_hunt',
        radius_m: getRadius(stage) || 50,
        entry_mode: 'bearing',
        requires_proximity: true,
        bearing_target_deg: Number(stage?.bearing_target_deg ?? 90),
        bearing_tolerance_deg: Number(stage?.bearing_tolerance_deg ?? 18),
        completion_method: 'bearing',
      })
      patchMessages({
        gps_unavailable: messages.gps_unavailable || 'No se pudo obtener la posición GPS. Revisa permisos o usa el código de emergencia.',
        locked: messages.locked || 'Acércate al nodo y oriéntate hacia el rumbo indicado.',
      })
    }

    if (!fallback) generateFallback()
  }

  function applyQrMode(mode: NodeMode) {
    const meta = qrModes.find((item) => item.id === mode) || qrModes[0]
    const cleanId = itemId || slugify(title) || 'objeto'
    const payload = `SAGA1:ITEM:${cleanId}:${itemLabel || title}`

    setSelectedMode(mode)
    setStep('qrConfig')

    onPatch({
      physical_node_kind: meta.itemKind,
      physical_qr: true,
      qr_payload: payload,
      physical_item_id: cleanId,
      physical_item_label: itemLabel || title,
      physical_item_kind: meta.itemKind,
      game_template_id: mode,
      game_family: 'physical_qr',
      game_type: mode,
      completion_method: 'qr_scan',
      requires_proximity: false,
    })

    patchMessages({
      locked: messages.locked || 'Escanea el QR físico para guardar este objeto.',
    })

    if (!fallback) generateFallback()
  }

  function clearToType() {
    setStep('type')
  }

  function updateRadius(value: string) {
    const next = Number(value)
    if (Number.isFinite(next)) onPatch({ radius_m: next })
  }

  function currentModeLabel() {
    if (selectedMode === 'normal') {
      const game = normalGames.find((item) => item.id === selectedGame)
      return game ? `${game.icon} ${game.title}` : 'Nodo normal'
    }
    const qr = qrModes.find((item) => item.id === selectedMode)
    return qr ? `${qr.icon} ${qr.title}` : 'QR físico'
  }

  return (
    <section className="saga-guided-node-editor" aria-label="Editor guiado de nodo">
      <header className="saga-guided-hero">
        <div>
          <span>Editor guiado</span>
          <strong>{title}</strong>
          <p>{currentModeLabel()} · configura el nodo sin campos técnicos.</p>
        </div>
        <div className="saga-guided-hero-actions">
          <button type="button" onClick={clearToType}>Cambiar tipo</button>
          <button type="button" className="danger" onClick={onDelete}>Eliminar</button>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
      </header>

      <nav className="saga-guided-steps" aria-label="Pasos del editor">
        {[
          ['type', '1. Tipo'],
          [selectedMode === 'normal' ? 'normalGame' : 'qrConfig', selectedMode === 'normal' ? '2. Juego' : '2. QR físico'],
          ['config', '3. Configuración'],
          ['content', '4. Contenido'],
          ['rules', '5. Reglas'],
          ['review', '6. Revisar'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={step === id ? 'active' : ''}
            onClick={() => setStep(id as GuidedStep)}
          >
            {label}
          </button>
        ))}
      </nav>

      {step === 'type' ? (
        <section className="saga-guided-page">
          <div className="saga-guided-page-head">
            <span>TIPO DE NODO</span>
            <h3>Nodo normal jugable</h3>
            <p>Usa este modo para ruta, GPS, minijuego y reglas normales.</p>
            <b>NORMAL</b>
          </div>

          <div className="saga-guided-type-grid">
            <button type="button" onClick={() => { setSelectedMode('normal'); setStep('normalGame') }}>
              <span>●</span>
              <strong>Normal</strong>
              <small>Ruta, GPS o minijuego</small>
            </button>

            {qrModes.map((mode) => (
              <button key={mode.id} type="button" onClick={() => applyQrMode(mode.id)}>
                <span>{mode.icon}</span>
                <strong>{mode.title}</strong>
                <small>{mode.help}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 'normalGame' ? (
        <section className="saga-guided-page">
          <div className="saga-guided-page-head">
            <span>Juego normal</span>
            <h3>Elige qué tendrá que hacer el jugador</h3>
            <p>Al elegir un juego se aplica una configuración base ya jugable. Luego podrás editarla sin romper nada.</p>
          </div>

          <div className="saga-guided-game-grid">
            {normalGames.map((game) => (
              <button key={game.id} type="button" onClick={() => applyNormalGame(game.id)}>
                <span>{game.icon}</span>
                <strong>{game.title}</strong>
                <small>{game.tag}</small>
                <p>{game.help}</p>
              </button>
            ))}
          </div>

          <div className="saga-guided-inline-actions">
            <button type="button" onClick={() => setStep('type')}>Atrás</button>
          </div>
        </section>
      ) : null}

      {step === 'qrConfig' ? (
        <section className="saga-guided-page">
          <div className="saga-guided-page-head">
            <span>QR físico</span>
            <h3>Configura la tarjeta física</h3>
            <p>El QR se imprime o comparte. Al escanearlo, SAGA guarda el objeto, llave, pista o bonus en la partida.</p>
          </div>

          <div className="saga-guided-form-grid">
            <label>
              Nombre visible
              <input
                value={itemLabel}
                onChange={(event) => onPatch({
                  physical_item_label: event.target.value,
                  qr_payload: `SAGA1:ITEM:${itemId}:${event.target.value}`,
                })}
              />
            </label>

            <label>
              ID interno
              <input
                value={itemId}
                onChange={(event) => onPatch({
                  physical_item_id: slugify(event.target.value),
                  qr_payload: `SAGA1:ITEM:${slugify(event.target.value)}:${itemLabel}`,
                })}
              />
            </label>

            <label className="wide">
              Payload del QR
              <input
                value={String(stage?.qr_payload || `SAGA1:ITEM:${itemId}:${itemLabel}`)}
                onChange={(event) => onPatch({ qr_payload: event.target.value })}
              />
              <small>Va dentro del QR. Normalmente no se escribe a mano.</small>
            </label>
          </div>

          <div className="saga-guided-card-row">
            {qrModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={selectedMode === mode.id ? 'active' : ''}
                onClick={() => applyQrMode(mode.id)}
              >
                {mode.icon} {mode.title}
              </button>
            ))}
          </div>

          <div className="saga-guided-inline-actions">
            <button type="button" onClick={() => setStep('type')}>Atrás</button>
            <button type="button" onClick={() => setStep('content')}>Siguiente</button>
          </div>
        </section>
      ) : null}

      {step === 'config' ? (
        <section className="saga-guided-page">
          <div className="saga-guided-page-head">
            <span>Configuración</span>
            <h3>Radio, proximidad y forma de interacción</h3>
            <p>La posición se cambia arrastrando el nodo en el mapa. Aquí configuras cómo se activa.</p>
          </div>

          <div className="saga-guided-form-grid">
            <label>
              Radio en metros
              <input
                type="number"
                min={5}
                step={5}
                value={getRadius(stage)}
                onChange={(event) => updateRadius(event.target.value)}
              />
            </label>

            <label>
              Interacción
              <select
                value={String(stage?.entry_mode || (selectedGame === 'bearing_hunt' ? 'bearing' : 'gps'))}
                onChange={(event) => onPatch({ entry_mode: event.target.value })}
              >
                <option value="gps">Por radio GPS</option>
                <option value="bearing">Por rumbo/brújula</option>
                <option value="qr">Por escaneo QR</option>
                <option value="manual">Manual / monitor</option>
              </select>
            </label>

            <label className="checkbox wide">
              <input
                type="checkbox"
                checked={Boolean(stage?.requires_proximity ?? true)}
                onChange={(event) => onPatch({ requires_proximity: event.target.checked })}
              />
              Requerir estar cerca del nodo
            </label>
          </div>

          <div className="saga-guided-inline-actions">
            <button type="button" onClick={() => setStep(selectedMode === 'normal' ? 'normalGame' : 'qrConfig')}>Atrás</button>
            <button type="button" onClick={() => setStep('content')}>Siguiente</button>
          </div>
        </section>
      ) : null}

      {step === 'content' ? (
        <section className="saga-guided-page">
          <div className="saga-guided-page-head">
            <span>Contenido</span>
            <h3>Texto que verá el jugador</h3>
            <p>Es la instrucción o pista principal. Déjalo vacío si el propio juego ya lo explica todo.</p>
          </div>

          <div className="saga-guided-form-grid">
            <label>
              Título
              <input
                value={String(stage?.title || '')}
                onChange={(event) => onPatch({ title: event.target.value })}
              />
            </label>

            <label className="wide">
              Texto principal del nodo
              <textarea
                value={String(stage?.description || stage?.body || '')}
                onChange={(event) => onPatch({ description: event.target.value, body: event.target.value })}
                rows={5}
              />
            </label>

            <label className="wide">
              Mensaje si no hay GPS
              <input
                value={String(messages.gps_unavailable || '')}
                onChange={(event) => patchMessages({ gps_unavailable: event.target.value })}
                placeholder="No se pudo obtener la posición GPS. Revisa permisos o usa el código de emergencia."
              />
            </label>

            <label className="wide">
              Mensaje de bloqueo / éxito
              <input
                value={String(messages.locked || '')}
                onChange={(event) => patchMessages({ locked: event.target.value })}
                placeholder="Acércate al nodo para desbloquearlo."
              />
            </label>
          </div>

          <div className="saga-guided-inline-actions">
            <button type="button" onClick={() => setStep(selectedMode === 'normal' ? 'config' : 'qrConfig')}>Atrás</button>
            <button type="button" onClick={() => setStep('rules')}>Siguiente</button>
          </div>
        </section>
      ) : null}

      {step === 'rules' ? (
        <section className="saga-guided-page">
          <div className="saga-guided-page-head">
            <span>Reglas</span>
            <h3>Requisito, recompensa y emergencia</h3>
            <p>El orden de ruta ya se respeta. Usa requisitos solo para llaves, objetos o desbloqueos especiales.</p>
          </div>

          <div className="saga-guided-form-grid">
            <label>
              Código fallback
              <input
                value={fallback}
                onChange={(event) => onPatch({ fallback_code: event.target.value })}
                placeholder="SAGA-06"
              />
            </label>

            <div className="saga-guided-button-card">
              <b>Generar fallback</b>
              <p>Úsalo como salida de emergencia si falla GPS, cámara, brújula o cobertura.</p>
              <button type="button" onClick={generateFallback}>Generar</button>
            </div>

            <label>
              Método de completado
              <select
                value={String(stage?.completion_method || (selectedMode === 'normal' ? 'proximity' : 'qr_scan'))}
                onChange={(event) => onPatch({ completion_method: event.target.value })}
              >
                <option value="proximity">Llegar al sitio</option>
                <option value="bearing">Orientarse al rumbo</option>
                <option value="qr_scan">Escanear QR</option>
                <option value="manual">Manual / monitor</option>
              </select>
            </label>

            <label>
              Recompensa / objeto
              <input
                value={String(stage?.reward_item_id || '')}
                onChange={(event) => onPatch({ reward_item_id: event.target.value })}
                placeholder="llave_torre"
              />
            </label>
          </div>

          <div className="saga-guided-inline-actions">
            <button type="button" onClick={() => setStep('content')}>Atrás</button>
            <button type="button" onClick={() => setStep('review')}>Siguiente</button>
          </div>
        </section>
      ) : null}

      {step === 'review' ? (
        <section className="saga-guided-page">
          <div className="saga-guided-page-head">
            <span>Revisar</span>
            <h3>Configuración preparada</h3>
            <p>El nodo ya queda configurado en la vista local. Pulsa Guardar en Control de misión para persistirlo.</p>
          </div>

          <div className="saga-guided-review">
            <article>
              <b>Tipo</b>
              <p>{currentModeLabel()}</p>
            </article>
            <article>
              <b>Activación</b>
              <p>{selectedMode === 'normal' ? `${getRadius(stage)} m · ${stage?.requires_proximity === false ? 'sin proximidad obligatoria' : 'requiere proximidad'}` : 'Escaneo QR físico'}</p>
            </article>
            <article>
              <b>Fallback</b>
              <p>{fallback || 'Pendiente de generar'}</p>
            </article>
            <article>
              <b>Jugador verá</b>
              <p>{String(stage?.description || stage?.body || messages.locked || 'Sin texto principal todavía')}</p>
            </article>
          </div>

          <div className="saga-guided-inline-actions">
            <button type="button" onClick={() => setStep('rules')}>Atrás</button>
            <button type="button" onClick={onClose}>Cerrar editor</button>
          </div>
        </section>
      ) : null}
    </section>
  )
}

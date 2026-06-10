import { useMemo, useState } from 'react'
import PhysicalQrCardsPanel, {
  type PhysicalQrKind,
  type SavedPhysicalQrCard,
} from './PhysicalQrCardsPanel'

type StageLike = Record<string, any>

type GuidedNodeEditorFlowProps = {
  stage: StageLike
  onPatch: (patch: Record<string, any>) => void
  onClose: () => void
  onDelete: () => void
}

type StepKey = 'type' | 'subtype' | 'config' | 'content' | 'rules' | 'review'

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'type', label: 'Tipo' },
  { key: 'subtype', label: 'Modo' },
  { key: 'config', label: 'Configurar' },
  { key: 'content', label: 'Contenido' },
  { key: 'rules', label: 'Reglas' },
  { key: 'review', label: 'Revisar' },
]

const gameOptions = [
  {
    id: 'signal_gps',
    icon: '🗺️',
    title: 'Señal GPS',
    desc: 'O xogador debe achegarse a unha zona do mapa.',
    patch: {
      physical_node_kind: '',
      physical_item_kind: '',
      physical_qr: null,
      qr_payload: '',
      game_family: 'signal',
      game_type: 'signal_gps',
      game_template_id: 'signal_gps_easy',
      entry_mode: 'gps',
      completion_method: 'proximity',
      requires_proximity: true,
      radius_m: 50,
      proximity_radius_m: 50,
    },
  },
  {
    id: 'bearing_hunt',
    icon: '🧭',
    title: 'Rumbo',
    desc: 'O xogador segue unha dirección, pista ou orientación.',
    patch: {
      physical_node_kind: '',
      physical_item_kind: '',
      physical_qr: null,
      qr_payload: '',
      game_family: 'bearing',
      game_type: 'bearing_hunt',
      game_template_id: 'bearing_hunt_easy',
      entry_mode: 'bearing',
      completion_method: 'bearing',
      requires_proximity: true,
      radius_m: 50,
      proximity_radius_m: 50,
      bearing_target_deg: 90,
      bearing_tolerance_deg: 18,
    },
  },
]

const qrOptions: Array<{
  id: PhysicalQrKind
  icon: string
  title: string
  desc: string
  kind: PhysicalQrKind
  template: string
}> = [
  {
    id: 'collectible',
    icon: '⭐',
    title: 'Objeto QR',
    desc: 'Objeto físico que o xogador pode atopar e gardar.',
    kind: 'collectible',
    template: 'physical_object_qr',
  },
  {
    id: 'requirement',
    icon: '🔑',
    title: 'Llave QR',
    desc: 'Chave física para desbloquear outro nodo ou zona.',
    kind: 'requirement',
    template: 'physical_key_qr',
  },
  {
    id: 'clue',
    icon: '🧩',
    title: 'Pista QR',
    desc: 'Pista física que revela información da historia.',
    kind: 'clue',
    template: 'physical_clue_qr',
  },
  {
    id: 'bonus',
    icon: '🎁',
    title: 'Bonus QR',
    desc: 'Extra opcional, recompensa ou misión secundaria.',
    kind: 'bonus',
    template: 'physical_bonus_qr',
  },
]

function titleOf(stage: StageLike) {
  return String(stage.title || stage.name || 'NEW NODE')
}

function nodeNumber(stage: StageLike) {
  if (typeof stage.index === 'number') return String(stage.index + 1)
  const raw = String(stage.title || stage.name || stage.id || stage.node_id || '')
  return raw.match(/\d+/)?.[0] || ''
}

function displayTitle(stage: StageLike) {
  const n = nodeNumber(stage)
  const title = titleOf(stage)
  if (n && !title.trim().startsWith(`${n}.`)) return `${n}. ${title}`
  return title
}

function normalizeQrKind(value: unknown): PhysicalQrKind {
  const raw = String(value || 'collectible')
  if (raw === 'object') return 'collectible'
  if (raw === 'key') return 'requirement'
  if (raw === 'requirement' || raw === 'clue' || raw === 'bonus' || raw === 'collectible') return raw
  return 'collectible'
}

function isQr(stage: StageLike) {
  return Boolean(
    stage.physical_qr ||
    stage.physical_node_kind ||
    stage.physical_item_kind ||
    String(stage.game_family || '').includes('physical') ||
    String(stage.game_type || '').includes('physical')
  )
}

function selectedGame(stage: StageLike) {
  return gameOptions.find((item) => item.id === stage.game_type || item.id === stage.game_family) || gameOptions[0]
}

function selectedQr(stage: StageLike) {
  const kind = normalizeQrKind(stage.physical_node_kind || stage.physical_item_kind)
  return qrOptions.find((item) => item.kind === kind) || qrOptions[0]
}

function slugOf(value: unknown) {
  return String(value || 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'objeto_saga'
}

function fallbackCode(stage: StageLike) {
  const config = stage.config && typeof stage.config === 'object' ? stage.config : {}
  const raw = String(stage.fallback_code || stage.physical_fallback_code || config.success_code || config.fallback_code || '')
  if (raw) return raw.toUpperCase()
  const n = nodeNumber(stage) || '00'
  return `SAGA-${n.padStart(2, '0')}`
}

function qrLabel(stage: StageLike) {
  return String(stage.physical_item_label || stage.title || 'Objeto SAGA')
}

function qrItemId(stage: StageLike) {
  return String(stage.physical_item_id || slugOf(stage.id || stage.node_id || qrLabel(stage)))
}

export default function GuidedNodeEditorFlow({ stage, onPatch, onClose, onDelete }: GuidedNodeEditorFlowProps) {
  const [stepIndex, setStepIndex] = useState(0)

  const mode = isQr(stage) ? 'qr' : 'game'
  const step = STEPS[stepIndex]?.key || 'type'
  const game = selectedGame(stage)
  const qr = selectedQr(stage)
  const title = displayTitle(stage)
  const progress = useMemo(() => Math.round(((stepIndex + 1) / STEPS.length) * 100), [stepIndex])

  const goNext = () => setStepIndex((value) => Math.min(value + 1, STEPS.length - 1))
  const goBack = () => setStepIndex((value) => Math.max(value - 1, 0))
  const goTo = (key: StepKey) => setStepIndex(Math.max(0, STEPS.findIndex((item) => item.key === key)))

  function chooseGameBase() {
    onPatch({
      physical_node_kind: '',
      physical_item_kind: '',
      physical_qr: null,
      qr_payload: '',
      game_family: 'signal',
      game_type: 'signal_gps',
      game_template_id: 'signal_gps_easy',
      entry_mode: 'gps',
      completion_method: 'proximity',
      requires_proximity: true,
      radius_m: Number(stage.radius_m || stage.proximity_radius_m || 50),
      proximity_radius_m: Number(stage.proximity_radius_m || stage.radius_m || 50),
    })
    goTo('subtype')
  }

  function buildQrPatch(kind: PhysicalQrKind, template: string, card?: SavedPhysicalQrCard) {
    const label = card?.label || qrLabel(stage)
    const itemId = card?.item_id || qrItemId(stage)
    const payload = card?.payload || stage.qr_payload || `SAGA1:ITEM:${itemId}:${label}`
    const nextCard: SavedPhysicalQrCard = card || {
      item_id: itemId,
      label,
      kind,
      payload,
      card_text: `${label}\nQR SAGA\nEscanea esta tarjeta en SAGA.`,
      updated_at: new Date().toISOString(),
    }

    const config = stage.config && typeof stage.config === 'object' ? stage.config : {}

    return {
      physical_qr: nextCard,
      physical_node_kind: kind,
      physical_item_kind: kind,
      physical_item_id: itemId,
      physical_item_label: label,
      game_family: 'physical_qr',
      game_type: template,
      game_template_id: template,
      entry_mode: 'qr',
      completion_method: 'qr_scan',
      requires_proximity: false,
      qr_payload: payload,
      fallback_code: fallbackCode(stage),
      physical_fallback_code: fallbackCode(stage),
      config: {
        ...config,
        success_code: fallbackCode(stage),
      },
    }
  }

  function chooseQrBase(kind: PhysicalQrKind = 'collectible', template = 'physical_object_qr') {
    onPatch(buildQrPatch(kind, template))
    goTo('subtype')
  }

  function applyGame(option: typeof gameOptions[number]) {
    onPatch(option.patch)
    goTo('config')
  }

  function applyQr(option: typeof qrOptions[number]) {
    onPatch(buildQrPatch(option.kind, option.template))
    goTo('config')
  }

  function saveQrCard(card: SavedPhysicalQrCard) {
    const option = qrOptions.find((item) => item.kind === card.kind) || qr
    onPatch(buildQrPatch(card.kind, option.template, card))
  }

  function patchNumber(key: string, value: string) {
    const next = Number(value)
    onPatch({ [key]: Number.isFinite(next) ? next : 0 })
  }

  return (
    <section className="saga-guided-editor-v3" aria-label="Editor guiado de nodo">
      <header className="saga-guided-v3-header">
        <div className="saga-guided-v3-titleblock">
          <span>EDITOR DE NODO</span>
          <h2>{title}</h2>

          <div className="saga-guided-v3-chips">
            <b>{mode === 'qr' ? `${qr.icon} ${qr.title}` : `📡 ${game.title}`}</b>
            {stage.lat != null && stage.lon != null ? (
              <b>{Number(stage.lat).toFixed(5)}, {Number(stage.lon).toFixed(5)}</b>
            ) : null}
            {mode === 'game' ? <b>{Number(stage.radius_m || stage.proximity_radius_m || 50)} m</b> : null}
          </div>
        </div>

        <div className="saga-guided-v3-actions">
          <button type="button" className="primary-soft" onClick={() => goTo('type')}>Cambiar tipo</button>
          <button type="button" className="danger" onClick={onDelete}>Eliminar</button>
          <button type="button" onClick={onClose}>Cerrar ×</button>
        </div>
      </header>

      <nav className="saga-guided-v3-stepper" aria-label="Pasos del editor guiado">
        {STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={index === stepIndex ? 'active' : ''}
            onClick={() => setStepIndex(index)}
          >
            <span>{index + 1}</span>
            <b>{item.label}</b>
          </button>
        ))}
      </nav>

      <div className="saga-guided-v3-progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>

      <main className="saga-guided-v3-body">
        {step === 'type' ? (
          <section className="saga-guided-v3-page saga-guided-v3-page--choices">
            <div className="saga-guided-v3-pagehead">
              <span>Paso 1</span>
              <h3>Que tipo de nodo queres crear?</h3>
              <p>Primeiro escolle se é un xogo no mapa ou un QR físico.</p>
            </div>

            <div className="saga-guided-v3-choice-grid saga-guided-v3-choice-grid--two">
              <button type="button" className={mode === 'game' ? 'active' : ''} onClick={chooseGameBase}>
                <i>🗺️</i>
                <strong>Nodo de xogo</strong>
                <small>Señal GPS, rumbo, minixogos e probas no mapa.</small>
              </button>

              <button type="button" className={mode === 'qr' ? 'active' : ''} onClick={() => chooseQrBase()}>
                <i>▣</i>
                <strong>QR físico</strong>
                <small>Objeto, chave, pista ou bonus escaneable.</small>
              </button>
            </div>
          </section>
        ) : null}

        {step === 'subtype' && mode === 'game' ? (
          <section className="saga-guided-v3-page saga-guided-v3-page--choices">
            <div className="saga-guided-v3-pagehead">
              <span>Paso 2</span>
              <h3>Escolle o xogo</h3>
              <p>Este será o modo principal que verá o xogador.</p>
            </div>

            <div className="saga-guided-v3-choice-grid">
              {gameOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={game.id === option.id ? 'active' : ''}
                  onClick={() => applyGame(option)}
                >
                  <i>{option.icon}</i>
                  <strong>{option.title}</strong>
                  <small>{option.desc}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 'subtype' && mode === 'qr' ? (
          <section className="saga-guided-v3-page saga-guided-v3-page--choices">
            <div className="saga-guided-v3-pagehead">
              <span>Paso 2</span>
              <h3>Escolle o tipo de QR</h3>
              <p>Define que representa o QR físico dentro da misión.</p>
            </div>

            <div className="saga-guided-v3-choice-grid">
              {qrOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={qr.kind === option.kind ? 'active' : ''}
                  onClick={() => applyQr(option)}
                >
                  <i>{option.icon}</i>
                  <strong>{option.title}</strong>
                  <small>{option.desc}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 'config' ? (
          <section className="saga-guided-v3-page">
            <div className="saga-guided-v3-pagehead">
              <span>Paso 3</span>
              <h3>{mode === 'qr' ? 'Configurar QR físico' : 'Configurar xogo'}</h3>
              <p>{mode === 'qr' ? 'Datos principais do obxecto escaneable.' : 'Radio, proximidade e activación do nodo.'}</p>
            </div>

            {mode === 'game' ? (
              <div className="saga-guided-v3-formgrid">
                <label>
                  <span>Radio en metros</span>
                  <input
                    type="number"
                    value={Number(stage.radius_m || stage.proximity_radius_m || 50)}
                    onChange={(event) => {
                      patchNumber('radius_m', event.target.value)
                      patchNumber('proximity_radius_m', event.target.value)
                    }}
                  />
                </label>

                <label>
                  <span>Interacción</span>
                  <select
                    value={String(stage.entry_mode || 'gps')}
                    onChange={(event) => onPatch({ entry_mode: event.target.value })}
                  >
                    <option value="gps">Por radio GPS</option>
                    <option value="bearing">Por rumbo</option>
                    <option value="manual">Manual / historia</option>
                  </select>
                </label>

                <label className="checkbox wide">
                  <input
                    type="checkbox"
                    checked={Boolean(stage.requires_proximity ?? true)}
                    onChange={(event) => onPatch({ requires_proximity: event.target.checked })}
                  />
                  <span>Requirir estar cerca do nodo</span>
                </label>

                <article className="saga-guided-v3-note">
                  A posición cámbiase arrastrando o nodo no mapa. Aquí configuras como se activa.
                </article>
              </div>
            ) : (
              <div className="saga-guided-v3-formgrid">
                <label>
                  <span>Nome visible</span>
                  <input
                    value={qrLabel(stage)}
                    onChange={(event) => onPatch({ physical_item_label: event.target.value, title: event.target.value })}
                  />
                </label>

                <label>
                  <span>Código fallback</span>
                  <input
                    value={fallbackCode(stage)}
                    onChange={(event) => {
                      const config = stage.config && typeof stage.config === 'object' ? stage.config : {}
                      onPatch({
                        fallback_code: event.target.value,
                        physical_fallback_code: event.target.value,
                        config: { ...config, success_code: event.target.value },
                      })
                    }}
                  />
                </label>

                <label className="wide">
                  <span>Payload QR</span>
                  <input
                    value={String(stage.qr_payload || '')}
                    onChange={(event) => onPatch({ qr_payload: event.target.value })}
                  />
                </label>

                <article className="saga-guided-v3-note">
                  O fallback serve para completar o QR se falla a cámara, o escaneo ou a cobertura.
                </article>
              </div>
            )}
          </section>
        ) : null}

        {step === 'content' ? (
          <section className="saga-guided-v3-page">
            <div className="saga-guided-v3-pagehead">
              <span>Paso 4</span>
              <h3>{mode === 'qr' ? 'Tarxeta QR e contido' : 'Texto e historia'}</h3>
              <p>{mode === 'qr' ? 'Xera, revisa e descarga o QR imprimible.' : 'O que verá o xogador ao abrir, resolver ou completar o nodo.'}</p>
            </div>

            {mode === 'qr' ? (
              <PhysicalQrCardsPanel
                initialLabel={qrLabel(stage)}
                initialKind={qr.kind}
                compact
                onSaveToNode={saveQrCard}
              />
            ) : (
              <div className="saga-guided-v3-formgrid">
                <label>
                  <span>Título</span>
                  <input value={String(stage.title || '')} onChange={(event) => onPatch({ title: event.target.value })} />
                </label>

                <label className="wide">
                  <span>Texto principal do nodo</span>
                  <textarea
                    value={String(stage.description || stage.body || stage.content || '')}
                    onChange={(event) => onPatch({ description: event.target.value, body: event.target.value, content: event.target.value })}
                    placeholder="Escribe a pista, instrución ou parte da historia..."
                  />
                </label>

                <label className="wide">
                  <span>Mensaxe ao completar</span>
                  <textarea
                    value={String(stage.success_message || '')}
                    onChange={(event) => onPatch({ success_message: event.target.value })}
                    placeholder="Exemplo: Ben feito. Desbloqueaches a seguinte pista."
                  />
                </label>
              </div>
            )}
          </section>
        ) : null}

        {step === 'rules' ? (
          <section className="saga-guided-v3-page">
            <div className="saga-guided-v3-pagehead">
              <span>Paso 5</span>
              <h3>Regras e desbloqueos</h3>
              <p>Define se o nodo require algún obxecto ou condición previa.</p>
            </div>

            <div className="saga-guided-v3-formgrid">
              <label>
                <span>Requisito</span>
                <select
                  value={String(stage.required_item_id || '') ? 'item' : 'none'}
                  onChange={(event) => {
                    if (event.target.value === 'none') onPatch({ required_item_id: '', requires_item: false })
                    else onPatch({ requires_item: true })
                  }}
                >
                  <option value="none">Sen requisito</option>
                  <option value="item">Require obxecto/chave</option>
                </select>
              </label>

              <label>
                <span>ID do obxecto requerido</span>
                <input
                  value={String(stage.required_item_id || '')}
                  onChange={(event) => onPatch({ required_item_id: event.target.value, requires_item: Boolean(event.target.value) })}
                  placeholder="Exemplo: chave-facho"
                />
              </label>

              <label className="checkbox wide">
                <input
                  type="checkbox"
                  checked={Boolean(stage.consume_required_item)}
                  onChange={(event) => onPatch({ consume_required_item: event.target.checked })}
                />
                <span>Consumir obxecto ao completar</span>
              </label>
            </div>
          </section>
        ) : null}

        {step === 'review' ? (
          <section className="saga-guided-v3-page">
            <div className="saga-guided-v3-pagehead">
              <span>Paso 6</span>
              <h3>Revisar nodo</h3>
              <p>Resumo antes de pechar. Lembra gardar a misión no control principal.</p>
            </div>

            <div className="saga-guided-v3-review">
              <article><b>Tipo</b><span>{mode === 'qr' ? 'QR físico' : 'Nodo de xogo'}</span></article>
              <article><b>Modo</b><span>{mode === 'qr' ? qr.title : game.title}</span></article>
              <article><b>Activación</b><span>{String(stage.entry_mode || (mode === 'qr' ? 'qr' : 'gps'))}</span></article>
              <article><b>Radio</b><span>{mode === 'qr' ? 'Non aplica' : `${Number(stage.radius_m || stage.proximity_radius_m || 50)} m`}</span></article>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="saga-guided-v3-footer">
        <button type="button" onClick={goBack} disabled={stepIndex === 0}>Atrás</button>
        <button type="button" className="secondary" onClick={() => goTo('type')}>Cambiar tipo</button>
        {stepIndex < STEPS.length - 1 ? (
          <button type="button" className="primary" onClick={goNext}>Siguiente</button>
        ) : (
          <button type="button" className="primary" onClick={onClose}>Listo</button>
        )}
      </footer>
    </section>
  )
}

import { useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  adminGameCatalog,
  getAdminGame,
  getDefaultAdminStagePatchForGame,
  type AdminGameCatalogItem,
  type AdminGameId,
} from '../lib/gameCatalog'
import type { SavedPhysicalQrCard, PhysicalQrKind } from './PhysicalQrCardsPanel'

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
  { key: 'config', label: 'Ajustes' },
  { key: 'content', label: 'Textos' },
  { key: 'rules', label: 'Reglas' },
  { key: 'review', label: 'Revisar' },
]

const READY_STATUSES = new Set(['runtime_ready', 'runtime_partial', 'preset_only'])

const QR_KIND_BY_GAME_ID: Partial<Record<AdminGameId, PhysicalQrKind>> = {
  qr_collectible: 'collectible',
  qr_key_gate: 'requirement',
  clue_card: 'clue',
  bonus_cache: 'bonus',
}

const QR_GAME_BY_KIND: Record<PhysicalQrKind, AdminGameId> = {
  collectible: 'qr_collectible',
  requirement: 'qr_key_gate',
  clue: 'clue_card',
  bonus: 'bonus_cache',
}

const CONFIG_FIELD_META: Record<string, {
  label: string
  help: string
  type: 'text' | 'number' | 'select' | 'sequence'
  options?: Array<{ value: string; label: string }>
}> = {
  objective: {
    label: 'Objetivo interno',
    help: 'Define que intenta resolver el juego. Normalmente viene de la plantilla.',
    type: 'text',
  },
  completion_method: {
    label: 'Cómo se completa',
    help: 'Forma principal de cerrar el nodo en el móvil del jugador.',
    type: 'select',
    options: [
      { value: 'proximity', label: 'Llegar a la zona' },
      { value: 'hold', label: 'Mantenerse en la zona' },
      { value: 'bearing', label: 'Rumbo / brújula' },
      { value: 'puzzle', label: 'Puzzle visual' },
      { value: 'manual_code', label: 'Código manual' },
      { value: 'sequence', label: 'Secuencia' },
      { value: 'qr_complete', label: 'QR completa el nodo' },
      { value: 'photo', label: 'Foto' },
      { value: 'inventory_only', label: 'Objeto/mochila' },
      { value: 'team', label: 'Equipo' },
    ],
  },
  source_radius_m: {
    label: 'Radio de señal',
    help: 'Zona aproximada donde la señal empieza a funcionar.',
    type: 'number',
  },
  lock_threshold: {
    label: 'Umbral de bloqueo',
    help: 'Valor de señal o precisión necesario para dar el nodo por válido.',
    type: 'number',
  },
  hold_ms: {
    label: 'Tiempo de espera',
    help: 'Milisegundos que debe mantenerse la condición antes de completar.',
    type: 'number',
  },
  target_bearing_deg: {
    label: 'Rumbo objetivo',
    help: 'Dirección en grados: 0 norte, 90 este, 180 sur, 270 oeste.',
    type: 'number',
  },
  tolerance_deg: {
    label: 'Tolerancia de rumbo',
    help: 'Margen permitido alrededor del rumbo objetivo.',
    type: 'number',
  },
  grid_cols: {
    label: 'Columnas',
    help: 'Tamaño horizontal del puzzle lógico.',
    type: 'number',
  },
  grid_rows: {
    label: 'Filas',
    help: 'Tamaño vertical del puzzle lógico.',
    type: 'number',
  },
  difficulty: {
    label: 'Dificultad',
    help: 'Nivel interno de dificultad del reto.',
    type: 'number',
  },
  expected_code: {
    label: 'Código esperado',
    help: 'Palabra o código que deberá introducir el jugador.',
    type: 'text',
  },
  sequence: {
    label: 'Secuencia',
    help: 'Lista de valores separados por coma.',
    type: 'sequence',
  },
  game_id: {
    label: 'ID de juego',
    help: 'Identificador del catálogo. No suele hacer falta tocarlo.',
    type: 'text',
  },
  game_title: {
    label: 'Nombre de juego',
    help: 'Nombre de referencia de la plantilla.',
    type: 'text',
  },
}

const CONFIG_ORDER = [
  'objective',
  'completion_method',
  'source_radius_m',
  'lock_threshold',
  'hold_ms',
  'target_bearing_deg',
  'tolerance_deg',
  'grid_cols',
  'grid_rows',
  'difficulty',
  'expected_code',
  'sequence',
  'game_id',
  'game_title',
]

function configOf(stage: StageLike): Record<string, unknown> {
  return stage.config && typeof stage.config === 'object' ? stage.config : {}
}

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

function gameFromStage(stage: StageLike): AdminGameCatalogItem {
  const config = configOf(stage)
  const configured = typeof config.game_id === 'string' ? getAdminGame(config.game_id) : null
  if (configured) return configured
  if (typeof stage.game_type === 'string') {
    const byGameType = adminGameCatalog.find((game) => game.id === stage.game_type)
    if (byGameType) return byGameType
  }
  if (typeof stage.game_template_id === 'string') {
    const byTemplate = adminGameCatalog.find((game) => game.id === stage.game_template_id)
    if (byTemplate) return byTemplate
  }
  return adminGameCatalog.find((game) => game.family === stage.type) || adminGameCatalog[0]
}

function isQrStage(stage: StageLike): boolean {
  const game = gameFromStage(stage)
  return Boolean(
    game.category === 'physical' ||
    stage.physical_qr ||
    stage.physical_node_kind ||
    stage.physical_item_kind ||
    String(stage.game_family || '').includes('physical') ||
    String(stage.game_type || '').includes('qr_')
  )
}

function gameOptions(): AdminGameCatalogItem[] {
  return adminGameCatalog.filter((game) => game.category !== 'physical')
}

function qrOptions(): AdminGameCatalogItem[] {
  return adminGameCatalog.filter((game) => game.category === 'physical')
}

function statusLabel(game: AdminGameCatalogItem) {
  if (game.runtimeStatus === 'runtime_ready') return 'Jugable'
  if (game.runtimeStatus === 'runtime_partial') return 'Parcial'
  if (game.runtimeStatus === 'preset_only') return 'Plantilla'
  return 'Planificado'
}

function offlineLabel(game: AdminGameCatalogItem) {
  if (game.offlineStatus === 'offline_ready') return 'Offline listo'
  if (game.offlineStatus === 'offline_partial') return 'Offline parcial'
  return 'Offline pendiente'
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
  const config = configOf(stage)
  const raw = String(stage.fallback_code || stage.physical_fallback_code || config.success_code || config.fallback_code || '')
  if (raw) return raw.toUpperCase()
  const n = nodeNumber(stage) || '00'
  return `SAGA-${n.padStart(2, '0')}`
}

function qrKindForGame(game: AdminGameCatalogItem): PhysicalQrKind {
  return QR_KIND_BY_GAME_ID[game.id] || normalizeQrKind('collectible')
}

function qrGameForKind(kind: PhysicalQrKind): AdminGameCatalogItem {
  return getAdminGame(QR_GAME_BY_KIND[kind])
}

function qrLabel(stage: StageLike) {
  return String(stage.physical_item_label || stage.title || 'Objeto SAGA')
}

function qrItemId(stage: StageLike) {
  return String(stage.physical_item_id || slugOf(stage.id || stage.node_id || qrLabel(stage)))
}

function qrPayload(stage: StageLike) {
  return String(stage.qr_payload || `SAGA1:ITEM:${qrItemId(stage)}:${qrLabel(stage)}`)
}

function formatConfigValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null) return ''
  return String(value)
}

function parseConfigValue(key: string, value: string): unknown {
  const meta = CONFIG_FIELD_META[key]
  if (meta?.type === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (meta?.type === 'sequence') {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return value
}

function copyText(value: string, onDone: (message: string) => void) {
  void navigator.clipboard.writeText(value)
    .then(() => onDone('Copiado'))
    .catch(() => onDone('No se pudo copiar'))
}

function downloadTextFile(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function GuidedNodeEditorFlow({ stage, onPatch, onClose, onDelete }: GuidedNodeEditorFlowProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const qrWrapRef = useRef<HTMLDivElement | null>(null)

  const mode = isQrStage(stage) ? 'qr' : 'game'
  const selected = gameFromStage(stage)
  const selectedQr = mode === 'qr' ? selected : qrGameForKind(normalizeQrKind(stage.physical_node_kind || stage.physical_item_kind))
  const selectedGame = mode === 'game' ? selected : gameOptions()[0]
  const step = STEPS[stepIndex]?.key || 'type'
  const title = displayTitle(stage)
  const config = configOf(stage)
  const progress = useMemo(() => Math.round(((stepIndex + 1) / STEPS.length) * 100), [stepIndex])

  const goNext = () => setStepIndex((value) => Math.min(value + 1, STEPS.length - 1))
  const goBack = () => setStepIndex((value) => Math.max(value - 1, 0))
  const goTo = (key: StepKey) => setStepIndex(Math.max(0, STEPS.findIndex((item) => item.key === key)))

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 1800)
  }

  function patchConfig(key: string, value: string) {
    const nextConfig = {
      ...config,
      [key]: parseConfigValue(key, value),
    }
    onPatch({
      config: nextConfig,
      objective: key === 'objective' ? value : stage.objective,
    })
  }

  function applyGame(game: AdminGameCatalogItem) {
    const base = getDefaultAdminStagePatchForGame(game.id)
    const nextConfig = {
      ...(base.config || {}),
      game_id: game.id,
      game_title: game.title,
      completion_method: game.completionMethod,
    }

    onPatch({
      ...base,
      physical_qr: null,
      physical_node_kind: '',
      physical_item_kind: '',
      physical_item_id: '',
      physical_item_label: '',
      qr_payload: '',
      game_family: game.family,
      game_type: game.id,
      game_template_id: game.id,
      completion_method: game.completionMethod,
      entry_mode:
        game.completionMethod === 'bearing'
          ? 'bearing'
          : game.completionMethod === 'manual_code'
            ? 'manual'
            : 'gps',
      requires_proximity: game.category !== 'logic',
      radius_m: Number(stage.radius_m || stage.proximity_radius_m || stage.radius || 50),
      proximity_radius_m: Number(stage.proximity_radius_m || stage.radius_m || stage.radius || 50),
      config: nextConfig,
      messages: game.messages,
      content: game.content,
      description: game.content,
    })
    goTo('config')
  }

  function buildQrPatch(game: AdminGameCatalogItem, card?: SavedPhysicalQrCard) {
    const kind = card?.kind || qrKindForGame(game)
    const label = card?.label || qrLabel(stage)
    const itemId = card?.item_id || qrItemId(stage)
    const payload = card?.payload || qrPayload(stage)
    const nextCard: SavedPhysicalQrCard = card || {
      item_id: itemId,
      label,
      kind,
      payload,
      card_text: `${game.icon} ${label}\n${game.title}\nEscanea esta tarjeta en SAGA.`,
      updated_at: new Date().toISOString(),
    }

    const base = getDefaultAdminStagePatchForGame(game.id)
    const nextConfig = {
      ...(base.config || {}),
      game_id: game.id,
      game_title: game.title,
      completion_method: game.completionMethod,
      success_code: fallbackCode(stage),
    }

    return {
      ...base,
      physical_qr: nextCard,
      physical_node_kind: kind,
      physical_item_kind: kind,
      physical_item_id: itemId,
      physical_item_label: label,
      game_family: 'physical_qr',
      game_type: game.id,
      game_template_id: game.id,
      entry_mode: 'qr',
      completion_method: game.completionMethod,
      requires_proximity: false,
      qr_payload: payload,
      fallback_code: fallbackCode(stage),
      physical_fallback_code: fallbackCode(stage),
      config: nextConfig,
      messages: game.messages,
      content: game.content,
      description: game.content,
    }
  }

  function applyQr(game: AdminGameCatalogItem) {
    onPatch(buildQrPatch(game))
    goTo('config')
  }

  function saveQrCard() {
    const kind = qrKindForGame(selectedQr)
    const label = qrLabel(stage)
    const itemId = qrItemId(stage)
    const payload = qrPayload(stage)
    const card: SavedPhysicalQrCard = {
      item_id: itemId,
      label,
      kind,
      payload,
      card_text: `${selectedQr.icon} ${label}\n${selectedQr.title}\nEscanea esta tarjeta en SAGA.`,
      updated_at: new Date().toISOString(),
    }
    onPatch(buildQrPatch(selectedQr, card))
    showNotice('QR aplicado al nodo. Pulsa Guardar para persistir.')
  }

  function downloadQrSvg() {
    const svg = qrWrapRef.current?.querySelector('svg')
    if (!svg) {
      showNotice('No se encontró el QR para descargar')
      return
    }
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`
    downloadTextFile(`saga-qr-${qrItemId(stage)}.svg`, source, 'image/svg+xml')
    showNotice('QR descargado')
  }

  function patchNumber(key: string, value: string) {
    const next = Number(value)
    onPatch({ [key]: Number.isFinite(next) ? next : 0 })
  }

  const configKeys = Array.from(new Set([
    ...CONFIG_ORDER.filter((key) => key in config),
    ...Object.keys(config).filter((key) => !CONFIG_ORDER.includes(key)),
  ]))

  return (
    <section className="saga-guided-editor-v4" aria-label="Editor guiado de nodo">
      <header className="saga-guided-v4-header">
        <div className="saga-guided-v4-titleblock">
          <span>EDITOR GUIADO</span>
          <h2>{title}</h2>
          <div className="saga-guided-v4-chips">
            <b>{mode === 'qr' ? `${selectedQr.icon} ${selectedQr.title}` : `${selectedGame.icon} ${selectedGame.title}`}</b>
            <b>{statusLabel(mode === 'qr' ? selectedQr : selectedGame)}</b>
            <b>{offlineLabel(mode === 'qr' ? selectedQr : selectedGame)}</b>
            {stage.lat != null && stage.lon != null ? <b>{Number(stage.lat).toFixed(5)}, {Number(stage.lon).toFixed(5)}</b> : null}
          </div>
        </div>

        <div className="saga-guided-v4-actions">
          <button type="button" className="primary-soft" onClick={() => goTo('type')}>Cambiar tipo</button>
          <button type="button" className="danger" onClick={onDelete}>Eliminar</button>
          <button type="button" onClick={onClose}>Cerrar ×</button>
        </div>
      </header>

      <nav className="saga-guided-v4-stepper" aria-label="Pasos del editor guiado">
        {STEPS.map((item, index) => (
          <button key={item.key} type="button" className={index === stepIndex ? 'active' : ''} onClick={() => setStepIndex(index)}>
            <span>{index + 1}</span>
            <b>{item.label}</b>
          </button>
        ))}
      </nav>

      <div className="saga-guided-v4-progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>

      <main className="saga-guided-v4-body">
        {step === 'type' ? (
          <section className="saga-guided-v4-page saga-guided-v4-page--choices">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 1</span>
              <h3>Que tipo de nodo queres crear?</h3>
              <p>Escolle se será un xogo no mapa ou un QR físico escaneable.</p>
            </div>

            <div className="saga-guided-v4-choice-grid saga-guided-v4-choice-grid--two">
              <button type="button" className={mode === 'game' ? 'active' : ''} onClick={() => applyGame(gameOptions()[0])}>
                <i>🗺️</i>
                <strong>Nodo de xogo</strong>
                <small>GPS, rumbo, lóxica, código, foto ou equipo.</small>
              </button>

              <button type="button" className={mode === 'qr' ? 'active' : ''} onClick={() => applyQr(qrOptions()[0])}>
                <i>▣</i>
                <strong>QR físico</strong>
                <small>Objeto, chave, pista ou bonus imprimible.</small>
              </button>
            </div>
          </section>
        ) : null}

        {step === 'subtype' && mode === 'game' ? (
          <section className="saga-guided-v4-page saga-guided-v4-page--catalog">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 2</span>
              <h3>Escolle o xogo</h3>
              <p>Mostra o catálogo real. Os planificados poden prepararse, pero os máis seguros son “Jugable”.</p>
            </div>

            <div className="saga-guided-v4-catalog-grid">
              {gameOptions().map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className={selectedGame.id === game.id ? 'active' : ''}
                  onClick={() => applyGame(game)}
                >
                  <i>{game.icon}</i>
                  <strong>{game.title}</strong>
                  <small>{game.summary}</small>
                  <em>{statusLabel(game)} · {offlineLabel(game)} · {game.duration}</em>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 'subtype' && mode === 'qr' ? (
          <section className="saga-guided-v4-page saga-guided-v4-page--choices">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 2</span>
              <h3>Escolle o tipo de QR</h3>
              <p>Usa o catálogo real de elementos físicos.</p>
            </div>

            <div className="saga-guided-v4-choice-grid">
              {qrOptions().map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className={selectedQr.id === game.id ? 'active' : ''}
                  onClick={() => applyQr(game)}
                >
                  <i>{game.icon}</i>
                  <strong>{game.title}</strong>
                  <small>{game.summary}</small>
                  <em>{statusLabel(game)} · {offlineLabel(game)}</em>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 'config' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 3</span>
              <h3>{mode === 'qr' ? 'Configurar QR físico' : 'Ajustes del juego'}</h3>
              <p>{(mode === 'qr' ? selectedQr : selectedGame).editorHint}</p>
            </div>

            {mode === 'game' ? (
              <div className="saga-guided-v4-formgrid">
                <article className="saga-guided-v4-note wide">
                  <b>{selectedGame.playerGoal}</b>
                  <span>{selectedGame.offlineNote}</span>
                </article>

                <label>
                  <span>Radio visible del nodo</span>
                  <input
                    type="number"
                    value={Number(stage.radius_m || stage.proximity_radius_m || stage.radius || 50)}
                    onChange={(event) => {
                      patchNumber('radius_m', event.target.value)
                      patchNumber('proximity_radius_m', event.target.value)
                      patchNumber('radius', event.target.value)
                    }}
                  />
                </label>

                <label>
                  <span>Método principal</span>
                  <select value={String(config.completion_method || selectedGame.completionMethod)} onChange={(event) => patchConfig('completion_method', event.target.value)}>
                    {CONFIG_FIELD_META.completion_method.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                {configKeys.map((key) => {
                  const meta = CONFIG_FIELD_META[key] || { label: key, help: 'Ajuste avanzado del juego.', type: 'text' as const }
                  if (key === 'completion_method') return null

                  return (
                    <label key={key} className={key === 'objective' ? 'wide' : ''}>
                      <span>{meta.label}</span>
                      {meta.type === 'select' ? (
                        <select value={formatConfigValue(config[key])} onChange={(event) => patchConfig(key, event.target.value)}>
                          {meta.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      ) : (
                        <input
                          type={meta.type === 'number' ? 'number' : 'text'}
                          value={formatConfigValue(config[key])}
                          onChange={(event) => patchConfig(key, event.target.value)}
                        />
                      )}
                      <small>{meta.help}</small>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className="saga-guided-v4-formgrid">
                <article className="saga-guided-v4-note wide">
                  <b>{selectedQr.playerGoal}</b>
                  <span>{selectedQr.offlineNote}</span>
                </article>

                <label>
                  <span>Nombre visible</span>
                  <input value={qrLabel(stage)} onChange={(event) => onPatch({ physical_item_label: event.target.value, title: event.target.value })} />
                </label>

                <label>
                  <span>ID interno</span>
                  <input value={qrItemId(stage)} onChange={(event) => onPatch({ physical_item_id: slugOf(event.target.value) })} />
                </label>

                <label>
                  <span>Código fallback</span>
                  <input
                    value={fallbackCode(stage)}
                    onChange={(event) => {
                      onPatch({
                        fallback_code: event.target.value,
                        physical_fallback_code: event.target.value,
                        config: { ...config, success_code: event.target.value },
                      })
                    }}
                  />
                </label>

                <label>
                  <span>Payload QR</span>
                  <input value={qrPayload(stage)} onChange={(event) => onPatch({ qr_payload: event.target.value })} />
                </label>
              </div>
            )}
          </section>
        ) : null}

        {step === 'content' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 4</span>
              <h3>{mode === 'qr' ? 'QR imprimible' : 'Textos y mensajes'}</h3>
              <p>{mode === 'qr' ? 'Vista previa y descarga de la tarjeta física.' : 'Lo que ve el jugador durante la misión.'}</p>
            </div>

            {mode === 'qr' ? (
              <div className="saga-guided-v4-qrpanel">
                <div className="saga-guided-v4-qrcard">
                  <div ref={qrWrapRef} className="saga-guided-v4-qrimage">
                    <QRCodeSVG value={qrPayload(stage)} size={138} level="M" includeMargin />
                  </div>
                  <strong>{selectedQr.icon} {qrLabel(stage)}</strong>
                  <small>{qrItemId(stage)}</small>
                </div>

                <div className="saga-guided-v4-qrside">
                  <label>
                    <span>Nombre visible</span>
                    <input value={qrLabel(stage)} onChange={(event) => onPatch({ physical_item_label: event.target.value, title: event.target.value })} />
                  </label>

                  <label>
                    <span>Payload</span>
                    <input value={qrPayload(stage)} onChange={(event) => onPatch({ qr_payload: event.target.value })} />
                  </label>

                  <div className="saga-guided-v4-qractions">
                    <button type="button" className="primary" onClick={saveQrCard}>Aplicar QR</button>
                    <button type="button" onClick={() => copyText(qrPayload(stage), showNotice)}>Copiar</button>
                    <button type="button" onClick={downloadQrSvg}>Descargar SVG</button>
                  </div>

                  {notice ? <small className="saga-guided-v4-notice">{notice}</small> : null}
                </div>
              </div>
            ) : (
              <div className="saga-guided-v4-formgrid">
                <label>
                  <span>Título</span>
                  <input value={String(stage.title || '')} onChange={(event) => onPatch({ title: event.target.value })} />
                </label>

                <label className="wide">
                  <span>Texto principal</span>
                  <textarea
                    value={String(stage.content || stage.description || stage.body || '')}
                    onChange={(event) => onPatch({ content: event.target.value, description: event.target.value, body: event.target.value })}
                    placeholder={selectedGame.content}
                  />
                </label>

                <label>
                  <span>Pista</span>
                  <textarea
                    value={String(stage.messages?.hint || '')}
                    onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), hint: event.target.value } })}
                    placeholder={selectedGame.messages.hint}
                  />
                </label>

                <label>
                  <span>Sin GPS / sensor</span>
                  <textarea
                    value={String(stage.messages?.gps_unavailable || '')}
                    onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), gps_unavailable: event.target.value } })}
                    placeholder={selectedGame.messages.gps_unavailable}
                  />
                </label>

                <label>
                  <span>Bloqueado / no completado</span>
                  <textarea
                    value={String(stage.messages?.locked || '')}
                    onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), locked: event.target.value } })}
                    placeholder={selectedGame.messages.locked}
                  />
                </label>

                <label>
                  <span>Al completar</span>
                  <textarea
                    value={String(stage.success_message || '')}
                    onChange={(event) => onPatch({ success_message: event.target.value })}
                    placeholder="Ben feito. Desbloqueaches a seguinte pista."
                  />
                </label>
              </div>
            )}
          </section>
        ) : null}

        {step === 'rules' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 5</span>
              <h3>Reglas y desbloqueos</h3>
              <p>Requisitos físicos, orden de ruta y código de emergencia.</p>
            </div>

            <div className="saga-guided-v4-formgrid">
              <label>
                <span>Requisito de entrada</span>
                <select
                  value={String(stage.required_item_id || '') ? 'item' : 'none'}
                  onChange={(event) => {
                    if (event.target.value === 'none') onPatch({ required_item_id: '', requires_item: false })
                    else onPatch({ requires_item: true })
                  }}
                >
                  <option value="none">Nada: seguir orden de ruta</option>
                  <option value="item">Require objeto / llave / pista</option>
                </select>
              </label>

              <label>
                <span>ID requerido</span>
                <input
                  value={String(stage.required_item_id || '')}
                  onChange={(event) => onPatch({ required_item_id: event.target.value, requires_item: Boolean(event.target.value) })}
                  placeholder="Exemplo: llave-del-camino"
                />
              </label>

              <label>
                <span>Código de emergencia</span>
                <input
                  value={fallbackCode(stage)}
                  onChange={(event) => onPatch({ fallback_code: event.target.value, config: { ...config, success_code: event.target.value } })}
                />
              </label>

              <label className="checkbox">
                <input checked={Boolean(stage.consume_required_item)} type="checkbox" onChange={(event) => onPatch({ consume_required_item: event.target.checked })} />
                <span>Consumir objeto al superar el nodo</span>
              </label>

              <article className="saga-guided-v4-note wide">
                <b>Nota</b>
                <span>El orden de ruta sigue estando controlado por Builder. Aquí solo se configuran requisitos extra.</span>
              </article>
            </div>
          </section>
        ) : null}

        {step === 'review' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 6</span>
              <h3>Revisar nodo</h3>
              <p>Resumen antes de cerrar. Recuerda Guardar en Builder para persistir.</p>
            </div>

            <div className="saga-guided-v4-review">
              <article><b>Tipo</b><span>{mode === 'qr' ? 'QR físico' : 'Nodo de juego'}</span></article>
              <article><b>Modo</b><span>{(mode === 'qr' ? selectedQr : selectedGame).title}</span></article>
              <article><b>Estado</b><span>{statusLabel(mode === 'qr' ? selectedQr : selectedGame)}</span></article>
              <article><b>Offline</b><span>{offlineLabel(mode === 'qr' ? selectedQr : selectedGame)}</span></article>
              <article><b>Completa por</b><span>{String(config.completion_method || (mode === 'qr' ? selectedQr.completionMethod : selectedGame.completionMethod))}</span></article>
              <article><b>Fallback</b><span>{fallbackCode(stage)}</span></article>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="saga-guided-v4-footer">
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

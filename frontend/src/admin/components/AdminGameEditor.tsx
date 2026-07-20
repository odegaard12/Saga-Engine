import { useEffect, useMemo, useState } from 'react'
import QrCardStudio, { getQrDesignSignature } from './QrCardStudio'
import type { QrCardDesign } from './QrCardStudio'
import {
  adminGameCatalog as _adminGameCatalog,
  getAdminGame as _getAdminGame,
  getDefaultAdminStagePatchForGame,
  type AdminGameCatalogItem,
  type AdminGameId as _AdminGameId,
} from '../lib/gameCatalog'
import type { SavedPhysicalQrCard } from './PhysicalQrCardsPanel'
import type { PhysicalQrKind as _PhysicalQrKind } from './PhysicalQrCardsPanel'
import CircuitPatternEditor from './circuitPattern/CircuitPatternEditor'
import SequenceCodeEditor from './sequenceCode/SequenceCodeEditor'
import PlaceMosaicEditor from './placeMosaic/PlaceMosaicEditor'
import TiltMazeEditor from './tiltMaze/TiltMazeEditor'

import {
  type StageLike,
  type StepKey,
  type EditorMode,
  STEPS,
  READY_STATUSES as _READY_STATUSES,
  TECHNICAL_CONFIG_KEYS as _TECHNICAL_CONFIG_KEYS,
  LEGACY_MESSAGE_FALLBACKS as _LEGACY_MESSAGE_FALLBACKS,
  QR_KIND_BY_GAME_ID as _QR_KIND_BY_GAME_ID,
  QR_GAME_BY_KIND as _QR_GAME_BY_KIND,
  CONFIG_FIELD_META,
  CONFIG_ORDER as _CONFIG_ORDER,
  configOf,
  titleOf as _titleOf,
  nodeNumber as _nodeNumber,
  displayTitle,
  normalizeQrKind,
  hasExplicitQrMarker as _hasExplicitQrMarker,
  gameFromStage,
  isMapCollectibleStage,
  isQrStage,
  gameOptions,
  qrOptions,
  statusLabel,
  offlineLabel,
  isPlayableNow as _isPlayableNow,
  usesLocationRadius,
  normalizeDifficultyForEditor,
  isValidFixedCircuitConfig,
  isValidSequenceCodeConfig,
  isValidTiltMazeConfig,
  isValidPlaceMosaicConfig,
  normalizeCopy as _normalizeCopy,
  shouldReplaceGeneratedGameTitle,
  shouldReplaceSequenceTitle,
  shouldReplacePlaceMosaicTitle,
  isLegacySequenceCopy,
  isLegacySequenceHint,
  isExperimentalOrPlanned,
  normalizeMessage,
  CUSTOM_GAME_EDITOR_IDS as _CUSTOM_GAME_EDITOR_IDS,
  hasCustomGameEditor,
  guidedConfigKeysForGame,
  slugOf,
  fallbackCode,
  qrKindForGame,
  qrGameForKind,
  qrLabel,
  qrItemId,
  qrPayload,
  qrDesignFromConfig,
  formatConfigValue,
  parseConfigValue,
  copyText as _copyText
} from './guided-editor/guidedEditorUtils'

export interface AdminGameEditorProps {
  stage: StageLike
  onPatch: (updates: Record<string, any>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
}

export default function AdminGameEditor({
  stage,
  onPatch,
  onClose,
  onDelete,
  onRequestChangeType,
  stages = [],
}: AdminGameEditorProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [_notice, setNotice] = useState<string | null>(null)
  const [showExperimentalGames, setShowExperimentalGames] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(() =>
    isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
  )

  useEffect(() => {
    setEditorMode(
      isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
    )
    setStepIndex(0)
  }, [stage.id, stage.index, stage])

  const mode = editorMode
  const selected = gameFromStage(stage)
  const selectedQr =
    mode === 'qr' && selected.category === 'physical'
      ? selected
      : qrGameForKind(normalizeQrKind(stage.physical_node_kind || stage.physical_item_kind))
  const selectedGame =
    mode === 'game' && selected.category !== 'physical'
      ? selected
      : gameOptions(showExperimentalGames)[0]
  const step = STEPS[stepIndex]?.key || 'subtype'
  const title = displayTitle(stage)
  const config = configOf(stage)
  const qrDesign = qrDesignFromConfig(config)

  const qrDesignSignature = getQrDesignSignature(qrPayload(stage), qrDesign)

  const _qrValidated = String(config.qr_validation_signature || '') === qrDesignSignature

  const _customGameEditor = mode === 'game' && hasCustomGameEditor(selectedGame)

  const collectibleItems = useMemo(() => {
    return stages
      .filter((s) => {
        if (s.id === stage.id) return false
        const sId = s.physical_item_id || s.physical_qr?.item_id || s.config?.physical_item_id || ''
        return Boolean(sId)
      })
      .map((s) => {
        const sId = s.physical_item_id || s.physical_qr?.item_id || s.config?.physical_item_id || ''
        const sLabel = s.physical_item_label || s.physical_qr?.label || s.title || `Nodo ${s.index + 1}`
        const icon = (s.physical_node_kind === 'collectible' || s.is_map_collectible || s.config?.is_map_collectible) ? '🎁' : '🔑'
        return {
          id: sId,
          label: `${icon} ${sLabel} (del Nodo ${s.index + 1})`,
        }
      })
  }, [stages, stage.id])

  const progress = useMemo(() => Math.round(((stepIndex + 1) / STEPS.length) * 100), [stepIndex])

  const goNext = () => setStepIndex((value) => Math.min(value + 1, STEPS.length - 1))
  const goBack = () => setStepIndex((value) => Math.max(value - 1, 0))
  const goTo = (key: StepKey) =>
    setStepIndex(
      Math.max(
        0,
        STEPS.findIndex((item) => item.key === key)
      )
    )

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
    setEditorMode('game')
    const base = getDefaultAdminStagePatchForGame(game.id)
    const nextConfig = {
      ...(base.config || {}),
      game_id: game.id,
      game_title: game.title,
      completion_method: game.completionMethod,
    }

    const defaultTitle =
      game.id === 'sequence_code'
        ? 'La clave del tríptico'
        : game.id === 'place_mosaic'
          ? 'Mosaico del lugar'
          : game.id === 'tilt_maze'
            ? 'Laberinto de equilibrio'
            : game.id === 'logic_circuit'
              ? 'Matriz de circuitos'
              : game.title

    const nextTitle = shouldReplaceGeneratedGameTitle(stage.title) ? defaultTitle : stage.title

    onPatch({
      ...base,
      title: nextTitle,
      _clear_physical_fields: true,
      physical_qr: null,
      physical_node_kind: null,
      physical_item_kind: null,
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
            : game.category === 'motion' ||
                game.completionMethod === 'motion' ||
                game.category === 'logic'
              ? 'free'
              : 'gps',
      requires_proximity: !(
        game.category === 'logic' ||
        game.category === 'motion' ||
        game.completionMethod === 'motion'
      ),
      radius_m: Number(stage.radius_m || stage.proximity_radius_m || stage.radius || 50),
      proximity_radius_m: Number(stage.proximity_radius_m || stage.radius_m || stage.radius || 50),
      config: nextConfig,
      messages: game.messages,
      content: game.content,
      description: game.content,
    })
    goTo('config')
  }

  function finalizeAndClose() {
    if (mode === 'game' && selectedGame.id === 'tilt_maze' && !isValidTiltMazeConfig(config)) {
      showNotice('Revisa tamaño, tiempo y vidas del laberinto.')
      goTo('config')
      return
    }

    if (
      mode === 'game' &&
      selectedGame.id === 'place_mosaic' &&
      !isValidPlaceMosaicConfig(config)
    ) {
      showNotice('Sube una fotografía y revisa la pregunta final.')
      goTo('config')
      return
    }

    if (
      mode === 'game' &&
      selectedGame.id === 'sequence_code' &&
      !isValidSequenceCodeConfig(config)
    ) {
      showNotice('La secuencia necesita entre 3 y 10 fichas diferentes.')
      goTo('config')
      return
    }

    if (
      mode === 'game' &&
      selectedGame.id === 'logic_circuit' &&
      !isValidFixedCircuitConfig(config)
    ) {
      showNotice('El patrón fijo está incompleto o contiene saltos.')
      goTo('config')
      return
    }

    if (mode === 'game') {
      const base = getDefaultAdminStagePatchForGame(selectedGame.id)
      const nextConfig = {
        ...(base.config || {}),
        ...config,
        is_map_collectible: false,
        game_id: selectedGame.id,
        game_title: selectedGame.title,
        completion_method: selectedGame.completionMethod,
      }

      const rawContent = String(stage.content || stage.description || selectedGame.content || '')

      const nextContent =
        selectedGame.id === 'sequence_code' && isLegacySequenceCopy(rawContent)
          ? selectedGame.content
          : rawContent || selectedGame.content

      const currentMessages = stage.messages || selectedGame.messages

      const nextMessages =
        selectedGame.id === 'sequence_code' && isLegacySequenceHint(currentMessages?.hint)
          ? selectedGame.messages
          : currentMessages

      const nextTitle =
        selectedGame.id === 'sequence_code' && shouldReplaceSequenceTitle(stage.title)
          ? 'La clave del tríptico'
          : selectedGame.id === 'place_mosaic' && shouldReplacePlaceMosaicTitle(stage.title)
            ? 'Mosaico del lugar'
            : stage.title

      onPatch({
        ...base,
        _clear_physical_fields: true,
        physical_qr: null,
        physical_node_kind: null,
        physical_item_kind: null,
        physical_item_id: '',
        physical_item_label: '',
        qr_payload: '',
        game_family: selectedGame.family,
        game_type: selectedGame.id,
        game_template_id: selectedGame.id,
        completion_method: selectedGame.completionMethod,
        entry_mode:
          selectedGame.completionMethod === 'bearing'
            ? 'bearing'
            : selectedGame.completionMethod === 'manual_code'
              ? 'manual'
              : selectedGame.category === 'motion' ||
                  selectedGame.completionMethod === 'motion' ||
                  selectedGame.category === 'logic'
                ? 'free'
                : 'gps',
        requires_proximity: !(
          selectedGame.category === 'logic' ||
          selectedGame.category === 'motion' ||
          selectedGame.completionMethod === 'motion'
        ),
        radius_m: Number(stage.radius_m || stage.proximity_radius_m || stage.radius || 50),
        proximity_radius_m: Number(
          stage.proximity_radius_m || stage.radius_m || stage.radius || 50
        ),
        config: nextConfig,
        title: nextTitle,
        messages: nextMessages,
        content: nextContent,
        description: nextContent,
      })
    }

    onClose()
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
      ...config,
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function applyMapCollectible() {
    setEditorMode('map_collectible')
    onPatch({
      type: 'signal_hunt',
      label: 'Coleccionable de mapa',
      title: 'Objeto Coleccionable',
      physical_qr: null,
      physical_node_kind: 'collectible',
      physical_item_kind: 'collectible',
      physical_item_id: stage.physical_item_id || qrItemId(stage),
      physical_item_label: stage.physical_item_label || qrLabel(stage),
      game_family: 'physical_qr',
      game_type: 'qr_collectible',
      game_template_id: 'qr_collectible',
      entry_mode: 'gps',
      completion_method: 'proximity',
      requires_proximity: true,
      qr_payload: '',
      fallback_code: 'OK',
      physical_fallback_code: 'OK',
      config: {
        ...config,
        is_map_collectible: true,
        completion_method: 'proximity',
        game_id: 'qr_collectible',
        game_title: 'Objeto de mapa',
      },
      messages: {
        hint: 'Acércate para recoger este objeto.',
        gps_unavailable: 'Activa GPS para poder recoger el objeto.',
        locked: 'Muévete al punto para recoger el objeto.',
      },
      content: 'Un objeto coleccionable se encuentra en esta ubicación. Acércate para recogerlo.',
      description: 'Objeto coleccionable de mapa.',
    })
    goTo('config')
  }

  function applyQr(game: AdminGameCatalogItem) {
    setEditorMode('qr')
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

  function patchNumber(key: string, value: string) {
    const next = Number(value)
    onPatch({ [key]: Number.isFinite(next) ? next : 0 })
  }

  const configKeys = guidedConfigKeysForGame(mode === 'qr' ? selectedQr : selectedGame, config)

  return (
    <section className="saga-guided-editor-v4" aria-label="Editor guiado de nodo">
      <header className="saga-guided-v4-header">
        <div className="saga-guided-v4-titleblock">
          <span>EDITOR GUIADO</span>
          <h2>{title}</h2>
          <div className="saga-guided-v4-chips">
            <b>
              {mode === 'qr'
                ? `${selectedQr.icon} ${selectedQr.title}`
                : mode === 'map_collectible'
                  ? '⭐ Coleccionable'
                  : `${selectedGame.icon} ${selectedGame.title}`}
            </b>
            <b>
              {mode === 'map_collectible'
                ? 'Jugable'
                : statusLabel(mode === 'qr' ? selectedQr : selectedGame)}
            </b>
            <b>
              {mode === 'map_collectible'
                ? 'Offline listo'
                : offlineLabel(mode === 'qr' ? selectedQr : selectedGame)}
            </b>
            {stage.lat != null && stage.lon != null ? (
              <b>
                {Number(stage.lat).toFixed(5)}, {Number(stage.lon).toFixed(5)}
              </b>
            ) : null}
          </div>
        </div>

        <div className="saga-guided-v4-actions">
          <button
            type="button"
            className="primary-soft"
            onClick={() => {
              if (onRequestChangeType) {
                onRequestChangeType()
              } else {
                onPatch({ _type_choice_done: false })
              }
            }}
          >
            Cambiar tipo
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Eliminar
          </button>
          <button type="button" onClick={onClose}>
            Cerrar ×
          </button>
        </div>
      </header>

      <nav className="saga-guided-v4-stepper" aria-label="Pasos del editor guiado">
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

      <div className="saga-guided-v4-progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>

      <main className="saga-guided-v4-body">
        {step === 'subtype' && mode === 'game' ? (
          <section className="saga-guided-v4-page saga-guided-v4-page--catalog">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Elige el juego</h3>
              <p>
                Muestra el catálogo real. Los planificados pueden prepararse, pero los más seguros son
                “Jugable”.
              </p>
            </div>

            <div className="saga-guided-v4-toggle-row">
              <span>
                {showExperimentalGames
                  ? 'Mostrando también juegos experimentales/no listos.'
                  : 'Mostrando solo juegos jugables ahora.'}
              </span>
              <button type="button" onClick={() => setShowExperimentalGames((value) => !value)}>
                {showExperimentalGames ? 'Ocultar no listos' : 'Mostrar experimentales'}
              </button>
            </div>

            <div className="saga-guided-v4-catalog-grid">
              {gameOptions(showExperimentalGames).map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className={selectedGame.id === game.id ? 'active' : ''}
                  onClick={() => applyGame(game)}
                >
                  <i>{game.icon}</i>
                  <strong>{game.title}</strong>
                  <small>{game.summary}</small>
                  <em className={isExperimentalOrPlanned(game) ? 'warning' : ''}>
                    {statusLabel(game)} · {offlineLabel(game)} · {game.duration}
                  </em>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 'subtype' && mode === 'qr' ? (
          <section className="saga-guided-v4-page saga-guided-v4-page--choices">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Elige el subtipo de QR físico</h3>
              <p>Selecciona una plantilla de tarjeta física del catálogo SAGA.</p>
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
                  <em>
                    {statusLabel(game)} · {offlineLabel(game)}
                  </em>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 'subtype' && mode === 'map_collectible' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>🌟 Coleccionable en mapa</h3>
              <p>Objeto GPS que el jugador recoge al acercarse físicamente al punto.</p>
            </div>

            <div className="saga-guided-v4-formgrid">
              <article className="saga-guided-v4-note wide" style={{ borderLeft: '3px solid var(--saga-primary)', background: 'rgba(14, 165, 233, 0.04)' }}>
                <b>📌 Funcionamiento del Coleccionable</b>
                <span>
                  El jugador se acerca al punto GPS. Al entrar en el radio, la app detecta la cercanía y le permite recoger el objeto directamente para guardarlo en la mochila. No requiere escanear un QR físico ni jugar a un minijuego.
                </span>
              </article>

              <article className="saga-guided-v4-note wide" style={{ borderLeft: '3px solid #f59e0b', background: 'rgba(245, 158, 11, 0.04)' }}>
                <b>💡 Diferencia con código QR</b>
                <span>
                  El coleccionable GPS <strong>no requiere tarjeta impresa</strong>. Se obtiene de forma 100% digital al estar físicamente en la ubicación.
                </span>
              </article>
            </div>
          </section>
        ) : null}

        
        {step === 'details' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Detalles básicos</h3>
              <p>Nombre interno e ID.</p>
            </div>
            
            <div className="saga-guided-v4-formgrid">
              {mode === 'game' ? (
                <label>
                  <span>Título interno del juego</span>
                  <input
                    value={String(stage.title || '')}
                    onChange={(event) => onPatch({ title: event.target.value })}
                  />
                </label>
              ) : mode === 'map_collectible' ? (
                <>
                  <label className="wide">
                    <span>🎁 ¿Qué objeto DA este nodo al jugador al pasar cerca?</span>
                    <select
                      value={
                        ['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(stage.physical_item_id || '')
                          ? stage.physical_item_id || 'placa_base'
                          : 'custom'
                      }
                      onChange={(event) => {
                        const val = event.target.value
                        if (val === 'custom') {
                          onPatch({ physical_item_id: 'objeto_personalizado', physical_item_label: 'Objeto Personalizado', title: 'Objeto Personalizado', config: { ...config, collectible_purpose: 'standalone' } })
                        } else {
                          const labels: Record<string, string> = { placa_base: 'Placa base', cables_cobre: 'Cables de cobre', bateria_litio: 'Batería de litio', cinta_aislante: 'Cinta aislante', llave_rota: 'Llave rota' }
                          const purposes: Record<string, string> = { placa_base: 'crafting', cables_cobre: 'crafting', bateria_litio: 'crafting', cinta_aislante: 'crafting', llave_rota: 'crafting' }
                          onPatch({ physical_item_id: val, physical_item_label: labels[val], title: labels[val], config: { ...config, collectible_purpose: purposes[val] || 'standalone' } })
                        }
                      }}
                    >
                      <option value="placa_base">💾 Placa base → ingrediente EMP</option>
                      <option value="cables_cobre">🔌 Cables de cobre → ingrediente EMP</option>
                      <option value="bateria_litio">🔋 Batería de litio → ingrediente EMP</option>
                      <option value="cinta_aislante">🩹 Cinta aislante → ingrediente Llave Maestra</option>
                      <option value="llave_rota">🔑 Llave rota → ingrediente Llave Maestra</option>
                      <option value="custom">✏️ Objeto personalizado (tú defines nombre e ID)</option>
                    </select>
                  </label>
                  {!['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(stage.physical_item_id || '') ? (
                    <>
                      <label>
                        <span>Nombre visible</span>
                        <input value={qrLabel(stage)} onChange={(event) => onPatch({ physical_item_label: event.target.value, title: event.target.value })} />
                      </label>
                      <label>
                        <span>ID interno</span>
                        <input value={qrItemId(stage)} onChange={(event) => onPatch({ physical_item_id: slugOf(event.target.value) })} />
                      </label>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <label>
                    <span>Título interno del QR</span>
                    <input
                      value={String(stage.title || '')}
                      onChange={(event) => onPatch({ title: event.target.value })}
                    />
                  </label>
                  <label className="wide">
                    <span>🎁 ¿Qué objeto DA al escanear?</span>
                    <select
                      value={
                        ['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(stage.physical_item_id || '')
                          ? stage.physical_item_id || 'placa_base'
                          : 'custom'
                      }
                      onChange={(event) => {
                        const val = event.target.value
                        if (val === 'custom') {
                          onPatch({ physical_item_id: 'objeto_personalizado', physical_item_label: 'Objeto Personalizado', title: 'Objeto Personalizado', config: { ...config, collectible_purpose: 'standalone' } })
                        } else {
                          const labels: Record<string, string> = { placa_base: 'Placa base', cables_cobre: 'Cables de cobre', bateria_litio: 'Batería de litio', cinta_aislante: 'Cinta aislante', llave_rota: 'Llave rota' }
                          const purposes: Record<string, string> = { placa_base: 'crafting', cables_cobre: 'crafting', bateria_litio: 'crafting', cinta_aislante: 'crafting', llave_rota: 'crafting' }
                          onPatch({ physical_item_id: val, physical_item_label: labels[val], title: labels[val], config: { ...config, collectible_purpose: purposes[val] || 'standalone' } })
                        }
                      }}
                    >
                      <option value="placa_base">💾 Placa base → ingrediente EMP</option>
                      <option value="cables_cobre">🔌 Cables de cobre → ingrediente EMP</option>
                      <option value="bateria_litio">🔋 Batería de litio → ingrediente EMP</option>
                      <option value="cinta_aislante">🩹 Cinta aislante → ingrediente Llave Maestra</option>
                      <option value="llave_rota">🔑 Llave rota → ingrediente Llave Maestra</option>
                      <option value="custom">✏️ Objeto personalizado (tú defines nombre e ID)</option>
                    </select>
                  </label>
                  {!['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(stage.physical_item_id || '') ? (
                    <>
                      <label>
                        <span>Nombre visible</span>
                        <input value={qrLabel(stage)} onChange={(event) => onPatch({ physical_item_label: event.target.value, title: event.target.value })} />
                      </label>
                      <label>
                        <span>ID interno</span>
                        <input value={qrItemId(stage)} onChange={(event) => onPatch({ physical_item_id: slugOf(event.target.value) })} />
                      </label>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </section>
        ) : null}

        {step === 'mechanics' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Mecánica de aproximación</h3>
              <p>GPS y radios de acceso.</p>
            </div>
            <div className="saga-guided-v4-formgrid">
              {mode === 'game' && usesLocationRadius(selectedGame) ? (
                <label>
                  <span>📍 Radio visible del nodo (metros)</span>
                  <input
                    type="number"
                    value={Number(stage.radius_m || stage.proximity_radius_m || stage.radius || 50)}
                    onChange={(event) => {
                      patchNumber('radius_m', event.target.value)
                      patchNumber('proximity_radius_m', event.target.value)
                      patchNumber('radius', event.target.value)
                    }}
                  />
                  <small>Distancia a la que el nodo se hace jugable.</small>
                </label>
              ) : null}
              {mode === 'map_collectible' ? (
                <label>
                  <span>📍 Radio de recolección (metros)</span>
                  <input
                    type="number"
                    value={Number(stage.radius_m || stage.proximity_radius_m || stage.radius || 30)}
                    onChange={(event) => {
                      patchNumber('radius_m', event.target.value)
                      patchNumber('proximity_radius_m', event.target.value)
                      patchNumber('radius', event.target.value)
                    }}
                  />
                  <small>Distancia para poder recoger el objeto del mapa.</small>
                </label>
              ) : null}
              {mode === 'qr' ? (
                <div className="wide">
                  <p>Este nodo es físico y se activa al escanear el QR independientemente de la distancia (aunque se recomiende GPS).</p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 'config' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Ajustes del nodo</h3>
              <p>Opciones de configuración avanzada.</p>
            </div>
            <div className="saga-guided-v4-formgrid">
              {mode === 'game' ? (
                <>
                  {configKeys.map((key) => {
                    const meta = CONFIG_FIELD_META[key] || {
                      label: key,
                      help: 'Ajuste avanzado',
                      type: 'text' as const,
                    }
                    if (key === 'completion_method') return null
                    return (
                      <label key={key} className={key === 'objective' ? 'wide' : ''}>
                        <span>{meta.label}</span>
                        {meta.type === 'select' ? (
                          <select value={key === 'difficulty' ? normalizeDifficultyForEditor(config[key]) : formatConfigValue(config[key])} onChange={(event) => patchConfig(key, event.target.value)}>
                            {meta.options?.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input type={meta.type === 'number' ? 'number' : 'text'} value={formatConfigValue(config[key])} onChange={(event) => patchConfig(key, event.target.value)} />
                        )}
                        <small>{meta.help}</small>
                      </label>
                    )
                  })}
                  {selectedGame.id === 'logic_circuit' && (
                    <div className="wide saga-guided-v4-custom-editor"><CircuitPatternEditor key={selectedGame.id} config={config} onChange={(values) => onPatch({ config: { ...config, ...values } })} /></div>
                  )}
                  {selectedGame.id === 'tilt_maze' && (
                    <div className="wide saga-guided-v4-custom-editor"><TiltMazeEditor key={selectedGame.id} config={config} onChange={(values) => onPatch({ config: { ...config, ...values } })} /></div>
                  )}
                  {selectedGame.id === 'place_mosaic' && (
                    <div className="wide saga-guided-v4-custom-editor"><PlaceMosaicEditor key={selectedGame.id} config={config} onChange={(values) => onPatch({ config: { ...config, ...values } })} /></div>
                  )}
                  {selectedGame.id === 'sequence_code' && (
                    <div className="wide saga-guided-v4-custom-editor"><SequenceCodeEditor key={selectedGame.id} config={config} onChange={(values) => onPatch({ config: { ...config, ...values } })} /></div>
                  )}
                </>
              ) : (
                <div className="wide">
                  <p>No hay ajustes avanzados para este tipo de nodo.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {step === 'rules' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Requisitos previos</h3>
              <p>Objetos necesarios para abrir este nodo.</p>
            </div>
            <div className="saga-guided-v4-formgrid">
              <label className="wide">
                <span>🔑 ¿Requiere algún objeto de la mochila?</span>
                <select
                  value={
                    !stage.required_item_id
                      ? 'none'
                      : ['llave_maestra', 'emp_device'].includes(stage.required_item_id)
                        ? stage.required_item_id
                        : collectibleItems.some(item => item.id === stage.required_item_id)
                          ? stage.required_item_id
                          : 'custom'
                  }
                  onChange={(event) => {
                    const val = event.target.value
                    if (val === 'none') onPatch({ required_item_id: '', requires_item: false })
                    else if (val === 'custom') onPatch({ required_item_id: 'item_requerido', requires_item: true })
                    else onPatch({ required_item_id: val, requires_item: true })
                  }}
                >
                  <option value="none">🟢 No requiere nada</option>
                  <option value="llave_maestra">🔑 Requiere Llave Maestra</option>
                  <option value="emp_device">⚡ Requiere Dispositivo EMP</option>
                  {collectibleItems.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  <option value="custom">✏️ ID personalizado...</option>
                </select>
              </label>
              {stage.required_item_id && !['llave_maestra', 'emp_device'].includes(stage.required_item_id) && !collectibleItems.some(item => item.id === stage.required_item_id) ? (
                <label>
                  <span>ID del objeto requerido</span>
                  <input value={String(stage.required_item_id || '')} onChange={(event) => onPatch({ required_item_id: event.target.value, requires_item: Boolean(event.target.value) })} />
                </label>
              ) : null}
              <label className="checkbox wide">
                <input checked={Boolean(stage.consume_required_item)} type="checkbox" onChange={(event) => onPatch({ consume_required_item: event.target.checked })} />
                <span>Consumir objeto al acceder (se retira de la mochila)</span>
              </label>
              {(mode === 'map_collectible' || mode === 'qr') ? (
                <div className="saga-guided-v4-dep-box wide" style={{ borderLeft: '3px solid #3b82f6', background: 'rgba(59,130,246,0.04)', marginTop: '20px', padding: '16px', borderRadius: '8px' }}>
                  <div className="saga-guided-v4-dep-box__title" style={{ color: '#3b82f6', fontWeight: 600, marginBottom: '8px' }}>
                    🔗 Conexión de línea en mapa (Opcional)
                  </div>
                  <p className="saga-guided-v4-dep-box__desc" style={{ fontSize: '0.85em', color: 'var(--saga-text-muted)', marginBottom: '12px' }}>
                    Si este objeto coleccionable se usará en otro nodo de la misión, selecciónalo aquí. El mapa dibujará una línea punteada conectando ambos.
                  </p>
                  <label>
                    <span>Nodo de destino</span>
                    <select
                      value={String(config.target_unlock_node_id || '')}
                      onChange={(event) => {
                        onPatch({
                          config: {
                            ...config,
                            target_unlock_node_id: event.target.value,
                            collectible_purpose: event.target.value ? 'unlock_node' : config.collectible_purpose,
                          }
                        })
                      }}
                    >
                      <option value="">🎒 Ninguno / Solo coleccionable o Mesa de Trabajo</option>
                      {stages.filter(s => s.id !== stage.id).map((s) => (
                        <option key={s.id} value={s.id}>
                          {`Nodo ${s.index + 1}: ${s.title || 'Sin título'}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 'rewards' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Recompensas</h3>
              <p>Objetos que da al jugador al completarse (solo juegos).</p>
            </div>
            <div className="saga-guided-v4-formgrid">
              {mode !== 'map_collectible' && mode !== 'qr' ? (
                <>
                  <label className="wide">
                    <span>🎁 ¿Entrega algún objeto al ganar?</span>
                    <select
                      value={['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(stage.config?.reward_item_id || '') ? stage.config?.reward_item_id || 'placa_base' : stage.config?.reward_item_id ? 'custom' : 'none'}
                      onChange={(event) => {
                        const val = event.target.value
                        if (val === 'none') onPatch({ config: { ...config, reward_item_id: '', reward_item_label: '', reward_message: '' } })
                        else if (val === 'custom') onPatch({ config: { ...config, reward_item_id: 'objeto_recompensa', reward_item_label: 'Objeto Recompensa', reward_message: '¡Has recibido un objeto!' } })
                        else {
                          const labels: Record<string, string> = { placa_base: 'Placa base', cables_cobre: 'Cables de cobre', bateria_litio: 'Batería de litio', cinta_aislante: 'Cinta aislante', llave_rota: 'Llave rota' }
                          onPatch({ config: { ...config, reward_item_id: val, reward_item_label: labels[val], reward_message: `¡Has recibido: ${labels[val]}!` } })
                        }
                      }}
                    >
                      <option value="none">🟢 Ninguno</option>
                      <option value="placa_base">💾 Placa base</option>
                      <option value="cables_cobre">🔌 Cables de cobre</option>
                      <option value="bateria_litio">🔋 Batería de litio</option>
                      <option value="cinta_aislante">🩹 Cinta aislante</option>
                      <option value="llave_rota">🔑 Llave rota</option>
                      <option value="custom">✏️ Otro objeto...</option>
                    </select>
                  </label>
                  {stage.config?.reward_item_id && !['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(stage.config?.reward_item_id) ? (
                    <>
                      <label>
                        <span>Nombre recompensa</span>
                        <input value={String(stage.config?.reward_item_label || '')} onChange={(event) => onPatch({ config: { ...config, reward_item_label: event.target.value } })} />
                      </label>
                      <label>
                        <span>ID recompensa</span>
                        <input value={String(stage.config?.reward_item_id || '')} onChange={(event) => onPatch({ config: { ...config, reward_item_id: slugOf(event.target.value) } })} />
                      </label>
                    </>
                  ) : null}
                  {stage.config?.reward_item_id && (
                    <label className="wide">
                      <span>Mensaje al recibir</span>
                      <input value={String(stage.config?.reward_message || '')} onChange={(event) => onPatch({ config: { ...config, reward_message: event.target.value } })} />
                    </label>
                  )}
                </>
              ) : (
                <div className="wide"><p>Las recompensas ya están definidas en la sección Detalles para los coleccionables y QRs físicos.</p></div>
              )}
            </div>
          </section>
        ) : null}

        {step === 'content' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Historia principal</h3>
              <p>Texto e introducción narrativa del nodo.</p>
            </div>
            <div className="saga-guided-v4-formgrid">
              {mode === 'game' && (
                <>
                  <label className="wide">
                    <span>Título de la historia (Prólogo)</span>
                    <input value={String(stage.intro_title || '')} onChange={(event) => onPatch({ intro_title: event.target.value })} placeholder="Ej: El Antiguo Manuscrito..." />
                  </label>
                  <label className="wide">
                    <span>Texto del prólogo (Narrativa)</span>
                    <textarea value={String(stage.intro_body || '')} onChange={(event) => onPatch({ intro_body: event.target.value })} rows={4} placeholder="Lo que lee antes de empezar..." />
                  </label>
                </>
              )}
              {mode === 'qr' ? (
                <div className="wide">
                  <QrCardStudio
                    payload={qrPayload(stage)} label={qrLabel(stage)} itemId={qrItemId(stage)}
                    typeLabel={selectedQr.title} design={qrDesign} validationSignature={String(config.qr_validation_signature || '')}
                    onDesignChange={(design) => onPatch({ config: { ...config, qr_card_preset: design.preset, qr_card_shape: design.shape, qr_card_accent: design.accent, qr_card_image_data_url: design.imageDataUrl, qr_validation_signature: '', qr_validated_at: '' } })}
                    onValidated={(signature) => onPatch({ config: { ...config, qr_validation_signature: signature, qr_validated_at: new Date().toISOString() } })}
                    onApply={saveQrCard}
                  />
                  <label>
                    <span>Payload QR (Solo lectura)</span>
                    <input value={qrPayload(stage)} onChange={(e) => onPatch({ qr_payload: e.target.value })} />
                  </label>
                </div>
              ) : (
                <label className="wide">
                  <span>Texto en partida / Descripción</span>
                  <textarea
                    value={String(stage.content || stage.description || stage.body || selectedGame.content || '')}
                    onChange={(event) => onPatch({ content: event.target.value, description: event.target.value, body: event.target.value })}
                    rows={4}
                  />
                </label>
              )}
            </div>
          </section>
        ) : null}

        {step === 'fallbacks' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Ayudas y Fallbacks</h3>
              <p>Pistas para los bloqueos y códigos de emergencia.</p>
            </div>
            <div className="saga-guided-v4-formgrid">
              <label>
                <span>🆘 Código de emergencia (fallback)</span>
                <input
                  value={fallbackCode(stage)}
                  onChange={(event) => onPatch({ fallback_code: event.target.value, physical_fallback_code: event.target.value, config: { ...config, success_code: event.target.value } })}
                />
              </label>
              <label className="wide">
                <span>Pista del juego</span>
                <textarea value={normalizeMessage(stage.messages?.hint, selectedGame.messages.hint)} onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), hint: event.target.value } })} />
              </label>
              <label>
                <span>Texto &ldquo;Sin GPS&rdquo;</span>
                <textarea value={normalizeMessage(stage.messages?.gps_unavailable, selectedGame.messages.gps_unavailable)} onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), gps_unavailable: event.target.value } })} />
              </label>
              <label>
                <span>Texto &ldquo;Bloqueado&rdquo;</span>
                <textarea value={normalizeMessage(stage.messages?.locked, selectedGame.messages.locked)} onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), locked: event.target.value } })} />
              </label>
              <label className="wide">
                <span>Mensaje de éxito</span>
                <textarea value={String(stage.success_message || 'Ben feito. Desbloqueaches a seguinte pista.')} onChange={(event) => onPatch({ success_message: event.target.value })} />
              </label>
            </div>
          </section>
        ) : null}
</main>

      <footer className="saga-guided-v4-footer">
        <button type="button" onClick={goBack} disabled={stepIndex === 0}>
          Atrás
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (onRequestChangeType) {
              onRequestChangeType()
            } else {
              onPatch({ _type_choice_done: false })
            }
          }}
        >
          Cambiar tipo
        </button>
        {stepIndex < STEPS.length - 1 ? (
          <button type="button" className="primary" onClick={goNext}>
            Siguiente
          </button>
        ) : (
          <button type="button" className="primary" onClick={finalizeAndClose}>
            Listo
          </button>
        )}
      </footer>
    </section>
  )
}

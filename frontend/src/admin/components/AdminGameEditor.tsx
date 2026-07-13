import { useEffect, useMemo, useState } from 'react'
import QrCardStudio, { getQrDesignSignature, type QrCardDesign } from './QrCardStudio'
import {
  adminGameCatalog,
  getAdminGame,
  getDefaultAdminStagePatchForGame,
  type AdminGameCatalogItem,
  type AdminGameId,
} from '../lib/gameCatalog'
import type { SavedPhysicalQrCard, PhysicalQrKind } from './PhysicalQrCardsPanel'
import CircuitPatternEditor from './circuitPattern/CircuitPatternEditor'
import SequenceCodeEditor from './sequenceCode/SequenceCodeEditor'
import PlaceMosaicEditor from './placeMosaic/PlaceMosaicEditor'
import TiltMazeEditor from './tiltMaze/TiltMazeEditor'

import {
  type StageLike,
  type StepKey,
  type EditorMode,
  STEPS,
  READY_STATUSES,
  TECHNICAL_CONFIG_KEYS,
  LEGACY_MESSAGE_FALLBACKS,
  QR_KIND_BY_GAME_ID,
  QR_GAME_BY_KIND,
  CONFIG_FIELD_META,
  CONFIG_ORDER,
  configOf,
  titleOf,
  nodeNumber,
  displayTitle,
  normalizeQrKind,
  hasExplicitQrMarker,
  gameFromStage,
  isMapCollectibleStage,
  isQrStage,
  gameOptions,
  qrOptions,
  statusLabel,
  offlineLabel,
  isPlayableNow,
  usesLocationRadius,
  normalizeDifficultyForEditor,
  isValidFixedCircuitConfig,
  isValidSequenceCodeConfig,
  isValidTiltMazeConfig,
  isValidPlaceMosaicConfig,
  normalizeCopy,
  shouldReplaceGeneratedGameTitle,
  shouldReplaceSequenceTitle,
  shouldReplacePlaceMosaicTitle,
  isLegacySequenceCopy,
  isLegacySequenceHint,
  isExperimentalOrPlanned,
  normalizeMessage,
  CUSTOM_GAME_EDITOR_IDS,
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
  copyText
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
  const [notice, setNotice] = useState<string | null>(null)
  const [showExperimentalGames, setShowExperimentalGames] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(() =>
    isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
  )

  useEffect(() => {
    setEditorMode(
      isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
    )
    setStepIndex(0)
  }, [stage.id, stage.index])

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

  const qrValidated = String(config.qr_validation_signature || '') === qrDesignSignature

  const customGameEditor = mode === 'game' && hasCustomGameEditor(selectedGame)

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

        {step === 'config' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>
                {mode === 'qr'
                  ? 'Configurar QR físico'
                  : mode === 'map_collectible'
                    ? 'Configurar objeto en mapa'
                    : 'Ajustes del juego'}
              </h3>
            </div>

            <div className="saga-guided-v4-formgrid">
              <details className="saga-how-to-play-card-details wide" style={{ gridColumn: '1 / -1' }}>
                <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.16)', background: 'rgba(15, 23, 42, 0.48)', color: '#f8fafc', fontWeight: 600, fontSize: '0.85em' }}>
                  <span>🎮 ¿Cómo juega esto el usuario? (Mecánica y objetivo)</span>
                </summary>
                <div style={{ marginTop: '8px', padding: '12px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.12)', background: 'rgba(15, 23, 42, 0.24)', fontSize: '0.8em', color: '#cbd5e1', display: 'grid', gap: '6px' }}>
                  <p style={{ margin: 0 }}>
                    <strong>Objetivo:</strong>{' '}
                    {mode === 'map_collectible'
                      ? 'Acercarse físicamente al punto para recoger el objeto en el mapa.'
                      : (mode === 'qr' ? selectedQr.playerGoal : selectedGame.playerGoal)}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Funcionamiento:</strong>{' '}
                    {mode === 'map_collectible'
                      ? 'El dispositivo detecta la proximidad GPS al nodo y muestra el objeto en pantalla para ser recogido manualmente y guardado en la mochila.'
                      : (mode === 'qr' ? selectedQr.offlineNote : selectedGame.offlineNote)}
                  </p>
                  <p style={{ margin: '4px 0 0 0', color: '#fbbf24' }}>
                    💡 <em>{(mode === 'qr' ? selectedQr.editorHint : selectedGame.editorHint)}</em>
                  </p>
                </div>
              </details>

            {mode === 'game' ? (
              <>
                {usesLocationRadius(selectedGame) ? (
                  <label>
                    <span>Radio visible del nodo</span>
                    <input
                      type="number"
                      value={Number(
                        stage.radius_m || stage.proximity_radius_m || stage.radius || 50
                      )}
                      onChange={(event) => {
                        patchNumber('radius_m', event.target.value)
                        patchNumber('proximity_radius_m', event.target.value)
                        patchNumber('radius', event.target.value)
                      }}
                    />
                  </label>
                ) : null}

                {configKeys.map((key) => {
                  const meta = CONFIG_FIELD_META[key] || {
                    label: key,
                    help: 'Ajuste avanzado oculto normalmente. Revisa solo si sabes qué hace.',
                    type: 'text' as const,
                  }
                  if (key === 'completion_method') return null

                  return (
                    <label key={key} className={key === 'objective' ? 'wide' : ''}>
                      <span>{meta.label}</span>
                      {meta.type === 'select' ? (
                        <select
                          value={
                            key === 'difficulty'
                              ? normalizeDifficultyForEditor(config[key])
                              : formatConfigValue(config[key])
                          }
                          onChange={(event) => patchConfig(key, event.target.value)}
                        >
                          {meta.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
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

                {selectedGame.id === 'logic_circuit' ? (
                  <div className="wide saga-guided-v4-custom-editor">
                    <CircuitPatternEditor
                      key={selectedGame.id}
                      config={config}
                      onChange={(values) =>
                        onPatch({
                          config: {
                            ...config,
                            ...values,
                          },
                        })
                      }
                    />
                  </div>
                ) : null}

                {selectedGame.id === 'tilt_maze' ? (
                  <div className="wide saga-guided-v4-custom-editor">
                    <TiltMazeEditor
                      key={selectedGame.id}
                      config={config}
                      onChange={(values) =>
                        onPatch({
                          config: {
                            ...config,
                            ...values,
                          },
                        })
                      }
                    />
                  </div>
                ) : null}

                {selectedGame.id === 'place_mosaic' ? (
                  <div className="wide saga-guided-v4-custom-editor">
                    <PlaceMosaicEditor
                      key={selectedGame.id}
                      config={config}
                      onChange={(values) =>
                        onPatch({
                          config: {
                            ...config,
                            ...values,
                          },
                        })
                      }
                    />
                  </div>
                ) : null}

                {selectedGame.id === 'sequence_code' ? (
                  <div className="wide saga-guided-v4-custom-editor">
                    <SequenceCodeEditor
                      key={selectedGame.id}
                      config={config}
                      onChange={(values) =>
                        onPatch({
                          config: {
                            ...config,
                            ...values,
                          },
                        })
                      }
                    />
                  </div>
                ) : null}
              </>
            ) : mode === 'map_collectible' ? (
              <>
                {/* ── SECCIÓN 1: ¿Qué objeto da? ── */}
                <label className="wide">
                  <span>🎁 ¿Qué objeto DA este nodo al jugador al pasar cerca?</span>
                  <select
                    value={
                      [
                        'placa_base',
                        'cables_cobre',
                        'bateria_litio',
                        'cinta_aislante',
                        'llave_rota',
                      ].includes(stage.physical_item_id || '')
                        ? stage.physical_item_id || 'placa_base'
                        : 'custom'
                    }
                    onChange={(event) => {
                      const val = event.target.value
                      if (val === 'custom') {
                        onPatch({
                          physical_item_id: 'objeto_personalizado',
                          physical_item_label: 'Objeto Personalizado',
                          title: 'Objeto Personalizado',
                          config: { ...config, collectible_purpose: 'standalone' },
                        })
                      } else {
                        const labels: Record<string, string> = {
                          placa_base: 'Placa base',
                          cables_cobre: 'Cables de cobre',
                          bateria_litio: 'Batería de litio',
                          cinta_aislante: 'Cinta aislante',
                          llave_rota: 'Llave rota',
                        }
                        const purposes: Record<string, string> = {
                          placa_base: 'crafting',
                          cables_cobre: 'crafting',
                          bateria_litio: 'crafting',
                          cinta_aislante: 'crafting',
                          llave_rota: 'crafting',
                        }
                        onPatch({
                          physical_item_id: val,
                          physical_item_label: labels[val],
                          title: labels[val],
                          config: { ...config, collectible_purpose: purposes[val] || 'standalone' },
                        })
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
                  <small>
                    El ID interno sirve para que otros nodos puedan requerirlo o para la Mesa de Trabajo.
                  </small>
                </label>

                {/* Warnings de ingredientes incompletos */}
                {['placa_base', 'cables_cobre', 'bateria_litio'].includes(
                  stage.physical_item_id || ''
                ) ? (
                  <article className="saga-guided-v4-note warning wide">
                    <b>⚠️ Ingrediente del Dispositivo EMP</b>
                    <span>
                      Necesitas <strong>3 nodos</strong> que entreguen: Placa base + Cables de cobre
                      + Batería de litio. El sistema bloqueará el guardado si faltan.
                    </span>
                  </article>
                ) : null}

                {['cinta_aislante', 'llave_rota'].includes(stage.physical_item_id || '') ? (
                  <article className="saga-guided-v4-note warning wide">
                    <b>⚠️ Ingrediente de la Llave Maestra</b>
                    <span>
                      Necesitas <strong>2 nodos</strong> que entreguen: Llave rota + Cinta aislante.
                      El sistema bloqueará el guardado si falta el otro.
                    </span>
                  </article>
                ) : null}

                {/* Campos para objeto personalizado */}
                {!['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(
                  stage.physical_item_id || ''
                ) ? (
                  <>
                    <label>
                      <span>🎨 Icono del objeto</span>
                      <input
                        value={String(config.physical_icon || config.icon || '⭐')}
                        onChange={(event) =>
                          onPatch({ config: { ...config, physical_icon: event.target.value } })
                        }
                        placeholder="Escribe un emoji: 🗝️ 🧿 💎 📦 🔮"
                        maxLength={4}
                        style={{ fontSize: '1.4em', width: '72px', textAlign: 'center' }}
                      />
                    </label>

                    <label>
                      <span>Nombre visible del objeto</span>
                      <input
                        value={qrLabel(stage)}
                        onChange={(event) =>
                          onPatch({
                            physical_item_label: event.target.value,
                            title: event.target.value,
                          })
                        }
                        placeholder="Ej: Tarjeta magnética, Fragmento de mapa..."
                      />
                    </label>

                    <label>
                      <span>ID interno (para dependencias entre nodos)</span>
                      <input
                        value={qrItemId(stage)}
                        onChange={(event) =>
                          onPatch({ physical_item_id: slugOf(event.target.value) })
                        }
                        placeholder="ej: tarjeta_magnetica"
                      />
                      <small>
                        Copia este ID en el campo &quot;Requiere objeto&quot; del nodo que depende de éste.
                      </small>
                    </label>

                    {/* ── SECCIÓN 2: ¿Para qué sirve? ── */}
                    <label className="wide">
                      <span>🎯 ¿Para qué sirve este coleccionable?</span>
                      <select
                        value={String(config.collectible_purpose || 'standalone')}
                        onChange={(event) =>
                          onPatch({
                            config: { ...config, collectible_purpose: event.target.value },
                          })
                        }
                      >
                        <option value="standalone">
                          🎒 Solo coleccionable — el jugador lo guarda en la mochila
                        </option>
                        <option value="unlock_node">
                          🔓 Desbloquea un nodo — otro nodo de la misión lo requiere
                        </option>
                        <option value="crafting">
                          🔨 Ingrediente — el jugador lo combina en la Mesa de Trabajo
                        </option>
                        <option value="score">
                          🏆 Puntuación — se canjea por puntos al finalizar la misión
                        </option>
                      </select>
                      <small>
                        Informativo. Ayuda a clarificar la narrativa de la misión.
                      </small>
                    </label>
                  </>
                ) : null}

                {/* ── SECCIÓN 4: Radio GPS ── */}
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
                  <small>
                    El jugador debe estar a menos de esta distancia del punto GPS para recoger el objeto.
                  </small>
                </label>
              </>
            ) : (
              <>
                {/* ── SECCIÓN 1: ¿Qué objeto da? ── */}
                <label className="wide">
                  <span>🎁 ¿Qué objeto DA este nodo al jugador al escanear el QR?</span>
                  <select
                    value={
                      [
                        'placa_base',
                        'cables_cobre',
                        'bateria_litio',
                        'cinta_aislante',
                        'llave_rota',
                      ].includes(stage.physical_item_id || '')
                        ? stage.physical_item_id || 'placa_base'
                        : 'custom'
                    }
                    onChange={(event) => {
                      const val = event.target.value
                      if (val === 'custom') {
                        onPatch({
                          physical_item_id: 'objeto_personalizado',
                          physical_item_label: 'Objeto Personalizado',
                          title: 'Objeto Personalizado',
                          config: { ...config, collectible_purpose: 'standalone' },
                        })
                      } else {
                        const labels: Record<string, string> = {
                          placa_base: 'Placa base',
                          cables_cobre: 'Cables de cobre',
                          bateria_litio: 'Batería de litio',
                          cinta_aislante: 'Cinta aislante',
                          llave_rota: 'Llave rota',
                        }
                        const purposes: Record<string, string> = {
                          placa_base: 'crafting',
                          cables_cobre: 'crafting',
                          bateria_litio: 'crafting',
                          cinta_aislante: 'crafting',
                          llave_rota: 'crafting',
                        }
                        onPatch({
                          physical_item_id: val,
                          physical_item_label: labels[val],
                          title: labels[val],
                          config: { ...config, collectible_purpose: purposes[val] || 'standalone' },
                        })
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
                  <small>
                    El ID interno sirve para que otros nodos puedan requerirlo o para la Mesa de Trabajo.
                  </small>
                </label>

                {/* Warnings de ingredientes incompletos */}
                {['placa_base', 'cables_cobre', 'bateria_litio'].includes(
                  stage.physical_item_id || ''
                ) ? (
                  <article className="saga-guided-v4-note warning wide">
                    <b>⚠️ Ingrediente del Dispositivo EMP</b>
                    <span>
                      Necesitas <strong>3 nodos</strong> que entreguen: Placa base + Cables de cobre
                      + Batería de litio. El sistema bloqueará el guardado si faltan.
                    </span>
                  </article>
                ) : null}

                {['cinta_aislante', 'llave_rota'].includes(stage.physical_item_id || '') ? (
                  <article className="saga-guided-v4-note warning wide">
                    <b>⚠️ Ingrediente de la Llave Maestra</b>
                    <span>
                      Necesitas <strong>2 nodos</strong> que entreguen: Llave rota + Cinta aislante.
                      El sistema bloqueará el guardado si falta el otro.
                    </span>
                  </article>
                ) : null}

                {/* Campos para objeto personalizado */}
                {!['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(
                  stage.physical_item_id || ''
                ) ? (
                  <>
                    <label>
                      <span>Nombre visible</span>
                      <input
                        value={qrLabel(stage)}
                        onChange={(event) =>
                          onPatch({
                            physical_item_label: event.target.value,
                            title: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>ID interno</span>
                      <input
                        value={qrItemId(stage)}
                        onChange={(event) => onPatch({ physical_item_id: slugOf(event.target.value) })}
                      />
                    </label>
                  </>
                ) : null}



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
                  <input
                    value={qrPayload(stage)}
                    onChange={(event) =>
                      onPatch({
                        qr_payload: event.target.value,
                        config: {
                          ...config,
                          qr_validation_signature: '',
                          qr_validated_at: '',
                        },
                      })
                    }
                  />
                </label>
              </>
            )}
            </div>
          </section>
        ) : null}

        {step === 'history' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>📖 Historia / Prólogo (Opcional)</h3>
              <p>
                Escribe una narrativa que el jugador leerá antes de jugar al minijuego, escanear el QR o recoger el coleccionable.
              </p>
            </div>

            <div className="saga-guided-v4-formgrid">
              <label className="wide">
                <span>Título de la historia</span>
                <input
                  value={String(stage.intro_title || '')}
                  onChange={(event) => onPatch({ intro_title: event.target.value })}
                  placeholder="Ej: El Antiguo Manuscrito, El inicio del misterio..."
                />
              </label>

              <label className="wide">
                <span>Texto de la historia (Narrativa)</span>
                <textarea
                  value={String(stage.intro_body || '')}
                  onChange={(event) => onPatch({ intro_body: event.target.value })}
                  placeholder="Escribe la narrativa que el jugador leerá antes. Soporta Markdown para dar formato o añadir imágenes: ![Descripción](https://link-a-tu-imagen.png)"
                  rows={8}
                />
              </label>
            </div>
          </section>
        ) : null}

        {step === 'content' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>{mode === 'qr' ? 'QR imprimible' : 'Textos y mensajes'}</h3>
              <p>
                {mode === 'qr'
                  ? 'Vista previa y descarga de la tarjeta física.'
                  : 'Lo que ve el jugador durante la misión.'}
              </p>
            </div>

            {mode === 'qr' ? (
              <div className="saga-guided-v4-formgrid">
                <QrCardStudio
                  payload={qrPayload(stage)}
                  label={qrLabel(stage)}
                  itemId={qrItemId(stage)}
                  typeLabel={selectedQr.title}
                  design={qrDesign}
                  validationSignature={String(config.qr_validation_signature || '')}
                  onDesignChange={(design) =>
                    onPatch({
                      config: {
                        ...config,
                        qr_card_preset: design.preset,
                        qr_card_shape: design.shape,
                        qr_card_accent: design.accent,
                        qr_card_image_data_url: design.imageDataUrl,
                        qr_validation_signature: '',
                        qr_validated_at: '',
                      },
                    })
                  }
                  onValidated={(signature) =>
                    onPatch({
                      config: {
                        ...config,
                        qr_validation_signature: signature,
                        qr_validated_at: new Date().toISOString(),
                      },
                    })
                  }
                  onApply={saveQrCard}
                />
                <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid var(--saga-border)' }} />
                <label>
                  <span>Título interno del QR</span>
                  <input
                    value={String(stage.title || '')}
                    onChange={(event) => onPatch({ title: event.target.value })}
                  />
                </label>
              </div>
            ) : (
              <div className="saga-guided-v4-formgrid">
                <label>
                  <span>Título</span>
                  <input
                    value={String(stage.title || '')}
                    onChange={(event) => onPatch({ title: event.target.value })}
                  />
                </label>

                <label className="wide">
                  <span>Texto principal</span>
                  <textarea
                    value={String(
                      stage.content || stage.description || stage.body || selectedGame.content || ''
                    )}
                    onChange={(event) =>
                      onPatch({
                        content: event.target.value,
                        description: event.target.value,
                        body: event.target.value,
                      })
                    }
                    placeholder={selectedGame.content}
                  />
                </label>

                <label>
                  <span>Pista</span>
                  <textarea
                    value={normalizeMessage(stage.messages?.hint, selectedGame.messages.hint)}
                    onChange={(event) =>
                      onPatch({ messages: { ...(stage.messages || {}), hint: event.target.value } })
                    }
                    placeholder={selectedGame.messages.hint}
                  />
                </label>

                <label>
                  <span>Sin GPS / sensor</span>
                  <textarea
                    value={normalizeMessage(
                      stage.messages?.gps_unavailable,
                      selectedGame.messages.gps_unavailable
                    )}
                    onChange={(event) =>
                      onPatch({
                        messages: {
                          ...(stage.messages || {}),
                          gps_unavailable: event.target.value,
                        },
                      })
                    }
                    placeholder={selectedGame.messages.gps_unavailable}
                  />
                </label>

                <label>
                  <span>Bloqueado / no completado</span>
                  <textarea
                    value={normalizeMessage(stage.messages?.locked, selectedGame.messages.locked)}
                    onChange={(event) =>
                      onPatch({
                        messages: { ...(stage.messages || {}), locked: event.target.value },
                      })
                    }
                    placeholder={selectedGame.messages.locked}
                  />
                </label>

                <label>
                  <span>Al completar</span>
                  <textarea
                    value={String(
                      stage.success_message || 'Ben feito. Desbloqueaches a seguinte pista.'
                    )}
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
              <span>Paso {stepIndex + 1}</span>
              <h3>🔒 Desbloqueos y requisitos</h3>
              <p>
                ¿Este nodo necesita que el jugador tenga algún objeto antes de poder jugarlo? Aquí
                se configura y se crean las líneas de conexión visibles en el mapa de admin.
              </p>
            </div>

            <div className="saga-guided-v4-formgrid">
              <div className="saga-guided-v4-dep-box wide">
                <div className="saga-guided-v4-dep-box__title">
                  🔑 Objeto requerido para jugar este nodo
                </div>
                <p className="saga-guided-v4-dep-box__desc" style={{ fontSize: '0.8em', opacity: 0.85, margin: '0 0 12px 0' }}>
                  Si seleccionas un objeto, este nodo estará bloqueado hasta que el jugador lo consiga en la mochila.
                </p>
                <label>
                  <span>¿Requiere algún objeto?</span>
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
                      if (val === 'none') {
                        onPatch({ required_item_id: '', requires_item: false })
                      } else if (val === 'custom') {
                        onPatch({ required_item_id: 'item_requerido', requires_item: true })
                      } else {
                        onPatch({ required_item_id: val, requires_item: true })
                      }
                    }}
                  >
                    <option value="none">🟢 No requiere nada — juego libre</option>
                    <option value="llave_maestra">🔑 Requiere Llave Maestra (fabricable en Mesa)</option>
                    <option value="emp_device">⚡ Requiere Dispositivo EMP (fabricable en Mesa)</option>
                    {collectibleItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                    <option value="custom">✏️ ID personalizado...</option>
                  </select>
                </label>

                {stage.required_item_id &&
                !['llave_maestra', 'emp_device'].includes(stage.required_item_id) &&
                !collectibleItems.some(item => item.id === stage.required_item_id) ? (
                  <label>
                    <span>ID del objeto requerido</span>
                    <input
                      value={String(stage.required_item_id || '')}
                      onChange={(event) =>
                        onPatch({
                          required_item_id: event.target.value,
                          requires_item: Boolean(event.target.value),
                        })
                      }
                      placeholder="Ej: llave_maestra, emp_device, tarjeta_magnetica..."
                    />
                    <small>
                      Debe coincidir exactamente con el ID interno del objeto que da otro nodo.
                    </small>
                  </label>
                ) : null}

                <label className="checkbox">
                  <input
                    checked={Boolean(stage.consume_required_item)}
                    type="checkbox"
                    onChange={(event) => onPatch({ consume_required_item: event.target.checked })}
                  />
                  <span>Consumir objeto al superar el nodo (se retira de la mochila)</span>
                </label>
              </div>

              {/* NUEVO: Conexión de línea en mapa para QR/Coleccionables */}
              {(mode === 'map_collectible' || mode === 'qr') ? (
                <div className="saga-guided-v4-dep-box wide" style={{ borderLeft: '3px solid #3b82f6', background: 'rgba(59,130,246,0.04)' }}>
                  <div className="saga-guided-v4-dep-box__title" style={{ color: '#3b82f6' }}>
                    🔗 Conexión de línea en mapa (Opcional)
                  </div>
                  <p className="saga-guided-v4-dep-box__desc">
                    Si este objeto coleccionable se usará en otro nodo de la misión, selecciónalo aquí. El mapa del administrador dibujará una línea punteada conectando ambos.
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

              {/* RECOMPENSAS AL COMPLETAR (Opcional) - only for non-map_collectibles */}
              {mode !== 'map_collectible' ? (
                <div
                  className="saga-guided-v4-dep-box wide"
                  style={{ borderLeft: '3px solid #10b981', background: 'rgba(16,185,129,0.04)' }}
                >
                  <div className="saga-guided-v4-dep-box__title" style={{ color: '#10b981' }}>
                    🎁 Recompensa al completar (opcional)
                  </div>
                  <p className="saga-guided-v4-dep-box__desc">
                    ¿Quieres que este juego entregue algún objeto coleccionable al jugador cuando lo
                    resuelva con éxito?
                  </p>

                  <label>
                    <span>¿Entrega algún objeto?</span>
                    <select
                      value={
                        [
                          'placa_base',
                          'cables_cobre',
                          'bateria_litio',
                          'cinta_aislante',
                          'llave_rota',
                        ].includes(stage.config?.reward_item_id || '')
                          ? stage.config?.reward_item_id || 'placa_base'
                          : stage.config?.reward_item_id
                            ? 'custom'
                            : 'none'
                      }
                      onChange={(event) => {
                        const val = event.target.value
                        if (val === 'none') {
                          onPatch({
                            config: {
                              ...config,
                              reward_item_id: '',
                              reward_item_label: '',
                              reward_message: '',
                            },
                          })
                        } else if (val === 'custom') {
                          onPatch({
                            config: {
                              ...config,
                              reward_item_id: 'objeto_recompensa',
                              reward_item_label: 'Objeto Recompensa',
                              reward_message: '¡Has recibido un objeto!',
                            },
                          })
                        } else {
                          const labels: Record<string, string> = {
                            placa_base: 'Placa base',
                            cables_cobre: 'Cables de cobre',
                            bateria_litio: 'Batería de litio',
                            cinta_aislante: 'Cinta aislante',
                            llave_rota: 'Llave rota',
                          }
                          onPatch({
                            config: {
                              ...config,
                              reward_item_id: val,
                              reward_item_label: labels[val],
                              reward_message: `¡Has recibido: ${labels[val]}!`,
                            },
                          })
                        }
                      }}
                    >
                      <option value="none">🟢 Ninguno — no entrega objetos</option>
                      <option value="placa_base">💾 Placa base (ingrediente EMP)</option>
                      <option value="cables_cobre">🔌 Cables de cobre (ingrediente EMP)</option>
                      <option value="bateria_litio">🔋 Batería de litio (ingrediente EMP)</option>
                      <option value="cinta_aislante">
                        🩹 Cinta aislante (ingrediente Llave Maestra)
                      </option>
                      <option value="llave_rota">🔑 Llave rota (ingrediente Llave Maestra)</option>
                      <option value="custom">✏️ Otro objeto (ID personalizado)</option>
                    </select>
                  </label>

                  {['placa_base', 'cables_cobre', 'bateria_litio'].includes(
                    stage.config?.reward_item_id || ''
                  ) ? (
                    <article className="saga-guided-v4-note warning wide">
                      <b>⚠️ ¡Atención! Ingrediente incompleto</b>
                      <span>
                        Has seleccionado un ingrediente para el <strong>Dispositivo EMP</strong> como
                        recompensa. Para que el jugador pueda fabricarlo en su Mesa de Trabajo,
                        asegúrate de añadir a la misión otros nodos que entreguen el resto de
                        ingredientes.
                      </span>
                    </article>
                  ) : null}

                  {['cinta_aislante', 'llave_rota'].includes(stage.config?.reward_item_id || '') ? (
                    <article className="saga-guided-v4-note warning wide">
                      <b>⚠️ ¡Atención! Ingrediente incompleto</b>
                      <span>
                        Has seleccionado un ingrediente para la <strong>Llave Maestra</strong> como
                        recompensa. Para que el jugador pueda fabricarla en su Mesa de Trabajo,
                        asegúrate de añadir a la misión otro nodo que entregue el ingrediente
                        restante.
                      </span>
                    </article>
                  ) : null}

                  {stage.config?.reward_item_id &&
                  ![
                    'placa_base',
                    'cables_cobre',
                    'bateria_litio',
                    'cinta_aislante',
                    'llave_rota',
                  ].includes(stage.config?.reward_item_id) ? (
                    <>
                      <label>
                        <span>Nombre del objeto de recompensa</span>
                        <input
                          value={String(stage.config?.reward_item_label || '')}
                          onChange={(event) =>
                            onPatch({
                              config: {
                                ...config,
                                reward_item_label: event.target.value,
                              },
                            })
                          }
                          placeholder="Ej: Llave dorada"
                        />
                      </label>
                      <label>
                        <span>ID interno del objeto de recompensa</span>
                        <input
                          value={String(stage.config?.reward_item_id || '')}
                          onChange={(event) =>
                            onPatch({
                              config: {
                                ...config,
                                reward_item_id: slugOf(event.target.value),
                                reward_message: `¡Has recibido: ${stage.config?.reward_item_label || event.target.value}!`,
                              },
                            })
                          }
                          placeholder="ej: llave_dorada"
                        />
                        <small>
                          Usa minúsculas sin espacios. Este ID sirve si otro nodo requiere este objeto
                          manualmente para completar el nodo.
                        </small>
                      </label>
                    </>
                  ) : null}

                  {stage.config?.reward_item_id ? (
                    <label className="wide">
                      <span>Mensaje al recibir la recompensa</span>
                      <input
                        value={String(stage.config?.reward_message || '')}
                        onChange={(event) =>
                          onPatch({
                            config: {
                              ...config,
                              reward_message: event.target.value,
                            },
                          })
                        }
                        placeholder="Ej: ¡Has conseguido la Llave Dorada!"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              <label>
                <span>🆘 Código de emergencia (fallback)</span>
                <input
                  value={fallbackCode(stage)}
                  onChange={(event) =>
                    onPatch({
                      fallback_code: event.target.value,
                      config: { ...config, success_code: event.target.value },
                    })
                  }
                />
                <small>
                  Si el jugador tiene problemas con la app o GPS, puede introducir este código
                  manualmente para completar el nodo.
                </small>
              </label>

              <article className="saga-guided-v4-note wide">
                <b>💡 Sobre las líneas en el mapa</b>
                <span>
                  Línea <strong style={{ color: '#38bdf8' }}>azul celeste</strong>: conexión directa
                  (el nodo A da el objeto que requiere el nodo B).
                  <br />
                  Línea <strong style={{ color: '#a78bfa' }}>violeta</strong>: el objeto es un
                  ingrediente de una receta de fabricación.
                </span>
              </article>
            </div>
          </section>
        ) : null}

        {step === 'review' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso {stepIndex + 1}</span>
              <h3>Revisar nodo</h3>
              <p>Resumen antes de cerrar. Recuerda Guardar en Builder para persistir.</p>
            </div>

            <div className="saga-guided-v4-review">
              <article>
                <b>Tipo</b>
                <span>{mode === 'qr' ? 'QR físico' : mode === 'map_collectible' ? 'Coleccionable en mapa' : 'Nodo de juego'}</span>
              </article>
              <article>
                <b>Modo</b>
                <span>{mode === 'qr' ? selectedQr.title : mode === 'map_collectible' ? 'Objeto de mapa' : selectedGame.title}</span>
              </article>
              <article>
                <b>Estado</b>
                <span>{mode === 'map_collectible' ? 'Jugable' : statusLabel(mode === 'qr' ? selectedQr : selectedGame)}</span>
              </article>
              <article>
                <b>Offline</b>
                <span>{mode === 'map_collectible' ? 'Offline listo' : offlineLabel(mode === 'qr' ? selectedQr : selectedGame)}</span>
              </article>
              <article>
                <b>Completa por</b>
                <span>
                  {mode === 'map_collectible' ? 'proximity' : String(
                    config.completion_method ||
                      (mode === 'qr' ? selectedQr.completionMethod : selectedGame.completionMethod)
                  )}
                </span>
              </article>
              <article>
                <b>Fallback</b>
                <span>{fallbackCode(stage)}</span>
              </article>
              {mode === 'qr' ? (
                <article>
                  <b>Validación QR</b>
                  <span>{qrValidated ? 'Validado para este diseño' : 'Pendiente de validar'}</span>
                </article>
              ) : null}
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

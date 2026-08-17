import { useEffect, useMemo, useState } from 'react'
import QrCardStudio, { getQrDesignSignature } from './QrCardStudio'
import { getDefaultAdminStagePatchForGame, type AdminGameCatalogItem } from '../lib/gameCatalog'
import type { SavedPhysicalQrCard } from './PhysicalQrCardsPanel'
import CircuitPatternEditor from './circuitPattern/CircuitPatternEditor'
import SimonSaysEditor from './sequenceCode/SimonSaysEditor'
import PlaceMosaicEditor from './placeMosaic/PlaceMosaicEditor'
import TiltMazeEditor from './tiltMaze/TiltMazeEditor'
import SparkRadarEditor from './sparkRadar/SparkRadarEditor'

import {
  type StageLike,
  type StepKey,
  type EditorMode,
  STEPS,
  CONFIG_FIELD_META,
  configOf,
  displayTitle,
  normalizeQrKind,
  gameFromStage,
  isCheckpointStage,
  isMapCollectibleStage,
  isQrStage,
  gameOptions,
  qrOptions,
  statusLabel,
  offlineLabel,
  usesLocationRadius,
  normalizeDifficultyForEditor,
  isValidFixedCircuitConfig,
  isValidSequenceCodeConfig,
  isValidTiltMazeConfig,
  isValidPlaceMosaicConfig,
  shouldReplaceGeneratedGameTitle,
  shouldReplaceSequenceTitle,
  shouldReplacePlaceMosaicTitle,
  isLegacySequenceCopy,
  isLegacySequenceHint,
  isExperimentalOrPlanned,
  normalizeMessage,
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
  const [stepIndex, setStepIndex] = useState(() => (isCheckpointStage(stage) ? 2 : 0))
  const [_notice, setNotice] = useState<string | null>(null)
  const [showExperimentalGames, setShowExperimentalGames] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(() =>
    isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
  )

  useEffect(() => {
    setEditorMode(
      isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
    )
    setStepIndex(isCheckpointStage(stage) ? 2 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id, stage.index])

  const mode = editorMode
  const selected = gameFromStage(stage)
  const selectedQr =
    mode === 'qr' && selected.category === 'physical'
      ? selected
      : qrGameForKind(normalizeQrKind(stage.physical_node_kind ?? stage.physical_item_kind))
  const selectedGame =
    mode === 'game' && selected.category !== 'physical'
      ? selected
      : gameOptions(showExperimentalGames)[0]
  const step = STEPS[stepIndex]?.key || 'subtype'
  const title = displayTitle(stage)
  const config = configOf(stage)
  const qrDesign = qrDesignFromConfig(config)

  const qrDesignSignature = getQrDesignSignature(qrPayload(stage), qrDesign)

  const _qrValidated = String(config.qr_validation_signature ?? '') === qrDesignSignature

  const _customGameEditor = mode === 'game' && hasCustomGameEditor(selectedGame)

  const collectibleItems = useMemo(() => {
    return stages
      .filter((s) => {
        if (s.id === stage.id) return false
        const sId = s.physical_item_id ?? s.physical_qr?.item_id ?? s.config?.physical_item_id ?? ''
        return Boolean(sId)
      })
      .map((s) => {
        const sId = s.physical_item_id ?? s.physical_qr?.item_id ?? s.config?.physical_item_id ?? ''
        const sLabel = s.physical_item_label ?? s.physical_qr?.label ?? s.title ?? `Nodo ${s.index + 1}`
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
    const baseCheckpoint = getDefaultAdminStagePatchForGame('simple_checkpoint')
    setEditorMode('map_collectible')
    onPatch({
      type: baseCheckpoint.type,
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
          <div style={{ margin: '6px 0 8px 0', width: '100%', maxWidth: '540px' }}>
            <label style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              ✏️ Nombre del nodo / Ubicación
            </label>
            <input
              type="text"
              value={String(stage.title || '').replace(/^\d+\.\s*/, '')}
              onChange={(event) => onPatch({ title: event.target.value })}
              placeholder="Escribe el nombre de esta ubicación (ej. Senda Forestal Norte)..."
              style={{
                width: '100%',
                fontSize: 18,
                fontWeight: 800,
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1.5px solid rgba(251, 191, 36, 0.5)',
                borderRadius: 10,
                padding: '8px 14px',
                color: '#ffffff',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            />
          </div>
          <div className="saga-guided-v4-chips">
            <b>
              {mode === 'qr'
                ? `${selectedQr.icon} ${selectedQr.title}`
                : mode === 'map_collectible'
                  ? '⭐ Objeto QR'
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
        {step === 'rules' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 1 de 3</span>
              <h3>🎯 Tipo y Reglas de Acceso</h3>
              <p>Selecciona la experiencia y define la distancia y requisitos para jugar.</p>
            </div>

            <div className="saga-guided-v4-formgrid">
              {/* Selector de plantilla de juego o QR */}
              {mode === 'game' && isCheckpointStage(stage) ? (
                <div className="wide">
                  <article
                    className="saga-guided-v4-note wide"
                    style={{
                      borderLeft: '3px solid #34d399',
                      background: 'rgba(52, 211, 153, 0.06)',
                      padding: 14,
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                  >
                    <b>📍 Checkpoint / Pista</b>
                    <span>
                      Este nodo solo muestra un texto, historia o pista cuando el jugador llega al
                      punto. No tiene minijuego. Escribe el texto en el paso 3 (Historia y Pistas).
                      Si quieres convertirlo en minijuego, elige una plantilla debajo.
                    </span>
                  </article>
                </div>
              ) : null}
              {mode === 'game' ? (
                <div className="wide">
                  <div className="saga-guided-v4-toggle-row" style={{ marginBottom: 12 }}>
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
                </div>
              ) : null}

              {mode === 'qr' ? (
                <div className="wide">
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
                </div>
              ) : null}

              {mode === 'map_collectible' ? (
                <div className="wide">
                  <article className="saga-guided-v4-note wide" style={{ borderLeft: '3px solid var(--saga-primary)', background: 'rgba(14, 165, 233, 0.04)', padding: 14, borderRadius: 8 }}>
                    <b>📌 Coleccionable Digital en Mapa</b>
                    <span>El jugador recoge este objeto automáticamente al estar físicamente en la ubicación GPS.</span>
                  </article>
                </div>
              ) : null}

              {/* Radio GPS de aproximación */}
              {mode === 'game' && usesLocationRadius(selectedGame) ? (
                <label className="wide">
                  <span>📍 Radio de aproximación (metros)</span>
                  <input
                    type="number"
                    value={Number(stage.radius_m || stage.proximity_radius_m || stage.radius || 50)}
                    onChange={(event) => {
                      patchNumber('radius_m', event.target.value)
                      patchNumber('proximity_radius_m', event.target.value)
                      patchNumber('radius', event.target.value)
                    }}
                  />
                  <small>Distancia a la que el nodo se vuelve interactivo en el mapa.</small>
                </label>
              ) : mode === 'map_collectible' ? (
                <label className="wide">
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

              {/* Requisitos de Mochila */}
              <label className="wide">
                <span>🔑 ¿Requiere algún objeto de la mochila para abrirse?</span>
                <select
                  value={
                    !stage.required_item_id
                      ? 'none'
                      : ['llave_maestra', 'emp_device', 'decodificador_cuantico', 'escaner_biometrico', 'amuleto_guardian', 'elixir_alquimia', 'escudo_runico', 'orbe_fuego', 'reliquia_sagrada', 'amuleto_vision'].includes(stage.required_item_id)
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
                  <option value="none">🟢 Ninguno (Abierto a todos los jugadores)</option>
                  <option value="llave_maestra">🔑 Requiere Llave Maestra</option>
                  <option value="emp_device">⚡ Requiere Dispositivo EMP</option>
                  <option value="decodificador_cuantico">💻 Requiere Decodificador Cuántico</option>
                  <option value="escaner_biometrico">🔬 Requiere Escáner Biométrico</option>
                  <option value="amuleto_guardian">🛡️ Requiere Amuleto del Guardián</option>
                  <option value="elixir_alquimia">🧪 Requiere Elixir de Alquimia</option>
                  <option value="escudo_runico">🛡️ Requiere Escudo Rúnico</option>
                  <option value="orbe_fuego">🔮 Requiere Orbe de Fuego Arcano</option>
                  <option value="reliquia_sagrada">🏛️ Requiere Reliquia Sagrada</option>
                  <option value="amuleto_vision">👁️ Requiere Amuleto de Visión</option>
                  {collectibleItems.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  <option value="custom">✏️ ID personalizado...</option>
                </select>
              </label>

              {stage.required_item_id && !['llave_maestra', 'emp_device', 'decodificador_cuantico', 'escaner_biometrico', 'amuleto_guardian', 'elixir_alquimia', 'escudo_runico', 'orbe_fuego', 'reliquia_sagrada', 'amuleto_vision'].includes(stage.required_item_id) && !collectibleItems.some(item => item.id === stage.required_item_id) ? (
                <label>
                  <span>ID del objeto requerido</span>
                  <input value={String(stage.required_item_id || '')} onChange={(event) => onPatch({ required_item_id: event.target.value, requires_item: Boolean(event.target.value) })} />
                </label>
              ) : null}

              {stage.required_item_id ? (
                <label className="checkbox wide">
                  <input checked={Boolean(stage.consume_required_item)} type="checkbox" onChange={(event) => onPatch({ consume_required_item: event.target.checked })} />
                  <span>Consumir objeto al acceder (se retira de la mochila)</span>
                </label>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 'config' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 2 de 3</span>
              <h3>⚙️ Ajustes y Recompensas del Nodo</h3>
              <p>Personaliza el título, las reglas del juego y lo que entrega al completarse.</p>
            </div>

            <div className="saga-guided-v4-formgrid">
              {/* Título e Identificador */}
              {mode === 'game' ? (
                <label className="wide">
                  <span>Título visible del nodo / juego</span>
                  <input
                    value={String(stage.title || '')}
                    onChange={(event) => onPatch({ title: event.target.value })}
                  />
                </label>
              ) : mode === 'map_collectible' ? (
                <>
                  <label className="wide">
                    <span>🎁 Objeto que entrega este nodo en el mapa</span>
                    <select
                      value={
                        ['placa_base', 'cables_cobre', 'bateria_litio', 'cinta_aislante', 'llave_rota'].includes(stage.physical_item_id || '')
                          ? stage.physical_item_id || 'placa_base'
                          : 'custom'
                      }
                      onChange={(event) => {
                        const val = event.target.value
                        if (val === 'custom') {
                          onPatch({ physical_item_id: 'objeto_personalizado', physical_item_label: 'Objeto Personalizado', config: { ...config, collectible_purpose: 'standalone' } })
                        } else {
                          const labels: Record<string, string> = { placa_base: 'Placa base', cables_cobre: 'Cables de cobre', bateria_litio: 'Batería de litio', cinta_aislante: 'Cinta aislante', llave_rota: 'Llave rota' }
                          const purposes: Record<string, string> = { placa_base: 'crafting', cables_cobre: 'crafting', bateria_litio: 'crafting', cinta_aislante: 'crafting', llave_rota: 'crafting' }
                          onPatch({ physical_item_id: val, physical_item_label: labels[val], config: { ...config, collectible_purpose: purposes[val] || 'standalone' } })
                        }
                      }}
                    >
                      <option value="placa_base">💾 Placa base → ingrediente EMP</option>
                      <option value="cables_cobre">🔌 Cables de cobre → ingrediente EMP</option>
                      <option value="bateria_litio">🔋 Batería de litio → ingrediente EMP</option>
                      <option value="cinta_aislante">🩹 Cinta aislante → ingrediente Llave Maestra</option>
                      <option value="llave_rota">🔑 Llave rota → ingrediente Llave Maestra</option>
                      <option value="custom">✏️ Objeto personalizado</option>
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
                    <span>🎁 Objeto que entrega al escanear</span>
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
                      <option value="custom">✏️ Objeto personalizado</option>
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

              {/* Recompensas para minijuegos */}
              {mode !== 'map_collectible' && mode !== 'qr' ? (
                <>
                  <label className="wide">
                    <span>🎁 ¿Entrega algún objeto de regalo al superar el juego?</span>
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
                      <span>Mensaje al recibir recompensa</span>
                      <input value={String(stage.config?.reward_message || '')} onChange={(event) => onPatch({ config: { ...config, reward_message: event.target.value } })} />
                    </label>
                  )}
                </>
              ) : null}

              {/* Ajustes específicos del Minijuego */}
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
                  {selectedGame.id === 'spark_radar' && (
                    <div className="wide saga-guided-v4-custom-editor"><SparkRadarEditor key={selectedGame.id} config={config} onChange={(values) => onPatch({ config: { ...config, ...values } })} /></div>
                  )}
                  {selectedGame.id === 'tilt_maze' && (
                    <div className="wide saga-guided-v4-custom-editor"><TiltMazeEditor key={selectedGame.id} config={config} onChange={(values) => onPatch({ config: { ...config, ...values } })} /></div>
                  )}
                  {selectedGame.id === 'place_mosaic' && (
                    <div className="wide saga-guided-v4-custom-editor"><PlaceMosaicEditor key={selectedGame.id} config={config} onChange={(values) => onPatch({ config: { ...config, ...values } })} /></div>
                  )}
                  {selectedGame.id === 'sequence_code' && (
                    <div className="wide saga-guided-v4-custom-editor"><SimonSaysEditor key={selectedGame.id} config={config} onChange={(values) => onPatch({ config: { ...config, ...values } })} /></div>
                  )}
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 'content' ? (
          <section className="saga-guided-v4-page">
            <div className="saga-guided-v4-pagehead">
              <span>Paso 3 de 3</span>
              <h3>📜 Historia, Pistas y Ayuda</h3>
              <p>Redacta la narrativa que leerá el jugador y las pistas de rescate.</p>
            </div>

            <div className="saga-guided-v4-formgrid">
              {mode === 'game' && (
                <>
                  <label className="wide">
                    <span>Título del Prólogo / Historia</span>
                    <input value={String(stage.intro_title || '')} onChange={(event) => onPatch({ intro_title: event.target.value })} placeholder="Ej: El Antiguo Manuscrito..." />
                  </label>
                  <label className="wide">
                    <span>Texto del Prólogo (Narrativa)</span>
                    <textarea value={String(stage.intro_body || '')} onChange={(event) => onPatch({ intro_body: event.target.value })} rows={3} placeholder="Texto introductorio antes de jugar..." />
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
                  <label style={{ marginTop: 12 }}>
                    <span>Payload QR (Código codificado)</span>
                    <input value={qrPayload(stage)} onChange={(e) => onPatch({ qr_payload: e.target.value })} />
                  </label>
                </div>
              ) : (
                <label className="wide">
                  <span>Texto explicativo / Descripción del nodo</span>
                  <textarea
                    value={String(stage.content || stage.description || stage.body || selectedGame.content || '')}
                    onChange={(event) => onPatch({ content: event.target.value, description: event.target.value, body: event.target.value })}
                    rows={4}
                  />
                </label>
              )}

              <label className="wide">
                <span>💡 Pista del juego (si el jugador se atasca)</span>
                <textarea value={normalizeMessage(stage.messages?.hint, selectedGame.messages.hint)} onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), hint: event.target.value } })} rows={2} />
              </label>

              <label>
                <span>Texto &ldquo;Sin cobertura GPS&rdquo;</span>
                <textarea value={normalizeMessage(stage.messages?.gps_unavailable, selectedGame.messages.gps_unavailable)} onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), gps_unavailable: event.target.value } })} rows={2} />
              </label>

              <label>
                <span>Texto &ldquo;Acceso Bloqueado&rdquo;</span>
                <textarea value={normalizeMessage(stage.messages?.locked, selectedGame.messages.locked)} onChange={(event) => onPatch({ messages: { ...(stage.messages || {}), locked: event.target.value } })} rows={2} />
              </label>

              <label className="wide">
                <span>🎉 Mensaje de éxito al completar</span>
                <textarea value={String(stage.success_message || '¡Bien hecho! Has desbloqueado la siguiente pista.')} onChange={(event) => onPatch({ success_message: event.target.value })} rows={2} />
              </label>

              <label className="wide">
                <span>🆘 Código SAGA de emergencia (Fallback)</span>
                <input
                  value={fallbackCode(stage)}
                  onChange={(event) => onPatch({ fallback_code: event.target.value, physical_fallback_code: event.target.value, config: { ...config, success_code: event.target.value } })}
                />
                <small>Permite superar el nodo introduciendo este código manualmente si falla el GPS o la cámara.</small>
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

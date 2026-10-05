import { useEffect, useMemo, useState, type ComponentType } from 'react'
import NodeEditorFrame, { CampoTexto, MaquetaMovil, type EstadoGuardado, type SeccionDef } from './editor/NodeEditorFrame'
import RecompensaDeVestuario from './vestuario/RecompensaDeVestuario'
import { estadoDelNodoEnEdicion, type SeccionEditor } from '../lib/estadoNodo'
import QrCardStudio, { getQrDesignSignature } from './QrCardStudio'
import { getDefaultAdminStagePatchForGame, type AdminGameCatalogItem } from '../lib/gameCatalog'
import type { SavedPhysicalQrCard } from './PhysicalQrCardsPanel'
import CircuitPatternEditor from './circuitPattern/CircuitPatternEditor'
import SimonSaysEditor from './sequenceCode/SimonSaysEditor'
import PlaceMosaicEditor from './placeMosaic/PlaceMosaicEditor'
import TiltMazeEditor from './tiltMaze/TiltMazeEditor'
import SparkRadarEditor from './sparkRadar/SparkRadarEditor'
import RumboDobleEditor from './rumboDoble/RumboDobleEditor'
import CuentaSenalesEditor from './cuentaSenales/CuentaSenalesEditor'
import TrampaPalabrasEditor from './trampaPalabras/TrampaPalabrasEditor'
import { REQUIRED_ITEM_LABELS, savedFallbackCode } from '../lib/stageFields'
import { compressImage, dataUrlKilobytes, describeImageError } from '../lib/imageCompression'

// Editor propio de cada juego (paso opcional de "Cómo añadir un minijuego").
// La clave es el game_id; el registro (shared/game_registry.json) marca con
// `custom_editor` los juegos cuya config guiada se oculta porque la edita este
// componente. spark_radar tiene editor pero conserva sus campos genéricos.
type CustomEditorProps = {
  config: Record<string, any>
  onChange: (values: Record<string, any>) => void
}
const CUSTOM_EDITOR_COMPONENTS: Record<string, ComponentType<CustomEditorProps>> = {
  logic_circuit: CircuitPatternEditor as ComponentType<CustomEditorProps>,
  spark_radar: SparkRadarEditor as ComponentType<CustomEditorProps>,
  tilt_maze: TiltMazeEditor as ComponentType<CustomEditorProps>,
  place_mosaic: PlaceMosaicEditor as ComponentType<CustomEditorProps>,
  sequence_code: SimonSaysEditor as ComponentType<CustomEditorProps>,
  rumbo_doble: RumboDobleEditor as ComponentType<CustomEditorProps>,
  cuenta_senales: CuentaSenalesEditor as ComponentType<CustomEditorProps>,
  trampa_palabras: TrampaPalabrasEditor as ComponentType<CustomEditorProps>,
}
import { displayFamilyCards, getDisplayFamily } from '../lib/displayFamilies'

import {
  type StageLike,
  type StepKey,
  type EditorMode,
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

/** Mismos topes que el servidor (core_engine.RADIO_MAXIMO_M): fuera de ahí no se guarda. */
const RADIO_MINIMO_M = 1
const RADIO_MAXIMO_M = 1000

export interface AdminGameEditorProps {
  stage: StageLike
  onPatch: (updates: Record<string, any>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
  estadoGuardado?: EstadoGuardado
  onGuardar?: () => void
}

export default function AdminGameEditor({
  stage,
  onPatch,
  onClose,
  onDelete,
  onRequestChangeType,
  stages = [],
  estadoGuardado = 'idle',
  onGuardar,
}: AdminGameEditorProps) {
  const [solicitud, setSolicitud] = useState<{ id: SeccionEditor; n: number } | null>(null)
  const [_notice, setNotice] = useState<string | null>(null)
  // Resultado de la última foto de pista de «Mapa mudo» (o por qué no cupo).
  const [clueNotice, setClueNotice] = useState<{ text: string; failed: boolean } | null>(null)
  const [showExperimentalGames, setShowExperimentalGames] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(() =>
    isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
  )

  useEffect(() => {
    setEditorMode(
      isMapCollectibleStage(stage) ? 'map_collectible' : isQrStage(stage) ? 'qr' : 'game'
    )
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

  const goTo = (key: StepKey) =>
    setSolicitud({
      id: key === 'config' ? 'juego' : key === 'content' ? 'historia' : 'identidad',
      n: Date.now(),
    })

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 6000)
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
      // "bearing" y "manual" NUNCA fueron entry_mode válidos -el backend
      // sólo acepta gps/free/qr (ver validate_stage en core_engine.py)-, así
      // que cualquier juego con completionMethod 'bearing' (Caza de rumbo,
      // Rumbo doble) o 'manual_code' guardaba un nodo que /api/admin/save
      // rechazaba siempre con 400 "unsupported entry mode". Encontrado
      // reproduciendo el guardado de Rumbo doble en el banco local: el
      // jugador tiene que estar físicamente en el punto igual que cualquier
      // otro minijuego, así que cae en el mismo 'gps' de siempre.
      entry_mode:
        game.category === 'motion' || game.completionMethod === 'motion' || game.category === 'logic'
          ? 'free'
          : 'gps',
      require_proximity: !(
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
        // Ver el comentario del mismo entry_mode más arriba en este
        // archivo (handleSelectGame): 'bearing'/'manual' nunca fueron
        // entry_mode válidos para el backend.
        entry_mode:
          selectedGame.category === 'motion' ||
          selectedGame.completionMethod === 'motion' ||
          selectedGame.category === 'logic'
            ? 'free'
            : 'gps',
        require_proximity: !(
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
      require_proximity: false,
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
      require_proximity: true,
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

  // Nombre que verá el jugador en «necesitas...»: el de la lista, o el del nodo
  // que entrega el objeto. Sin nombre, el servidor usa el id crudo.
  function requiredItemLabel(itemId: string) {
    if (REQUIRED_ITEM_LABELS[itemId]) return REQUIRED_ITEM_LABELS[itemId]
    const nodo = collectibleItems.find((item) => item.id === itemId)
    return nodo ? nodo.label.replace(/^\S+\s+/, '').replace(/\s*\(del Nodo \d+\)\s*$/, '') : itemId
  }

  // La foto de pista de «Mapa mudo» se recorta en cuadrado y se comprime hasta
  // que quepa (≤ 520 000 caracteres): antes viajaba tal cual, de varios MB,
  // dentro de /api/game, del paquete offline y de la vista de administración.
  async function handleClueFile(file: File | undefined, input: HTMLInputElement) {
    if (!file) return
    setClueNotice({ text: 'Preparando la foto…', failed: false })
    try {
      const compressed = await compressImage(file)
      onPatch({ config: { ...config, image_data_url: compressed } })
      setClueNotice({
        text: `Foto preparada (${dataUrlKilobytes(compressed)} KB). Guarda el nodo.`,
        failed: false,
      })
    } catch (error) {
      setClueNotice({ text: describeImageError(error), failed: true })
    } finally {
      input.value = ''
    }
  }

  const configKeys = guidedConfigKeysForGame(mode === 'qr' ? selectedQr : selectedGame, config)

  const avisosConfigInvalida: string[] = []
  if (mode === 'game') {
    if (selectedGame.id === 'tilt_maze' && !isValidTiltMazeConfig(config))
      avisosConfigInvalida.push('Revisa tamaño, tiempo y vidas del laberinto.')
    if (selectedGame.id === 'place_mosaic' && !isValidPlaceMosaicConfig(config))
      avisosConfigInvalida.push('Sube una fotografía y revisa la pregunta final.')
    if (selectedGame.id === 'sequence_code' && !isValidSequenceCodeConfig(config))
      avisosConfigInvalida.push('La secuencia necesita entre 3 y 10 fichas diferentes.')
    if (selectedGame.id === 'logic_circuit' && !isValidFixedCircuitConfig(config))
      avisosConfigInvalida.push('El patrón fijo está incompleto o contiene saltos.')
  }
  const estadoEditor = estadoDelNodoEnEdicion(stage as never, stages as never[])
  const avisosDe = (seccion: SeccionEditor) =>
    estadoEditor.problemas.filter((p) => p.seccion === seccion).map((p) => p.texto)
  const avisosJuego = [...avisosDe('juego'), ...avisosConfigInvalida]
  const tipoActual =
    mode === 'qr'
      ? selectedQr
      : mode === 'map_collectible'
        ? { icon: '⭐', title: 'Objeto QR' }
        : selectedGame
  const radioActual = Number(stage.radius_m || stage.proximity_radius_m || stage.radius || 0)
  const codigoEmergencia = savedFallbackCode(stage)
  const premioActual = String(stage.config?.reward_item_label || stage.config?.reward_item_id || '')
  const textoDescripcion = String(
    stage.content || stage.description || stage.body || selectedGame.content || ''
  )
  const textoPista = normalizeMessage(stage.messages?.hint, selectedGame.messages.hint)
  const esCheckpoint = mode === 'game' && isCheckpointStage(stage)
  const radioAplica =
    (mode === 'game' && usesLocationRadius(selectedGame)) || mode === 'map_collectible'

  const secciones: SeccionDef[] = [
    {
      id: 'identidad',
      titulo: 'Identidad y tipo',
      icono: '🎯',
      resumen: `${tipoActual.icon} ${tipoActual.title} · ${
        mode === 'map_collectible' ? 'Jugable' : statusLabel(mode === 'qr' ? selectedQr : selectedGame)
      }`,
      nivel: avisosDe('identidad').length ? 'incompleto' : 'ok',
      avisos: avisosDe('identidad'),
      abierta: false,
      contenido: (
        <>
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

                  {mode === 'game' && isExperimentalOrPlanned(selectedGame) ? (
                    <article
                      className="saga-guided-v4-note wide"
                      style={{
                        borderLeft: '3px solid #f59e0b',
                        background: 'rgba(245, 158, 11, 0.08)',
                        padding: 14,
                        borderRadius: 8,
                        marginBottom: 12,
                      }}
                    >
                      <b>⚠️ {selectedGame.title}: {statusLabel(selectedGame)}</b>
                      <span>{selectedGame.offlineNote}</span>
                    </article>
                  ) : null}

                  {/* Agrupado en las 5 familias del admin: cada juego cae en
                      exactamente una (ver frontend/src/admin/lib/displayFamilies.ts).
                      Es solo orden de presentación, no cambia ningún id de juego. */}
                  {displayFamilyCards.map((familyCard) => {
                    const gamesInFamily = gameOptions(showExperimentalGames).filter(
                      (game) => getDisplayFamily(game.id) === familyCard.id
                    )
                    if (gamesInFamily.length === 0) return null
                    return (
                      <div key={familyCard.id} className="saga-guided-v4-catalog-family wide">
                        <h4 className="saga-guided-v4-catalog-family-title">
                          {familyCard.icon} {familyCard.title}
                        </h4>
                        <p className="saga-guided-v4-catalog-family-desc">
                          {familyCard.description}
                        </p>
                        <div className="saga-guided-v4-catalog-grid">
                          {gamesInFamily.map((game) => (
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
                    )
                  })}
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

                        {/* Título e Identificador */}
              {mode === 'game' ? null : mode === 'map_collectible' ? (
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

        </>
      ),
    },
    {
      id: 'donde',
      titulo: 'Dónde y acceso',
      icono: '📍',
      resumen: `${radioAplica && radioActual ? `Radio ${radioActual} m` : 'Sin radio GPS'} · ${
        stage.required_item_id ? `Pide ${stage.required_item_label || stage.required_item_id}` : 'Abierto a todos'
      }`,
      nivel: avisosDe('donde').length
        ? estadoEditor.nivel === 'aviso'
          ? 'aviso'
          : 'incompleto'
        : 'ok',
      avisos: avisosDe('donde'),
      abierta: avisosDe('donde').length > 0,
      contenido: (
        <>
          <div className="r7-coordenadas">
            <span className="r7-campo-etiqueta">Posición en el mapa</span>
            <code>
              {stage.lat != null && stage.lon != null
                ? `${Number(stage.lat).toFixed(5)}, ${Number(stage.lon).toFixed(5)}`
                : 'Sin posición'}
            </code>
            <small>Para moverlo, arrastra su pin en el mapa; el radio se dibuja alrededor.</small>
          </div>
                        {/* Radio GPS de aproximación */}
              {mode === 'game' && usesLocationRadius(selectedGame) ? (
                <label className="wide">
                  <span>📍 Radio de aproximación (metros)</span>
                  <input
                    type="number"
                    min={RADIO_MINIMO_M}
                    max={RADIO_MAXIMO_M}
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
                    min={RADIO_MINIMO_M}
                    max={RADIO_MAXIMO_M}
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
                    // Estos campos se GUARDAN con el nodo (ver stageFields.ts): id, nombre,
                    // cantidad y si se consume. `requires_item: false` quita el requisito.
                    if (val === 'none') {
                      onPatch({ required_item_id: '', requires_item: false, consume_required_item: false })
                    } else if (val === 'custom') {
                      onPatch({ required_item_id: 'item_requerido', requires_item: true, required_item_label: 'Objeto requerido' })
                    } else {
                      onPatch({ required_item_id: val, requires_item: true, required_item_label: requiredItemLabel(val) })
                    }
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
                  <input value={String(stage.required_item_id || '')} onChange={(event) => onPatch({ required_item_id: event.target.value, requires_item: Boolean(event.target.value), required_item_label: event.target.value })} />
                </label>
              ) : null}

              {stage.required_item_id ? (
                <label>
                  <span>Cantidad que hace falta</span>
                  <input
                    type="number"
                    min={1}
                    value={Math.max(1, Math.floor(Number(stage.required_item_quantity)) || 1)}
                    onChange={(event) =>
                      onPatch({ required_item_quantity: Math.max(1, Math.floor(Number(event.target.value)) || 1) })
                    }
                  />
                </label>
              ) : null}

              {stage.required_item_id ? (
                <label className="checkbox wide">
                  <input checked={Boolean(stage.consume_required_item)} type="checkbox" onChange={(event) => onPatch({ consume_required_item: event.target.checked })} />
                  <span>Consumir objeto al acceder (se retira de la mochila)</span>
                </label>
              ) : null}

        </>
      ),
    },
    ...(esCheckpoint
      ? []
      : ([
          {
            id: 'juego',
            titulo: 'Cómo se juega',
            icono: '🕹️',
            resumen:
              mode === 'game'
                ? `${selectedGame.title} · ${configKeys.length} ajustes`
                : tipoActual.title,
            nivel: avisosJuego.length ? 'incompleto' : 'ok',
            avisos: avisosJuego,
            abierta: !esCheckpoint,
            contenido: <>              {/* Ajustes específicos del Minijuego */}
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
                        ) : meta.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={String(config[key]) === 'true'}
                            onChange={(event) => patchConfig(key, event.target.checked ? 'true' : 'false')}
                          />
                        ) : key === 'clue_text' ? (
                          <textarea rows={3} value={formatConfigValue(config[key])} onChange={(event) => patchConfig(key, event.target.value)} />
                        ) : (
                          <input
                            type={meta.type === 'number' ? 'number' : 'text'}
                            {...(key === 'search_radius_m' ? { min: 150, max: 400 } : {})}
                            value={formatConfigValue(config[key])}
                            onChange={(event) => patchConfig(key, event.target.value)}
                          />
                        )}
                        <small>{meta.help}</small>
                      </label>
                    )
                  })}
                  {(() => {
                    const CustomEditor = CUSTOM_EDITOR_COMPONENTS[selectedGame.id]
                    if (!CustomEditor) return null
                    return (
                      <div className="wide saga-guided-v4-custom-editor">
                        <CustomEditor
                          key={selectedGame.id}
                          config={config}
                          onChange={(values) => onPatch({ config: { ...config, ...values } })}
                        />
                      </div>
                    )
                  })()}
                  {selectedGame.id === 'mapa_mudo' && (
                    <label className="wide">
                      <span>Foto de la pista (opcional)</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          void handleClueFile(event.target.files?.[0], event.currentTarget)
                        }
                      />
                      <small>JPG, PNG o WebP. Se recorta en cuadrado y se reduce hasta unos 380 KB. Reutiliza el mismo campo de foto que el resto de nodos (image_data_url); no hace falta ninguna foto para que el nodo funcione.</small>
                      {clueNotice ? (
                        <small
                          role={clueNotice.failed ? 'alert' : 'status'}
                          style={{ color: clueNotice.failed ? '#f87171' : '#7dd3fc', fontWeight: 700 }}
                        >
                          {clueNotice.failed ? '⚠️ ' : ''}
                          {clueNotice.text}
                        </small>
                      ) : null}
                      {typeof config.image_data_url === 'string' && config.image_data_url ? (
                        <img src={String(config.image_data_url)} alt="Vista previa de la foto de la pista" style={{ maxWidth: 160, marginTop: 8, borderRadius: 8 }} />
                      ) : null}
                    </label>
                  )}
                </>
              ) : null}
</>,
          },
        ] as SeccionDef[])),
    {
      id: 'historia',
      titulo: 'Historia y pistas',
      icono: '📜',
      resumen: `${
        stage.intro_title ? `Prólogo «${stage.intro_title}»` : 'Sin título de prólogo'
      } · ${textoPista ? 'con pista' : 'sin pista'}`,
      abierta: esCheckpoint,
      contenido: (
        <>
                        {mode === 'game' && (
                <>
                  <label className="r7-campo ancho">
                    <span className="r7-campo-etiqueta">Título del prólogo</span>
                    <input value={String(stage.intro_title || '')} onChange={(event) => onPatch({ intro_title: event.target.value })} placeholder="Ej: El antiguo manuscrito" />
                    <small>Sale en grande antes de jugar. Opcional.</small>
                  </label>
                  <CampoTexto
                    etiqueta="Texto del prólogo (narrativa)"
                    ayuda="Historia que se cuenta antes del reto."
                    valor={String(stage.intro_body || '')}
                    max={800}
                    filas={4}
                    placeholder="Texto introductorio antes de jugar..."
                    onCambio={(valor) => onPatch({ intro_body: valor })}
                  />
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
                <CampoTexto
                  etiqueta="Texto explicativo del nodo"
                  ayuda="Lo que lee el jugador al llegar. Frases cortas: lo lee de pie y con el móvil."
                  valor={textoDescripcion}
                  max={600}
                  filas={4}
                  onCambio={(valor) => onPatch({ content: valor, description: valor, body: valor })}
                />
              )}

              <CampoTexto
                etiqueta="💡 Pista del juego"
                ayuda="Aparece si el jugador se atasca."
                valor={textoPista}
                max={240}
                filas={2}
                onCambio={(valor) => onPatch({ messages: { ...(stage.messages || {}), hint: valor } })}
              />

        </>
      ),
    },
    {
      id: 'recompensas',
      titulo: 'Recompensas',
      icono: '🎁',
      resumen: premioActual ? `Entrega: ${premioActual}` : 'Sin objeto de premio',
      abierta: false,
      contenido: (
        <>
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

          <div className="r7-campo ancho">
            <RecompensaDeVestuario nodeId={String(stage.id ?? '')} />
          </div>
        </>
      ),
    },
    {
      id: 'avanzado',
      titulo: 'Avanzado',
      icono: '🛠️',
      resumen: codigoEmergencia
        ? `Código de emergencia ${codigoEmergencia}`
        : 'Sin código de emergencia',
      abierta: false,
      contenido: (
        <>
                        <CampoTexto
                etiqueta="Texto «Sin cobertura GPS»"
                ayuda="Se muestra cuando el móvil no consigue posición."
                valor={normalizeMessage(stage.messages?.gps_unavailable, selectedGame.messages.gps_unavailable)}
                max={240}
                filas={2}
                onCambio={(valor) => onPatch({ messages: { ...(stage.messages || {}), gps_unavailable: valor } })}
              />
              <CampoTexto
                etiqueta="Texto «Acceso bloqueado»"
                ayuda="Se muestra cuando todavía no se cumple el requisito de entrada."
                valor={normalizeMessage(stage.messages?.locked, selectedGame.messages.locked)}
                max={240}
                filas={2}
                onCambio={(valor) => onPatch({ messages: { ...(stage.messages || {}), locked: valor } })}
              />
              {/* «Mensaje de éxito al completar» se ha quitado: se guardaba en
                  `success_message`, que ningún código del servidor ni del móvil lee
                  (informe A5). El mensaje que sí llega al jugador tras superar un
                  juego es «Mensaje al recibir recompensa» (paso 2). */}

              {/* Se enseña SOLO lo que está guardado. Antes salía un `SAGA-NN`
                  inventado que no se guardaba: el organizador imprimía ese código y
                  el servidor no lo aceptaba. */}
              {(() => {
                const codigoGuardado = savedFallbackCode(stage)
                const sugerido = fallbackCode(stage)
                const ponerCodigo = (valor: string) =>
                  onPatch({
                    fallback_code: valor,
                    physical_fallback_code: valor,
                    config: { ...config, success_code: valor },
                  })
                return (
                  <label className="wide">
                    <span>🆘 Código SAGA de emergencia (Fallback)</span>
                    <input
                      value={codigoGuardado}
                      placeholder={`Sin código · por ejemplo ${sugerido}`}
                      onChange={(event) => ponerCodigo(event.target.value.toUpperCase())}
                    />
                    {codigoGuardado ? (
                      <small>
                        ✓ Este código se guarda con el nodo. Permite superarlo escribiéndolo a mano si
                        falla el GPS o la cámara (cuesta una penalización de tiempo).
                      </small>
                    ) : (
                      <small style={{ color: '#fbbf24' }}>
                        ⚠️ Sin código: si falla el GPS o la cámara, este nodo no tiene salida manual.{' '}
                        <button type="button" className="admin-inline-soft" onClick={() => ponerCodigo(sugerido)}>
                          Usar {sugerido}
                        </button>
                      </small>
                    )}
                  </label>
                )
              })()}

        </>
      ),
    },
  ]

  return (
    <NodeEditorFrame
      numero={Number(stage.index ?? 0) + 1}
      titulo={String(stage.title || '').replace(/^\d+\.\s*/, '')}
      onTitulo={(valor) => onPatch({ title: valor })}
      tipoIcono={String(tipoActual.icon)}
      tipoTexto={tipoActual.title}
      nivel={estadoEditor.nivel}
      motivos={estadoEditor.motivos}
      coordenadas={
        stage.lat != null && stage.lon != null
          ? `${Number(stage.lat).toFixed(5)}, ${Number(stage.lon).toFixed(5)}`
          : ''
      }
      estadoGuardado={estadoGuardado}
      onGuardar={onGuardar}
      onCerrar={finalizeAndClose}
      onEliminar={onDelete}
      onCambiarTipo={() => {
        if (onRequestChangeType) {
          onRequestChangeType()
        } else {
          onPatch({ _type_choice_done: false })
        }
      }}
      secciones={secciones}
      solicitud={solicitud}
      aviso={_notice}
      vistaPrevia={
        <MaquetaMovil
          titulo={displayTitle(stage)}
          tipo={tipoActual.title}
          tipoIcono={String(tipoActual.icon)}
          prologoTitulo={String(stage.intro_title || '')}
          prologo={String(stage.intro_body || '')}
          texto={mode === 'qr' ? '' : textoDescripcion}
          pista={textoPista}
          accion={mode === 'qr' ? 'Escanear el QR' : esCheckpoint ? 'Estoy aquí' : 'Empezar el reto'}
        />
      }
    />
  )
}

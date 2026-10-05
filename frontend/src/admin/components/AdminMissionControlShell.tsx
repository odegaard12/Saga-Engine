import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import AdminMissionMap from '../AdminMissionMap'
import ActivityPanel from './ActivityPanel'
import MatchLogPanel from './MatchLogPanel'
import DesbloqueablesPanel from './vestuario/DesbloqueablesPanel'
import TiemposPanel from './vestuario/TiemposPanel'
import FamiliesPanel from './FamiliesPanel'
import NodeDetailDrawer from './NodeDetailDrawer'
import NodePhysicalTypePanel from './NodePhysicalTypePanel'
import PlayersPanel from './PlayersPanel'
import SettingsPanel from './SettingsPanel'
import SimulationBenchPanel from './SimulationBenchPanel'
import MissionBuilderPanel from './MissionBuilderPanel'
import BarraDeNodos from './BarraDeNodos'
import ExportarPartidaPanel from './ExportarPartidaPanel'
import { instalarVistaTrasTeclado, reponerTrasTeclado } from '../../player/utils/vistaTrasTeclado'
import type {
  AdminProfileAction,
  AdminReactOverviewProfile,
  AdminReactOverviewStage,
} from '../lib/adminApi'
import { displayFamilyCards } from '../lib/displayFamilies'
import { validateStagesBeforeSave } from '../lib/adminSaveChecks'
import { describeAdminError } from '../lib/adminErrors'
import { fetchMissionBackup } from '../lib/adminApi'
import AdminModal from './AdminModal'
import type { MissionTemplateId } from '../lib/gameCatalog'
import type { PlayerDraft } from '../lib/playerDrafts'
import { useI18n } from '../../i18n/useI18n'
import ObjectsPanel from './ObjectsPanel'
import ReleaseNotesModal from './ReleaseNotesModal'
import { printAllQrs } from '../utils/printQrs'
import '../styles/admin-modern-shell.css'
// Después del anterior, a propósito: la piel de la ronda 5 (barras opacas,
// menú agrupado, barra de nodos y navegación del móvil) manda sobre él.
import '../styles/admin-r5.css'
import '../styles/admin-r7.css'
import '../styles/admin-r7-editor.css'
import '../styles/admin-r7-paneles.css'

type CmsPanel =
  | 'none'
  | 'players'
  | 'mission'
  | 'labels'
  | 'builder'
  | 'objects'
  | 'simulation'
  | 'activity'
  | 'match-log'
  | 'desbloqueables'
  | 'tiempos'
  | 'exportar'
type StandardSaveState = 'idle' | 'saving' | 'saved' | 'error'
type MissionSaveState = StandardSaveState | 'dirty'

type AdminMissionControlShellProps = {
  title: string
  subtitle: string
  profiles: AdminReactOverviewProfile[]
  stages: AdminReactOverviewStage[]
  familyCounts: Record<string, number>
  selectedStage: AdminReactOverviewStage | null
  cmsPanel: CmsPanel
  localNotice: string | null
  saveState: MissionSaveState
  saveError: string | null
  /** Hay algo sin guardar: nodos, jugadores o ajustes. */
  hasUnsavedWork: boolean
  /** Otra pestaña o persona guardó antes: el servidor rechazó el guardado (409). */
  saveConflict: boolean
  onReloadMission: () => void
  onDismissConflict: () => void
  onDownloadLocalChanges: () => void
  onLogout: () => void
  /** Fecha de salida guardada (vacía = sin fecha: el Registro de partida está apagado). */
  missionLaunchAt: string
  playerDrafts: PlayerDraft[]
  playerSaveState: StandardSaveState
  playerSaveError: string | null
  profileProgress: Record<string, { level: number | null; finished: boolean }>
  profileActionState: Record<string, string>
  profileActionError: Record<string, string>
  missionDraft: Record<string, string>
  settingsSaveState: StandardSaveState
  settingsSaveError: string | null
  onRefresh: () => void
  onSelectStage: (stage: AdminReactOverviewStage | null) => void
  onCreateNode: () => void
  onCreateNodeAt: (lat: number, lon: number) => void
  onInsertNodeAt?: (lat: number, lon: number, index: number) => void
  onMoveStage: (stage: AdminReactOverviewStage, lat: number, lon: number) => void
  onSetLegVia?: (stage: AdminReactOverviewStage, via: [number, number] | null) => void
  onSetLegTrack?: (stage: AdminReactOverviewStage, track: Array<[number, number]>) => void
  onApplyStage: (stage: AdminReactOverviewStage) => void
  onDeleteStage: (stage: AdminReactOverviewStage) => void
  onReorderStage: (stage: AdminReactOverviewStage, direction: 'up' | 'down') => void
  onSaveStages: () => void
  onSetCmsPanel: (panel: CmsPanel) => void
  onUpdatePlayer: (index: number, key: keyof PlayerDraft, value: string) => void
  onDeletePlayer: (index: number) => void
  onAddPlayer: () => void
  onSavePlayers: () => void
  onProfileAction: (profileId: string, action: AdminProfileAction) => void
  onUpdateMissionDraft: (key: string, value: string) => void
  onSaveSettings: () => void
  missionPassEnabled: boolean
  onClearMissionPass: () => void
  onApplyMissionTemplate: (templateId: MissionTemplateId) => void
  onCreateNodesWithItems?: (items: Array<{ id: string; label: string }>) => void
}

/** Una entrada del menú del admin: abre un panel o hace algo. */
type EntradaMenu = {
  id: string
  icono: string
  etiqueta: string
  panel?: CmsPanel
  accion?: () => void
  /** Sólo en el menú del móvil: en escritorio ya está en la barra de arriba. */
  soloMovil?: boolean
  activa?: boolean
  ocupada?: boolean
  titulo?: string
}

type GrupoMenu = {
  id: 'seguimiento' | 'contenido' | 'jugadores' | 'ajustes'
  titulo: string
  /** Nombre corto para la barra de abajo del móvil. */
  corto?: string
  icono: string
  entradas: EntradaMenu[]
}

export type RouteMetrics = {
  distanceKm: number
  trailKm: number
  elevationM: number
  durationMin: number
  mappedCount: number
  routeCoords: [number, number][]
  /** true cuando la distancia viene del router (camino real), no de la recta */
  measured?: boolean
}

function selectedStageKey(stage: AdminReactOverviewStage | null) {
  if (!stage) return ''
  return String(stage.id ?? stage.index)
}

function getUiBoolean(stage: AdminReactOverviewStage | null, key: string) {
  if (!stage) return false
  return Boolean((stage as unknown as Record<string, unknown>)[key])
}

export default function AdminMissionControlShell({
  title,
  subtitle,
  profiles,
  stages,
  familyCounts,
  selectedStage,
  cmsPanel,
  localNotice,
  saveState,
  saveError,
  hasUnsavedWork,
  saveConflict,
  onReloadMission,
  onDismissConflict,
  onDownloadLocalChanges,
  onLogout,
  missionLaunchAt,
  playerDrafts,
  playerSaveState,
  playerSaveError,
  profileProgress,
  profileActionState,
  profileActionError,
  missionDraft,
  settingsSaveState,
  settingsSaveError,
  onRefresh,
  onSelectStage,
  onCreateNode,
  onCreateNodeAt,
  onInsertNodeAt,
  onMoveStage,
  onSetLegVia,
  onSetLegTrack,
  onApplyStage,
  onDeleteStage,
  onReorderStage,
  onSaveStages,
  onSetCmsPanel,
  onUpdatePlayer,
  onDeletePlayer,
  onAddPlayer,
  onSavePlayers,
  onProfileAction,
  onUpdateMissionDraft,
  onSaveSettings,
  missionPassEnabled,
  onClearMissionPass,
  onApplyMissionTemplate,
  onCreateNodesWithItems,
}: AdminMissionControlShellProps) {
  const { t } = useI18n()
  const [typeChooserStageKey, setTypeChooserStageKey] = useState<string | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [freeShape, setFreeShape] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  /** Grupo del menú abierto en la barra de abajo del móvil (null = cerrado). */
  const [grupoMovil, setGrupoMovil] = useState<GrupoMenu['id'] | null>(null)

  // iPhone: al cerrar el teclado la pantalla se quedaba subida (mismo arreglo que el jugador).
  useEffect(() => instalarVistaTrasTeclado(), [])
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [saveValidationWarning, setSaveValidationWarning] = useState<string | null>(null)
  const [conflictCopyDownloaded, setConflictCopyDownloaded] = useState(false)

  // Al cerrar o recargar la pestaña con algo sin guardar, el navegador pregunta.
  // Antes solo miraba los NODOS (`saveState === 'dirty'`), y como el cajón de
  // edición nunca marcaba 'dirty', casi nunca saltaba; y no miraba jugadores ni
  // ajustes.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedWork])

  // El aviso de conflicto empieza sin copia descargada cada vez que aparece.
  useEffect(() => {
    if (!saveConflict) setConflictCopyDownloaded(false)
  }, [saveConflict])

  const handleRefreshClick = () => {
    if (hasUnsavedWork) {
      setShowUnsavedDialog(true)
    } else {
      onRefresh()
    }
  }
  const [pendingCreateLocation, setPendingCreateLocation] = useState<{
    lat: number
    lon: number
    clientX: number
    clientY: number
  } | null>(null)
  const [pendingPinQueue, setPendingPinQueue] = useState<
    Array<{ label: string; item: { id: string; label: string } }>
  >([])
  const [activePinIndex, setActivePinIndex] = useState(0)

  const liveSelectedStage = selectedStage
    ? stages.find((stage) => selectedStageKey(stage) === selectedStageKey(selectedStage)) ||
      stages.find((stage) => stage.index === selectedStage.index) ||
      selectedStage
    : null

  const selectedIndex = liveSelectedStage
    ? stages.findIndex((stage) => stage.index === liveSelectedStage.index)
    : -1

  const selectedKey = selectedStageKey(liveSelectedStage)

  const hasTypeAssigned = Boolean(
    liveSelectedStage &&
    (getUiBoolean(liveSelectedStage, '_type_choice_done') ||
      Boolean((liveSelectedStage as any).physical_node_kind) ||
      (liveSelectedStage as any).game_type ||
      (liveSelectedStage as any).config?.reward_item_id)
  )

  const shouldShowTypeChooser = Boolean(
    liveSelectedStage &&
    (typeChooserStageKey === selectedKey ||
      (typeof liveSelectedStage.id === 'string' &&
        liveSelectedStage.id.startsWith('local-') &&
        !hasTypeAssigned))
  )

  useEffect(() => {
    if (!liveSelectedStage) {
      setTypeChooserStageKey(null)
      return
    }

    if (
      typeof liveSelectedStage.id === 'string' &&
      liveSelectedStage.id.startsWith('local-') &&
      !hasTypeAssigned
    ) {
      setTypeChooserStageKey(selectedStageKey(liveSelectedStage))
    }
  }, [selectedKey, hasTypeAssigned])

  function handleCreateNodesWithItemsBatch(items: Array<{ id: string; label: string }>) {
    if (!onCreateNodesWithItems || !items.length) return

    setPendingPinQueue(items.map((item) => ({ label: item.label, item })))
    setActivePinIndex(0)

    // Place ONLY the 1st pin on the map
    onCreateNodesWithItems([items[0]])
  }

  function handleConfirmCurrentPin() {
    if (activePinIndex < pendingPinQueue.length - 1) {
      const nextIdx = activePinIndex + 1
      setActivePinIndex(nextIdx)
      const nextItem = (pendingPinQueue[nextIdx] as any)?.item

      if (nextItem && onCreateNodesWithItems) {
        onCreateNodesWithItems([nextItem])
      }
    } else {
      setPendingPinQueue([])
      setActivePinIndex(0)
      onSelectStage(null)
    }
  }

  const mappedCount = stages.filter(
    (stage) => typeof stage.lat === 'number' && typeof stage.lon === 'number'
  ).length

  const liveGeodesicDistanceKm = useMemo(() => {
    const ordered = [...stages]
      .filter(
        (stage): stage is AdminReactOverviewStage & { lat: number; lon: number } =>
          typeof stage.lat === 'number' && typeof stage.lon === 'number'
      )
      .sort((a, b) => a.index - b.index)

    if (ordered.length < 2) return 0

    let totalMeters = 0
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = L.latLng(ordered[i].lat, ordered[i].lon)
      const to = L.latLng(ordered[i + 1].lat, ordered[i + 1].lon)
      totalMeters += from.distanceTo(to)
    }
    return totalMeters / 1000
  }, [stages])

  const [metrics, setMetrics] = useState<RouteMetrics>({
    distanceKm: 0,
    trailKm: 0,
    elevationM: 0,
    durationMin: 0,
    mappedCount: 0,
    routeCoords: [],
  })
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [playCounter, setPlayCounter] = useState(0)
  const localStageCount = stages.length

  // La distancia mostrada es la del router (distancia real por camino) cuando
  // está disponible. Si no lo está, se muestra la distancia en línea recta tal
  // cual y se avisa en la barra: antes se enseñaba la recta multiplicada por
  // 1,32 (un número inventado) y quedaba congelada sin que se notase.
  // Distancia del trazado real (route_track). Se calcula AQUÍ, directamente de
  // los datos, sin depender de que el mapa avise: antes la barra dependía de
  // un efecto del mapa y si ese aviso no llegaba se quedaba en la recta.
  const gpxDistanceKm = useMemo(() => {
    const ordered = [...stages].sort((a, b) => a.index - b.index)
    if (ordered.length < 2) return null

    let total = 0
    for (let i = 1; i < ordered.length; i++) {
      const raw = (ordered[i] as unknown as Record<string, unknown>).route_track
      if (!Array.isArray(raw) || raw.length < 2) return null

      for (let k = 0; k < raw.length - 1; k++) {
        const a = raw[k] as [number, number]
        const b = raw[k + 1] as [number, number]
        if (!Array.isArray(a) || !Array.isArray(b)) return null
        total += L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1])) / 1000
      }
    }

    return total > 0 ? total : null
  }, [stages])

  const reportedKm =
    gpxDistanceKm !== null
      ? gpxDistanceKm
      : Number.isFinite(metrics.trailKm) && metrics.trailKm > 0
        ? metrics.trailKm
        : Number.isFinite(metrics.distanceKm) && metrics.distanceKm > 0
          ? metrics.distanceKm
          : null

  // Se muestra siempre el último valor reportado por el mapa (incluye los
  // caminos moldeados, por eso cambia en vivo al arrastrar una línea) y la
  // etiqueta dice si es la distancia real por camino o la línea recta.
  const displayDistanceKm = reportedKm ?? liveGeodesicDistanceKm ?? 0
  const distanceIsMeasured =
    gpxDistanceKm !== null || (reportedKm !== null && metrics.measured === true)

  const displayDurationMin =
    Number.isFinite(metrics.durationMin) && metrics.durationMin > 0
      ? metrics.durationMin
      : Math.round(displayDistanceKm * 15)

  const hasElevation = Number.isFinite(metrics.elevationM) && metrics.elevationM > 0
  const displayElevationM = hasElevation ? metrics.elevationM : null

  const handleRouteMetricsUpdate = (newMetrics: Partial<RouteMetrics>) => {
    setMetrics((prev) => {
      const updated = { ...prev, ...newMetrics }
      if (updated.routeCoords && updated.routeCoords.length > 0) {
        setRouteCoords(updated.routeCoords)
      }
      return updated
    })
  }

  function descargar(contenido: BlobPart, nombre: string, tipo: string) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function marcaDeTiempo() {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  }

  /**
   * Copia de respaldo de la misión entera.
   *
   * Antes este botón bajaba sólo un GPX con el trazado, que no permite
   * recuperar nada: si se pierde la tarjeta de la Raspberry se van con ella los
   * nodos, la configuración de cada juego, los textos, los jugadores y sus
   * fotos. Ahora baja un JSON con todo, y el GPX aparte para quien quiera abrir
   * la ruta en un GPS.
   */
  async function handleExportBackup() {
    if (exportando) return
    setExportando(true)
    setExportError(null)

    try {
      const copia = await fetchMissionBackup()

      if (copia.status !== 'ok') {
        throw new Error('El servidor no devolvió la copia.')
      }

      descargar(
        JSON.stringify(copia, null, 2),
        `saga-copia-${marcaDeTiempo()}.json`,
        'application/json'
      )

      // El GPX sale de la propia copia, así que los dos ficheros siempre
      // cuentan lo mismo.
      const puntos = Array.isArray(copia.route_track)
        ? (copia.route_track as Array<[number, number]>)
        : routeCoords

      if (puntos.length > 0) {
        let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n'
        gpx +=
          '<gpx version="1.1" creator="SAGA Engine" xmlns="http://www.topografix.com/GPX/1/1">\n'
        gpx += '  <trk>\n    <name>Ruta SAGA</name>\n    <trkseg>\n'
        puntos.forEach(([lat, lon]) => {
          gpx += `      <trkpt lat="${lat}" lon="${lon}"></trkpt>\n`
        })
        gpx += '    </trkseg>\n  </trk>\n</gpx>'
        descargar(gpx, `saga-ruta-${marcaDeTiempo()}.gpx`, 'application/gpx+xml')
      }
    } catch (err) {
      setExportError(describeAdminError(err, 'cargar'))
    } finally {
      setExportando(false)
    }
  }

  const barraComandosRef = useRef<HTMLDivElement>(null)
  const [posicionHud, setPosicionHud] = useState<{
    top: number
    centro: number
    ancho: number
  } | null>(null)
  useEffect(() => {
    const barra = barraComandosRef.current
    if (!barra) return undefined
    const medir = () => {
      const caja = barra.getBoundingClientRect()
      if (caja.width === 0) return
      setPosicionHud({
        top: Math.round(caja.bottom + 8),
        centro: Math.round(caja.left + caja.width / 2),
        ancho: Math.round(caja.width),
      })
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(barra)
    window.addEventListener('resize', medir)
    return () => {
      observador.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [])

  function togglePanel(panel: CmsPanel) {
    setGrupoMovil(null)
    if (cmsPanel === panel) reponerTrasTeclado()
    onSetCmsPanel(cmsPanel === panel ? 'none' : panel)
  }

  function cerrarPanel() {
    reponerTrasTeclado()
    onSetCmsPanel('none')
  }

  function normalizeCreatePopoverPoint(clientPoint?: { x: number; y: number }) {
    const width = typeof window !== 'undefined' ? window.innerWidth : 390
    const height = typeof window !== 'undefined' ? window.innerHeight : 760
    const rawX = clientPoint?.x ?? width / 2
    const rawY = clientPoint?.y ?? height / 2

    return {
      clientX: Math.min(Math.max(rawX, 82), Math.max(82, width - 82)),
      clientY: Math.min(Math.max(rawY, 112), Math.max(112, height - 126)),
    }
  }

  function requestCreateNodeAt(lat: number, lon: number, clientPoint?: { x: number; y: number }) {
    const point = normalizeCreatePopoverPoint(clientPoint)
    setPendingCreateLocation({ lat, lon, ...point })
  }

  function cancelPendingCreateNode() {
    setPendingCreateLocation(null)
  }

  function confirmPendingCreateNode() {
    if (!pendingCreateLocation) return
    onCreateNodeAt(pendingCreateLocation.lat, pendingCreateLocation.lon)
    setPendingCreateLocation(null)
  }

  // Único camino a «Guardar»: la barra lateral, la de arriba, el botón del
  // móvil y el aviso de «cambios sin guardar» pasan todos por aquí. Antes solo
  // el botón lateral comprobaba la misión; los otros la mandaban sin mirar.
  function handleSaveStages() {
    const warning = validateStagesBeforeSave(stages)
    if (warning) {
      setSaveValidationWarning(warning)
      window.setTimeout(() => setSaveValidationWarning(null), 12000)
      return
    }
    setSaveValidationWarning(null)
    onSaveStages()
  }

  function handleLogoutClick() {
    if (
      hasUnsavedWork &&
      !window.confirm(
        'Tienes cambios sin guardar. Si cierras la sesión se descartarán. ¿Cerrar la sesión igualmente?'
      )
    ) {
      return
    }
    onLogout()
  }

  // Lo que dice el botón de guardar. 'idle' es «recién cargado, nada que
  // guardar»; 'error' ya NO se disfraza de «✓ Guardado».
  const saveLabel =
    saveState === 'saving'
      ? '⏳ Guardando...'
      : saveState === 'dirty'
        ? '✏️ Sin guardar'
        : saveState === 'error'
          ? '⚠️ Error, reintentar'
          : saveState === 'saved'
            ? '✓ Guardado'
            : '✓ Sin cambios'

  // Un solo menú para el escritorio (barra lateral) y el móvil (barra de abajo).
  // Antes había tres sitios con botones repetidos —la barra lateral, la de
  // arriba y la del móvil— y en el móvil sólo cuatro de los once paneles.
  const panelEntrada = (panel: CmsPanel, icono: string, etiqueta: string): EntradaMenu => ({
    id: panel,
    panel,
    icono,
    etiqueta,
    activa: cmsPanel === panel,
  })
  const gruposMenu: GrupoMenu[] = [
    {
      id: 'seguimiento',
      titulo: 'Seguimiento',
      // En la barra de abajo del móvil «Seguimiento» no cabe a 375 px.
      corto: 'Partida',
      icono: '📡',
      entradas: [
        panelEntrada('activity', '📋', 'Actividad'),
        panelEntrada('match-log', '🕵️', 'Registro de partida'),
        panelEntrada('tiempos', '⏱️', 'Tiempos'),
        panelEntrada('exportar', '📦', 'Exportar partida'),
      ],
    },
    {
      id: 'contenido',
      titulo: 'Contenido',
      icono: '🗺️',
      entradas: [
        {
          id: 'add',
          icono: '➕',
          etiqueta: t('admin.addNode'),
          accion: onCreateNode,
          soloMovil: true,
        },
        panelEntrada('builder', '✨', t('admin.builder')),
        panelEntrada('labels', '🎮', 'Juegos'),
        panelEntrada('objects', '🎒', 'Objetos'),
        panelEntrada('desbloqueables', '🎁', 'Desbloqueables'),
      ],
    },
    {
      id: 'jugadores',
      titulo: 'Jugadores',
      icono: '👥',
      entradas: [
        panelEntrada('players', '👥', t('admin.players')),
        panelEntrada('simulation', '🧪', 'Simular'),
      ],
    },
    {
      id: 'ajustes',
      titulo: 'Ajustes',
      icono: '⚙️',
      entradas: [
        panelEntrada('mission', '⚙️', t('admin.settings')),
        {
          id: 'refresh',
          icono: '🔄',
          etiqueta: t('admin.refresh'),
          accion: handleRefreshClick,
          soloMovil: true,
        },
        {
          id: 'heatmap',
          icono: '🔥',
          etiqueta: showHeatmap ? 'Ocultar rastros' : 'Ver rastros',
          accion: () => setShowHeatmap((valor) => !valor),
          activa: showHeatmap,
          soloMovil: true,
        },
        {
          id: 'forma',
          icono: freeShape ? '✏️' : '🔗',
          etiqueta: freeShape ? 'Trazado: libre' : 'Trazado: caminos',
          accion: () => setFreeShape((valor) => !valor),
          activa: freeShape,
          soloMovil: true,
        },
        {
          id: 'copia',
          icono: '⬇️',
          etiqueta: exportando
            ? 'Exportando…'
            : exportError
              ? 'Reintentar copia'
              : 'Copia de respaldo',
          accion: () => void handleExportBackup(),
          ocupada: exportando,
          titulo:
            exportError ||
            'Copia de respaldo con nodos, juegos, historia, jugadores y trazado (+ el GPX aparte)',
        },
        {
          id: 'novedades',
          icono: '📜',
          etiqueta: 'Novedades',
          accion: () => setShowReleaseNotes(true),
        },
        {
          id: 'salir',
          icono: '🔒',
          etiqueta: 'Cerrar sesión',
          accion: handleLogoutClick,
          soloMovil: true,
        },
      ],
    },
  ]

  function pulsarEntrada(entrada: EntradaMenu) {
    if (entrada.panel) {
      togglePanel(entrada.panel)
      return
    }
    setGrupoMovil(null)
    entrada.accion?.()
  }

  const grupoDelPanel = gruposMenu.find((grupo) =>
    grupo.entradas.some((entrada) => entrada.panel && entrada.panel === cmsPanel)
  )?.id
  const grupoMovilAbierto = gruposMenu.find((grupo) => grupo.id === grupoMovil) || null

  const displayTitle = cleanAdminCopy(title, 'SAGA Engine')
  const displaySubtitle = cleanAdminCopy(subtitle, 'Mission Control')

  return (
    <main
      className={selectedStage ? 'saga-admin-shell has-node-editor' : 'saga-admin-shell'}
      aria-label="SAGA Engine admin mission control"
      style={
        posicionHud
          ? ({ '--saga-cmd-abajo': `${posicionHud.top}px` } as React.CSSProperties)
          : undefined
      }
    >
      <aside className="saga-left-rail" aria-label="Mission navigation">
        <div className="saga-rail-brand">
          <span className="saga-brand-mark">⚡</span>
          <div>
            <strong>SAGA Engine</strong>
            <small>Mission Control</small>
          </div>
        </div>

        <section className="saga-mission-card">
          <span className="saga-eyebrow">{t('admin.liveMission')}</span>
          <h1>{displayTitle}</h1>
          <p>{displaySubtitle}</p>

          <div className="saga-mini-stats">
            <span>
              <b>{stages.length}</b> {t('admin.nodes')}
            </span>
            <span>
              <b>{profiles.length}</b> {t('admin.profiles')}
            </span>
            <span>
              <b>{mappedCount}</b> {t('admin.mapped')}
            </span>
          </div>
        </section>

        {saveValidationWarning ? (
          <div className="saga-save-validation-warning" role="alert">
            <b>⚠️ Misión incompleta</b>
            <p>{saveValidationWarning}</p>
          </div>
        ) : null}

        {/* Un guardado que falla se VE: antes `saveError` se guardaba en el
            estado y nunca se pintaba, y el botón seguía diciendo «Guardado». */}
        {saveState === 'error' && saveError ? (
          <div className="saga-save-validation-warning" role="alert">
            <b>⚠️ No se ha podido guardar</b>
            <p>{saveError}</p>
            <button type="button" onClick={handleSaveStages}>
              Reintentar
            </button>
          </div>
        ) : null}

        {/*
          Menú por grupos (Seguimiento, Contenido, Jugadores, Ajustes). Añadir
          nodo, Guardar y Recargar ya NO se repiten aquí: están en la barra de
          arriba. La lista de nodos pasó a la barra horizontal de abajo.
        */}
        <nav className="saga-panel-switcher saga-menu-agrupado" aria-label="Menú del admin">
          {gruposMenu.map((grupo) => (
            <div key={grupo.id} className="saga-menu-grupo">
              <span className="saga-menu-titulo">{grupo.titulo}</span>
              <div className="saga-menu-botones">
                {grupo.entradas
                  .filter((entrada) => !entrada.soloMovil)
                  .map((entrada) => (
                    <button
                      key={entrada.id}
                      type="button"
                      className={entrada.activa ? 'active' : ''}
                      aria-pressed={entrada.panel ? Boolean(entrada.activa) : undefined}
                      disabled={entrada.ocupada}
                      title={entrada.titulo || entrada.etiqueta}
                      onClick={() => pulsarEntrada(entrada)}
                    >
                      <span aria-hidden="true">{entrada.icono}</span>
                      <span className="saga-menu-etiqueta">{entrada.etiqueta}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="saga-rail-pie">
          <button
            type="button"
            className="saga-ghost-action"
            onClick={handleLogoutClick}
            title="Cierra la sesión de administración de este navegador"
          >
            🔒 Cerrar sesión
          </button>
        </div>
      </aside>

      <section className="saga-map-workspace" aria-label="Map workspace">
        <div className="saga-command-bar" ref={barraComandosRef}>
          <div className="saga-command-main">
            <button
              type="button"
              className="saga-command-primary saga-admin-add-node-action"
              onClick={onCreateNode}
            >
              {t('admin.addNode')}
            </button>
            <button
              type="button"
              className="saga-cmd-guardar"
              data-state={saveState}
              onClick={handleSaveStages}
              disabled={saveState === 'saving'}
            >
              {saveLabel}
            </button>
            <button type="button" onClick={handleRefreshClick}>
              {t('admin.refresh')}
            </button>
            <button
              type="button"
              id="admin-heatmap-toggle"
              className={showHeatmap ? 'saga-heatmap-toggle active' : 'saga-heatmap-toggle'}
              onClick={() => setShowHeatmap(!showHeatmap)}
              title="Ver heatmap de rastros de jugadores en el mapa"
            >
              {showHeatmap ? '🔥 Ocultar Rastros' : '🔥 Ver Rastros'}
            </button>

            <button
              type="button"
              className={freeShape ? 'saga-cmd-forma active' : 'saga-cmd-forma'}
              aria-pressed={freeShape}
              onClick={() => setFreeShape((value) => !value)}
              title={
                freeShape
                  ? 'Modo libre: arrastra los picos del trazado uno a uno'
                  : 'Modo normal: arrastra la línea y se ajusta a los caminos'
              }
            >
              {freeShape ? '✏️ Modo libre' : '🔗 Modo normal'}
            </button>
          </div>

          <div className="saga-family-chips" aria-label="Family counts">
            {displayFamilyCards.map((family) => (
              <span key={family.id} title={family.title}>
                {family.icon} {familyCounts[family.id] || 0}
              </span>
            ))}
          </div>
        </div>

        {/* Centered Route Metrics HUD Bar Floating Below Command Bar */}
        <div
          className="saga-centered-route-hud"
          style={{
            /**
             * Debajo de la barra de botones y centrada en el hueco del mapa,
             * midiendo la barra de verdad (en el móvil la coloca la hoja de estilos).
             */
            top: posicionHud ? posicionHud.top : 75,
            left: posicionHud ? posicionHud.centro : '50%',
            maxWidth: posicionHud ? posicionHud.ancho : undefined,
          }}
        >
          <span className="saga-hud-titulo">🟢 RUTA SENDEROS</span>
          <span>
            📏 Distancia: <strong className="saga-hud-km">{displayDistanceKm.toFixed(2)} km</strong>
            <span
              className={distanceIsMeasured ? 'saga-hud-fuente medida' : 'saga-hud-fuente'}
              title={
                distanceIsMeasured
                  ? 'Distancia real por camino, calculada por el router peatonal'
                  : 'Sin respuesta del router: distancia en línea recta entre nodos'
              }
            >
              {gpxDistanceKm !== null ? 'GPS' : distanceIsMeasured ? 'CAMIÑO' : 'RECTA'}
            </span>
          </span>
          <span className="saga-hud-sep" aria-hidden="true">
            |
          </span>
          <span>
            ⏱️ Tiempo:{' '}
            <strong className="saga-hud-tiempo">
              {displayDurationMin >= 60
                ? `${Math.floor(displayDurationMin / 60)}h ${displayDurationMin % 60}m`
                : `${displayDurationMin} min`}
            </strong>
          </span>
          <span className="saga-hud-sep" aria-hidden="true">
            |
          </span>
          <span>
            ⛰️ Desnivel:{' '}
            <strong className="saga-hud-desnivel">
              {displayElevationM === null ? '—' : `+${displayElevationM}m`}
            </strong>
          </span>
          <span className="saga-hud-sep" aria-hidden="true">
            |
          </span>
          <span>
            📍 <strong>{localStageCount} Nodos</strong>
          </span>
          <button
            type="button"
            className="saga-hud-play"
            onClick={() => setPlayCounter((c) => c + 1)}
            title="Reproducir recorrido"
          >
            ▶️ PLAY
          </button>
        </div>

        <div className="saga-map-frame">
          <AdminMissionMap
            stages={stages}
            selectedStage={selectedStage}
            onSelectStage={onSelectStage}
            onCreateStageAt={requestCreateNodeAt}
            onInsertStageAt={onInsertNodeAt}
            onMoveStage={onMoveStage}
            onSetLegVia={onSetLegVia}
            onSetLegTrack={onSetLegTrack}
            freeShape={freeShape}
            showHeatmap={showHeatmap}
            onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
            onMetricsUpdate={handleRouteMetricsUpdate}
            playRouteTrigger={playCounter}
          />
        </div>

        <BarraDeNodos
          stages={stages}
          selectedStage={liveSelectedStage}
          onSelectStage={(stage) => {
            setGrupoMovil(null)
            onSelectStage(stage)
          }}
          onReorderStage={onReorderStage}
          onPrintQrs={() => printAllQrs(stages)}
          onCreateNode={onCreateNode}
          textoVacio={t('admin.emptyRouteHelp')}
          sinTitulo={t('admin.untitledNode')}
        />

        {pendingPinQueue.length > 0 ? (
          <div className="saga-pin-placement-banner">
            <div className="saga-pin-placement-info">
              <span className="saga-pin-badge">
                📍 Chincheta {activePinIndex + 1} de {pendingPinQueue.length} ({activePinIndex}/
                {pendingPinQueue.length} confirmadas)
              </span>
              <strong style={{ fontSize: '14px', color: '#f8fafc' }}>
                {pendingPinQueue[activePinIndex]?.label}
              </strong>
              <small style={{ fontSize: '11px', color: '#94a3b8' }}>
                Arrastra la chincheta en el mapa a su posición real
              </small>
            </div>
            <button
              type="button"
              className="saga-pin-confirm-btn"
              onClick={handleConfirmCurrentPin}
            >
              ✅ Confirmar ubicación ({activePinIndex}/{pendingPinQueue.length})
            </button>
          </div>
        ) : null}

        {showReleaseNotes ? <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} /> : null}
        {pendingCreateLocation ? (
          <>
            <button
              type="button"
              className="saga-map-create-scrim"
              aria-label="Descartar creación de nodo"
              onClick={cancelPendingCreateNode}
            />
            <section
              className="saga-map-create-mini"
              role="dialog"
              aria-modal="true"
              aria-label="Crear nodo aquí"
              style={{ left: pendingCreateLocation.clientX, top: pendingCreateLocation.clientY }}
            >
              <strong>📍 ¿Crear nuevo nodo aquí?</strong>
              <small>
                Coordenadas: {pendingCreateLocation.lat.toFixed(5)},{' '}
                {pendingCreateLocation.lon.toFixed(5)}
              </small>
              <div>
                <button
                  type="button"
                  onClick={confirmPendingCreateNode}
                  style={{ fontWeight: 800 }}
                >
                  ➕ Crear Nodo
                </button>
                <button type="button" onClick={cancelPendingCreateNode}>
                  Cancelar
                </button>
              </div>
            </section>
          </>
        ) : null}

        {localNotice ? (
          <div className="saga-toast" role="status">
            {localNotice}
          </div>
        ) : null}
      </section>

      {liveSelectedStage && pendingPinQueue.length === 0 ? (
        <aside className="saga-node-editor-host is-open" aria-label="Editor de nodo">
          {shouldShowTypeChooser ? (
            <div className="saga-node-type-choice-screen">
              <NodePhysicalTypePanel
                stage={liveSelectedStage}
                chooserOnly
                onApplyLocal={(nextStage) => {
                  onApplyStage({
                    ...(nextStage as unknown as Record<string, unknown>),
                    _type_choice_done: true,
                  } as unknown as AdminReactOverviewStage)
                }}
                onFinishChoice={() => setTypeChooserStageKey(null)}
                onDeleteLocal={onDeleteStage}
              />
            </div>
          ) : (
            <NodeDetailDrawer
              stage={liveSelectedStage}
              stages={stages}
              onClose={() => onSelectStage(null)}
              onApplyLocal={onApplyStage}
              onDeleteLocal={onDeleteStage}
              estadoGuardado={saveState}
              onGuardar={handleSaveStages}
              onRequestChangeType={() =>
                setTypeChooserStageKey(selectedStageKey(liveSelectedStage))
              }
            />
          )}
        </aside>
      ) : null}

      {cmsPanel !== 'none' ? (
        <aside className="saga-floating-panel" aria-label="CMS panel">
          <div className="saga-floating-head">
            <strong>
              {cmsPanel === 'players'
                ? t('admin.players')
                : cmsPanel === 'labels'
                  ? t('admin.families')
                  : cmsPanel === 'builder'
                    ? t('admin.builder')
                    : cmsPanel === 'objects'
                      ? 'Objetos y Recetas'
                      : cmsPanel === 'simulation'
                        ? 'Banco de pruebas'
                        : cmsPanel === 'activity'
                          ? 'Actividad'
                          : cmsPanel === 'match-log'
                            ? 'Registro de partida'
                            : cmsPanel === 'desbloqueables'
                              ? 'Desbloqueables'
                              : cmsPanel === 'tiempos'
                                ? 'Tiempos de la clasificación'
                                : cmsPanel === 'exportar'
                                  ? 'Exportar partida'
                                  : t('admin.settings')}
            </strong>
            <button type="button" className="saga-floating-cerrar" onClick={cerrarPanel}>
              {t('common.close')}
            </button>
          </div>

          <div className="saga-floating-body">
            {cmsPanel === 'builder' ? (
              <MissionBuilderPanel
                stages={stages}
                onCreateNode={() => {
                  onSetCmsPanel('none')
                  onCreateNode()
                }}
                onApplyTemplate={onApplyMissionTemplate}
              />
            ) : null}

            {cmsPanel === 'players' ? (
              <PlayersPanel
                playerDrafts={playerDrafts}
                playerSaveState={playerSaveState}
                playerSaveError={playerSaveError}
                profiles={profiles}
                stages={stages}
                profileProgress={profileProgress}
                profileActionState={profileActionState}
                profileActionError={profileActionError}
                onProfileAction={onProfileAction}
                onUpdatePlayer={onUpdatePlayer}
                onDeletePlayer={onDeletePlayer}
                onAddPlayer={onAddPlayer}
                onSavePlayers={onSavePlayers}
              />
            ) : null}

            {cmsPanel === 'labels' ? <FamiliesPanel /> : null}

            {cmsPanel === 'objects' ? (
              <ObjectsPanel
                stages={stages}
                onSelectStage={onSelectStage}
                onCreateNodesWithItems={handleCreateNodesWithItemsBatch}
              />
            ) : null}

            {cmsPanel === 'mission' ? (
              <SettingsPanel
                missionDraft={missionDraft}
                settingsSaveState={settingsSaveState}
                settingsSaveError={settingsSaveError}
                onUpdateMissionDraft={onUpdateMissionDraft}
                onSaveSettings={onSaveSettings}
                missionPassEnabled={missionPassEnabled}
                onClearMissionPass={onClearMissionPass}
              />
            ) : null}

            {cmsPanel === 'simulation' ? <SimulationBenchPanel /> : null}

            {cmsPanel === 'activity' ? <ActivityPanel /> : null}

            {cmsPanel === 'match-log' ? <MatchLogPanel missionLaunchAt={missionLaunchAt} /> : null}

            {cmsPanel === 'desbloqueables' ? <DesbloqueablesPanel /> : null}

            {cmsPanel === 'tiempos' ? <TiemposPanel /> : null}

            {cmsPanel === 'exportar' ? <ExportarPartidaPanel /> : null}
          </div>
        </aside>
      ) : null}

      {grupoMovilAbierto ? (
        <>
          <button
            type="button"
            className="saga-hoja-grupo-velo"
            aria-label="Cerrar el menú"
            onClick={() => setGrupoMovil(null)}
          />
          <section className="saga-hoja-grupo" role="dialog" aria-label={grupoMovilAbierto.titulo}>
            <header>
              <strong>
                {grupoMovilAbierto.icono} {grupoMovilAbierto.titulo}
              </strong>
              <button type="button" onClick={() => setGrupoMovil(null)} aria-label="Cerrar">
                ✕
              </button>
            </header>
            <div className="saga-hoja-grupo-lista">
              {grupoMovilAbierto.entradas.map((entrada) => (
                <button
                  key={entrada.id}
                  type="button"
                  className={entrada.activa ? 'active' : ''}
                  disabled={entrada.ocupada}
                  title={entrada.titulo || entrada.etiqueta}
                  onClick={() => pulsarEntrada(entrada)}
                >
                  <span aria-hidden="true">{entrada.icono}</span>
                  <span>{entrada.etiqueta}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <nav className="saga-nav-movil" aria-label="Menú del admin (móvil)">
        <button
          type="button"
          className="saga-nav-movil-guardar"
          data-state={saveState}
          onClick={handleSaveStages}
          disabled={saveState === 'saving'}
        >
          <span aria-hidden="true">💾</span>
          <span>
            {saveState === 'saving'
              ? 'Guardando'
              : saveState === 'dirty'
                ? 'Guardar'
                : saveState === 'error'
                  ? 'Reintentar'
                  : t('common.save')}
          </span>
        </button>
        {gruposMenu.map((grupo) => (
          <button
            key={grupo.id}
            type="button"
            className={grupoMovil === grupo.id || grupoDelPanel === grupo.id ? 'active' : ''}
            aria-expanded={grupoMovil === grupo.id}
            onClick={() => setGrupoMovil(grupoMovil === grupo.id ? null : grupo.id)}
          >
            <span aria-hidden="true">{grupo.icono}</span>
            <span>{grupo.corto || grupo.titulo}</span>
          </button>
        ))}
      </nav>

      {showUnsavedDialog ? (
        <AdminModal
          title="⚠️ Cambios sin guardar"
          onClose={() => setShowUnsavedDialog(false)}
          actions={[
            {
              label: '💾 Guardar cambios',
              tone: 'primary',
              onClick: () => {
                setShowUnsavedDialog(false)
                handleSaveStages()
              },
            },
            {
              label: 'Recargar y perder mis cambios',
              tone: 'danger',
              onClick: () => {
                setShowUnsavedDialog(false)
                onRefresh()
              },
            },
            { label: 'Cancelar', tone: 'ghost', onClick: () => setShowUnsavedDialog(false) },
          ]}
        >
          Tienes nodos movidos, jugadores o ajustes de la misión sin guardar. Si recargas desde el
          servidor, se perderán los cambios de los nodos (los borradores de jugadores y ajustes se
          conservan).
        </AdminModal>
      ) : null}

      {saveConflict ? (
        <AdminModal
          title="⚠️ La misión ha cambiado en el servidor"
          actions={[
            {
              label: '⬇️ Descargar mis cambios (JSON)',
              tone: 'primary',
              onClick: () => {
                onDownloadLocalChanges()
                setConflictCopyDownloaded(true)
              },
            },
            {
              label: 'Recargar la misión (se pierden mis cambios)',
              tone: 'danger',
              onClick: () => {
                if (
                  !conflictCopyDownloaded &&
                  !window.confirm(
                    'No has descargado tus cambios. Si recargas, se perderán. ¿Recargar igualmente?'
                  )
                ) {
                  return
                }
                onReloadMission()
              },
            },
            { label: 'Seguir editando sin guardar', tone: 'ghost', onClick: onDismissConflict },
          ]}
        >
          Otra pestaña u otra persona ha guardado la misión desde que la cargaste. NO se ha guardado
          nada, para no pisar sus cambios. Descarga tus cambios si quieres conservarlos, recarga la
          misión y vuelve a aplicarlos.
        </AdminModal>
      ) : null}
    </main>
  )
}

function isPhysicalNode(stage: AdminReactOverviewStage | null) {
  if (!stage) return false

  const record = stage as AdminReactOverviewStage & {
    physical_node_kind?: string
    physical_item_kind?: string
    physical_qr?: { kind?: string }
    is_map_collectible?: boolean
    config?: { is_map_collectible?: boolean }
  }

  if (record.is_map_collectible || record.config?.is_map_collectible) {
    return false
  }

  const kind = record.physical_node_kind || record.physical_item_kind || record.physical_qr?.kind

  return kind === 'collectible' || kind === 'requirement' || kind === 'clue' || kind === 'bonus'
}

function cleanAdminCopy(value: string, fallback: string) {
  const normalized = value.trim()
  if (!normalized) return fallback
  if (/^PUT ADMIN (TITLE|SUBTITLE) HERE$/i.test(normalized)) return fallback
  return normalized
}

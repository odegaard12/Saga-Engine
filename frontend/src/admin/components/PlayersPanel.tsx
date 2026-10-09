import { useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  fetchDatosPersonales,
  purgeDatosPersonales,
  type AdminDatosPersonalesConteo,
  type AdminProfileAction,
  type AdminReactOverviewProfile,
  type AdminReactOverviewStage,
} from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'
import { RetratoDePersonaje } from './RetratoDePersonaje'
import { estaSinActividad, textoSinJugadores, type FiltroDeJugadores } from '../lib/adminRouteGuards'
import {
  findDuplicatePlayerIds,
  isPlayerIdChanged,
  savedPlayerId,
  type PlayerDraft,
} from '../lib/playerDrafts'
import { getPlayerInitials, getStablePlayerColor } from '../../shared/playerIdentity'

const AVATAR_CANVAS_SIZE = 160

function shortAvatarValue(value: string): string {
  if (!value) return ''
  if (value.startsWith('data:image/')) {
    return `${Math.round(value.length / 1024)} KB · data:image`
  }
  if (value.length > 72) return `${value.slice(0, 54)}…${value.slice(-12)}`
  return value
}

function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen.'))
      return
    }

    const reader = new FileReader()

    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = () => {
      const image = new Image()

      image.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = AVATAR_CANVAS_SIZE
        canvas.height = AVATAR_CANVAS_SIZE

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas no disponible.'))
          return
        }

        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, AVATAR_CANVAS_SIZE, AVATAR_CANVAS_SIZE)

        const scale = Math.max(AVATAR_CANVAS_SIZE / image.width, AVATAR_CANVAS_SIZE / image.height)
        const width = image.width * scale
        const height = image.height * scale
        const x = (AVATAR_CANVAS_SIZE - width) / 2
        const y = (AVATAR_CANVAS_SIZE - height) / 2

        ctx.drawImage(image, x, y, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }

      image.src = String(reader.result || '')
    }

    reader.readAsDataURL(file)
  })
}

type PlayersPanelProps = {
  playerDrafts: PlayerDraft[]
  profiles?: AdminReactOverviewProfile[]
  stages?: AdminReactOverviewStage[]
  playerSaveState: 'idle' | 'saving' | 'saved' | 'error'
  playerSaveError: string | null
  profileProgress: Record<string, { level: number | null; finished: boolean }>
  profileActionState: Record<string, string>
  profileActionError: Record<string, string>
  onUpdatePlayer: (index: number, key: keyof PlayerDraft, value: string) => void
  onDeletePlayer: (index: number) => void
  onAddPlayer: () => void
  onSavePlayers: () => void
  onProfileAction: (profileId: string, action: AdminProfileAction) => void
}

/**
 * Lo que dice el panel al terminar una acción sobre un jugador. Ninguna llega
 * al móvil en el acto: el servidor cambia SU copia y el móvil la adopta en su
 * próxima conexión (baja o sube el nivel, vacía la mochila...). Decir que ya estaba
 * «aplicado» hacía creer al organizador que el jugador ya lo tenía (informe A11).
 */
const ETIQUETA_ACCION_HECHA: Record<string, string> = {
  level_prev: 'un nodo atrás',
  restore_node: 'nodo restaurado',
  level_next: 'un nodo adelante',
  reset_profile: 'partida reiniciada',
  mark_finished: 'partida finalizada',
  clear_inventory: 'mochila vaciada',
  give_item: 'objeto entregado',
  remove_item: 'objeto retirado',
}

/**
 * El estado de una acción es su nombre mientras está en curso, `saved:<acción>`
 * al terminar bien y `error` si falla: solo lo primero cuenta como «ocupado».
 */
function isActionInFlight(raw: string) {
  return Boolean(raw) && raw !== 'error' && !raw.startsWith('saved')
}

/**
 * Los objetos que reparte la ruta, para «Dar objeto»: los coleccionables Y los
 * premios de los minijuegos (`reward_item_id`). Antes sólo salían los primeros,
 * así que el premio de un minijuego no se podía dar sin escribir su id a mano.
 */
function objetosQueRepartirLaRuta(stages: AdminReactOverviewStage[]): Array<{ id: string; label: string }> {
  const vistos = new Map<string, string>()
  for (const stage of stages) {
    const fisico = String(stage.physical_item_id || '').trim()
    if (fisico && !vistos.has(fisico)) vistos.set(fisico, String(stage.physical_item_label || fisico))
    const config = ((stage as unknown as { config?: Record<string, unknown> }).config || {}) as Record<string, unknown>
    const premio = String(config.reward_item_id || '').trim()
    if (premio && !vistos.has(premio)) vistos.set(premio, String(config.reward_item_label || premio))
  }
  return [...vistos].map(([id, label]) => ({ id, label }))
}

export default function PlayersPanel({
  playerDrafts,
  profiles = [],
  stages = [],
  playerSaveState,
  playerSaveError,
  profileProgress,
  profileActionState,
  profileActionError,
  onUpdatePlayer,
  onDeletePlayer,
  onAddPlayer,
  onSavePlayers,
  onProfileAction,
}: PlayersPanelProps) {
  /** Ficha desplegada, o null si están todas plegadas. */
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null)

  // IDs que salen más de una vez en los borradores (el servidor descartaría en
  // silencio todas las fichas repetidas menos la primera).
  const duplicatedIds = findDuplicatePlayerIds(playerDrafts)

  // Datos personales: fotos de campo y posiciones GPS de gente real. Es
  // global -no de un jugador concreto-, por eso vive aparte de las fichas.
  const [conteoPersonales, setConteoPersonales] = useState<AdminDatosPersonalesConteo | null>(null)
  const [borradoPersonales, setBorradoPersonales] = useState<{ fotos: number; imagenes: number; posiciones_gps: number } | null>(null)
  const [cargandoPersonales, setCargandoPersonales] = useState(false)
  const [avisoPersonales, setAvisoPersonales] = useState('')

  async function verDatosPersonales() {
    setCargandoPersonales(true)
    setAvisoPersonales('')
    setBorradoPersonales(null)
    try {
      const respuesta = await fetchDatosPersonales()
      if (respuesta.status === 'ok' && respuesta.datos) {
        setConteoPersonales(respuesta.datos)
      } else {
        setAvisoPersonales(respuesta.detail || 'No se pudo consultar.')
      }
    } catch (error) {
      setAvisoPersonales(describeAdminError(error, 'cargar'))
    } finally {
      setCargandoPersonales(false)
    }
  }

  async function borrarDatosPersonales() {
    if (!conteoPersonales) return
    const resumen =
      `Se van a borrar ${conteoPersonales.fotos} fotos (${conteoPersonales.ficheros_de_imagen} ficheros) ` +
      `y ${conteoPersonales.posiciones_gps} posiciones GPS de jugadores reales. ` +
      `La misión, los nodos y el progreso NO se tocan. Esto no se puede deshacer.`
    // Borra fotos de personas reales y sin vuelta atrás: un "Aceptar" por
    // descuido no basta, hay que escribirlo.
    const escrito = window.prompt(`${resumen}

Para confirmar, escribe BORRAR:`)
    if ((escrito || '').trim().toUpperCase() !== 'BORRAR') return

    setCargandoPersonales(true)
    setAvisoPersonales('')
    try {
      const respuesta = await purgeDatosPersonales({ fotos: true, posiciones: true })
      if (respuesta.status === 'ok' && respuesta.borrado) {
        setBorradoPersonales(respuesta.borrado)
        setConteoPersonales(respuesta.queda || null)
      } else {
        setAvisoPersonales(respuesta.detail || 'No se pudo borrar.')
      }
    } catch (error) {
      setAvisoPersonales(describeAdminError(error))
    } finally {
      setCargandoPersonales(false)
    }
  }

  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>, index: number) {
    const file = event.currentTarget.files?.[0]
    if (!file) return

    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      onUpdatePlayer(index, 'avatar_url', dataUrl)
      onUpdatePlayer(index, 'avatar_initials', '')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo cargar el avatar.')
    } finally {
      event.currentTarget.value = ''
    }
  }

  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroDeJugadores>('todos')
  const [menuFila, setMenuFila] = useState<number | null>(null)

  const perfilVivo = (draft: PlayerDraft) =>
    profiles.find((p) => String(p.id) === String(draft.id || draft.display_name))

  const filas = playerDrafts
    .map((draft, index) => ({ draft, index, vivo: perfilVivo(draft) }))
    .filter(({ draft, vivo }) => {
      const texto = `${draft.display_name} ${draft.id} ${draft.members}`.toLowerCase()
      if (busqueda.trim() && !texto.includes(busqueda.trim().toLowerCase())) return false
      if (filtro === 'solo') return draft.mode !== 'team'
      if (filtro === 'team') return draft.mode === 'team'
      if (filtro === 'vivo') return vivo?.presence === 'live'
      if (filtro === 'fin') return Boolean(profileProgress[draft.id]?.finished)
      if (filtro === 'inactivo')
        return estaSinActividad(vivo?.last_seen, Boolean(profileProgress[draft.id]?.finished))
      return true
    })

  const ETIQUETA_PRESENCIA: Record<string, string> = {
    live: 'En vivo',
    stale: 'Hace un rato',
    offline: 'Sin conexión',
  }

  function textoTiempo(valor: number | string | null | undefined): string {
    if (valor === null || valor === undefined || valor === '') return ''
    const marca = typeof valor === 'number' ? valor * (valor < 1e12 ? 1000 : 1) : Date.parse(String(valor))
    if (!Number.isFinite(marca)) return ''
    const segundos = Math.max(0, Math.round((Date.now() - marca) / 1000))
    if (segundos < 90) return 'ahora'
    if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`
    if (segundos < 86400) return `hace ${Math.round(segundos / 3600)} h`
    return `hace ${Math.round(segundos / 86400)} d`
  }

  function renderFicha(draft: PlayerDraft, index: number) {
    return (
      <>
              {(() => {
                /**
                 * Acción EN CURSO, si la hay.
                 *
                 * Ojo: al terminar bien, el estado pasa a 'saved', y tratarlo
                 * como ocupado dejaba todos los botones del jugador muertos
                 * hasta recargar la página. Sólo cuentan los nombres de acción.
                 */
                const raw = profileActionState[draft.id] || ''
                const busy = isActionInFlight(raw) ? raw : ''
                const justSaved = raw.startsWith('saved')
                const savedAction = raw.startsWith('saved:') ? raw.slice('saved:'.length).split(':')[0] : ''
                return (
              <div className="admin-player-progress-controls">
                <div className="admin-player-progress-copy">
                  <strong>Progreso de partida</strong>
                  <span>
                    {(() => {
                      // "Nivel 7" a secas no dice nada durante la partida: hay
                      // que abrir la ruta y contar. Se enseña en qué nodo está.
                      const level = profileProgress[draft.id]?.level ?? 0
                      const finished = profileProgress[draft.id]?.finished
                      if (finished) return `Finalizado · ${stages.length} de ${stages.length} nodos`
                      const stage = stages[level]
                      const name = stage?.title ? String(stage.title) : null
                      return name
                        ? `Nodo ${level + 1} de ${stages.length} · ${name}`
                        : `Nivel ${level}`
                    })()}
                  </span>
                  {profileActionError[draft.id] ? (
                    <small>{profileActionError[draft.id]}</small>
                  ) : justSaved ? (
                    <small className="admin-player-progress-ok">
                      ✓ Guardado en el servidor
                      {ETIQUETA_ACCION_HECHA[savedAction] ? ` (${ETIQUETA_ACCION_HECHA[savedAction]})` : ''}. El
                      móvil lo aplicará en su próxima conexión.
                    </small>
                  ) : null}
                </div>

                <div className="admin-player-progress-buttons">
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={Boolean(busy)}
                    data-busy={busy === 'restore_node' ? 'true' : undefined}
                    onClick={() => {
                      if (window.confirm(`¿Estás seguro de Restaurar Nodo para ${draft.display_name}? Esto restará el tiempo empleado y bajará 1 nivel.`)) {
                        onProfileAction(draft.id, 'restore_node' as AdminProfileAction)
                      }
                    }}
                    title="Baja 1 nivel y restaura el tiempo (limpia penalización)"
                  >
                    {busy === 'restore_node' ? '⏳ Restaurando…' : 'Restaurar Nodo'}
                  </button>
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={Boolean(busy)}
                    data-busy={busy === 'level_prev' ? 'true' : undefined}
                    onClick={() => onProfileAction(draft.id, 'level_prev')}
                    title="Baja 1 nivel (sin borrar el tiempo acumulado)"
                  >
                    ← 1 nodo
                  </button>
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={Boolean(busy)}
                    data-busy={busy === 'level_next' ? 'true' : undefined}
                    onClick={() => onProfileAction(draft.id, 'level_next')}
                  >
                    +1 nodo
                  </button>
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={Boolean(busy)}
                    data-busy={busy === 'reset_profile' ? 'true' : undefined}
                    onClick={() => onProfileAction(draft.id, 'reset_profile')}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="admin-inline-soft"
                    disabled={Boolean(busy)}
                    data-busy={busy === 'mark_finished' ? 'true' : undefined}
                    onClick={() => onProfileAction(draft.id, 'mark_finished')}
                  >
                    Finalizar
                  </button>
                </div>
              </div>
                )
              })()}

              <div className="admin-player-form-grid">
                <label>
                  ID del jugador
                  <input
                    value={draft.id}
                    aria-invalid={duplicatedIds.includes(savedPlayerId(draft, index))}
                    onChange={(event) => onUpdatePlayer(index, 'id', event.target.value)}
                  />
                  {duplicatedIds.includes(savedPlayerId(draft, index)) ? (
                    <small style={{ color: '#f87171', fontWeight: 700 }}>
                      ⚠ ID repetido. Cada jugador necesita uno distinto: al guardar, el servidor
                      descartaría una de las dos fichas (con su foto y su nombre).
                    </small>
                  ) : null}
                  {isPlayerIdChanged(draft, index) ? (
                    <small style={{ color: '#fbbf24', fontWeight: 700 }}>
                      ⚠ Cambiar el ID deja el progreso de «{draft.original_id}»
                      {profileProgress[draft.original_id || '']
                        ? ` (nodo ${(profileProgress[draft.original_id || '']?.level ?? 0) + 1})`
                        : ''}{' '}
                      sin dueño: el ID nuevo empieza de cero. Si solo quieres cambiar el nombre que se
                      ve, usa «Nombre que se ve».
                    </small>
                  ) : null}
                </label>

                <label>
                  Nombre que se ve
                  <input
                    value={draft.display_name}
                    onChange={(event) => onUpdatePlayer(index, 'display_name', event.target.value)}
                  />
                </label>

                <label>
                  Tipo
                  <select
                    value={draft.mode}
                    onChange={(event) => onUpdatePlayer(index, 'mode', event.target.value)}
                  >
                    <option value="solo">Individual</option>
                    <option value="team">Equipo</option>
                  </select>
                </label>
              </div>

              <div className="admin-player-avatar-tools">
                <div className="admin-player-avatar-preview-row">
                  <div
                    className="admin-player-avatar"
                    style={{
                      width: 74,
                      height: 74,
                      fontSize: 20,
                      background:
                        draft.color || getStablePlayerColor(draft.id || draft.display_name),
                      color: '#ffffff',
                      boxShadow: '0 14px 30px rgba(15,23,42,0.32)',
                      overflow: 'hidden',
                      flex: '0 0 auto',
                    }}
                  >
                    {draft.avatar_url ? (
                      <img src={draft.avatar_url} alt="" className="admin-player-avatar-image" />
                    ) : (
                      draft.avatar_initials || getPlayerInitials(draft.display_name || draft.id)
                    )}
                  </div>

                  <RetratoDePersonaje jugadorId={draft.id} lado={52} />
                  <div>
                    <strong>{draft.avatar_url ? 'Foto guardada' : 'Sin foto'}</strong>
                    <span>
                      {draft.avatar_url
                        ? shortAvatarValue(draft.avatar_url)
                        : 'Se mostrarán iniciales hasta subir una imagen.'}
                    </span>
                  </div>
                </div>

                <div className="admin-player-avatar-preview-row">
                  <label>
                    Color
                    <input
                      type="color"
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(draft.color)
                          ? draft.color
                          : getStablePlayerColor(draft.id || draft.display_name)
                      }
                      onChange={(event) => onUpdatePlayer(index, 'color', event.target.value)}
                    />
                  </label>

                  <label>
                    Iniciales
                    <input
                      value={draft.avatar_initials}
                      maxLength={3}
                      placeholder={getPlayerInitials(draft.display_name || draft.id)}
                      onChange={(event) =>
                        onUpdatePlayer(
                          index,
                          'avatar_initials',
                          event.target.value.toUpperCase().slice(0, 3)
                        )
                      }
                    />
                  </label>
                </div>

                <label className="admin-player-avatar-upload">
                  {draft.avatar_url ? 'Cambiar foto' : 'Subir foto'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => void handleAvatarFile(event, index)}
                  />
                  <span>
                    La imagen se comprime y se guarda en runtime al pulsar Guardar jugadores.
                  </span>
                </label>

                {draft.avatar_url ? (
                  <button
                    type="button"
                    className="admin-inline-soft"
                    onClick={() => onUpdatePlayer(index, 'avatar_url', '')}
                  >
                    Quitar foto
                  </button>
                ) : null}
              </div>

              {draft.mode === 'team' ? (
                <label className="admin-player-members">
                  Miembros del equipo
                  <input
                    value={draft.members}
                    placeholder="Nombre 1, Nombre 2"
                    onChange={(event) => onUpdatePlayer(index, 'members', event.target.value)}
                  />
                </label>
              ) : null}

              {(() => {
                const liveProfile = profiles.find(p => String(p.id) === String(draft.id || draft.display_name))
                const inventory = liveProfile?.inventory_snapshot?.items || []
                return (
                  <section className="admin-player-inventory" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🎒 Mochila / Coleccionables ({inventory.length})
                      </strong>
                      {inventory.length > 0 ? (
                        <button
                          type="button"
                          style={{
                            padding: '0.2rem 0.6rem',
                            fontSize: '0.75rem',
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                          onClick={() => {
                            if (window.confirm(`¿Vaciar TODOS los objetos de la mochila de ${draft.display_name}?`)) {
                              onProfileAction(draft.id, 'clear_inventory' as AdminProfileAction)
                            }
                          }}
                        >
                          🧹 Vaciar mochila
                        </button>
                      ) : null}
                    </div>
                    {inventory.length === 0 ? (
                      <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>
                        La mochila está vacía.
                      </div>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {inventory.map((item: any, itemIdx: number) => (
                          <li key={itemIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '1.1rem' }}>{item.quantity}x</span>
                              <strong style={{ color: '#e2e8f0' }}>{item.label || item.item_id}</strong>
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                type="button"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => {
                                  if (window.confirm(`¿Quitar ${item.label || item.item_id} a ${draft.display_name}?`)) {
                                    onProfileAction(draft.id, `remove_item:${item.item_id}` as AdminProfileAction)
                                  }
                                }}
                              >
                                Quitar
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select
                        style={{ padding: '0.3rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}
                        onChange={(e) => {
                          const val = e.target.value
                          if (!val) return
                          if (val === '__manual__') {
                            const itemId = window.prompt('ID o Nombre del objeto a entregar (ej. llave_dorada):')
                            if (itemId) {
                              onProfileAction(draft.id, `give_item:${itemId}` as AdminProfileAction)
                            }
                          } else {
                            if (window.confirm(`¿Dar ${val} a ${draft.display_name}?`)) {
                              onProfileAction(draft.id, `give_item:${val}` as AdminProfileAction)
                            }
                          }
                          e.target.value = ''
                        }}
                      >
                        <option value="">+ Añadir Objeto...</option>
                        {objetosQueRepartirLaRuta(stages).map(({ id: itemId, label }) => (
                          <option key={itemId} value={itemId}>
                            {`Dar "${label}" (${itemId})`}
                          </option>
                        ))}
                        <option value="__manual__">Escribir ID manualmente...</option>
                      </select>
                    </div>
                  </section>
                )
              })()}
      </>
    )
  }

  const fichaIndex = expandedPlayer !== null && playerDrafts[expandedPlayer] ? expandedPlayer : null
  const fichaDraft = fichaIndex !== null ? playerDrafts[fichaIndex] : null

  return (
    <div className="admin-cms-local-panel admin-players-panel admin-panel-modern r7-panel">
      <div className="r7-panel-cabeza">
        <div>
          <h2>Jugadores y equipos</h2>
          <p>Quién puede jugar esta misión, dónde va cada uno y qué se le puede hacer. Pulsa «Guardar jugadores» para conservar los cambios.</p>
        </div>
        <div className="r7-contador">
          <strong>{playerDrafts.length}</strong>
          <span>{playerDrafts.length === 1 ? 'perfil' : 'perfiles'}</span>
        </div>
      </div>

      <div className="r7-barra-filtros" role="search">
        <input
          type="search"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder="Buscar por nombre, ID o miembro…"
          aria-label="Buscar jugadores"
        />
        <div className="r7-filtros" role="group" aria-label="Filtrar jugadores">
          {(
            [
              ['todos', 'Todos'],
              ['solo', 'Individuales'],
              ['team', 'Equipos'],
              ['vivo', 'En vivo'],
              ['fin', 'Finalizados'],
              ['inactivo', 'Sin actividad'],
            ] as const
          ).map(([clave, texto]) => (
            <button
              key={clave}
              type="button"
              className={filtro === clave ? 'activo' : ''}
              aria-pressed={filtro === clave}
              onClick={() => setFiltro(clave)}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {playerDrafts.length === 0 ? (
        <div className="r7-vacio">
          <strong>Todavía no hay jugadores</strong>
          <span>Añade un jugador o un equipo para empezar a probar la misión.</span>
          <button type="button" className="r7-btn primario" onClick={onAddPlayer}>
            Añadir jugador
          </button>
        </div>
      ) : filas.length === 0 ? (
        <div className="r7-vacio">
          <strong>{textoSinJugadores(filtro, busqueda.trim() !== '').titulo}</strong>
          <span>{textoSinJugadores(filtro, busqueda.trim() !== '').ayuda}</span>
          <button
            type="button"
            className="r7-btn"
            onClick={() => {
              setBusqueda('')
              setFiltro('todos')
            }}
          >
            Quitar filtros
          </button>
        </div>
      ) : (
        <ul className="r7-lista-jugadores">
          {filas.map(({ draft, index, vivo }) => {
            const progreso = profileProgress[draft.id]
            const nivel = progreso?.level ?? 0
            const total = Math.max(1, stages.length)
            const terminado = Boolean(progreso?.finished)
            const porcentaje = terminado ? 100 : Math.min(100, Math.round((nivel / total) * 100))
            const presencia = vivo?.presence || 'unknown'
            const visto = textoTiempo(vivo?.last_seen)
            const raw = profileActionState[draft.id] || ''
            const ocupado = isActionInFlight(raw)
            const nombre = draft.display_name || draft.id || `Jugador ${index + 1}`
            const personajeInicial = draft.avatar_initials || getPlayerInitials(draft.display_name || draft.id)
            return (
              <li key={`jugador-${index}`} className={`r7-jugador${fichaIndex === index ? ' abierto' : ''}`}>
                <button
                  type="button"
                  className="r7-jugador-principal"
                  onClick={() => setExpandedPlayer(fichaIndex === index ? null : index)}
                  aria-label={`Abrir la ficha de ${nombre}`}
                >
                  <span
                    className="r7-avatar"
                    style={{ background: draft.color || getStablePlayerColor(draft.id || draft.display_name) }}
                  >
                    {draft.avatar_url ? (
                      <img src={draft.avatar_url} alt="" />
                    ) : (
                      personajeInicial
                    )}
                  </span>
                  <RetratoDePersonaje jugadorId={draft.id} />
                  <span className="r7-jugador-texto">
                    <strong>{nombre}</strong>
                    <small>
                      {draft.mode === 'team' ? '👥 Equipo' : '👤 Individual'}
                      {draft.mode === 'team' && draft.members ? ` · ${draft.members}` : ''}
                    </small>
                  </span>
                  <span className="r7-jugador-estado">
                    <span className={`r7-presencia ${presencia}`}>
                      <i aria-hidden="true" />
                      {ETIQUETA_PRESENCIA[presencia] || 'Sin datos'}
                    </span>
                    {visto && presencia !== 'live' ? <small>visto {visto}</small> : null}
                  </span>
                  <span className="r7-jugador-progreso">
                    <span className="r7-jugador-nodos">
                      {terminado
                        ? `Finalizado · ${stages.length} nodos`
                        : stages[nivel]
                          ? `Nodo ${nivel + 1} de ${stages.length}`
                          : `Nivel ${nivel}`}
                    </span>
                    <span className="r7-barra-progreso" aria-hidden="true">
                      <i style={{ width: `${porcentaje}%` }} />
                    </span>
                  </span>
                </button>
                <div className="r7-jugador-acciones">
                  <button
                    type="button"
                    className="r7-btn"
                    onClick={() => setExpandedPlayer(fichaIndex === index ? null : index)}
                  >
                    Ficha
                  </button>
                  <div className="r7-menu-fila">
                    <button
                      type="button"
                      className="r7-btn suave"
                      aria-haspopup="menu"
                      aria-expanded={menuFila === index}
                      aria-label={`Más acciones de ${nombre}`}
                      onClick={() => setMenuFila(menuFila === index ? null : index)}
                    >
                      ⋯
                    </button>
                    {menuFila === index ? (
                      <div className="r7-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          disabled={ocupado}
                          onClick={() => {
                            setMenuFila(null)
                            onProfileAction(draft.id, 'level_prev')
                          }}
                        >
                          ← Un nodo atrás
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={ocupado}
                          onClick={() => {
                            setMenuFila(null)
                            onProfileAction(draft.id, 'level_next')
                          }}
                        >
                          Un nodo adelante +
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={ocupado}
                          onClick={() => {
                            setMenuFila(null)
                            if (window.confirm(`¿Estás seguro de Restaurar Nodo para ${draft.display_name}? Esto restará el tiempo empleado y bajará 1 nivel.`)) {
                              onProfileAction(draft.id, 'restore_node' as AdminProfileAction)
                            }
                          }}
                        >
                          Restaurar nodo (quita la penalización)
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={ocupado}
                          onClick={() => {
                            setMenuFila(null)
                            onProfileAction(draft.id, 'mark_finished')
                          }}
                        >
                          Finalizar partida
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={ocupado}
                          onClick={() => {
                            setMenuFila(null)
                            onProfileAction(draft.id, 'reset_profile')
                          }}
                        >
                          Reiniciar partida
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="peligro"
                          onClick={() => {
                            setMenuFila(null)
                            onDeletePlayer(index)
                          }}
                        >
                          Eliminar jugador
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {fichaDraft !== null && fichaIndex !== null ? (
        <>
          <button
            type="button"
            className="r7-ficha-fondo"
            aria-label="Cerrar la ficha"
            onClick={() => setExpandedPlayer(null)}
          />
          <aside className="r7-ficha" role="dialog" aria-label={`Ficha de ${fichaDraft.display_name || fichaDraft.id}`}>
            <header className="r7-ficha-cabeza">
              <span
                className="r7-avatar grande"
                style={{ background: fichaDraft.color || getStablePlayerColor(fichaDraft.id || fichaDraft.display_name) }}
              >
                {fichaDraft.avatar_url ? (
                  <img src={fichaDraft.avatar_url} alt="" />
                ) : (
                  fichaDraft.avatar_initials || getPlayerInitials(fichaDraft.display_name || fichaDraft.id)
                )}
              </span>
              <div>
                <h3>{fichaDraft.display_name || fichaDraft.id || 'Jugador sin nombre'}</h3>
                <small>{fichaDraft.mode === 'team' ? 'Equipo' : 'Jugador individual'}</small>
              </div>
              <button type="button" className="r7-btn" onClick={() => setExpandedPlayer(null)}>
                Cerrar
              </button>
            </header>
            <div className="r7-ficha-cuerpo">{renderFicha(fichaDraft, fichaIndex)}</div>
          </aside>
        </>
      ) : null}

      <section
        className="admin-cms-local-panel admin-panel-modern"
        style={{ marginTop: '1.25rem', padding: '1rem', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: 10 }}
      >
        <div className="admin-panel-hero">
          <div>
            <span className="admin-kicker" style={{ color: '#fca5a5' }}>⚠️ Datos personales</span>
            <h2>Fotos de campo y posiciones GPS</h2>
            <p>
              SAGA guarda las fotos que hacen los jugadores y el rastro GPS de cada latido. Aquí se
              puede ver cuánto hay guardado y borrarlo. NO toca la misión, ni la configuración, ni
              el progreso o los tiempos de partida -para eso está Reset.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <button type="button" className="admin-inline-soft" disabled={cargandoPersonales} onClick={() => void verDatosPersonales()}>
            {cargandoPersonales ? 'Consultando…' : 'Ver qué hay guardado'}
          </button>

          {conteoPersonales ? (
            <button
              type="button"
              className="admin-inline-danger"
              disabled={cargandoPersonales || (conteoPersonales.fotos === 0 && conteoPersonales.posiciones_gps === 0)}
              onClick={() => void borrarDatosPersonales()}
            >
              🗑️ Borrar fotos y posiciones GPS
            </button>
          ) : null}
        </div>

        {avisoPersonales ? <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{avisoPersonales}</p> : null}

        {conteoPersonales ? (
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>
            Guardado ahora: {conteoPersonales.fotos} fotos ({conteoPersonales.ficheros_de_imagen} ficheros de
            imagen) · {conteoPersonales.posiciones_gps} posiciones GPS.
          </p>
        ) : null}

        {borradoPersonales ? (
          <p style={{ color: '#4ade80', fontSize: 13, marginTop: 8 }}>
            ✓ Borrado: {borradoPersonales.fotos} fotos · {borradoPersonales.imagenes} ficheros de imagen ·{' '}
            {borradoPersonales.posiciones_gps} posiciones GPS.
          </p>
        ) : null}
      </section>

      {playerSaveState === 'error' && playerSaveError ? (
        <div className="admin-save-error" role="alert">
          <strong>No se han guardado los jugadores</strong>
          <span>{playerSaveError}</span>
        </div>
      ) : null}

      <div className="admin-local-actions admin-panel-sticky-actions">
        <button type="button" onClick={onAddPlayer}>
          Añadir jugador
        </button>
        <button
          type="button"
          className="admin-cms-side-action--save"
          onClick={onSavePlayers}
          disabled={playerSaveState === 'saving'}
        >
          {playerSaveState === 'saving'
            ? 'Guardando jugadores…'
            : playerSaveState === 'saved'
              ? 'Jugadores guardados'
              : 'Guardar jugadores'}
        </button>
      </div>
    </div>
  )
}

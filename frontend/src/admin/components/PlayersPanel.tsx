import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  fetchDatosPersonales,
  purgeDatosPersonales,
  type AdminDatosPersonalesConteo,
  type AdminPerfilEnVivo,
  type AdminProfileAction,
  type AdminReactOverviewProfile,
  type AdminReactOverviewStage,
} from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'
import {
  colaNoSePuedeGuardar,
  descartarOperacion,
  estaRetenida,
  reanudarCola,
  useOperacionesPendientes,
  type Operacion,
} from '../lib/accionesDeJugador'
import { RetratoDePersonaje } from './RetratoDePersonaje'
import AjusteDeTiempo from './AjusteDeTiempo'
import { Chips } from './Chip'
import Deshacer from './Deshacer'
import FichaDeCampo, { type ExtraDeAccion, type ExtraDeAjuste } from './FichaDeCampo'
import { estaSinActividad, textoSinJugadores, type FiltroDeJugadores } from '../lib/adminRouteGuards'
import {
  atencionDe,
  chipsDeFila,
  ordenarPorAtencion,
  resumenDeLista,
  textoDeNodo,
  type Atencion,
} from '../lib/estadoDeJugador'
import {
  estaAtascado,
  progresoMasFiable,
  refrescarEstadoEnVivo,
  useEstadoEnVivo,
} from '../lib/estadoEnVivo'
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
  // Nunca la dirección: «/api/admin/foto/…» no le dice nada al organizador.
  if (value.startsWith('data:image/')) return `Foto nueva, ${Math.max(1, Math.round(value.length / 1024))} KB (sin guardar todavía)`
  return 'Se verá en su ficha y en el mapa.'
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
  onProfileAction: (profileId: string, action: AdminProfileAction, extra?: ExtraDeAccion) => void
  /** Suma (o, con signo negativo, resta) segundos al tiempo de un jugador, sin tocar su nodo. */
  onAjustarTiempo: (profileId: string, segundos: number, motivo: string, extra?: ExtraDeAjuste) => void
}

/**
 * El estado de una acción es su nombre mientras está en curso, `saved:<acción>`
 * al terminar bien y `error` si falla: solo lo primero cuenta como «ocupado».
 */
function isActionInFlight(raw: string) {
  // `pendiente:` = sin cobertura, ya en la cola: no bloquea los botones (se pueden encolar más, en orden).
  return Boolean(raw) && raw !== 'error' && !raw.startsWith('saved') && !raw.startsWith('pendiente')
}

const TEXTO_DE_ESPERA: Record<string, string> = {
  sin_red: 'sin cobertura',
  servidor: 'el servidor no responde',
  sesion: 'la sesión ha caducado: vuelve a entrar y se enviará sola',
  retenida: 'espera a que se envíe lo anterior',
}

/** Lo que espera cobertura (o sesión) para enviarse. `jugador` filtra por jugador; sin él, todo lo pendiente. */
function PendientesDeEnvio({ pendientes, jugador }: { pendientes: Operacion[]; jugador?: string }) {
  const lista = (jugador ? pendientes.filter((o) => o.profileId === jugador) : pendientes).filter((o) => o.enCola && !estaRetenida(o))
  if (lista.length === 0) return null
  return (
    <div className="r7-pendientes" role="status" data-pendientes>
      <strong>
        ⏳ {lista.length === 1 ? '1 cambio sin enviar' : `${lista.length} cambios sin enviar`}
      </strong>
      <span>
        No se han perdido: se enviarán solos en cuanto haya cobertura, en el mismo orden
        {colaNoSePuedeGuardar() ? '. Ojo: este navegador no puede guardarlos; no cierres ni recargues esta pestaña' : ''}.
      </span>
      <ul>
        {lista.map((op) => (
          <li key={op.opId}>
            {jugador ? '' : `${op.profileId}: `}
            {op.etiqueta}
            {op.motivoDeEspera ? ` (${TEXTO_DE_ESPERA[op.motivoDeEspera] || op.motivoDeEspera})` : ''}
            <button
              type="button"
              className="r7-btn"
              onClick={() => {
                if (window.confirm(`¿Descartar «${op.etiqueta}» de ${op.profileId}? No se enviará.`)) descartarOperacion(op.opId)
              }}
            >
              Descartar
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="r7-btn primario" onClick={() => reanudarCola()}>
        Reintentar ahora
      </button>
    </div>
  )
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
  onAjustarTiempo,
}: PlayersPanelProps) {
  const pendientes = useOperacionesPendientes()
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
    // El input se guarda ANTES del `await`: React deja `event.currentTarget` a null al acabar el manejador, y el
    // `finally` de abajo reventaba (TypeError sin capturar) sin vaciar el campo; volver a elegir la misma foto,
    // p. ej. tras un error, ya no disparaba `onChange` (revisión 23/10).
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      onUpdatePlayer(index, 'avatar_url', dataUrl)
      onUpdatePlayer(index, 'avatar_initials', '')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo cargar el avatar.')
    } finally {
      input.value = ''
    }
  }

  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroDeJugadores>('todos')
  const [menuFila, setMenuFila] = useState<number | null>(null)

  /**
   * Quién va por dónde, al momento (revisión 24/10/2026): con el panel abierto se sondea el estado de la partida
   * (estadoEnVivo.ts). Antes la presencia, el «visto hace» y el nodo de cada uno eran los de la última recarga
   * entera del panel y no se movían solos.
   */
  const enVivo = useEstadoEnVivo()
  const enVivoPorId = new Map((enVivo.perfiles || []).map((p) => [String(p.user), p]))
  // Hasta cuándo manda lo que dice el panel sobre cada jugador: Infinity mientras una acción suya está en curso, y
  // la hora en que acabó después (ver progresoMasFiable).
  const accionHastaRef = useRef<Record<string, number>>({})
  useEffect(() => {
    let acabo = false
    for (const [id, raw] of Object.entries(profileActionState)) {
      if (isActionInFlight(raw)) accionHastaRef.current[id] = Infinity
      else if (accionHastaRef.current[id] === Infinity) {
        accionHastaRef.current[id] = Date.now()
        acabo = true
      }
    }
    if (acabo) refrescarEstadoEnVivo()
  }, [profileActionState])

  const progresoDe = (id: string) =>
    isActionInFlight(profileActionState[id] || '')
      ? profileProgress[id]
      : progresoMasFiable(enVivoPorId.get(id), enVivo.pedidoMs, accionHastaRef.current[id], profileProgress[id])

  const perfilVivo = (draft: PlayerDraft) => {
    const id = String(draft.id || draft.display_name)
    const guardado = profiles.find((p) => String(p.id) === id)
    const sondeo = enVivoPorId.get(id)
    if (!sondeo) return guardado
    return {
      ...(guardado || { id, display_name: draft.display_name }),
      presence: sondeo.presence,
      last_seen: sondeo.last_seen,
      gps_status: sondeo.gps_status,
    }
  }

  /** Lo último que se sabe de su señal: el sondeo en vivo o, si aún no ha llegado, lo de la última carga del panel. */
  const vivoDe = (draft: PlayerDraft): AdminPerfilEnVivo | undefined => {
    const id = String(draft.id || draft.display_name)
    const sondeo = enVivoPorId.get(id)
    if (sondeo) return sondeo
    const guardado = profiles.find((p) => String(p.id) === id)
    if (!guardado?.presence) return undefined
    return {
      user: id,
      presence: guardado.presence,
      last_seen: Number(guardado.last_seen) || null,
      gps_status: guardado.gps_status,
    } as AdminPerfilEnVivo
  }
  const atencionDeJugador = (draft: PlayerDraft): Atencion =>
    atencionDe({ vivo: vivoDe(draft), serverTs: enVivo.serverTs, terminado: Boolean(progresoDe(draft.id)?.finished) })
  const resumen = resumenDeLista(playerDrafts.map(atencionDeJugador))

  const filas = playerDrafts
    .map((draft, index) => ({ draft, index, vivo: perfilVivo(draft) }))
    .filter(({ draft, vivo }) => {
      const texto = `${draft.display_name} ${draft.id} ${draft.members}`.toLowerCase()
      if (busqueda.trim() && !texto.includes(busqueda.trim().toLowerCase())) return false
      if (filtro === 'solo') return draft.mode !== 'team'
      if (filtro === 'team') return draft.mode === 'team'
      if (filtro === 'vivo') return vivo?.presence === 'live'
      if (filtro === 'fin') return Boolean(progresoDe(draft.id)?.finished)
      if (filtro === 'inactivo')
        return estaSinActividad(vivo?.last_seen, Boolean(progresoDe(draft.id)?.finished))
      if (filtro === 'atascado') return estaAtascado(enVivoPorId.get(draft.id), enVivo.serverTs)
      return true
    })
  const filasOrdenadas = ordenarPorAtencion(filas, ({ draft }) => atencionDeJugador(draft))

  /** La parte de arriba de la ficha: estado, tiempo, nodo, mochila y «Más» (ver FichaDeCampo). */
  function renderCampo(draft: PlayerDraft) {
    const id = String(draft.id)
    const nombre = draft.display_name || id
    const progreso = progresoDe(id)
    const raw = profileActionState[id] || ''
    const perfil = profiles.find((p) => String(p.id) === id)
    const sondeo = enVivoPorId.get(id)
    const aviso: { tipo: 'error' | 'espera' | 'ok'; texto: string } | null = profileActionError[id]
      ? { tipo: 'error', texto: profileActionError[id] }
      : raw.startsWith('pendiente')
        ? { tipo: 'espera', texto: 'Sin enviar: se enviará solo cuando haya cobertura (abajo, en «cambios sin enviar»).' }
        : raw.startsWith('saved')
          ? { tipo: 'ok', texto: 'Guardado en el servidor. El móvil lo aplicará en su próxima conexión.' }
          : null
    return (
      <FichaDeCampo
        profileId={id}
        nombre={nombre}
        nivel={progreso?.level ?? 0}
        total={stages.length}
        terminado={Boolean(progreso?.finished)}
        stages={stages}
        vivo={vivoDe(draft)}
        serverTs={enVivo.serverTs}
        tiempoTotalMs={perfil?.tiempo?.total_time_ms ?? sondeo?.total_time_ms ?? null}
        inventario={perfil?.inventory_snapshot?.items || []}
        ocupado={isActionInFlight(raw)}
        aviso={aviso}
        pendientes={pendientes}
        onAccion={(accion, extra) => onProfileAction(id, accion as AdminProfileAction, extra)}
        onAjustar={(segundos, motivo, extra) => onAjustarTiempo(id, segundos, motivo, extra)}
        ajusteLibre={
          <AjusteDeTiempo
            nombre={nombre}
            tiempo={perfil?.tiempo}
            ocupado={isActionInFlight(raw)}
            onAjustar={(segundos, motivo) => onAjustarTiempo(id, segundos, motivo)}
          />
        }
      />
    )
  }

  function renderFicha(draft: PlayerDraft, index: number) {
    return (
      <>
              {renderCampo(draft)}
              <PendientesDeEnvio pendientes={pendientes} jugador={String(draft.id)} />

              <details className="r8-datos">
                <summary>Datos del jugador</summary>
                <div className="r8-datos-cuerpo">

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

                  <button
                    type="button"
                    className="r8-boton peligro"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar a ${draft.display_name || draft.id} de la lista? Se quita al pulsar «Guardar jugadores».`)) {
                        setExpandedPlayer(null)
                        onDeletePlayer(index)
                      }
                    }}
                  >
                    <strong>Eliminar jugador</strong>
                    <small>sale de la lista al guardar</small>
                  </button>
                </div>
              </details>
      </>
    )
  }

  const fichaIndex = expandedPlayer !== null && playerDrafts[expandedPlayer] ? expandedPlayer : null
  const fichaDraft = fichaIndex !== null ? playerDrafts[fichaIndex] : null

  return (
    <div className="admin-cms-local-panel admin-players-panel admin-panel-modern r7-panel">
      <div className="r7-panel-cabeza r8-cabeza-compacta">
        <div>
          <h2>Jugadores y equipos</h2>
          <p>Quién puede jugar esta misión, dónde va cada uno y qué se le puede hacer. Pulsa «Guardar jugadores» para conservar los cambios.</p>
        </div>
        <div className="r7-contador">
          <strong>{playerDrafts.length}</strong>
          <span>{playerDrafts.length === 1 ? 'perfil' : 'perfiles'}</span>
        </div>
      </div>

      <PendientesDeEnvio pendientes={pendientes} />

      <div className="r8-resumen" role="group" aria-label="Resumen de jugadores">
        <div>
          <strong>{resumen.jugando}</strong>
          <span>jugando</span>
        </div>
        <div className={resumen.atencion > 0 ? 'aviso' : ''}>
          <strong>{resumen.atencion}</strong>
          <span>necesitan atención</span>
        </div>
        <div className={resumen.sinConexion > 0 ? 'error' : ''}>
          <strong>{resumen.sinConexion}</strong>
          <span>sin conexión</span>
        </div>
        <div>
          <strong>{resumen.terminados}</strong>
          <span>terminados</span>
        </div>
      </div>

      <div className="r7-barra-filtros r8-barra-compacta" role="search">
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
              ['atascado', 'Atascados'],
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
          {filasOrdenadas.map(({ draft, index }) => {
            const id = String(draft.id)
            const progreso = progresoDe(draft.id)
            const nivel = progreso?.level ?? 0
            const total = Math.max(1, stages.length)
            const terminado = Boolean(progreso?.finished)
            const porcentaje = terminado ? 100 : Math.min(100, Math.round((nivel / total) * 100))
            const ocupado = isActionInFlight(profileActionState[draft.id] || '')
            const nombre = draft.display_name || draft.id || `Jugador ${index + 1}`
            const personajeInicial = draft.avatar_initials || getPlayerInitials(draft.display_name || draft.id)
            const atencion = atencionDeJugador(draft)
            const clase =
              atencion === 'sin_conexion' ? ' sin_conexion' : atencion === 'atascado' || atencion === 'senal_floja' ? ' atencion' : ''
            return (
              <li key={`jugador-${index}`} className={`r8-fila${clase}${fichaIndex === index ? ' abierto' : ''}`}>
                <button
                  type="button"
                  className="r8-fila-principal"
                  onClick={() => setExpandedPlayer(fichaIndex === index ? null : index)}
                  aria-label={`Abrir la ficha de ${nombre}`}
                >
                  <span
                    className="r7-avatar"
                    style={{ background: draft.color || getStablePlayerColor(draft.id || draft.display_name) }}
                  >
                    {draft.avatar_url ? <img src={draft.avatar_url} alt="" /> : personajeInicial}
                  </span>
                  <span className="r8-fila-texto">
                    <strong>{nombre}</strong>
                    <span className="r8-fila-nodo">
                      {textoDeNodo(nivel, stages.length, stages[nivel]?.title ? String(stages[nivel].title) : null, terminado)}
                    </span>
                    <span className="r7-barra-progreso" aria-hidden="true">
                      <i style={{ width: `${porcentaje}%` }} />
                    </span>
                  </span>
                </button>
                <div className="r8-fila-pie">
                  <Chips
                    chips={chipsDeFila({ vivo: vivoDe(draft), serverTs: enVivo.serverTs, terminado })}
                    etiqueta={`Estado de ${nombre}`}
                  />
                  <div className="r8-fila-acciones">
                    {!terminado ? (
                      <button
                        type="button"
                        className="r8-boton corto"
                        disabled={ocupado}
                        aria-label={`Sumar 1 minuto a ${nombre}`}
                        onClick={() => onAjustarTiempo(id, 60, '', { confirmado: true, retenerMs: 6000 })}
                      >
                        <strong>+1 min</strong>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="r8-boton corto"
                      onClick={() => setExpandedPlayer(fichaIndex === index ? null : index)}
                    >
                      <strong>Ficha</strong>
                    </button>
                  </div>
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
                            onClick={() => {
                              setMenuFila(null)
                              setExpandedPlayer(index)
                            }}
                          >
                            Abrir la ficha (mover de nodo, dar, terminar…)
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

      {/* Con la ficha abierta, su «Deshacer» ya sale dentro de ella. */}
      {fichaIndex === null ? (
        <Deshacer
          pendientes={pendientes}
          nombreDe={(id) => playerDrafts.find((d) => String(d.id) === id)?.display_name || id}
        />
      ) : null}

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
                <small>
                  {(() => {
                    const p = progresoDe(fichaDraft.id)
                    const n = p?.level ?? 0
                    return textoDeNodo(n, stages.length, stages[n]?.title ? String(stages[n].title) : null, Boolean(p?.finished))
                  })()}
                </small>
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

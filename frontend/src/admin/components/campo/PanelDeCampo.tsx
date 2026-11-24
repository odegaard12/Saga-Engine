import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAntiCheatFlags,
  type AdminPerfilEnVivo,
  type AdminProfileAction,
  type AdminReactOverviewProfile,
  type AdminReactOverviewStage,
  type AntiCheatPlayerFlags,
  type AntiCheatSuspicion,
} from '../../lib/adminApi'
import { describeAdminError } from '../../lib/adminErrors'
import {
  colaNoSePuedeGuardar,
  descartarOperacion,
  estaRetenida,
  reanudarCola,
  useOperacionesPendientes,
} from '../../lib/accionesDeJugador'
import {
  avisosDeCampo,
  contarGrupos,
  dosLetras,
  haceCuanto,
  jugadorDeCampo,
  tintaClara,
  type AvisoDeCampo,
  type Grupo,
  type JugadorDeCampo,
} from '../../lib/campo'
import {
  antiguedadDeLaSenalS,
  datosViejosS,
  minutosEnElNodo,
  progresoMasFiable,
  refrescarEstadoEnVivo,
  textoDatosDeHace,
  textoDeAntiguedad,
  useEstadoEnVivo,
} from '../../lib/estadoEnVivo'
import { textoDeNodo } from '../../lib/estadoDeJugador'
import { usePocosDatos } from '../../lib/pocosDatos'
import { getStablePlayerColor } from '../../../shared/playerIdentity'
import AjusteDeTiempo from '../AjusteDeTiempo'
import Deshacer from '../Deshacer'
import FichaDeCampo, { type ExtraDeAccion, type ExtraDeAjuste } from '../FichaDeCampo'
import AvisosDeCampo from './AvisosDeCampo'
import MapaDeCampo, { type PinDeCampo } from './MapaDeCampo'
import MasDeCampo, { type PanelDelEditor } from './MasDeCampo'
import '../../styles/admin-r8-ficha.css'
import '../../styles/admin-campo.css'

type Props = {
  profiles: AdminReactOverviewProfile[]
  stages: AdminReactOverviewStage[]
  profileProgress: Record<string, { level: number | null; finished: boolean }>
  profileActionState: Record<string, string>
  profileActionError: Record<string, string>
  localNotice: string | null
  onProfileAction: (profileId: string, action: AdminProfileAction, extra?: ExtraDeAccion) => void
  onAjustarTiempo: (profileId: string, segundos: number, motivo: string, extra?: ExtraDeAjuste) => void
  onRevisarAviso: (profileId: string, aviso: AntiCheatSuspicion, como: 'revisado' | 'penalizado') => void
  missionDraft: Record<string, string>
  ajustesSinGuardar: boolean
  settingsSaveState: 'idle' | 'saving' | 'saved' | 'error'
  settingsSaveError: string | null
  onUpdateMissionDraft: (key: string, value: string) => void
  onSaveSettings: () => void
  onAbrirEditor: (panel: PanelDelEditor) => void
  onLogout: () => void
}

type Pestana = 'mapa' | 'avisos' | 'mas'

const TITULO_DE_GRUPO: Record<Grupo, string> = { ruta: 'En ruta', atencion: 'Necesitan atención', fin: 'Terminaron' }

/** Igual que en la lista de Jugadores: lo «en curso» bloquea los botones; lo que espera cobertura, no. */
function enCurso(raw: string) {
  return Boolean(raw) && raw !== 'error' && !raw.startsWith('saved') && !raw.startsWith('pendiente')
}

/** Reloj de pocos segundos para «hace 6 s» (sin pedir nada). */
function useAhora(cadaMs: number): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const r = setInterval(() => setAhora(Date.now()), cadaMs)
    return () => clearInterval(r)
  }, [cadaMs])
  return ahora
}

const ICONO = {
  mapa: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  ),
  avisos: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  ),
  mas: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
}

/**
 * El panel de campo (24/11, dirección B elegida por el organizador): el mapa ES la pantalla. Arriba, tres cifras que
 * filtran (en ruta, atención, terminó); abajo, una hoja con quien necesita atención y el botón «+1 min» a mano; tocar a
 * alguien (en el mapa o en la lista) abre su ficha en esa misma hoja. «Avisos» y «Más» completan lo del día de partida;
 * todo lo demás del panel sigue en el editor, a un toque desde «Más».
 *
 * Los colores salen del tema de la misión: oscuro con Pizarra y Solpor, papel claro con Día (bordes de tinta para el sol).
 * Los datos: el sondeo compartido (`estadoEnVivo.ts`) y, sólo al mirar avisos, la lista del antitrampa.
 */
export default function PanelDeCampo(props: Props) {
  const { profiles, stages, profileProgress, profileActionState, profileActionError, localNotice } = props
  const [pestana, setPestana] = useState<Pestana>('mapa')
  const [elegido, setElegido] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Grupo | null>(null)
  const [hojaAlta, setHojaAlta] = useState(false)
  const [avisosDe, setAvisosDe] = useState<{ id: string; nombre: string } | null>(null)
  const enVivo = useEstadoEnVivo()
  const [pocos, fijarPocos] = usePocosDatos()
  const pendientes = useOperacionesPendientes()
  const ahora = useAhora(5000)
  // La nota de lo que acaba de pasar («Garza pasa al nodo 5…») se va sola a los 6 s: no tapa el mapa.
  const [nota, setNota] = useState<string | null>(localNotice)
  useEffect(() => {
    setNota(localNotice)
    if (!localNotice) return undefined
    const t = setTimeout(() => setNota(null), 6000)
    return () => clearTimeout(t)
  }, [localNotice])

  // --- quién va por dónde (lo mismo que la lista de Jugadores) -----------------------------------------------------
  const enVivoPorId = useMemo(() => new Map((enVivo.perfiles || []).map((p) => [String(p.user), p])), [enVivo.perfiles])
  const accionHastaRef = useRef<Record<string, number>>({})
  useEffect(() => {
    let acabo = false
    for (const [id, raw] of Object.entries(profileActionState)) {
      if (enCurso(raw)) accionHastaRef.current[id] = Infinity
      else if (accionHastaRef.current[id] === Infinity) {
        accionHastaRef.current[id] = Date.now()
        acabo = true
      }
    }
    if (acabo) refrescarEstadoEnVivo()
  }, [profileActionState])

  const progresoDe = useCallback(
    (id: string) =>
      enCurso(profileActionState[id] || '')
        ? profileProgress[id]
        : progresoMasFiable(enVivoPorId.get(id), enVivo.pedidoMs, accionHastaRef.current[id], profileProgress[id]),
    [profileActionState, profileProgress, enVivoPorId, enVivo.pedidoMs]
  )

  const vivoDe = useCallback(
    (perfil: AdminReactOverviewProfile): AdminPerfilEnVivo | undefined => {
      const sondeo = enVivoPorId.get(String(perfil.id))
      if (sondeo) return sondeo
      if (!perfil.presence) return undefined
      return { user: String(perfil.id), presence: perfil.presence, last_seen: Number(perfil.last_seen) || null, gps_status: perfil.gps_status }
    },
    [enVivoPorId]
  )

  const jugadores: JugadorDeCampo[] = useMemo(
    () =>
      profiles
        .filter((p) => String(p.id || '').trim())
        .map((p) => {
          const id = String(p.id)
          const progreso = progresoDe(id)
          const nombre = p.display_name || id
          return jugadorDeCampo({
            id,
            nombre,
            iniciales: dosLetras(nombre, p.avatar_initials),
            color: p.color || getStablePlayerColor(id || nombre),
            nivel: progreso?.level ?? Number(p.level ?? 0),
            terminado: Boolean(progreso?.finished ?? p.finished),
            vivo: vivoDe(p),
            serverTs: enVivo.serverTs,
          })
        }),
    [profiles, progresoDe, vivoDe, enVivo.serverTs]
  )
  const porId = useMemo(() => new Map(jugadores.map((j) => [j.id, j])), [jugadores])
  const cuenta = contarGrupos(jugadores)
  const viejosS = datosViejosS(enVivo, ahora)

  // --- avisos del antitrampa: sólo al mirarlos (o al abrir una ficha), y otra vez si cambia la cifra del sondeo ------
  const [flags, setFlags] = useState<AntiCheatPlayerFlags[] | null>(null)
  const [cargandoAvisos, setCargandoAvisos] = useState(false)
  const [errorAvisos, setErrorAvisos] = useState<string | null>(null)
  const [revisadosAqui, setRevisadosAqui] = useState<Set<string>>(() => new Set())
  const cifraPedida = useRef<number | null | undefined>(undefined)
  const necesitaAvisos = pestana === 'avisos' || elegido !== null
  const cargarAvisos = useCallback(async () => {
    setCargandoAvisos(true)
    try {
      const r = await fetchAntiCheatFlags()
      if (r.status !== 'ok') throw new Error(r.detail || 'el servidor no los dio')
      setFlags(r.players || [])
      setErrorAvisos(null)
    } catch (e) {
      setErrorAvisos(describeAdminError(e, 'cargar'))
    } finally {
      setCargandoAvisos(false)
    }
  }, [])
  useEffect(() => {
    if (!necesitaAvisos) return
    if (flags !== null && cifraPedida.current === enVivo.avisos) return
    cifraPedida.current = enVivo.avisos
    void cargarAvisos()
  }, [necesitaAvisos, enVivo.avisos, flags, cargarAvisos])
  const avisos = useMemo(() => (flags ? avisosDeCampo(flags, revisadosAqui) : null), [flags, revisadosAqui])
  // La cifra del botón: la del sondeo (todos los móviles la ven igual), menos lo marcado aquí que aún no ha vuelto.
  const sinRevisar = typeof enVivo.avisos === 'number' ? enVivo.avisos : (avisos?.filter((a) => a.gravedad !== 'nota' && !a.revisado).length ?? 0)

  function revisar(a: AvisoDeCampo, como: 'revisado' | 'penalizado') {
    setRevisadosAqui((s) => new Set(s).add(a.clave))
    props.onRevisarAviso(a.profileId, a.s, como)
  }

  // --- piezas ----------------------------------------------------------------------------------------------------
  const disco = (id: string, lado?: 'chico' | 'grande') => {
    const j = porId.get(id)
    const color = j?.color || getStablePlayerColor(id)
    return (
      <span
        className={`campo-disco${lado ? ` ${lado}` : ''} ${tintaClara(color) ? 'tinta-clara' : 'tinta-oscura'}`}
        style={{ '--pin': color } as React.CSSProperties}
        aria-hidden="true"
      >
        {j?.iniciales || id.slice(0, 2).toUpperCase()}
      </span>
    )
  }

  const estadoDeLaRed = (
    <span className={`campo-red${viejosS !== null ? ' viejo' : enVivo.fallos > 0 ? ' fallo' : ''}`} role="status">
      <i aria-hidden="true" />
      {viejosS !== null
        ? textoDatosDeHace(viejosS)
        : enVivo.pedidoMs
          ? haceCuanto((ahora - enVivo.pedidoMs) / 1000)
          : 'conectando…'}
      {pocos ? ' · pocos datos' : ''}
    </span>
  )

  function lineaDeEstado(j: JugadorDeCampo): { texto: string; tono: '' | 'aviso' | 'error' } {
    const nodo = `Nodo ${j.nivel + 1}`
    const edad = textoDeAntiguedad(antiguedadDeLaSenalS(j.vivo?.pos_at ?? j.vivo?.last_seen ?? null, enVivo.serverTs))
    if (j.atencion === 'terminado') return { texto: 'Terminó la ruta', tono: '' }
    if (j.atencion === 'sin_conexion') return { texto: `Sin señal${edad ? ` · ${edad}` : ''}`, tono: 'error' }
    if (j.atencion === 'atascado') return { texto: `${minutosEnElNodo(j.vivo, enVivo.serverTs)} min en el nodo ${j.nivel + 1}`, tono: 'aviso' }
    if (j.atencion === 'senal_floja') return { texto: `${nodo} · señal de ${edad || 'hace rato'}`, tono: 'aviso' }
    return { texto: `${nodo} · ${viejosS !== null ? 'sin datos nuevos' : edad === 'ahora' || !edad ? 'en vivo' : edad}`, tono: '' }
  }

  // La lista de abajo: la del filtro elegido; sin filtro, todos por grupos y primero quien necesita atención (con la hoja
  // baja se ven los tres primeros; subiéndola, el resto).
  const secciones: Grupo[] = filtro ? [filtro] : (['atencion', 'ruta', 'fin'] as Grupo[]).filter((g) => cuenta[g] > 0)
  const grupoDeLaLista: Grupo = secciones[0] ?? 'ruta'

  const pines: PinDeCampo[] = jugadores
    .filter((j) => (!filtro || j.grupo === filtro || j.id === elegido) && typeof j.vivo?.lat === 'number' && typeof j.vivo?.lon === 'number')
    .map((j) => ({
      id: j.id,
      lat: j.vivo!.lat as number,
      lon: j.vivo!.lon as number,
      nivel: j.nivel,
      terminado: j.terminado,
      atencion: j.atencion,
      iniciales: j.iniciales,
      nombre: j.nombre,
      color: j.color,
      minutos: j.atencion === 'atascado' ? minutosEnElNodo(j.vivo, enVivo.serverTs) : null,
    }))

  const sinEnviar = pendientes.filter((o) => o.enCola && !estaRetenida(o))
  const nombreDe = (id: string) => porId.get(id)?.nombre || id

  function abrirFicha(id: string) {
    setElegido(id)
    setPestana('mapa')
    setHojaAlta(false)
  }

  // Escape: cierra la ficha (o vuelve al mapa desde Avisos/Más). Dentro de una hoja de confirmación manda ella.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return
      if (elegido) setElegido(null)
      else if (pestana !== 'mapa') setPestana('mapa')
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [elegido, pestana])

  const fichaJugador = elegido ? porId.get(elegido) : null
  const fichaPerfil = elegido ? profiles.find((p) => String(p.id) === elegido) : undefined
  const raw = elegido ? profileActionState[elegido] || '' : ''
  const avisosDelElegido = elegido && avisos ? avisos.filter((a) => a.profileId === elegido && a.gravedad !== 'nota' && !a.revisado) : []

  return (
    <main className="campo" aria-label="Panel de campo">
      <MapaDeCampo stages={stages} pines={pines} elegido={elegido} pocos={pocos} onElegir={abrirFicha} />

      <header className="campo-arriba">
        <div className="campo-arriba-linea">
          <strong>En directo</strong>
          {estadoDeLaRed}
        </div>
        <div className="campo-contadores" role="group" aria-label="Filtrar jugadores">
          {(['ruta', 'atencion', 'fin'] as Grupo[]).map((g) => (
            <button
              key={g}
              type="button"
              className={`campo-contador${g === 'atencion' && cuenta.atencion > 0 ? ' alerta' : ''}`}
              aria-pressed={filtro === g}
              onClick={() => {
                setFiltro(filtro === g ? null : g)
                setElegido(null)
                setPestana('mapa')
              }}
            >
              <strong className="campo-num">{cuenta[g]}</strong>
              <small>{g === 'ruta' ? 'en ruta' : g === 'atencion' ? 'atención' : 'terminó'}</small>
            </button>
          ))}
        </div>
      </header>

      <div className="campo-lateral">
        {pestana === 'mapa' && fichaJugador ? (
          <section className="campo-hoja campo-ficha alta" aria-label={`Ficha de ${fichaJugador.nombre}`}>
            <header className="campo-ficha-cabeza">
              {disco(fichaJugador.id, 'grande')}
              <div>
                <h2>{fichaJugador.nombre}</h2>
                <p className="campo-num">
                  {textoDeNodo(fichaJugador.nivel, stages.length, null, fichaJugador.terminado)}
                  {!fichaJugador.terminado && minutosEnElNodo(fichaJugador.vivo, enVivo.serverTs) !== null
                    ? ` · lleva ${minutosEnElNodo(fichaJugador.vivo, enVivo.serverTs)} min`
                    : ''}
                </p>
              </div>
              <button type="button" className="campo-boton" onClick={() => setElegido(null)}>
                Lista
              </button>
            </header>
            <div className="campo-hoja-cuerpo">
              <FichaDeCampo
                variante="campo"
                profileId={fichaJugador.id}
                nombre={fichaJugador.nombre}
                nivel={fichaJugador.nivel}
                total={stages.length}
                terminado={fichaJugador.terminado}
                stages={stages}
                vivo={fichaJugador.vivo}
                serverTs={enVivo.serverTs}
                datosViejosS={viejosS}
                tiempoTotalMs={fichaPerfil?.tiempo?.total_time_ms ?? fichaJugador.vivo?.total_time_ms ?? null}
                inventario={fichaPerfil?.inventory_snapshot?.items || []}
                ocupado={enCurso(raw)}
                aviso={
                  profileActionError[fichaJugador.id]
                    ? { tipo: 'error', texto: profileActionError[fichaJugador.id] }
                    : raw.startsWith('pendiente')
                      ? { tipo: 'espera', texto: 'Sin enviar: se enviará solo cuando haya cobertura.' }
                      : raw.startsWith('saved')
                        ? { tipo: 'ok', texto: 'Guardado. Su móvil lo aplicará en su próxima conexión.' }
                        : null
                }
                pendientes={pendientes}
                onAccion={(accion, extra) => props.onProfileAction(fichaJugador.id, accion as AdminProfileAction, extra)}
                onAjustar={(segundos, motivo, extra) => props.onAjustarTiempo(fichaJugador.id, segundos, motivo, extra)}
                trasAcciones={
                  avisosDelElegido.length > 0 ? (
                    <button
                      type="button"
                      className="campo-enlace-fila alerta"
                      onClick={() => {
                        setAvisosDe({ id: fichaJugador.id, nombre: fichaJugador.nombre })
                        setPestana('avisos')
                      }}
                    >
                      <span>
                        <strong>
                          {avisosDelElegido.length === 1 ? '1 aviso del antitrampa' : `${avisosDelElegido.length} avisos del antitrampa`}
                        </strong>
                        <small>Ver y decidir: revisado o penalizar</small>
                      </span>
                      <span className="campo-flecha" aria-hidden="true">›</span>
                    </button>
                  ) : null
                }
                ajusteLibre={
                  <AjusteDeTiempo
                    nombre={fichaJugador.nombre}
                    tiempo={fichaPerfil?.tiempo}
                    ocupado={enCurso(raw)}
                    onAjustar={(segundos, motivo) => props.onAjustarTiempo(fichaJugador.id, segundos, motivo)}
                  />
                }
              />
            </div>
          </section>
        ) : null}

        {pestana === 'mapa' && !fichaJugador ? (
          <section className={`campo-hoja${hojaAlta ? ' alta' : ''}`} aria-label={TITULO_DE_GRUPO[grupoDeLaLista]}>
            <button
              type="button"
              className="campo-asa"
              aria-expanded={hojaAlta}
              aria-label={hojaAlta ? 'Bajar la lista' : 'Subir la lista'}
              onClick={() => setHojaAlta(!hojaAlta)}
            >
              <i aria-hidden="true" />
            </button>
            <header className="campo-hoja-titulo">
              <h2>{TITULO_DE_GRUPO[grupoDeLaLista]}</h2>
              <span className="campo-num">
                {cuenta[grupoDeLaLista]} de {jugadores.length}
              </span>
            </header>
            <Deshacer pendientes={pendientes} nombreDe={nombreDe} />
            <div className="campo-hoja-cuerpo">
              {cuenta[grupoDeLaLista] === 0 ? (
                <p className="campo-vacio">
                  {grupoDeLaLista === 'fin' ? 'Nadie ha terminado todavía.' : 'Nadie en este grupo ahora mismo.'}
                </p>
              ) : (
                secciones.map((g, i) => (
                <div key={g}>
                {i > 0 ? (
                  <h3 className="campo-subtitulo">
                    {TITULO_DE_GRUPO[g]} <span className="campo-num">{cuenta[g]}</span>
                  </h3>
                ) : null}
                <ul className="campo-filas">
                  {jugadores.filter((j) => j.grupo === g).map((j) => {
                    const linea = lineaDeEstado(j)
                    return (
                      <li key={j.id} className="campo-fila">
                        <button type="button" className="campo-fila-principal" onClick={() => abrirFicha(j.id)} aria-label={`Abrir la ficha de ${j.nombre}`}>
                          {disco(j.id)}
                          <span className="campo-fila-texto">
                            <strong>{j.nombre}</strong>
                            <small className={`campo-num ${linea.tono}`}>{linea.texto}</small>
                          </span>
                        </button>
                        {!j.terminado ? (
                          <button
                            type="button"
                            className="campo-boton"
                            disabled={enCurso(profileActionState[j.id] || '')}
                            aria-label={`Sumar 1 minuto a ${j.nombre}`}
                            onClick={() => props.onAjustarTiempo(j.id, 60, '', { confirmado: true, retenerMs: 6000 })}
                          >
                            +1 min
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
                </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {pestana === 'avisos' ? (
          <AvisosDeCampo
            avisos={avisos}
            cargando={cargandoAvisos}
            error={errorAvisos}
            stages={stages}
            soloDe={avisosDe}
            estado={estadoDeLaRed}
            disco={(id) => disco(id, 'chico')}
            onFicha={abrirFicha}
            onRevisado={(a) => revisar(a, 'revisado')}
            onPenalizar={(a, segundos) => {
              props.onAjustarTiempo(a.profileId, segundos, `Aviso del antitrampa: ${a.s.reason}`, { confirmado: true })
              revisar(a, 'penalizado')
            }}
            onQuitarFiltro={() => setAvisosDe(null)}
            onRecargar={() => void cargarAvisos()}
          />
        ) : null}

        {pestana === 'mas' ? (
          <MasDeCampo
            pocos={pocos}
            onPocos={fijarPocos}
            exigirCerca={props.missionDraft.require_server_proximity === 'true'}
            onExigirCerca={(v) => props.onUpdateMissionDraft('require_server_proximity', v ? 'true' : 'false')}
            ajustesSinGuardar={props.ajustesSinGuardar}
            guardandoAjustes={props.settingsSaveState === 'saving'}
            errorAjustes={props.settingsSaveState === 'error' ? props.settingsSaveError : null}
            onGuardarAjustes={props.onSaveSettings}
            onAbrirEditor={props.onAbrirEditor}
            onSalir={props.onLogout}
          />
        ) : null}

        {sinEnviar.length > 0 ? (
          <div className="campo-pendientes" role="status" data-pendientes>
            <span>
              <strong>{sinEnviar.length === 1 ? '1 cambio sin enviar' : `${sinEnviar.length} cambios sin enviar`}</strong>
              <small>
                {sinEnviar.map((o) => `${nombreDe(o.profileId)}: ${o.etiqueta}`).join(' · ')}
                {colaNoSePuedeGuardar() ? ' · no cierres esta pestaña' : ''}
              </small>
            </span>
            <button type="button" className="campo-boton" onClick={() => reanudarCola()}>
              Reintentar
            </button>
            <button
              type="button"
              className="campo-boton"
              onClick={() => {
                if (window.confirm('¿Descartar los cambios sin enviar? No se enviarán.')) sinEnviar.forEach((o) => descartarOperacion(o.opId))
              }}
            >
              Descartar
            </button>
          </div>
        ) : null}

        <nav className="campo-pestanas" aria-label="Panel de campo">
          {(
            [
              ['mapa', 'Mapa'],
              ['avisos', 'Avisos'],
              ['mas', 'Más'],
            ] as const
          ).map(([clave, texto]) => (
            <button
              key={clave}
              type="button"
              aria-current={pestana === clave ? 'page' : undefined}
              onClick={() => {
                setPestana(clave)
                if (clave === 'mapa') setElegido(null)
                if (clave === 'avisos' && pestana !== 'avisos') setAvisosDe(null)
              }}
            >
              {ICONO[clave]}
              <span>{texto}</span>
              {clave === 'avisos' && sinRevisar > 0 ? <b className="campo-insignia campo-num">{sinRevisar}</b> : null}
            </button>
          ))}
        </nav>
      </div>

      {nota ? (
        <div className={`campo-nota${pestana === 'mapa' ? '' : ' abajo'}`} role="status">
          {nota}
        </div>
      ) : null}
    </main>
  )
}

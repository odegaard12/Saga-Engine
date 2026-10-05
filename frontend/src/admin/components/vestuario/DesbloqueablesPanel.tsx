import { useEffect, useMemo, useState } from 'react'
import {
  concederDesbloqueo,
  ensayarDesbloqueables,
  fetchDesbloqueables,
  guardarDesbloqueables,
  retirarDesbloqueo,
  type DesbloqueablesResponse,
  type ReglaVestuario,
} from '../../lib/adminApi'
import { describeAdminError } from '../../lib/adminErrors'
import {
  boton,
  botonPeligro,
  botonPrincipal,
  caja,
  chip,
  ETIQUETA_TIPO_PIEZA,
  fila,
  formatoHora,
  nota,
  notaError,
  notaOk,
  selector,
  tabla,
  tablaWrap,
  td,
  th,
} from './estilos'
import { idDeRegla, nombreDePieza, resumenDeEnsayo } from './vestuarioComun'

type Seccion = 'catalogo' | 'reglas' | 'jugadores' | 'eventos'

const TIPOS_PIEZA = ['mx', 'ropa', 'hair', 'item', 'gesto']

/**
 * Panel «Desbloqueables»: el vestuario que se gana jugando.
 *
 * Interruptor global (apagado por defecto: no cambia nada a nadie), catálogo
 * libre/bloqueado, reglas «cuando X → recibe Y» con «¿quién lo recibiría?» antes
 * de guardar, matriz jugador×pieza para regalar/retirar y el historial. La UI de
 * candados de la tienda del jugador va aparte. Ver backend/app/runtime/desbloqueos.py.
 */
export default function DesbloqueablesPanel() {
  const [datos, setDatos] = useState<DesbloqueablesResponse | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [seccion, setSeccion] = useState<Seccion>('reglas')
  const [borradorBloqueados, setBorradorBloqueados] = useState<string[] | null>(null)
  const [borradorReglas, setBorradorReglas] = useState<ReglaVestuario[] | null>(null)
  const [aplicarALoJugado, setAplicarALoJugado] = useState(true)
  const [ensayo, setEnsayo] = useState('')

  async function cargar() {
    setError('')
    try {
      const respuesta = await fetchDesbloqueables()
      setDatos(respuesta)
      setBorradorBloqueados(null)
      setBorradorReglas(null)
    } catch (e) {
      setError(describeAdminError(e, 'cargar'))
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  const catalogo = useMemo(() => datos?.catalogo || [], [datos])
  const bloqueados = useMemo(
    () => borradorBloqueados ?? catalogo.filter((p) => !p.libre).map((p) => p.clave),
    [borradorBloqueados, catalogo]
  )
  const reglas = borradorReglas ?? datos?.config.reglas ?? []
  const activos = Boolean(datos?.config.activos)

  async function guardar(cuerpo: Parameters<typeof guardarDesbloqueables>[0], exito: string) {
    setOcupado(true)
    setAviso('')
    setError('')
    try {
      const { httpStatus, data } = await guardarDesbloqueables(cuerpo)
      if (httpStatus === 409) {
        setError('Otra pestaña guardó antes. Recarga y vuelve a intentarlo.')
        return
      }
      if (httpStatus !== 200) {
        setError((data?.errores || [data?.detail || `HTTP ${httpStatus}`]).join(' · '))
        return
      }
      const recibidos = Object.keys(data?.concedidos || {}).length
      const cambiados = (data?.sustituciones || []).length
      setAviso(
        `${exito}${recibidos ? ` · ${recibidos} jugador(es) reciben piezas` : ''}${cambiados ? ` · ${cambiados} avatar(es) cambiados` : ''}`
      )
      await cargar()
    } catch (e) {
      setError(describeAdminError(e, 'guardar'))
    } finally {
      setOcupado(false)
    }
  }

  async function ensayarYConfirmar(
    cuerpo: Parameters<typeof ensayarDesbloqueables>[0],
    pregunta: string
  ) {
    const resultado = await ensayarDesbloqueables(cuerpo)
    const texto = resumenDeEnsayo(resultado, catalogo)
    setEnsayo(texto)
    return window.confirm(`${pregunta}\n\n${texto}`)
  }

  async function cambiarInterruptor() {
    if (!datos) return
    try {
      if (!activos) {
        const ok = await ensayarYConfirmar(
          { activar: true },
          'Encender los desbloqueables: las piezas bloqueadas se ganan jugando y las reglas se aplican a lo ya jugado.'
        )
        if (!ok) return
      } else if (
        !window.confirm(
          '¿Apagar los desbloqueables? Todo vuelve a estar libre (lo ganado se conserva).'
        )
      ) {
        return
      }
      await guardar(
        { revision: datos.config.revision, activos: !activos },
        activos ? 'Apagados' : 'Encendidos'
      )
    } catch (e) {
      setError(describeAdminError(e, 'guardar'))
    }
  }

  async function guardarCatalogo() {
    if (!datos) return
    try {
      if (activos) {
        const ok = await ensayarYConfirmar({ bloqueados }, '¿Guardar el catálogo?')
        if (!ok) return
      }
      await guardar({ revision: datos.config.revision, bloqueados }, 'Catálogo guardado')
    } catch (e) {
      setError(describeAdminError(e, 'guardar'))
    }
  }

  async function guardarReglas() {
    if (!datos) return
    try {
      if (activos && aplicarALoJugado) {
        const ok = await ensayarYConfirmar(
          { reglas },
          '¿Guardar las reglas y aplicarlas también a lo ya jugado?'
        )
        if (!ok) return
      }
      await guardar(
        { revision: datos.config.revision, reglas, aplicar_a_lo_jugado: aplicarALoJugado },
        'Reglas guardadas'
      )
    } catch (e) {
      setError(describeAdminError(e, 'guardar'))
    }
  }

  async function quienLoRecibiria() {
    try {
      setEnsayo(resumenDeEnsayo(await ensayarDesbloqueables({ reglas }), catalogo))
    } catch (e) {
      setError(describeAdminError(e, 'cargar'))
    }
  }

  async function alternarPieza(jugador: string, nombre: string, clave: string, tiene: boolean) {
    const pieza = nombreDePieza(catalogo, clave)
    try {
      if (tiene) {
        if (
          !window.confirm(
            `¿Retirar «${pieza}» a ${nombre}? Si la lleva puesta, se le pone otra libre.`
          )
        )
          return
        await retirarDesbloqueo({ jugador, clave, motivo: 'panel' })
      } else {
        if (!window.confirm(`¿Regalar «${pieza}» a ${nombre}?`)) return
        await concederDesbloqueo({
          jugadores: [jugador],
          claves: [clave],
          motivo: 'regalo del panel',
        })
      }
      await cargar()
    } catch (e) {
      setError(describeAdminError(e, 'guardar'))
    }
  }

  async function regalarATodos(regla: ReglaVestuario) {
    if (
      !window.confirm(
        `¿Regalar ${regla.da.map((c) => nombreDePieza(catalogo, c)).join(', ')} a todos los jugadores?`
      )
    )
      return
    try {
      const r = await concederDesbloqueo({
        todos: true,
        claves: regla.da,
        motivo: regla.nota || 'regalo de la organización',
      })
      setAviso(`Regalado a ${Object.keys(r.concedidos).length} jugador(es)`)
      await cargar()
    } catch (e) {
      setError(describeAdminError(e, 'guardar'))
    }
  }

  if (!datos) {
    return (
      <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
        <p style={error ? notaError : nota}>{error || 'Cargando…'}</p>
      </div>
    )
  }

  const piezasBloqueadas = catalogo.filter((p) => bloqueados.includes(p.clave))

  return (
    <div className="admin-cms-local-panel admin-settings-panel admin-panel-modern">
      <div className="admin-panel-hero">
        <div>
          <span className="admin-kicker">🎁 Vestuario</span>
          <h2>Desbloqueables</h2>
          <p>
            Lo especial de la tienda (tocados, objetos, colores y gestos) se gana jugando. Los 10
            personajes son libres siempre. Lo ganado es para siempre; con sospecha se concede igual
            (⚠) y en modo prueba no se gana nada.
          </p>
        </div>
        <div className="admin-panel-count">
          <strong>{datos.combinaciones_libres.toLocaleString()}</strong>
          <span>combinaciones libres</span>
        </div>
      </div>

      <section className="admin-settings-section-modern">
        <div style={fila}>
          <button
            type="button"
            style={activos ? botonPeligro : botonPrincipal}
            disabled={ocupado}
            onClick={() => void cambiarInterruptor()}
          >
            {activos ? 'Apagar desbloqueables' : 'Encender desbloqueables'}
          </button>
          <span style={{ ...nota, margin: 0 }}>
            {activos
              ? `Activos desde ${formatoHora(datos.config.activado_ms)}`
              : 'Apagados: a los jugadores no les cambia nada (todo libre).'}
          </span>
        </div>
        {error ? <p style={notaError}>{error}</p> : null}
        {aviso ? <p style={notaOk}>{aviso}</p> : null}
        <div style={{ ...fila, marginTop: 12 }}>
          {(['reglas', 'catalogo', 'jugadores', 'eventos'] as Seccion[]).map((s) => (
            <button
              key={s}
              type="button"
              style={seccion === s ? botonPrincipal : boton}
              onClick={() => setSeccion(s)}
            >
              {
                {
                  reglas: 'Reglas',
                  catalogo: 'Catálogo',
                  jugadores: 'Jugadores',
                  eventos: 'Historial',
                }[s]
              }
            </button>
          ))}
        </div>
      </section>

      {seccion === 'catalogo' ? (
        <section className="admin-settings-section-modern">
          <p style={nota}>
            Toca una pieza para pasarla de libre (verde) a «se gana jugando» (gris). Los personajes
            no se bloquean.
          </p>
          {TIPOS_PIEZA.map((tipo) => (
            <div key={tipo} style={caja}>
              <strong style={{ color: '#e2e8f0', fontSize: 13 }}>
                {ETIQUETA_TIPO_PIEZA[tipo]}
              </strong>
              <div style={{ ...fila, marginTop: 8 }}>
                {catalogo
                  .filter((p) => p.tipo === tipo)
                  .map((p) => {
                    const libre = !bloqueados.includes(p.clave)
                    return (
                      <button
                        key={p.clave}
                        type="button"
                        style={{
                          ...chip(libre, !libre && Boolean(p.sin_regla)),
                          cursor: p.bloqueable ? 'pointer' : 'default',
                        }}
                        disabled={!p.bloqueable}
                        title={libre ? 'Libre' : p.se_consigue || ''}
                        onClick={() =>
                          setBorradorBloqueados(
                            libre
                              ? [...bloqueados, p.clave]
                              : bloqueados.filter((c) => c !== p.clave)
                          )
                        }
                      >
                        {libre ? '✓' : p.sin_regla ? '⚠' : '🔒'} {p.nombre}
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
          <p style={nota}>
            ⚠ = bloqueada y ninguna regla la da (se podrá regalar o, más adelante, ganar en un
            cofre).
          </p>
          <div style={{ ...fila, marginTop: 10 }}>
            <button
              type="button"
              style={botonPrincipal}
              disabled={ocupado || borradorBloqueados === null}
              onClick={() => void guardarCatalogo()}
            >
              Guardar catálogo
            </button>
            <button
              type="button"
              style={boton}
              disabled={borradorBloqueados === null}
              onClick={() => setBorradorBloqueados(null)}
            >
              Descartar
            </button>
          </div>
        </section>
      ) : null}

      {seccion === 'reglas' ? (
        <section className="admin-settings-section-modern">
          {reglas.length === 0 ? <p style={nota}>Sin reglas todavía.</p> : null}
          {reglas.map((r) => (
            <div
              key={r.id}
              style={{
                ...caja,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                <strong>{textoDeRegla(r, datos)}</strong> →{' '}
                {r.da.map((c) => nombreDePieza(catalogo, c)).join(', ')}
              </div>
              <div style={fila}>
                {r.cuando.tipo === 'regalo_admin' ? (
                  <button
                    type="button"
                    style={boton}
                    disabled={ocupado || !activos}
                    onClick={() => void regalarATodos(r)}
                  >
                    Regalar a todos
                  </button>
                ) : null}
                <button
                  type="button"
                  style={botonPeligro}
                  onClick={() => setBorradorReglas(reglas.filter((x) => x.id !== r.id))}
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}

          <NuevaRegla
            datos={datos}
            piezas={piezasBloqueadas}
            onAnadir={(r) => setBorradorReglas([...reglas, { ...r, id: idDeRegla(r, reglas) }])}
          />

          <div style={{ ...fila, marginTop: 12 }}>
            <button
              type="button"
              style={boton}
              onClick={() => setBorradorReglas(fusionarPropuesta(reglas, datos.propuesta))}
            >
              Usar la propuesta inicial
            </button>
            <button type="button" style={boton} onClick={() => void quienLoRecibiria()}>
              ¿Quién lo recibiría?
            </button>
            <label
              style={{ ...nota, margin: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}
            >
              <input
                type="checkbox"
                checked={aplicarALoJugado}
                onChange={(e) => setAplicarALoJugado(e.target.checked)}
              />
              Aplicar también a lo ya jugado
            </label>
            <button
              type="button"
              style={botonPrincipal}
              disabled={ocupado || borradorReglas === null}
              onClick={() => void guardarReglas()}
            >
              Guardar reglas
            </button>
            <button
              type="button"
              style={boton}
              disabled={borradorReglas === null}
              onClick={() => setBorradorReglas(null)}
            >
              Descartar
            </button>
          </div>
          {ensayo ? (
            <pre style={{ ...caja, whiteSpace: 'pre-wrap', color: '#cbd5e1', fontSize: 12 }}>
              {ensayo}
            </pre>
          ) : null}
          <p style={nota}>
            Las reglas de un nodo concreto también se ponen desde el cajón del nodo («Recompensa de
            vestuario»).
          </p>
        </section>
      ) : null}

      {seccion === 'jugadores' ? (
        <section className="admin-settings-section-modern">
          <p style={nota}>
            ✓ ganada · ✋ regalada · ⚠ con sospecha · ✕ retirada. Toca una celda para regalar o
            retirar.
          </p>
          <div style={{ ...tablaWrap, marginTop: 8 }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Jugador</th>
                  <th style={th}>km</th>
                  {piezasBloqueadas.map((p) => (
                    <th key={p.clave} style={{ ...th, fontSize: 11 }} title={p.se_consigue}>
                      {p.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.jugadores.map((j) => (
                  <tr key={j.user}>
                    <td style={{ ...td, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {j.display_name}
                    </td>
                    <td style={td}>{(j.metros / 1000).toFixed(1)}</td>
                    {piezasBloqueadas.map((p) => {
                      const pieza = j.piezas[p.clave]
                      const tiene = Boolean(pieza && !pieza.retirado)
                      const marca = !pieza
                        ? '·'
                        : pieza.retirado
                          ? '✕'
                          : pieza.sospecha
                            ? '⚠'
                            : pieza.por === 'admin'
                              ? '✋'
                              : '✓'
                      return (
                        <td
                          key={p.clave}
                          style={{
                            ...td,
                            textAlign: 'center',
                            cursor: 'pointer',
                            color: tiene ? (pieza?.sospecha ? '#fbbf24' : '#86efac') : '#64748b',
                          }}
                          onClick={() => void alternarPieza(j.user, j.display_name, p.clave, tiene)}
                        >
                          {marca}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {seccion === 'eventos' ? (
        <section className="admin-settings-section-modern">
          {datos.eventos.length === 0 ? <p style={nota}>Aún no se ha concedido nada.</p> : null}
          <div style={tablaWrap}>
            <table style={tabla}>
              <tbody>
                {datos.eventos.map((e) => (
                  <tr key={e.id}>
                    <td style={td}>{formatoHora(e.creado_ms)}</td>
                    <td style={td}>
                      {datos.jugadores.find((j) => j.user === e.jugador)?.display_name || e.jugador}
                    </td>
                    <td style={{ ...td, color: e.accion === 'retirado' ? '#fca5a5' : '#86efac' }}>
                      {e.accion}
                    </td>
                    <td style={td}>{nombreDePieza(catalogo, e.clave)}</td>
                    <td style={td}>
                      {e.fuente}
                      {e.sospecha ? ' ⚠' : ''}
                      {e.motivo ? ` · ${e.motivo}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function textoDeRegla(regla: ReglaVestuario, datos: DesbloqueablesResponse): string {
  const guardada = datos.reglas.find(
    (r) => r.id === regla.id && JSON.stringify(r.cuando) === JSON.stringify(regla.cuando)
  )
  if (guardada?.texto) return guardada.texto
  const tipo = datos.tipos.find((t) => t.tipo === regla.cuando.tipo)
  const c = regla.cuando
  const nodo = c.nodo ? datos.nodos.find((n) => n.id === c.nodo)?.title || c.nodo : ''
  return `${tipo?.etiqueta || c.tipo}${nodo ? `: «${nodo}»` : c.n ? `: ${c.n}` : c.km ? `: ${c.km} km` : ''}`
}

/** La propuesta inicial, sin pisar las reglas de nodo que ya haya. */
function fusionarPropuesta(
  actuales: ReglaVestuario[],
  propuesta: ReglaVestuario[]
): ReglaVestuario[] {
  const deNodo = actuales.filter((r) => r.cuando.tipo === 'nodo')
  return [...propuesta.filter((p) => !deNodo.some((r) => r.id === p.id)), ...deNodo]
}

function NuevaRegla({
  datos,
  piezas,
  onAnadir,
}: {
  datos: DesbloqueablesResponse
  piezas: { clave: string; nombre: string }[]
  onAnadir: (regla: Omit<ReglaVestuario, 'id'>) => void
}) {
  const [tipo, setTipo] = useState('nodos')
  const [nodo, setNodo] = useState('')
  const [n, setN] = useState(3)
  const [km, setKm] = useState(5)
  const [da, setDa] = useState<string[]>([])
  const parametros = datos.tipos.find((t) => t.tipo === tipo)?.parametros || []

  function anadir() {
    if (!da.length) return
    const cuando: ReglaVestuario['cuando'] = { tipo }
    if (parametros.includes('nodo')) {
      if (!nodo) return
      cuando.nodo = nodo
    }
    if (parametros.includes('n')) cuando.n = Math.max(1, Math.round(n))
    if (parametros.includes('km')) cuando.km = Math.max(0.1, km)
    onAnadir({ cuando, da })
    setDa([])
  }

  return (
    <div style={caja}>
      <strong style={{ color: '#e2e8f0', fontSize: 13 }}>Nueva regla</strong>
      <div style={{ ...fila, marginTop: 8 }}>
        <span style={{ ...nota, margin: 0 }}>Cuando</span>
        <select style={selector} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {datos.tipos.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.etiqueta}
            </option>
          ))}
        </select>
        {parametros.includes('nodo') ? (
          <select style={selector} value={nodo} onChange={(e) => setNodo(e.target.value)}>
            <option value="">— elige nodo —</option>
            {datos.nodos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
        ) : null}
        {parametros.includes('n') ? (
          <input
            style={{ ...selector, width: 64 }}
            type="number"
            min={1}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
          />
        ) : null}
        {parametros.includes('km') ? (
          <input
            style={{ ...selector, width: 72 }}
            type="number"
            min={0.1}
            step={0.5}
            value={km}
            onChange={(e) => setKm(Number(e.target.value))}
          />
        ) : null}
      </div>
      <div style={{ ...fila, marginTop: 8 }}>
        <span style={{ ...nota, margin: 0 }}>recibe</span>
        {piezas.map((p) => {
          const marcada = da.includes(p.clave)
          return (
            <button
              key={p.clave}
              type="button"
              style={chip(marcada)}
              onClick={() => setDa(marcada ? da.filter((c) => c !== p.clave) : [...da, p.clave])}
            >
              {marcada ? '✓ ' : ''}
              {p.nombre}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        style={{ ...boton, marginTop: 8 }}
        disabled={!da.length}
        onClick={anadir}
      >
        Añadir regla
      </button>
    </div>
  )
}

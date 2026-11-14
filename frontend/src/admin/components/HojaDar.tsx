import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchDesbloqueables,
  type AdminReactOverviewStage,
  type DesbloqueablesResponse,
} from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'
import { darEstrellasPorCola, darPieza } from '../lib/accionesDeVestuario'
import { desbloqueablesRecordados, recordarDesbloqueables } from '../lib/estrellasEnCache'
import HojaDeConfirmacion from './HojaDeConfirmacion'

type Props = {
  profileId: string
  nombre: string
  nivel: number
  stages: AdminReactOverviewStage[]
  /** Lo que ya lleva en la mochila (ids). */
  enMochila: string[]
  onDarObjeto: (itemId: string) => void
  onCerrar: () => void
}

type Candidato = {
  clave: string
  titulo: string
  detalle: string
  grupo: 'objeto' | 'pieza' | 'estrella'
  /** El objeto lo da un nodo que el jugador aún no ha superado: darlo puede hacerle pasar de nodo. */
  avisoDeNivel?: string
  ejecutar: () => void
}

const ESTRELLAS = [1, 5, 10, -5]

/** Los objetos que reparte la ruta con el nodo que los da (coleccionables y premios de minijuego). */
function objetosDeLaRuta(stages: AdminReactOverviewStage[]) {
  const vistos = new Map<string, { label: string; nodo: number }>()
  stages.forEach((stage, i) => {
    const config = ((stage as unknown as { config?: Record<string, unknown> }).config ||
      {}) as Record<string, unknown>
    for (const [id, label] of [
      [stage.physical_item_id, stage.physical_item_label],
      [config.reward_item_id, config.reward_item_label],
    ] as const) {
      const clave = String(id || '').trim()
      if (clave && !vistos.has(clave)) vistos.set(clave, { label: String(label || clave), nodo: i })
    }
  })
  return [...vistos].map(([id, v]) => ({ id, ...v }))
}

/**
 * «Dar objeto o accesorio…»: una sola hoja con buscador para lo que se puede entregar a un jugador (objetos de la
 * mochila, accesorios y colores del vestuario, estrellas). Se carga solo al abrirla (lazy): no pesa en el panel.
 */
export default function HojaDar({
  profileId,
  nombre,
  nivel,
  stages,
  enMochila,
  onDarObjeto,
  onCerrar,
}: Props) {
  const idTitulo = useId()
  const hoja = useRef<HTMLDivElement>(null)
  const [datos, setDatos] = useState<DesbloqueablesResponse | null>(desbloqueablesRecordados())
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState<Candidato | null>(null)
  const [idManual, setIdManual] = useState('')

  useEffect(() => {
    hoja.current?.focus()
    let vivo = true
    fetchDesbloqueables()
      .then((r) => {
        recordarDesbloqueables(r)
        if (vivo) setDatos(r)
      })
      .catch((e) => {
        if (vivo) setError(describeAdminError(e, 'cargar'))
      })
    return () => {
      vivo = false
    }
  }, [])

  const candidatos = useMemo(() => {
    const lista: Candidato[] = []
    for (const o of objetosDeLaRuta(stages)) {
      lista.push({
        clave: `obj:${o.id}`,
        titulo: o.label,
        detalle: enMochila.includes(o.id)
          ? `Ya lo lleva · lo da el nodo ${o.nodo + 1}`
          : `Objeto de mochila · lo da el nodo ${o.nodo + 1}`,
        grupo: 'objeto',
        avisoDeNivel:
          o.nodo >= nivel
            ? `Lo da el nodo ${o.nodo + 1}, que ${nombre} aún no ha superado: si se lo das, puede pasar de nodo sin jugarlo.`
            : undefined,
        ejecutar: () => onDarObjeto(o.id),
      })
    }
    const jugador = datos?.jugadores.find((j) => j.user === profileId)
    for (const p of datos?.catalogo || []) {
      const lleva = Boolean(jugador?.piezas?.[p.clave] && !jugador.piezas[p.clave].retirado)
      if (p.libre && !lleva) continue // lo libre lo tiene todo el mundo: no hace falta darlo
      lista.push({
        clave: `pieza:${p.clave}`,
        titulo: p.nombre,
        detalle: lleva ? 'Accesorio · ya lo tiene' : 'Accesorio bloqueado en la tienda',
        grupo: 'pieza',
        ejecutar: () => void darPieza(profileId, nombre, p.clave, p.nombre),
      })
    }
    for (const n of ESTRELLAS) {
      lista.push({
        clave: `est:${n}`,
        titulo: `${n > 0 ? '+' : '−'}${Math.abs(n)} ${Math.abs(n) === 1 ? 'estrella' : 'estrellas'}`,
        detalle: n > 0 ? 'Para comprar piezas en la tienda' : 'Quita estrellas de su saldo',
        grupo: 'estrella',
        ejecutar: () => void darEstrellasPorCola(profileId, nombre, n),
      })
    }
    return lista
  }, [datos, stages, profileId, nombre, nivel, enMochila, onDarObjeto])

  const q = busqueda.trim().toLowerCase()
  const visibles = candidatos.filter(
    (c) => !q || `${c.titulo} ${c.detalle}`.toLowerCase().includes(q)
  )
  const GRUPOS: Array<[Candidato['grupo'], string]> = [
    ['objeto', 'Objetos de la mochila'],
    ['pieza', 'Accesorios y vestuario'],
    ['estrella', 'Estrellas'],
  ]

  if (elegido) {
    return (
      <HojaDeConfirmacion
        titulo={`Dar «${elegido.titulo}» a ${nombre}`}
        intro="Lo verá en su móvil al reconectar."
        avisos={elegido.avisoDeNivel ? [elegido.avisoDeNivel] : []}
        textoConfirmar="Dar"
        onCancelar={() => setElegido(null)}
        onConfirmar={() => {
          elegido.ejecutar()
          onCerrar()
        }}
      />
    )
  }

  const idLimpio = idManual.trim()
  return createPortal(
    <div
      className="r8-hoja-fondo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div
        ref={hoja}
        className="r8-hoja"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCerrar()
        }}
      >
        <h3 id={idTitulo}>Dar a {nombre}</h3>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar un objeto, accesorio o estrellas…"
          aria-label="Buscar qué dar"
        />
        {error ? (
          <div className="r8-aviso" role="alert">
            {error} Los objetos de la ruta sí se pueden dar.
          </div>
        ) : null}
        {!datos && !error ? <p role="status">Cargando accesorios…</p> : null}
        {GRUPOS.map(([grupo, titulo]) => {
          const items = visibles.filter((c) => c.grupo === grupo)
          if (items.length === 0) return null
          return (
            <div key={grupo}>
              <p className="r8-grupo-dar">{titulo}</p>
              <ul className="r8-lista-dar">
                {items.map((c) => (
                  <li key={c.clave}>
                    <strong>{c.titulo}</strong>
                    <small>{c.detalle}</small>
                    <button
                      type="button"
                      className="r8-boton"
                      aria-label={`Dar ${c.titulo} a ${nombre}`}
                      onClick={() => setElegido(c)}
                    >
                      <strong>Dar</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {visibles.length === 0 && datos ? <p>Nada coincide con «{busqueda.trim()}».</p> : null}
        <div>
          <p className="r8-grupo-dar">Un objeto que no está en la lista</p>
          <div className="r8-fila-botones">
            <input
              type="text"
              value={idManual}
              placeholder="Identificador del objeto"
              aria-label="Identificador del objeto"
              onChange={(e) => setIdManual(e.target.value)}
            />
            <button
              type="button"
              className="r8-boton corto"
              disabled={!idLimpio}
              onClick={() =>
                setElegido({
                  clave: `man:${idLimpio}`,
                  titulo: idLimpio,
                  detalle: '',
                  grupo: 'objeto',
                  avisoDeNivel:
                    'No es un objeto de la ruta: si fue una errata, quítaselo de la mochila después.',
                  ejecutar: () => onDarObjeto(idLimpio),
                })
              }
            >
              <strong>Dar</strong>
            </button>
          </div>
        </div>
        <div className="r8-pie">
          <button type="button" className="r8-boton" onClick={onCerrar}>
            <strong>Cerrar</strong>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

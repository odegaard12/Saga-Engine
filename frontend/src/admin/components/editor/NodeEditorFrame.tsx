/**
 * Marco común del editor de nodo (ronda 7).
 *
 * Antes: tres pestañas («1. Tipo y Reglas», «2. Ajustes», «3. Historia») con una
 * pila plana de campos iguales. Ahora:
 *
 *  - cabecera FIJA con nombre, tipo, estado, «cambios sin guardar» y las
 *    acciones jerarquizadas (Guardar primaria; Cerrar, Cambiar tipo y Eliminar
 *    detrás);
 *  - índice lateral de secciones con su estado (escritorio);
 *  - secciones colapsables con un RESUMEN visible cuando están cerradas;
 *  - vista previa del móvil del jugador a la derecha (pantallas anchas);
 *  - en el móvil, pantalla completa por secciones y barra inferior.
 *
 * No toca datos: cada editor sigue parcheando el nodo con sus mismas claves.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { NivelNodo, SeccionEditor } from '../../lib/estadoNodo'
import { ETIQUETA_NIVEL } from '../../lib/estadoNodo'

export type EstadoGuardado = 'idle' | 'saving' | 'saved' | 'error' | 'dirty'

export type SeccionDef = {
  id: SeccionEditor
  titulo: string
  icono: string
  /** Una línea con lo más importante de lo que hay dentro. */
  resumen: string
  nivel?: NivelNodo
  avisos?: string[]
  abierta?: boolean
  contenido: ReactNode
}

type Contexto = {
  abiertas: Set<string>
  alternar: (id: string) => void
}

const ContextoSecciones = createContext<Contexto | null>(null)

function SeccionEditorVista({ def }: { def: SeccionDef }) {
  const contexto = useContext(ContextoSecciones)
  if (!contexto) return null
  const abierta = contexto.abiertas.has(def.id)
  const nivel = def.nivel ?? 'ok'
  return (
    <section
      id={`r7-sec-${def.id}`}
      className={`r7-sec ${abierta ? 'abierta' : ''} nivel-${nivel}`}
      aria-labelledby={`r7-sec-t-${def.id}`}
    >
      <h3 className="r7-sec-cabeza" id={`r7-sec-t-${def.id}`}>
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={`r7-sec-c-${def.id}`}
          onClick={() => contexto.alternar(def.id)}
        >
          <span className="r7-sec-icono" aria-hidden="true">
            {def.icono}
          </span>
          <span className="r7-sec-titulos">
            <strong>{def.titulo}</strong>
            {!abierta ? <small>{def.resumen}</small> : null}
          </span>
          {nivel !== 'ok' ? (
            <span className={`r7-pildora ${nivel}`}>{ETIQUETA_NIVEL[nivel]}</span>
          ) : null}
          <span className="r7-sec-flecha" aria-hidden="true">
            ›
          </span>
        </button>
      </h3>
      {abierta ? (
        <div className="r7-sec-cuerpo" id={`r7-sec-c-${def.id}`}>
          {def.avisos && def.avisos.length > 0 ? (
            <ul className="r7-avisos" role="alert">
              {def.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          ) : null}
          <div className="r7-sec-campos">{def.contenido}</div>
        </div>
      ) : null}
    </section>
  )
}

export type NodeEditorFrameProps = {
  /** «#3» para la cabecera. */
  numero: number
  titulo: string
  onTitulo: (valor: string) => void
  tipoIcono: string
  tipoTexto: string
  nivel: NivelNodo
  /** Frases de estado (los avisos accionables de `estadoNodo`). */
  motivos: string[]
  coordenadas: string
  estadoGuardado: EstadoGuardado
  onGuardar?: () => void
  onCerrar: () => void
  onEliminar: () => void
  onCambiarTipo: () => void
  secciones: SeccionDef[]
  /** Pide abrir y llevar a una sección (cada `n` nuevo es una petición nueva). */
  solicitud?: { id: SeccionEditor; n: number } | null
  /** Aviso corto que se queda visible arriba (p. ej. «Revisa el laberinto»). */
  aviso?: string | null
  vistaPrevia?: ReactNode
  etiquetaTipoEditor?: string
}

const TEXTO_GUARDADO: Record<EstadoGuardado, string> = {
  idle: 'Sin cambios',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'Error al guardar',
  dirty: 'Cambios sin guardar',
}

export default function NodeEditorFrame({
  numero,
  titulo,
  onTitulo,
  tipoIcono,
  tipoTexto,
  nivel,
  motivos,
  coordenadas,
  estadoGuardado,
  onGuardar,
  onCerrar,
  onEliminar,
  onCambiarTipo,
  secciones,
  solicitud,
  aviso,
  vistaPrevia,
  etiquetaTipoEditor = 'Editor de nodo',
}: NodeEditorFrameProps) {
  const [abiertas, setAbiertas] = useState<Set<string>>(
    () => new Set(secciones.filter((seccion) => seccion.abierta).map((seccion) => seccion.id))
  )
  const [verPrevia, setVerPrevia] = useState(false)
  const [menuMas, setMenuMas] = useState(false)
  const cuerpoRef = useRef<HTMLDivElement>(null)

  const alternar = useCallback((id: string) => {
    setAbiertas((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }, [])

  const contexto = useMemo(() => ({ abiertas, alternar }), [abiertas, alternar])

  // Se abre sola la sección que tiene un aviso (una vez por sección y nodo).
  const avisadas = useRef<Set<string>>(new Set())
  useEffect(() => {
    secciones.forEach((seccion) => {
      if (seccion.avisos?.length && !avisadas.current.has(seccion.id)) {
        avisadas.current.add(seccion.id)
        setAbiertas((actual) => (actual.has(seccion.id) ? actual : new Set(actual).add(seccion.id)))
      }
    })
  }, [secciones])

  function irA(id: string) {
    setAbiertas((actual) => (actual.has(id) ? actual : new Set(actual).add(id)))
    window.setTimeout(() => {
      const destino = document.getElementById(`r7-sec-${id}`)
      const cuerpo = cuerpoRef.current
      if (destino && cuerpo) {
        cuerpo.scrollTo({ top: destino.offsetTop - cuerpo.offsetTop - 8, behavior: 'smooth' })
      }
    }, 30)
  }

  const ultimaSolicitud = useRef(0)
  useEffect(() => {
    if (solicitud && solicitud.n !== ultimaSolicitud.current) {
      ultimaSolicitud.current = solicitud.n
      irA(solicitud.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitud])

  function alTeclear(evento: React.KeyboardEvent<HTMLDivElement>) {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 's') {
      evento.preventDefault()
      onGuardar?.()
    } else if (evento.key === 'Escape' && !(evento.target as HTMLElement).closest('select')) {
      onCerrar()
    }
  }

  return (
    <ContextoSecciones.Provider value={contexto}>
      <div className="r7-editor" onKeyDown={alTeclear} aria-label={etiquetaTipoEditor}>
        <header className="r7-cabecera">
          <div className="r7-cabecera-nombre">
            <span className="r7-cabecera-numero" aria-hidden="true">
              {numero}
            </span>
            <div className="r7-cabecera-campo">
              <label htmlFor="r7-nombre-nodo">Nombre del nodo</label>
              <input
                id="r7-nombre-nodo"
                type="text"
                value={titulo}
                onChange={(evento) => onTitulo(evento.target.value)}
                placeholder="Ej. Senda forestal norte"
              />
            </div>
          </div>

          <div className="r7-cabecera-meta">
            <span className="r7-chip">
              <span aria-hidden="true">{tipoIcono}</span> {tipoTexto}
            </span>
            <span className={`r7-pildora ${nivel}`} title={motivos.join(' · ')}>
              {ETIQUETA_NIVEL[nivel]}
            </span>
            {coordenadas ? <span className="r7-chip suave">{coordenadas}</span> : null}
            <span className={`r7-guardado ${estadoGuardado}`} role="status" aria-live="polite">
              <i aria-hidden="true" />
              {TEXTO_GUARDADO[estadoGuardado]}
            </span>
          </div>

          <div className="r7-cabecera-acciones">
            {onGuardar ? (
              <button
                type="button"
                className="r7-boton primario"
                onClick={onGuardar}
                disabled={estadoGuardado === 'saving'}
                title="Guardar la misión (Ctrl+S)"
              >
                {estadoGuardado === 'saving' ? 'Guardando…' : 'Guardar'}
              </button>
            ) : null}
            <button type="button" className="r7-boton" onClick={onCerrar} title="Cerrar (Esc)">
              Cerrar
            </button>
            <div className="r7-mas">
              <button
                type="button"
                className="r7-boton suave"
                aria-haspopup="menu"
                aria-expanded={menuMas}
                aria-label="Más acciones"
                onClick={() => setMenuMas((valor) => !valor)}
              >
                ⋯
              </button>
              {menuMas ? (
                <div className="r7-mas-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuMas(false)
                      onCambiarTipo()
                    }}
                  >
                    Cambiar tipo de nodo
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="peligro"
                    onClick={() => {
                      setMenuMas(false)
                      onEliminar()
                    }}
                  >
                    Eliminar nodo
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="r7-cuerpo-editor">
          <nav className="r7-indice" aria-label="Secciones del editor">
            {secciones.map((seccion) => (
              <button
                key={seccion.id}
                type="button"
                className={`nivel-${seccion.nivel ?? 'ok'}`}
                onClick={() => irA(seccion.id)}
              >
                <span aria-hidden="true">{seccion.icono}</span>
                <span>{seccion.titulo}</span>
                {seccion.nivel && seccion.nivel !== 'ok' ? (
                  <i aria-label={ETIQUETA_NIVEL[seccion.nivel]} />
                ) : null}
              </button>
            ))}
            {vistaPrevia ? (
              <button
                type="button"
                className="r7-indice-previa"
                onClick={() => setVerPrevia((v) => !v)}
              >
                <span aria-hidden="true">📱</span>
                <span>Vista previa</span>
              </button>
            ) : null}
          </nav>

          <div className="r7-secciones" ref={cuerpoRef}>
            {aviso ? (
              <div className="r7-resumen-estado aviso" role="alert">
                <strong>{aviso}</strong>
              </div>
            ) : null}
            {motivos.length > 0 ? (
              <div className={`r7-resumen-estado ${nivel}`} role="status">
                <strong>{nivel === 'aviso' ? 'Revisa la ruta' : 'Falta por completar'}</strong>
                <ul>
                  {motivos.map((motivo) => (
                    <li key={motivo}>{motivo}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {secciones.map((seccion) => (
              <SeccionEditorVista key={seccion.id} def={seccion} />
            ))}
          </div>

          {vistaPrevia ? (
            <aside
              className={`r7-previa ${verPrevia ? 'abierta' : ''}`}
              aria-label="Vista previa del móvil del jugador"
            >
              <div className="r7-previa-titulo">
                <strong>Así lo ve el jugador</strong>
                <button
                  type="button"
                  className="r7-previa-cerrar"
                  onClick={() => setVerPrevia(false)}
                >
                  Cerrar vista previa
                </button>
              </div>
              {vistaPrevia}
            </aside>
          ) : null}
        </div>

        <footer className="r7-pie-movil">
          {vistaPrevia ? (
            <button type="button" className="r7-boton" onClick={() => setVerPrevia((v) => !v)}>
              📱 Vista previa
            </button>
          ) : null}
          <button type="button" className="r7-boton" onClick={onCerrar}>
            Cerrar
          </button>
          {onGuardar ? (
            <button
              type="button"
              className="r7-boton primario"
              onClick={onGuardar}
              disabled={estadoGuardado === 'saving'}
            >
              {estadoGuardado === 'saving' ? 'Guardando…' : 'Guardar'}
            </button>
          ) : null}
        </footer>
      </div>
    </ContextoSecciones.Provider>
  )
}

/** Campo de texto con etiqueta clara, ayuda debajo y contador (opcional). */
export function CampoTexto({
  etiqueta,
  ayuda,
  valor,
  onCambio,
  filas = 3,
  max,
  placeholder,
  ancho = true,
}: {
  etiqueta: string
  ayuda?: string
  valor: string
  onCambio: (valor: string) => void
  filas?: number
  max?: number
  placeholder?: string
  ancho?: boolean
}) {
  const largo = valor.length
  return (
    <label className={`r7-campo${ancho ? ' ancho' : ''}`}>
      <span className="r7-campo-etiqueta">{etiqueta}</span>
      <textarea
        value={valor}
        rows={filas}
        placeholder={placeholder}
        onChange={(evento) => onCambio(evento.target.value)}
      />
      <span className="r7-campo-pie">
        {ayuda ? <small>{ayuda}</small> : <span />}
        {max ? (
          <small
            className={largo > max ? 'excede' : ''}
            aria-label={`${largo} de ${max} caracteres`}
          >
            {largo}/{max}
          </small>
        ) : null}
      </span>
    </label>
  )
}

/** Maqueta del móvil del jugador: título, tipo, prólogo, texto y pista. */
export function MaquetaMovil({
  titulo,
  tipo,
  tipoIcono,
  prologoTitulo,
  prologo,
  texto,
  pista,
  accion,
}: {
  titulo: string
  tipo: string
  tipoIcono: string
  prologoTitulo?: string
  prologo?: string
  texto?: string
  pista?: string
  accion: string
}) {
  return (
    <div className="r7-movil" aria-hidden="true">
      <div className="r7-movil-barra" />
      <div className="r7-movil-pantalla">
        <div className="r7-movil-tipo">
          {tipoIcono} {tipo}
        </div>
        <h4>{titulo || 'Nodo sin nombre'}</h4>
        {prologoTitulo ? <h5>{prologoTitulo}</h5> : null}
        {prologo ? <p className="prologo">{prologo}</p> : null}
        {texto ? <p>{texto}</p> : null}
        {!prologo && !texto ? <p className="vacio">Aún no hay texto para el jugador.</p> : null}
        <div className="r7-movil-accion">{accion}</div>
        {pista ? <div className="r7-movil-pista">💡 {pista}</div> : null}
      </div>
    </div>
  )
}

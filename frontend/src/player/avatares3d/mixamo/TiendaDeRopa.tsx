import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getLocale } from '../../../i18n'
import { claveDeAvatar } from '../../avatares/avatarConfig'
import {
  aplicarConjunto,
  COLORES_DE_PELO,
  COLORES_DE_ROPA,
  COMPLEMENTOS,
  conComplemento,
  configDeAspecto,
  CONJUNTOS,
  GESTOS,
  HUECOS,
  MX_IDS,
  MX_NOMBRES,
  sinComplemento,
  sustituidosPor,
  type Aspecto,
  type ColorDeRopa,
  type Complemento,
  type MxId,
} from './catalogo'
import { useAreaVisible } from './areaVisible'
import { urlDeCara } from './rutas'
import { idiomaDeTienda, TEXTOS_TIENDA } from './textosTienda'
import './tienda.css'
import type { EscenaDeTienda } from './escenaTienda'

/**
 * La tienda de ropa: elegir personaje, colores, pelo, conjuntos, complementos y
 * probar gestos, viendo el resultado en 3D. Sólo presenta y sostiene el aspecto
 * que se está probando; lo que se guarda y cómo lo decide `GestorDePersonaje`.
 *
 * Es una capa fija propia en el `body` (dentro del mapa quedaba por debajo de la
 * barra de iconos). `pleno`: antes de la pantalla de carga, a pantalla completa y
 * sin cancelar. Se carga el escenario 3D con una importación diferida: el
 * jugador que no abre la tienda no paga ni un byte de three.js de la tienda.
 */

type Pestana = 'pj' | 'ropa' | 'con' | 'obj' | 'ges'
const PESTANAS: { id: Pestana; icono: string }[] = [
  { id: 'pj', icono: '🙂' },
  { id: 'ropa', icono: '👕' },
  { id: 'con', icono: '✨' },
  { id: 'obj', icono: '🎒' },
  { id: 'ges', icono: '👋' },
]

function Muestra({ color }: { color: ColorDeRopa }) {
  const fondo = color.plaid
    ? `repeating-linear-gradient(45deg,${color.plaid.a} 0 4px,${color.tint} 4px 8px,${color.plaid.b} 8px 9px,${color.tint} 9px 14px)`
    : color.tint
  return (
    <span className="saga-tienda-muestra-color" style={{ background: fondo }} aria-hidden="true" />
  )
}

function Cara({ id, activo, enUso = 0, textoEnUso }: { id: MxId; activo: boolean; enUso?: number; textoEnUso?: string }) {
  const [fallo, setFallo] = useState(false)
  const url = urlDeCara(id)
  return (
    <span className={`saga-tienda-cara${activo ? ' saga-tienda-cara-activa' : ''}`}>
      {fallo || !url ? (
        <span className="saga-tienda-cara-inicial">{MX_NOMBRES[id].slice(0, 1)}</span>
      ) : (
        <img src={url} alt="" draggable={false} onError={() => setFallo(true)} />
      )}
      {enUso > 0 ? (
        // Sólo informativo: lo lleva alguien más (no bloquea). El número, sin nombres.
        <span className="saga-tienda-en-uso" title={textoEnUso} aria-hidden="true">
          {enUso > 9 ? '9+' : enUso}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Una fila de colores que se desliza en horizontal (un solo renglón, con arrastre inercial): las tres
 * paletas caben a la vez sin desplazar la hoja. Al montar deja a la vista el color puesto.
 */
function FilaDeColores({ children, activo }: { children: ReactNode; activo: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const fila = ref.current
    const puesto = fila?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!fila || !puesto) return
    const quiero = puesto.offsetLeft - (fila.clientWidth - puesto.offsetWidth) / 2
    fila.scrollLeft = Math.max(0, quiero)
    // Sólo al montar: después manda el dedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="saga-tienda-fila saga-tienda-carrusel" ref={ref} data-activo={activo}>
      {children}
    </div>
  )
}

export function TiendaDeRopa({
  pleno,
  aspectoInicial,
  ocupadas,
  enUso = {},
  guardando,
  mensaje,
  sinCobertura,
  alConfirmar,
  alCancelar,
}: {
  pleno: boolean
  aspectoInicial: Aspecto
  /** Las claves (`claveDeAvatar`) de lo que ya llevan los demás. */
  ocupadas: ReadonlySet<string>
  /** Cuántos de los demás llevan cada personaje (`{ Ch01: 2 }`): sólo informativo, no bloquea. */
  enUso?: Readonly<Record<string, number>>
  guardando: boolean
  mensaje: string | null
  sinCobertura?: boolean
  alConfirmar: (aspecto: Aspecto) => void
  alCancelar?: () => void
}) {
  useAreaVisible()
  const locale = getLocale()
  const idioma = idiomaDeTienda(locale)
  const t = TEXTOS_TIENDA[idioma]
  const [aspecto, setAspecto] = useState<Aspecto>(aspectoInicial)
  const [pestana, setPestana] = useState<Pestana>('pj')
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinwebgl'>('cargando')
  const [progreso, setProgreso] = useState(0)
  const [miniaturas, setMiniaturas] = useState<Partial<Record<Complemento, string>>>({})
  const escenarioRef = useRef<HTMLDivElement | null>(null)
  const escenaRef = useRef<EscenaDeTienda | null>(null)
  const aspectoRef = useRef(aspecto)
  aspectoRef.current = aspecto
  const [intento, setIntento] = useState(0)

  // El escenario 3D: se crea al abrir y se suelta al cerrar.
  useEffect(() => {
    const contenedor = escenarioRef.current
    if (!contenedor) return undefined
    let vivo = true
    let escena: EscenaDeTienda | null = null
    setEstado('cargando')
    setProgreso(0)
    void (async () => {
      try {
        const m = await import('./escenaTienda')
        if (!vivo) return
        escena = m.crearEscenaDeTienda(contenedor, {
          permitirRed: true,
          alProgreso: (c, total) => vivo && setProgreso(total > 0 ? Math.min(1, c / total) : 0),
          alPerderContexto: () => vivo && setEstado('sinwebgl'),
        })
        escenaRef.current = escena
        // Herramientas de desarrollo (regenerar retratos y ajustes): sólo con ?depurar-mapa.
        if (/depurar-mapa/.test(window.location.search)) void import('./depuracion').then((d) => d.instalarDepuracion())
        await escena.mostrar(aspectoRef.current)
        if (vivo) setEstado('listo')
      } catch (e) {
        if (!vivo) return
        const sinGl = e instanceof Error && /webgl/i.test(e.message)
        setEstado(sinGl ? 'sinwebgl' : 'error')
      }
    })()
    return () => {
      vivo = false
      escenaRef.current = null
      escena?.destruir()
    }
  }, [intento])

  // Cada cambio de aspecto llega al escenario (si cambia el personaje, baja el modelo que falte).
  useEffect(() => {
    const escena = escenaRef.current
    if (!escena || estado !== 'listo') return
    if (escena.actual() === aspecto.mx) escena.aplicar(aspecto)
    else {
      setEstado('cargando')
      escena
        .mostrar(aspecto)
        .then(() => setEstado('listo'))
        .catch(() => setEstado('error'))
    }
  }, [aspecto, estado])

  // Retratos de los complementos: uno por fotograma, sólo al abrir la pestaña de objetos.
  useEffect(() => {
    if (pestana !== 'obj' || estado !== 'listo') return undefined
    const escena = escenaRef.current
    if (!escena) return undefined
    let vivo = true
    const todos = HUECOS.flatMap((h) => h.items)
    const hacer = (i: number) => {
      if (!vivo || i >= todos.length) return
      const item = todos[i]
      try {
        const url = escena.miniaturaDe(item)
        if (url) setMiniaturas((prev) => (prev[item] === url ? prev : { ...prev, [item]: url }))
      } catch {
        // Sin retrato: la tarjeta sale con el nombre solo.
      }
      window.setTimeout(() => hacer(i + 1), 0)
    }
    window.setTimeout(() => hacer(0), 30)
    return () => {
      vivo = false
    }
  }, [pestana, estado, aspecto.mx])

  // Al cambiar de personaje los retratos de objetos se rehacen con el nuevo.
  useEffect(() => {
    setMiniaturas({})
  }, [aspecto.mx])

  const tomado = ocupadas.has(claveDeAvatar(configDeAspecto(aspecto)))
  const cambiar = useCallback(
    (cambio: Partial<Aspecto>) => setAspecto((a) => ({ ...a, ...cambio })),
    []
  )
  const manos = useMemo(() => {
    const s = new Set<string>()
    for (const c of Object.values(aspecto.items))
      if (c) for (const m of COMPLEMENTOS[c].ocupa) s.add(m)
    return s
  }, [aspecto.items])

  const nombreColor = (c: ColorDeRopa) => (idioma === 'gl' ? c.gl : c.es)
  /**
   * Lo que se quitará al ponerlo por ocupar la misma mano desde otro hueco (la gaita y el bordón, por ejemplo).
   * Nada se bloquea: elegir un objeto para una mano ocupada SUSTITUYE al anterior (ver `conComplemento`).
   */
  const queSustituye = (c: Complemento): string => {
    if (aspecto.items[COMPLEMENTOS[c].hueco] === c) return ''
    const otros = sustituidosPor(c, aspecto.items).filter((o) => COMPLEMENTOS[o].hueco !== COMPLEMENTOS[c].hueco)
    if (!otros.length) return ''
    return `${t.sustituye} ${otros.map((o) => (idioma === 'gl' ? COMPLEMENTOS[o].gl : COMPLEMENTOS[o].es)).join(idioma === 'gl' ? ' e ' : ' y ')}`
  }

  const cuerpo = (() => {
    if (pestana === 'pj')
      return (
        <>
          <h2>
            {t.personaje} <b>{MX_NOMBRES[aspecto.mx]}</b>
          </h2>
          <div className="saga-tienda-fila" role="radiogroup" aria-label={t.personaje}>
            {MX_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === aspecto.mx}
                aria-label={MX_NOMBRES[id]}
                className="saga-tienda-boton-cara"
                onClick={() => cambiar({ mx: id })}
              >
                <Cara id={id} activo={id === aspecto.mx} enUso={enUso[id] ?? 0} textoEnUso={t.enUso(enUso[id] ?? 0)} />
                <span className="saga-tienda-nombre-cara">{MX_NOMBRES[id]}</span>
                {(enUso[id] ?? 0) > 0 ? <span className="saga-tienda-solo-lector">{t.enUso(enUso[id] ?? 0)}</span> : null}
              </button>
            ))}
          </div>
          {Object.values(enUso).some((n) => n > 0) ? (
            <p className="saga-tienda-ayuda-linea saga-tienda-leyenda-en-uso">
              <span className="saga-tienda-en-uso saga-tienda-en-uso-leyenda" aria-hidden="true" />
              {t.enUsoAyuda}
            </p>
          ) : null}
        </>
      )
    if (pestana === 'ropa')
      return (
        <>
          <h2>
            {t.colorCamiseta} <b>{nombreColor(COLORES_DE_ROPA[aspecto.top])}</b>
          </h2>
          <FilaDeColores activo={aspecto.top}>
            {COLORES_DE_ROPA.map((c, i) => (
              <button
                key={`t${i}`}
                type="button"
                className={`saga-tienda-color${i === aspecto.top ? ' saga-tienda-color-activo' : ''}`}
                aria-label={nombreColor(c)}
                aria-pressed={i === aspecto.top}
                onClick={() => cambiar({ top: i })}
              >
                <Muestra color={c} />
              </button>
            ))}
          </FilaDeColores>
          <h2>
            {t.colorPantalon} <b>{nombreColor(COLORES_DE_ROPA[aspecto.pants])}</b>
          </h2>
          <FilaDeColores activo={aspecto.pants}>
            {COLORES_DE_ROPA.map((c, i) => (
              <button
                key={`p${i}`}
                type="button"
                className={`saga-tienda-color${i === aspecto.pants ? ' saga-tienda-color-activo' : ''}`}
                aria-label={nombreColor(c)}
                aria-pressed={i === aspecto.pants}
                onClick={() => cambiar({ pants: i })}
              >
                <Muestra color={c} />
              </button>
            ))}
          </FilaDeColores>
          <h2>
            {t.pelo} <b>{nombreColor(COLORES_DE_PELO[aspecto.hair])}</b>
          </h2>
          <FilaDeColores activo={aspecto.hair}>
            {COLORES_DE_PELO.map((c, i) => (
              <button
                key={`h${i}`}
                type="button"
                className={`saga-tienda-color${i === aspecto.hair ? ' saga-tienda-color-activo' : ''}`}
                aria-label={nombreColor(c)}
                aria-pressed={i === aspecto.hair}
                onClick={() => cambiar({ hair: i })}
              >
                <Muestra color={c} />
              </button>
            ))}
          </FilaDeColores>
        </>
      )
    if (pestana === 'con')
      return (
        <>
          <h2>{t.conjuntos}</h2>
          <p className="saga-tienda-ayuda-linea">{t.conjuntosAyuda}</p>
          <div className="saga-tienda-fichas">
            {CONJUNTOS.map((c) => (
              <button
                key={c.es}
                type="button"
                className="saga-tienda-ficha"
                onClick={() => setAspecto((a) => aplicarConjunto(a, c))}
              >
                {idioma === 'gl' ? c.gl : c.es}
              </button>
            ))}
          </div>
        </>
      )
    if (pestana === 'obj') {
      const puestos = Object.values(aspecto.items).filter(Boolean) as Complemento[]
      return (
        <>
          <div className="saga-tienda-resumen">
            <span>
              {t.equipado}:{' '}
              <b>
                {puestos.length
                  ? puestos
                      .map((c) => (idioma === 'gl' ? COMPLEMENTOS[c].gl : COMPLEMENTOS[c].es))
                      .join(' · ')
                  : t.equipadoNada}
              </b>
            </span>
            <span>
              {t.manos}:{' '}
              <span
                className={`saga-tienda-mano${manos.has('L') ? ' saga-tienda-mano-ocupada' : ''}`}
              >
                {t.izq}
              </span>
              <span
                className={`saga-tienda-mano${manos.has('R') ? ' saga-tienda-mano-ocupada' : ''}`}
              >
                {t.dcha}
              </span>
            </span>
          </div>
          <h2>{t.complementos}</h2>
          {HUECOS.map((h) => (
            <div key={h.clave} className="saga-tienda-hueco">
              <div className="saga-tienda-hueco-titulo">{idioma === 'gl' ? h.gl : h.es}</div>
              <div className="saga-tienda-tarjetas">
                {h.items.map((c) => {
                  const puesto = aspecto.items[h.clave] === c
                  const motivo = queSustituye(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      data-complemento={COMPLEMENTOS[c].id}
                      data-categoria={COMPLEMENTOS[c].categoria}
                      aria-pressed={puesto}
                      className={`saga-tienda-tarjeta${puesto ? ' saga-tienda-tarjeta-puesta' : ''}`}
                      onClick={() =>
                        setAspecto((a) => ({
                          ...a,
                          items: puesto ? sinComplemento(a.items, c) : conComplemento(a.items, c),
                        }))
                      }
                    >
                      {miniaturas[c] ? (
                        <img src={miniaturas[c]} alt="" draggable={false} />
                      ) : (
                        <span className="saga-tienda-sin-foto" aria-hidden="true" />
                      )}
                      <span className="saga-tienda-tarjeta-nombre">
                        {idioma === 'gl' ? COMPLEMENTOS[c].gl : COMPLEMENTOS[c].es}
                      </span>
                      {motivo ? <span className="saga-tienda-motivo">{motivo}</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )
    }
    return (
      <>
        <h2>{t.gestos}</h2>
        <p className="saga-tienda-ayuda-linea">{t.gestosAyuda}</p>
        <div className="saga-tienda-fichas">
          {GESTOS.map((g) => (
            <button
              key={g.clip}
              type="button"
              className="saga-tienda-ficha"
              onClick={() => escenaRef.current?.gesto(g.clip)}
            >
              {idioma === 'gl' ? g.gl : g.es}
            </button>
          ))}
        </div>
      </>
    )
  })()

  return createPortal(
    <div
      className={`saga-tienda${pleno ? ' saga-tienda-pleno' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={pleno ? t.tituloPrimera : t.titulo}
    >
      <div className="saga-tienda-escenario" ref={escenarioRef} data-estado={estado}>
        {estado === 'cargando' ? (
          <div className="saga-tienda-velo" role="status">
            <div className="saga-tienda-barra" aria-hidden="true">
              <div style={{ width: `${Math.round(progreso * 100)}%` }} />
            </div>
            <span>{t.cargando}</span>
          </div>
        ) : null}
        {estado === 'error' ? (
          <div className="saga-tienda-velo" role="alert">
            <span>{t.sinModelo}</span>
            <button
              type="button"
              className="saga-tienda-ficha"
              onClick={() => setIntento((n) => n + 1)}
            >
              {t.reintentar}
            </button>
          </div>
        ) : null}
        {estado === 'sinwebgl' ? (
          <div className="saga-tienda-velo" role="status">
            <Cara id={aspecto.mx} activo />
            <span>{t.sinTresD}</span>
          </div>
        ) : null}
        {estado === 'listo' ? (
          <div className="saga-tienda-gira" aria-hidden="true">
            <span>↔</span> {t.giraAyuda}
          </div>
        ) : null}
        <div className="saga-tienda-etiqueta">
          <b>{MX_NOMBRES[aspecto.mx]}</b>
          <small>{nombreColor(COLORES_DE_ROPA[aspecto.top])}</small>
        </div>
        {!pleno && alCancelar ? (
          <button
            type="button"
            className="saga-tienda-cerrar"
            aria-label={t.cerrar}
            onClick={alCancelar}
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="saga-tienda-hoja">
        {pleno ? (
          <div className="saga-tienda-cabecera">
            <b>{t.tituloPrimera}</b>
            {pestana === 'pj' ? <span>{t.ayudaPrimera}</span> : null}
          </div>
        ) : (
          <div className="saga-tienda-cabecera">
            <b>{t.titulo}</b>
          </div>
        )}
        <div className="saga-tienda-cuerpo">{cuerpo}</div>
        {tomado ? (
          <div className="saga-tienda-aviso" role="alert">
            {t.ocupado}
          </div>
        ) : mensaje ? (
          <div className="saga-tienda-aviso" role="alert">
            {mensaje}
          </div>
        ) : sinCobertura ? (
          <div className="saga-tienda-aviso saga-tienda-aviso-suave">{t.sinCobertura}</div>
        ) : null}
        <button
          type="button"
          className="saga-tienda-listo"
          disabled={guardando || tomado}
          onClick={() => alConfirmar(aspecto)}
        >
          {guardando ? t.guardando : t.listo}
        </button>
        <nav className="saga-tienda-pestanas" aria-label={t.titulo}>
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`saga-tienda-pestana${p.id === pestana ? ' saga-tienda-pestana-activa' : ''}`}
              aria-pressed={p.id === pestana}
              onClick={() => setPestana(p.id)}
            >
              <span aria-hidden="true">{p.icono}</span>
              {t.pestanas[p.id]}
            </button>
          ))}
        </nav>
      </div>
    </div>,
    document.body
  )
}

// El menú de gestos comparte estilos con la tienda: un solo paquete (y una sola hoja de estilo) para los dos.
export { MenuDeGestos } from './MenuDeGestos'

export default TiendaDeRopa

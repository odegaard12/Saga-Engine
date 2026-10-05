import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
import { getAdminGameForStage } from '../lib/gameCatalog'
import { getPhysicalNodeVisual } from '../lib/physicalNodeVisuals'
import { ETIQUETA_NIVEL, estadoDeLosNodos } from '../lib/estadoNodo'

/**
 * La barra de nodos de la ruta, en horizontal sobre el mapa.
 *
 * Antes era una lista vertical al fondo de la barra lateral: con 768 px de alto
 * se quedaba en CERO píxeles (sólo se veía «Ruta 6») y en el móvil no existía.
 * Ahora es una tira que se desliza:
 *
 * - con el dedo (scroll nativo con inercia; `touch-action: pan-x` y
 *   `overscroll-behavior: contain` para que el mapa no se lleve el gesto);
 * - con la rueda del ratón (la vertical se convierte en horizontal);
 * - arrastrando con el ratón (con inercia al soltar);
 * - con las flechas laterales o las del teclado;
 * - y con una barra de desplazamiento visible.
 *
 * El nodo seleccionado sale resaltado y se centra solo cuando cambia.
 *
 * Ronda 7: tarjetas más altas (número, nombre, tipo con icono y estado), sin
 * barra de desplazamiento que tape el texto (flechas, rueda, arrastre y dedo),
 * botón «Añadir nodo» y reordenar arrastrando el asa ⠿ en el ordenador.
 */

type Props = {
  stages: AdminReactOverviewStage[]
  selectedStage: AdminReactOverviewStage | null
  onSelectStage: (stage: AdminReactOverviewStage) => void
  onReorderStage: (stage: AdminReactOverviewStage, direction: 'up' | 'down') => void
  onPrintQrs: () => void
  onCreateNode?: () => void
  textoVacio: string
  sinTitulo: string
}

const UMBRAL_ARRASTRE_PX = 6

function configDe(stage: AdminReactOverviewStage): Record<string, unknown> {
  const config = (stage as unknown as { config?: unknown }).config
  return typeof config === 'object' && config !== null ? (config as Record<string, unknown>) : {}
}

export function tipoDelNodo(stage: AdminReactOverviewStage): { icono: string; texto: string } {
  const fisico = getPhysicalNodeVisual(stage)
  if (fisico) return { icono: fisico.icon, texto: fisico.label }
  const juego = getAdminGameForStage(stage.type, configDe(stage))
  return { icono: juego.icon || '', texto: juego.title || stage.label || stage.type || '' }
}

/** Qué nodos se ven ahora en la pista (para «1–4 de 9»). */
export function rangoVisible(
  inicio: number,
  ancho: number,
  fichas: Array<{ izquierda: number; ancho: number }>
): [number, number] | null {
  let primero = -1
  let ultimo = -1
  fichas.forEach((ficha, indice) => {
    const centro = ficha.izquierda + ficha.ancho / 2
    if (centro >= inicio && centro <= inicio + ancho) {
      if (primero < 0) primero = indice
      ultimo = indice
    }
  })
  return primero < 0 ? null : [primero, ultimo]
}

export default function BarraDeNodos({
  stages,
  selectedStage,
  onSelectStage,
  onReorderStage,
  onPrintQrs,
  onCreateNode,
  textoVacio,
  sinTitulo,
}: Props) {
  const estados = useMemo(() => estadoDeLosNodos(stages), [stages])
  const [arrastrado, setArrastrado] = useState<number | null>(null)
  const [destinoSoltar, setDestinoSoltar] = useState<number | null>(null)
  const resumen = useMemo(
    () => ({
      incompletos: estados.filter((e) => e.nivel === 'incompleto').length,
      avisos: estados.filter((e) => e.nivel === 'aviso').length,
    }),
    [estados]
  )
  const pistaRef = useRef<HTMLDivElement>(null)
  const [bordes, setBordes] = useState({ alPrincipio: true, alFinal: true })
  const [rango, setRango] = useState<[number, number] | null>(null)
  const arrastre = useRef<{
    x: number
    scroll: number
    movido: boolean
    ultimoX: number
    ultimoT: number
    velocidad: number
    id: number
  } | null>(null)
  const inercia = useRef<number | null>(null)
  const evitarClic = useRef(false)

  const indiceElegido = selectedStage
    ? stages.findIndex((stage) => stage.index === selectedStage.index)
    : -1
  // Al cerrar el editor no hay selección, pero el nodo con el que se trabajaba
  // sigue resaltado (y a la vista): es «el nodo actual» del organizador.
  const [ultimoElegido, setUltimoElegido] = useState(-1)
  useEffect(() => {
    if (indiceElegido >= 0) setUltimoElegido(indiceElegido)
  }, [indiceElegido])
  const indiceSeleccionado =
    indiceElegido >= 0 ? indiceElegido : ultimoElegido < stages.length ? ultimoElegido : -1

  const medir = useCallback(() => {
    const pista = pistaRef.current
    if (!pista) return
    const max = pista.scrollWidth - pista.clientWidth
    setBordes({ alPrincipio: pista.scrollLeft <= 2, alFinal: pista.scrollLeft >= max - 2 })
    const fichas = Array.from(pista.querySelectorAll<HTMLElement>('[data-ficha-nodo]')).map(
      (el) => ({
        izquierda: el.offsetLeft,
        ancho: el.offsetWidth,
      })
    )
    setRango(rangoVisible(pista.scrollLeft, pista.clientWidth, fichas))
  }, [])

  // Rueda vertical -> desplazamiento horizontal. Con `passive: false` para poder
  // impedir que la rueda haga zoom en el mapa de detrás.
  useEffect(() => {
    const pista = pistaRef.current
    if (!pista) return undefined
    const alRodar = (evento: WheelEvent) => {
      if (pista.scrollWidth <= pista.clientWidth) return
      const delta =
        Math.abs(evento.deltaY) > Math.abs(evento.deltaX) ? evento.deltaY : evento.deltaX
      if (!delta) return
      evento.preventDefault()
      const factor = evento.deltaMode === 1 ? 32 : evento.deltaMode === 2 ? pista.clientWidth : 1
      pista.scrollLeft += delta * factor
    }
    pista.addEventListener('wheel', alRodar, { passive: false })
    return () => pista.removeEventListener('wheel', alRodar)
  }, [])

  useEffect(() => {
    medir()
    const pista = pistaRef.current
    if (!pista) return undefined
    const observador = new ResizeObserver(medir)
    observador.observe(pista)
    return () => observador.disconnect()
  }, [medir, stages.length])

  // El nodo seleccionado, a la vista y centrado (sin mover la página entera:
  // `scrollIntoView` también desplazaba los contenedores de fuera).
  useEffect(() => {
    const pista = pistaRef.current
    if (!pista || indiceSeleccionado < 0) return
    const ficha = pista.querySelector<HTMLElement>(`[data-ficha-nodo="${indiceSeleccionado}"]`)
    if (!ficha) return
    const destino = ficha.offsetLeft - (pista.clientWidth - ficha.offsetWidth) / 2
    pista.scrollTo({ left: Math.max(0, destino), behavior: 'smooth' })
  }, [indiceSeleccionado, stages.length])

  useEffect(
    () => () => {
      if (inercia.current) cancelAnimationFrame(inercia.current)
    },
    []
  )

  function desplazar(sentido: 1 | -1) {
    const pista = pistaRef.current
    if (!pista) return
    pista.scrollBy({ left: sentido * Math.max(160, pista.clientWidth * 0.75), behavior: 'smooth' })
  }

  // Arrastrar con el RATÓN (el dedo ya desliza solo con el scroll nativo).
  function alPulsar(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.pointerType !== 'mouse' || evento.button !== 0) return
    const pista = pistaRef.current
    if (!pista) return
    if (inercia.current) cancelAnimationFrame(inercia.current)
    arrastre.current = {
      x: evento.clientX,
      scroll: pista.scrollLeft,
      movido: false,
      ultimoX: evento.clientX,
      ultimoT: performance.now(),
      velocidad: 0,
      id: evento.pointerId,
    }
  }

  function alMover(evento: React.PointerEvent<HTMLDivElement>) {
    const estado = arrastre.current
    const pista = pistaRef.current
    if (!estado || !pista || evento.pointerId !== estado.id) return
    const dx = evento.clientX - estado.x
    if (!estado.movido && Math.abs(dx) < UMBRAL_ARRASTRE_PX) return
    if (!estado.movido) {
      estado.movido = true
      pista.setPointerCapture(evento.pointerId)
      pista.classList.add('arrastrando')
    }
    const ahora = performance.now()
    const dt = Math.max(1, ahora - estado.ultimoT)
    estado.velocidad = (evento.clientX - estado.ultimoX) / dt
    estado.ultimoX = evento.clientX
    estado.ultimoT = ahora
    pista.scrollLeft = estado.scroll - dx
  }

  function alSoltar(evento: React.PointerEvent<HTMLDivElement>) {
    const estado = arrastre.current
    const pista = pistaRef.current
    arrastre.current = null
    if (!estado || !pista || !estado.movido) return
    pista.classList.remove('arrastrando')
    try {
      pista.releasePointerCapture(evento.pointerId)
    } catch {
      // ya estaba suelto
    }
    evitarClic.current = true
    window.setTimeout(() => {
      evitarClic.current = false
    }, 0)
    // Inercia: la velocidad del último tramo se va frenando.
    let velocidad = -estado.velocidad * 16
    const paso = () => {
      if (Math.abs(velocidad) < 0.5) {
        inercia.current = null
        return
      }
      pista.scrollLeft += velocidad
      velocidad *= 0.92
      inercia.current = requestAnimationFrame(paso)
    }
    inercia.current = requestAnimationFrame(paso)
  }

  function alTeclear(evento: React.KeyboardEvent<HTMLDivElement>) {
    const pista = pistaRef.current
    if (!pista) return
    if (evento.key === 'Home') {
      evento.preventDefault()
      pista.scrollTo({ left: 0, behavior: 'smooth' })
    } else if (evento.key === 'End') {
      evento.preventDefault()
      pista.scrollTo({ left: pista.scrollWidth, behavior: 'smooth' })
    } else if (evento.key === 'ArrowRight' && evento.target === pista) {
      evento.preventDefault()
      desplazar(1)
    } else if (evento.key === 'ArrowLeft' && evento.target === pista) {
      evento.preventDefault()
      desplazar(-1)
    }
  }

  const textoPosicion =
    stages.length === 0
      ? '0 nodos'
      : indiceSeleccionado >= 0
        ? `Nodo ${indiceSeleccionado + 1} de ${stages.length}`
        : rango
          ? rango[0] === rango[1]
            ? `${rango[0] + 1} de ${stages.length}`
            : `${rango[0] + 1}–${rango[1] + 1} de ${stages.length}`
          : `${stages.length} nodos`

  function soltarEn(destino: number) {
    const origen = arrastrado
    setArrastrado(null)
    setDestinoSoltar(null)
    if (origen === null || origen === destino) return
    const stage = stages[origen]
    if (!stage) return
    const sentido = destino > origen ? 'down' : 'up'
    for (let paso = 0; paso < Math.abs(destino - origen); paso += 1) onReorderStage(stage, sentido)
  }

  return (
    <section className="saga-barra-nodos" aria-label="Nodos de la ruta">
      <div className="saga-barra-nodos-cabeza">
        <strong>Ruta</strong>
        <span className="saga-barra-nodos-posicion" aria-live="polite">
          {textoPosicion}
        </span>
        {resumen.incompletos > 0 ? (
          <span className="saga-barra-nodos-resumen incompleto">
            {resumen.incompletos} {resumen.incompletos === 1 ? 'incompleto' : 'incompletos'}
          </span>
        ) : null}
        {resumen.avisos > 0 ? (
          <span className="saga-barra-nodos-resumen aviso">
            {resumen.avisos} {resumen.avisos === 1 ? 'aviso' : 'avisos'}
          </span>
        ) : null}
        <span className="saga-barra-nodos-acciones">
          {onCreateNode ? (
            <button
              type="button"
              className="saga-barra-nodos-nuevo"
              onClick={onCreateNode}
              title="Añadir un nodo nuevo a la ruta"
            >
              <span aria-hidden="true">＋</span> Añadir nodo
            </button>
          ) : null}
          <button
            type="button"
            className="saga-barra-nodos-qr"
            onClick={onPrintQrs}
            disabled={stages.length === 0}
            title="Imprimir las tarjetas QR de todos los nodos"
          >
            <span aria-hidden="true">🖨️</span> Imprimir QRs
          </button>
        </span>
      </div>

      <div className="saga-barra-nodos-cuerpo">
        <button
          type="button"
          className="saga-barra-nodos-flecha"
          aria-label="Ver nodos anteriores"
          disabled={bordes.alPrincipio}
          onClick={() => desplazar(-1)}
        >
          ‹
        </button>

        <div
          ref={pistaRef}
          className={`saga-barra-nodos-pista${bordes.alPrincipio ? '' : ' hay-antes'}${bordes.alFinal ? '' : ' hay-despues'}`}
          role="list"
          tabIndex={0}
          aria-label="Lista de nodos: desliza, usa la rueda o las flechas"
          onScroll={medir}
          onPointerDown={alPulsar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onKeyDown={alTeclear}
          onClickCapture={(evento) => {
            if (evitarClic.current) {
              evento.preventDefault()
              evento.stopPropagation()
            }
          }}
        >
          {stages.map((stage, posicion) => {
            const tipo = tipoDelNodo(stage)
            const activo = posicion === indiceSeleccionado
            const estado = estados[posicion] ?? { nivel: 'ok' as const, motivos: [] }
            const claseFicha = [
              'saga-ficha-nodo',
              activo ? 'activa' : '',
              `estado-${estado.nivel}`,
              arrastrado === posicion ? 'arrastrada' : '',
              destinoSoltar === posicion && arrastrado !== null && arrastrado !== posicion
                ? arrastrado < posicion
                  ? 'soltar-despues'
                  : 'soltar-antes'
                : '',
            ]
              .filter(Boolean)
              .join(' ')
            const sinGps = typeof stage.lat !== 'number' || typeof stage.lon !== 'number'
            return (
              <div
                key={`${stage.index}-${stage.id ?? stage.title}`}
                role="listitem"
                data-ficha-nodo={posicion}
                data-estado={estado.nivel}
                className={claseFicha}
                onDragOver={(evento) => {
                  if (arrastrado === null) return
                  evento.preventDefault()
                  setDestinoSoltar(posicion)
                }}
                onDrop={(evento) => {
                  evento.preventDefault()
                  soltarEn(posicion)
                }}
              >
                <button
                  type="button"
                  className="saga-ficha-nodo-principal"
                  aria-current={activo ? 'true' : undefined}
                  onClick={() => onSelectStage(stage)}
                  title={`${posicion + 1}. ${stage.title || sinTitulo}${
                    estado.motivos.length ? ` — ${estado.motivos.join('; ')}` : ''
                  }`}
                >
                  <span className="saga-ficha-nodo-numero">{posicion + 1}</span>
                  <span className="saga-ficha-nodo-texto">
                    <strong>{stage.title || sinTitulo}</strong>
                    <small className="saga-ficha-nodo-tipo">
                      {tipo.icono ? (
                        <span className="saga-ficha-nodo-icono" aria-hidden="true">
                          {tipo.icono}
                        </span>
                      ) : null}
                      {tipo.texto}
                    </small>
                    <span className={`saga-ficha-nodo-estado ${estado.nivel}`}>
                      <i aria-hidden="true" />
                      {sinGps && estado.nivel === 'incompleto'
                        ? 'Sin posición'
                        : ETIQUETA_NIVEL[estado.nivel]}
                    </span>
                  </span>
                </button>
                {/* Siempre en el DOM: en escritorio salen al pasar el ratón o con
                    el foco (seleccionar abre el editor encima, así que no puede
                    depender de la selección). En el móvil no se enseñan. */}
                {stages.length > 1 ? (
                  <span className="saga-ficha-nodo-orden">
                    <button
                      type="button"
                      aria-label="Mover antes"
                      title="Mover antes en la ruta"
                      disabled={posicion === 0}
                      onClick={() => onReorderStage(stage, 'up')}
                    >
                      ◀
                    </button>
                    <span
                      className="saga-ficha-nodo-asa"
                      draggable
                      role="presentation"
                      title="Arrastra para cambiar el orden"
                      onDragStart={(evento) => {
                        setArrastrado(posicion)
                        evento.dataTransfer.effectAllowed = 'move'
                        evento.dataTransfer.setData('text/plain', String(posicion))
                        const ficha = (evento.currentTarget as HTMLElement).closest(
                          '.saga-ficha-nodo'
                        )
                        if (ficha) evento.dataTransfer.setDragImage(ficha, 20, 20)
                      }}
                      onDragEnd={() => {
                        setArrastrado(null)
                        setDestinoSoltar(null)
                      }}
                    >
                      ⠿
                    </span>
                    <button
                      type="button"
                      aria-label="Mover después"
                      title="Mover después en la ruta"
                      disabled={posicion >= stages.length - 1}
                      onClick={() => onReorderStage(stage, 'down')}
                    >
                      ▶
                    </button>
                  </span>
                ) : null}
              </div>
            )
          })}
          {stages.length === 0 ? <div className="saga-barra-nodos-vacia">{textoVacio}</div> : null}
        </div>

        <button
          type="button"
          className="saga-barra-nodos-flecha"
          aria-label="Ver nodos siguientes"
          disabled={bordes.alFinal}
          onClick={() => desplazar(1)}
        >
          ›
        </button>
      </div>
    </section>
  )
}

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  anotar,
  depuracionActiva,
  leerRegistro,
  lineaDeMedidas,
  medirVista,
  textoParaCopiar,
  vaciarRegistro,
} from '../utils/depurarVista'
import { EVENTO_VISTA } from '../utils/vistaTrasTeclado'

/**
 * El recuadro de `?depurar-vista` (ver utils/depurarVista.ts). Sin el parámetro no pinta NADA ni escucha nada.
 * Lo monta ScreenFrame, así que sale en todas las pantallas del jugador (entrada, mapa, cámara).
 */
export function DepuracionVista() {
  const [activa] = useState(() => depuracionActiva())
  if (!activa) return null
  return <RecuadroDeVista />
}

function RecuadroDeVista() {
  const sonda = useRef<HTMLDivElement | null>(null)
  const [, setTic] = useState(0)
  const [plegado, setPlegado] = useState(false)
  const [copiado, setCopiado] = useState('')

  useEffect(() => {
    const vv = window.visualViewport ?? null
    let ultima = ''
    const apuntar = (evento: string) => {
      const linea = lineaDeMedidas(medirVista(sonda.current))
      // El scroll del visual viewport llega a 60 por segundo: sólo se anota si algo cambia.
      if (evento.startsWith('vv-scroll') && linea === ultima) return
      ultima = linea
      anotar(evento, linea)
      setTic((n) => n + 1)
    }
    const alFoco = (e: Event) => {
      const el = e.target as HTMLElement | null
      apuntar(`${e.type} ${el?.tagName?.toLowerCase() ?? ''}`)
    }
    const alVista = (e: Event) => {
      const d = (e as CustomEvent<{ fase?: string; motivo?: string }>).detail || {}
      apuntar(`vista ${d.fase ?? ''} ${d.motivo ?? ''}`.trim())
    }
    const oyentes: Array<[EventTarget | null, string, (e: Event) => void, boolean]> = [
      [document, 'focusin', alFoco, true],
      [document, 'focusout', alFoco, true],
      [vv, 'resize', () => apuntar('vv-resize'), false],
      [vv, 'scroll', () => apuntar('vv-scroll'), false],
      [window, 'resize', () => apuntar('win-resize'), false],
      [window, 'scroll', () => apuntar('win-scroll'), false],
      [window, 'orientationchange', () => apuntar('orientacion'), false],
      [document, 'visibilitychange', () => apuntar(`visible ${document.visibilityState}`), false],
      [window, EVENTO_VISTA, alVista, false],
    ]
    for (const [o, n, f, c] of oyentes) o?.addEventListener(n, f, c)
    apuntar('inicio')
    return () => {
      for (const [o, n, f, c] of oyentes) o?.removeEventListener(n, f, c)
    }
  }, [])

  async function copiar() {
    const texto = textoParaCopiar(
      medirVista(sonda.current),
      navigator.userAgent,
      String(typeof __SAGA_VERSION__ === 'string' ? __SAGA_VERSION__ : '')
    )
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado('Copiado')
    } catch {
      // Sin permiso de portapapeles (o http): el truco del área de texto.
      const area = document.createElement('textarea')
      area.value = texto
      area.setAttribute('readonly', '')
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
      document.body.appendChild(area)
      area.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      area.remove()
      setCopiado(ok ? 'Copiado' : 'No se pudo copiar')
    }
    window.setTimeout(() => setCopiado(''), 2000)
  }

  const medidas = medirVista(sonda.current)
  const registro = leerRegistro()
  return (
    <div data-saga-depurar-vista="" style={caja} role="status" aria-live="off">
      <div ref={sonda} style={sondaSegura} aria-hidden="true" />
      <div style={fila}>
        <strong style={{ fontSize: 11 }}>vista · {medidas.modo}</strong>
        <button type="button" style={boton} onClick={() => void copiar()}>
          {copiado || 'Copiar'}
        </button>
        <button
          type="button"
          style={boton}
          onClick={() => {
            vaciarRegistro()
            setTic((n) => n + 1)
          }}
        >
          Vaciar
        </button>
        <button
          type="button"
          style={boton}
          onClick={() => setPlegado((p) => !p)}
          aria-label="Plegar"
        >
          {plegado ? '▾' : '▴'}
        </button>
      </div>
      {plegado ? null : (
        <>
          <div style={texto}>
            in {medidas.innerWidth}×{medidas.innerHeight} · out {medidas.outerHeight} · cli{' '}
            {medidas.clientHeight}
            <br />
            vv {medidas.vvHeight ?? '-'} top {medidas.vvOffsetTop ?? '-'} page{' '}
            {medidas.vvPageTop ?? '-'} · sY {medidas.scrollY}
            <br />
            raíz {medidas.raizTop ?? '-'}+{medidas.raizAlto ?? '-'} · safe {medidas.safeTop}/
            {medidas.safeBottom}
            <br />
            teclado {medidas.teclado} · foco {medidas.foco}
          </div>
          <div style={lista}>
            {registro.slice(-6).map((e, i) => (
              <div key={`${e.t}-${i}`}>
                {e.t} {e.evento}
              </div>
            ))}
            <div style={{ opacity: 0.7 }}>{registro.length} entradas</div>
          </div>
        </>
      )}
    </div>
  )
}

const caja: CSSProperties = {
  position: 'fixed',
  top: 'calc(env(safe-area-inset-top, 0px) + 4px)',
  left: 4,
  zIndex: 2147483000,
  width: 'min(78vw, 300px)',
  padding: 6,
  borderRadius: 8,
  background: 'rgba(0,0,0,.78)',
  color: '#d1fae5',
  font: '10px/1.35 ui-monospace, Menlo, monospace',
  pointerEvents: 'auto',
  boxSizing: 'border-box',
}

const sondaSegura: CSSProperties = {
  position: 'absolute',
  width: 0,
  height: 0,
  overflow: 'hidden',
  visibility: 'hidden',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
}

const fila: CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  justifyContent: 'space-between',
}

const boton: CSSProperties = {
  minHeight: 28,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,.3)',
  background: 'rgba(255,255,255,.12)',
  color: '#fff',
  font: '11px system-ui, sans-serif',
}

const texto: CSSProperties = { marginTop: 4, wordBreak: 'break-all' }

const lista: CSSProperties = { marginTop: 4, maxHeight: 92, overflow: 'hidden', opacity: 0.9 }

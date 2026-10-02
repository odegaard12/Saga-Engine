import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { tokens } from '../ui/tokens'

export type UiNoticeTone = 'info' | 'warn' | 'success'
export type UiNotice = {
  id?: number
  title?: string
  message: string
  tone: UiNoticeTone
} | null

/** Cuanto se queda un cartel en pantalla antes de empezar a irse. */
export const VIDA_DEL_CARTEL_MS = 3000
/** Cuantos a la vez: el mas viejo se va antes de tiempo si llega uno de mas. */
export const CARTELES_A_LA_VEZ = 3
/** Red de seguridad si `transitionend` no llega (p. ej. pestana en segundo plano). */
const RESPALDO_DE_SALIDA_MS = 600

interface Cartel {
  clave: number
  notice: NonNullable<UiNotice>
  estado: 'entrando' | 'abierta' | 'saliendo'
}

function prefiereMenosMovimiento(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

/**
 * Los carteles se APILAN y se deslizan, en vez de pisarse.
 *
 * Antes habia un solo hueco: un cartel nuevo reemplazaba al anterior en seco
 * (mismo elemento, texto distinto) y al caducar desaparecia sin salida. Ahora
 * cada aviso que llega es una tarjeta propia que entra deslizando y se va con
 * su propia transicion; hasta `CARTELES_A_LA_VEZ` a la vez, el mas nuevo abajo.
 * El mismo texto repetido no apila otra tarjeta: reinicia el tiempo de la que
 * ya esta.
 *
 * Quien decide cuanto dura un cartel es este componente -el padre tambien lo
 * pone a `null` a los 3 s, pero `null` aqui no quita nada: cada tarjeta se va
 * sola-. Cuando una se va, las de debajo suben con una transformacion (FLIP),
 * no con un salto de maquetacion. Solo `transform` y `opacity`.
 */
export function ToastNotice({ notice }: { notice: UiNotice }) {
  const [carteles, setCarteles] = useState<Cartel[]>([])
  const siguiente = useRef(1)
  const temporizadores = useRef(new Map<number, number>())
  const nodos = useRef(new Map<number, HTMLDivElement>())
  const posiciones = useRef(new Map<number, number>())

  const quitar = useCallback((clave: number) => {
    setCarteles((actuales) => actuales.filter((c) => c.clave !== clave))
    const t = temporizadores.current.get(clave)
    if (t !== undefined) window.clearTimeout(t)
    temporizadores.current.delete(clave)
    nodos.current.delete(clave)
    posiciones.current.delete(clave)
  }, [])

  const despedir = useCallback(
    (clave: number) => {
      setCarteles((actuales) =>
        actuales.map((c) => (c.clave === clave && c.estado !== 'saliendo' ? { ...c, estado: 'saliendo' } : c))
      )
      const previo = temporizadores.current.get(clave)
      if (previo !== undefined) window.clearTimeout(previo)
      temporizadores.current.set(clave, window.setTimeout(() => quitar(clave), RESPALDO_DE_SALIDA_MS))
    },
    [quitar]
  )

  const programar = useCallback(
    (clave: number) => {
      const previo = temporizadores.current.get(clave)
      if (previo !== undefined) window.clearTimeout(previo)
      temporizadores.current.set(clave, window.setTimeout(() => despedir(clave), VIDA_DEL_CARTEL_MS))
    },
    [despedir]
  )

  // Lo ultimo pintado, para decidir fuera del actualizador de estado: dentro
  // de `setCarteles(fn)` no puede haber temporizadores ni contadores (React
  // puede llamar a `fn` dos veces y saldrian dos carteles).
  const visibles = useRef<Cartel[]>([])
  useLayoutEffect(() => {
    visibles.current = carteles
  }, [carteles])

  // Llega un aviso nuevo.
  useEffect(() => {
    if (!notice) return
    const actuales = visibles.current
    const igual = actuales.find(
      (c) => c.estado !== 'saliendo' && c.notice.message === notice.message && c.notice.tone === notice.tone
    )
    if (igual) {
      programar(igual.clave)
      return
    }
    const clave = siguiente.current++
    programar(clave)
    setCarteles((ahora) => [...ahora, { clave, notice, estado: 'entrando' }])
    // Dos fotogramas pintado fuera antes de colocarlo: sin ellos no hay desde
    // donde deslizar.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() =>
        setCarteles((ahora) =>
          ahora.map((c) => (c.clave === clave && c.estado === 'entrando' ? { ...c, estado: 'abierta' } : c))
        )
      )
    )
    // Pasado el tope, el mas viejo que siga vivo empieza a irse ya.
    const vivos = actuales.filter((c) => c.estado !== 'saliendo')
    if (vivos.length >= CARTELES_A_LA_VEZ) despedir(vivos[0].clave)
  }, [notice, programar, despedir])

  // Al desmontarse no queda ningun temporizador suelto.
  useEffect(() => {
    const t = temporizadores.current
    return () => {
      t.forEach((id) => window.clearTimeout(id))
      t.clear()
    }
  }, [])

  // FLIP: si uno se fue y los de debajo cambiaron de sitio, suben animados.
  useLayoutEffect(() => {
    const animar = !prefiereMenosMovimiento()
    nodos.current.forEach((el, clave) => {
      const ahora = el.getBoundingClientRect().top
      const antes = posiciones.current.get(clave)
      if (animar && antes !== undefined && Math.abs(antes - ahora) > 0.5 && typeof el.animate === 'function') {
        el.animate(
          [{ transform: `translate3d(0, ${antes - ahora}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
          { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        )
      }
      posiciones.current.set(clave, ahora)
    })
  }, [carteles])

  if (carteles.length === 0) return null

  return (
    <>
      {carteles.map((c) => (
        <div
          key={c.clave}
          ref={(el) => {
            if (el) nodos.current.set(c.clave, el)
          }}
          className="saga-aviso"
          data-saga-anim="aviso"
          data-estado={c.estado}
          data-animando={c.estado === 'abierta' ? 'false' : 'true'}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.propertyName !== 'opacity') return
            if (c.estado === 'saliendo') quitar(c.clave)
          }}
          style={{
            ...toastWrap,
            ...(c.notice.tone === 'success' ? toastSuccess : c.notice.tone === 'warn' ? toastWarn : toastInfo),
          }}
        >
          {c.notice.message}
        </div>
      ))}
    </>
  )
}

const toastWrap: CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  maxWidth: 'min(92vw, 420px)',
  padding: '9px 14px',
  borderRadius: tokens.radius.pill,
  boxShadow: tokens.shadow.soft,
  fontSize: 12,
  lineHeight: 1.3,
  fontWeight: 800,
  textAlign: 'center',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
}

const toastInfo: CSSProperties = {
  border: `1px solid ${tokens.colors.infoLine}`,
  background: tokens.colors.infoSoft,
  color: tokens.colors.info,
}

const toastWarn: CSSProperties = {
  border: `1px solid ${tokens.colors.warnLine}`,
  background: tokens.colors.warnSoft,
  color: tokens.colors.warn,
}

const toastSuccess: CSSProperties = {
  border: `1px solid ${tokens.colors.brandLine}`,
  background: tokens.colors.brandSoft,
  color: tokens.colors.brand,
}

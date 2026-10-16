import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getLocale } from '../../i18n'
import { sinCoberturaAhora } from '../offline/redEstado'

/**
 * «Sin cobertura · se guarda todo» (16/10/2026).
 *
 * La app juega sin red, pero no lo decía. Mira lo que dicen las peticiones de verdad (`sinCoberturaAhora`:
 * con una barra el navegador dice «online» aunque no llegue nada).
 *
 * Discreto a propósito (Óscar, 16/10: «deben ocultarse, no salir seguido»): sale UNA vez al quedarse sin red,
 * se va solo a los 5 s y no vuelve a salir hasta 10 minutos después aunque la cobertura vaya y venga. Al
 * volver la red no se avisa de nada. Misma piel que el chip del tiempo, para no desentonar.
 */
const TEXTOS = {
  es: 'Sin cobertura · se guarda todo',
  gl: 'Sen cobertura · gárdase todo',
  en: 'No signal · everything is saved',
}
const VISIBLE_MS = 5000
const PAUSA_MS = 10 * 60_000

export function AvisoDeCobertura({ mobile }: { mobile: boolean }) {
  const texto = TEXTOS[getLocale() as keyof typeof TEXTOS] ?? TEXTOS.es
  const [visible, setVisible] = useState(false)
  const estabaSin = useRef(false)
  const ultimoAviso = useRef(0)

  useEffect(() => {
    let reloj: number | undefined
    const mirar = () => {
      const ahora = sinCoberturaAhora()
      if (ahora && !estabaSin.current && Date.now() - ultimoAviso.current > PAUSA_MS) {
        ultimoAviso.current = Date.now()
        setVisible(true)
        window.clearTimeout(reloj)
        reloj = window.setTimeout(() => setVisible(false), VISIBLE_MS)
      }
      if (!ahora) setVisible(false)
      estabaSin.current = ahora
    }
    mirar()
    const intervalo = window.setInterval(mirar, 5000)
    window.addEventListener('online', mirar)
    window.addEventListener('offline', mirar)
    return () => {
      window.clearInterval(intervalo)
      window.clearTimeout(reloj)
      window.removeEventListener('online', mirar)
      window.removeEventListener('offline', mirar)
    }
  }, [])

  if (!visible) return null
  // Una fila por debajo del chip del tiempo y centrado: en la misma fila no caben los dos (se pisaban).
  return (
    <div style={fila}>
      <div role="status" aria-live="polite" style={estilo(mobile)}>
        <span aria-hidden="true" style={punto} />
        {texto}
      </div>
    </div>
  )
}

function estilo(mobile: boolean): CSSProperties {
  return {
    maxWidth: mobile ? 'calc(100vw - 40px)' : 420,
    boxSizing: 'border-box',
    height: 30,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 11px 0 9px',
    borderRadius: 999,
    fontFamily: 'Barlow, "Barlow Semi Condensed", system-ui, sans-serif',
    fontSize: 11.5,
    fontWeight: 700,
    lineHeight: 1,
    color: 'rgb(245, 234, 216)', // no-tema: el crema del chip del tiempo
    background: 'linear-gradient(135deg, rgba(20, 59, 96, .78), rgba(3, 26, 51, .55))', // no-tema
    border: '1px solid rgba(119, 207, 251, .28)', // no-tema
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    boxShadow: '0 3px 10px rgba(0,0,0,.28)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    animation: 'sagaPanelEntra var(--saga-dur-media, 220ms) var(--saga-curva-entra, ease-out) both',
  }
}

const fila: CSSProperties = {
  position: 'fixed',
  top: 'calc(env(safe-area-inset-top) + 116px)',
  left: 0,
  right: 0,
  zIndex: 600,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const punto: CSSProperties = { width: 7, height: 7, borderRadius: '50%', flex: 'none', background: '#fbbf24' } // no-tema

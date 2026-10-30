import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { pizarra } from './PlayerShell'

/**
 * 30/10: invitación a instalar SAGA como app (Android/Chrome, que avisa con `beforeinstallprompt`). Sale una sola vez,
 * se descarta con ×, nunca durante un reto ni si ya está instalada. Instalada arranca a pantalla completa, sin barra
 * del navegador, y el sistema la cierra menos en segundo plano.
 */
type EventoInstalar = Event & { prompt: () => Promise<void> }
const CLAVE = 'saga:aviso-instalar-visto'
const TEXTOS = {
  es: { texto: 'Instala SAGA en tu móvil: va a pantalla completa y sin barra del navegador.', boton: 'Instalar' },
  gl: { texto: 'Instala SAGA no teu móbil: vai a pantalla completa e sen barra do navegador.', boton: 'Instalar' },
  en: { texto: 'Install SAGA on your phone: full screen, no browser bar.', boton: 'Install' },
}

export function AvisoInstalar({ oculto }: { oculto: boolean }) {
  const { locale } = useI18n()
  const tx = TEXTOS[locale === 'gl' || locale === 'en' ? locale : 'es']
  const [evento, setEvento] = useState<EventoInstalar | null>(null)

  useEffect(() => {
    let visto = false
    try {
      visto = window.localStorage.getItem(CLAVE) === '1'
    } catch {
      visto = true
    }
    if (visto || window.matchMedia?.('(display-mode: standalone)').matches) return undefined
    const alOfrecer = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalar)
    }
    window.addEventListener('beforeinstallprompt', alOfrecer)
    return () => window.removeEventListener('beforeinstallprompt', alOfrecer)
  }, [])

  if (!evento || oculto) return null
  const cerrar = () => {
    try {
      window.localStorage.setItem(CLAVE, '1')
    } catch {
      // sin almacenamiento: vuelve a salir la próxima vez, sin más
    }
    setEvento(null)
  }
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(96px + env(safe-area-inset-bottom))',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 16,
        ...pizarra,
        color: '#f8fafc',
        font: '600 13px/1.35 system-ui, sans-serif',
      }}
    >
      <span style={{ flex: 1 }}>{tx.texto}</span>
      <button
        type="button"
        onClick={() => {
          void evento.prompt().catch(() => undefined)
          cerrar()
        }}
        style={{
          minHeight: 40,
          padding: '0 14px',
          border: 0,
          borderRadius: 12,
          background: 'var(--theme-primary)',
          color: '#0b2440',
          font: '800 13px system-ui, sans-serif',
        }}
      >
        {tx.boton}
      </button>
      <button
        type="button"
        aria-label="×"
        onClick={cerrar}
        style={{ minWidth: 40, minHeight: 40, border: 0, background: 'transparent', color: '#f8fafc', fontSize: 20 }}
      >
        ×
      </button>
    </div>
  )
}

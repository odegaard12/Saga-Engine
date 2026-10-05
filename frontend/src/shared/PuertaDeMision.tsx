import { useEffect, useState, type ReactNode } from 'react'
import { fetchPublicConfig, unlockMission } from './api'
import { getLocale, type Locale } from '../i18n'

/**
 * La pantalla previa de la clave de misión.
 *
 * Con la clave puesta en el panel, el servidor NO manda la lista de jugadores ni
 * sus fotos hasta que el móvil la teclea (`/api/mission/unlock` deja la cookie
 * `saga_mission`, que dura 180 días). Esta puerta envuelve la entrada de
 * jugadores (el login y el enlace directo `/player/NOMBRE`):
 *
 * - sin clave en la misión, o ya desbloqueada: deja pasar sin enseñar nada;
 * - sin cobertura (o si el servidor no contesta): también deja pasar. Quien ya
 *   cargó la misión juega entera sin red y NUNCA se le pide la clave a mitad de
 *   una partida sin cobertura; la cookie sólo se mira con red;
 * - bloqueada: pide el código, lo valida y recarga.
 */

type Texto = {
  titulo: string
  ayuda: string
  campo: string
  boton: string
  comprobando: string
  mal: string
  muchos: string
  red: string
}

const TEXTOS: Record<Locale, Texto> = {
  es: {
    titulo: 'Clave de la misión',
    ayuda: 'Escribe el código que te ha dado la organización para entrar.',
    campo: 'Código',
    boton: 'Entrar',
    comprobando: 'Comprobando…',
    mal: 'Ese código no es correcto.',
    muchos: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
    red: 'No se ha podido comprobar. Revisa la conexión.',
  },
  gl: {
    titulo: 'Clave da misión',
    ayuda: 'Escribe o código que che deu a organización para entrar.',
    campo: 'Código',
    boton: 'Entrar',
    comprobando: 'Comprobando…',
    mal: 'Ese código non é correcto.',
    muchos: 'Demasiados intentos. Agarda uns minutos e volve probar.',
    red: 'Non se puido comprobar. Revisa a conexión.',
  },
  en: {
    titulo: 'Mission code',
    ayuda: 'Type the code the organisers gave you to get in.',
    campo: 'Code',
    boton: 'Enter',
    comprobando: 'Checking…',
    mal: 'That code is not correct.',
    muchos: 'Too many attempts. Wait a few minutes and try again.',
    red: 'Could not check it. Check your connection.',
  },
}

type Estado = 'mirando' | 'abierta' | 'cerrada'

/** ¿La configuración dice que falta la clave? (`mission_unlocked` lo manda el servidor). */
export function claveHaceFalta(config: {
  mission_pass_required?: boolean
  mission_unlocked?: boolean
}): boolean {
  return config.mission_pass_required === true && config.mission_unlocked === false
}

export default function PuertaDeMision({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>('mirando')

  useEffect(() => {
    let cancelado = false
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setEstado('abierta')
      return undefined
    }
    fetchPublicConfig()
      .then((config) => {
        if (!cancelado) setEstado(claveHaceFalta(config) ? 'cerrada' : 'abierta')
      })
      .catch(() => {
        // Sin red a medias: no se bloquea a nadie que ya tenga la misión cargada.
        if (!cancelado) setEstado('abierta')
      })
    return () => {
      cancelado = true
    }
  }, [])

  if (estado === 'abierta') return <>{children}</>
  if (estado === 'mirando') return <div style={fondo} aria-busy="true" />
  return <PantallaDeClave alAbrir={() => window.location.reload()} />
}

function PantallaDeClave({ alAbrir }: { alAbrir: () => void }) {
  const t = TEXTOS[getLocale()] ?? TEXTOS.es
  const [clave, setClave] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!clave.trim() || trabajando) return
    setTrabajando(true)
    setError('')
    try {
      await unlockMission(clave.trim())
      alAbrir()
    } catch (fallo) {
      const mensaje = fallo instanceof Error ? fallo.message : ''
      setError(
        mensaje === 'wrong-mission-password'
          ? t.mal
          : mensaje === 'too-many-attempts'
            ? t.muchos
            : t.red
      )
      setTrabajando(false)
    }
  }

  return (
    <main style={fondo}>
      <form onSubmit={enviar} style={tarjeta} aria-labelledby="puerta-titulo">
        <div style={marca}>SAGA</div>
        <h1 id="puerta-titulo" style={titulo}>
          {t.titulo}
        </h1>
        <p style={ayuda}>{t.ayuda}</p>
        <label style={etiqueta} htmlFor="puerta-clave">
          {t.campo}
        </label>
        <input
          id="puerta-clave"
          style={campo}
          value={clave}
          onChange={(evento) => setClave(evento.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          inputMode="text"
          autoFocus
        />
        {error ? (
          <p role="alert" style={mensajeError}>
            {error}
          </p>
        ) : null}
        <button type="submit" style={boton} disabled={trabajando || !clave.trim()}>
          {trabajando ? t.comprobando : t.boton}
        </button>
      </form>
    </main>
  )
}

const fondo: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding:
    'calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
  background: '#0b1222',
  color: '#f1f5f9',
  font: '500 16px/1.4 system-ui, sans-serif',
}

const tarjeta: React.CSSProperties = {
  width: 'min(420px, 100%)',
  display: 'grid',
  gap: 10,
  padding: 22,
  borderRadius: 20,
  background: '#121c31',
  border: '1px solid rgba(148,163,184,.3)',
  boxShadow: '0 14px 36px rgba(0,0,0,.45)',
}

const marca: React.CSSProperties = {
  fontWeight: 900,
  letterSpacing: '.3em',
  color: '#38bdf8',
  fontSize: 13,
}

const titulo: React.CSSProperties = { margin: 0, fontSize: 24 }
const ayuda: React.CSSProperties = { margin: 0, color: '#cbd5e1', fontSize: 15 }
const etiqueta: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#94a3b8' }
const campo: React.CSSProperties = {
  minHeight: 52,
  fontSize: 20,
  letterSpacing: '.12em',
  textAlign: 'center',
  padding: '0 14px',
  borderRadius: 14,
  border: '1px solid rgba(148,163,184,.4)',
  background: '#0b1222',
  color: '#f1f5f9',
}
const mensajeError: React.CSSProperties = { margin: 0, color: '#fca5a5', fontWeight: 700 }
const boton: React.CSSProperties = {
  minHeight: 52,
  borderRadius: 14,
  border: 0,
  background: '#e0f2fe',
  color: '#0b1222',
  fontWeight: 900,
  fontSize: 17,
  cursor: 'pointer',
}

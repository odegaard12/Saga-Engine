import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { fetchPublicConfig, unlockMission } from './api'
import { getLocale, type Locale } from '../i18n'
import { useTeclado } from './useTeclado'

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
 *
 * 19/10/2026 («es súper feo... debe ser bonitísimo, tipo juego, no una web normal»): diseño A, «La torre», elegido
 * por Óscar entre tres maquetas. La foto de la portada, el emblema que late con su anillo girando y cada letra en su
 * ficha (caen al escribir; tiemblan si la clave no vale; se ponen verdes al acertar). Por debajo sigue habiendo un
 * campo de texto de verdad (invisible): el teclado del móvil, pegar y los lectores de pantalla funcionan igual.
 */

type Texto = {
  rotulo: string
  titulo: string
  ayuda: string
  campo: string
  pista: string
  boton: string
  comprobando: string
  dentro: string
  mal: string
  muchos: string
  red: string
}

const TEXTOS: Record<Locale, Texto> = {
  es: {
    rotulo: 'Misión cerrada',
    titulo: 'Una misión te espera',
    ayuda: 'Escribe la clave que te dio la organización para abrir la ruta.',
    campo: 'Clave de la misión',
    pista: 'Toca aquí y escribe la clave',
    boton: 'Abrir la misión',
    comprobando: 'Comprobando…',
    dentro: '¡Misión abierta!',
    mal: 'Esa clave no abre la misión.',
    muchos: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
    red: 'No se ha podido comprobar. Revisa la conexión.',
  },
  gl: {
    rotulo: 'Misión pechada',
    titulo: 'Unha misión agárdate',
    ayuda: 'Escribe a clave que che deu a organización para abrir a ruta.',
    campo: 'Clave da misión',
    pista: 'Toca aquí e escribe a clave',
    boton: 'Abrir a misión',
    comprobando: 'Comprobando…',
    dentro: 'Misión aberta!',
    mal: 'Esa clave non abre a misión.',
    muchos: 'Demasiados intentos. Agarda uns minutos e volve probar.',
    red: 'Non se puido comprobar. Revisa a conexión.',
  },
  en: {
    rotulo: 'Mission locked',
    titulo: 'A mission awaits',
    ayuda: 'Type the code the organisers gave you to open the route.',
    campo: 'Mission code',
    pista: 'Tap here and type the code',
    boton: 'Open the mission',
    comprobando: 'Checking…',
    dentro: 'Mission open!',
    mal: 'That code does not open the mission.',
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
      .catch((fallo) => {
        // 15/10: con la clave puesta el servidor contesta 401 a TODA la API sin cookie: eso es «pide la clave».
        // Sin red a medias, en cambio, no se bloquea a nadie que ya tenga la misión cargada.
        const sinClave = fallo instanceof Error && /HTTP 401/.test(fallo.message)
        if (!cancelado) setEstado(sinClave ? 'cerrada' : 'abierta')
      })
    return () => {
      cancelado = true
    }
  }, [])

  if (estado === 'abierta') return <>{children}</>
  if (estado === 'mirando') return <div style={fondoQuieto} aria-busy="true" />
  return <PantallaDeClave alAbrir={() => window.location.reload()} />
}

/** El ancho de cada ficha: con claves largas encogen (y como mucho van en dos filas). */
function anchoDeFicha(n: number): number {
  if (n <= 6) return 46
  if (n <= 8) return 38
  return 32
}

function PantallaDeClave({ alAbrir }: { alAbrir: () => void }) {
  const t = TEXTOS[getLocale()] ?? TEXTOS.es
  const [clave, setClave] = useState('')
  const teclado = useTeclado()
  // La página de detrás, oscura como la pantalla: sin franja clara abajo si el área visible no llega al borde.
  useEffect(() => {
    document.documentElement.classList.add('saga-puerta-abierta')
    return () => document.documentElement.classList.remove('saga-puerta-abierta')
  }, [])
  const [trabajando, setTrabajando] = useState(false)
  const [acertada, setAcertada] = useState(false)
  const [error, setError] = useState('')
  const campo = useRef<HTMLInputElement | null>(null)
  const fichas = useRef<HTMLDivElement | null>(null)

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!clave.trim() || trabajando) return
    setTrabajando(true)
    setError('')
    try {
      await unlockMission(clave.trim())
      setAcertada(true)
      // Un instante para ver las fichas en verde antes de entrar.
      window.setTimeout(alAbrir, 650)
    } catch (fallo) {
      const mensaje = fallo instanceof Error ? fallo.message : ''
      setError(
        mensaje === 'wrong-mission-password'
          ? t.mal
          : mensaje === 'too-many-attempts'
            ? t.muchos
            : t.red
      )
      // Que tiemblen sin volver a crearlas (si se recrean, repiten la caída y desaparecen un instante).
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
        fichas.current?.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-8px)' },
            { transform: 'translateX(8px)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(0)' },
          ],
          { duration: 420, easing: 'ease-in-out' }
        )
      setTrabajando(false)
      campo.current?.focus()
    }
  }

  const letras = [...clave]
  const ancho = anchoDeFicha(letras.length + 1)

  return (
    // Con el teclado abierto la pantalla ocupa SÓLO lo que se ve: las fichas y «Entrar» quedan justo encima del
    // teclado (antes quedaban debajo, en iPhone sin poder desplazarse) y lo de arriba se pliega (revisión 20/10).
    <main
      style={teclado ? { ...fondo, top: teclado.arriba, height: teclado.alto, bottom: 'auto' } : fondo}
      className={teclado ? 'puerta-con-teclado' : undefined}
    >
      <style>{ESTILO}</style>
      <div className="puerta-foto" aria-hidden="true" />
      <div className="puerta-velo" aria-hidden="true" />
      <form onSubmit={enviar} className="puerta-forma" aria-labelledby="puerta-titulo">
        <section className="puerta-arriba">
          <div
            className={`puerta-emblema${acertada ? ' puerta-emblema-ok' : ''}`}
            aria-hidden="true"
          >
            <img src="/saga-app-icon.svg" alt="" width={84} height={84} />
          </div>
          <p className={`puerta-rotulo${acertada ? ' puerta-rotulo-ok' : ''}`}>
            {acertada ? t.dentro : t.rotulo}
          </p>
          <h1 id="puerta-titulo" className="puerta-titulo">
            {t.titulo}
          </h1>
          <p className="puerta-ayuda">{t.ayuda}</p>
        </section>
        <section className="puerta-abajo">
          <label htmlFor="puerta-clave" className="puerta-oculto">
            {t.campo}
          </label>
          {/* El campo de verdad, invisible encima de las fichas: tocar las fichas es tocar el campo. */}
          <div className="puerta-mesa">
            <input
              id="puerta-clave"
              ref={campo}
              className="puerta-campo"
              value={clave}
              onChange={(evento) => {
                setClave(evento.target.value.slice(0, 16))
                if (error) setError('')
              }}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              inputMode="text"
              maxLength={16}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'puerta-error' : undefined}
            />
            <div
              ref={fichas}
              className="puerta-fichas"
              aria-hidden="true"
              style={{ '--ancho': `${ancho}px` } as CSSProperties}
            >
              {letras.map((l, i) => (
                <span
                  key={`${i}-${l}`}
                  className={`puerta-ficha${acertada ? ' puerta-ficha-ok' : ''}${error ? ' puerta-ficha-mal' : ''}`}
                  style={{ animationDelay: acertada ? `${i * 45}ms` : undefined }}
                >
                  {l === ' ' ? '·' : l.toUpperCase()}
                </span>
              ))}
              {acertada ? null : <span className="puerta-ficha puerta-ficha-vacia" />}
            </div>
          </div>
          {error ? (
            <p id="puerta-error" role="alert" className="puerta-error">
              {error}
            </p>
          ) : (
            <p className="puerta-pista">{letras.length ? ' ' : t.pista}</p>
          )}
          <button
            type="submit"
            className={`puerta-boton${acertada ? ' puerta-boton-ok' : ''}`}
            disabled={trabajando || !clave.trim()}
          >
            {acertada ? t.dentro : trabajando ? t.comprobando : t.boton}
          </button>
        </section>
      </form>
    </main>
  )
}

const fondoQuieto: CSSProperties = { position: 'fixed', inset: 0, background: '#050c16' }

const fondo: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#050c16',
  color: '#f8fafc',
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  overflow: 'hidden',
}

const ESTILO = `
html.saga-puerta-abierta, html.saga-puerta-abierta body, html.saga-puerta-abierta #root { background: #050c16; }
.puerta-foto { position: absolute; inset: 0; background: #0b1622 url(/login-fondo.jpg) center 30% / cover; transform: scale(1.06);
  animation: puerta-deriva 22s ease-in-out infinite alternate; }
.puerta-velo { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,12,22,.12) 0%, rgba(5,12,22,.35) 38%,
  rgba(5,12,22,.9) 70%, #050c16 100%); }
.puerta-forma { position: relative; height: 100%; display: grid; grid-template-rows: 1fr auto;
  padding: calc(env(safe-area-inset-top, 0px) + 18px) 22px calc(env(safe-area-inset-bottom, 0px) + 26px);
  max-width: 460px; margin: 0 auto; }
.puerta-arriba { display: grid; place-items: center; align-content: center; gap: 12px; text-align: center; }
.puerta-emblema { position: relative; width: 112px; height: 112px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle, rgba(56,189,248,.28), rgba(56,189,248,0) 70%); }
.puerta-emblema::before { content: ''; position: absolute; inset: -10px; border-radius: 50%; border: 2px dashed rgba(56,189,248,.55);
  animation: puerta-gira 14s linear infinite; }
.puerta-emblema::after { content: ''; position: absolute; inset: 4px; border-radius: 50%; box-shadow: 0 0 40px 6px rgba(56,189,248,.35);
  animation: puerta-late 2.4s ease-in-out infinite; }
.puerta-emblema img { position: relative; z-index: 1; width: 84px; height: 84px; border-radius: 50%; }
.puerta-emblema-ok::before { border-color: rgba(74,222,128,.85); animation-duration: 2s; }
.puerta-emblema-ok::after { box-shadow: 0 0 60px 16px rgba(74,222,128,.5); }
.puerta-rotulo { margin: 4px 0 0; font-size: 14px; font-weight: 800; color: #38bdf8; }
.puerta-rotulo-ok { color: #4ade80; }
.puerta-titulo { margin: 0; font-size: clamp(30px, 9vw, 40px); line-height: 1.04; font-weight: 900; letter-spacing: -.02em;
  text-shadow: 0 2px 18px rgba(0,0,0,.5); max-width: 12ch; text-wrap: balance; }
.puerta-con-teclado .puerta-emblema, .puerta-con-teclado .puerta-ayuda, .puerta-con-teclado .puerta-rotulo { display: none; }
.puerta-con-teclado .puerta-forma { padding-top: 10px; padding-bottom: 12px; }
.puerta-con-teclado .puerta-titulo { font-size: 24px; max-width: none; }
.puerta-con-teclado .puerta-abajo { gap: 10px; }
.puerta-ayuda { margin: 0; font-size: 16px; line-height: 1.4; color: rgba(248,250,252,.88); max-width: 30ch; }
.puerta-abajo { display: grid; gap: 14px; }
.puerta-oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.puerta-mesa { position: relative; min-height: 64px; display: grid; place-items: center; }
.puerta-campo { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; font-size: 16px; border: 0; background: transparent;
  color: transparent; caret-color: transparent; cursor: text; z-index: 1; }
.puerta-fichas { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 100%; pointer-events: none; }
.puerta-ficha { width: var(--ancho); height: calc(var(--ancho) * 1.3); border-radius: 12px; display: grid; place-items: center;
  font-size: calc(var(--ancho) * .6); font-weight: 900; background: rgba(255,255,255,.08); border: 1px solid rgba(56,189,248,.5);
  box-shadow: inset 0 0 18px rgba(56,189,248,.18), 0 6px 18px rgba(0,0,0,.25); animation: puerta-cae .32s cubic-bezier(.2,1.5,.4,1) both;
  transition: background .25s, border-color .25s; }
.puerta-ficha-vacia { border-style: dashed; animation: puerta-parpadea 1.1s steps(2) infinite; box-shadow: none; }
.puerta-campo:not(:focus) + .puerta-fichas .puerta-ficha-vacia { animation: none; opacity: .6; }
.puerta-ficha-ok { background: rgba(74,222,128,.3); border-color: #4ade80; animation: puerta-salta .4s ease-out both; }
.puerta-ficha-mal { border-color: rgba(248,113,113,.8); background: rgba(248,113,113,.12); }
.puerta-pista { margin: 0; text-align: center; font-size: 14px; color: rgba(248,250,252,.72); }
.puerta-error { margin: 0; text-align: center; font-size: 15px; font-weight: 800; color: #fca5a5; }
.puerta-boton { min-height: 58px; border: 0; border-radius: 999px; font: 900 18px Inter, "Segoe UI", system-ui, sans-serif; color: #052033;
  background: #38bdf8; box-shadow: 0 10px 30px rgba(56,189,248,.45); cursor: pointer; transition: transform .12s, opacity .2s, background .25s; }
.puerta-boton:active:not(:disabled) { transform: scale(.97); }
.puerta-boton:disabled { opacity: .55; box-shadow: none; }
.puerta-boton-ok, .puerta-boton-ok:disabled { background: #4ade80; opacity: 1; box-shadow: 0 10px 30px rgba(74,222,128,.45); }
@keyframes puerta-gira { to { transform: rotate(360deg); } }
@keyframes puerta-late { 50% { box-shadow: 0 0 60px 14px rgba(56,189,248,.5); } }
@keyframes puerta-deriva { to { transform: scale(1.12) translateY(-12px); } }
@keyframes puerta-cae { from { transform: translateY(14px) scale(.6); opacity: 0; } }
@keyframes puerta-salta { 40% { transform: translateY(-8px); } }
@keyframes puerta-parpadea { 50% { border-color: rgba(56,189,248,.15); } }
@media (prefers-reduced-motion: reduce) {
  .puerta-foto, .puerta-emblema::before, .puerta-emblema::after, .puerta-ficha, .puerta-ficha-vacia { animation: none; }
}
`

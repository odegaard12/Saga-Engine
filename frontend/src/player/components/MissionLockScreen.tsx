import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

interface MissionLockScreenProps {
  /** `mission_launch_at` tal y como viene de /api/config -vacío = sin bloqueo. */
  launchAtRaw: string
  /** `server_time_ms` de /api/config: el reloj que de verdad manda. */
  serverTimeMs: number | undefined
  mobile: boolean
  displayName?: string
  /** Se llama UNA vez, en el momento exacto en que deja de estar bloqueado. */
  onUnlocked: () => void
  /** Abre el panel de "antes de salir" -descarga offline y permisos-, que
   * sigue funcionando igual esté bloqueada la misión o no. */
  onOpenDownload: () => void
}

function parseLaunchAt(raw: string): number | null {
  const texto = (raw || '').trim()
  if (!texto) return null
  // <input type="datetime-local"> manda "2026-12-25T10:00", sin segundos ni
  // zona. Date.parse lo entiende igual sin añadir nada, en la hora LOCAL del
  // navegador -coherente con cómo lo trata el servidor: ver
  // backend/app/runtime/mission_schedule.py-.
  const ms = Date.parse(texto)
  return Number.isFinite(ms) ? ms : null
}

function formatearFalta(msRestantes: number): string {
  const totalSeg = Math.max(0, Math.floor(msRestantes / 1000))
  const dias = Math.floor(totalSeg / 86400)
  const horas = Math.floor((totalSeg % 86400) / 3600)
  const minutos = Math.floor((totalSeg % 3600) / 60)
  const segundos = totalSeg % 60

  if (dias > 0) return `${dias}d ${horas}h ${minutos}m`
  if (horas > 0) return `${horas}h ${minutos}m ${segundos}s`
  return `${minutos}m ${segundos}s`
}

/**
 * Cortina de "aún no toca", entre el login y el mapa.
 *
 * Deja preparar todo -descargar la misión offline, dar los permisos de GPS,
 * cámara y movimiento- pero tapa el mapa y los nodos hasta la fecha que
 * ponga el organizador (`mission_launch_at`). El bloqueo de VERDAD es del
 * servidor -/api/advance y node_completed lo rechazan igual aunque esta
 * pantalla se saltara a mano-; esto es sólo la cortina.
 *
 * La cuenta atrás se mide contra el reloj del SERVIDOR (`serverTimeMs`), no
 * contra el del móvil: cambiar la hora del teléfono no adelanta nada, porque
 * el desfase se calcula una vez, al llegar el primer dato, y desde ahí se
 * seguim contando con el reloj de verdad del aparato -que si avanza al ritmo
 * normal, sólo que corregido-.
 */
export function MissionLockScreen({
  launchAtRaw,
  serverTimeMs,
  mobile,
  displayName,
  onUnlocked,
  onOpenDownload,
}: MissionLockScreenProps) {
  const launchAtMs = parseLaunchAt(launchAtRaw)

  const offsetRef = useRef<number | null>(null)
  if (offsetRef.current === null && typeof serverTimeMs === 'number' && serverTimeMs > 0) {
    offsetRef.current = serverTimeMs - Date.now()
  }

  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const desfase = offsetRef.current ?? 0
  const servidorAhora = ahora + desfase
  const faltan = launchAtMs !== null ? launchAtMs - servidorAhora : -1

  const desbloqueada = launchAtMs === null || faltan <= 0

  useEffect(() => {
    if (desbloqueada) onUnlocked()
    // Sólo importa el momento en que pasa a true: no hay que repetir la
    // llamada en cada segundo que ya está desbloqueada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desbloqueada])

  if (desbloqueada) return null

  const fecha = new Date(launchAtMs as number)
  const fechaTexto = fecha.toLocaleString('gl-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  const panel = (
    <div style={capa}>
      <section className="saga-glass-panel" style={tarjeta(mobile)}>
        <div style={antetitulo}>AÍNDA NON TOCA</div>
        <strong style={titulo}>A misión empeza o</strong>
        <div style={fechaEstilo}>{fechaTexto}</div>
        <div style={contador}>{formatearFalta(faltan)}</div>
        {displayName ? <div style={saudo}>Ola, {displayName} 👋</div> : null}
        <p style={explicacion}>
          Xa podes prepararte: descarga a misión para xogar sen cobertura e concede os
          permisos. O mapa e os retos ábrense sós en canto chegue a hora.
        </p>
        <button type="button" style={boton} onClick={onOpenDownload}>
          📥 Prepararse antes de saír
        </button>
      </section>
    </div>
  )

  if (typeof document === 'undefined') return panel

  return createPortal(panel, document.body)
}

const capa: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 6500,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  background: 'radial-gradient(circle at 50% 38%, rgba(0,0,0,.55), rgba(0,0,0,.82))',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
}

function tarjeta(mobile: boolean): CSSProperties {
  return {
    width: mobile ? 'min(100%, 360px)' : 'min(100%, 420px)',
    display: 'grid',
    gap: 8,
    padding: '24px 20px',
    textAlign: 'center',
    justifyItems: 'center',
    color: '#e2e8f0',
    borderRadius: 'var(--theme-radius-panel)',
    background:
      'linear-gradient(180deg, rgba(var(--theme-sheen-a), calc(.34 * var(--theme-solid))), rgba(var(--theme-ink-soft), .42))',
    border: '1px solid rgba(255,255,255,.24)',
    backdropFilter: 'var(--theme-blur)',
    WebkitBackdropFilter: 'var(--theme-blur)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,.24), 0 26px 60px rgba(var(--theme-ink-deep), .55)',
  }
}

const antetitulo: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '.2em',
  color: 'rgb(var(--theme-info-soft))',
}

const titulo: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
}

const fechaEstilo: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  textTransform: 'capitalize',
  color: '#fff',
}

const contador: CSSProperties = {
  marginTop: 6,
  fontSize: 30,
  fontWeight: 900,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-.02em',
}

const saudo: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  opacity: 0.85,
}

const explicacion: CSSProperties = {
  marginTop: 8,
  fontSize: 12.5,
  lineHeight: 1.4,
  color: 'rgba(var(--theme-line-soft), .78)',
}

const boton: CSSProperties = {
  marginTop: 10,
  minHeight: 40,
  padding: '0 18px',
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(var(--theme-info-soft), .55)',
  background: 'linear-gradient(180deg,rgba(var(--theme-info), .92),rgba(var(--theme-info-deep), .92))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3), 0 6px 16px rgba(2,132,199,.35)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 850,
  cursor: 'pointer',
}

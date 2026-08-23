import type { CSSProperties } from 'react'
import type { PlayerGamePayload, PlayerStage } from '../../types/player'

interface PlayerShellProps {
  payload: PlayerGamePayload
  currentStage: PlayerStage | null
}

function getProgress(payload: PlayerGamePayload) {
  const stages = Array.isArray(payload.stages) ? payload.stages : []
  const total = stages.length

  if (total === 0) {
    return { total: 0, current: 0, activeIndex: -1 }
  }

  if (payload.finished) {
    return { total, current: total, activeIndex: total - 1 }
  }

  const activeIndex =
    typeof payload.level === 'number' ? Math.max(0, Math.min(payload.level, total - 1)) : 0

  return {
    total,
    current: activeIndex + 1,
    activeIndex,
  }
}

export function PlayerShell({ payload, currentStage }: PlayerShellProps) {
  const compact = typeof window !== 'undefined' ? window.innerWidth <= 560 : false

  const mode = payload.session_mode || payload.mode || payload.profile?.mode || 'solo'
  const playerName = payload.display_name || payload.profile?.display_name || payload.user
  const stageName =
    currentStage?.title || (payload.finished ? 'Misión completada' : 'Esperando nodo')
  const progress = getProgress(payload)

  const totalMs = payload.live_status?.total_time_ms || 0
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  return (
    <div style={wrap}>
      <section
        // La marca la usa el reloj de los nodos de pegatina para colgarse justo
        // debajo: esta barra no tiene alto fijo -cambia con el area segura del
        // movil-, asi que hay que medirla en vivo.
        data-saga-player-shell="top"
        style={{
          ...card,
          width: compact ? '100%' : 'min(100%, 760px)',
          // Fina a proposito: con una sola fila, el relleno de 12/16 dejaba
          // una caja grande y medio vacia, que se veia peor que la de antes.
          padding: compact ? '8px 12px' : '9px 14px',
          /**
           * El radio, del tema, con el de siempre como respaldo.
           *
           * Aqui habia un 22/28 clavado, y un numero en linea gana a la regla
           * del tema: la barra seguia redonda en un tema de esquinas duras por
           * mucho que el CSS dijese otra cosa. Es el mismo empate que ya dejo
           * muerta la regla del alfiler del mapa.
           *
           * El respaldo entre parentesis es el valor exacto de antes, asi que
           * un tema que no declare `--theme-radius-shell` -cristal- se ve
           * igual que siempre.
           */
          borderRadius: `var(--theme-radius-shell, ${compact ? 22 : 28}px)`,
        }}
      >
        <div style={topRow}>
          <div style={eyebrow}>{playerName}</div>
          {/* El nodo, en la MISMA linea. Estuvo un rato colgando de su alfiler
              en el mapa y no funciono: choca con las fotos de los nodos y tapa
              el camino, que es lo que hay que ver. Aqui cabe, porque la barra
              ya no lleva ni titulo aparte ni tira de puntos. */}
          <div style={nodoEnLinea} title={stageName}>{stageName}</div>

          <div style={pillRow}>
            <div style={{...soloPill, borderColor: 'rgba(var(--theme-info), 0.4)', color: 'rgb(var(--theme-info-soft))', background: 'rgba(var(--theme-info-mid), 0.15)' }}>
              ⏱️ {timeDisplay}
            </div>
            {mode === 'team' ? (
              <div style={soloPill}>EQUIPO</div>
            ) : null}
            <div style={countPill}>
              {progress.total > 0 ? `${progress.current}/${progress.total}` : '0/0'}
            </div>
          </div>
        </div>

        {/* El nombre del nodo YA NO va aqui.
            Vivia a media pantalla del punto al que se refiere, y habia que
            saltar la vista de la barra al mapa para saber a donde vas. Ahora
            cuelga de su propio alfiler (`saga-mission-node-etiqueta`). */}

        {/* La tira de nodos YA NO va aqui.
            El mapa ya cuenta que nodo esta hecho con el color de cada alfiler
            -hecho / el que toca / pendiente-, asi que la tira repetia esa misma
            informacion ocupando el tercio inferior de la barra. La cuenta 6/10
            sube a la linea de estado, que es el resumen que si hacia falta. */}

      </section>
    </div>
  )
}

const wrap: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'auto',
}

const card: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(var(--theme-shell-a), calc(.72 * var(--theme-solid))) 0%, rgba(var(--theme-shell-b), calc(.64 * var(--theme-solid))) 100%)',
  border: '1px solid rgba(255,255,255,.22)',
  boxShadow: '0 20px 48px rgba(var(--theme-ink), .18), inset 0 1px 0 rgba(255,255,255,.12)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
  color: '#ffffff',
  display: 'grid',
  gap: 8,
}

const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

// El nombre del nodo se come el sitio que sobre, y se corta con puntos suspensivos
// antes que empujar al reloj fuera de la pantalla.
const nodoEnLinea: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 14,
  fontWeight: 800,
  color: '#ffffff',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const pillRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const eyebrow: CSSProperties = {
  color: 'rgb(var(--theme-ok-soft))',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  maxWidth: 150,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const soloPill: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(255,255,255,.16)',
  border: '1px solid rgba(255,255,255,.18)',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.08em',
}













const countPill: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(255,255,255,.12)',
  border: '1px solid rgba(255,255,255,.16)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.05em',
}


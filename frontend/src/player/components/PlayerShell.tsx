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
          // 420px en pantalla grande, no 760.
          //
          // SAGA solo se juega en vertical -hay una pantalla que lo dice si
          // giras el movil-, asi que en un ordenador esto es una interfaz de
          // movil estirada. A 760px el nombre quedaba pegado a la izquierda,
          // el reloj y el contador a la derecha, y medio metro de vacio en
          // medio. A ancho de telefono se lee como lo que es.
          width: compact ? '100%' : 'min(100%, 420px)',
          padding: compact ? '9px 11px' : '11px 14px',
        }}
      >
        <div style={topRow}>
          <div style={eyebrow}>{playerName}</div>
          {/* El nodo, en la MISMA linea. Estuvo un rato colgando de su alfiler
              en el mapa y no funciono: choca con las fotos de los nodos y tapa
              el camino, que es lo que hay que ver. Aqui cabe, porque la barra
              ya no lleva ni titulo aparte ni tira de puntos. */}
          <div style={nodoEnLinea} title={stageName}>{stageName}</div>

          {/* Texto suelto, no pastillas con borde: sobre un velo, tres cajitas
              redondas seguidas eran justo el ruido que se quito del login. */}
          <div style={pillRow}>
            <div style={tiempoTexto}>{timeDisplay}</div>
            {mode === 'team' ? <div style={equipoTexto}>EQUIPO</div> : null}
            <div className="saga-shell-count-pill" style={contadorTexto}>
              {progress.total > 0 ? `${progress.current}/${progress.total}` : '0/0'}
            </div>
          </div>
        </div>

        {/* El progreso ES el filo de la barra.
            El 6/10 dice en que nodo vas, pero no se VE cuanto llevas. La tira
            de puntos si lo enseniaba y se comia el tercio inferior de la barra.
            Esto lo cuenta en 3 px: una regla partida en tantos tramos como
            nodos, encendida hasta donde estas. A sangre, pegada al borde de
            abajo, porque un filo no es una fila: no ocupa alto propio. */}
        <div style={{ ...rielProgreso, margin: '9px 0 0' }}>
          {Array.from({ length: Math.max(progress.total, 1) }).map((_, i) => (
            <div
              key={i}
              style={{
                ...rielTramo,
                background:
                  i < progress.current ? 'var(--theme-primary)' : 'var(--theme-card-inset)',
              }}
            />
          ))}
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

// Con margen a los lados: la tarjeta FLOTA sobre el mapa -diseño "B"-. A
// sangre y con esquinas cuadradas arriba se leia como una barra de sistema
// pegada, no como una tarjeta.
const wrap: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'auto',
  padding: '0 9px',
}

/**
 * Tarjeta flotante SOLIDA -diseno "B", aprobado tras varias rondas.
 *
 * Historial de lo que NO funciono, para no repetirlo: primero era una placa
 * de cristal con borde; luego un velo negro con degradado (sobre el mapa
 * verde daba gris y la pantalla perdia el tema); luego un velo en rojo
 * (seguia siendo degradado translucido = barro marron sin bordes limpios).
 *
 * Lo que funciona es lo mismo que hace funcionar el login: color PLANO y
 * sombra real. Se recorta contra el mapa y se lee de un vistazo.
 */
const card: CSSProperties = {
  background: 'var(--theme-card)',
  borderRadius: 13,
  boxShadow: 'var(--theme-card-shadow)',
  color: '#ffffff',
  display: 'grid',
  gap: 0,
}

// El filo de progreso: a sangre y de 3 px, para que cuente sin ocupar una fila.
const rielProgreso: CSSProperties = {
  display: 'flex',
  gap: 2,
  height: 3,
}

const rielTramo: CSSProperties = {
  flex: 1,
  height: '100%',
  borderRadius: 2,
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
  fontSize: 12.5,
  fontWeight: 700,
  color: 'rgba(255,255,255,.62)',
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
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  maxWidth: 110,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: '0 0 auto',
}

const tiempoTexto: CSSProperties = {
  color: 'rgba(255,255,255,.62)',
  fontSize: 11,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
}

const equipoTexto: CSSProperties = {
  color: 'rgba(255,255,255,.62)',
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: '0.12em',
}













// El contador en el color del tema: es el unico dato de la barra que dice
// cuanto llevas, y sobre un velo se pierde si va del mismo gris que el resto.
const contadorTexto: CSSProperties = {
  color: 'var(--theme-primary)',
  fontSize: 12,
  fontWeight: 900,
  fontVariantNumeric: 'tabular-nums',
}


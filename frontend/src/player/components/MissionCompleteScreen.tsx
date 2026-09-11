import type { TeamProfileLiveStatus } from '../../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'
import { finishOverlayStyle } from './PlayerLayout'

/**
 * Pantalla de cierre de la misión.
 *
 * Antes sólo decía "Misión Completada" con el número de nodos y de fotos: no
 * había tiempo total ni clasificación, así que al terminar no se sabía quién
 * iba ganando. Ahora la tabla sigue viva —los perfiles del equipo se recargan
 * cada 5 s— y se queda en modo espera hasta que termine el último jugador,
 * reordenándose sola. Gana quien menos tiempo total acumule.
 */

interface MissionCompleteScreenProps {
  displayName: string
  selfUser: string
  /** Todos los jugadores, el propio incluido. */
  players: TeamProfileLiveStatus[]
  totalNodes: number
  photoCount: number
  onDismiss: () => void
  onExit: () => void
}

export function formatTotalTime(ms: number): string {
  const totalSecs = Math.max(0, Math.floor((ms || 0) / 1000))
  const hrs = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`
}

/**
 * Quien ha terminado va siempre por delante de quien sigue jugando: si no, un
 * jugador por el nodo 3 adelantaría al que acabó sólo por llevar menos tiempo
 * acumulado. Entre los que han terminado gana el tiempo total más bajo.
 */
export function sortByTotalTime(players: TeamProfileLiveStatus[]): TeamProfileLiveStatus[] {
  return [...players].sort((a, b) => {
    const finA = a.finished ? 1 : 0
    const finB = b.finished ? 1 : 0
    if (finA !== finB) return finB - finA

    if (a.finished && b.finished) {
      const timeA = a.total_time_ms || 0
      const timeB = b.total_time_ms || 0
      if (timeA !== timeB) return timeA - timeB
    } else {
      const lvlA = a.level || 0
      const lvlB = b.level || 0
      if (lvlA !== lvlB) return lvlB - lvlA
    }

    return (a.display_name || a.user).localeCompare(b.display_name || b.user)
  })
}

export function MissionCompleteScreen({
  displayName,
  selfUser,
  players,
  totalNodes,
  photoCount,
  onDismiss,
  onExit,
}: MissionCompleteScreenProps) {
  const sorted = sortByTotalTime(players)

  const selfIndex = sorted.findIndex((p) => p.user === selfUser)
  const selfEntry = selfIndex >= 0 ? sorted[selfIndex] : null

  const pending = sorted.filter((p) => !p.finished)
  const allFinished = sorted.length > 0 && pending.length === 0
  const finishedCount = sorted.length - pending.length

  return (
    <div className="saga-finish-overlay" role="dialog" aria-modal="true">
      <style>{finishOverlayStyle}{missionCompleteStyle}</style>
      <div className="saga-finish-card saga-finish-card--wide">
        <div className="saga-finish-orb">🏆</div>

        <h2 className="saga-finish-title">Misión Completada</h2>
        <p className="saga-finish-subtitle">
          Ruta completa, axente <strong>{displayName}</strong>. Percorriches os {totalNodes} nodos
          da travesía.
        </p>

        <div className="saga-finish-stats saga-finish-stats--three">
          <div className="saga-finish-stat-box">
            <div className="saga-finish-stat-val">
              {totalNodes}/{totalNodes}
            </div>
            <div className="saga-finish-stat-lbl">Nodos</div>
          </div>
          <div className="saga-finish-stat-box">
            <div className="saga-finish-stat-val saga-finish-stat-val--time">
              {formatTotalTime(selfEntry?.total_time_ms || 0)}
            </div>
            <div className="saga-finish-stat-lbl">Tempo total</div>
          </div>
          <div className="saga-finish-stat-box">
            <div className="saga-finish-stat-val">{photoCount}</div>
            <div className="saga-finish-stat-lbl">Fotos</div>
          </div>
        </div>

        {/* Estado de la clasificación: en espera mientras quede gente jugando. */}
        <div className={allFinished ? 'saga-rank-banner saga-rank-banner--done' : 'saga-rank-banner'}>
          {allFinished ? (
            <>
              <span className="saga-rank-banner-icon">✅</span>
              <span>
                Clasificación final · <strong>{sorted.length}</strong>{' '}
                {sorted.length === 1 ? 'xogador' : 'xogadores'}
              </span>
            </>
          ) : (
            <>
              <span className="saga-rank-spinner" aria-hidden="true" />
              <span>
                Agardando a que rematen os demais · <strong>{finishedCount}</strong>/{sorted.length}
              </span>
            </>
          )}
        </div>

        <div className="saga-rank-title">
          {allFinished ? '🏁 CLASIFICACIÓN FINAL' : '⏳ CLASIFICACIÓN PROVISIONAL'}
        </div>

        {/*
          O que mide o reloxo, dito onde se le a clasificacion.

          Despois da ruta a pregunta que saiu unha e outra vez foi por que un
          tempo era tan alto ou tan baixo. A resposta e sempre a mesma e cabe
          nunha liña: so conta o que se tarda DENTRO de cada nodo. Poñela aqui
          aforra a discusion.
        */}
        <p className="saga-rank-regra">
          Só conta o tempo dentro de cada nodo. O camiño entre eles non puntúa.
        </p>

        {/*
          A ruta rematou con tempos que a app mediu mal: reloxos que seguiron
          correndo mentres ninguén xogaba, e penalizacións de dous minutos que
          caeron por un fallo do lector de pegatinas, non por saltarse nada.
          Revisouse nodo a nodo e corrixiuse. Quen mira isto ten dereito a saber
          que o que ve non e o que lle saiu no monte, e por que.
        */}
        {allFinished ? (
          <div className="saga-rank-aviso">
            <b>Clasificación revisada.</b> Corrixíronse os reloxos que seguiron
            correndo sen xogar e retiráronse as penalizacións que veñen dun fallo
            do lector de pegatinas. O detalle de cada cambio está na páxina da
            clasificación.
          </div>
        ) : null}

        <ol className="saga-rank-list">
          {sorted.map((player, idx) => {
            const isSelf = player.user === selfUser
            const finished = Boolean(player.finished)
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
            const avatarSrc = getPlayerAvatarUrl(player)

            /**
             * La diferencia con el primero.
             *
             * Una lista de tiempos sueltos obliga a restar de cabeza para saber
             * por cuánto vas. Con el "+" al lado se lee de un vistazo, que es
             * lo que hace cualquier hoja de resultados de una carrera.
             */
            const msPrimeiro = Number(sorted[0]?.total_time_ms || 0)
            const diferenza = Number(player.total_time_ms || 0) - msPrimeiro
            const amosarDiferenza = finished && idx > 0 && diferenza > 0 && msPrimeiro > 0
            const dif = `+${Math.floor(diferenza / 60000)}:${String(
              Math.floor((diferenza % 60000) / 1000)
            ).padStart(2, '0')}`

            const clases = [
              'saga-rank-row',
              isSelf ? 'saga-rank-row--self' : '',
              idx === 0 && finished ? 'saga-rank-row--gana' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <li key={player.user} className={clases}>
                <span className="saga-rank-pos">{medal}</span>

                <span className="saga-rank-avatar" style={{ background: getPlayerColor(player) }}>
                  {avatarSrc ? (
                    // Sin foto se pedía /default-avatar.png, que no existe: salía
                    // el icono de imagen rota en toda la clasificación final.
                    <img
                      src={avatarSrc}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <span className="saga-rank-initials">{getPlayerAvatarInitials(player)}</span>
                  )}
                </span>

                <span className="saga-rank-name">
                  {player.display_name || player.user}
                  {isSelf ? <span className="saga-rank-you">ti</span> : null}
                </span>

                <span className="saga-rank-time">
                  {finished ? (
                    <>
                      {formatTotalTime(player.total_time_ms || 0)}
                      {amosarDiferenza ? <span className="saga-rank-dif">{dif}</span> : null}
                    </>
                  ) : (
                    <span className="saga-rank-playing">
                      Nodo {player.level || 0}/{totalNodes}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>

        <button type="button" className="saga-finish-btn-primary" onClick={onDismiss}>
          Ver mapa da ruta
        </button>

        <button type="button" className="saga-finish-btn-secondary" onClick={onExit}>
          Saír
        </button>
      </div>
    </div>
  )
}

const missionCompleteStyle = `
/* O aviso de que a clasificación se revisou. */
.saga-rank-aviso {
  margin: 0 0 10px;
  padding: 9px 11px;
  border-radius: 11px;
  background: rgba(var(--theme-info), .14);
  border: 1px solid rgba(var(--theme-info), .34);
  font-size: 11.5px;
  line-height: 1.5;
  color: #e0f2fe;
  text-align: left;
}
.saga-rank-aviso b { color: rgb(var(--theme-info-soft)); }
/* A regra do reloxo, en pequeno pero visible. */
.saga-rank-regra {
  margin: -4px 0 8px;
  font-size: 11.5px;
  line-height: 1.45;
  color: rgba(var(--theme-line-soft), .78);
  text-align: left;
}
/* El primero se ve de lejos: es el unico dato que todo el mundo busca. */
.saga-rank-row--gana {
  background: linear-gradient(90deg, rgba(251,191,36,.34), rgba(251,191,36,.10));
  border-color: rgba(251,191,36,.62) !important;
  box-shadow: 0 0 22px rgba(251,191,36,.20);
}
.saga-rank-row--gana .saga-rank-time {
  color: #fbbf24;
}
/* Lo que le sacas al primero, en pequeño y debajo del tiempo. */
.saga-rank-dif {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 800;
  color: rgba(226,232,240,.9);
  font-variant-numeric: tabular-nums;
}
.saga-finish-card--wide {
  width: min(100%, 440px);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  gap: 12px;
}
.saga-finish-stats--three {
  grid-template-columns: repeat(3, 1fr);
}
.saga-finish-stat-val--time {
  font-size: 16px;
  color: #fbbf24;
}
.saga-rank-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  color: #fcd34d;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 12px;
  padding: 9px 12px;
}
.saga-rank-banner--done {
  color: #6ee7b7;
  background: rgba(var(--theme-ok), 0.1);
  border-color: rgba(var(--theme-ok), 0.28);
}
.saga-rank-banner-icon { font-size: 14px; }
.saga-rank-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid rgba(251, 191, 36, 0.25);
  border-top-color: #fbbf24;
  flex-shrink: 0;
  animation: sagaRankSpin 0.9s linear infinite;
}
@keyframes sagaRankSpin {
  to { transform: rotate(360deg); }
}
.saga-rank-title {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.5);
  text-align: left;
}
.saga-rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  text-align: left;
}
.saga-rank-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 11px;
  border-radius: 13px;
  /* Las filas se perdían contra el fondo: apenas un 3% de blanco encima de casi
     negro. Con más luz se leen de un vistazo y la lista deja de ser un bloque. */
  background: rgba(255, 255, 255, 0.085);
  border: 1px solid rgba(255, 255, 255, 0.14);
  /* Se reordena sola cada vez que alguien termina. */
  transition: background 0.3s ease, border-color 0.3s ease;
}
.saga-rank-row--self {
  background: rgba(var(--theme-ok-soft), 0.22);
  border-color: rgba(var(--theme-ok-soft), 0.55);
}
.saga-rank-pos {
  width: 26px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}
.saga-rank-avatar {
  /* Más grandes: con 28 px la cara de cada uno no se distinguía, y en la
     pantalla del final es justo lo que se mira. */
  width: 40px;
  height: 40px;
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  overflow: hidden;
  flex-shrink: 0;
  display: inline-flex;
}
.saga-rank-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.saga-rank-initials {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 14px;
  font-weight: 900;
  color: #0b1220;
}
.saga-rank-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 800;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.saga-rank-you {
  margin-left: 6px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgb(var(--theme-ok-soft));
  border: 1px solid rgba(var(--theme-ok-soft), 0.4);
  border-radius: 999px;
  padding: 1px 6px;
}
.saga-rank-time {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 900;
  color: #fcd34d;
  text-align: right;
}
.saga-rank-playing {
  color: rgba(var(--theme-line), 0.9);
  font-weight: 700;
}
`

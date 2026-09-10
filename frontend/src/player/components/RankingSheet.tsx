import { useState, useEffect, type CSSProperties } from 'react'
import type { TeamProfileLiveStatus } from '../../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'
import { SwipeableSheet } from './SwipeableSheet'
import { leerMarcaDeTiempo } from '../../shared/fechas'

interface RankingSheetProps {
  open: boolean
  players: TeamProfileLiveStatus[]
  onClose: () => void
  /** Quien esta mirando. Sin esto no habia forma de saber cual eres tu. */
  selfUser?: string
}

// Verde fijo, no --theme-done: ese token es la piel de marca de cada tema, y
// en fuego es naranja-terracota. "Este jugador esta conectado AHORA MISMO" es
// una señal semantica -verde universal de "activo"-, no decoracion de marca.
const VERDE_EN_LINEA = '#22c55e'

function formatearTiempo(ms: number) {
  const total = Math.floor(ms / 1000)
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const segundos = total % 60
  if (horas > 0) return `${horas}h ${minutos.toString().padStart(2, '0')}m`
  return `${minutos}m ${segundos.toString().padStart(2, '0')}s`
}

function readNumericStat(player: TeamProfileLiveStatus, keys: string[]) {
  const raw = player as unknown as Record<string, unknown>
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function readTimestamp(player: TeamProfileLiveStatus, keys: string[]) {
  const raw = player as unknown as Record<string, unknown>
  for (const key of keys) {
    const value = raw[key]
    const marca = leerMarcaDeTiempo(value)
    if (marca !== null) return marca
  }
  return Number.MAX_SAFE_INTEGER
}

function Retrato({
  jugador,
  medida,
  aro,
}: {
  jugador: TeamProfileLiveStatus
  medida: number
  aro?: string
}) {
  const url = getPlayerAvatarUrl(jugador)

  return (
    <div
      style={{
        width: medida,
        height: medida,
        // La cara va redonda en los dos temas: --theme-radius-pill vale 3px
        // en fuego a proposito, y una cara en cuadrado parece foto de carnet.
        borderRadius: 'var(--theme-radius-avatar)',
        background: getPlayerColor(jugador),
        border: aro ? `2px solid ${aro}` : 0,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          // Sin foto se caia a /default-avatar.png, que NO existe (404): todos
          // los jugadores sin retrato salian con una imagen rota.
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <span style={{ fontSize: medida * 0.34, fontWeight: 900, color: '#0b1220' }}>
          {getPlayerAvatarInitials(jugador)}
        </span>
      )}
    </div>
  )
}

export function RankingSheet({ open, players, onClose, selfUser }: RankingSheetProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [open])

  if (!open) return null

  const sorted = [...players].sort((a, b) => {
    const pointsA = readNumericStat(a, ['score', 'points', 'total_points'])
    const pointsB = readNumericStat(b, ['score', 'points', 'total_points'])
    if (pointsA !== pointsB) return pointsB - pointsA

    const lvlA = a.finished ? 999 : a.level || 0
    const lvlB = b.finished ? 999 : b.level || 0
    if (lvlA !== lvlB) return lvlB - lvlA

    const timeA = a.total_time_ms || 0
    const timeB = b.total_time_ms || 0
    if (timeA !== timeB && timeA > 0 && timeB > 0) return timeA - timeB

    const dateA = readTimestamp(a, ['finished_at', 'completed_at', 'updated_at', 'last_seen'])
    const dateB = readTimestamp(b, ['finished_at', 'completed_at', 'updated_at', 'last_seen'])
    if (dateA !== dateB) return dateA - dateB

    return a.display_name.localeCompare(b.display_name)
  })

  const liveCount = sorted.filter((p) => p.presence === 'live').length
  const hayPodio = sorted.length >= 3
  const podio = hayPodio ? sorted.slice(0, 3) : []
  const resto = hayPodio ? sorted.slice(3) : sorted
  const mejorTiempo = sorted.find((p) => (p.total_time_ms || 0) > 0)?.total_time_ms || 0

  return (
    <SwipeableSheet
      open={open}
      onClose={onClose}
      sheetStyle={{
        background: 'var(--theme-card)',
        border: 0,
        boxShadow: 'var(--theme-card-shadow)',
      }}
    >
      {/* Cabecera sin gritos: "Clasificación", no "🏆 CLASIFICACIÓN" a 26px
          con versalitas. El trofeo ya esta en el icono que abre esta hoja. */}
      <div style={headerRow}>
        <div style={{ minWidth: 0 }}>
          <div style={title}>Clasificación</div>
          <div style={subtitulo}>
            {sorted.length} {sorted.length === 1 ? 'xogador' : 'xogadores'}
            {liveCount > 0 ? (
              <span style={{ color: VERDE_EN_LINEA, fontWeight: 800 }}> · {liveCount} en liña</span>
            ) : null}
          </div>
        </div>
        <button type="button" aria-label="Cerrar" style={closeBtn} onClick={onClose}>
          ×
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={emptyState}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>🏆</div>
          <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: 15 }}>Aínda non hai tempos</div>
          <div style={{ color: 'rgba(255,255,255,.55)', marginTop: 5, fontSize: 12.5 }}>
            Aparecerán en canto alguén complete un nodo.
          </div>
        </div>
      ) : (
        <>
          {/**
           * Podio para los tres primeros.
           *
           * En una lista plana el primero y el cuarto se parecen demasiado, y
           * esto es una carrera: los tres de cabeza tienen que verse de un
           * vistazo. El del MEDIO es el ganador -mas grande y con el aro del
           * tema-, no el de la izquierda, que es como se lee un podio.
           */}
          {hayPodio ? (
            <div style={podioFila}>
              {[
                { jugador: podio[1], aro: '#c0c0c0', ganador: false },
                { jugador: podio[0], aro: 'var(--theme-primary)', ganador: true },
                { jugador: podio[2], aro: '#cd7f32', ganador: false },
              ].map(({ jugador, aro, ganador }) => (
                <div key={jugador.user} style={podioColumna}>
                  <Retrato jugador={jugador} medida={ganador ? 54 : 42} aro={aro} />
                  <div style={ganador ? podioNombreGanador : podioNombre}>
                    {selfUser && jugador.user === selfUser
                      ? 'Ti'
                      : jugador.display_name || jugador.user}
                  </div>
                  <div style={ganador ? podioTiempoGanador : podioTiempo}>
                    {formatearTiempo(jugador.total_time_ms || 0)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 0 }}>
            {resto.map((player) => {
              const idx = sorted.indexOf(player)
              const isLive = player.presence === 'live'
              const currentMs = player.total_time_ms || 0
              const soyYo = Boolean(selfUser && player.user === selfUser)

              /**
               * La barra compara con el PRIMERO, no con el tiempo maximo.
               *
               * En una tabla de tiempos el numero suelto no deja comparar de
               * un golpe: hace falta saber cuanto te separa de la cabeza.
               * Mas llena = mas cerca del primero.
               */
              const ratio =
                currentMs > 0 && mejorTiempo > 0 ? Math.min(1, mejorTiempo / currentMs) : 0

              return (
                <article key={player.user} style={soyYo ? filaYo : fila}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span
                      style={{
                        ...puesto,
                        color: soyYo ? 'var(--theme-primary)' : 'rgba(255,255,255,.35)',
                      }}
                    >
                      {idx + 1}
                    </span>

                    <Retrato
                      jugador={player}
                      medida={32}
                      aro={soyYo ? 'var(--theme-primary)' : undefined}
                    />

                    <span style={{ ...nombre, color: soyYo ? 'var(--theme-primary)' : '#fff' }}>
                      {soyYo ? 'Ti' : player.display_name || player.user}
                    </span>

                    {/* El nodo SOLO si aun no ha acabado. Antes ponia
                        "¡FINALIZADO!" en cada fila: con todos terminados eran
                        nueve lineas identicas que no informaban de nada. */}
                    {!player.finished ? (
                      <span style={etiquetaNodo}>Nodo {player.level || 0}</span>
                    ) : null}
                    {isLive ? <span style={puntoEnLinea} /> : null}

                    <span
                      style={{
                        ...tiempo,
                        color: soyYo ? 'var(--theme-primary)' : 'rgba(255,255,255,.62)',
                      }}
                    >
                      {formatearTiempo(currentMs)}
                    </span>
                  </div>

                  <div style={barraCarril}>
                    <div
                      style={{
                        ...barraRelleno,
                        width: `${Math.round(ratio * 100)}%`,
                        background: soyYo ? 'var(--theme-primary)' : 'rgba(255,255,255,.20)',
                      }}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </SwipeableSheet>
  )
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 16,
}

const title: CSSProperties = {
  color: '#f8fafc',
  fontSize: 19,
  fontWeight: 900,
  lineHeight: 1.1,
  letterSpacing: '-0.025em',
}

const subtitulo: CSSProperties = {
  marginTop: 3,
  fontSize: 11.5,
  fontWeight: 700,
  color: 'rgba(255,255,255,.55)',
}

const closeBtn: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 10,
  border: 0,
  background: 'var(--theme-card-inset)',
  color: 'rgba(255,255,255,.7)',
  fontSize: 17,
  fontWeight: 900,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
}

const podioFila: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  gap: 16,
  paddingBottom: 18,
  marginBottom: 4,
  borderBottom: `1px solid var(--theme-hairline)`,
}

const podioColumna: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 0,
  maxWidth: 100,
}

const podioNombre: CSSProperties = {
  marginTop: 7,
  fontSize: 12,
  fontWeight: 800,
  color: '#fff',
  maxWidth: 92,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const podioNombreGanador: CSSProperties = {
  ...podioNombre,
  fontSize: 13.5,
  fontWeight: 900,
}

const podioTiempo: CSSProperties = {
  marginTop: 2,
  fontSize: 10.5,
  fontWeight: 800,
  color: 'rgba(255,255,255,.5)',
}

const podioTiempoGanador: CSSProperties = {
  ...podioTiempo,
  fontSize: 12,
  color: 'var(--theme-primary)',
}

const fila: CSSProperties = {
  padding: '10px 0 9px',
  borderBottom: `1px solid var(--theme-hairline)`,
}

// Tu fila, marcada. Antes no habia forma de saber cual eras en una lista de
// quince, que es justo lo primero que se busca al abrir una clasificacion.
const filaYo: CSSProperties = {
  ...fila,
  background: 'var(--theme-tint)',
  borderRadius: 10,
  padding: '10px 8px 9px',
  margin: '0 -8px',
}

const puesto: CSSProperties = {
  width: 16,
  textAlign: 'center',
  fontSize: 12,
  fontWeight: 900,
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
}

const nombre: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13.5,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const etiquetaNodo: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: 'rgba(255,255,255,.5)',
  flexShrink: 0,
}

const puntoEnLinea: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: VERDE_EN_LINEA,
  flexShrink: 0,
}

const tiempo: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
}

const barraCarril: CSSProperties = {
  height: 2,
  marginTop: 7,
  marginLeft: 27,
  borderRadius: 2,
  background: 'var(--theme-card-inset)',
  overflow: 'hidden',
}

const barraRelleno: CSSProperties = {
  height: '100%',
  borderRadius: 2,
  transition: 'width .6s cubic-bezier(.22,1,.36,1)',
}

const emptyState: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '36px 16px',
  textAlign: 'center',
}

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'
import { elementoDeRetrato } from '../avatares/retratoDeMapa'
import { prefiereMenosMovimiento } from '../avatares/celebracion'
import { aspectoDe } from '../avatares3d/mixamo/catalogo'
import { SwipeableSheet } from './SwipeableSheet'
import {
  distanciaAlDeDelante,
  nodosHechos,
  ordenarClasificacion,
  puestosDe,
  puestosGanados,
  sinEmpezar,
  totalDeNodos,
  type Distancia,
} from './clasificacion'
import type { TextosDePantallas } from './textosDePantallas'
import { useTextosDePantallas } from './useTextosDePantallas'

interface RankingSheetProps {
  open: boolean
  players: TeamProfileLiveStatus[]
  onClose: () => void
  /** Quien esta mirando. Sin esto no habia forma de saber cual eres tu. */
  selfUser?: string
}

type J = TeamProfileLiveStatus
type Tx = TextosDePantallas['clasificacion']

// Verde fijo, no --theme-done: ese token es la piel de marca de cada tema, y
// en fuego es naranja-terracota. "Este jugador esta conectado AHORA MISMO" es
// una señal semantica -verde universal de "activo"-, no decoracion de marca.
const VERDE_EN_LINEA = '#22c55e'
// Las medallas de los tres primeros: el oro es el color del tema; plata y bronce, los de siempre.
const MEDALLA = ['var(--theme-primary)', '#c0c0c0', '#cd7f32']
/** Lo que viste la última vez (en este móvil y para este jugador): para contar los puestos ganados o perdidos. */
const CLAVE_VISTO = 'saga-clasif-visto:'
const SUBE = 'rgb(var(--theme-ok-soft))'
const BAJA = 'color-mix(in srgb, rgb(var(--theme-pin-todo)) 70%, #ffffff)'

function formatearTiempo(ms: number) {
  const total = Math.floor(ms / 1000)
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const segundos = total % 60
  if (horas > 0) return `${horas}h ${minutos.toString().padStart(2, '0')}m`
  return `${minutos}m ${segundos.toString().padStart(2, '0')}s`
}

/** «10 s», «1m 13s», «1 nodo», «empate». */
function textoDeDistancia(d: Distancia, tx: Tx): string {
  if (!d) return ''
  if (d.tipo === 'empate') return tx.empate
  if (d.tipo === 'nodos') return tx.nodos(d.n)
  return d.ms >= 60000 ? formatearTiempo(d.ms) : `${Math.round(d.ms / 1000)} s`
}

/** En la fila: «+10 s», «1 nodo detrás». */
function textoDeFila(d: Distancia, tx: Tx): string {
  if (!d) return ''
  if (d.tipo === 'nodos') return tx.nodosDetras(d.n)
  return d.tipo === 'tiempo' ? `+${textoDeDistancia(d, tx)}` : tx.empate
}

/** La cara de su personaje 3D (o su foto), con el aro de su color: la inicial sola no decía quién era. */
function Cara({ j, lado, aro }: { j: J; lado: number; aro?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const mx = aspectoDe(j).mx
  const colorBruto = aro || getPlayerColor(j)
  const color = /^#[0-9a-f]{6}$/i.test(colorBruto) || colorBruto.startsWith('var(') ? colorBruto : '#3b82f6'
  const foto = getPlayerAvatarUrl(j) || undefined
  useEffect(() => {
    ref.current?.replaceChildren(elementoDeRetrato(mx, color, lado, foto))
  }, [mx, color, lado, foto])
  return (
    <span ref={ref} aria-hidden="true" style={{ width: lado, height: lado, flexShrink: 0, display: 'inline-flex' }} />
  )
}

/** Nodos hechos en tramos, como el riel del HUD. */
function Tramos({ hechos, total, ancho, tx }: { hechos: number; total: number; ancho: number; tx: Tx }) {
  return (
    <span role="img" aria-label={tx.nodosDe(hechos, total)} style={{ display: 'inline-flex', gap: 2, width: ancho }}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} style={{ ...tramo, background: i < hechos ? 'var(--theme-primary)' : 'rgba(255,255,255,.14)' }} />
      ))}
    </span>
  )
}

function Cambio({ n, tx }: { n: number; tx: Tx }) {
  if (!n) return null
  return (
    <span aria-label={tx.cambioDePuesto(n)} title={tx.cambioDePuesto(n)} style={{ ...chipCambio, color: n > 0 ? SUBE : BAJA }}>
      {n > 0 ? '▲' : '▼'} {Math.abs(n)}
    </span>
  )
}

/** Los puestos de la última vez que miraste. Se leen al abrir y se guardan los de ahora. */
function usePuestosAnteriores(sorted: J[], selfUser?: string): Record<string, number> {
  const clave = CLAVE_VISTO + (selfUser || '')
  const [antes] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(clave) || '{}') || {}
    } catch {
      return {}
    }
  })
  const firma = sorted.map((j) => j.user).join('|')
  useEffect(() => {
    try {
      window.localStorage.setItem(clave, JSON.stringify(puestosDe(sorted)))
    } catch {
      /* sin almacenamiento: no se cuentan los cambios */
    }
    // Sólo cuando cambia el orden, no en cada latido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, firma])
  return antes
}

/**
 * Las filas que han cambiado de puesto entran deslizándose desde donde estaban, UNA vez al abrir (0,7 s, Web
 * Animations, sin bucle propio). Con «reducir movimiento», nada.
 */
function useDeslizarCambios(lista: RefObject<HTMLDivElement | null>, antes: Record<string, number>, sorted: J[]) {
  useLayoutEffect(() => {
    const raiz = lista.current
    if (!raiz || prefiereMenosMovimiento(window.matchMedia?.bind(window))) return
    raiz.querySelectorAll<HTMLElement>('[data-user]').forEach((fila) => {
      const u = fila.dataset.user || ''
      const viejo = antes[u]
      const nuevo = sorted.findIndex((j) => j.user === u) + 1
      if (!viejo || !nuevo || viejo === nuevo || typeof fila.animate !== 'function') return
      fila.animate(
        [{ transform: `translateY(${(viejo - nuevo) * fila.offsetHeight}px)` }, { transform: 'translateY(0)' }],
        { duration: 700, delay: 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }
      )
    })
    // Sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function RankingSheet({ open, players, onClose, selfUser }: RankingSheetProps) {
  const tx = useTextosDePantallas().clasificacion
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [open])

  /**
   * NO se hace `if (!open) return null`.
   *
   * Lo hacia, y por eso la Clasificacion era la unica de las tres hojas que
   * ni entraba ni salia: al cerrarla, este `return` desmontaba la hoja ENTERA
   * un nivel por encima de SwipeableSheet, asi que la animacion de bajada no
   * llegaba a existir nunca. Es exactamente el mismo fallo que ya se corrigio
   * DENTRO de SwipeableSheet, reintroducido desde fuera. Medido por el banco:
   * 0 fotogramas a medio subir y 0 a medio bajar, contra 6 y 4 de las otras.
   *
   * Quien decide cuando montar y cuando desmontar es la hoja, y solo ella.
   */
  // El orden vive en `clasificacion.ts`. Desempata por lo que NO se mueve (hora
  // de fin, nombre, id): antes era `last_seen`, que cambia en cada latido y hacía
  // que dos jugadores empatados se intercambiaran de sitio cada pocos segundos.
  const sorted = ordenarClasificacion(players)
  const liveCount = sorted.filter((p) => p.presence === 'live').length

  return (
    <SwipeableSheet
      open={open}
      onClose={onClose}
      sheetStyle={{
        /**
         * Alto acotado, no fijo.
         *
         * Con 78dvh clavados quedaba una tira de tarjeta vacia debajo del
         * ultimo jugador -"abajo hay una tira que no se completa"- y encima
         * obligaba a deslizar para ver a gente que cabia de sobra. Ahora la
         * lista manda: crece con los jugadores que haya y para cuando llena
         * la pantalla.
         */
        minHeight: '40dvh',
        maxHeight: '86dvh',
        // 24/10: pizarra, no la tarjeta del tema (azul saturado en «ría»).
        background: 'var(--saga-pizarra)',
        borderTop: '1px solid var(--saga-pizarra-borde)',
      }}
    >
      {/* Cabecera sin gritos: "Clasificación", no "🏆 CLASIFICACIÓN" a 26px
          con versalitas. El trofeo ya esta en el icono que abre esta hoja. */}
      <div style={headerRow}>
        <div style={{ minWidth: 0 }}>
          <div style={title}>{tx.titulo}</div>
          <div style={subtitulo}>
            {tx.jugadores(sorted.length)}
            {liveCount > 0 ? (
              <span style={{ color: VERDE_EN_LINEA, fontWeight: 800 }}>{tx.enLinea(liveCount)}</span>
            ) : null}
          </div>
        </div>
        <button type="button" aria-label={tx.cerrar} className="saga-toque" style={closeBtn} onClick={onClose}>
          ×
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={emptyState}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>🏆</div>
          <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: 15 }}>{tx.vacioTitulo}</div>
          <div style={{ color: 'rgba(255,255,255,.55)', marginTop: 5, fontSize: 12.5 }}>
            {tx.vacioDetalle}
          </div>
        </div>
      ) : (
        <Tabla sorted={sorted} selfUser={selfUser} tx={tx} />
      )}
    </SwipeableSheet>
  )
}

/**
 * Tu carrera y la tabla. Va aparte porque la hoja NO se desmonta al cerrarla (PanelDiferido la deja montada) y
 * esto sí: se monta al abrir, así que «la última vez que miraste» es de verdad la última apertura, y las filas se
 * deslizan cada vez que se abre, no sólo la primera.
 */
function Tabla({ sorted, selfUser, tx }: { sorted: J[]; selfUser?: string; tx: Tx }) {
  const total = totalDeNodos(sorted)
  const antes = usePuestosAnteriores(sorted, selfUser)
  const lista = useRef<HTMLDivElement | null>(null)
  useDeslizarCambios(lista, antes, sorted)
  const esYo = (j: J) => Boolean(selfUser && j.user === selfUser)
  const nombre = (j: J) => (esYo(j) ? tx.tu : j.display_name || j.user)
  const iYo = sorted.findIndex(esYo)

  return (
    <>
      {/**
       * 24/10: arriba, TU carrera (puesto, cuánto has subido, quién va delante y detrás y a cuánto): es lo
       * primero que se busca al abrir. Debajo, la tabla entera. Sin el podio aparte: los tres primeros ya van
       * en la tabla con su medalla, y repetirlos encima era leer lo mismo dos veces en una pantalla de 360 px.
       */}
      {iYo >= 0 ? (
        <TuCarrera
          tx={tx}
          yo={sorted[iYo]}
          puesto={iYo + 1}
          de={sorted.length}
          total={total}
          cambio={puestosGanados(antes, sorted, selfUser)}
          delante={sorted[iYo - 1]}
          detras={sorted[iYo + 1]}
          nombre={nombre}
        />
      ) : null}

      <div style={cabeceraTabla} aria-hidden="true">
        <span style={{ width: 22, textAlign: 'center' }}>#</span>
        <span style={{ flex: 1, paddingLeft: 44 }}>{tx.colJugador}</span>
        <span>{tx.colTiempo}</span>
      </div>
      <div ref={lista} style={{ display: 'grid' }}>
        {sorted.map((j, i) => {
          const yo = esYo(j)
          const quieto = sinEmpezar(j)
          return (
            <div key={j.user} data-user={j.user} style={yo ? filaYo : fila}>
              <span
                style={{
                  ...puesto,
                  ...(i < 3 && !quieto ? { background: MEDALLA[i], color: 'rgb(var(--theme-ink))' } : null),
                }}
              >
                {i + 1}
              </span>
              <Cara j={j} lado={34} aro={yo ? 'var(--theme-primary)' : undefined} />
              <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 5 }}>
                <span style={nombreFila}>
                  <span style={recorte}>{nombre(j)}</span>
                  {j.presence === 'live' ? <span style={puntoEnLinea} /> : null}
                  <Cambio n={puestosGanados(antes, sorted, j.user)} tx={tx} />
                </span>
                {quieto ? (
                  <small style={meta}>{tx.sinEmpezar}</small>
                ) : (
                  <Tramos hechos={nodosHechos(j, total)} total={total} ancho={52} tx={tx} />
                )}
              </span>
              <span style={{ textAlign: 'right', display: 'grid', gap: 2, flexShrink: 0 }}>
                <b style={tiempoFila}>{quieto ? '—' : formatearTiempo(j.total_time_ms || 0)}</b>
                <small style={meta}>
                  {i === 0
                    ? quieto
                      ? ''
                      : tx.enCabeza
                    : textoDeFila(distanciaAlDeDelante(sorted[i - 1], j, total), tx)}
                </small>
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/** Tu carrera: «6.º de 11», ▲2, quién va delante y detrás y a cuánto, tu tiempo y tus tramos. */
function TuCarrera({
  tx,
  yo,
  puesto: n,
  de,
  total,
  cambio,
  delante,
  detras,
  nombre,
}: {
  tx: Tx
  yo: J
  puesto: number
  de: number
  total: number
  cambio: number
  delante?: J
  detras?: J
  nombre: (j: J) => string
}) {
  const alDeDelante = textoDeDistancia(distanciaAlDeDelante(delante, yo, total), tx)
  const alDeDetras = detras ? textoDeDistancia(distanciaAlDeDelante(yo, detras, total), tx) : ''
  return (
    <div style={tarjeta}>
      <Cara j={yo} lado={56} aro="var(--theme-primary)" />
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
        <small style={{ ...meta, textTransform: 'uppercase', letterSpacing: '.08em' }}>{tx.tuPuesto}</small>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b style={puestoGrande}>{n}.º</b>
          <span style={meta}>{tx.deTotal(de)}</span>
          <Cambio n={cambio} tx={tx} />
        </div>
        {delante ? (
          <small style={{ ...meta, ...recorte, color: 'rgba(255,255,255,.82)' }}>
            ▲ {nombre(delante)}
            {alDeDelante ? ` · ${alDeDelante}` : ''}
          </small>
        ) : (
          <small style={{ ...meta, color: 'rgba(255,255,255,.82)' }}>{tx.vasEnCabeza}</small>
        )}
        {detras && alDeDetras ? (
          <small style={{ ...meta, ...recorte }}>
            ▼ {nombre(detras)} · {alDeDetras}
          </small>
        ) : null}
      </div>
      <div style={{ display: 'grid', justifyItems: 'end', gap: 6, flexShrink: 0 }}>
        <b style={tiempoFila}>{sinEmpezar(yo) ? '—' : formatearTiempo(yo.total_time_ms || 0)}</b>
        <Tramos hechos={nodosHechos(yo, total)} total={total} ancho={52} tx={tx} />
      </div>
    </div>
  )
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  // La hoja ya no trae relleno arriba -se apoya en el borde de la pantalla y
  // solo redondea arriba-, asi que el aire del titulo lo pone la cabecera, y
  // se queda pegada al rodar la lista para no perder de vista la X.
  position: 'sticky',
  top: 0,
  zIndex: 4,
  paddingTop: 14,
  paddingBottom: 14,
  marginBottom: 2,
  background: 'var(--saga-pizarra-a)',
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
  // Ver la nota de PlayerHud.tsx: area de toque.
  width: 36,
  height: 36,
  borderRadius: 10,
  // Azul noche, como las cruces del HUD y de la tienda (antes, la tarjeta del tema: azul en «ría»).
  border: '1px solid var(--saga-pizarra-borde)',
  background: 'var(--saga-pizarra-noche)',
  color: '#ffffff',
  fontSize: 17,
  fontWeight: 900,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
}

const tarjeta: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  marginBottom: 10,
  borderRadius: 14,
  background: 'var(--saga-pizarra-tarjeta)',
  border: '1px solid var(--saga-pizarra-raya)',
}

const puestoGrande: CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  lineHeight: 1,
  color: '#ffffff',
  fontVariantNumeric: 'tabular-nums',
}

// Una sola línea también a 360 px: «# · Jugador · Tiempo» (en la propuesta, «Jugador · nodos» partía en dos).
const cabeceraTabla: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '2px 2px 6px',
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  color: 'rgba(255,255,255,.45)',
  borderBottom: '1px solid var(--saga-pizarra-raya)',
}

const fila: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 56,
  padding: '6px 2px',
  borderBottom: '1px solid var(--saga-pizarra-raya)',
}

// Tu fila, marcada en su sitio. 25/10: ya no se queda fija abajo al rodar (Oscar: se veía mal encima de las
// demás); tu puesto ya lo dice la tarjeta de arriba.
const filaYo: CSSProperties = {
  ...fila,
  margin: '0 -8px',
  padding: '6px 10px',
  borderRadius: 12,
  borderBottom: 0,
  background: 'color-mix(in srgb, var(--saga-pizarra-a) 84%, #ffffff)',
  boxShadow: 'inset 3px 0 0 var(--theme-primary)',
}

const puesto: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  display: 'grid',
  placeItems: 'center',
  fontSize: 12,
  fontWeight: 900,
  color: 'rgba(255,255,255,.55)',
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
}

const recorte: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const nombreFila: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  fontSize: 14,
  fontWeight: 800,
  color: '#ffffff',
}

const tramo: CSSProperties = { flex: 1, height: 4, borderRadius: 2 }

const tiempoFila: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 900,
  color: '#f1f5f9',
  fontVariantNumeric: 'tabular-nums',
}

const meta: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,.56)' }

const chipCambio: CSSProperties = {
  flexShrink: 0,
  fontSize: 10.5,
  fontWeight: 900,
  padding: '1px 6px',
  borderRadius: 999,
  background: 'rgba(var(--theme-ink-deep), .35)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}

const puntoEnLinea: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: VERDE_EN_LINEA,
  flexShrink: 0,
}

const emptyState: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '36px 16px',
  textAlign: 'center',
}

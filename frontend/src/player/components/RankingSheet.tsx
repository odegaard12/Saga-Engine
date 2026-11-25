import { memo, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'
import { elementoDeRetrato } from '../avatares/retratoDeMapa'
import { prefiereMenosMovimiento } from '../avatares/celebracion'
import { aspectoDe } from '../avatares3d/mixamo/catalogo'
import { EnsayoDeHoja, SwipeableSheet } from './SwipeableSheet'
import { sinRedAhora } from '../offline/redEstado'
import './rankingVivo.css'
import {
  MAX_FILAS_ANIMADAS,
  MS_CHIP,
  arranqueDeFila,
  caducarChips,
  firmaDeLaHoja,
  firmaDeOrden,
  fijosDeApertura,
  quitarFijos,
  sinRepetidos,
  movimientos,
  puestosGuardados,
  sumarChips,
  type ChipsVivos,
} from './rankingVivo'
import {
  distanciaAlDeDelante,
  nodosHechos,
  ordenarClasificacion,
  puestosDe,
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
// Ámbar apagado del tema (en Día y Solpor, su propio aviso; en Pizarra, el ámbar de siempre): bajar un puesto no es un error.
const BAJA = 'rgb(var(--s-aviso-rgb, 245, 158, 11))'

function sinMovimiento(): boolean {
  try {
    return prefiereMenosMovimiento(window.matchMedia?.bind(window))
  } catch {
    return true
  }
}

/** Lo decorativo (destellos, entrada, cuenta de tiempos): ni con «reducir movimiento» ni en el modo ahorro. */
function movimientoDecorativo(): boolean {
  try {
    return !sinMovimiento() && !document.documentElement.classList.contains('saga-ahorro')
  } catch {
    return false
  }
}

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

type DatosDeCara = { mx: ReturnType<typeof aspectoDe>['mx']; color: string; foto?: string }

/** Lo que pinta la cara, en valores sueltos: así la fila memorizada compara sin mirar el objeto del jugador. */
function caraDe(j: J, aro?: string): DatosDeCara {
  const colorBruto = aro || getPlayerColor(j)
  const color = /^#[0-9a-f]{6}$/i.test(colorBruto) || colorBruto.startsWith('var(') ? colorBruto : '#3b82f6'
  return { mx: aspectoDe(j).mx, color, foto: getPlayerAvatarUrl(j) || undefined }
}

/** La cara de su personaje 3D (o su foto), con el aro de su color: la inicial sola no decía quién era. */
function Cara({ mx, color, foto, lado }: DatosDeCara & { lado: number }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    ref.current?.replaceChildren(elementoDeRetrato(mx, color, lado, foto))
  }, [mx, color, lado, foto])
  return (
    <span ref={ref} aria-hidden="true" style={{ width: lado, height: lado, flexShrink: 0, display: 'inline-flex' }} />
  )
}

/** Nodos hechos en tramos, como el riel del HUD. */
function Tramos({ hechos, total, ancho, tx, fila = 0 }: { hechos: number; total: number; ancho: number; tx: Tx; fila?: number }) {
  return (
    <span
      role="img"
      aria-label={tx.nodosDe(hechos, total)}
      className="saga-rk-tramos"
      style={{ display: 'inline-flex', gap: 2, width: ancho, '--fila': fila } as CSSProperties}
      // 22/11: la barra crece UNA vez, al abrir. Al reordenarse en directo, la fila que se mueve se vuelve a insertar
      // en la lista y el navegador repetía la animación: su barra se vaciaba y volvía a crecer (un parpadeo por fila).
      onAnimationEnd={(evento) => {
        if (evento.target === evento.currentTarget) evento.currentTarget.style.animation = 'none'
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className="saga-rk-tramo" data-on={i < hechos ? '1' : '0'} />
      ))}
    </span>
  )
}

function Cambio({ n, tx, vivo }: { n: number; tx: Tx; vivo?: boolean }) {
  if (!n) return null
  return (
    <span
      aria-label={tx.cambioDePuesto(n)}
      title={tx.cambioDePuesto(n)}
      className={vivo ? 'saga-rk-chip saga-rk-chip--vivo' : 'saga-rk-chip'}
      data-dir={n > 0 ? 'sube' : 'baja'}
      style={{ ...chipCambio, color: n > 0 ? SUBE : BAJA }}
    >
      {n > 0 ? '▲' : '▼'} {Math.abs(n)}
    </span>
  )
}

/** Los puestos de la última vez que miraste. Se leen al abrir y se guardan los de ahora. */
function usePuestosAnteriores(sorted: J[], selfUser?: string): Record<string, number> {
  const clave = CLAVE_VISTO + (selfUser || '')
  const [antes] = useState<Record<string, number>>(() => {
    try {
      return puestosGuardados(window.localStorage.getItem(clave))
    } catch {
      return {}
    }
  })
  const firma = sorted.map((j) => j.user).join('|')
  // 20/11: el ensayo invisible de la hoja (SwipeableSheet) no es «mirar»: no guarda los puestos.
  const ensayo = useContext(EnsayoDeHoja)
  useEffect(() => {
    if (ensayo) return
    try {
      window.localStorage.setItem(clave, JSON.stringify(puestosDe(sorted)))
    } catch {
      /* sin almacenamiento: no se cuentan los cambios */
    }
    // Sólo cuando cambia el orden, no en cada latido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, firma, ensayo])
  return antes
}

/**
 * Reorden con FLIP, al abrir y en directo, con UNA sola cuenta (`movimientos`): compara el orden de ahora con el del
 * render anterior (al abrir, con lo guardado la última vez). Cada fila que cambia de puesto se desliza desde donde
 * estaba (Web Animations, transform; `will-change` sólo mientras corre). Si llega otro reorden a mitad, se
 * cancela la animación y se continúa desde donde se ve la fila (sin tirón ni animaciones apiladas). Quien sube:
 * destello verde y chip ▲ N; quien baja: ámbar y ▼ N, seis segundos. Tu fila, además, un pulso en el puesto.
 * Si el orden NO cambia (el refresco de cada segundo), no se hace nada. Con «reducir movimiento», nada se anima
 * (los chips sí salen: son información).
 */
function useReordenEnDirecto(
  lista: RefObject<HTMLDivElement | null>,
  sorted: J[],
  antesAlAbrir: Record<string, number>,
  selfUser?: string
): { vivos: ChipsVivos; fijos: Record<string, number> } {
  const previos = useRef<Record<string, number> | null>(antesAlAbrir)
  const esApertura = useRef(true)
  const corriendo = useRef(new Map<string, Animation[]>())
  const [vivos, setVivos] = useState<ChipsVivos>({})
  const [fijos, setFijos] = useState<Record<string, number>>(() => fijosDeApertura(antesAlAbrir, sorted))
  const firma = firmaDeOrden(sorted)

  useLayoutEffect(() => {
    const apertura = esApertura.current
    esApertura.current = false
    const movs = movimientos(previos.current, sorted)
    previos.current = puestosDe(sorted)
    if (!movs.length) return
    if (!apertura) {
      setVivos((v) => sumarChips(v, movs, Date.now()))
      setFijos((f) => quitarFijos(f, movs))
    }
    const raiz = lista.current
    if (!raiz || sinMovimiento()) return
    const filas = Array.from(raiz.querySelectorAll<HTMLElement>('[data-user]'))
    if (!filas.length || filas.length > MAX_FILAS_ANIMADAS || typeof filas[0].animate !== 'function') return
    const decorativo = movimientoDecorativo()
    const porUsuario = new Map(movs.map((m) => [m.user, m]))
    // 1.º leer dónde se ve cada fila ahora (si venía animándose) y su alto, TODO antes de escribir nada (24/11: leer el
    // alto de una fila justo después de tocar la anterior recalculaba los estilos fila a fila), 2.º cancelar, 3.º animar.
    const leidas = filas.map((fila) => {
      let ty = 0
      if (corriendo.current.get(fila.dataset.user || '')?.length) {
        try {
          ty = new DOMMatrix(getComputedStyle(fila).transform).m42 || 0
        } catch {
          ty = 0
        }
      }
      return { ty, alto: fila.offsetHeight }
    })
    filas.forEach((fila) => {
      const u = fila.dataset.user || ''
      corriendo.current.get(u)?.forEach((a) => a.cancel())
      corriendo.current.delete(u)
    })
    filas.forEach((fila, k) => {
      const u = fila.dataset.user || ''
      const m = porUsuario.get(u)
      const px = arranqueDeFila(leidas[k].ty, m?.desde ?? 0, m?.hasta ?? 0, leidas[k].alto)
      const hechas: Animation[] = []
      if (px) {
        fila.style.willChange = 'transform'
        const a = fila.animate([{ transform: `translateY(${px}px)` }, { transform: 'translateY(0)' }], {
          duration: apertura ? 700 : decorativo ? 550 : 350,
          delay: apertura ? 260 : 0,
          easing: 'cubic-bezier(.22,1,.36,1)',
          fill: 'backwards',
        })
        const soltar = () => {
          fila.style.willChange = ''
          const resto = (corriendo.current.get(u) || []).filter((x) => x !== a)
          if (resto.length) corriendo.current.set(u, resto)
          else corriendo.current.delete(u)
        }
        a.onfinish = soltar
        a.oncancel = soltar
        hechas.push(a)
      }
      if (m && !apertura && decorativo) {
        const destello = fila.querySelector<HTMLElement>('.saga-rk-flash')
        if (destello) {
          destello.dataset.dir = m.delta > 0 ? 'sube' : 'baja'
          destello.getAnimations?.().forEach((x) => x.cancel())
          hechas.push(destello.animate([{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0 }], { duration: 1400, easing: 'ease-out' }))
        }
        if (selfUser && u === selfUser) {
          const num = fila.querySelector<HTMLElement>('.saga-rk-puesto')
          num?.getAnimations?.().forEach((x) => x.cancel())
          if (num) {
            hechas.push(num.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-out' }))
          }
        }
      }
      if (hechas.length) corriendo.current.set(u, hechas)
    })
    // Sólo cuando cambia el orden, no en cada latido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  // Los chips en directo caducan a los 6 s (con un margen para que el temporizador no se adelante).
  useEffect(() => {
    const marcas = Object.values(vivos).map((c) => c.marca)
    if (!marcas.length) return undefined
    const espera = Math.max(50, Math.min(...marcas) + MS_CHIP - Date.now() + 50)
    const timer = setTimeout(() => setVivos((v) => caducarChips(v, Date.now())), espera)
    return () => clearTimeout(timer)
  }, [vivos])

  // Al cerrar la hoja (se desmonta la tabla) no queda nada corriendo.
  useEffect(() => {
    const animaciones = corriendo.current
    return () => {
      animaciones.forEach((lote) => lote.forEach((a) => a.cancel()))
      animaciones.clear()
    }
  }, [])

  return { vivos, fijos }
}

/**
 * El tiempo de una fila, quieto. 20/11 (QA): al abrir, los tiempos subían contando (2m 08s → 2m 45s en 0,3 s) y las
 * filas entraban escalonadas por detrás de la hoja: números corriendo y filas tardías mientras la hoja aún subía. Ahora
 * la tabla entra entera con la hoja (su movimiento es la entrada); lo que se anima es sólo lo que informa (reorden).
 */
function Tiempo({ ms, quieto }: { ms: number; quieto: boolean }) {
  return <b style={tiempoFila}>{quieto ? '—' : formatearTiempo(ms)}</b>
}

/** Tu puesto en la tarjeta: al cambiar, el número «rueda» (sale hacia un lado y entra el nuevo, 0,38 s). */
function PuestoRodando({ n }: { n: number }) {
  const ref = useRef<HTMLElement | null>(null)
  const previo = useRef(n)
  useLayoutEffect(() => {
    if (previo.current === n) return
    const subio = n < previo.current
    previo.current = n
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || !movimientoDecorativo()) return
    el.animate(
      [
        { opacity: 0, transform: `translateY(${subio ? 45 : -45}%)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' }
    )
  }, [n])
  return (
    <b ref={ref} style={puestoGrande}>
      {n}.º
    </b>
  )
}

/** ¿Sin red? Se mira al abrir y cada 10 s con la hoja abierta (y al instante con los eventos del navegador). */
function useSinRed(activo: boolean): boolean {
  const [sinRed, setSinRed] = useState(() => sinRedAhora())
  useEffect(() => {
    if (!activo) return undefined
    let t = 0
    const mirar = () => {
      setSinRed(sinRedAhora())
      t = window.setTimeout(mirar, 10_000)
    }
    mirar()
    window.addEventListener('online', mirar)
    window.addEventListener('offline', mirar)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('online', mirar)
      window.removeEventListener('offline', mirar)
    }
  }, [activo])
  return activo && sinRed
}

/**
 * 24/11: la hoja sólo se repinta si cambia lo que pinta (`firmaDeLaHoja`), no con cada repintado de la partida (el
 * GPS, el mapa, el latido sin cambios). `onClose` no cuenta: es `closeRanking`, que sólo cierra (setter estable).
 */
export const RankingSheet = memo(
  HojaDeClasificacion,
  (a, b) => a.open === b.open && a.selfUser === b.selfUser && firmaDeLaHoja(a.players) === firmaDeLaHoja(b.players)
)

function HojaDeClasificacion({ open, players, onClose, selfUser }: RankingSheetProps) {
  const tx = useTextosDePantallas().clasificacion
  const sinRed = useSinRed(open)
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
  const sorted = sinRepetidos(ordenarClasificacion(players))
  const liveCount = sorted.filter((p) => p.presence === 'live').length

  return (
    <SwipeableSheet
      open={open}
      onClose={onClose}
      ariaLabel={tx.titulo}
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
            {/* Sin red, nadie está «en línea» que sepamos: lo que se ve es lo último que llegó (tu fila, con tu tiempo). */}
            {sinRed ? (
              <span style={{ color: BAJA, fontWeight: 800 }}>{tx.sinConexion}</span>
            ) : liveCount > 0 ? (
              <span style={{ color: VERDE_EN_LINEA, fontWeight: 800 }}>{tx.enLinea(liveCount)}</span>
            ) : null}
          </div>
        </div>
        <button type="button" aria-label={tx.cerrar} className="saga-toque saga-toque-cierre" style={closeBtn} onClick={onClose}>
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
        <Tabla sorted={sorted} selfUser={selfUser} tx={tx} key={selfUser || ''} />
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
  const { vivos, fijos } = useReordenEnDirecto(lista, sorted, antes, selfUser)
  const cambioDe = (u: string) => ({ n: vivos[u]?.delta ?? fijos[u] ?? 0, marca: vivos[u]?.marca ?? 0 })
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
          cambio={selfUser ? cambioDe(selfUser) : { n: 0, marca: 0 }}
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
          const cambio = cambioDe(j.user)
          return (
            <Fila
              key={j.user}
              user={j.user}
              i={i}
              yo={yo}
              quieto={quieto}
              nombre={nombre(j)}
              enLinea={j.presence === 'live'}
              cambioN={cambio.n}
              cambioMarca={cambio.marca}
              vivo={Boolean(vivos[j.user])}
              hechos={nodosHechos(j, total)}
              total={total}
              ms={j.total_time_ms || 0}
              detalle={i === 0 ? (quieto ? '' : tx.enCabeza) : textoDeFila(distanciaAlDeDelante(sorted[i - 1], j, total), tx)}
              tx={tx}
              {...caraDe(j, yo ? 'var(--theme-primary)' : undefined)}
            />
          )
        })}
      </div>
    </>
  )
}

/**
 * Una fila, memorizada (24/11): sólo valores sueltos, así que un latido que mueve a uno no repinta a los otros catorce
 * (ni sus caras ni sus tramos).
 */
const Fila = memo(function Fila(p: {
  user: string
  i: number
  yo: boolean
  quieto: boolean
  nombre: string
  enLinea: boolean
  cambioN: number
  cambioMarca: number
  vivo: boolean
  hechos: number
  total: number
  ms: number
  detalle: string
  tx: Tx
} & DatosDeCara) {
  const { i, quieto, tx } = p
  return (
    <div data-user={p.user} className={p.yo ? 'saga-rk-fila saga-rk-yo' : 'saga-rk-fila'} style={fila}>
      <i className="saga-rk-flash" aria-hidden="true" />
      <span
        className="saga-rk-puesto"
        style={{
          ...puesto,
          ...(i < 3 && !quieto ? { background: MEDALLA[i], color: i === 0 ? 'var(--theme-on-primary)' : 'rgb(var(--theme-ink))' } : null),
        }}
      >
        {i + 1}
      </span>
      <Cara mx={p.mx} color={p.color} foto={p.foto} lado={34} />
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 5 }}>
        <span style={nombreFila}>
          <span style={recorte}>{p.nombre}</span>
          {p.enLinea ? <span style={puntoEnLinea} /> : null}
          <Cambio key={p.cambioMarca} n={p.cambioN} tx={tx} vivo={p.vivo} />
        </span>
        {quieto ? (
          <small style={meta}>{tx.sinEmpezar}</small>
        ) : (
          <Tramos hechos={p.hechos} total={p.total} ancho={52} tx={tx} fila={i} />
        )}
      </span>
      <span style={{ textAlign: 'right', display: 'grid', gap: 2, flexShrink: 0 }}>
        <Tiempo ms={p.ms} quieto={quieto} />
        <small style={meta}>{p.detalle}</small>
      </span>
    </div>
  )
})

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
  cambio: { n: number; marca: number }
  delante?: J
  detras?: J
  nombre: (j: J) => string
}) {
  const alDeDelante = textoDeDistancia(distanciaAlDeDelante(delante, yo, total), tx)
  const alDeDetras = detras ? textoDeDistancia(distanciaAlDeDelante(yo, detras, total), tx) : ''
  return (
    <div style={tarjeta}>
      <Cara {...caraDe(yo, 'var(--theme-primary)')} lado={56} />
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
        <small style={{ ...meta, textTransform: 'uppercase', letterSpacing: '.08em' }}>{tx.tuPuesto}</small>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <PuestoRodando n={n} />
          <span style={meta}>{tx.deTotal(de)}</span>
          <Cambio key={cambio.marca} n={cambio.n} tx={tx} vivo={cambio.marca > 0} />
        </div>
        {delante ? (
          <small style={{ ...meta, ...recorte, color: 'rgba(255,255,255,.82)' }}>
            ▲ {nombre(delante)}
            {alDeDelante ? ` · ${alDeDelante}` : ''}
          </small>
        ) : (
          <small style={{ ...meta, color: 'rgba(255,255,255,.82)' }}>{tx.vasEnCabeza}</small>
        )}
        {/* 22/11: la línea de «quién viene detrás» guarda siempre su sitio y se funde: al pasar a ser último (o dejar de
            serlo) aparecía o se iba en seco y la lista entera daba un salto de un renglón. */}
        <small
          aria-hidden={detras && alDeDetras ? undefined : true}
          style={{ ...meta, ...recorte, opacity: detras && alDeDetras ? 1 : 0, transition: 'opacity var(--saga-dur-media) ease' }}
        >
          {detras && alDeDetras ? `▼ ${nombre(detras)} · ${alDeDetras}` : '\u00a0'}
        </small>
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
  width: 44,
  height: 44,
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
  color: 'var(--s-texto-2)',
  borderBottom: '1px solid var(--saga-pizarra-raya)',
}

const fila: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 56,
}

// Tu fila: degradado del acento sin bordes ni esquinas (clase `saga-rk-yo`, rankingVivo.css). La raya de debajo
// de cada fila es un ::after de esa hoja, para que en la tuya sólo cubra el ancho de la lista.

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

const tiempoFila: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 900,
  color: '#f1f5f9',
  fontVariantNumeric: 'tabular-nums',
}

const meta: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--s-texto-2)' }

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

import { useEffect, useState, type CSSProperties } from 'react'
import { loadInventorySnapshot, type InventorySnapshot } from '../offline/inventory'
import { RECIPES, checkCraftingPossible, craftRecipe, type Recipe } from '../offline/recipes'
import { syncInventoryToServer } from '../offline/localFirst'
import { premioDelNodo } from '../avance/decisiones'
import { useI18n } from '../../i18n/useI18n'
import type { PlayerStage } from '../../types/player'
import ItemIconSvg from './ItemIconSvg'
import { cadaMientrasVisible } from '../../shared/cadaMientrasVisible'

interface CraftingPanelProps {
  user: string
  /** Etapas reales de la misión; el store global nunca se rellena. */
  stages?: unknown
}

/**
 * La Mesa de trabajo, 21/11 (Óscar eligió tras ver maquetas: «juntar las dos propuestas con el diseño de la B»).
 *
 * - Aspecto (B): los HUECOS de las piezas arriba y, con una flecha, el hueco del RESULTADO, que brilla en dorado
 *   cuando ya se puede fabricar. Debajo, «Tus objetos».
 * - 21/11 (M1 «tarjeta del tema», elegida por Óscar): sin madera; la tarjeta del tema (superficie-2), huecos en la
 *   superficie, resultado redondo punteado con «1 de 3 piezas» y los iconos en fichas duotono (ItemIconSvg). El dorado,
 *   SÓLO cuando se puede fabricar.
 * - Claridad (A): lo que ya llevas está puesto en su hueco con ✓; lo que falta, hueco punteado y «Te falta: … · en el
 *   nodo «…»» (el nodo que lo da, si la misión lo dice). «Fabricar» sólo se enciende con todo. Con varias recetas,
 *   pestañas, la más cercana a completarse primero.
 * - Al fabricar, las piezas vuelan al resultado, el resultado late y el objeto aparece en «Tus objetos». Con «reducir
 *   movimiento», sólo fundidos.
 *
 * La lógica de fabricar no cambia: `craftRecipe` (mochila local + cola de eventos) y la sincronización inmediata.
 */

const TEXTOS = {
  es: {
    recetas: (n: number) => (n === 1 ? '1 receta' : `${n} recetas`),
    elegir: 'Recetas',
    fabricar: 'Fabricar',
    fabricando: 'Fabricando…',
    teFalta: 'Te falta',
    enNodo: (nodo: string) => `en el nodo «${nodo}»`,
    listo: 'Lo tienes todo: ya puedes fabricarlo.',
    yaLoLlevas: (objeto: string) => `${objeto} ya está en tu mochila.`,
    tusObjetos: 'Tus objetos',
    nadaEncima: 'Aún no llevas nada encima.',
    creado: (objeto: string) => `✅ ${objeto} creado con éxito`,
    sinMateriales: '❌ No hay materiales suficientes',
    objeto: 'Objeto',
    vacioTitulo: 'La mesa está lista',
    vacioTexto:
      'En esta ruta no hay nada que fabricar. Si algún nodo te pide montar un objeto con piezas, lo verás aquí.',
    loTienes: 'lo tienes',
    faltaPieza: 'falta',
    piezas: (a: number, b: number) => `${a} de ${b} piezas`,
  },
  gl: {
    recetas: (n: number) => (n === 1 ? '1 receita' : `${n} receitas`),
    elegir: 'Receitas',
    fabricar: 'Fabricar',
    fabricando: 'Fabricando…',
    teFalta: 'Fáltache',
    enNodo: (nodo: string) => `no nodo «${nodo}»`,
    listo: 'Tes todo: xa podes fabricalo.',
    yaLoLlevas: (objeto: string) => `${objeto} xa está na túa mochila.`,
    tusObjetos: 'Os teus obxectos',
    nadaEncima: 'Aínda non levas nada encima.',
    creado: (objeto: string) => `✅ ${objeto} feito con éxito`,
    sinMateriales: '❌ Non hai materiais suficientes',
    objeto: 'Obxecto',
    vacioTitulo: 'A mesa está lista',
    vacioTexto:
      'Nesta ruta non hai nada que fabricar. Se algún nodo che pide montar un obxecto con pezas, verálo aquí.',
    loTienes: 'tes',
    faltaPieza: 'falta',
    piezas: (a: number, b: number) => `${a} de ${b} pezas`,
  },
}

type Textos = (typeof TEXTOS)['es']

type Pieza = {
  itemId: string
  nombre: string
  necesita: number
  tiene: number
  /** Título del nodo que la da, si la misión lo dice. */
  donde: string | null
}

/** Cuánto dura la animación de fabricar entera (vuelo + latido + llegada a «Tus objetos»). */
const DURACION_FORJA_MS = 1100

function comoNodos(stages: unknown): PlayerStage[] {
  return Array.isArray(stages) ? (stages as PlayerStage[]) : []
}

/** El nodo que da un objeto: el coleccionable que lo entrega o el minijuego que lo regala. */
function nodoQueLoDa(
  nodos: PlayerStage[],
  itemId: string
): { titulo: string; label: string } | null {
  for (const [i, nodo] of nodos.entries()) {
    const raw = nodo as unknown as Record<string, unknown>
    const config =
      raw.config && typeof raw.config === 'object' ? (raw.config as Record<string, unknown>) : {}
    const titulo = String(raw.title || '').trim() || `${i + 1}`
    if (String(raw.physical_item_id || config.physical_item_id || '').trim() === itemId) {
      return {
        titulo,
        label: String(raw.physical_item_label || config.physical_item_label || '').trim(),
      }
    }
    const premio = premioDelNodo(nodo)
    if (premio?.itemId === itemId) return { titulo, label: premio.label }
  }
  return null
}

function nombreLegible(itemId: string): string {
  const t = itemId.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function piezasDe(receta: Recipe, snapshot: InventorySnapshot, nodos: PlayerStage[]): Pieza[] {
  return receta.inputs.map((inp) => {
    // Igual que `checkCraftingPossible`: la primera entrada de ese objeto, si no está gastada.
    const owned = snapshot.items.find((item) => item.item_id === inp.item_id)
    const nodo = nodoQueLoDa(nodos, inp.item_id)
    return {
      itemId: inp.item_id,
      nombre: owned?.label || nodo?.label || nombreLegible(inp.item_id),
      necesita: inp.quantity,
      tiene: owned && owned.state !== 'used' ? owned.quantity : 0,
      donde: nodo?.titulo ?? null,
    }
  })
}

const faltan = (piezas: Pieza[]) => piezas.filter((p) => p.tiene < p.necesita).length

/**
 * Yunque de trazo, no el emoji.
 *
 * El emoji lo dibuja cada sistema a su manera -en iOS sale un pico y un
 * martillo a todo color-, no hereda el color del tema y no tiene nada que ver
 * con el resto de iconos de la aplicacion, que son trazo fino.
 */
function IconoYunque({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9h7l2.5 2.5H18a3 3 0 0 0 3-3" />
      <path d="M10 11.5V15" />
      <path d="M6 20h11l-1.5-5H7.5L6 20Z" />
    </svg>
  )
}

const BLANCO_SOBRE_VERDE = '#fff' // no-tema: el visto, blanco sobre el verde del tema

/** El visto de la pieza puesta: trazo por `style` (Día pisa el `color` de todo lo de la hoja). */
function Visto() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ stroke: BLANCO_SOBRE_VERDE }}
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

function Flecha() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v15" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  )
}

// ─── La mesa ──────────────────────────────────────────────────────────────────

function Mesa({
  receta,
  piezas,
  listo,
  yaLoLleva,
  forjando,
  tx,
}: {
  receta: Recipe
  piezas: Pieza[]
  listo: boolean
  yaLoLleva: boolean
  forjando: boolean
  tx: Textos
}) {
  const salida = receta.outputs[0]
  const n = piezas.length
  const resultadoPuesto = forjando || yaLoLleva
  return (
    <div style={mesa} data-saga-mesa data-listo={listo ? '' : undefined}>
      <div style={filaHuecos}>
        {piezas.map((p, i) => {
          const puesta = forjando || p.tiene >= p.necesita
          // Hacia dónde vuela al fabricar: al centro (el resultado), abajo.
          const vuelo = {
            '--dx': `${((n - 1) / 2 - i) * (ANCHO_HUECO + 10)}px`,
            '--dy': '128px',
            '--retraso': `${i * 45}ms`,
          } as CSSProperties
          return (
            <div
              key={p.itemId}
              style={columnaHueco}
              data-saga-mesa-pieza={puesta ? 'puesta' : 'falta'}
            >
              <span
                className={forjando ? 'saga-mesa-vuela' : undefined}
                style={{ ...(puesta ? huecoLleno : huecoVacio), ...vuelo }}
                aria-label={`${p.nombre}: ${puesta ? tx.loTienes : tx.faltaPieza}`}
              >
                <ItemIconSvg itemId={p.itemId} nombre={p.nombre} size={44} estado={puesta ? 'tiene' : 'falta'} />
                {puesta ? (
                  <span style={marcaOk} aria-hidden="true">
                    <Visto />
                  </span>
                ) : p.necesita > 1 ? (
                  <span style={marcaCuenta} aria-hidden="true">
                    {p.tiene}/{p.necesita}
                  </span>
                ) : null}
              </span>
              <span style={puesta ? nombreHueco : { ...nombreHueco, color: 'var(--s-texto-2)' }}>
                {p.nombre}
              </span>
            </div>
          )
        })}
      </div>

      <span style={flechaMesa}>
        <Flecha />
      </span>

      <div style={columnaHueco}>
        <span
          className={forjando ? 'saga-mesa-late' : listo ? 'saga-mesa-brilla' : undefined}
          style={
            listo || forjando ? resultadoListo : resultadoPuesto ? resultadoLleno : resultadoVacio
          }
          data-saga-mesa-resultado={listo ? 'listo' : resultadoPuesto ? 'hecho' : 'falta'}
        >
          <ItemIconSvg
            itemId={salida?.item_id || salida?.label || receta.label}
            nombre={salida?.label}
            size={58}
            estado={listo || resultadoPuesto ? 'tiene' : 'falta'}
          />
        </span>
        <span style={nombreResultado}>
          {salida
            ? `${salida.quantity > 1 ? `${salida.quantity}× ` : ''}${salida.label}`
            : receta.label}
        </span>
        {resultadoPuesto ? null : (
          <span style={progreso} data-saga-mesa-progreso>
            {tx.piezas(n - faltan(piezas), n)}
          </span>
        )}
      </div>
    </div>
  )
}

function MesaVacia({ tx }: { tx: Textos }) {
  return (
    <div style={{ ...mesa, gap: 12 }} data-saga-mesa="vacia">
      <div style={filaHuecos} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ ...huecoVacio, opacity: 0.55 }} />
        ))}
      </div>
      <span style={{ ...flechaMesa, opacity: 0.5 }} aria-hidden="true">
        <Flecha />
      </span>
      <span style={{ ...resultadoVacio, opacity: 0.55, color: 'var(--s-texto-3)' }} aria-hidden="true">
        <IconoYunque size={30} />
      </span>
      <strong style={vacioTitulo}>{tx.vacioTitulo}</strong>
      <span style={vacioTexto}>{tx.vacioTexto}</span>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function CraftingPanel({ user, stages }: CraftingPanelProps) {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(() => loadInventorySnapshot(user))
  const [feedback, setFeedback] = useState<{ msg: string; ts: number } | null>(null)
  const [elegida, setElegida] = useState<string | null>(null)
  const [forja, setForja] = useState<{ recetaId: string; piezas: Pieza[]; salida: string } | null>(
    null
  )
  const { locale } = useI18n()
  const tx = locale === 'gl' ? TEXTOS.gl : TEXTOS.es

  useEffect(() => {
    function refresh() {
      // 13/11: sólo si cambió. `loadInventorySnapshot` devuelve un objeto nuevo cada vez y repintaba el panel cada 2 s.
      setSnapshot((previo) => {
        const siguiente = loadInventorySnapshot(user)
        return JSON.stringify(previo) === JSON.stringify(siguiente) ? previo : siguiente
      })
    }
    refresh()
    const parar = cadaMientrasVisible(refresh, 2_000)
    window.addEventListener('storage', refresh)
    return () => {
      parar()
      window.removeEventListener('storage', refresh)
    }
  }, [user])

  useEffect(() => {
    if (!forja) return undefined
    const id = window.setTimeout(() => setForja(null), DURACION_FORJA_MS)
    return () => window.clearTimeout(id)
  }, [forja])

  function handleCrafted(msg: string) {
    setSnapshot(loadInventorySnapshot(user))
    setFeedback({ msg, ts: Date.now() })
    setTimeout(() => setFeedback(null), 3_000)

    // Lo forjado sólo existía en el móvil hasta la siguiente sincronización de
    // fondo. Se empuja ya: así el panel de administración lo ve al momento y el
    // servidor puede validar un nodo que exija la pieza recién fabricada.
    void syncInventoryToServer(user).catch(() => undefined)
  }

  // Recetas relevantes para esta misión.
  //
  // Antes esto leía el store global del jugador, pero la partida nunca llegó a
  // ese store: estaba siempre vacío y la mesa decía "No hay recetas" aunque el
  // jugador llevase los ingredientes en la mochila. Ahora se cruzan las etapas
  // reales (por prop) con lo que el jugador lleva encima, así que una receta que
  // YA puedes fabricar nunca puede desaparecer.
  const nodos = comoNodos(stages)
  const stagesStr = JSON.stringify(stages ?? [])
  const ownedIds = new Set(
    snapshot.items
      .filter((item) => item.state !== 'used' && item.quantity > 0)
      .map((item) => item.item_id)
  )

  // Sólo la receta REALMENTE en juego: la que pide algún nodo de esta misión.
  const requiredByMission = RECIPES.filter((r) =>
    r.outputs.some((out) => stagesStr.includes(`"${out.item_id}"`))
  )

  // Si ningún nodo pide un resultado concreto, se cae a las recetas cuyos
  // ingredientes entrega esta misión.
  const craftableHere = RECIPES.filter((r) =>
    r.inputs.every((inp) => stagesStr.includes(`"${inp.item_id}"`) || ownedIds.has(inp.item_id))
  )

  // La más cercana a completarse, primero (el orden de la lista no cambia con el mismo número de piezas que faltan).
  const activeRecipes = (requiredByMission.length > 0 ? requiredByMission : craftableHere)
    .map((receta) => ({ receta, piezas: piezasDe(receta, snapshot, nodos) }))
    .sort((a, b) => faltan(a.piezas) - faltan(b.piezas))

  const actual =
    activeRecipes.find((r) => r.receta.recipe_id === elegida) ?? activeRecipes[0] ?? null
  const forjando = Boolean(forja && actual && forja.recetaId === actual.receta.recipe_id)
  const listo = actual ? !forjando && checkCraftingPossible(user, actual.receta) : false
  const salidaId = actual?.receta.outputs[0]?.item_id ?? ''
  const yaLoLleva = Boolean(salidaId) && ownedIds.has(salidaId)
  const objetos = snapshot.items.filter((item) => item.state !== 'used' && item.quantity > 0)

  function fabricar(receta: Recipe, piezas: Pieza[]) {
    if (forja) return
    if (craftRecipe(user, receta.recipe_id)) {
      setForja({ recetaId: receta.recipe_id, piezas, salida: receta.outputs[0]?.item_id ?? '' })
      handleCrafted(tx.creado(receta.outputs[0]?.label || tx.objeto))
    } else {
      handleCrafted(tx.sinMateriales)
    }
  }

  return (
    <section style={panel} className="saga-mesa">
      <style>{ESTILOS_MESA}</style>

      {activeRecipes.length > 1 ? (
        <div style={headerRow}>
          <span style={headerCount}>{tx.recetas(activeRecipes.length)}</span>
        </div>
      ) : null}

      {activeRecipes.length > 1 ? (
        <div role="tablist" aria-label={tx.elegir} style={filaPestanas}>
          {activeRecipes.map(({ receta, piezas }) => {
            const sel = receta.recipe_id === actual?.receta.recipe_id
            const quedan = faltan(piezas)
            return (
              <button
                key={receta.recipe_id}
                type="button"
                role="tab"
                className="saga-toque"
                aria-selected={sel}
                style={sel ? { ...pestana, ...pestanaSel } : pestana}
                onClick={() => setElegida(receta.recipe_id)}
              >
                <ItemIconSvg itemId={receta.outputs[0]?.item_id || receta.label} size={22} />
                <span>{receta.outputs[0]?.label || receta.label}</span>
                <span style={quedan === 0 ? pestanaOk : pestanaCuenta}>
                  {quedan === 0 ? '✓' : `${piezas.length - quedan}/${piezas.length}`}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {feedback && (
        <div style={toastBanner} role="status">
          {feedback.msg}
        </div>
      )}

      {actual ? (
        <>
          <Mesa
            receta={actual.receta}
            piezas={forjando && forja ? forja.piezas : actual.piezas}
            listo={listo}
            yaLoLleva={yaLoLleva}
            forjando={forjando}
            tx={tx}
          />

          {/* Lo que falta, dicho: qué pieza y qué nodo la da. Con todo, una línea en verde. */}
          <div style={notas} data-saga-mesa-notas>
            {forjando ? null : listo ? (
              <span style={notaOk}>{tx.listo}</span>
            ) : yaLoLleva ? (
              <span style={notaOk}>
                ✓ {tx.yaLoLlevas(actual.receta.outputs[0]?.label || tx.objeto)}
              </span>
            ) : (
              actual.piezas
                .filter((p) => p.tiene < p.necesita)
                .map((p) => (
                  <span key={p.itemId} style={notaFalta} data-saga-mesa-falta={p.itemId}>
                    <strong style={{ color: 'var(--s-texto)' }}>
                      {tx.teFalta}: {p.necesita - p.tiene > 1 ? `${p.necesita - p.tiene}× ` : ''}
                      {p.nombre}
                    </strong>
                    {p.donde ? ` · ${tx.enNodo(p.donde)}` : ''}
                  </span>
                ))
            )}
          </div>

          <button
            type="button"
            disabled={!listo}
            style={listo ? craftBtn : { ...craftBtn, ...craftBtnApagado }}
            onClick={() => fabricar(actual.receta, actual.piezas)}
          >
            <IconoYunque /> {forjando ? tx.fabricando : tx.fabricar}
          </button>
        </>
      ) : (
        <MesaVacia tx={tx} />
      )}

      <div style={bloqueObjetos}>
        <span style={tituloObjetos}>{tx.tusObjetos}</span>
        {objetos.length ? (
          <div style={filaObjetos}>
            {objetos.map((item) => (
              <span
                key={item.item_id}
                className={forja?.salida === item.item_id ? 'saga-mesa-llega' : undefined}
                style={chipObjeto}
                data-saga-mesa-objeto={item.item_id}
              >
                <ItemIconSvg itemId={item.item_id} nombre={item.label} size={24} />
                <span>{item.label || nombreLegible(item.item_id)}</span>
                {item.quantity > 1 ? <span style={chipCuenta}>×{item.quantity}</span> : null}
              </span>
            ))}
          </div>
        ) : (
          <span style={nadaEncima}>{tx.nadaEncima}</span>
        )}
      </div>
    </section>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

/**
 * Todo con los tokens del tema (Pizarra, Día y Solpor); el dorado de «ya se puede» es el aviso del tema.
 *
 * El vuelo y el latido usan el ritmo del sistema (--saga-dur-*, --saga-curva-*); con «reducir movimiento» las
 * piezas sólo se apagan y el resultado sólo aparece (fundidos), y el brillo se queda quieto (--saga-latido-estado).
 */
const ESTILOS_MESA = `
.saga-mesa-vuela { animation: sagaMesaVuela var(--saga-dur-larga) var(--saga-curva-sale) var(--retraso, 0ms) both; }
@keyframes sagaMesaVuela { to { transform: translate(var(--dx, 0px), var(--dy, 0px)) scale(.3); opacity: 0; } }
.saga-mesa-late { animation: sagaMesaLate var(--saga-dur-larga) var(--saga-curva-entra) calc(var(--saga-dur-larga) * .8) both; }
@keyframes sagaMesaLate { 0% { transform: scale(.8); opacity: .35; } 55% { transform: scale(1.14); opacity: 1; } 100% { transform: scale(1); } }
.saga-mesa-llega { animation: sagaMesaLlega var(--saga-dur-larga) var(--saga-curva-entra) calc(var(--saga-dur-larga) * 1.9) both; }
@keyframes sagaMesaLlega { from { opacity: 0; transform: translateY(-10px) scale(.85); } }
.saga-mesa-brilla { animation: sagaMesaBrilla 2.4s ease-in-out infinite var(--saga-latido-estado, running); }
@keyframes sagaMesaBrilla { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--s-aviso) 30%, transparent), 0 0 30px color-mix(in srgb, var(--s-aviso) 70%, transparent); } }
@keyframes sagaMesaFunde { to { opacity: 0; } }
@keyframes sagaMesaAparece { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .saga-mesa-vuela { animation-name: sagaMesaFunde; }
  .saga-mesa-late, .saga-mesa-llega { animation-name: sagaMesaAparece; }
}
`

const ANCHO_HUECO = 62

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '10px 4px',
  flex: 1,
  overflowY: 'auto',
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 2px',
}

const headerCount: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--s-texto-2)',
}

const filaPestanas: CSSProperties = {
  display: 'flex',
  gap: 8,
  overflowX: 'auto',
  paddingBottom: 2,
}

const pestana: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid var(--s-borde)',
  background: 'var(--s-superficie-2)',
  color: 'var(--s-texto)',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
}

const pestanaSel: CSSProperties = {
  background: 'var(--s-acento)',
  borderColor: 'var(--s-acento)',
  color: 'var(--s-acento-texto)',
}

const pestanaOk: CSSProperties = { fontWeight: 900 }
const pestanaCuenta: CSSProperties = {
  fontWeight: 800,
  opacity: 0.75,
  fontVariantNumeric: 'tabular-nums',
}

const toastBanner: CSSProperties = {
  background: 'color-mix(in srgb, var(--s-ok) 15%, transparent)',
  border: '1px solid color-mix(in srgb, var(--s-ok) 35%, transparent)',
  color: 'var(--s-texto)',
  padding: '9px 14px',
  borderRadius: 'var(--theme-radius-card)',
  fontSize: 13,
  fontWeight: 800,
  textAlign: 'center',
  letterSpacing: '0.02em',
}

/** La mesa: la tarjeta del tema (un escalón sobre la hoja), con su borde. */
const mesa: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: '18px 14px 14px',
  borderRadius: 18,
  background: 'var(--s-superficie-2)',
  border: '1px solid var(--s-borde)',
  color: 'var(--s-texto)',
}

const filaHuecos: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: 12,
}

const columnaHueco: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  width: ANCHO_HUECO + 14,
}

const baseHueco: CSSProperties = {
  position: 'relative',
  width: ANCHO_HUECO,
  height: ANCHO_HUECO,
  borderRadius: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
}

const huecoLleno: CSSProperties = {
  ...baseHueco,
  background: 'var(--s-superficie)',
  border: '1px solid var(--s-borde)',
}

/** Lo que falta: hueco punteado (y su ficha punteada dentro, ItemIconSvg `falta`); nunca gris por filtro. */
const huecoVacio: CSSProperties = {
  ...baseHueco,
  background: 'transparent',
  border: '1.5px dashed color-mix(in srgb, var(--s-texto) 26%, transparent)',
}

const marcaOk: CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  width: 20,
  height: 20,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--s-ok)',
  boxShadow: '0 0 0 2px var(--s-superficie-2)',
}

const marcaCuenta: CSSProperties = {
  position: 'absolute',
  bottom: 2,
  right: 4,
  fontSize: 10,
  fontWeight: 900,
  color: 'var(--s-texto)',
  fontVariantNumeric: 'tabular-nums',
}

const nombreHueco: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.25,
  fontWeight: 800,
  textAlign: 'center',
  color: 'var(--s-texto)',
  overflowWrap: 'anywhere',
}

const flechaMesa: CSSProperties = { display: 'flex', color: 'var(--s-texto-3)' }

const baseResultado: CSSProperties = {
  ...baseHueco,
  width: 84,
  height: 84,
  borderRadius: '50%',
}

const resultadoVacio: CSSProperties = {
  ...baseResultado,
  background: 'color-mix(in srgb, var(--s-texto) 4%, transparent)',
  border: '2px dashed color-mix(in srgb, var(--s-texto) 26%, transparent)',
}

const resultadoLleno: CSSProperties = {
  ...baseResultado,
  background: 'var(--s-superficie)',
  border: '2px solid var(--s-borde)',
}

/** Dorado: ya se puede fabricar (y mientras se fabrica). */
const resultadoListo: CSSProperties = {
  ...baseResultado,
  background: 'color-mix(in srgb, var(--s-aviso) 14%, var(--s-superficie))',
  border: '2px solid var(--s-aviso)',
  boxShadow:
    '0 0 0 3px color-mix(in srgb, var(--s-aviso) 22%, transparent), 0 0 22px color-mix(in srgb, var(--s-aviso) 55%, transparent)',
}

const nombreResultado: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  textAlign: 'center',
  color: 'var(--s-texto)',
}

const progreso: CSSProperties = {
  marginTop: -4,
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--s-texto-3)',
  fontVariantNumeric: 'tabular-nums',
}

const vacioTitulo: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: 'var(--s-texto)',
  marginTop: 2,
}

const vacioTexto: CSSProperties = {
  maxWidth: 280,
  fontSize: 12.5,
  lineHeight: 1.45,
  fontWeight: 600,
  textAlign: 'center',
  color: 'var(--s-texto-2)',
}

const notas: CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: '0 2px',
  minHeight: 18,
}

const notaFalta: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.4,
  fontWeight: 600,
  color: 'var(--s-texto-2)',
}

const notaOk: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 800,
  color: 'var(--s-ok)',
}

// El borde ya no es del mismo color que su fondo: apagado SIGUE PARECIENDO UN BOTON.
const craftBtnApagado: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--s-borde)',
  color: 'var(--s-texto-3)',
  boxShadow: 'none',
  cursor: 'default',
}

// Pildora: el boton grande de accion, en toda la aplicacion, es una pildora.
const craftBtn: CSSProperties = {
  width: '100%',
  padding: '13px 0',
  borderRadius: 999,
  border: '1px solid transparent',
  background: 'var(--s-acento)',
  color: 'var(--s-acento-texto)',
  fontWeight: 900,
  fontSize: 14,
  letterSpacing: '0.05em',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  boxShadow: '0 4px 18px color-mix(in srgb, var(--s-acento) 30%, transparent)',
  transition: 'transform 0.15s, box-shadow 0.15s',
}

const bloqueObjetos: CSSProperties = { display: 'grid', gap: 8, marginTop: 4 }

const tituloObjetos: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.04em',
  color: 'var(--s-texto-2)',
}

const filaObjetos: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }

const chipObjeto: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 34,
  padding: '0 12px 0 5px',
  borderRadius: 999,
  background: 'var(--s-superficie-2)',
  border: '1px solid var(--s-borde)',
  color: 'var(--s-texto)',
  fontSize: 12.5,
  fontWeight: 700,
}

const chipCuenta: CSSProperties = {
  fontWeight: 900,
  color: 'var(--s-texto-2)',
  fontVariantNumeric: 'tabular-nums',
}

const nadaEncima: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--s-texto-3)' }

import { useEffect, useState, type CSSProperties } from 'react'
import { loadInventorySnapshot, type InventorySnapshot } from '../offline/inventory'
import { RECIPES, checkCraftingPossible, craftRecipe, type Recipe } from '../offline/recipes'
import { syncInventoryToServer } from '../offline/localFirst'

interface CraftingPanelProps {
  user: string
  /** Etapas reales de la misión; el store global nunca se rellena. */
  stages?: unknown
}

import ItemIconSvg from './ItemIconSvg'

// ─── Sub-components ───────────────────────────────────────────────────────────

function RecipeCard({
  recipe,
  user,
  onCrafted,
}: {
  recipe: Recipe
  user: string
  onCrafted: (msg: string) => void
}) {
  const canCraft = checkCraftingPossible(user, recipe)
  const inventoryItems = loadInventorySnapshot(user).items
  const [pressed, setPressed] = useState(false)

  return (
    <div
      className={CLASE_FICHA_MESA}
      style={{
        ...recipeCard,
        ...(canCraft ? recipeCardReady : recipeCardLocked),
        transform: pressed && canCraft ? 'scale(0.97)' : 'scale(1)',
      }}
    >
      {/* Output preview */}
      <div style={recipeOutputRow}>
        <span
          style={{
            ...recipeOutputIcon,
            background: `rgba(255,255,255,0.08)`,
          }}
        >
          <ItemIconSvg itemId={recipe.outputs[0]?.label || recipe.label} size={32} />
        </span>
        <div style={recipeOutputBody}>
          <div style={recipeTitle}>{recipe.label}</div>
          <div style={recipeOutputMeta}>
            → {recipe.outputs.map((o) => `${o.quantity}× ${o.label}`).join(', ')}
          </div>
        </div>
        <span style={canCraft ? availablePill : lockedPill}>{canCraft ? 'LISTO' : 'FALTAN'}</span>
      </div>

      {/**
       * Ingredientes en FILAS, como el resto de la aplicacion.
       *
       * "El diseño de ensamblar y toda esa parte no sigue el diseño de Mesa
       * y parece aparte": tenia razon, y la causa era concreta. Cada pieza
       * era una CAJA rellena con una barra de color de 3px a la izquierda,
       * y ese "filo de color al lado" no existe en ningun otro sitio de la
       * aplicacion: en "antes de salir", en la clasificacion y en el login
       * todo son filas separadas por una linea fina. Una pantalla con dos
       * idiomas visuales se lee como dos pantallas pegadas.
       *
       * Ahora: fila, linea fina, icono, nombre en blanco, y el estado a la
       * derecha -verde si lo llevas, cuenta si te falta-. Sin `opacity`
       * apagando el texto, que es lo mismo que ya se quito del titulo.
       */}
      <div style={inputsRow}>
        {recipe.inputs.map((inp) => {
          const owned = inventoryItems.find((item) => item.item_id === inp.item_id)
          const have = owned && owned.state !== 'used' ? owned.quantity : 0
          const enough = have >= inp.quantity

          return (
            <div key={inp.item_id} className={CLASE_PIEZA_MESA} style={filaPieza}>
              <span style={filaPiezaIcono}>
                <ItemIconSvg itemId={inp.item_id} size={18} />
              </span>
              <span style={filaPiezaNombre}>
                {inp.quantity}× {owned?.label || inp.item_id.replace(/_/g, ' ')}
              </span>
              <span style={enough ? filaPiezaListo : filaPiezaFalta}>
                {enough ? '✓' : `${have}/${inp.quantity}`}
              </span>
            </div>
          )
        })}
      </div>

      {/* El boton, SIEMPRE.
          Antes solo aparecia cuando ya podias fabricar, asi que mientras
          juntabas piezas no habia nada que te dijera hacia donde ibas: la
          seccion terminaba en la ultima pieza y ya. Ahora esta desde el
          principio, apagado, y se enciende al completar la receta. */}
      <button
          type="button"
          disabled={!canCraft}
          style={canCraft ? craftBtn : { ...craftBtn, ...craftBtnApagado }}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onClick={() => {
            if (craftRecipe(user, recipe.recipe_id)) {
              onCrafted(`✅ ${recipe.outputs[0]?.label || 'Objeto'} creado con éxito`)
            } else {
              onCrafted('❌ No hay materiales suficientes')
            }
          }}
        >
          <span>⚒</span> Ensamblar
        </button>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function CraftingPanel({ user, stages }: CraftingPanelProps) {
  const [, setSnapshot] = useState<InventorySnapshot>(() => loadInventorySnapshot(user))
  const [feedback, setFeedback] = useState<{ msg: string; ts: number } | null>(null)

  useEffect(() => {
    function refresh() {
      setSnapshot(loadInventorySnapshot(user))
    }
    refresh()
    const id = window.setInterval(refresh, 2_000)
    window.addEventListener('storage', refresh)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('storage', refresh)
    }
  }, [user])

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
  // Antes esto leía usePlayerStore.getState().payload, pero la partida nunca
  // llegó a ese store: estaba siempre vacío, el filtro no encajaba con nada y
  // la mesa de trabajo decía "No hay recetas" aunque el jugador llevase los
  // ingredientes en la mochila.
  //
  // Ahora se cruzan las etapas reales (por prop) con lo que el jugador lleva
  // encima, así que una receta que YA puedes fabricar nunca puede desaparecer.
  // El respaldo al store se ha quitado: siempre devolvía [], o sea que no era
  // un respaldo, era ruido que hacía pensar que había una segunda vía.
  const stagesStr = JSON.stringify(stages ?? [])
  const ownedIds = new Set(
    loadInventorySnapshot(user)
      .items.filter((item) => item.state !== 'used' && item.quantity > 0)
      .map((item) => item.item_id)
  )

  // Sólo la receta REALMENTE en juego: la que pide algún nodo de esta misión.
  // Antes bastaba con que un ingrediente coincidiera, así que salían recetas
  // de otras misiones que el jugador no puede ni completar.
  const requiredByMission = RECIPES.filter((r) =>
    r.outputs.some((out) => stagesStr.includes(`"${out.item_id}"`))
  )

  // Si ningún nodo pide un resultado concreto, se cae a las recetas cuyos
  // ingredientes entrega esta misión.
  const craftableHere = RECIPES.filter((r) =>
    r.inputs.every((inp) => stagesStr.includes(`"${inp.item_id}"`) || ownedIds.has(inp.item_id))
  )

  const activeRecipes = requiredByMission.length > 0 ? requiredByMission : craftableHere

  const readyCount = activeRecipes.filter((r) => checkCraftingPossible(user, r)).length

  return (
    <section style={panel}>
      {/* La cabecera "MESA DE TRABAJO" se fue: repetia la pestaña "Mesa" que
          ya esta seleccionada y subrayada justo encima -mismo fallo, y mismo
          arreglo, que ya se hizo en Mochila con el titulo "MOCHILA"
          duplicado-. Se queda solo el recuento, que si es informacion. */}
      <div style={headerRow}>
        <span style={headerCount}>{activeRecipes.length} recetas</span>
        {readyCount > 0 && (
          <span style={readyBadge}>
            {readyCount} disponible{readyCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Info box */}
      <div style={infoBox}>
        <span style={{ fontSize: 15 }}>⚒️</span>
        <span style={infoText}>
          Combina objetos de tu mochila para fabricar piezas más potentes que desbloquean nuevos
          nodos. Si tienes todos los ingredientes, el botón <strong>Ensamblar</strong> se activará.
        </span>
      </div>

      {/* Feedback toast */}
      {feedback && <div style={toastBanner}>{feedback.msg}</div>}

      {/* Recipe list */}
      <div style={recipeList}>
        {activeRecipes.map((recipe) => (
          <RecipeCard
            key={recipe.recipe_id}
            recipe={recipe}
            user={user}
            onCrafted={handleCrafted}
          />
        ))}
      </div>

      {activeRecipes.length === 0 && (
        <div style={emptyMsg}>
          <span style={{ fontSize: 32 }}>⚒</span>
          <div>No hay recetas en esta ruta</div>
        </div>
      )}
    </section>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '10px 4px',
  flex: 1,
  overflowY: 'auto',
}

// La ayuda, en voz baja.
//
// Era una caja con fondo y borde, y en una pantalla de 375 px de ancho se comia
// el sitio de lo unico que importa aqui: la receta. Se queda el texto -hace
// falta la primera vez- pero sin caja, para que mande la ficha.
const infoBox: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  padding: '0 2px',
}

const infoText: CSSProperties = {
  fontSize: 12,
  color: 'rgba(var(--theme-line-soft), 0.75)',
  lineHeight: 1.5,
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
  color: 'rgba(255,255,255,0.4)',
}

// Sólido y redondo de verdad, no el radio del tema (ver la nota larga en
// availablePill/lockedPill un poco más abajo).
const readyBadge: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.05em',
  color: '#0b1220',
  background: '#22c55e',
  border: 0,
  borderRadius: 999,
  padding: '4px 10px',
}

const toastBanner: CSSProperties = {
  background: 'rgba(var(--theme-done), 0.15)',
  border: '1px solid rgba(var(--theme-done), 0.3)',
  color: '#bbf7d0',
  padding: '9px 14px',
  borderRadius: 'var(--theme-radius-card)',
  fontSize: 13,
  fontWeight: 800,
  textAlign: 'center',
  letterSpacing: '0.02em',
}

const recipeList: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

// La clase es lo que permite al tema darle FORMA. Sin ella no hay manera: el
// corte de fuego tiene que ir en una regla limitada a ese tema, porque en
// cristal la variable vale 0 y un poligono rectangular le borraria las esquinas
// redondas.
export const CLASE_FICHA_MESA = 'saga-mesa-ficha'
export const CLASE_PIEZA_MESA = 'saga-mesa-pieza'

// SIN FICHA.
//
// Era una tarjeta dentro de la hoja dentro del panel: tres marcos para un
// contenido, en una pantalla de 375 px. Ahora la receta es una seccion plana y
// el sitio se lo quedan las piezas, que es lo que se mira.
const recipeCard: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
}

/**
 * La receta sigue SIN FICHA: ver la nota de `recipeCard` justo arriba.
 *
 * Se probo a darles fondo solido para que casaran con el diseño "B", y era
 * volver al recuadro dentro de recuadro: la ficha dentro de la hoja dentro
 * del panel. La superficie la llevan las filas de piezas; la receta
 * solo se apaga cuando le faltan ingredientes.
 */
const recipeCardReady: CSSProperties = {
  background: 'transparent',
  border: 0,
}

// Sin opacidad rebajada: "Forjar el Sello no se lee bien, debe leerse todo
// bien y no estar opacado" -y tenia razon-. El `opacity: 0.5` de antes
// apagaba la tarjeta ENTERA, titulo incluido, justo en el caso mas comun
// -mientras aun faltan piezas-. El estado de "no listo" ya lo cuenta la
// etiqueta "FALTAN" (lockedPill) y el boton apagado (craftBtnApagado); no
// hacia falta apagar tambien el nombre de lo que se esta fabricando.
const recipeCardLocked: CSSProperties = {
  background: 'transparent',
  border: 0,
}

const recipeOutputRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const recipeOutputIcon: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 22,
  flexShrink: 0,
}

const recipeOutputBody: CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const recipeTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: '#ffffff',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const recipeOutputMeta: CSSProperties = {
  marginTop: 2,
  fontSize: 11,
  fontWeight: 700,
  color: 'rgba(var(--theme-line-soft), 0.55)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/**
 * "Anticuado": estos dos chips llevaban borde + relleno traslucido + el
 * radio de pildora del TEMA -que en fuego es 3px, casi cuadrado, hecho a
 * proposito para otros elementos-, mezclando dos lenguajes visuales en la
 * misma pantalla. Ahora son solidos y de verdad redondos (999px fijo,
 * como las insignias del podio), sin borde: el resto de la pantalla ya
 * no lleva bordes translucidos en ningun sitio.
 */
const availablePill: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: '0.08em',
  // Verde universal de "listo", no del tema: es una señal, no decoracion.
  color: '#0b1220',
  background: '#22c55e',
  border: 0,
  borderRadius: 999,
  padding: '4px 9px',
  flexShrink: 0,
}

const lockedPill: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: '0.08em',
  color: 'rgba(255,255,255,.6)',
  background: 'var(--theme-card-inset)',
  border: 0,
  borderRadius: 999,
  padding: '4px 9px',
  flexShrink: 0,
}

// Una pieza por fila y a todo el ancho: se leen en vertical de un vistazo, y
// con guantes se distinguen. En horizontal se envolvian y quedaban a medias.
const inputsRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  // Sin hueco: ahora lo que separa una pieza de otra es su linea fina, no
  // el aire entre cajas. Igual que las filas de la clasificacion.
  gap: 0,
}

// Fila, no caja: exactamente el mismo patron que las filas de "antes de
// salir" -linea fina arriba, icono, texto, estado a la derecha-.
const filaPieza: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '11px 0',
  borderTop: '1px solid var(--theme-hairline)',
}

const filaPiezaIcono: CSSProperties = {
  width: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const filaPiezaNombre: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13.5,
  fontWeight: 700,
  color: '#ffffff',
}

// Verde universal de "lo tienes", no --theme-done: en fuego ese token es
// naranja y no se distinguiria de lo que falta. Mismo criterio que las
// etiquetas de "antes de salir".
const filaPiezaListo: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: '#22c55e',
  flexShrink: 0,
}

const filaPiezaFalta: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: 'rgba(255,255,255,.5)',
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
}

/**
 * Apagado, pero SIGUE PARECIENDO UN BOTON.
 *
 * Usaba `--theme-card-inset`, el mismo color exacto que tenian las piezas
 * de arriba: el boton apagado se leia como una pieza mas de la lista, no
 * como el boton al que lleva todo lo demas. Ahora va con contorno -la
 * misma forma que los botones secundarios de Ferramentas y de "antes de
 * salir"-, que se lee como boton aunque este desactivado.
 */
const craftBtnApagado: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--theme-card-inset)',
  color: 'rgba(255,255,255,.42)',
  boxShadow: 'none',
  cursor: 'default',
}

const craftBtn: CSSProperties = {
  width: '100%',
  padding: '13px 0',
  borderRadius: 11,
  border: 'none',
  // Era morado -#a78bfa a #7c3aed- en un tema rojo. Del tema, ahora.
  background: 'var(--theme-primary)',
  color: 'var(--theme-card)',
  fontWeight: 900,
  fontSize: 14,
  letterSpacing: '0.05em',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  boxShadow: '0 4px 18px rgba(var(--theme-ink-deep), 0.45)',
  transition: 'transform 0.15s, box-shadow 0.15s',
}

const emptyMsg: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '28px 0',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 13,
  fontWeight: 700,
  textAlign: 'center',
}

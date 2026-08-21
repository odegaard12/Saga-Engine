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

      {/* Ingredientes: se distingue lo que YA tienes de lo que falta.
          Antes se listaban todos igual bajo el cartel "FALTAN", así que
          parecía que faltaban también los que llevabas en la mochila. */}
      <div style={inputsRow}>
        {recipe.inputs.map((inp) => {
          const owned = inventoryItems.find((item) => item.item_id === inp.item_id)
          const have = owned && owned.state !== 'used' ? owned.quantity : 0
          const enough = have >= inp.quantity

          return (
            <div
              key={inp.item_id}
              className={CLASE_PIEZA_MESA}
              style={{ ...inputChip, ...(enough ? inputChipReady : inputChipMissing) }}
            >
              <ItemIconSvg itemId={inp.item_id} size={16} />
              <span style={inputChipLabel}>
                {enough ? '✓' : `${have}/${inp.quantity}`} {inp.quantity}×{' '}
                {(owned?.label || inp.item_id.replace(/_/g, ' '))}
              </span>
            </div>
          )
        })}
      </div>

      {/* Craft button */}
      {canCraft && (
        <button
          type="button"
          style={craftBtn}
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
      )}
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
      {/* Header */}
      <div style={headerRow}>
        <div style={headerLeft}>
          <span style={headerLabel}>MESA DE TRABAJO</span>
          <span style={headerCount}>{activeRecipes.length} recetas</span>
        </div>
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

const headerLeft: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
}

const headerLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#fde68a',
}

const headerCount: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.4)',
}

const readyBadge: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.08em',
  color: 'rgb(var(--theme-done-soft))',
  background: 'rgba(var(--theme-done), 0.15)',
  border: '1px solid rgba(var(--theme-done), 0.3)',
  borderRadius: 'var(--theme-radius-pill)',
  padding: '3px 10px',
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

const recipeCard: CSSProperties = {
  borderRadius: 'var(--theme-radius-card)',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
}

const recipeCardReady: CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
}

const recipeCardLocked: CSSProperties = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.06)',
  opacity: 0.65,
}

const recipeOutputRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const recipeOutputIcon: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 'var(--theme-radius-card)',
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

const availablePill: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.12em',
  color: 'rgb(var(--theme-done-soft))',
  background: 'rgba(var(--theme-done), 0.15)',
  border: '1px solid rgba(var(--theme-done), 0.3)',
  borderRadius: 'var(--theme-radius-pill)',
  padding: '3px 8px',
  flexShrink: 0,
}

const lockedPill: CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: '0.12em',
  color: 'rgb(var(--theme-line))',
  background: 'rgba(var(--theme-line), 0.1)',
  border: '1px solid rgba(var(--theme-line), 0.2)',
  borderRadius: 'var(--theme-radius-pill)',
  padding: '3px 8px',
  flexShrink: 0,
}

const inputsRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const inputChip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 'var(--theme-radius-card)',
  padding: '4px 9px',
}

const inputChipReady: CSSProperties = {
  borderColor: 'rgba(var(--theme-done-soft), .45)',
  borderLeft: '2px solid rgb(var(--theme-done))',
  background: 'rgba(var(--theme-done-soft), .12)',
}

const inputChipMissing: CSSProperties = {
  opacity: 0.62,
}

const inputChipLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'rgba(var(--theme-line-soft), 0.7)',
}

const craftBtn: CSSProperties = {
  width: '100%',
  padding: '11px 0',
  borderRadius: 'var(--theme-radius-card)',
  border: 'none',
  background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
  color: '#fff',
  fontWeight: 900,
  fontSize: 14,
  letterSpacing: '0.05em',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  boxShadow: '0 4px 18px rgba(var(--theme-info-deep), 0.4)',
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

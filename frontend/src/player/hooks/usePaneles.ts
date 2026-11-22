import type { Dispatch, SetStateAction } from 'react'
import { usePlayerStore } from '../store/usePlayerStore'
import type { PlayerPanel } from '../runtime'

/**
 * Abrir y cerrar las herramientas, la clasificación y el panel del nodo: uno abierto cierra los otros. Sacado tal
 * cual de PlayerApp.tsx (mejora 5, 21/11); el panel activo sigue siendo un estado de PlayerApp.
 */
export function usePaneles(setActivePanel: Dispatch<SetStateAction<PlayerPanel>>) {
  const toolsOpen = usePlayerStore((s) => s.toolsOpen)
  const setToolsOpen = usePlayerStore((s) => s.setToolsOpen)
  const rankingOpen = usePlayerStore((s) => s.rankingOpen)
  const setRankingOpen = usePlayerStore((s) => s.setRankingOpen)


  function togglePanel(panel: Exclude<PlayerPanel, null>) {
    setToolsOpen(false)
    setActivePanel((current) => (current === panel ? null : panel))
  }

  function openTools() {
    setActivePanel(null)
    setToolsOpen(!toolsOpen)
  }

  function closeTools() {
    setToolsOpen(false)
  }

  function openRanking() {
    setActivePanel(null)
    setToolsOpen(false)
    setRankingOpen(!rankingOpen)
  }

  function closeRanking() {
    setRankingOpen(false)
  }

  return { toolsOpen, setToolsOpen, rankingOpen, togglePanel, openTools, closeTools, openRanking, closeRanking }
}

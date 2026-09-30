import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'

/**
 * Paneles del jugador que no hacen falta para ver el mapa.
 *
 * Iban dentro del paquete de arranque, así que el móvil se bajaba la
 * clasificación, el visor de fotos, la cámara, el escáner QR o la hoja de los
 * retos (con su resolutor de minijuegos) antes de pintar nada. Ahora cada uno
 * es un paquete aparte. Todos están en `/player-precache.json`, de modo que el
 * modo offline los guarda igual que al resto.
 */
export const RankingSheet = lazy(() =>
  import('./RankingSheet').then((modulo) => ({ default: modulo.RankingSheet }))
)
export const FieldPhotoViewer = lazy(() =>
  import('./FieldPhotoViewer').then((modulo) => ({ default: modulo.FieldPhotoViewer }))
)
export const FieldCameraCapture = lazy(() =>
  import('./FieldCameraCapture').then((modulo) => ({ default: modulo.FieldCameraCapture }))
)
export const UseItemOverlay = lazy(() =>
  import('./UseItemOverlay').then((modulo) => ({ default: modulo.UseItemOverlay }))
)
export const InteractionSheet = lazy(() =>
  import('./InteractionSheet').then((modulo) => ({ default: modulo.InteractionSheet }))
)
export const MissionCompleteScreen = lazy(() =>
  import('./MissionCompleteScreen').then((modulo) => ({ default: modulo.MissionCompleteScreen }))
)

// Los paneles de la mochila y de herramientas: se montan al abrir la hoja.
export const MissionPackPanel = lazy(() =>
  import('./MissionPackPanel').then((modulo) => ({ default: modulo.MissionPackPanel }))
)
export const InventoryPanel = lazy(() =>
  import('./InventoryPanel').then((modulo) => ({ default: modulo.InventoryPanel }))
)
export const CraftingPanel = lazy(() =>
  import('./CraftingPanel').then((modulo) => ({ default: modulo.CraftingPanel }))
)
export const RequirementPreviewPanel = lazy(() =>
  import('./RequirementPreviewPanel').then((modulo) => ({ default: modulo.RequirementPreviewPanel }))
)

interface PanelDiferidoProps {
  /** El panel está abierto ahora mismo: se monta ya, sin esperar. */
  abierto?: boolean
  /** Ms de calma tras montarse antes de precargarlo aunque nadie lo abra. */
  esperaMs?: number
  children: ReactNode
}

/**
 * Monta un panel perezoso sólo cuando hace falta.
 *
 * - Si está abierto, se monta en el acto (y aparece cuando llegue su paquete).
 * - Si no, se espera a que el mapa haya arrancado y el navegador esté libre, y
 *   entonces se monta cerrado: el paquete queda descargado y la primera
 *   apertura sale con su animación de siempre, sin esperar a la red.
 *
 * Una vez montado no se desmonta, así que las animaciones de cierre siguen
 * funcionando igual que antes.
 */
export function PanelDiferido({ abierto = false, esperaMs = 3000, children }: PanelDiferidoProps) {
  const [listo, setListo] = useState(false)

  useEffect(() => {
    if (listo) return undefined
    let cancelado = false
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let ocioso: number | undefined
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opciones?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }

    temporizador = setTimeout(() => {
      if (w.requestIdleCallback) {
        ocioso = w.requestIdleCallback(() => !cancelado && setListo(true), { timeout: 4000 })
      } else if (!cancelado) {
        setListo(true)
      }
    }, esperaMs)

    return () => {
      cancelado = true
      if (temporizador) clearTimeout(temporizador)
      if (ocioso !== undefined && w.cancelIdleCallback) w.cancelIdleCallback(ocioso)
    }
  }, [listo, esperaMs])

  if (!abierto && !listo) return null
  return <Suspense fallback={null}>{children}</Suspense>
}

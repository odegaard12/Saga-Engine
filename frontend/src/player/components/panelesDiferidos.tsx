import { Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { FronteraLocal } from '../../shared/FronteraLocal'
import { lazySeguro } from '../../shared/lazySeguro'

/**
 * Paneles del jugador que no hacen falta para ver el mapa.
 *
 * Iban dentro del paquete de arranque, así que el móvil se bajaba la
 * clasificación, el visor de fotos, la cámara, el escáner QR o la hoja de los
 * retos (con su resolutor de minijuegos) antes de pintar nada. Ahora cada uno
 * es un paquete aparte. Todos están en `/player-precache.json`, de modo que el
 * modo offline los guarda igual que al resto.
 */
export const RankingSheet = lazySeguro(() =>
  import('./RankingSheet').then((modulo) => ({ default: modulo.RankingSheet }))
)
export const FieldPhotoViewer = lazySeguro(() =>
  import('./FieldPhotoViewer').then((modulo) => ({ default: modulo.FieldPhotoViewer }))
)
export const FieldCameraCapture = lazySeguro(() =>
  import('./FieldCameraCapture').then((modulo) => ({ default: modulo.FieldCameraCapture }))
)
export const UseItemOverlay = lazySeguro(() =>
  import('./UseItemOverlay').then((modulo) => ({ default: modulo.UseItemOverlay }))
)
export const InteractionSheet = lazySeguro(() =>
  import('./InteractionSheet').then((modulo) => ({ default: modulo.InteractionSheet }))
)
export const MissionCompleteScreen = lazySeguro(() =>
  import('./MissionCompleteScreen').then((modulo) => ({ default: modulo.MissionCompleteScreen }))
)

// Los paneles de la mochila y de herramientas: se montan al abrir la hoja.
const cargarMissionPackPanel = () =>
  import('./MissionPackPanel').then((modulo) => ({ default: modulo.MissionPackPanel }))
const cargarInventoryPanel = () =>
  import('./InventoryPanel').then((modulo) => ({ default: modulo.InventoryPanel }))
const cargarCraftingPanel = () =>
  import('./CraftingPanel').then((modulo) => ({ default: modulo.CraftingPanel }))
const cargarRequirementPreviewPanel = () =>
  import('./RequirementPreviewPanel').then((modulo) => ({ default: modulo.RequirementPreviewPanel }))

export const MissionPackPanel = lazySeguro(cargarMissionPackPanel)
export const InventoryPanel = lazySeguro(cargarInventoryPanel)
export const CraftingPanel = lazySeguro(cargarCraftingPanel)
export const RequirementPreviewPanel = lazySeguro(cargarRequirementPreviewPanel)

/**
 * Baja por adelantado lo que llena las hojas de Mochila y Herramientas.
 *
 * Sin esto el paquete se pedia al ABRIR la hoja: la hoja subia vacia y, cuando
 * llegaba el paquete, el contenido aparecia de golpe y la hoja crecia 40 px
 * (lo midio el banco: `alto` 662 al abrir, 702 medio segundo despues). Con el
 * paquete ya guardado el contenido esta desde el primer fotograma.
 */
export function precargarPanelesDeHoja(): void {
  ;[cargarMissionPackPanel, cargarInventoryPanel, cargarCraftingPanel, cargarRequirementPreviewPanel].forEach(
    (cargar) => void cargar().catch(() => undefined)
  )
}

interface PanelDiferidoProps {
  /** El panel está abierto ahora mismo: se monta ya, sin esperar. */
  abierto?: boolean
  /** Ms de calma tras montarse antes de precargarlo aunque nadie lo abra. */
  esperaMs?: number
  /** Para el aviso de fallo: cerrar la hoja rota sin recargar la app. */
  alCerrar?: () => void
  children: ReactNode
}

const avisoDeHojaRota: CSSProperties = {
  position: 'fixed',
  left: 16,
  right: 16,
  bottom: 'calc(16px + env(safe-area-inset-bottom))',
  zIndex: 7000,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 'var(--theme-radius-card)',
  background: 'rgba(var(--theme-ink), .92)',
  color: 'var(--theme-text)',
  fontSize: 14,
  fontWeight: 700,
}

const botonDeHojaRota: CSSProperties = {
  border: '1px solid rgba(255,255,255,.35)',
  borderRadius: 999,
  padding: '8px 14px',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
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
export function PanelDiferido({ abierto = false, esperaMs = 3000, alCerrar, children }: PanelDiferidoProps) {
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
  /**
   * Con su propia frontera de errores (auditoría 23/10): una hoja que falla al pintarse ya no se lleva la partida
   * entera a la pantalla de error. Cerrada no se ve nada; abierta, un aviso para reintentar o cerrarla.
   */
  return (
    <FronteraLocal
      zona="hoja"
      respaldo={(reiniciar) =>
        abierto ? (
          <div role="alert" style={avisoDeHojaRota}>
            <span style={{ flex: '1 1 160px' }}>Esta pantalla no se pudo mostrar.</span>
            <button type="button" style={botonDeHojaRota} onClick={reiniciar}>
              Reintentar
            </button>
            {alCerrar ? (
              <button type="button" style={botonDeHojaRota} onClick={alCerrar}>
                Cerrar
              </button>
            ) : null}
          </div>
        ) : null
      }
    >
      <Suspense fallback={null}>{children}</Suspense>
    </FronteraLocal>
  )
}

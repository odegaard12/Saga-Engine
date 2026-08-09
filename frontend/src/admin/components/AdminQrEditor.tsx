import { QRCodeSVG } from 'qrcode.react'
import type { StageLike } from './guided-editor/guidedEditorUtils'
import { configOf, slugOf } from './guided-editor/guidedEditorUtils'
import { type PhysicalQrKind } from './PhysicalQrCardsPanel'

export interface AdminQrEditorProps {
  stage: StageLike
  onPatch: (updates: Record<string, unknown>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
}

export default function AdminQrEditor({
  stage,
  onPatch,
  onClose,
  onDelete,
  onRequestChangeType,
  stages: _stages = [],
}: AdminQrEditorProps) {
  const config = configOf(stage)
  const mode = (stage.physical_node_kind ?? 'collectible') as PhysicalQrKind

  const savedCard =
    stage.physical_qr && typeof stage.physical_qr === 'object'
      ? (stage.physical_qr as Record<string, unknown>)
      : {}

  const qrLabel = String(stage.physical_item_label ?? savedCard.label ?? stage.title ?? 'Objeto SAGA')
  const qrItemId = String(stage.physical_item_id ?? savedCard.item_id ?? '')
  const qrPayload = String(stage.qr_payload ?? savedCard.payload ?? '')

  /**
   * Mantiene sincronizados los tres campos del QR (etiqueta, id de objeto y
   * payload) con la tarjeta guardada. El payload es editable a mano: si las
   * pegatinas ya están impresas, debe coincidir exactamente con lo impreso.
   */
  function patchQr(next: { label?: string; itemId?: string; payload?: string }) {
    const nextLabel = next.label ?? qrLabel
    const nextItemId = next.itemId ?? qrItemId
    const nextPayload = next.payload ?? qrPayload

    onPatch({
      physical_node_kind: mode,
      physical_item_kind: mode,
      physical_item_label: nextLabel,
      physical_item_id: nextItemId,
      qr_payload: nextPayload,
      physical_qr: {
        item_id: nextItemId,
        label: nextLabel,
        kind: mode,
        payload: nextPayload,
        card_text: `⭐ ${nextLabel}\nObjeto QR\nEscanea esta tarjeta en SAGA.`,
        updated_at: new Date().toISOString(),
      },
    })
  }

  return (
    <div className="saga-guided-v4-scroll-view">
      <header className="saga-guided-v4-header">
        <div className="saga-guided-v4-titleblock">
          <span>QR FÍSICO</span>
          <input
            value={stage.title ?? stage.physical_item_label ?? ''}
            onChange={(e) => onPatch({ title: e.target.value, physical_item_label: e.target.value })}
            placeholder="Objeto Escaneable"
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '2px dashed rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: '22px',
              fontWeight: 800,
              padding: '2px 0',
              margin: '4px 0',
              outline: 'none',
              width: '100%',
              fontFamily: 'inherit'
            }}
          />
          <div className="saga-guided-v4-chips">
            <b>▣ QR Físico</b>
            <b>Jugable</b>
            <b>Offline listo</b>
            {stage.lat != null && stage.lon != null ? (
              <b>
                {Number(stage.lat).toFixed(5)}, {Number(stage.lon).toFixed(5)}
              </b>
            ) : null}
          </div>
        </div>

        <div className="saga-guided-v4-actions">
          <button
            type="button"
            className="primary-soft"
            onClick={() => {
              if (onRequestChangeType) {
                onRequestChangeType()
              } else {
                onPatch({ _type_choice_done: false })
              }
            }}
          >
            Cambiar tipo
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Eliminar
          </button>
          <button type="button" onClick={onClose}>
            Cerrar ×
          </button>
        </div>
      </header>

      <div className="saga-guided-v4-page" style={{ paddingTop: 20 }}>
        <div className="saga-guided-v4-pagehead">
          <span>QR Físico</span>
          <h3>Configura tu objeto escaneable</h3>
          <p>
            Esta tarjeta se debe imprimir y esconder en el mundo real. 
            El jugador usará la cámara SAGA para escanearla.
          </p>
        </div>

        <div className="saga-guided-v4-formgrid">
          
          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              🖼️ Datos del QR
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              El código de abajo es exactamente el que se imprime y el que debe leer la cámara.
              Si ya tienes las pegatinas impresas, escribe aquí el mismo texto que llevan.
            </p>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', padding: '0 12px 12px', alignItems: 'flex-start' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  padding: 16,
                  background: '#ffffff',
                  border: '1px dashed #cbd5e1',
                  borderRadius: 16,
                }}
              >
                {qrPayload ? (
                  <>
                    <div style={{ position: 'relative', display: 'flex' }}>
                      <QRCodeSVG value={qrPayload} size={150} level="H" fgColor="#007f4f" />
                      {/* Logo pequeño: si tapa la fila de formato del QR, el
                          código deja de ser legible por cualquier escáner. */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          background: '#ffffff',
                          color: '#007f4f',
                          fontSize: 8,
                          fontWeight: 900,
                          letterSpacing: '0.02em',
                          padding: '2px 3px',
                          borderRadius: 3,
                          lineHeight: 1,
                        }}
                      >
                        SAGA
                      </div>
                    </div>
                    <div
                      style={{
                        color: '#007f4f',
                        fontSize: 13,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        border: '2px solid #007f4f',
                        borderRadius: 20,
                        padding: '3px 20px',
                        textAlign: 'center',
                      }}
                    >
                      {qrLabel}
                    </div>
                  </>
                ) : (
                  <span style={{ color: '#64748b', fontSize: 12, fontWeight: 700, padding: 40 }}>
                    Escribe un código para generar el QR
                  </span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 240, display: 'grid', gap: 10 }}>
                <label className="wide">
                  <span>Código del QR (lo que lleva impreso)</span>
                  <input
                    type="text"
                    value={qrPayload}
                    onChange={(e) => patchQr({ payload: e.target.value.trim() })}
                    placeholder="Ej. CODIGO_01"
                  />
                </label>

                <label className="wide">
                  <span>Nombre visible del objeto</span>
                  <input
                    type="text"
                    value={qrLabel}
                    onChange={(e) => patchQr({ label: e.target.value })}
                    placeholder="Ej. Antena de Frecuencia"
                  />
                </label>

                <label className="wide">
                  <span>ID interno (lo que entra en la mochila)</span>
                  <input
                    type="text"
                    value={qrItemId}
                    onChange={(e) =>
                      patchQr({
                        itemId: slugOf(e.target.value),
                      })
                    }
                    placeholder="Ej. antena_frecuencia"
                  />
                </label>

                <p style={{ margin: 0, color: '#fbbf24', fontSize: 11, fontWeight: 700, lineHeight: 1.4 }}>
                  ⚠️ Si cambias el código, las pegatinas ya impresas dejarán de funcionar.
                  Reimprímelas desde el botón de imprimir QRs.
                </p>
              </div>
            </div>
          </div>

          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              📖 Historia / Introducción (Opcional)
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              Texto que se mostrará al jugador ANTES de indicarle que escanee el QR.
            </p>
            <div style={{ padding: '0 12px 12px' }}>
              <label className="wide">
                <span>Título de la historia</span>
                <input 
                  type="text" 
                  value={stage.intro_title || ''} 
                  onChange={(e) => onPatch({ intro_title: e.target.value })}
                  placeholder="Ej: El cofre secreto"
                  style={{ marginBottom: 8 }}
                />
              </label>
              <label className="wide">
                <span>Narrativa previa</span>
                <textarea 
                  value={stage.intro_body || ''} 
                  onChange={(e) => onPatch({ intro_body: e.target.value })}
                  placeholder="Soporta Markdown para imágenes: ![alt](url)."
                  rows={3}
                />
              </label>
            </div>
          </div>

          <div className="saga-guided-v4-dep-box wide">
            <div className="saga-guided-v4-dep-box__title">
              🆘 Código de Emergencia (Fallback)
            </div>
            <p className="saga-guided-v4-dep-box__desc">
              Si la cámara del jugador falla o el QR se rompe, el jugador puede escribir este código manualmente.
            </p>
            <label>
              <span>Código Alfanumérico Corto</span>
              <input 
                type="text" 
                value={String(config.success_code ?? config.fallback_code ?? `SAGA-${String(stage.index + 1).padStart(2, '0')}`)} 
                onChange={(e) => {
                  const val = e.target.value.trim().toUpperCase()
                  onPatch({
                    fallback_code: val,
                    physical_fallback_code: val,
                    config: {
                      ...config,
                      success_code: val
                    }
                  })
                }}
                placeholder="Ej. SAGA-12"
              />
            </label>
          </div>

        </div>
      </div>
    </div>
  )
}

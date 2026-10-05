import { SagaQrCode } from '../../shared/qrCard'
import type { StageLike } from './guided-editor/guidedEditorUtils'
import { configOf, slugOf } from './guided-editor/guidedEditorUtils'
import { type PhysicalQrKind } from './PhysicalQrCardsPanel'
import { savedFallbackCode } from '../lib/stageFields'
import NodeEditorFrame, { MaquetaMovil, type EstadoGuardado, type SeccionDef } from './editor/NodeEditorFrame'
import RecompensaDeVestuario from './vestuario/RecompensaDeVestuario'
import { estadoDelNodoEnEdicion, type SeccionEditor } from '../lib/estadoNodo'

export interface AdminQrEditorProps {
  stage: StageLike
  onPatch: (updates: Record<string, unknown>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
  estadoGuardado?: EstadoGuardado
  onGuardar?: () => void
}

export default function AdminQrEditor({
  stage,
  onPatch,
  onClose,
  onDelete,
  onRequestChangeType,
  stages: _stages = [],
  estadoGuardado = 'idle',
  onGuardar,
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

  const estadoEditor = estadoDelNodoEnEdicion(stage as never, _stages as never[])
  const avisosDe = (seccion: SeccionEditor) =>
    estadoEditor.problemas.filter((p) => p.seccion === seccion).map((p) => p.texto)
  const secciones: SeccionDef[] = [
    {
      id: 'identidad',
      titulo: 'Datos del QR',
      icono: '▣',
      resumen: qrPayload ? `Código ${qrPayload} · ${qrLabel}` : 'Sin código todavía',
      nivel: avisosDe('identidad').length ? 'incompleto' : qrPayload ? 'ok' : 'aviso',
      avisos: avisosDe('identidad'),
      abierta: true,
      contenido: (
        <>
          <p className="r7-ayuda-seccion">
            El código es exactamente el que se imprime y el que debe leer la cámara. Si ya tienes
            las pegatinas impresas, escribe aquí el mismo texto que llevan.
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
                    {/* Exactamente el mismo código que se va a imprimir: misma
                        pieza, mismos ajustes. Aquí había una copia con el logo
                        centrado encima, que es lo que dejó las pegatinas del
                        monte ilegibles para cualquier escáner. */}
                    <SagaQrCode payload={qrPayload} size={150} />
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
        </>
      ),
    },
    {
      id: 'donde',
      titulo: 'Dónde',
      icono: '📍',
      resumen:
        stage.lat != null && stage.lon != null
          ? `${Number(stage.lat).toFixed(5)}, ${Number(stage.lon).toFixed(5)}`
          : 'Sin posición',
      nivel: avisosDe('donde').length ? 'incompleto' : 'ok',
      avisos: avisosDe('donde'),
      abierta: avisosDe('donde').length > 0,
      contenido: (
        <>
          <div className="r7-coordenadas">
            <span className="r7-campo-etiqueta">Posición en el mapa</span>
            <code>
              {stage.lat != null && stage.lon != null
                ? `${Number(stage.lat).toFixed(5)}, ${Number(stage.lon).toFixed(5)}`
                : 'Sin posición'}
            </code>
            <small>La tarjeta se esconde en el mundo real; el pin del mapa marca la zona.</small>
          </div>
        </>
      ),
    },
    {
      id: 'historia',
      titulo: 'Historia y pistas',
      icono: '📜',
      resumen: stage.intro_title ? `Prólogo «${stage.intro_title}»` : 'Sin prólogo (opcional)',
      abierta: false,
      contenido: (
        <>
          <p className="r7-ayuda-seccion">
            Texto que se muestra al jugador ANTES de pedirle que escanee el QR.
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
        </>
      ),
    },
    {
      id: 'recompensas',
      titulo: 'Recompensas',
      icono: '🎁',
      resumen: 'Vestuario que gana quien supere este nodo',
      abierta: false,
      contenido: (
        <div className="r7-campo ancho">
          <RecompensaDeVestuario nodeId={String(stage.id ?? '')} />
        </div>
      ),
    },
    {
      id: 'avanzado',
      titulo: 'Avanzado',
      icono: '🛠️',
      resumen: savedFallbackCode(stage)
        ? `Código de emergencia ${savedFallbackCode(stage)}`
        : 'Sin código de emergencia',
      abierta: false,
      contenido: (
        <>
          <p className="r7-ayuda-seccion">
            Si la cámara del jugador falla o el QR se rompe, puede escribir este código a mano.
          </p>
            <label>
              <span>Código Alfanumérico Corto</span>
              {/* Solo se enseña el código que está GUARDADO; sin él, el campo sale
                  vacío. Antes salía un `SAGA-NN` inventado que no se guardaba. */}
              <input
                type="text"
                value={savedFallbackCode(stage)}
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
                placeholder={`Sin código · por ejemplo SAGA-${String(stage.index + 1).padStart(2, '0')}`}
              />
            </label>
        </>
      ),
    },
  ]

  return (
    <NodeEditorFrame
      numero={Number(stage.index ?? 0) + 1}
      titulo={String(stage.title ?? stage.physical_item_label ?? '').replace(/^\d+\.\s*/, '')}
      onTitulo={(valor) => onPatch({ title: valor, physical_item_label: valor })}
      tipoIcono="▣"
      tipoTexto="QR físico"
      nivel={estadoEditor.nivel}
      motivos={estadoEditor.motivos}
      coordenadas={
        stage.lat != null && stage.lon != null
          ? `${Number(stage.lat).toFixed(5)}, ${Number(stage.lon).toFixed(5)}`
          : ''
      }
      estadoGuardado={estadoGuardado}
      onGuardar={onGuardar}
      onCerrar={onClose}
      onEliminar={onDelete}
      onCambiarTipo={() => {
        if (onRequestChangeType) {
          onRequestChangeType()
        } else {
          onPatch({ _type_choice_done: false })
        }
      }}
      secciones={secciones}
      vistaPrevia={
        <MaquetaMovil
          titulo={qrLabel}
          tipo="QR físico"
          tipoIcono="▣"
          prologoTitulo={String(stage.intro_title || '')}
          prologo={String(stage.intro_body || '')}
          accion="Escanear el QR"
        />
      }
    />
  )
}

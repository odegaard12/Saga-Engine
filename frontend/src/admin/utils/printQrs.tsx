import { renderToString } from 'react-dom/server'
import { LADO_IMPRESO_MM, SagaQrCard } from '../../shared/qrCard'
import { revisarPayloadQr, TEXTO_AVISO_PAYLOAD } from '../../shared/qrPayload'
import type { AdminReactOverviewStage } from '../lib/adminApi'

function escaparHtml(valor: string): string {
  const tabla: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return valor.replace(/[&<>"']/g, (c) => tabla[c] || c)
}

function hasPersistedStageId(stage: AdminReactOverviewStage) {
  const id = stage.id
  if (typeof id === 'number') return Number.isFinite(id) && id >= 0
  if (typeof id === 'string') {
    const normalized = id.trim()
    if (!normalized) return false
    return !/^temp[-_:]|^new[-_:]|^draft[-_:]/i.test(normalized)
  }
  return false
}

function getCardData(stage: AdminReactOverviewStage) {
  const stageType = String(stage.type ?? '')
    .trim()
    .toLowerCase()
  const physicalKind = String((stage as { physical_node_kind?: unknown }).physical_node_kind ?? '')
    .trim()
    .toLowerCase()
  const qrPayload = typeof stage.qr_payload === 'string' ? stage.qr_payload.trim() : ''

  let physQrObj: Record<string, unknown> | null = null
  if (typeof stage.physical_qr === 'string') {
    try {
      physQrObj = JSON.parse(stage.physical_qr)
    } catch (e) {}
  } else if (typeof stage.physical_qr === 'object' && stage.physical_qr !== null) {
    physQrObj = stage.physical_qr as Record<string, unknown>
  }

  const hasQrMarker =
    stageType === 'qr_scan' ||
    physicalKind === 'qr' ||
    Boolean(qrPayload) ||
    Boolean(physQrObj?.payload)

  if (!hasQrMarker) return null
  if (!hasPersistedStageId(stage)) return null

  // Los mismos tres sitios que mira el servidor (`stage_qr_payloads`).
  const config = (stage as { config?: unknown }).config
  const configPayload =
    config &&
    typeof config === 'object' &&
    typeof (config as Record<string, unknown>).qr_payload === 'string'
      ? String((config as Record<string, unknown>).qr_payload).trim()
      : ''
  const payloadStr =
    (qrPayload || null) ??
    (configPayload || null) ??
    (physQrObj?.payload as string | null | undefined) ??
    null

  const label = String(stage.title ?? '').trim()
  const payload = typeof payloadStr === 'string' ? payloadStr.trim() : ''

  /**
   * Sin código no se imprime nada.
   *
   * Antes se imprimía el título del nodo pasado a minúsculas como si fuera el
   * código: una pegatina que el servidor NO acepta (sólo vale el código
   * guardado en el nodo) y que además llevaba el nombre del sitio dentro.
   */
  if (!payload) return { label: label || 'Nodo QR', payload: '', sinCodigo: true }

  return {
    label: label || 'Nodo QR',
    payload,
    sinCodigo: false,
    avisos: revisarPayloadQr(payload, { titulo: label, id: stage.id as string | number }),
  }
}

export function printAllQrs(stages: AdminReactOverviewStage[]) {
  const todas = stages.map(getCardData).filter(Boolean) as {
    label: string
    payload: string
    sinCodigo: boolean
    avisos?: ReturnType<typeof revisarPayloadQr>
  }[]
  const cards = todas.filter((c) => !c.sinCodigo)
  const sinCodigo = todas.filter((c) => c.sinCodigo)

  if (cards.length === 0) {
    alert(
      sinCodigo.length
        ? 'Los nodos QR de esta misión no tienen código guardado: genera uno en cada nodo antes de imprimir.'
        : 'No hay nodos QR físicos configurados en esta misión.'
    )
    return
  }

  // Avisos para quien imprime (no salen en el papel): nodos sin código y
  // códigos que se pueden adivinar o que salen demasiado densos.
  const avisos: string[] = []
  if (sinCodigo.length) {
    avisos.push(
      `${sinCodigo.length} nodo(s) QR sin código guardado no se imprimen: ${sinCodigo.map((c) => c.label).join(', ')}.`
    )
  }
  for (const c of cards) {
    for (const aviso of c.avisos || []) avisos.push(`${c.label}: ${TEXTO_AVISO_PAYLOAD[aviso]}`)
  }
  const avisosHtml = avisos.length
    ? `<div class="aviso aviso-alerta"><b>Revisa antes de imprimir</b><ul>${avisos
        .map((a) => `<li>${escaparHtml(a)}</li>`)
        .join('')}</ul></div>`
    : ''
  /**
   * Las tarjetas salen de la pieza compartida, no de un diseño escrito aquí.
   *
   * Aquí había una copia con sus propios ajustes: el logo SAGA encima del
   * código —que tapa la información de formato y lo deja ilegible para
   * cualquier escáner—, verde sobre blanco, y la zona de silencio a cero, que
   * es lo que trae el generador por defecto y lo que la norma prohíbe.
   *
   * Ahora imprime exactamente lo mismo que se ve en el panel. Ver
   * shared/qrCard.tsx para el porqué de cada ajuste.
   */
  const renderedCardsJson = JSON.stringify(
    cards.map((c) => ({
      label: c.label,
      payload: c.payload,
      qrSvg: renderToString(
        <SagaQrCard data={{ label: c.label, payload: c.payload }} paraImprimir />
      ),
    }))
  )

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Pegatinas QR - SAGA Engine</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 0;
          padding: 0;
          background: #f8fafc;
          color: #0f172a;
        }

        /* Fixed Toolbar for interactive UI before printing */
        .toolbar {
          position: sticky;
          top: 0;
          background: #0f172a;
          color: #f8fafc;
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9999;
        }
        .toolbar-title {
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toolbar-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .toolbar-label {
          font-size: 13px;
          color: #94a3b8;
        }
        .btn-copies {
          background: #1e293b;
          color: #cbd5e1;
          border: 1px solid #334155;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-copies.active {
          background: #38bdf8;
          color: #0f172a;
          border-color: #38bdf8;
        }
        .btn-print {
          background: #22c55e;
          color: #ffffff;
          border: none;
          padding: 8px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 2px 8px rgba(34,197,94,0.3);
        }
        .btn-print:hover {
          background: #16a34a;
        }

        /* Printable Stickers Grid */
        .page-container {
          padding: 24px;
        }
        .aviso {
          max-width: 560px;
          margin: 0 auto 20px;
          padding: 12px 16px;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-left: 3px solid #059669;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.5;
          color: #064e3b;
        }
        .aviso b { display: block; margin-bottom: 4px; }
        .aviso-alerta {
          background: #fffbeb;
          border-color: #fcd34d;
          border-left-color: #b45309;
          color: #78350f;
        }
        .aviso-alerta ul { margin: 4px 0 0; padding-left: 18px; }
        .sticker-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          justify-content: center;
        }
        .sticker-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          page-break-inside: avoid;
          break-inside: avoid;
          /* Marca de corte: por donde pasar la tijera sin comerse la zona de
             silencio del codigo, que es justo lo que lo hace legible. */
          padding: 3mm;
          outline: 1px dashed #94a3b8;
          outline-offset: -1px;
        }

        /* Print Override */
        @media print {
          /* Tamano real, no "lo que quepa". Un QR reescalado por la impresora
             deja de tener el tamano de modulo que se calculo para leerse a un
             brazo de distancia. */
          @page { margin: 8mm; }
          body {
            background: #ffffff;
            color: #000000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .toolbar, .aviso {
            display: none !important;
          }
          .page-container {
            padding: 0;
          }
          .sticker-grid {
            gap: 0;
            justify-content: flex-start;
          }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <div class="toolbar-title">
          <span>🖨️ Imprimir Pegatinas QR</span>
        </div>
        <div class="toolbar-controls">
          <span class="toolbar-label">Copias por pegatina:</span>
          <button class="btn-copies active" onclick="renderGrid(1)">1x</button>
          <button class="btn-copies" onclick="renderGrid(2)">2x</button>
          <button class="btn-copies" onclick="renderGrid(4)">4x</button>
          <button class="btn-copies" onclick="renderGrid(6)">6x</button>
          <button class="btn-copies" onclick="renderGrid(8)">8x</button>
          <button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR</button>
        </div>
      </div>

      <div class="page-container">
        <div class="aviso">
          <b>Imprime a tamaño real (100 %), sin «ajustar a la página».</b>
          El código mide ${LADO_IMPRESO_MM} mm de lado (con su margen blanco) a propósito: es
          lo que hace que se lea a 20-40 cm y con luz mala. Si la impresora lo encoge,
          deja de leerse. Se puede imprimir en blanco y negro; mejor papel mate (el
          brillo hace reflejos). La línea de puntos es por donde cortar sin comerse
          el margen blanco del código, que es parte del código.
        </div>
        ${avisosHtml}
        <div class="sticker-grid" id="grid"></div>
      </div>

      <script>
        const cardsData = ${renderedCardsJson.replace(/</g, '\\u003c')};

        function renderGrid(multiplier) {
          const grid = document.getElementById('grid');
          // Sin innerHTML: cada SVG se parsea como XML y se importa como nodo.
          grid.replaceChildren();

          cardsData.forEach(c => {
            const svg = new DOMParser().parseFromString(c.qrSvg, 'image/svg+xml').documentElement;
            for (let i = 0; i < multiplier; i++) {
              const card = document.createElement('div');
              card.className = 'sticker-card';
              const wrap = document.createElement('div');
              wrap.className = 'qr-wrap';
              wrap.appendChild(document.importNode(svg, true));
              card.appendChild(wrap);
              grid.appendChild(card);
            }
          });

          document.querySelectorAll('.btn-copies').forEach(btn => {
            btn.classList.toggle('active', btn.innerText === multiplier + 'x');
          });
        }

        window.onload = () => {
          renderGrid(1);
        };
      </script>
    </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  } else {
    alert('Permite las ventanas emergentes (pop-ups) para imprimir los QRs.')
  }
}

import { renderToString } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import type { AdminReactOverviewStage } from '../lib/adminApi'

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function getCardData(stage: AdminReactOverviewStage) {
  const isQr = stage.entry_mode === 'qr' || stage.type === 'qr_scan' || Boolean(stage.qr_payload)
  if (!isQr) return null

  const payloadStr =
    stage.qr_payload ??
    (typeof stage.physical_qr === 'object' && stage.physical_qr !== null
      ? (stage.physical_qr as Record<string, unknown>).payload
      : null)

  const label = stage.title || 'Nodo QR'

  if (typeof payloadStr === 'string' && payloadStr.trim()) {
    return { label, payload: payloadStr.trim() }
  }

  const itemId = slugify(label) || 'objeto_saga'
  const payload = `SAGA1:ITEM:${itemId}:${label}`
  return { label, payload }
}

export function printAllQrs(stages: AdminReactOverviewStage[]) {
  const cards = stages.map(getCardData).filter(Boolean) as { label: string; payload: string }[]

  if (cards.length === 0) {
    alert('No hay nodos QR físicos configurados en esta misión.')
    return
  }

  const sagaLogoDataUrl =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='42' viewBox='0 0 100 42'>" +
    "<rect width='100' height='42' rx='10' fill='%23047857' stroke='%23059669' stroke-width='2'/>" +
    "<text x='50' y='28' font-family='system-ui, Arial Black, sans-serif' font-weight='900' font-size='20' fill='%23ffffff' text-anchor='middle' letter-spacing='2.5'>SAGA</text>" +
    "</svg>"

  const renderedCardsJson = JSON.stringify(
    cards.map((c) => ({
      label: c.label,
      payload: c.payload,
      qrSvg: renderToString(
        <QRCodeSVG
          value={c.payload}
          size={200}
          level="H"
          fgColor="#047857"
          bgColor="#ffffff"
          includeMargin
          imageSettings={{
            src: sagaLogoDataUrl,
            x: undefined,
            y: undefined,
            height: 38,
            width: 80,
            excavate: true,
          }}
        />
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
        .sticker-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 16px;
          justify-items: center;
        }
        .sticker-card {
          width: 210px;
          height: 220px;
          background: #ffffff;
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          page-break-inside: avoid;
        }
        .qr-wrap {
          width: 165px;
          height: 165px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qr-wrap svg {
          width: 100%;
          height: 100%;
        }
        .sticker-code {
          margin-top: 6px;
          font-size: 16px;
          font-weight: 800;
          font-family: monospace;
          color: #000000;
          letter-spacing: 0.5px;
          background: #f1f5f9;
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Print Override */
        @media print {
          body {
            background: #ffffff;
            color: #000000;
          }
          .toolbar {
            display: none !important;
          }
          .page-container {
            padding: 0;
          }
          .sticker-grid {
            gap: 10px;
          }
          .sticker-card {
            border: 1px dashed #94a3b8;
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
        <div class="sticker-grid" id="grid"></div>
      </div>

      <script>
        const cardsData = ${renderedCardsJson};

        function renderGrid(multiplier) {
          const grid = document.getElementById('grid');
          let htmlStr = '';

          cardsData.forEach(c => {
            for (let i = 0; i < multiplier; i++) {
              htmlStr += \`
                <div class="sticker-card">
                  <div class="qr-wrap">\${c.qrSvg}</div>
                  <div class="sticker-code">\${c.payload}</div>
                </div>
              \`;
            }
          });

          grid.innerHTML = htmlStr;

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


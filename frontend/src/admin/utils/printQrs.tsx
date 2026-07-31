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
  const renderedCardsJson = JSON.stringify(
    cards.map((c) => ({
      label: c.label,
      payload: c.payload,
      qrSvg: renderToString(
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          width: 'fit-content'
        }}>
          <div style={{
            position: 'relative',
            padding: '8px',
            background: '#ffffff',
            borderRadius: '8px',
          }}>
            <QRCodeSVG
              value={c.payload}
              size={160}
              level="H"
              fgColor="#007f4f"
              includeMargin={false}
            />
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#007f4f',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: '14px',
              letterSpacing: '2px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '2px solid #ffffff',
              fontFamily: 'system-ui, Arial Black, sans-serif',
            }}>SAGA</div>
          </div>
          <div style={{
            marginTop: '12px',
            background: '#f1f5f9',
            color: '#0f172a',
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '14px',
            fontWeight: 700,
            border: '1px solid #cbd5e1',
            maxWidth: '180px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {c.label}
          </div>
        </div>
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
        }
        .qr-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
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
        const cardsData = \${renderedCardsJson};

        function renderGrid(multiplier) {
          const grid = document.getElementById('grid');
          let htmlStr = '';

          cardsData.forEach(c => {
            for (let i = 0; i < multiplier; i++) {
              htmlStr += \`
                <div class="sticker-card">
                  <div class="qr-wrap">\${c.qrSvg}</div>
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


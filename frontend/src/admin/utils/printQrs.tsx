import { renderToString } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import type { AdminReactOverviewStage } from '../lib/adminApi'
import { getPhysicalNodeVisual } from '../lib/physicalNodeVisuals'

const kindLabels: Record<string, string> = {
  collectible: 'Coleccionable',
  requirement: 'Llave QR',
  clue: 'Pista QR',
  bonus: 'Bonus QR',
}

const kindIcons: Record<string, string> = {
  collectible: '⭐',
  requirement: '🔑',
  clue: '🧩',
  bonus: '🎁',
}

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
  const visual = getPhysicalNodeVisual(stage)
  if (!visual || !['collectible', 'requirement', 'clue', 'bonus'].includes(visual.kind)) {
    return null
  }

  const payloadStr = typeof stage.physical_qr === 'object' && stage.physical_qr !== null
    ? (stage.physical_qr as Record<string, unknown>).payload
    : null
  
  if (typeof payloadStr === 'string' && payloadStr.trim()) {
    const kind = visual.kind as keyof typeof kindLabels
    const label = visual.label || stage.title || 'Nodo'
    return { kind, label, payload: payloadStr }
  }

  const kind = visual.kind as keyof typeof kindLabels
  const label = visual.label || stage.title || 'Nodo'
  const itemId = slugify(label) || 'objeto_saga'
  const payload = `SAGA1:ITEM:${itemId}:${label}`
  return { kind, label, payload }
}

export function printAllQrs(stages: AdminReactOverviewStage[]) {
  const cards = stages.map(getCardData).filter(Boolean) as { kind: string, label: string, payload: string }[]

  if (cards.length === 0) {
    alert('No hay nodos físicos (QRs) en esta misión para imprimir.')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Imprimir Tarjetas QR - SAGA</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 0;
          padding: 20px;
          background: #fff;
          color: #000;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 20px;
        }
        .card {
          border: 2px dashed #000;
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          page-break-inside: avoid;
        }
        .card h3 {
          margin: 0 0 10px 0;
          font-size: 16px;
        }
        .card p {
          margin: 0 0 15px 0;
          font-size: 14px;
          color: #444;
        }
        .qr-wrap {
          margin-bottom: 15px;
        }
        .qr-wrap svg {
          width: 150px;
          height: 150px;
        }
        .footer {
          font-size: 11px;
          color: #666;
        }
        @media print {
          body { padding: 0; }
          .grid { gap: 10px; }
        }
      </style>
    </head>
    <body>
      <h2>SAGA - Nodos Físicos (${cards.length})</h2>
      <div class="grid">
        ${cards.map(c => `
          <div class="card">
            <h3>${kindIcons[c.kind] || ''} ${c.label}</h3>
            <p>${kindLabels[c.kind] || 'Objeto'}</p>
            <div class="qr-wrap">
              ${renderToString(<QRCodeSVG value={c.payload} size={150} level="H" includeMargin />)}
            </div>
            <div class="footer">Escanea esta tarjeta en SAGA.</div>
          </div>
        `).join('')}
      </div>
      <script>
        window.onload = () => {
          setTimeout(() => {
            window.print();
          }, 500);
        }
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

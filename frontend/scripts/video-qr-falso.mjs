/**
 * Un vídeo .y4m con una pegatina QR, para la cámara falsa de Chromium.
 *
 *     node scripts/video-qr-falso.mjs <payload> <salida.y4m> [--pequeno]
 *
 * (La inclinación la mide el banco, `medir-lectura-qr.mjs`, con una
 * perspectiva de verdad; aquí sólo hace falta una cámara que funcione.)
 *
 * Chromium lo usa como cámara con:
 *     --use-fake-device-for-media-stream --use-fake-ui-for-media-stream
 *     --use-file-for-fake-video-capture=<salida.y4m>
 *
 * La pegatina se dibuja con los ajustes REALES de shared/qrCard.tsx sobre un
 * fondo con manchas, con un poco de grano y moviéndose un par de píxeles de
 * fotograma a fotograma, como una mano que sujeta el móvil.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [payload, salida] = process.argv.slice(2)
if (!payload || !salida) {
  console.error('uso: node scripts/video-qr-falso.mjs <payload> <salida.y4m> [--pequeno]')
  process.exit(2)
}
const PEQUENO = process.argv.includes('--pequeno')

const tarjeta = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'qrCard.tsx'), 'utf8')
const constante = (nombre) => Number(new RegExp(`const ${nombre} = ([0-9]+)`).exec(tarjeta)?.[1])

const svg = renderToStaticMarkup(
  createElement(QRCodeSVG, {
    value: payload,
    level: 'H',
    marginSize: constante('ZONA_DE_SILENCIO'),
    minVersion: constante('VERSION_MINIMA'),
    bgColor: '#ffffff',
    fgColor: '#000000',
  })
)
const n = Number(/viewBox="0 0 (\d+) (\d+)"/.exec(svg)[1])
const d = (/<path[^>]*fill="#000000"[^>]*d="([^"]+)"/.exec(svg) || /<path[^>]*d="([^"]+)"[^>]*fill="#000000"/.exec(svg))[1]
const modulos = new Uint8Array(n * n)
for (const c of d.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v(\d+)/g)) {
  const [x0, y0, w, h] = c.slice(1, 5).map(Number)
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) modulos[y * n + x] = 1
}

const W = 1280
const H = 720
const FOTOGRAMAS = 30
const lado = (PEQUENO ? 0.14 : 0.3) * W
let semilla = 12345
const azar = () => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

const cabecera = `YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`
const trozos = [Buffer.from(cabecera)]
for (let f = 0; f < FOTOGRAMAS; f += 1) {
  const y = Buffer.alloc(W * H)
  const cx = W / 2 + Math.sin(f / 4) * 3
  const cy = H / 2 + Math.cos(f / 5) * 2
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const u = ((px - cx) / lado + 0.5) * n
      const v = ((py - cy) / lado + 0.5) * n
      let valor
      if (u >= -2 && v >= -2 && u < n + 2 && v < n + 2) {
        const dentro = u >= 0 && v >= 0 && u < n && v < n && modulos[Math.floor(v) * n + Math.floor(u)]
        valor = dentro ? 30 : 215
      } else {
        valor = 95 + 35 * Math.sin(px / 37) * Math.cos(py / 29)
      }
      y[py * W + px] = Math.max(0, Math.min(255, valor + (azar() - 0.5) * 8))
    }
  }
  const uv = Buffer.alloc((W / 2) * (H / 2), 128)
  trozos.push(Buffer.from('FRAME\n'), y, uv, uv)
}
writeFileSync(salida, Buffer.concat(trozos))
console.log(`vídeo de ${FOTOGRAMAS} fotogramas ${W}×${H} con «${payload}» (${n} módulos) en ${salida}`)

// Varias capturas del modo `avatar` con los modelos cargados UNA vez: node shoot_multi.mjs <guion.json>
// guion: { query, w, h, shots: [{ out, poner?: [acc, items, look, v, t], vista?: [view, az], eval? }] }
import { chromium } from '../../node_modules/playwright/index.mjs'
import fs from 'node:fs'
import './serve4.mjs'
const V = (process.env.SHOOT_OUT || new URL('../../out/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')) + '/'
fs.mkdirSync(V + 'm4', { recursive: true })
const G = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const b = await chromium.launch({ args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
try {
  const ctx = await b.newContext({ viewport: { width: G.w, height: G.h }, deviceScaleFactor: 1 })
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('[err]', e.stack.slice(0, 600))); p.on('console', m => { if (m.type() === 'error') console.log('[c]', m.text().slice(0, 300)) })
  await p.goto(`http://127.0.0.1:8768/index4.html?${G.query}&w=${G.w}&h=${G.h}&dpr=1`); await p.waitForFunction('window.__ready', null, { timeout: 180000 })
  for (const s of G.shots) {
    if (s.poner) await p.evaluate(a => window.__poner(...a), s.poner)
    if (s.vista) await p.evaluate(a => window.__vista(...a), s.vista)
    if (s.eval) console.log(JSON.stringify(await p.evaluate(s.eval)))
    await p.evaluate('window.__shot()'); await p.screenshot({ path: V + 'm4/' + s.out, type: 'jpeg', quality: 88 }); console.log('ok', s.out)
  }
} finally { await b.close(); process.exit(0) }

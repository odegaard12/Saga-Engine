import { chromium } from '../../node_modules/playwright/index.mjs'
import fs from 'node:fs'
import './serve4.mjs'
// Capturas: SHOOT_OUT (por defecto sim/playwright-bench/out/mixamo4/, ignorado por git).
const V = (process.env.SHOOT_OUT || new URL('../../out/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')) + '/'
fs.mkdirSync(V + 'm4', { recursive: true })
const task = process.argv[2], arg = process.argv.slice(3)
const b = await chromium.launch({ args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const U = q => `http://127.0.0.1:8768/index4.html?${q}`
async function page(ctx, q, w, h, dpr = 2) { const p = await ctx.newPage(); p.on('console', m => console.log('[c]', m.text().slice(0, 500))); p.on('pageerror', e => console.log('[err]', e.stack.slice(0, 600))); await p.setViewportSize({ width: w, height: h }); await p.goto(U(`${q}&w=${w}&h=${h}&dpr=${dpr}`)); await p.waitForFunction('window.__ready', null, { timeout: 180000 }); return p }
try {
  if (task === 'shot') { // shot <out> <query> <w> <h> [eval] [dpr]
    const dpr = +(arg[5] || 2); const ctx = await b.newContext({ viewport: { width: +arg[2], height: +arg[3] }, deviceScaleFactor: dpr })
    const p = await page(ctx, arg[1], +arg[2], +arg[3], dpr); await p.waitForTimeout(300); if (arg[4]) console.log(JSON.stringify(await p.evaluate(arg[4]))); await p.evaluate('window.__shot&&window.__shot()'); await p.screenshot({ path: V + 'm4/' + arg[0], type: 'jpeg', quality: 90 })
  } else if (task === 'frames') { // frames <dir> <query> <w> <h> <n> <fps>
    const dir = V + arg[0]; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true })
    const w = +arg[2], h = +arg[3], n = +arg[4], fps = +arg[5]
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }); const p = await page(ctx, arg[1] + '&manual=1', w, h, 1)
    for (let i = 0; i < n; i++) { const done = await p.evaluate(`window.__adv(1/${fps})`); await p.screenshot({ path: dir + '/f' + String(i).padStart(4, '0') + '.jpg', type: 'jpeg', quality: 88 }); if (done) { console.log('done at', i); break } } console.log('frames ok')
  }
} finally { await b.close(); process.exit(0) }

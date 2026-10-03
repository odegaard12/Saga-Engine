import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const aqui = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const three = path.resolve(aqui, '../../../../frontend/node_modules/three')
// Carpeta de trabajo de los activos Mixamo (FUERA del repo, con licencia propia): out/ (GLB optimizados) y m4/ (hold_<Ch>.glb, anims). Ver LEEME.md.
const MX = process.env.MIXAMO_DIR || path.resolve(aqui, '../../../../assets_privados/mixamo-trabajo')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' }
export const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0])
  const f = u.startsWith('/three/') ? path.join(three, u.slice(7)) : u.startsWith('/mx/') ? path.join(MX, 'out', u.slice(4)) : u.startsWith('/m4/') ? path.join(MX, 'm4', u.slice(4)) : path.join(aqui, u === '/' ? 'index4.html' : u)
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end('nf ' + f); return } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(d) })
}).listen(8768, '127.0.0.1')

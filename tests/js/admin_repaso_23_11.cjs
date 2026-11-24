// 23/11/2026: repaso del panel. La validación del laberinto de equilibrio acepta hasta 25×25 (los niveles del motor son 21-25),
// y la inicial del avatar elige tinta blanca u oscura para leerse (AA) sobre cualquier color de fondo.
// Lo comprueba tests/test_admin_repaso_23_11.py.
'use strict'
const fs = require('fs')
const path = require('path')
const { crearCargador } = require('./cargarTs.cjs')

const cargar = crearCargador({ Math, Date })
const u = cargar('src/admin/components/guided-editor/guidedEditorUtils.ts')
const base = { grid_rows: 11, grid_cols: 11, time_limit_s: 150, lives: 3 }
const out = {
  once: u.isValidTiltMazeConfig(base),
  veintiuno: u.isValidTiltMazeConfig({ ...base, grid_rows: 21, grid_cols: 21 }),
  veinticinco: u.isValidTiltMazeConfig({ ...base, grid_rows: 25, grid_cols: 25 }),
  veintiseis: u.isValidTiltMazeConfig({ ...base, grid_rows: 26, grid_cols: 26 }),
  cuatro: u.isValidTiltMazeConfig({ ...base, grid_rows: 4, grid_cols: 4 }),
}

// tintaSobre sale de PlayersPanel.tsx (no se exporta): se extrae la función del texto y se prueba tal cual.
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'admin', 'components', 'PlayersPanel.tsx'), 'utf8')
const m = /function tintaSobre\(fondo: string\): string \{[\s\S]*?\n\}\r?\n/.exec(src)
const js = m[0].replace('(fondo: string): string', '(fondo)').replace(/\(i\) =>/, '(i) =>')
const tintaSobre = new Function(js + '; return tintaSobre')()
const lum = (h) => { const v = [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2] }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const peores = []
for (const f of ['#06b6d4', '#3fa7a0', '#c46b9a', '#7d8a99', '#b08850', '#14b8a6', '#eab308', '#b45309', '#1e293b', '#ffffff', '#000000', '#ff0000', '#808080', '#767676', '#777777']) {
  const t = tintaSobre(f)
  peores.push([f, t, +ratio(f, t === '#fff' ? '#ffffff' : t).toFixed(2)])
}
out.tinta = peores
out.tintaMala = tintaSobre('rojo')
console.log(JSON.stringify(out))

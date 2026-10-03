import { THREE } from './stage.js'
export const FING = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
export const armNames = S => { const a = [`mixamorig${S}Shoulder`, `mixamorig${S}Arm`, `mixamorig${S}ForeArm`, `mixamorig${S}Hand`]; for (const f of FING) for (let j = 1; j <= 3; j++) a.push(`mixamorig${S}Hand${f}${j}`); return a }
export const GROUPS = {
  lower: ['mixamorigHips', ...['Left', 'Right'].flatMap(S => [`mixamorig${S}UpLeg`, `mixamorig${S}Leg`, `mixamorig${S}Foot`, `mixamorig${S}ToeBase`])],
  spine: ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'],
  head: ['mixamorigNeck', 'mixamorigHead'],
  armL: armNames('Left'), armR: armNames('Right') }
export const GROUP_OF = {}; for (const g in GROUPS) for (const b of GROUPS[g]) GROUP_OF[b] = g
const boneOf = t => t.name.split('.')[0]

// recorta escala y deja solo la posicion de la cadera (reescalada al personaje)
export function prep(src, hi) {
  const c = src.clone(); c.tracks = c.tracks.filter(t => !/\.scale$/.test(t.name))
  c.tracks = c.tracks.map(t => { if (!/\.position$/.test(t.name)) return t; if (!/Hips\.position$/.test(t.name)) return null
    const v = t.values, n = v.length / 3, out = new Float32Array(v.length), y0 = v[1]
    for (let i = 0; i < n; i++) { const dy = v[i * 3 + 1] - y0; out[i * 3] = hi.rest.x + hi.d.x * dy; out[i * 3 + 1] = hi.rest.y + hi.d.y * dy; out[i * 3 + 2] = hi.rest.z + hi.d.z * dy }
    return new THREE.VectorKeyframeTrack(t.name, t.times, out) }).filter(Boolean)
  return c
}
// sub-clip con los grupos pedidos
export function sub(c, groups, name) {
  const o = c.clone(); o.tracks = c.tracks.filter(t => groups.includes(GROUP_OF[boneOf(t)])); o.name = name || c.name; return o
}
// pose estatica (primer fotograma) como clip de 1 s
export function freeze(c, t0 = 0, name) {
  const tr = c.tracks.map(t => { const n = t.getValueSize(); const i = Math.max(0, t.times.findIndex(x => x >= t0)); const v = Array.from(t.values.slice(i * n, i * n + n)); return new t.constructor(t.name, [0, 1], [...v, ...v]) })
  return new THREE.AnimationClip(name || c.name + '_f', 1, tr)
}

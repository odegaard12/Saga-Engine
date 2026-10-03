// Aligera los hold_<Ch>.glb que salen de Blender para llevarlos al móvil (~1 MB -> ~285 KB cada uno):
// sólo canales de ROTACIÓN de los huesos que cubre cada objeto (lo único que usa motor.js: recorta
// escala y posición, y filtra por grupo), animaciones remuestreadas, texturas WebP 256 y meshopt.
//
//   node optimizar_hold.mjs <carpeta con hold_<Ch>.glb> <carpeta de salida>
//
// Necesita @gltf-transform/{core,extensions,functions}, meshoptimizer y sharp (se instalan donde se ejecute;
// no son dependencias del repo).
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { textureCompress, prune, dedup, weld, meshopt, resample } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const [entrada, salida] = process.argv.slice(2)
if (!entrada || !salida) throw new Error('uso: node optimizar_hold.mjs <entrada> <salida>')
await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
fs.mkdirSync(salida, { recursive: true })

const lado = (S) => new RegExp('^mixamorig:' + S + '(Shoulder|Arm|ForeArm|Hand|Hand(Thumb|Index|Middle|Ring|Pinky)[123])$')
const CUBRE = {
  bordon: [lado('Right')],
  paraguas: [lado('Right')],
  cesta: [lado('Left')],
  gaita: [lado('Left'), lado('Right'), /^mixamorig:(Neck|Head)$/],
}

for (const f of fs.readdirSync(entrada).filter((x) => /^hold_Ch\d+\.glb$/.test(x))) {
  const d = await io.read(path.join(entrada, f))
  for (const a of d.getRoot().listAnimations()) {
    const objeto = a.getName().split('_')[1]
    for (const c of a.listChannels()) {
      const hueso = c.getTargetNode().getName()
      if (c.getTargetPath() !== 'rotation' || !CUBRE[objeto].some((r) => r.test(hueso))) {
        a.removeChannel(c)
        c.dispose()
      }
    }
    const usados = new Set(a.listChannels().map((c) => c.getSampler()))
    for (const s of a.listSamplers()) {
      if (!usados.has(s)) {
        a.removeSampler(s)
        s.dispose()
      }
    }
  }
  await d.transform(dedup(), prune(), resample(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 78 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  await io.write(path.join(salida, f), d)
  console.log(f, (fs.statSync(path.join(salida, f)).size / 1024).toFixed(0) + ' KB')
}

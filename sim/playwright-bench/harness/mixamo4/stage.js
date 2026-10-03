import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import * as SU from 'three/addons/utils/SkeletonUtils.js'
export { THREE, SU }
export const V3 = THREE.Vector3, Q4 = THREE.Quaternion, M4 = THREE.Matrix4

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
export const load = u => new Promise((ok, no) => loader.load(u, ok, undefined, no))

export function initStage(P) {
  const W = +P.get('w') || 1280, H = +P.get('h') || 720
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false }); r.setPixelRatio(+P.get('dpr') || 2); r.setSize(W, H)
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.appendChild(r.domElement)
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfd3df); scene.fog = new THREE.Fog(0xbfd3df, 25, 70)
  scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(r), 0.04).texture; scene.environmentIntensity = 0.55
  const key = new THREE.DirectionalLight(0xffe4bd, 2.1), fill = new THREE.DirectionalLight(0xa9c9ff, 0.9), rim = new THREE.DirectionalLight(0xd6ecff, 1.4)
  key.position.set(3.5, 6, 4.5); fill.position.set(-5, 2.5, 2.5); rim.position.set(-1.5, 3.5, -6)
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; key.shadow.radius = 4
  const sh = key.shadow.camera; Object.assign(sh, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 })
  scene.add(key, key.target, fill, rim)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x8a9a74, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
  // adoquines sencillos para ver el avance
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#8a9a74'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(40,60,30,.35)'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke() }
  const gt = new THREE.CanvasTexture(cv); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(200, 200); gt.colorSpace = THREE.SRGBColorSpace; ground.material.map = gt
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 150); scene.add(cam)
  const orbit = (t, d, az, el) => { cam.position.set(t.x + d * Math.sin(az) * Math.cos(el), t.y + d * Math.sin(el), t.z + d * Math.cos(az) * Math.cos(el)); cam.lookAt(t) }
  return { r, scene, cam, key, fill, rim, ground, W, H, orbit, sh }
}

const bases = {}
export async function baseModel(id, tier = '1024') {
  if (bases[id + tier]) return bases[id + tier]
  const gl = await load(`/mx/${id}_${tier}.glb`); const m = gl.scene; bases[id + tier] = m
  m.updateMatrixWorld(true); let h; m.traverse(n => { if (n.name === 'mixamorigHips') h = n })
  const inv = h.parent.matrixWorld.clone().invert(), d = new V3(0, 1, 0).applyMatrix4(inv).sub(new V3(0, 0, 0).applyMatrix4(inv))
  m.userData.hips = { rest: h.position.clone(), d }
  return m
}

export function cloneModel(id, tier = '1024') {
  const model = SU.clone(bases[id + tier]); model.userData.hips = bases[id + tier].userData.hips
  const bones = {}, meshes = []
  model.traverse(n => { if (n.isBone) bones[n.name] = n
    if (n.isSkinnedMesh) { n.frustumCulled = false; n.castShadow = true; n.receiveShadow = true
      const mats = [].concat(n.material).map(m => m.clone()); n.material = Array.isArray(n.material) ? mats : mats[0]
      for (const m of mats) { const nm = n.name + ' ' + m.name; const hair = /lash|hair|beard|brow/i.test(nm)
        if (hair) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.side = THREE.DoubleSide } else { m.transparent = false; m.alphaTest = 0; m.depthWrite = true; m.side = THREE.FrontSide }
        m.envMapIntensity = 0.5; m.metalness = 0; m.roughness = Math.max(m.roughness, 0.8); m.roughnessMap = null; m.metalnessMap = null }
      meshes.push(n) } })
  model.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(model, true); model.scale.multiplyScalar(1.75 / Math.max(b.max.y - b.min.y, 1e-4))
  model.updateMatrixWorld(true)
  return { model, bones, meshes }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))

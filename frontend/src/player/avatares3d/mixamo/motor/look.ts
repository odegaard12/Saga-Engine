/* eslint-disable */
// @ts-nocheck
// GENERADO por frontend/scripts/portar-motor-mixamo.mjs a partir de
// sim/playwright-bench/harness/mixamo4/look.js. NO se edita a mano: se vuelve a generar.
// Tinte de la ropa y el pelo por shader: matiz/saturacion/valor, color base con mezcla y tartan procedural.
// Un material tintado conserva el sombreado de la textura original (luminancia) y cambia solo el color.
import { THREE } from './stage'

export function look(m, p) {
  if (!m.userData.rc) { const U = m.userData.rc = { hue: { value: 0 }, sat: { value: 1 }, val: { value: 1 }, tint: { value: new THREE.Color('#fff') }, amt: { value: 0 }, plA: { value: new THREE.Color() }, plB: { value: new THREE.Color() }, plC: { value: new THREE.Color() }, plO: { value: 0 }, plS: { value: 6 } }
    m.onBeforeCompile = s => { Object.assign(s.uniforms, { uHue: U.hue, uSat: U.sat, uVal: U.val, uTint: U.tint, uAmt: U.amt, uPlA: U.plA, uPlB: U.plB, uPlC: U.plC, uPlO: U.plO, uPlS: U.plS })
      s.fragmentShader = 'uniform float uHue,uSat,uVal,uAmt,uPlO,uPlS;uniform vec3 uTint,uPlA,uPlB,uPlC;\n' + s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; vec3 k = vec3(0.57735); float cs = cos(uHue), sn = sin(uHue);
        c = c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat) * uVal;
        vec3 base = uTint;
        #ifdef USE_MAP
        if (uPlO > 0.5) { vec2 f = fract(vMapUv * uPlS);
          float A = clamp(smoothstep(0.17,0.13,abs(f.x-0.25)) + smoothstep(0.17,0.13,abs(f.y-0.25)),0.,1.) * 0.62;
          float B = clamp(smoothstep(0.07,0.045,abs(f.x-0.62)) + smoothstep(0.07,0.045,abs(f.y-0.62)),0.,1.) * 0.75;
          float C = clamp(smoothstep(0.02,0.012,abs(f.x-0.86)) + smoothstep(0.02,0.012,abs(f.y-0.86)),0.,1.) * 0.9;
          base = mix(base, uPlA, A); base = mix(base, uPlB, B); base = mix(base, uPlC, C); base *= 0.93 + 0.07 * sin((vMapUv.x + vMapUv.y) * uPlS * 40.0); }
        #endif
        vec3 tg = base * (0.12 + 1.15 * sqrt(max(l, 0.0)));
        diffuseColor.rgb = mix(c, tg, uAmt); }`) }
    m.customProgramCacheKey = () => 'rc3'; m.needsUpdate = true }
  const U = m.userData.rc; p = p || {}
  U.hue.value = (p.hue || 0) * Math.PI / 180; U.sat.value = p.sat ?? 1; U.val.value = p.val ?? 1; U.tint.value.set(p.tint || '#ffffff'); U.amt.value = p.amt || 0
  U.plO.value = p.plaid ? 1 : 0; if (p.plaid) { U.plA.value.set(p.plaid.a); U.plB.value.set(p.plaid.b); U.plC.value.set(p.plaid.c); U.plS.value = p.plaid.s || 6 }
}

// Tinte de la ropa y el pelo por shader: matiz/saturacion/valor, color base con mezcla y tartan procedural.
// Un material tintado conserva el sombreado de la textura original (luminancia) y cambia solo el color.
//
// Dos extras en el mismo programa:
//  - SEGUNDO TINTE por vertice (`aRopa`, 0 = arriba, 1 = abajo): una prenda que es UNA sola malla con dos partes
//    (la sudadera con pantalon corto de Ch02) lleva el color de camiseta arriba y el de pantalon abajo.
//  - RECORTE del pelo bajo un tocado: el pelo que queda dentro del tocado (por encima de su borde y dentro de su
//    contorno) no se pinta. Asi no atraviesa gorros ni cascos en ningun personaje, y el que asoma por debajo del
//    borde (patillas, nuca, coletas) se sigue viendo. El recorte va en el espacio del tocado (`uClipM`), que sigue
//    a la cabeza en cada fotograma.
import { THREE } from './stage.js'

const PLAID = `
        #ifdef USE_MAP
        if (uPlO > 0.5) { vec2 f = fract(vMapUv * uPlS);
          float A = clamp(smoothstep(0.17,0.13,abs(f.x-0.25)) + smoothstep(0.17,0.13,abs(f.y-0.25)),0.,1.) * 0.62;
          float B = clamp(smoothstep(0.07,0.045,abs(f.x-0.62)) + smoothstep(0.07,0.045,abs(f.y-0.62)),0.,1.) * 0.75;
          float C = clamp(smoothstep(0.02,0.012,abs(f.x-0.86)) + smoothstep(0.02,0.012,abs(f.y-0.86)),0.,1.) * 0.9;
          base = mix(base, uPlA, A); base = mix(base, uPlB, B); base = mix(base, uPlC, C); base *= 0.93 + 0.07 * sin((vMapUv.x + vMapUv.y) * uPlS * 40.0); }
        #endif`

function uniforms() {
  const set = () => ({ hue: { value: 0 }, sat: { value: 1 }, val: { value: 1 }, tint: { value: new THREE.Color('#fff') }, amt: { value: 0 }, plA: { value: new THREE.Color() }, plB: { value: new THREE.Color() }, plC: { value: new THREE.Color() }, plO: { value: 0 }, plS: { value: 6 } })
  return { a: set(), b: set(), dos: { value: 0 }, clipOn: { value: 0 }, clipM: { value: new THREE.Matrix4() }, clipR: { value: new THREE.Vector3(1, 0, 1) } }
}

function preparar(m) {
  if (m.userData.rc) return m.userData.rc
  const U = m.userData.rc = uniforms()
  m.onBeforeCompile = s => {
    const A = U.a, B = U.b
    Object.assign(s.uniforms, { uHue: A.hue, uSat: A.sat, uVal: A.val, uTint: A.tint, uAmt: A.amt, uPlA: A.plA, uPlB: A.plB, uPlC: A.plC, uPlO: A.plO, uPlS: A.plS,
      uHue2: B.hue, uSat2: B.sat, uVal2: B.val, uTint2: B.tint, uAmt2: B.amt, uPlA2: B.plA, uPlB2: B.plB, uPlC2: B.plC, uPlO2: B.plO, uPlS2: B.plS,
      uDos: U.dos, uClipOn: U.clipOn, uClipM: U.clipM, uClipR: U.clipR })
    s.vertexShader = 'uniform mat4 uClipM; uniform float uDos; varying vec3 vRcP; varying float vRopa;\n#ifdef RC_DOS\nattribute float aRopa;\n#endif\n' + s.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
      vRcP = (uClipM * vec4(transformed, 1.0)).xyz;
      #ifdef RC_DOS
      vRopa = aRopa * uDos;
      #else
      vRopa = 0.0;
      #endif`)
    const una = (suf) => `{ vec3 c = diffuseColor.rgb; vec3 k = vec3(0.57735); float cs = cos(uHue${suf}), sn = sin(uHue${suf});
        c = c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat${suf}) * uVal${suf};
        vec3 base = uTint${suf};` + PLAID.replaceAll('uPlO', 'uPlO' + suf).replaceAll('uPlS', 'uPlS' + suf).replaceAll('uPlA', 'uPlA' + suf).replaceAll('uPlB', 'uPlB' + suf).replaceAll('uPlC', 'uPlC' + suf) + `
        vec3 tg = base * (0.12 + 1.15 * sqrt(max(l, 0.0)));
        rc${suf || '1'} = mix(c, tg, uAmt${suf}); }`
    s.fragmentShader = 'uniform float uHue,uSat,uVal,uAmt,uPlO,uPlS,uHue2,uSat2,uVal2,uAmt2,uPlO2,uPlS2,uClipOn;uniform vec3 uTint,uPlA,uPlB,uPlC,uTint2,uPlA2,uPlB2,uPlC2,uClipR;varying vec3 vRcP;varying float vRopa;\n' +
      s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (uClipOn > 0.5 && vRcP.y > uClipR.y && (vRcP.x * vRcP.x) / (uClipR.x * uClipR.x) + (vRcP.z * vRcP.z) / (uClipR.z * uClipR.z) < 1.0) discard;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 rc1 = diffuseColor.rgb, rc2 = diffuseColor.rgb;
        ${una('')}
        if (vRopa > 0.001) ${una('2')}
        diffuseColor.rgb = mix(rc1, rc2, clamp(vRopa, 0.0, 1.0)); }`)
  }
  m.customProgramCacheKey = () => 'rc4' + (m.defines && m.defines.RC_DOS ? 'd' : '')
  m.needsUpdate = true
  return U
}

function poner(S, p) {
  p = p || {}
  S.hue.value = (p.hue || 0) * Math.PI / 180; S.sat.value = p.sat ?? 1; S.val.value = p.val ?? 1; S.tint.value.set(p.tint || '#ffffff'); S.amt.value = p.amt || 0
  S.plO.value = p.plaid ? 1 : 0; if (p.plaid) { S.plA.value.set(p.plaid.a); S.plB.value.set(p.plaid.b); S.plC.value.set(p.plaid.c); S.plS.value = p.plaid.s || 6 }
}

/** Tinte de una prenda. Con `abajo` (y una malla con `aRopa`), la parte de abajo lleva su propio tinte. */
export function look(m, p, abajo) {
  const U = preparar(m)
  poner(U.a, p)
  if (abajo !== undefined && m.defines && m.defines.RC_DOS) { poner(U.b, abajo); U.dos.value = 1 } else U.dos.value = 0
}

/** Marca un material para el segundo tinte por vertice (antes de compilarlo). */
export function lookDoble(m) { m.defines = Object.assign({}, m.defines, { RC_DOS: 1 }); preparar(m); m.needsUpdate = true }

/** Recorte del pelo bajo un tocado: `M` lleva del espacio de la malla al del tocado; `r` = (semieje x, altura de corte, semieje z). */
export function recortar(m, M, r) {
  const U = preparar(m)
  if (!M) { U.clipOn.value = 0; return }
  U.clipOn.value = 1; U.clipM.value.copy(M); U.clipR.value.copy(r)
}

"""Gorra (y gorro de lana) modelados en Blender y exportados como geometría para el motor (19/10/2026).

Los tocados hechos sólo con código («la gorra es feísima»: una cúpula con un ala plana) no se parecen a una gorra de
verdad. Aquí se modela cada uno con su forma (paneles, visera curvada con grosor, botón, vuelta del gorro de lana),
se aplican los modificadores (subdivisión, grosor) y se escribe `../gorros.js` con posiciones, normales, UV, índices y
grupos de material. El motor (acc.js) lo escala al elipsoide que envuelve la cabeza Y EL PELO de cada personaje.

Marco de la pieza (el de los tocados del motor): origen en el centro del borde, +Y arriba, +Z delante, +X izquierda del
personaje; la copa mide 1 de radio en el borde y 1 de alto. En Blender se construye con Z arriba e Y delante y se
pasa al exportar (x, z, y).

Uso:  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P gorros.py
"""
import json
import math
import os

import bmesh
import bpy

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '..', 'gorros.js')


def objeto(nombre, bm):
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nombre, me)
    bpy.context.collection.objects.link(ob)
    return ob


def aplicar(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def suave(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def rejilla(bm, filas, uv, cerrada, nv):
    """Caras entre filas de vértices (con UV de 0 a 1)."""
    nu = len(filas[0])
    tramos = nu if cerrada else nu - 1
    for j in range(len(filas) - 1):
        for i in range(tramos):
            i2 = (i + 1) % nu
            f = bm.faces.new((filas[j][i], filas[j][i2], filas[j + 1][i2], filas[j + 1][i]))
            for lo, (uu, vv) in zip(f.loops, ((i / tramos, j / nv), ((i + 1) / tramos, j / nv), ((i + 1) / tramos, (j + 1) / nv), (i / tramos, (j + 1) / nv))):
                lo[uv].uv = (uu, vv)


def tapar(bm, fila, punto, uv):
    nu = len(fila)
    tapa = bm.verts.new(punto)
    for i in range(nu):
        f = bm.faces.new((fila[i], fila[(i + 1) % nu], tapa))
        for lo in f.loops:
            lo[uv].uv = ((i + .5) / nu, 1)


# ---------------------------------------------------------------- gorra
def copa_gorra():
    """Copa de seis paneles: media esfera algo más alta y abombada delante (el frontal armado), con un surco fino en
    cada costura (las líneas y el pespunte van además en la textura)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    nu, nv = 48, 12
    filas = []
    for j in range(nv + 1):
        v = j / nv
        ang = v * math.pi / 2
        fila = []
        for i in range(nu):
            t = i / nu * 2 * math.pi
            delante = max(0.0, math.cos(t))
            r = math.cos(ang) * (1.0 + 0.03 * delante * (1 - v))
            z = math.sin(ang) * (0.84 + 0.08 * delante)
            fase = (t + math.pi / 6) % (math.pi / 3)
            costura = min(fase, math.pi / 3 - fase)
            surco = 0.012 * max(0.0, 1 - costura / 0.04) * (1 - v) if v > 0.02 else 0.0
            fila.append(bm.verts.new((math.sin(t) * r * (1 - surco), math.cos(t) * r * (1 - surco), z * (1 - surco * 0.5))))
        filas.append(fila)
    rejilla(bm, filas, uv, True, nv)
    tapar(bm, filas[-1], (0, 0, 0.9), uv)
    bm.normal_update()
    ob = objeto('copa', bm)
    suave(ob)
    so = ob.modifiers.new('grosor', 'SOLIDIFY')
    so.thickness = 0.03
    so.offset = 1
    aplicar(ob)
    return ob


def visera_gorra():
    """Visera: media luna delante, curvada hacia abajo por los lados (la «U» de una gorra usada) y con grosor."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    nu, nv = 24, 6
    medio = 1.42
    filas = []
    for j in range(nv + 1):
        v = j / nv
        fila = []
        for i in range(nu + 1):
            t = (i / nu - .5) * medio
            r = 1.0 + v * 0.72 * math.cos(t * 1.1) ** 1.2
            caida = -0.02 - v * 0.1 - abs(math.sin(t)) * v * 0.12
            fila.append(bm.verts.new((math.sin(t) * r * (1 - v * 0.06), math.cos(t) * r, caida)))
        filas.append(fila)
    rejilla(bm, filas, uv, False, nv)
    bm.normal_update()
    ob = objeto('visera', bm)
    suave(ob)
    so = ob.modifiers.new('grosor', 'SOLIDIFY')
    so.thickness = 0.045
    so.offset = 0
    so.use_even_offset = True
    aplicar(ob)
    return ob


def boton_gorra():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.09)
    bmesh.ops.scale(bm, vec=(1, 1, 0.45), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0.02, 0.91), verts=bm.verts)
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for lo in f.loops:
            lo[uv].uv = (lo.vert.co.x * 2 + .5, lo.vert.co.y * 2 + .5)
    ob = objeto('boton', bm)
    suave(ob)
    return ob


def cinta_gorra():
    """La cinta de sudor por dentro del borde (se ve desde abajo y en la miniatura)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    n = 48
    filas = [[bm.verts.new((math.sin(i / n * 2 * math.pi) * rr, math.cos(i / n * 2 * math.pi) * rr, z)) for i in range(n)]
             for rr, z in ((0.975, 0.0), (0.97, 0.12))]
    rejilla(bm, filas, uv, True, 1)
    ob = objeto('cinta', bm)
    suave(ob)
    return ob


# ---------------------------------------------------------------- gorro de lana
def gorro_lana():
    """Gorro de punto: copa redondeada que se ciñe y una vuelta doblada en el borde; el canalé va en relieve."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    nu, nv = 64, 12
    filas = []
    for j in range(nv + 1):
        v = j / nv
        ang = v * math.pi / 2
        fila = []
        for i in range(nu):
            t = i / nu * 2 * math.pi
            canale = 1 + 0.012 * math.cos(t * 32) * (1 - v) ** 0.5
            r = math.cos(ang) * canale
            fila.append(bm.verts.new((math.sin(t) * r, math.cos(t) * r, math.sin(ang) * 0.98)))
        filas.append(fila)
    rejilla(bm, filas, uv, True, nv)
    tapar(bm, filas[-1], (0, 0, 0.98), uv)
    nr = 6
    vuelta = []
    for j in range(nr + 1):
        s = j / nr
        fila = []
        for i in range(nu):
            t = i / nu * 2 * math.pi
            r = (1.0 + 0.028 * math.sin(s * math.pi) + 0.01) * (1 + 0.014 * math.cos(t * 32))
            fila.append(bm.verts.new((math.sin(t) * r, math.cos(t) * r, -0.02 + s * 0.3)))
        vuelta.append(fila)
    rejilla(bm, vuelta, uv, True, nr)
    bm.normal_update()
    ob = objeto('gorro', bm)
    suave(ob)
    so = ob.modifiers.new('grosor', 'SOLIDIFY')
    so.thickness = 0.025
    so.offset = 1
    aplicar(ob)
    return ob


# ---------------------------------------------------------------- exportar
def datos(obs):
    """Malla triangulada e INDEXADA (vértices iguales en posición, normal y UV se comparten), un grupo por objeto:
    posiciones (x, z, y), normales, UV, índices y grupos. Tres decimales: la pieza mide ~1 y se escala a la cabeza."""
    pos, nrm, uvs, idx, grupos = [], [], [], [], []
    vistos = {}
    for ob in obs:
        me = ob.data
        me.calc_loop_triangles()
        uvl = me.uv_layers.active.data if me.uv_layers.active else None
        ini = len(idx)
        for tri in me.loop_triangles:
            for k, li in enumerate(tri.loops):
                co = me.vertices[tri.vertices[k]].co
                no = tri.split_normals[k]
                u = uvl[li].uv if uvl else (0, 0)
                clave = (round(co.x, 3), round(co.z, 3), round(co.y, 3), round(no[0], 2), round(no[2], 2), round(no[1], 2), round(u[0], 3), round(u[1], 3))
                n = vistos.get(clave)
                if n is None:
                    n = vistos[clave] = len(pos) // 3
                    pos += clave[0:3]
                    nrm += clave[3:6]
                    uvs += clave[6:8]
                idx.append(n)
        grupos.append([ini, len(idx) - ini, ob.name])
    return {'pos': pos, 'nrm': nrm, 'uv': uvs, 'idx': idx, 'grupos': grupos}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    gorra = [copa_gorra(), visera_gorra(), boton_gorra(), cinta_gorra()]
    lana = [gorro_lana()]
    salida = {'GORRA': datos(gorra), 'GORRO_LANA': datos(lana)}
    with open(SALIDA, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// GENERADO por blender/gorros.py (Blender). NO se edita a mano: se vuelve a generar.\n')
        f.write('// Gorra y gorro de lana en el marco de los tocados (borde en y=0, +z delante, radio 1 y alto 1).\n')
        for k, v in salida.items():
            f.write(f'export const {k} = {json.dumps(v, separators=(",", ":"))}\n')
    print('gorros:', {k: len(v['idx']) // 3 for k, v in salida.items()}, 'triangulos ->', os.path.abspath(SALIDA))


main()

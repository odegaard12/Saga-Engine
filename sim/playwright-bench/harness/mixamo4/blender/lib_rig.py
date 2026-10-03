# Utilidades comunes: rig mixamo en espacio armadura (metros; x izquierda del personaje, y arriba, z delante)
import bpy, math, sys, os, json
from mathutils import Vector, Matrix, Quaternion, Euler

PFX = 'mixamorig12:'          # prefijo en Blender tras importar el FBX
OUT = 'mixamorig:'            # prefijo en los GLB que consume three.js
SC = 0.01                      # cm -> m


def basis_from(f, n):
    f = f.normalized(); n = (n - f * n.dot(f)).normalized(); k = f.cross(n)
    return Matrix(((f.x, n.x, k.x), (f.y, n.y, k.y), (f.z, n.z, k.z)))


def cols(a, b, c):
    return Matrix(((a.x, b.x, c.x), (a.y, b.y, c.y), (a.z, b.z, c.z)))


def frame_zx(z, x):
    """columnas (X, Y, Z) con Z=z exacto y X lo mas cercano a x."""
    z = z.normalized(); x = (x - z * x.dot(z)).normalized(); y = z.cross(x)
    return cols(x, y, z)


def lookup(m3, loc=None):
    m = m3.to_4x4()
    if loc is not None: m.translation = loc
    return m


def swing_twist(q, axis):
    p = Vector((q.x, q.y, q.z)); pr = axis * p.dot(axis)
    tw = Quaternion((q.w, pr.x, pr.y, pr.z))
    if tw.magnitude < 1e-9: tw = Quaternion((1, 0, 0, 0))
    tw.normalize(); sw = q @ tw.inverted(); return sw, tw


class Rig:
    def __init__(self, arm):
        self.arm = arm
        bones = arm.data.bones
        self.order = []
        def walk(b):
            self.order.append(b.name)
            for c in b.children: walk(c)
        for b in bones:
            if b.parent is None: walk(b)
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.rest = {}
        for b in bones:
            m = b.matrix_local.copy(); m.translation = m.translation * SC; self.rest[b.name] = m
        self.rel = {}
        for n in self.order:
            p = self.parent[n]
            self.rel[n] = (self.rest[p].inverted() @ self.rest[n]) if p else self.rest[n].copy()
        self.q = {n: Quaternion((1, 0, 0, 0)) for n in self.order}
        self.cache = {}

    def reset(self):
        for n in self.order: self.q[n] = Quaternion((1, 0, 0, 0))
        self.cache = {}

    def pose(self, n):
        c = self.cache.get(n)
        if c is not None: return c
        p = self.parent[n]
        m = self.rel[n] @ self.q[n].to_matrix().to_4x4()
        if p: m = self.pose(p) @ m
        self.cache[n] = m; return m

    def pos(self, n): return self.pose(n).translation.copy()
    def rot(self, n): return self.pose(n).to_3x3()

    def set_rot(self, n, R3):
        p = self.parent[n]
        Pr = self.pose(p).to_3x3() if p else Matrix.Identity(3)
        Rr = self.rel[n].to_3x3()
        b = Rr.inverted() @ Pr.inverted() @ R3
        self.q[n] = b.to_quaternion().normalized(); self.cache = {}

    def rotate(self, n, axis, ang):
        self.set_rot(n, Matrix.Rotation(ang, 3, axis) @ self.rot(n))

    def snapshot(self, names=None):
        return {n: self.q[n].copy() for n in (names or self.order)}

    def restore(self, snap):
        for n, q in snap.items(): self.q[n] = q.copy()
        self.cache = {}


def find_arm():
    return [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]


def load_char(S, ch):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=f'{S}/src/chars/{ch}_nonPBR.fbx', automatic_bone_orientation=False, ignore_leaf_bones=True)
    arm = find_arm()
    import re
    for b in arm.data.bones: b.name = re.sub(r'^mixamorig\d*:', PFX, b.name)
    for o in bpy.data.objects:
        if o.type == 'MESH':
            for g in o.vertex_groups: g.name = re.sub(r'^mixamorig\d*:', PFX, g.name)
    return arm


def skin_table(arm, obj, wanted):
    """vertices de obj cuyo hueso dominante esta en 'wanted': [(pos_reposo_m, [(hueso, peso)])]"""
    vg = {g.index: g.name for g in obj.vertex_groups}
    M = arm.matrix_world.inverted() @ obj.matrix_world
    out = []
    for v in obj.data.vertices:
        ws = sorted([(g.weight, vg[g.group]) for g in v.groups if g.group in vg], reverse=True)
        if not ws or ws[0][1] not in wanted: continue
        out.append(((M @ v.co) * SC, [(b, w) for w, b in ws[:4]]))
    return out


def skin_pos(rig, entry):
    p, ws = entry; acc = Vector((0, 0, 0)); tot = 0
    for b, w in ws:
        m = rig.pose(b) @ rig.rest[b].inverted()
        acc += (m @ p) * w; tot += w
    return acc / tot if tot else p


def rest_mesh_points(arm, objs, filt=None):
    """vertices en reposo (espacio armadura, m) de varias mallas; filt(obj)->bool"""
    out = []
    for o in objs:
        if filt and not filt(o): continue
        M = arm.matrix_world.inverted() @ o.matrix_world
        out.append((o.name, [(M @ v.co) * SC for v in o.data.vertices]))
    return out

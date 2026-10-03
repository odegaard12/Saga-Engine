import bpy, sys, math, random
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_rig import *
S = sys.argv[sys.argv.index('--')+1]; ch = sys.argv[sys.argv.index('--')+2]
arm = load_char(S, ch)
rig = Rig(arm)
print('rotmode', {pb.rotation_mode for pb in arm.pose.bones})
bpy.context.view_layer.update()
# FK en reposo
err = 0
for n in rig.order:
    pb = arm.pose.bones[n]; m = pb.matrix.copy(); m.translation *= SC
    err = max(err, (m.translation - rig.pose(n).translation).length, (m.to_3x3() - rig.pose(n).to_3x3()).median_absolute if False else 0)
print('FK rest err', err)
random.seed(3)
for n in ['mixamorig12:RightArm', 'mixamorig12:RightForeArm', 'mixamorig12:RightHand', 'mixamorig12:RightHandIndex1', 'mixamorig12:Spine1', 'mixamorig12:Neck']:
    q = Quaternion((random.random(), random.random()*.5, random.random()*.5, random.random()*.5)).normalized()
    rig.q[n] = q; arm.pose.bones[n].rotation_mode = 'QUATERNION'; arm.pose.bones[n].rotation_quaternion = q
rig.cache = {}
bpy.context.view_layer.update()
err = 0
for n in rig.order:
    pb = arm.pose.bones[n]; m = pb.matrix.copy(); m.translation *= SC
    err = max(err, (m.translation - rig.pose(n).translation).length, max(abs(a - b) for ra, rb in zip(m.to_3x3(), rig.pose(n).to_3x3()) for a, b in zip(ra, rb)))
print('FK posed err', err)
rig.reset()
# marcas
for n in ['Hips', 'Spine2', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3', 'LeftHand', 'LeftArm']:
    print('P', n, tuple(round(v, 3) for v in rig.pos(PFX + n)))
print('MESHES', [(o.name, len(o.data.vertices), [g.name for g in o.vertex_groups][:2]) for o in bpy.data.objects if o.type == 'MESH'])
# tamaño de cuerpo
body = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('_Body')][0]
pts = rest_mesh_points(arm, [body])[0][1]
print('body bbox', min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts), min(p.z for p in pts), max(p.z for p in pts))
try:
    import numpy; print('numpy', numpy.__version__)
except Exception as e: print('nonumpy')


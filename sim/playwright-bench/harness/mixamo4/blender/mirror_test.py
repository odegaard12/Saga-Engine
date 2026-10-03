import bpy, sys, math, os, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_rig import *
S = sys.argv[sys.argv.index('--')+1]
arm = load_char(S, 'Ch01')
for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
rig = Rig(arm)
# clip de prueba (muy asimetrico)
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=S + '/src/anims/ge__happy_hand_gesture.fbx', automatic_bone_orientation=False, ignore_leaf_bones=True)
a2 = [o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE'][0]
act = a2.animation_data.action
fr0, fr1 = act.frame_range
sc = bpy.context.scene
def short(n): return n.split(':', 1)[1]
def pose_at(f):
    sc.frame_set(int(f)); bpy.context.view_layer.update()
    return {short(pb.name): pb.rotation_quaternion.copy() for pb in a2.pose.bones}
def swap(n): return n.replace('Left', 'TMP').replace('Right', 'Left').replace('TMP', 'Right')
opts = {'yz': lambda q: Quaternion((q.w, q.x, -q.y, -q.z)), 'xz': lambda q: Quaternion((q.w, -q.x, q.y, -q.z)), 'xy': lambda q: Quaternion((q.w, -q.x, -q.y, q.z)), 'none': lambda q: q.copy(), 'conj': lambda q: Quaternion((q.w, -q.x, -q.y, -q.z))}
best = {}
for f in (fr0 + (fr1 - fr0) * k / 6 for k in range(1, 6)):
    P = pose_at(f)
    rig.reset()
    for n, q in P.items():
        if PFX + n in rig.q: rig.q[PFX + n] = q.copy()
    rig.cache = {}
    ref = {n: rig.pos(PFX + n) for n in ('RightHand', 'LeftHand', 'RightForeArm', 'LeftForeArm', 'RightHandMiddle3', 'LeftHandMiddle3')}
    for name, T in opts.items():
        rig.reset()
        for n, q in P.items():
            m = swap(n)
            if PFX + m in rig.q: rig.q[PFX + m] = T(q)
        rig.cache = {}
        # espejo: la mano izq ahora debe estar donde estaba la dcha pero con x invertida
        e = 0
        for a, b in (('RightHand', 'LeftHand'), ('RightForeArm', 'LeftForeArm'), ('RightHandMiddle3', 'LeftHandMiddle3'), ('LeftHand', 'RightHand'), ('LeftHandMiddle3', 'RightHandMiddle3')):
            pa = ref[a]; pb_ = rig.pos(PFX + b); pa = Vector((-pa.x, pa.y, pa.z)); e += (pa - pb_).length
        best[name] = best.get(name, 0) + e
print('MIRROR', {k: round(v, 3) for k, v in best.items()})

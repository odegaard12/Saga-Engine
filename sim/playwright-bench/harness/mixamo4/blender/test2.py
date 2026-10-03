import bpy, sys, math, random, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_rig import *
S = sys.argv[sys.argv.index('--')+1]; ch = sys.argv[sys.argv.index('--')+2]
arm = load_char(S, ch)
rig = Rig(arm)
bpy.context.view_layer.update()
for n in ['mixamorig12:Hips', 'mixamorig12:Spine', 'mixamorig12:Spine2', 'mixamorig12:RightHand']:
    pb = arm.pose.bones[n]; b = arm.data.bones[n]
    print('DBG', n, 'pbhead', tuple(round(v, 4) for v in pb.head), 'ml', tuple(round(v, 4) for v in b.matrix_local.translation), 'pbmat', tuple(round(v, 4) for v in pb.matrix.translation), 'mine', tuple(round(v*100, 4) for v in rig.pos(n)))
print('Hips rel', rig.rel['mixamorig12:Hips'])
print('Spine rel', rig.rel['mixamorig12:Spine'])
print('Spine local', arm.data.bones['mixamorig12:Spine'].matrix_local)
print('Hips local', arm.data.bones['mixamorig12:Hips'].matrix_local)
print('arm world', arm.matrix_world)

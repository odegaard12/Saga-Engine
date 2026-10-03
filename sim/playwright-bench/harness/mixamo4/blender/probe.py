import bpy, sys, math
from mathutils import Vector
S = sys.argv[sys.argv.index('--')+1]
ch = sys.argv[sys.argv.index('--')+2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=f'{S}/src/chars/{ch}_nonPBR.fbx', automatic_bone_orientation=False, ignore_leaf_bones=True)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
print('ARM', arm.name, tuple(arm.location), tuple(arm.rotation_euler), tuple(arm.scale), arm.rotation_mode)
for o in bpy.data.objects:
    print('OBJ', o.name, o.type, o.parent.name if o.parent else None, tuple(round(v, 3) for v in o.scale))
bpy.context.view_layer.update()
print('ALL',[b.name for b in arm.data.bones][:8])
for n in ['mixamorig12:Hips', 'mixamorig12:Spine2', 'mixamorig12:Head', 'mixamorig12:RightHand', 'mixamorig12:RightHandMiddle1', 'mixamorig12:RightHandIndex1', 'mixamorig12:RightHandPinky1', 'mixamorig12:RightForeArm', 'mixamorig12:RightArm', 'mixamorig12:RightHandThumb1']:
    pb = arm.pose.bones[n]
    wh = arm.matrix_world @ pb.head
    print('BONE', n, tuple(round(v, 4) for v in pb.head), 'world', tuple(round(v, 3) for v in wh), 'quatlocal', tuple(round(v, 3) for v in pb.bone.matrix_local.to_quaternion()))
print('BONES', [b.name for b in arm.data.bones if 'Right' not in b.name and 'Left' not in b.name])
print('RHAND', [b.name for b in arm.data.bones if 'RightHand' in b.name])




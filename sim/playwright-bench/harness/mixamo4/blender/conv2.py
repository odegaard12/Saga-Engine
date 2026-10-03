# convierte FBX de animacion (rig mixamo) a un GLB de clips: python conv2.py -- <S> <salida.glb> <prefijo> <lista.json|dir> [fps]
import bpy, sys, os, glob, re, json
S, OUTF, PRE, SRC = sys.argv[sys.argv.index('--')+1:sys.argv.index('--')+5]
LOCK = True
files = json.load(open(SRC)) if SRC.endswith('.json') else sorted(glob.glob(SRC + '/*.fbx'))
bpy.ops.wm.read_factory_settings(use_empty=True)
base = None; names = []
def slug(p):
    n = os.path.splitext(os.path.basename(p))[0].lower()
    return re.sub(r'[^a-z0-9]+', '_', n).strip('_')
for f in files:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=f, automatic_bone_orientation=False, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before]
    arm = [o for o in new if o.type == 'ARMATURE'][0]
    act = arm.animation_data.action
    nm = PRE + slug(f)
    act.name = nm
    fps = bpy.context.scene.render.fps
    for fc in [fc for l in act.layers for st_ in l.strips for cb in st_.channelbags for fc in cb.fcurves]:
        if LOCK and fc.data_path.endswith('Hips"].location') and fc.array_index in (0, 2):
            v = fc.keyframe_points[0].co[1]
            for k in fc.keyframe_points:
                k.co[1] = v; k.handle_left[1] = v; k.handle_right[1] = v
    if base is None:
        base = arm
        for b in base.data.bones: b.name = re.sub(r'^mixamorig\d*:', 'mixamorig:', b.name)
        for o in new:
            if o.type != 'ARMATURE': bpy.data.objects.remove(o)
    else:
        for o in new: bpy.data.objects.remove(o)
    # renombrar los canales al prefijo comun
    for fc in [fc for l in act.layers for st_ in l.strips for cb in st_.channelbags for fc in cb.fcurves]:
        fc.data_path = re.sub(r'mixamorig\d*:', 'mixamorig:', fc.data_path)
    act.use_fake_user = True
    names.append((nm, fps, act.frame_range[0], act.frame_range[1]))
    ad = base.animation_data_create()
    tr = ad.nla_tracks.new(); tr.name = nm
    st = tr.strips.new(nm, int(act.frame_range[0]), act); st.name = nm
    ad.action = None
bpy.ops.export_scene.gltf(filepath=OUTF, export_format='GLB', export_animation_mode='NLA_TRACKS', export_yup=True, export_force_sampling=True)
print('CONV2', names)

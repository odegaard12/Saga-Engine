import bpy, sys, os, glob, json
S = sys.argv[sys.argv.index('--')+1]
files = sorted(glob.glob(S + '/src2/**/*.fbx', recursive=True))
res = []
for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.fbx(filepath=f, automatic_bone_orientation=False, ignore_leaf_bones=True)
    except Exception as e:
        res.append({'f': os.path.relpath(f, S), 'err': str(e)[:80]}); continue
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    r = {'f': os.path.relpath(f, S).replace('\\', '/'), 'arms': len(arms), 'meshes': len([o for o in bpy.data.objects if o.type == 'MESH'])}
    if arms:
        a = arms[0]; r['nb'] = len(a.data.bones); r['bones0'] = [b.name for b in a.data.bones][:3]
        ad = a.animation_data
        act = ad.action if ad else None
        if act:
            fr = act.frame_range; r['frames'] = [round(fr[0]), round(fr[1])]; r['fps'] = bpy.context.scene.render.fps
            r['dur'] = round((fr[1] - fr[0]) / bpy.context.scene.render.fps, 2)
            n = set()
            for l in act.layers:
                for st in l.strips:
                    for cb in st.channelbags:
                        for fc in cb.fcurves: n.add(fc.data_path.split('"')[1] if '"' in fc.data_path else fc.data_path)
            r['animbones'] = len(n); r['fingers'] = any('Index' in x or 'Thumb' in x for x in n)
            hips = [x for x in n if x.endswith('Hips') or x.endswith('Hip') or 'Pelvis' in x]
            r['hips'] = hips[:1]
    res.append(r)
json.dump(res, open(S + '/src2/inventory.json', 'w'), indent=0)
print('INV DONE', len(res))

import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, items_lib; importlib.reload(items_lib)
from items_lib import *
OUTF = sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
items = []
r, _ = build_bordon(); items.append(r)
r, _ = build_paraguas(); items.append(r)
r, _ = build_cesta(); items.append(r)
r, _ = build_gaita_body(); items.append(r)
r, _ = build_blowpipe(0.26); items.append(r)
for i, r in enumerate(items):
    r.rotation_euler = (PI / 2, 0, 0); r.location = (i * 1.3, 0, 0.7)
bpy.ops.export_scene.gltf(filepath=OUTF, export_format='GLB', export_yup=True, export_apply=True)
print('ITEMS OK', [o.name for o in bpy.data.objects if o.type == 'MESH'][:80])


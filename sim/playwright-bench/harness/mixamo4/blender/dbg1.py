import bpy, sys, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_rig import *
from lib_hand import *
S = sys.argv[sys.argv.index('--')+1]
arm = load_char(S, 'Ch01')
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0)
rig = Rig(arm); hd = Hand(rig, 'R')
print('B0', [tuple(round(x, 3) for x in c) for c in (hd.B0.col[0], hd.B0.col[1], hd.B0.col[2])], 'hs', hd.hs, 'det', hd.det)
hd.sg = hd.curl_dir(); print('sg', hd.sg)
for fn in ('Index', 'Middle'):
    for c in (0, 0.5, 1.0, 1.3):
        pts = hd.finger_pts(fn, c)
        print('DBG', fn, c, [tuple(round(x, 3) for x in p) for p in pts])
th = [hd.to_local(rig.pos(b)) for b in hd.fj['Thumb']]
print('thumb', [tuple(round(x, 3) for x in p) for p in th])

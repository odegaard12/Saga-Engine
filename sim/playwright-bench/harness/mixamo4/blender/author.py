# Autoria de agarres, poses de sujecion y sockets. blender -b --python author.py -- <S> <Ch> <outdir> [items]
import bpy, sys, os, math, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lib_rig, lib_hand, items_lib
for m in (lib_rig, lib_hand, items_lib): importlib.reload(m)
from lib_rig import *
from lib_hand import *
import items_lib as IL

argv = sys.argv[sys.argv.index('--') + 1:]
S, CH, OUTD = argv[0], argv[1], argv[2]
WANT = argv[3].split(',') if len(argv) > 3 else ['bordon', 'paraguas', 'cesta', 'gaita']
VERB = True
cos, sin, pi = math.cos, math.sin, math.pi
V = Vector
RAD = math.radians


def dbg(*a):
    if VERB: print('A>', *a)


arm = load_char(S, CH)
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
if arm.animation_data: arm.animation_data_clear()
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
body = [o for o in meshes if o.name.endswith('_Body')][0]
rig = Rig(arm)
wanted = set(PFX + s + 'Hand' + x for s in ('Left', 'Right') for x in ('', 'Thumb1', 'Thumb2', 'Thumb3', 'Index1', 'Index2', 'Index3', 'Middle1', 'Middle2', 'Middle3', 'Ring1', 'Ring2', 'Ring3', 'Pinky1', 'Pinky2', 'Pinky3'))
skin_hands = skin_table(arm, body, wanted)
H = {'L': Hand(rig, 'L', skin_hands), 'R': Hand(rig, 'R', skin_hands)}
rig.reset()
SH = {'L': rig.pos(H['L'].arm), 'R': rig.pos(H['R'].arm)}
reach_full = (rig.pos(H['R'].fore) - SH['R']).length + (rig.pos(H['R'].hand) - rig.pos(H['R'].fore)).length
KA = reach_full / 0.483
# puntos de la malla (cuerpo y ropa, sin pelo) para colisiones y marcas
BODYPTS = []
for nm_, vs in rest_mesh_points(arm, [o for o in meshes if not re.search('(?i)hair|lash', o.name)]):
    BODYPTS.extend(vs)
SKINPTS = dict(rest_mesh_points(arm, [body]))[body.name]
dbg(CH, 'ka', round(KA, 3), 'reach', round(reach_full, 3), 'hs', H['R'].hs, H['L'].hs, 'pts', len(BODYPTS))

# ------------------------------------------------------------------ definicion de los objetos
ITEMS = {
    'bordon':   dict(hand='R', r=0.0175, mode='wrap', xref='nback', thumb=(0.9, -0.4), pole=V((-0.45, -1, -0.55))),
    'paraguas': dict(hand='R', r=0.0155, mode='wrap', xref='f', thumb=(0.9, -0.4), pole=V((-0.35, -1, -0.45))),
    'cesta':    dict(hand='L', r=0.0115, mode='wrap', xref='f', thumb=(0.9, -0.4), pole=V((0.30, -1, -0.50))),
    'gaitaL':   dict(hand='L', r=0.0135, mode='wrap', xref='f', thumb=(0.9, -0.2), pole=V((1.0, -0.6, -0.7))),
    'gaitaR':   dict(hand='R', r=0.0135, mode='wrap', xref='f', thumb=(0.9, -0.2), pole=V((-0.9, -0.5, -0.6))),
}
FINGER_BONES = lambda side: [b for fn in FN + ['Thumb'] for b in H[side].fj[fn]]
ARM_BONES = lambda side: [H[side].shoulder, H[side].arm, H[side].fore, H[side].hand] + FINGER_BONES(side)


def xref_hf(kind, hd):
    return {'nback': V((0, -1, 0)), 'f': V((1, 0, 0)), 'n': V((0, 1, 0))}[kind]


def item_hand_frame(hd, kind, s=-1):
    """ejes del objeto (X hacia fuera, Y eje de agarre) en componentes (f,n,k) de la mano"""
    Y = V((0, 0, s)); X = xref_hf(kind, hd); X = (X - Y * X.dot(Y)).normalized()
    Z = X.cross(Y) * hd.det
    return cols(X, Y, Z)


def hand_frame_target(hd, a, n_t):
    k = (-a).normalized(); n = (n_t - k * n_t.dot(k)).normalized()
    f = n.cross(k) if hd.hs > 0 else k.cross(n)
    return cols(f.normalized(), n, k)


FITS = {}


def fit_item(name):
    cfg = ITEMS[name]; hd = H[cfg['hand']]; rig.reset(); hd.clear_fingers()
    fit = fit_cylinder(hd, cfg['r'], cfg['mode'], skin=skin_hands, verbose=True)
    C = fit['C']
    td = cfg['thumb']; tn = math.hypot(*td); fit_thumb(hd, C, cfg['r'], (td[0] / tn, td[1] / tn), verbose=True)
    fq = {b: rig.q[b].copy() for b in FINGER_BONES(cfg['hand'])}
    dbg(name, 'metrics', grip_metrics(hd, skin_hands, C, cfg['r']))
    FITS[name] = dict(C=C, fq=fq, Mi_hf=item_hand_frame(hd, cfg['xref']), cfg=cfg)
    rig.reset()
    return FITS[name]


def sh(side, off):
    """punto relativo al hombro, escalado a la longitud de brazo"""
    return SH[side] + V(off) * KA


def apply_pose(name, spec, clav=0.0):
    out = {}
    for side, p in spec.items():
        hd = H[side]; fit = FITS[name]
        Bt = hand_frame_target(hd, p['a'], p['n'])
        W = p['G'] - Bt @ fit['C']
        for b, q in fit['fq'].items(): rig.q[b] = q.copy()
        rig.cache = {}
        info = solve_arm(hd, W, Bt, p.get('pole', ITEMS[name]['pole']), clav=p.get('clav', clav))
        info['wrist'] = wrist_angles(hd)
        Mi = Bt @ fit['Mi_hf']
        out[side] = dict(info=info, M=Matrix.Translation(p['G']) @ Mi.to_4x4(), Bt=Bt)
    return out


def snapshot_bones(names):
    return {b: rig.q[b].copy() for b in names}


# ------------------------------------------------------------------ poses de bordon, paraguas y cesta
def bordon_pose(state, phi):
    c = cos(2 * pi * phi)
    if state == 'idle': off = (-0.07, -0.37, 0.27); pitch = 11
    elif state == 'walk': off = (-0.07, -0.37 + 0.012 * (1 - cos(4 * pi * phi)), 0.27 + 0.085 * c); pitch = 13 - 5 * c
    else: off = (-0.06, -0.31 + 0.03 * (1 - cos(4 * pi * phi)), 0.18 + 0.15 * c); pitch = 17 - 9 * c
    p = RAD(pitch)
    return {'R': dict(G=sh('R', off), a=V((0.02, cos(p), -sin(p))), n=V((1, -0.05, 0.25)))}


def paraguas_pose(state, phi):
    c = cos(2 * pi * phi)
    if state == 'idle': off = (0.0, -0.27, 0.31); tilt = 4
    elif state == 'walk': off = (0.0, -0.27 + 0.008 * (1 - cos(4 * pi * phi)), 0.31 + 0.03 * c); tilt = 4 + 1.5 * c
    else: off = (0.0, -0.25 + 0.02 * (1 - cos(4 * pi * phi)), 0.27 + 0.06 * c); tilt = 6 + 3 * c
    t = RAD(tilt)
    return {'R': dict(G=sh('R', off), a=V((0.22, 1, -sin(t))), n=V((1, 0.1, 0.1)))}


def cesta_pose(state, phi):
    c = cos(2 * pi * phi)
    if state == 'idle': off = (0.08, -0.545, 0.05)
    elif state == 'walk': off = (0.08, -0.545 + 0.006 * (1 - cos(4 * pi * phi)), 0.05 - 0.035 * c)
    else: off = (0.08, -0.50 + 0.02 * (1 - cos(4 * pi * phi)), 0.03 - 0.10 * c)
    return {'L': dict(G=sh('L', off), a=V((0, 0, 1)), n=V((-1, 0, 0)))}


POSES = {'bordon': bordon_pose, 'paraguas': paraguas_pose, 'cesta': cesta_pose}
SIMPLE = {'bordon': 'R', 'paraguas': 'R', 'cesta': 'L'}


def bake_simple(name, nframes=30):
    side = SIMPLE[name]; names = ARM_BONES(side); clips = {}; meta = {}
    nm_fit = name
    for state in ('idle', 'walk', 'run'):
        frames = []
        N = 1 if state == 'idle' else nframes
        for i in range(N + (0 if state == 'idle' else 1)):
            phi = i / N if state != 'idle' else 0.0
            rig.reset(); res = apply_pose(name, POSES[name](state, phi))
            frames.append((i, snapshot_bones(names)))
            if i == 0: meta[state] = {s: dict(reach=round(v['info']['reach'], 3), elbow=round(v['info']['elbow'], 1), wrist=[round(x, 1) for x in v['info']['wrist']]) for s, v in res.items()}
            if state == 'idle' and i == 0: meta['M'] = {s: v['M'] for s, v in res.items()}
        if state == 'idle': frames.append((nframes, {b: q.copy() for b, q in frames[0][1].items()}))
        clips[state] = frames
    return clips, meta


def fix_signs(clips):
    for state, frames in clips.items():
        prev = None
        for (i, d) in frames:
            if prev:
                for b, q in d.items():
                    if q.dot(prev[b]) < 0: q.negate()
            prev = d


# ------------------------------------------------------------------ gaita
GA, GB, GC = 0.215, 0.100, 0.082              # semiejes de la bolsa (z largo, y alto, x ancho)
G_SC = V((0.0, -0.020, 0.205)); G_CD = V((0.0, -0.95, 0.31)).normalized(); G_SB = V((0.0, 0.050, 0.188)); G_BD = V((0.0, 0.9, 0.35)).normalized()


def bag_depth(Mb_inv, p):
    q = Mb_inv @ p; v = (q.x / (GC * 0.97)) ** 2 + (q.y / (GB * 0.97)) ** 2 + (q.z / (GA * 0.97)) ** 2
    return v


def mouth_landmark():
    """boca (reposo) en espacio armadura: punta de la nariz -> labios"""
    rig.reset(); hp = rig.pos(PFX + 'Head')
    cand = [p for p in SKINPTS if abs(p.x) < 0.012 and p.y > hp.y - 0.02 and p.y < hp.y + 0.20 and p.z > hp.z]
    tip = max(cand, key=lambda p: p.z)
    ym = tip.y - 0.043
    face = [p for p in cand if abs(p.y - ym) < 0.004]
    zm = max(p.z for p in face) if face else tip.z - 0.02
    return V((0.0, ym, zm)), tip


def head_pose(roll=7.0, pitch=4.0):
    for b in (PFX + 'Neck', PFX + 'Head'): rig.q[b] = Quaternion((1, 0, 0, 0))
    rig.cache = {}
    rig.rotate(PFX + 'Neck', V((0, 0, 1)), RAD(roll * 0.4)); rig.rotate(PFX + 'Head', V((0, 0, 1)), RAD(roll * 0.6))
    rig.rotate(PFX + 'Neck', V((1, 0, 0)), RAD(pitch * 0.4)); rig.rotate(PFX + 'Head', V((1, 0, 0)), RAD(pitch * 0.6))


def gaita_plan():
    rig.reset()
    ml, tip = mouth_landmark(); dbg('mouth', tuple(round(v, 3) for v in ml), 'nose', tuple(round(v, 3) for v in tip))
    # mouth attached to Head bone
    hrest = rig.pose(PFX + 'Head').copy(); ml_local = hrest.inverted() @ ml
    head_pose(); mouth = rig.pose(PFX + 'Head') @ ml_local
    dbg('mouth posed', tuple(round(v, 3) for v in mouth))
    head_q = {b: rig.q[b].copy() for b in (PFX + 'Neck', PFX + 'Head')}
    rig.reset()
    torso = [p for p in BODYPTS if 1.00 < p.y < 1.45 and -0.15 < p.x < 0.55 and -0.25 < p.z < 0.40 and not (p.y > 1.36 and abs(p.x) > 0.2)]
    best = None
    shR = SH['R']
    for yaw in (-42.0, -52.0, -62.0):
        for pitch in (4.0, 9.0):
            R = Matrix.Rotation(RAD(yaw), 3, 'Y') @ Matrix.Rotation(RAD(pitch), 3, 'X')
            for cy in [1.16 + 0.02 * k for k in range(0, 8)]:
                for cz in [0.0 + 0.02 * k for k in range(0, 8)]:
                    for cx in [0.10 + 0.02 * k for k in range(0, 12)]:
                        Mb = Matrix.Translation(V((cx, cy, cz))) @ R.to_4x4()
                        F = Mb @ V((0, 0, GA)); B0 = Mb @ (G_SB + G_BD * 0.045); Lp = (mouth - B0).length
                        cdw = (R @ G_CD).normalized(); org = Mb @ (G_SC + G_CD * 0.04); hR = org + cdw * 0.14
                        rR = (hR - shR).length
                        cost = 4 * abs(F.x - 0.0) + 2 * abs(F.z - 0.26) + 8 * max(0, rR - 0.46) + 5 * max(0, Lp - 0.30) + 5 * max(0, 0.19 - Lp) + 0.3 * cx
                        if best is not None and cost >= best[0]: continue
                        Mi = Mb.inverted(); deep = 0
                        for p in torso:
                            if abs(p.x - cx) > 0.3 or abs(p.y - cy) > 0.16: continue
                            if bag_depth(Mi, p) < 0.80:
                                deep += 1
                                if deep > 4: break
                        if deep > 4: continue
                        best = (cost, cx, cy, cz, yaw, pitch, Lp, rR)
    if best is None: raise RuntimeError('no cabe la bolsa')
    _, cx, cy, cz, yaw, pitch, Lp, rR = best
    R = Matrix.Rotation(RAD(yaw), 3, 'Y') @ Matrix.Rotation(RAD(pitch), 3, 'X')
    Mb = Matrix.Translation(V((cx, cy, cz))) @ R.to_4x4()
    dbg('bag at', tuple(round(v, 3) for v in (cx, cy, cz)), 'yaw', yaw, 'pitch', pitch, 'pipe', round(Lp, 3), 'reachR', round(rR, 3), 'cost', round(best[0], 3))
    return dict(Mb=Mb, mouth=mouth, head_q=head_q, R=R)


_TH = {}
def torso_hash():
    if _TH: return _TH
    for p in BODYPTS:
        if abs(p.x) < 0.20 and 0.90 < p.y < 1.50:
            _TH.setdefault((int(p.x / 0.03), int(p.y / 0.03), int(p.z / 0.03)), []).append(p)
    return _TH


def torso_dist(p):
    th = torso_hash(); cx, cy, cz = int(p.x / 0.03), int(p.y / 0.03), int(p.z / 0.03); best = 9.0
    for i in range(-2, 3):
        for j in range(-2, 3):
            for k in range(-2, 3):
                for q in th.get((cx + i, cy + j, cz + k), ()):
                    d = (q - p).length
                    if d < best: best = d
    return best


def arm_collision(hd, Mb_inv, torso):
    """penalizacion de los segmentos del brazo contra la bolsa y el torso"""
    rig = hd.rig; pen = 0.0
    S_ = rig.pos(hd.arm); E_ = rig.pos(hd.fore); W_ = rig.pos(hd.hand)
    for a, b, rad, t0 in ((S_, E_, 0.040, 0.3), (E_, W_, 0.033, 0.0)):
        for t in [t0 + (1 - t0) * i / 6 for i in range(1, 7)]:
            p = a + (b - a) * t
            q = Mb_inv @ p; v = (q.x / (GC + rad)) ** 2 + (q.y / (GB + rad)) ** 2 + (q.z / (GA + rad)) ** 2
            if v < 1: pen += (1 - v)
            d = torso_dist(p)
            if d < rad: pen += 6 * (rad - d) / rad
    wa = wrist_angles(hd)
    pen += (abs(wa[0]) / 55) ** 2 + (abs(wa[1]) / 40) ** 2
    return pen


def gaita_build_poses(plan):
    Mb = plan['Mb']; Rb = Mb.to_3x3(); Mi = Mb.inverted()
    cd_w = (Rb @ G_CD).normalized()              # eje del punteiro hacia la campana (espacio armadura)
    org = Mb @ (G_SC + G_CD * 0.04)
    up = -cd_w
    spots = {'L': 0.055, 'R': 0.150}
    nt = {'L': V((-0.95, 0.05, 0.30)), 'R': V((0.95, 0.05, 0.30))}
    spec = {}
    for side in ('L', 'R'):
        G = org + cd_w * spots[side]
        spec[side] = dict(G=G, a=up, n=nt[side])
    return spec


def bake_gaita(plan, spec):
    names = ARM_BONES('L') + ARM_BONES('R') + [PFX + 'Neck', PFX + 'Head']
    # elegimos el codo izquierdo que no atraviese la bolsa
    Mi = plan['Mb'].inverted(); torso = []
    for side, nm_ in (('L', 'gaitaL'), ('R', 'gaitaR')):
        sgn = 1 if side == 'L' else -1
        best = None
        base = spec[side]
        for psi in (-70, -50, -30, -10, 10, 30, 50, 70):
            n0 = Matrix.Rotation(RAD(psi), 3, base['a']) @ base['n']
            for px in (0.3, 0.8, 1.4, 2.0):
                for py in (-1.0, -0.4, 0.2, 0.8):
                    for pz in (-1.4, -0.7, 0.0, 0.7):
                        pole = V((sgn * px, py, pz)); sp = dict(base); sp['pole'] = pole; sp['n'] = n0
                        rig.reset(); res = apply_pose(nm_, {side: sp})
                        pen = arm_collision(H[side], Mi, torso) + 20 * max(0, res[side]['info']['reach'] - 0.97) ** 2
                        d_el = torso_dist(rig.pos(H[side].fore)); pen += 800 * max(0, 0.085 - d_el) ** 2
                        if best is None or pen < best[0]: best = (pen, sp)
        dbg('arm', side, round(best[0], 3), 'pole', tuple(round(v, 2) for v in best[1]['pole']), 'n', tuple(round(v, 2) for v in best[1]['n']))
        spec[side] = best[1]
    rig.reset()
    resL = apply_pose('gaitaL', {'L': spec['L']}); resR = apply_pose('gaitaR', {'R': spec['R']})
    for b, q in plan['head_q'].items(): rig.q[b] = q.copy()
    rig.cache = {}
    snap = snapshot_bones(names)
    dbg('gaita L', {k: v for k, v in resL['L']['info'].items()}, 'R', {k: v for k, v in resR['R']['info'].items()})
    frames = [(0, snap), (30, {b: q.copy() for b, q in snap.items()})]
    clips = {st: [(i, {b: q.copy() for b, q in d.items()}) for i, d in frames] for st in ('idle', 'walk', 'run')}
    # pipa: el soprete va de la estopa a la boca
    B0 = plan['Mb'] @ (G_SB + G_BD * 0.045)
    to = plan['mouth'] - B0; L = to.length; d = to.normalized()
    dbg('pipe length', round(L, 3), 'dir', tuple(round(v, 2) for v in d))
    return clips, dict(pipe_base=B0, pipe_dir=d, pipe_len=L, Mb=plan['Mb'])


# ------------------------------------------------------------------ ejecucion
RESULT = {}
for nm in [n for n in WANT if n in SIMPLE]:
    fit_item(nm)
    clips, meta = bake_simple(nm)
    fix_signs(clips)
    RESULT[nm] = dict(kind='simple', clips=clips, meta=meta, cover=ARM_BONES(SIMPLE[nm]))
    dbg(nm, json.dumps({k: v for k, v in meta.items() if k != 'M'}))
if 'gaita' in WANT:
    fit_item('gaitaL'); fit_item('gaitaR')
    plan = gaita_plan(); spec = gaita_build_poses(plan)
    clips, meta = bake_gaita(plan, spec)
    fix_signs(clips)
    RESULT['gaita'] = dict(kind='gaita', clips=clips, meta=meta, cover=ARM_BONES('L') + ARM_BONES('R') + [PFX + 'Neck', PFX + 'Head'])

# ------------------------------------------------------------------ construccion de objetos y exportacion
for o in meshes: bpy.data.objects.remove(o, do_unlink=True)
for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0)
bpy.context.view_layer.update()
Wu = Matrix.Rotation(pi / 2, 4, 'X')
BUILD = {'bordon': IL.build_bordon, 'paraguas': IL.build_paraguas, 'cesta': IL.build_cesta}
rig.reset()
ad = arm.animation_data_create()
actions = []


def attach(root, bone, M_rest_world_arm):
    root.parent = arm; root.parent_type = 'BONE'; root.parent_bone = bone
    bpy.context.view_layer.update()
    root.matrix_world = Wu @ M_rest_world_arm


for nm, R in RESULT.items():
    for state, frames in R['clips'].items():
        act = bpy.data.actions.new('hold_%s_%s' % (nm, state)); act.use_fake_user = True; ad.action = act
        for (i, d) in frames:
            fr = 1 + i
            for b, q in d.items():
                pb = arm.pose.bones[b]; pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=fr)
        actions.append((act.name, 1, 1 + max(f for f, _ in frames)))
    ad.action = None
    for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0)
    rig.reset()
    if R['kind'] == 'simple':
        side = SIMPLE[nm]; hd = H[side]
        root, objs = BUILD[nm]()
        res = apply_pose(nm, POSES[nm]('idle', 0.0)); Hm = rig.pose(hd.hand).copy(); rel = Hm.inverted() @ res[side]['M']
        rig.reset()
        attach(root, hd.hand, rig.pose(hd.hand) @ rel)
        dbg(nm, 'socket rel loc', tuple(round(v, 4) for v in rel.translation))
    else:
        M = R['meta']
        root, objs = IL.build_gaita_body()
        attach(root, PFX + 'Spine2', M['Mb'])
        pipe, pobjs = IL.build_blowpipe(M['pipe_len'])
        d = M['pipe_dir']
        z = d.cross(V((0, 0, 1))); z = z if z.length > 1e-3 else V((1, 0, 0)); z.normalize(); x = d.cross(z).normalized()
        Mp = Matrix.Translation(M['pipe_base']) @ cols(x, d, z).to_4x4()
        attach(pipe, PFX + 'Spine2', Mp)
for pb in arm.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0)
ad = arm.animation_data
for nm, f0, f1 in actions:
    tr = ad.nla_tracks.new(); tr.name = nm; st = tr.strips.new(nm, f0, bpy.data.actions[nm]); st.name = nm
ad.action = None
for b in arm.data.bones: b.name = b.name.replace(PFX, OUT)
os.makedirs(OUTD, exist_ok=True)
outf = os.path.join(OUTD, 'hold_%s.glb' % CH)
bpy.ops.export_scene.gltf(filepath=outf, export_format='GLB', export_animation_mode='NLA_TRACKS', export_yup=True, export_force_sampling=True, export_apply=True)
print('AUTHOR OK', outf)

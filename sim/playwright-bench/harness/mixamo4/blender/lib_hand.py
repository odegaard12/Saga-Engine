# Mano, dedos y brazo sobre el Rig (espacio armadura, metros)
import math
from mathutils import Vector, Matrix, Quaternion
from lib_rig import *

FN = ['Index', 'Middle', 'Ring', 'Pinky']
D = math.pi / 180


class Hand:
    def __init__(self, rig, side, skin=None):
        self.rig = rig; self.side = side; S = 'Left' if side == 'L' else 'Right'; self.S = S
        self.p = PFX + S
        self.hand = self.p + 'Hand'; self.arm = self.p + 'Arm'; self.fore = self.p + 'ForeArm'; self.shoulder = self.p + 'Shoulder'
        self.fj = {fn: [self.p + 'Hand%s%d' % (fn, j) for j in (1, 2, 3)] for fn in FN + ['Thumb']}
        rig.reset()
        hp = rig.pos(self.hand); f0 = (rig.pos(self.fj['Middle'][0]) - hp).normalized()
        kc = rig.pos(self.fj['Pinky'][0]) - rig.pos(self.fj['Index'][0]); k0 = (kc - f0 * kc.dot(f0)).normalized()
        n0 = f0.cross(k0)
        if n0.y > 0: n0 = -n0
        n0 = (n0 - f0 * n0.dot(f0)); n0.normalize(); k0 = k0 - n0 * k0.dot(n0); k0.normalize()
        self.B0 = cols(f0, n0, k0); self.R0 = rig.rot(self.hand).copy()
        self.hs = 1 if k0.dot(f0.cross(n0)) > 0 else -1          # signo de la mano: k = hs * (f x n)
        self.det = 1 if self.B0.determinant() > 0 else -1
        self.rho = {}                                              # grosor de dedo medido
        if skin: self.measure_rho(skin)

    # ---- marco de la mano ----
    def frame(self):
        return self.rig.rot(self.hand) @ self.R0.inverted() @ self.B0

    def set_frame(self, B):
        self.rig.set_rot(self.hand, B @ self.B0.inverted() @ self.R0)

    def to_local(self, P, origin=None):
        o = origin if origin is not None else self.rig.pos(self.hand)
        d = P - o; B = self.B0
        return Vector((d.dot(B.col[0]), d.dot(B.col[1]), d.dot(B.col[2])))

    def measure_rho(self, skin):
        rig = self.rig; rig.reset()
        for fn in FN + ['Thumb']:
            js = self.fj[fn]
            for j in range(3):
                b = js[j]; a = rig.pos(b)
                nxt = rig.pos(js[j + 1]) if j < 2 else a + (a - rig.pos(js[j - 1])) * 0.85
                ax = nxt - a; L = ax.length; ax.normalize(); ds = []
                for (p, ws) in skin:
                    if ws[0][0] != b: continue
                    d = p - a; t = d.dot(ax)
                    if t < -0.003 or t > L + 0.003: continue
                    ds.append((d - ax * t).length)
                self.rho[b] = (sum(ds) / len(ds)) if len(ds) > 4 else 0.0075

    # ---- dedos ----
    def clear_fingers(self):
        for fn in FN + ['Thumb']:
            for b in self.fj[fn]: self.rig.q[b] = Quaternion((1, 0, 0, 0))
        self.rig.cache = {}

    def curl_dir(self):
        """signo de giro alrededor de k que cierra los dedos hacia la palma (+n)"""
        rig = self.rig; self.clear_fingers(); rig.reset()
        k = self.B0.col[2]; n = self.B0.col[1]
        t0 = rig.pos(self.fj['Index'][2]); b = self.fj['Index'][0]
        rig.rotate(b, k, 0.3); t1 = rig.pos(self.fj['Index'][2]); rig.reset()
        return 1 if (t1 - t0).dot(n) > 0 else -1

    def curl_finger(self, fn, c, ratios=(1.3, 1.6, 0.9), axis=None, sgn=None):
        rig = self.rig; k = axis if axis is not None else self.B0.col[2]
        sg = sgn if sgn is not None else self.sg
        for b, r in zip(self.fj[fn], ratios): rig.rotate(b, k, sg * c * r)

    def finger_pts(self, fn, c, ratios=(1.3, 1.6, 0.9)):
        rig = self.rig; self.clear_fingers(); self.curl_finger(fn, c, ratios)
        js = self.fj[fn]
        p1, p2, p3 = rig.pos(js[0]), rig.pos(js[1]), rig.pos(js[2])
        tip = p3 + (p3 - p2).normalized() * ((p3 - p2).length * 0.85)
        # el punto de contacto de cada falange es el centro del tramo
        return [self.to_local(x) for x in (p1, p2, p3, tip)]


def palm_surface(hd, skin):
    """n del borde de la palma (lado de agarre) en el marco local, en reposo"""
    hd.rig.reset(); ns = []
    for (p, ws) in skin:
        if ws[0][0] != hd.hand: continue
        q = hd.to_local(p)
        if 0.035 < q.x < 0.095 and abs(q.z) < 0.035: ns.append(q.y)
    ns.sort(); return ns[int(len(ns) * 0.93)] if ns else 0.018


def planar_finger(P2, C, R, lim=(1.75, 1.95, 1.45)):
    """dedo plano: P2 = [(f,n)] de J1,J2,J3,punta en reposo; busca los giros que dejan J2,J3,punta sobre circulos de radio R[i] alrededor de C"""
    a = [math.atan2(P2[i + 1][1] - P2[i][1], P2[i + 1][0] - P2[i][0]) for i in range(3)]
    l = [math.hypot(P2[i + 1][0] - P2[i][0], P2[i + 1][1] - P2[i][1]) for i in range(3)]
    pos = (P2[0][0], P2[0][1]); cur = 0.0; th = []; res = 0.0; ends = []
    def endp(i, t):
        ang = a[i] + cur + t; return (pos[0] + l[i] * math.cos(ang), pos[1] + l[i] * math.sin(ang))
    for i in range(3):
        st = 0.02; found = None; prev = 0.0
        e0 = endp(i, 0.0); d0 = math.hypot(e0[0] - C[0], e0[1] - C[1])
        if d0 <= R[i]:
            res += 60 * (R[i] - d0) ** 2; t = 0.0
        else:
            t = lim[i]; dd = None
            for s in range(1, int(lim[i] / st) + 1):
                tt = s * st; e = endp(i, tt); d = math.hypot(e[0] - C[0], e[1] - C[1])
                if d <= R[i]:
                    lo, hi = tt - st, tt
                    for _ in range(10):
                        mid = (lo + hi) / 2; em = endp(i, mid)
                        if math.hypot(em[0] - C[0], em[1] - C[1]) <= R[i]: hi = mid
                        else: lo = mid
                    t = hi; found = True; break
            if not found:
                e = endp(i, t); res += (math.hypot(e[0] - C[0], e[1] - C[1]) - R[i]) ** 2
        th.append(t); e = endp(i, t); cur += t; pos = e; ends.append(e)
    return th, res, ends


def fit_cylinder(hd, r, mode='wrap', fingers=FN, skin=None, verbose=False, cf=0.075):
    """centro C (f,n) del cilindro y giros (th1,th2,th3) de cada dedo; mano en reposo. Devuelve tambien las posiciones locales"""
    hd.sg = hd.curl_dir(); hd.clear_fingers(); hd.rig.reset()
    n_palm = palm_surface(hd, skin) if skin else 0.018
    rest = {}
    for fn in fingers:
        p = hd.finger_pts(fn, 0.0); rest[fn] = [(q.x, q.y) for q in p]; rest[fn + '_k'] = [q.z for q in p]
    rho = lambda fn, j: hd.rho.get(hd.fj[fn][j], 0.0075)
    best = (1e9, None)
    for i in range(20):
        for j in range(20):
            Cf = 0.045 + 0.003 * i; Cn = 0.0 + 0.003 * j + 0.012
            e = 400 * (Cn - r - n_palm) ** 2 + 4 * (Cf - cf) ** 2; ths = {}
            if Cn - r < n_palm - 0.003: continue
            for fn in fingers:
                R = [r + rho(fn, 1) * 1.0, r + rho(fn, 2) * 1.0, r + rho(fn, 2) * 0.8]
                th, res, ends = planar_finger(rest[fn], (Cf, Cn), R)
                e += res * 1.0 + 0.0008 * sum(t * t for t in th); ths[fn] = (th, ends)
            if e < best[0]: best = (e, (Cf, Cn, ths))
    e, (Cf, Cn, ths) = best
    kc = sum(rest[fn + '_k'][1] for fn in fingers) / len(fingers)
    hd.clear_fingers()
    for fn in fingers:
        for b, t in zip(hd.fj[fn], ths[fn][0]): hd.rig.rotate(b, hd.B0.col[2], hd.sg * t)
    if verbose: print('FIT', hd.side, 'C', (round(Cf, 4), round(Cn, 4), round(kc, 4)), 'npalm', round(n_palm, 4), {k: [round(t, 2) for t in v[0]] for k, v in ths.items()}, 'cost', round(e, 6))
    return {'C': Vector((Cf, Cn, kc)), 'th': {fn: ths[fn][0] for fn in fingers}, 'cost': e, 'npalm': n_palm}


def grip_metrics(hd, skin, C, r):
    """distancias reales de la piel de los dedos al cilindro: por dedo, hueco minimo y penetracion maxima"""
    rig = hd.rig; out = {}
    names = {}
    for fn in FN + ['Thumb']:
        for b in hd.fj[fn]: names[b] = fn
    names[hd.hand] = 'Palm'
    for (p, ws) in skin:
        b = ws[0][0]
        if b not in names: continue
        q = hd.to_local(skin_pos(rig, (p, ws)))
        if abs(q.z - C.z) > 0.035: continue
        d = math.hypot(q.x - C.x, q.y - C.y) - r
        o = out.setdefault(names[b], [9.0, 0.0, 0])
        o[0] = min(o[0], d); o[1] = max(o[1], -d); o[2] += 1
    return {k: (round(v[0], 4), round(v[1], 4), v[2]) for k, v in out.items()}


def fit_cylinder_old(hd, r, mode='wrap', cmax=1.3, ratios=(1.3, 1.6, 0.9), fingers=FN, f_range=(0.03, 0.14), n_range=(-0.005, 0.085), verbose=False):
    """encuentra el centro C (f,n) de un cilindro de radio r y el giro de cada dedo; mano en reposo"""
    hd.sg = hd.curl_dir()
    cs = [i * 0.025 for i in range(0, int(cmax / 0.025) + 1)]
    table = {fn: [(c, hd.finger_pts(fn, c, ratios)) for c in cs] for fn in fingers}
    hd.clear_fingers()
    rho = lambda fn, j: hd.rho.get(hd.fj[fn][j], 0.0075)
    best = (1e9, None)
    def cost_f(fn, c, pts, C):
        e = 0.0
        for j, w in ((1, 1.0), (2, 1.2), (3, 1.2)):
            P = pts[j]; d = math.hypot(P.x - C[0], P.y - C[1]); tgt = r + (rho(fn, min(j, 2)) if j < 3 else rho(fn, 2) * 0.8)
            if mode == 'pad':
                if j == 1: tgt += 0.006; w = 0.3
                if j == 2: tgt += 0.001
            diff = d - tgt
            e += w * diff * diff + (60 * diff * diff if diff < -0.001 else 0)
        # el nudillo no puede estar dentro
        P = pts[0]; d = math.hypot(P.x - C[0], P.y - C[1]); e += 30 * max(0, (r + rho(fn, 0) * 0.9) - d) ** 2
        return e + 0.0006 * c * c
    f0, f1 = f_range; n0_, n1 = n_range
    nf = int((f1 - f0) / 0.002) + 1; nn = int((n1 - n0_) / 0.002) + 1
    for i in range(nf):
        for j in range(nn):
            C = (f0 + i * 0.002, n0_ + j * 0.002); tot = 0.0; ch = {}
            for fn in fingers:
                bc, bv = None, 1e9
                for (c, pts) in table[fn]:
                    v = cost_f(fn, c, pts, C)
                    if v < bv: bv = v; bc = c
                tot += bv; ch[fn] = bc
            if tot < best[0]: best = (tot, (C, ch))
    tot, (C, ch) = best
    kc = sum(hd.finger_pts(fn, ch[fn], ratios)[1].z for fn in fingers) / len(fingers)
    hd.clear_fingers()
    for fn in fingers: hd.curl_finger(fn, ch[fn], ratios)
    if verbose: print('FIT', hd.side, 'C', tuple(round(v, 4) for v in C), {k: round(v, 2) for k, v in ch.items()}, 'cost', round(tot, 6), 'k', round(kc, 4))
    return {'C': Vector((C[0], C[1], kc)), 'curl': ch, 'cost': tot}


def fit_C_from_pose(hd, r, fingers=FN, f_range=(0.0, 0.16), n_range=(-0.05, 0.1)):
    """con los dedos ya doblados (p. ej. por un clip), centro C (f,n) del cilindro de radio r"""
    rig = hd.rig; rho = lambda fn, j: hd.rho.get(hd.fj[fn][j], 0.0075)
    pts = {}
    for fn in fingers:
        js = hd.fj[fn]; p1, p2, p3 = rig.pos(js[0]), rig.pos(js[1]), rig.pos(js[2]); tip = p3 + (p3 - p2).normalized() * ((p3 - p2).length * 0.85)
        pts[fn] = [hd.to_local(x) for x in (p1, p2, p3, tip)]
    best = (1e9, None)
    for i in range(int((f_range[1] - f_range[0]) / 0.002)):
        for j in range(int((n_range[1] - n_range[0]) / 0.002)):
            C = (f_range[0] + i * 0.002, n_range[0] + j * 0.002); e = 0
            for fn in fingers:
                for jj in (1, 2, 3):
                    P = pts[fn][jj]; d = math.hypot(P.x - C[0], P.y - C[1]); tgt = r + (rho(fn, min(jj, 2)) if jj < 3 else rho(fn, 2) * 0.8)
                    e += (d - tgt) ** 2 + (60 * (d - tgt) ** 2 if d - tgt < -0.001 else 0)
            if e < best[0]: best = (e, C)
    e, C = best; kc = sum(pts[fn][1].z for fn in fingers) / len(fingers)
    return {'C': Vector((C[0], C[1], kc)), 'cost': e}


def fit_thumb(hd, C, r, target_dir, iters=400, verbose=False):
    """el pulgar rodea el cilindro: pose por busqueda aleatoria (mano en reposo, dedos ya doblados).
    target_dir: vector (f,n) unitario desde C hacia el punto de contacto del pulgar"""
    import random
    rig = hd.rig; rnd = random.Random(5)
    t1, t2, t3 = hd.fj['Thumb']
    B = hd.B0; axes = [B.col[0], B.col[1], B.col[2]]
    rho_t = hd.rho.get(t3, 0.0075)
    tgt = Vector((C.x + target_dir[0] * (r + rho_t * 0.9), C.y + target_dir[1] * (r + rho_t * 0.9), C.z))
    def eval_(x):
        for b in (t1, t2, t3): rig.q[b] = Quaternion((1, 0, 0, 0))
        rig.cache = {}
        rig.rotate(t1, axes[0], x[0]); rig.rotate(t1, axes[1], x[1]); rig.rotate(t1, axes[2], x[2])
        # flexion de las falanges sobre un eje perpendicular al pulgar y a n: el de mejor encaje se elige entre los tres ejes
        ax = axes[int(x[5])]
        rig.rotate(t2, ax, x[3]); rig.rotate(t3, ax, x[4])
        tip = rig.pos(t3) + (rig.pos(t3) - rig.pos(t2)).normalized() * ((rig.pos(t3) - rig.pos(t2)).length * 0.85)
        pl = hd.to_local(tip); ipj = hd.to_local(rig.pos(t3))
        d = (pl - tgt); e = d.dot(d) + 0.25 * max(0.0, (r + rho_t) - math.hypot(ipj.x - C.x, ipj.y - C.y)) ** 2 * 10
        pen = 0.0
        for q in (pl, ipj, hd.to_local(rig.pos(t2))):
            dd = math.hypot(q.x - C.x, q.y - C.y); pen += max(0.0, (r + rho_t * 0.7) - dd) ** 2
        e += 30 * pen
        e += 0.0004 * (x[0] ** 2 + x[1] ** 2 + x[2] ** 2) + 0.0002 * (x[3] ** 2 + x[4] ** 2)
        return e
    best = None
    for axi in range(3):
        x = [0.0, 0.0, 0.0, 0.0, 0.0, float(axi)]; fx = eval_(x); step = 0.5
        for it in range(iters):
            y = list(x)
            for _ in range(2):
                i = rnd.randrange(5); y[i] += (rnd.random() - 0.5) * 2 * step
            for i in range(5): y[i] = max(-1.8, min(1.8, y[i]))
            fy = eval_(y)
            if fy < fx: x, fx = y, fy
            if it % 100 == 99: step *= 0.6
        if best is None or fx < best[0]: best = (fx, x)
    fx, x = best; eval_(x)
    if verbose: print('THUMB', hd.side, round(fx, 6), [round(v, 2) for v in x])
    return fx


# ---------------- brazo ----------------
def solve_arm(hd, W, Bt, pole, twist_share=0.5, clav=0.0):
    """coloca la muñeca en W y la mano con marco Bt (3x3). pole: direccion hacia la que apunta el codo"""
    rig = hd.rig
    for b in (hd.arm, hd.fore): rig.q[b] = Quaternion((1, 0, 0, 0))
    rig.q[hd.shoulder] = Quaternion((1, 0, 0, 0)); rig.cache = {}
    if clav:
        sgn = 1 if hd.side == 'L' else -1
        rig.rotate(hd.shoulder, Vector((0, 0, 1)), sgn * clav)
    S = rig.pos(hd.arm); E0 = rig.pos(hd.fore); Wr0 = rig.pos(hd.hand)
    l1 = (E0 - S).length; l2 = (Wr0 - E0).length
    dv = W - S; d = dv.length; reach = d / (l1 + l2)
    d = min(d, (l1 + l2) * 0.9995); d = max(d, abs(l1 - l2) + 1e-4); u = dv.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(0.0, l1 * l1 - a * a))
    pp = pole - u * pole.dot(u)
    if pp.length < 1e-4: pp = Vector((0, -1, 0))
    pp.normalize(); E = S + u * a + pp * h
    rig.set_rot(hd.arm, (E0 - S).rotation_difference(E - S).to_matrix() @ rig.rot(hd.arm))
    Wr1 = rig.pos(hd.hand); E1 = rig.pos(hd.fore)
    Wt = S + u * d
    rig.set_rot(hd.fore, (Wr1 - E1).rotation_difference(Wt - E1).to_matrix() @ rig.rot(hd.fore))
    # mano
    hd.set_frame(Bt)
    # reparto de la pronacion: parte del giro de la mano alrededor del antebrazo se pasa al antebrazo
    if twist_share:
        Rf = rig.rot(hd.fore); Rh = rig.rot(hd.hand)
        axis_w = (rig.pos(hd.hand) - rig.pos(hd.fore)).normalized()
        axis_l = Rf.inverted() @ axis_w
        rel = (Rf.inverted() @ Rh).to_quaternion()
        sw, tw = swing_twist(rel, axis_l.normalized())
        ang = 2 * math.atan2(Vector((tw.x, tw.y, tw.z)).dot(axis_l.normalized()), tw.w)
        if ang > math.pi: ang -= 2 * math.pi
        if ang < -math.pi: ang += 2 * math.pi
        if abs(ang) > 1e-4:
            rig.rotate(hd.fore, axis_w, ang * twist_share)
            hd.set_frame(Bt)
    return {'reach': reach, 'elbow': math.degrees(math.acos(max(-1, min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)))))}


def wrist_angles(hd):
    """desviacion del eje de la mano respecto al antebrazo: (flexion, desviacion) en grados"""
    rig = hd.rig; fa = (rig.pos(hd.hand) - rig.pos(hd.fore)).normalized(); B = hd.frame()
    f, n, k = B.col[0], B.col[1], B.col[2]
    return (math.degrees(math.atan2(fa.dot(n), fa.dot(f))) * -1, math.degrees(math.atan2(fa.dot(k), fa.dot(f))) * -1)

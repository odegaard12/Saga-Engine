# Modelado de los objetos en Blender (bmesh). Marco del objeto = marco armadura (x izquierda, y arriba, z delante), metros.
# El eje de agarre es +Y y la referencia "hacia fuera" es +X.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Quaternion
V = Vector
PI = math.pi

# ---------------- materiales ----------------
_mats = {}
def mat(name, rgb, rough=0.6, metal=0.0, img=None, emit=None, alpha=None):
    if name in _mats: return _mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    bsdf.inputs['Roughness'].default_value = rough; bsdf.inputs['Metallic'].default_value = metal
    if img is not None:
        tn = m.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img
        m.node_tree.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    _mats[name] = m; return m


def hexc(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    srgb = lambda v: ((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92
    return [srgb(v) for v in c]


def np_image(name, w, h, fn):
    import numpy as np
    arr = fn(w, h).astype('float32')           # h x w x 3 (sRGB 0..1)
    lin = np.where(arr > 0.04045, ((arr + 0.055) / 1.055) ** 2.4, arr / 12.92)
    rgba = np.ones((h, w, 4), dtype='float32'); rgba[..., :3] = lin
    img = bpy.data.images.new(name, w, h, alpha=False); img.pixels.foreach_set(rgba.ravel()); img.pack(); return img


# ---------------- primitivas ----------------
def new_obj(name, bm, material=None, smooth=True):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if material is not None: o.data.materials.append(material)
    return o


def grid(bm, f, nu, nv, closed_u=True, uvs=(1, 1)):
    """superficie parametrica f(u,v)->Vector, u en [0,1] (cierra si closed_u), v en [0,1]"""
    uv = bm.loops.layers.uv.verify()
    iu = nu if closed_u else nu + 1
    vs = [[bm.verts.new(f(i / nu, j / nv)) for j in range(nv + 1)] for i in range(iu)]
    for i in range(nu):
        for j in range(nv):
            a, b, c, d = vs[i][j], vs[(i + 1) % iu][j], vs[(i + 1) % iu][j + 1], vs[i][j + 1]
            try: fc = bm.faces.new((a, b, c, d))
            except ValueError: continue
            for lp, (u, v) in zip(fc.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uv].uv = (u / nu * uvs[0], v / nv * uvs[1])
    return vs


def lathe(name, prof, mt, seg=36, axis=1, uvs=(1, 1), center=(0, 0, 0), smooth=True):
    """prof: lista (radio, altura) -> revolucion alrededor del eje Y"""
    bm = bmesh.new(); n = len(prof) - 1
    def f(u, v):
        t = v * n; i = min(int(t), n - 1); k = t - i; r = prof[i][0] * (1 - k) + prof[i + 1][0] * k; y = prof[i][1] * (1 - k) + prof[i + 1][1] * k
        a = u * 2 * PI; return V((math.cos(a) * r + center[0], y + center[1], math.sin(a) * r + center[2]))
    grid(bm, f, seg, n * 3 if False else n, True, uvs)
    return new_obj(name, bm, mt, smooth)


def catmull(pts, n=8):
    out = []
    P = [pts[0] * 2 - pts[1]] + list(pts) + [pts[-1] * 2 - pts[-2]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n; t2 = t * t; t3 = t2 * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1]); return out


def sweep(name, pts, rfn, mt, seg=12, cap=True, smooth=True, uvs=(1, 1), n=8, closed=False):
    """tubo a lo largo de pts (Catmull-Rom), radio rfn(t) o lista"""
    path = catmull([V(p) for p in pts], n) if len(pts) > 2 else [V(pts[0]) + (V(pts[1]) - V(pts[0])) * (k / (n * 2)) for k in range(n * 2 + 1)]
    N = len(path); bm = bmesh.new()
    T = [(path[min(i + 1, N - 1)] - path[max(i - 1, 0)]).normalized() for i in range(N)]
    ref = V((0, 0, 1)) if abs(T[0].z) < 0.9 else V((1, 0, 0)); B = T[0].cross(ref).normalized(); Nn = B.cross(T[0]).normalized()
    frames = []
    for i in range(N):
        if i:
            axis = T[i - 1].cross(T[i])
            if axis.length > 1e-7:
                ang = math.asin(min(1, axis.length)); R = Matrix.Rotation(ang, 3, axis.normalized()); Nn = R @ Nn; B = R @ B
        frames.append((path[i], Nn.copy(), B.copy()))
    r = (lambda t: rfn(t)) if callable(rfn) else (lambda t: rfn)
    def f(u, v):
        i = min(int(round(v * (N - 1))), N - 1); c, nn, bb = frames[i]; a = u * 2 * PI; rr = r(v)
        return c + (nn * math.cos(a) + bb * math.sin(a)) * rr
    grid(bm, f, seg, N - 1, True, uvs)
    if cap:
        for end in (0, N - 1):
            c, nn, bb = frames[end]; ring = [v for v in bm.verts if (v.co - c).length < r(end / (N - 1)) * 1.02 + 1e-5 and abs((v.co - c).dot(T[end])) < 1e-5]
            ctr = bm.verts.new(c)
            ring.sort(key=lambda v: math.atan2((v.co - c).dot(bb), (v.co - c).dot(nn)))
            for k in range(len(ring)):
                try: bm.faces.new((ctr, ring[k], ring[(k + 1) % len(ring)]))
                except ValueError: pass
    return new_obj(name, bm, mt, smooth)


def sphere(name, c, rad, mt, seg=24, rings=14, scale=(1, 1, 1)):
    bm = bmesh.new()
    def f(u, v):
        a = u * 2 * PI; b = v * PI; return V((c[0] + rad * scale[0] * math.sin(b) * math.cos(a), c[1] + rad * scale[1] * math.cos(b), c[2] + rad * scale[2] * math.sin(b) * math.sin(a)))
    grid(bm, f, seg, rings, True)
    return new_obj(name, bm, mt)


def box(name, c, size, mt, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = V((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if rot is not None: v.co = rot @ v.co
        v.co += V(c)
    return new_obj(name, bm, mt, smooth=False)


def join(objs, name):
    if len(objs) == 1: objs[0].name = name; return objs[0]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); o = bpy.context.view_layer.objects.active; o.name = name; return o


def root(name):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e); return e


def parent_all(r, objs):
    for o in objs: o.parent = r


def mirror_x(o): pass


# ================= BORDON =================
def build_bordon():
    r = root('it_bordon'); out = []
    wood = mat('staff_wood', hexc('#6a4627'), 0.8); steel = mat('steel', hexc('#4a4c50'), 0.4, 0.7); cord = mat('cord_red', hexc('#8a2a22'), 0.9)
    gourd_m = mat('gourd', hexc('#b98a3e'), 0.45); shell_m = mat('shell', hexc('#e9dfc9'), 0.5)
    L0, L1 = -0.95, 0.675
    pts = [(0.000, L0 + 0.05, 0.000), (0.003, -0.55, 0.002), (-0.002, -0.2, -0.002), (0.0, 0.0, 0.0), (0.003, 0.3, 0.002), (0.0, 0.55, -0.002), (0.0, L1, 0.0)]
    def rad(t):
        y = L0 + 0.05 + t * (L1 - L0 - 0.05); b = 0.0125 + 0.0065 * t
        return b * (1 + 0.14 * math.exp(-((y + 0.27) * 24) ** 2) + 0.12 * math.exp(-((y - 0.42) * 26) ** 2))
    out.append(sweep('staff', pts, rad, wood, seg=14, n=10))
    out.append(sphere('knob', (0, L1 + 0.012, 0), 0.026, wood, scale=(1, 0.9, 1)))
    out.append(lathe('ferrule', [(0.0, L0 - 0.002), (0.0045, L0 + 0.004), (0.0125, L0 + 0.03), (0.0152, L0 + 0.058), (0.0158, L0 + 0.062), (0.0128, L0 + 0.064)], steel, seg=16))
    # cuerda y calabaza
    out.append(lathe('cord_ring', [(0.0188, 0.395), (0.0205, 0.402), (0.0188, 0.409)], cord, seg=18))
    out.append(sweep('cord', [(0.0, 0.40, 0.0), (0.03, 0.40, 0.022), (0.056, 0.355, 0.026), (0.05, 0.31, 0.016)], 0.0033, cord, seg=6))
    gprof = [(0.0, 0.0), (0.02, 0.002), (0.042, 0.014), (0.053, 0.035), (0.05, 0.06), (0.036, 0.076), (0.021, 0.088), (0.0185, 0.1), (0.024, 0.113), (0.034, 0.13), (0.033, 0.146), (0.022, 0.157), (0.008, 0.162), (0.0, 0.163)]
    g = lathe('gourd', gprof, gourd_m, seg=28, center=(0, 0, 0)); g.location = (0.05, 0.30 - 0.163 + 0.0, 0.016); g.rotation_euler = (0.0, 0, -0.18)
    stop = lathe('gourd_stop', [(0.0, 0.0), (0.008, 0.002), (0.009, 0.012), (0.0, 0.014)], wood, seg=10); stop.location = (0.05, 0.30 + 0.0, 0.016)
    out += [g, stop]
    # vieira
    def shell_f(u, v):
        th = (u - 0.5) * 2 * 1.05; rr = v * 0.056
        x = math.sin(th) * rr; y = -math.cos(th) * rr * 0.9
        z = 0.012 * math.sin(th * 7) * v * (0.5 + 0.5 * v) + 0.008 * v * v
        return V((x, y, z))
    bm = bmesh.new(); grid(bm, shell_f, 30, 6, closed_u=False)
    sh = new_obj('shell', bm, shell_m, smooth=True)
    sh.location = (-0.03, 0.40, 0.03); sh.rotation_euler = (math.radians(15), math.radians(-30), math.radians(0))
    out.append(sh)
    out.append(sweep('shell_cord', [(0.0, 0.4, 0.0), (-0.015, 0.395, 0.015), (-0.03, 0.38, 0.03)], 0.0026, cord, seg=6))
    # hacer solidas las caras de vieira
    sh.data.materials[0].use_backface_culling = False
    parent_all(r, out)
    return r, out


# ================= PARAGUAS =================
def build_paraguas(R=0.54, Hc=0.2):
    r = root('it_paraguas'); out = []
    metal = mat('umb_metal', hexc('#2a2a2d'), 0.4, 0.6); woodm = mat('umb_wood', hexc('#5a3920'), 0.45); brass = mat('umb_brass', hexc('#c29a3c'), 0.32, 0.8)
    ca = mat('canopy_a', hexc('#173a6b'), 0.55); cb = mat('canopy_b', hexc('#173a6b'), 0.55)
    for m in (ca, cb): m.use_backface_culling = False
    apex = 0.90
    out.append(lathe('handle', [(0.0, -0.12), (0.0125, -0.115), (0.0158, -0.09), (0.0162, 0.0), (0.0148, 0.05), (0.0138, 0.065), (0.0, 0.066)], woodm, seg=22))
    # empuñadura curva: tubo que sale por debajo y se curva hacia +X
    out.append(sweep('crook', [(0.0, -0.115, 0.0), (0.0, -0.17, 0.0), (0.014, -0.22, 0.0), (0.05, -0.245, 0.0), (0.088, -0.222, 0.0), (0.094, -0.18, 0.0)], 0.0128, woodm, seg=14, n=8))
    out.append(lathe('ferrule', [(0.0145, 0.062), (0.0152, 0.068), (0.0152, 0.078), (0.0145, 0.084)], brass, seg=18))
    out.append(lathe('shaft', [(0.0066, 0.08), (0.0066, apex + 0.06)], metal, seg=10))
    out.append(lathe('finial', [(0.0, apex + 0.10), (0.0075, apex + 0.045), (0.0075, apex + 0.02)], brass, seg=10))
    # dosel con gajos alternos
    NA = 8; SEG = 10
    for gi, mt in ((0, ca), (1, cb)):
        bm = bmesh.new()
        def fcan(u, v, gi=gi):
            kk = 0 if gi == 0 else 1
            a = ((u + 0) * 2 / NA + 0) * 2 * PI / 2 * 1.0
            return V()
        # un solo conjunto de gajos pares/impares
        uvl = bm.loops.layers.uv.verify()
        NR = 14
        def pt(a, s):
            sc = 1 - 0.075 * (1 - abs(math.cos(a * NA / 2))) * s ** 4
            rr = R * s * sc
            return V((math.cos(a) * rr, apex - Hc * s ** 1.9 + 0.012 * (1 - abs(math.cos(a * NA / 2))) * s, math.sin(a) * rr))
        for k in range(NA):
            if k % 2 != gi: continue
            a0, a1 = k * 2 * PI / NA, (k + 1) * 2 * PI / NA
            vs = [[bm.verts.new(pt(a0 + (a1 - a0) * i / SEG, j / NR)) for j in range(NR + 1)] for i in range(SEG + 1)]
            for i in range(SEG):
                for j in range(NR):
                    try: bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
                    except ValueError: pass
        out.append(new_obj('canopy_%s' % ('a' if gi == 0 else 'b'), bm, mt, smooth=True))
    rib = []
    for k in range(NA):
        a = k / NA * 2 * PI; pts = []
        for j in range(11):
            s = j / 10; pts.append((math.cos(a) * R * s * 0.985, apex - Hc * s ** 1.9 - 0.004, math.sin(a) * R * s * 0.985))
        rib.append(sweep('rib%d' % k, pts, 0.0032, metal, seg=6, n=4))
        rib.append(sphere('tip%d' % k, pts[-1], 0.0068, brass, seg=8, rings=6))
    out += [join(rib, 'ribs')]
    out.append(lathe('runner', [(0.016, 0.52), (0.016, 0.555)], metal, seg=12))
    st = []
    for k in range(NA):
        a = k / NA * 2 * PI; A = V((math.cos(a) * 0.05, 0.535, math.sin(a) * 0.05)); B = V((math.cos(a) * R * 0.55, apex - Hc * 0.55 ** 1.9 - 0.006, math.sin(a) * R * 0.55))
        st.append(sweep('st%d' % k, [A, B], 0.0022, metal, seg=5, n=2))
    out.append(join(st, 'stretchers'))
    parent_all(r, out); return r, out


# ================= CESTA =================
def build_cesta():
    r = root('it_cesta'); out = []
    def weave(w, h):
        import numpy as np
        a = np.zeros((h, w, 3), dtype='float32'); base = np.array([0.62, 0.45, 0.24]); dark = np.array([0.36, 0.24, 0.11])
        for y in range(h):
            for x in range(w):
                pass
        yy, xx = np.mgrid[0:h, 0:w]; cx = (xx // 16); cy = (yy // 16)
        over = ((cx + cy) % 2 == 0)
        # vara horizontal sobre/bajo
        u = np.where(over, (yy % 16) / 16.0, (xx % 16) / 16.0)
        shade = 0.55 + 0.45 * np.sin(u * math.pi)
        rnd = np.random.RandomState(4).rand(h, w) * 0.12
        for c in range(3): a[..., c] = (dark[c] + (base[c] - dark[c]) * shade) * (0.92 + rnd)
        return np.clip(a, 0, 1)
    img = np_image('weave', 256, 256, weave)
    wic = mat('wicker', [1, 1, 1], 0.85, img=img)
    wic_d = mat('wicker_dark', hexc('#6d4a25'), 0.85)
    leaf = mat('leaf', hexc('#3f7a30'), 0.75); leaf2 = mat('leaf2', hexc('#2e6226'), 0.75); capm = mat('mush_cap', hexc('#a8742f'), 0.6); stem = mat('mush_stem', hexc('#eadfc4'), 0.7); cloth = mat('cloth', hexc('#e9e2cf'), 0.9)
    # forma: el cuerpo cuelga hacia +X, la asa va a lo largo de Y, el apice de la asa esta en el origen
    Lh, Wh, Hh = 0.150, 0.100, 0.175       # semilongitud (Y), semianchura (Z), alto del cuerpo (X)
    rim_x = 0.140                         # distancia apice->borde
    def body(u, v):
        a = u * 2 * PI; s = 1 - 0.24 * v    # v=0 borde, v=1 base (mas estrecha)
        x = rim_x + Hh * v; yy = math.cos(a) * Lh * s; zz = math.sin(a) * Wh * s
        return V((x, yy, zz))
    bm = bmesh.new(); grid(bm, body, 48, 10, True, uvs=(5, 2))
    out.append(new_obj('basket', bm, wic))
    # fondo
    bm = bmesh.new(); s = 1 - 0.24
    ctr = bm.verts.new(V((rim_x + Hh, 0, 0))); ring = [bm.verts.new(V((rim_x + Hh, math.cos(k / 48 * 2 * PI) * Lh * s, math.sin(k / 48 * 2 * PI) * Wh * s))) for k in range(48)]
    for k in range(48): bm.faces.new((ctr, ring[(k + 1) % 48], ring[k]))
    out.append(new_obj('basket_base', bm, wic_d, smooth=False))
    # borde (tubo cerrado en elipse)
    rim = [(rim_x, math.cos(k / 24 * 2 * PI) * (Lh + 0.004), math.sin(k / 24 * 2 * PI) * (Wh + 0.004)) for k in range(24)]
    rim.append(rim[0]); out.append(sweep('rim', [rim[i] for i in range(0, 24)] + [rim[0], rim[1]], 0.0085, wic_d, seg=8, n=3))
    # asa: arco en el plano XY, apice en origen, tubo de radio 0.0115 (agarre)
    pts = []
    for k in range(0, 21):
        t = k / 20; ang = PI * t - PI / 2     # -90..90 deg
        yy = math.sin(ang) * Lh * 0.97
        xx = rim_x * (1 - math.cos(ang)) if False else rim_x * (1 - (1 - (abs(yy) / (Lh * 0.97)) ** 2.2)) * 1.0
        pts.append((xx, yy, 0.0))
    out.append(sweep('handle', pts, 0.0115, wic_d, seg=12, n=3))
    # costillas verticales del asa cubriendo el extremo
    for sgn in (-1, 1):
        out.append(sweep('hbind%d' % (sgn > 0), [(rim_x - 0.012, sgn * Lh * 0.95, 0), (rim_x + 0.012, sgn * Lh * 0.95, 0)], 0.0145, wic_d, seg=10, n=2))
    # contenido: hojas y setas
    rnd = random.Random(7); lv = []
    for i in range(14):
        a = rnd.random() * 2 * PI; rr = rnd.random() ** 0.5
        c = V((rim_x - 0.02 - 0.05 * (1 - rr) * rnd.random(), math.cos(a) * Lh * 0.75 * rr, math.sin(a) * Wh * 0.75 * rr))
        L = 0.07 + rnd.random() * 0.05; wd = 0.034 + rnd.random() * 0.02
        yaw = rnd.random() * 2 * PI; tilt = (rnd.random() - 0.5) * 0.9
        def lf(u, v, L=L, wd=wd, tilt=tilt):
            x = (v - 0.5) * L; w = wd * math.sin(v * PI) ** 0.8 * (u - 0.5) * 2
            return V((-abs(w) * 0.2 - 0.02 * math.sin(v * PI) + x * -tilt * 0.4, x, w))
        bm = bmesh.new(); grid(bm, lf, 4, 8, closed_u=False)
        o = new_obj('leaf%d' % i, bm, leaf if i % 2 else leaf2);
        o.location = c; o.rotation_euler = (rnd.random() * 0.8, yaw, rnd.random() * 0.8); o.data.materials[0].use_backface_culling = False
        lv.append(o)
    out.append(join(lv, 'leaves'))
    for i, (px, py, pz, sc) in enumerate(((rim_x - 0.04, 0.05, 0.03, 1.0), (rim_x - 0.045, -0.06, -0.02, 0.85), (rim_x - 0.05, 0.0, -0.05, 0.7))):
        cap = lathe('mcap%d' % i, [(0.0, 0.032), (0.016, 0.03), (0.032, 0.018), (0.04, 0.004), (0.036, 0.0), (0.0, 0.0)], capm, seg=16)
        stm = lathe('mstem%d' % i, [(0.0, -0.045), (0.011, -0.04), (0.0085, 0.0), (0.0, 0.002)], stem, seg=12)
        for o in (cap, stm):
            o.scale = (sc, sc, sc); o.location = (px, py, pz); o.rotation_euler = (0, 0, 0)
            # el sombrero crece hacia -X (fuera del cesto): eje del champiñon = -X
            o.rotation_euler = (0, 0, PI / 2); o.location = (px - 0.0, py, pz)
        out += [cap, stm]
    parent_all(r, out); return r, out


# ================= GAITA =================
def tartan_img():
    def f(w, h):
        import numpy as np
        a = np.zeros((h, w, 3), dtype='float32'); yy, xx = np.mgrid[0:h, 0:w]
        base = np.array(hexc('#2f5d3a')); base = np.array([0.18, 0.36, 0.23])
        col = np.zeros((h, w, 3)) + np.array([0.12, 0.30, 0.18])
        s = w / 4
        for ax in (xx, yy):
            t = (ax % s) / s
            band = np.where((t > 0.18) & (t < 0.30), 1, 0)[..., None] * (np.array([0.05, 0.16, 0.09]) - col) * 0.8
            thin = np.where((t > 0.6) & (t < 0.64), 1, 0)[..., None] * (np.array([0.78, 0.68, 0.30]) - col) * 0.8
            col = col + band + thin
        col *= (0.9 + 0.1 * np.sin((xx + yy) * 1.3))[..., None]
        return np.clip(col, 0, 1)
    return np_image('tartan', 256, 256, f)


def turned(name, prof, mt, seg=18, **kw):
    return lathe(name, prof, mt, seg=seg, **kw)


def build_gaita_body():
    """bolsa + estopas + punteiro + roncon y ronquillo. Origen = centro de la bolsa; la bolsa es larga en +Z."""
    r = root('it_gaita'); out = []
    tart = mat('bag_cloth', [1, 1, 1], 0.9, img=tartan_img())
    ebony = mat('ebony', hexc('#2a1a10'), 0.4); boxw = mat('boxwood', hexc('#9b6a35'), 0.5); bone = mat('bone', hexc('#e7dcc2'), 0.45)
    brass = mat('brass', hexc('#c29a3c'), 0.32, 0.8); cordm = mat('ribbon', hexc('#a01f27'), 0.8); leather = mat('leather', hexc('#4a2e1c'), 0.7)
    holem = mat('hole_dark', hexc('#0b0705'), 0.9)
    # --- bolsa: elipsoide con cuello hacia delante (+Z) ---
    A, B, C = 0.215, 0.100, 0.082   # semiejes z (largo), y (alto), x (ancho)
    def bag(u, v):
        a = u * 2 * PI; b = v * PI
        z = -A * math.cos(b); rad = math.sin(b)
        pinch = 1 - 0.28 * max(0.0, z / A) ** 2 - 0.10 * max(0.0, -z / A) ** 2   # estrecha por delante
        fold = 1 + 0.035 * math.sin(a * 5 + z * 22) * math.sin(b)
        x = C * rad * math.cos(a) * pinch * fold; y = B * rad * math.sin(a) * pinch * fold * (1 + 0.1 * (-z / A))
        return V((x, y, z))
    bm = bmesh.new(); grid(bm, bag, 40, 24, True, uvs=(2, 2)); out.append(new_obj('bag', bm, tart))
    # --- estopas y flautas: cada una en su posicion ---
    parts = {}
    def stock(nm, pos, d, h=0.05, rr=0.016):
        d = V(d).normalized(); q = V((0, 1, 0)).rotation_difference(d)
        o1 = turned(nm + '_stock', [(0.0, 0.0), (rr * 1.0, 0.0), (rr * 1.15, 0.008), (rr * 0.8, 0.015), (rr * 1.05, 0.026), (rr * 0.82, 0.04), (rr * 0.9, h), (0.0, h)], boxw, seg=16)
        o2 = turned(nm + '_ring', [(rr * 1.05, 0.0), (rr * 1.3, 0.002), (rr * 1.3, 0.008), (rr * 1.05, 0.01)], cordm, seg=16, center=(0, -0.012, 0));
        for o in (o1, o2): o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q; o.location = V(pos)
        out.extend([o1, o2]); return o1
    # (bolsa en reposo: el cuello mira a +Z)
    SC = V((0.0, -0.020, 0.205)); SB = V((0.0, 0.050, 0.188)); SR = V((0.020, 0.070, -0.07)); SR2 = V((-0.012, 0.074, -0.05))
    # punteiro (chanter): del cuello hacia abajo y adelante
    cd = V((0.0, -0.95, 0.31)).normalized()
    stock('sc', SC - cd * 0.01, cd, h=0.055, rr=0.0155)
    cl = 0.30
    cp = [(0.0125, 0.0), (0.0125, 0.02), (0.0118, 0.06), (0.0112, 0.16), (0.0120, 0.23), (0.0150, 0.272), (0.0215, cl - 0.012), (0.0230, cl)]
    cprof = [(0.0, 0.0)] + cp + [(0.0170, cl), (0.0, cl - 0.001)]
    ch = lathe('chanter', cprof, ebony, seg=20)
    holes = []
    hy = [0.082, 0.112, 0.140, 0.168, 0.196, 0.222]    # 6 agujeros delanteros (+Z local del punteiro) + 1 trasero
    for k, y in enumerate(hy):
        bm = bmesh.new();
        def hf(u, v, y=y):
            a = u * 2 * PI; rr = 0.0036 * v
            return V((math.sin(a) * rr, y + math.cos(a) * rr * 1.0, 0.0124 + 0.0004))
        grid(bm, hf, 10, 1, True); holes.append(new_obj('h%d' % k, bm, holem, smooth=False))
    bm = bmesh.new()
    def hb(u, v):
        a = u * 2 * PI; rr = 0.0036 * v; return V((math.sin(a) * rr, 0.075 + math.cos(a) * rr, -0.0124))
    grid(bm, hb, 10, 1, True); holes.append(new_obj('h_back', bm, holem, smooth=False))
    mount = lathe('chanter_mount', [(0.0124, 0.050), (0.0150, 0.052), (0.0150, 0.060), (0.0128, 0.062)], bone, seg=20)
    mount2 = lathe('chanter_mount2', [(0.0150, 0.250), (0.0185, 0.253), (0.0185, 0.262), (0.0160, 0.264)], bone, seg=20)
    chg = [ch, mount, mount2] + holes
    # el punteiro entra en la estopa: origen del punteiro en la boca de la estopa
    qd = V((0, 1, 0)).rotation_difference(cd)
    chj = join(chg, 'chanter'); chj.rotation_mode = 'QUATERNION'; chj.rotation_quaternion = qd; chj.location = SC + cd * 0.04
    # el 'frente' del punteiro (+Z local) debe mirar a +Z global: alineado girando sobre su eje
    out.append(chj)
    # --- ronco y ronquillo: hacia arriba y atras ---
    def drone(nm, pos, d, L, r0, r1, sections):
        d = V(d).normalized(); q = V((0, 1, 0)).rotation_difference(d)
        prof = [(0.0, 0.0), (r0, 0.0), (r0 * 1.05, 0.04), (r0 * 0.86, 0.06), (r0 * 0.9, L * 0.55), (r1 * 1.12, L * 0.57), (r1, L * 0.6), (r1 * 0.95, L * 0.97), (r1 * 1.25, L), (0.0, L)]
        o = lathe(nm, prof, ebony, seg=16)
        mnt = lathe(nm + '_m', [(r0 * 1.12, L * 0.0 + 0.045), (r0 * 1.38, L * 0.0 + 0.048), (r0 * 1.38, 0.056), (r0 * 1.12, 0.059)], bone, seg=16)
        mnt2 = lathe(nm + '_m2', [(r1 * 1.18, L * 0.575), (r1 * 1.42, L * 0.58), (r1 * 1.42, L * 0.60), (r1 * 1.18, L * 0.605)], bone, seg=16)
        oo = join([o, mnt, mnt2], nm); oo.rotation_mode = 'QUATERNION'; oo.rotation_quaternion = q; oo.location = V(pos); out.append(oo); return oo
    dd = V((0.04, 0.94, -0.34)).normalized(); dd2 = V((-0.02, 0.93, -0.36)).normalized()
    stock('sr', SR - dd * 0.01, dd, h=0.05, rr=0.017)
    stock('sr2', SR2 - dd2 * 0.01, dd2, h=0.05, rr=0.0145)
    drone('ronco', SR + dd * 0.045, dd, 0.62, 0.0185, 0.0125, [])
    drone('ronquillo', SR2 + dd2 * 0.045, dd2, 0.40, 0.0150, 0.0100, [])
    # cinta de los bordones
    rib = sweep('ribbon', [SR + dd * 0.30 + V((0, 0.0, 0.0)), (SR + dd * 0.30 + SR2 + dd2 * 0.30) * 0.5 + V((0, 0, 0.012)), SR2 + dd2 * 0.30], 0.0042, cordm, seg=6, n=4)
    out.append(rib)
    # estopa del soprete + marcador para el tubo
    stock('sb', SB - V((0, 0.9, 0.35)).normalized() * 0.01, V((0, 0.9, 0.35)), h=0.045, rr=0.0145)
    # marcas (empties) de utilidad
    marks = {}
    for nm, p in (('m_chanter_stock', SC), ('m_blow_stock', SB), ('m_ronco_stock', SR)):
        e = bpy.data.objects.new(nm, None); bpy.context.scene.collection.objects.link(e); e.location = p; marks[nm] = e; e.parent = r
    parent_all(r, out); r['chanter_dir'] = tuple(cd); r['chanter_origin'] = tuple(SC + cd * 0.04)
    return r, out


def build_blowpipe(L, rname='it_gaita_pipe'):
    """soprete recto de longitud L a lo largo de +Y; origen en la base (boca del estopa), la embocadura en y=L"""
    r = root(rname); out = []
    boxw = mat('boxwood', hexc('#9b6a35'), 0.5); bone = mat('bone', hexc('#e7dcc2'), 0.45); ebony = mat('ebony', hexc('#2a1a10'), 0.4)
    prof = [(0.0, 0.0), (0.0090, 0.0), (0.0090, 0.02), (0.0102, 0.045), (0.0075, 0.075), (0.0070, L * 0.55), (0.0078, L * 0.80), (0.0092, L - 0.030), (0.0105, L - 0.012), (0.0085, L - 0.004), (0.0, L)]
    out.append(lathe('pipe', prof, ebony, seg=14))
    out.append(lathe('pipe_collar', [(0.0102, 0.040), (0.0124, 0.043), (0.0124, 0.050), (0.0104, 0.053)], bone, seg=14))
    out.append(lathe('mouthpiece', [(0.0090, L - 0.040), (0.0118, L - 0.036), (0.0125, L - 0.022), (0.0105, L - 0.008), (0.0070, L - 0.002), (0.0, L)], bone, seg=14))
    parent_all(r, out); return r, out

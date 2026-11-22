# -*- coding: utf-8 -*-
"""Los minijuegos hablan el mismo lenguaje de diseño que el resto de la app (menús, HUD, tienda).

1. Ningún color escrito a mano en los minijuegos, salvo los de una lista cerrada (colores que SON el juego:
   tonos del Mastermind, el mar de los Faros, la bombilla del Dinamo, confeti...) y marcados `no-tema`.
2. Nunca texto blanco (#fff/white) ni la tarjeta sobre `--theme-primary`: el texto sobre el acento es `--theme-on-primary`.
3. Contraste en Pizarra (glass), Fuego (flame-red) y Día (dia), resolviendo los tokens de mobile-themes.css de verdad:
   texto/tarjeta >= 4,5; texto sobre el acento >= 4,5; bien/mal/aviso y los colores fijos mezclados >= 3 sobre la tarjeta.
Fuera de alcance (los lleva otro agente): families/sequenceCode/** y families/motionChallenge/PulsoHierro*.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
MG = RAIZ / "frontend" / "src" / "player" / "minigames"
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d[^)]*\)|hsla?\(\s*\d[^)]*\)")
DECLARA = re.compile(r"^\s*--[\w-]+\s*:")
# Todo hex permitido en una línea `no-tema` (colores propios del juego). Cerrada: añadir uno exige tocar esta lista.
PERMITIDOS = {
    "#22d3ee", "#f472b6", "#facc15", "#4ade80", "#fb923c", "#a78bfa", "#f87171", "#e2e8f0",  # Mastermind / confeti
    "#7dd3fc", "#c4b5fd", "#f9a8d4", "#a5b4fc", "#fbcfe8", "#e9d5ff",  # tonos del Interrogatorio
    "#2c4a6b", "#1b2c45", "#2f5a3f", "#fde68a", "#f59e0b", "#f97316", "#fff",  # Faros: el mar es el dibujo
    "#fff7d6", "#92400e",  # Dinamo: la bombilla
}
PERMITIDOS_RGBA = {"rgba(253,230,138,.28)", "rgba(248,113,113,.35)", "rgba(255,255,255,.18)",
                   "rgba(255,255,255,.08)", "rgba(248,250,252,.45)"}


def ficheros():
    for f in sorted(MG.rglob("*")):
        if f.suffix not in (".ts", ".tsx", ".css") or ".generado" in f.name:
            continue
        if "sequenceCode" in f.parts or f.name.startswith("PulsoHierro"):
            continue
        yield f


def lineas(f):
    texto = re.sub(r"/\*.*?\*/", "", f.read_text(encoding="utf-8", errors="replace"), flags=re.S)
    for n, l in enumerate(texto.splitlines(), 1):
        yield n, l


def test_ningun_color_a_mano_fuera_de_la_lista_cerrada():
    malos = []
    for f in ficheros():
        for n, l in lineas(f):
            if DECLARA.match(l) or l.strip().startswith("//"):
                continue
            cols = HEX.findall(l.split(" // ")[0])
            if not cols:
                continue
            if "no-tema" not in l:
                malos.append(f"{f.relative_to(MG)}:{n}: {cols}")
                continue
            for c in cols:
                c = c.replace(" ", "")
                if c.lower() not in PERMITIDOS and c not in PERMITIDOS_RGBA:
                    malos.append(f"{f.relative_to(MG)}:{n}: {c} no está en PERMITIDOS")
    assert not malos, "colores a mano en minijuegos (usa --mg-*/--theme-* o la lista cerrada):\n  " + "\n  ".join(malos)


def test_texto_blanco_o_tarjeta_sobre_el_acento():
    malos = []
    for f in ficheros():
        txt = f.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"\{([^{}]*)\}", txt):
            cuerpo = m.group(1)
            if re.search(r"background(-color)?\s*:\s*var\(--theme-primary\)", cuerpo) and re.search(
                r"(?<![-\w])color\s*:\s*(#fff\b|#ffffff\b|white\b|var\(--theme-card\)|var\(--mg-text\))", cuerpo
            ):
                malos.append(f"{f.relative_to(MG)}: {cuerpo.strip()[:80]}")
        for m in re.finditer(r"background:\s*'var\(--theme-primary\)',\s*color:\s*'([^']*)'", txt):
            if "on-primary" not in m.group(1):
                malos.append(f"{f.relative_to(MG)}: color {m.group(1)} sobre primary")
    assert not malos, "texto que no es --mg-on-primary/--theme-on-primary sobre el acento:\n  " + "\n  ".join(malos)


def test_los_botones_de_los_juegos_no_bajan_de_44():
    for f in ficheros():
        txt = f.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"([^{}]*(?:boton|button|btn)[^{}]*)\{[^{}]*?min-height:\s*(\d+)px", txt):
            sel = m.group(1)
            if int(m.group(2)) < 44 and "[class" not in sel:
                raise AssertionError(f"{f.name}: {sel.strip()[-60:]} min-height {m.group(2)}px < 44")
    assert "minHeight: 44" in (MG / "families" / "audioChallenge" / "AudioChallengeRuntime.tsx").read_text(encoding="utf-8")


# --- contraste con los tokens reales -------------------------------------------------------------------------------
def _decls(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for m in re.finditer(r"([^{}@]+)\{([^{}]*)\}", css):
        yield [s.strip() for s in m.group(1).split(",")], dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", m.group(2)))


def _entorno(tema):
    env = {}
    for sels, d in _decls(TEMAS.read_text(encoding="utf-8")):
        if any(s in (":root", f"body.{tema}", f"html.{tema}") for s in sels):
            env.update(d)
    for _, d in _decls((MG / "core" / "mg-tokens.css").read_text(encoding="utf-8")):
        env.update(d)
    return env


def _args(s):
    out, prof, ini = [], 0, 0
    for i, c in enumerate(s):
        prof += c == "("
        prof -= c == ")"
        if c == "," and prof == 0:
            out.append(s[ini:i])
            ini = i + 1
    return out + [s[ini:]]


def color(e, env):
    e = e.strip()
    if e.startswith("#"):
        h = e[1:]
        h = "".join(c * 2 for c in h) if len(h) == 3 else h
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    if e.startswith("var("):
        a = _args(e[4:-1])
        n = a[0].strip()
        if n in env:
            return color(env[n], env)
        return color(",".join(a[1:]), env)
    if e.startswith(("rgb(", "rgba(")):
        return color(e[e.index("(") + 1:-1], env)
    if e.startswith("color-mix("):
        a = _args(e[10:-1])

        def parte(p):
            m = re.match(r"(.*?)\s+(\d+(?:\.\d+)?)%$", p.strip())
            return (m.group(1), float(m.group(2)) / 100) if m else (p.strip(), None)

        (ca, pa), (cb, pb) = parte(a[1]), parte(a[2])
        pa = pa if pa is not None else 1 - (pb or 0.5)
        A, B = color(ca, env), color(cb, env)
        return tuple(x * pa + y * (1 - pa) for x, y in zip(A, B))
    return tuple(float(x) for x in e.split(",")[:3])


def lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = map(f, c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


FIJOS_70 = ["#22d3ee", "#f472b6", "#facc15", "#4ade80", "#fb923c", "#a78bfa", "#f87171", "#e2e8f0",
            "#7dd3fc", "#c4b5fd", "#f9a8d4", "#a5b4fc", "#fbcfe8", "#e9d5ff"]
FAROS_62 = ["#f59e0b", "#f97316", "#fde68a"]


def test_contraste_en_glass_flame_y_dia():
    fallos = []
    for tema in ("theme-glass", "theme-flame-red", "theme-dia"):
        env = _entorno(tema)

        def c(n):
            return color(f"var({n})", env)

        tarjeta, celda, fondo, texto = c("--mg-board"), c("--mg-cell"), c("--mg-deep"), c("--mg-text")
        pruebas = [("texto/tarjeta", ratio(texto, tarjeta), 4.5), ("texto/celda", ratio(texto, celda), 4.5),
                   ("on-primary/primary", ratio(c("--theme-on-primary"), c("--theme-primary")), 4.5),
                   ("texto-2/tarjeta", ratio(c("--mg-text-2"), tarjeta), 4.5)]
        for n in ("good", "bad", "warn"):
            for fnd, nom in ((tarjeta, "tarjeta"), (celda, "celda"), (fondo, "fondo")):
                pruebas.append((f"{n}/{nom}", ratio(c(f"--mg-{n}"), fnd), 3))
            pruebas.append((f"texto/{n}-fondo", ratio(texto, c(f"--mg-{n}-fondo")), 4.5))
        for lista, pct in ((FIJOS_70, 55), (FAROS_62, 50)):
            for h in lista:
                mezcla = color(f"color-mix(in srgb, {h} {pct}%, var(--theme-text))", env)
                pruebas.append((f"fijo {h}@{pct}/tarjeta", ratio(mezcla, tarjeta), 3))
        for nom, r, minimo in pruebas:
            if r < minimo:
                fallos.append(f"{tema}: {nom} = {r:.2f} < {minimo}")
    assert not fallos, "\n".join(fallos)


def test_el_mar_de_los_faros_deja_ver_luz_y_barco():
    # 22/11 «Mirando al mar»: cielo y mar de noche (variables --fs-* de la escena) en todos los temas.
    faros = (MG / "families" / "bearingHunt" / "FarosRuntimeScreen.tsx").read_text(encoding="utf-8")
    fs = dict(re.findall(r"--fs-([\w-]+):\s*(#[0-9a-fA-F]{6});", faros))
    mar = [color(fs[n], {}) for n in ("cielo-3", "mar-1", "mar-2")]
    for h in (fs["luz"], fs["luz-viva"], fs["barco"], "#ffffff"):
        for m in mar:
            assert ratio(color(h, {}), m) >= 3, h

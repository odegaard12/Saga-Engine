"""Lenguaje de diseño común: el texto sobre el acento tiene contraste >=4,5:1 en cada tema
y los componentes migrados no pintan texto blanco/tarjeta a mano sobre --theme-primary."""
import re
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src"
CSS = (SRC / "mobile-themes.css").read_text(encoding="utf-8")
HEX = re.compile(r"#[0-9a-fA-F]{6}\b")


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contraste(a, b):
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def bloques():
    """[(selector, cuerpo)] de los bloques que declaran --theme-primary:."""
    out = []
    for m in re.finditer(r"([^{}]+)\{([^{}]*--theme-primary:[^{}]*)\}", CSS):
        out.append((m.group(1).strip(), m.group(2)))
    return out


def resolver(valor, ambito):
    v = valor.strip()
    m = re.fullmatch(r"var\((--[\w-]+)\)", v)
    if m:
        d = re.search(m.group(1) + r":\s*([^;]+);", ambito)
        if not d:  # --s-acento* vive en otro bloque del mismo tema
            d = re.search(m.group(1) + r":\s*([^;]+);", ambito_s(ambito))
        return resolver(d.group(1), ambito)
    assert HEX.fullmatch(v), v
    return v


def ambito_s(cuerpo):
    # tema dia/solpor: las --s-* se declaran en el bloque con el mismo --theme-bg-tema; se busca en todo el CSS por el rgb del acento
    rgb = re.search(r"--theme-glow:\s*rgba\(var\(--s-acento-rgb\)", cuerpo)
    assert rgb
    return CSS


def test_on_primary_en_todos_los_temas_con_contraste():
    bs = bloques()
    assert len(bs) >= 7
    for sel, cuerpo in bs:
        on = re.search(r"--theme-on-primary:\s*([^;]+);", cuerpo)
        pr = re.search(r"--theme-primary:\s*([^;]+);", cuerpo)
        assert on, f"{sel[-40:]} sin --theme-on-primary"
        if "--s-acento" in pr.group(1):
            # Día/Solpor: sus --s-acento / --s-acento-texto, por tema
            tema = "dia" if "theme-dia" in sel else "solpor"
            blk = re.search(r"body\.theme-%s \{([^{}]*--s-acento:[^{}]*)\}" % tema, CSS) or re.search(
                r"html\.theme-%s,[^{}]*\{([^{}]*--s-acento:[^{}]*)\}" % tema, CSS)
            a = re.search(r"--s-acento:\s*(#\w+);", blk.group(1)).group(1)
            t = re.search(r"--s-acento-texto:\s*(#\w+);", blk.group(1)).group(1)
        else:
            a, t = pr.group(1).strip(), on.group(1).strip()
        assert contraste(a, t) >= 4.5, (sel[-40:], a, t, contraste(a, t))
        soft = re.search(r"--theme-on-primary-soft:\s*(#\w+);", cuerpo)
        if soft:
            assert contraste(a, soft.group(1)) >= 3, (sel[-40:], "soft")


def test_sin_texto_blanco_a_mano_sobre_el_acento():
    ficheros = ["StoryModal", "FieldPrepPanel", "CraftingPanel", "AvisoInstalar", "MissionPackPanel", "PlayerHud"]
    for f in ficheros:
        s = (SRC / "player" / "components" / f"{f}.tsx").read_text(encoding="utf-8")
        for m in re.finditer(r"background:\s*'var\(--theme-primary\)',([^}]{0,160})", s):
            cola = m.group(1)
            assert not re.search(r"color:\s*'(#fff|#ffffff|white|var\(--theme-card\))'", cola), (f, cola[:80])
    t = (SRC / "player" / "avatares3d" / "mixamo" / "tienda.css").read_text(encoding="utf-8")
    assert not re.search(r"background:\s*var\(--theme-primary[^;]*;\s*color:\s*#", t)

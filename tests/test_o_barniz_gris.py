# -*- coding: utf-8 -*-
"""El barniz que hacía que todo pareciese «glass» aunque el tema fuese rojo.

Medido en el banco, con el tema de fuego puesto y ordenando por área lo que se
veía en la pantalla del jugador:

    div     linear-gradient(rgba(100,116,139,.46), rgba(71,85,105,.34))  115 420 px²
    section linear-gradient(rgba(100,116,139,.46), rgba(71,85,105,.34))  114 368 px²
    section linear-gradient(rgba(84,91,104,.72),  ...)                    98 753 px²
    section linear-gradient(rgba(100,116,139,.34), rgba(30,41,59,.42))    90 800 px²
    button  linear-gradient(rgba(16,185,129,.85), rgba(5,150,105,.95))    30 740 px²

Gris pizarra encima de cada panel, uno detrás de otro, más el botón de empezar
en verde esmeralda y los de permisos en azul cielo. Por eso «se ve todo un
glass»: el tema teñía el fondo y el barniz volvía a taparlo.

Ahora salen de `--theme-sheen-a/-b`, `--theme-ok/-deep/-soft` y `--theme-info`.
En cristal esas variables valen exactamente lo de antes, así que el tema viejo
no cambia; en fuego son ladrillo y brasa.

Los verdes son tres a propósito: el base, el hondo (la segunda parada de los
degradados) y el claro. El primer intento los colapsó en uno y dejó los
degradados en un color liso.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
JUGADOR = RAIZ / "frontend" / "src" / "player"
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"

# Lo que ya no puede estar clavado en la pantalla del jugador.
PROHIBIDOS = (
    r"rgba\(\s*15,\s*23,\s*42",
    r"rgba\(\s*2,\s*6,\s*23",
    r"rgba\(\s*30,\s*41,\s*59",
    r"rgba\(\s*148,\s*163,\s*184",
    r"#0f172a",
    r"#020617",
    r"#1e293b",
    r"#94a3b8",
    r"#64748b",
    r"#475569",
    r"rgba\(\s*100,\s*116,\s*139",
    r"rgba\(\s*71,\s*85,\s*105",
    r"rgba\(\s*16,\s*185,\s*129",
    r"rgba\(\s*5,\s*150,\s*105",
    r"rgba\(\s*52,\s*211,\s*153",
    r"rgba\(\s*56,\s*189,\s*248",
    r"#10b981",
    r"#059669",
    r"#34d399",
    r"#38bdf8",
    r"#0ea5e9",
)

VARIABLES = (
    "--theme-ink",
    "--theme-ink-deep",
    "--theme-ink-soft",
    "--theme-ink-mid",
    "--theme-line",
    "--theme-shell-a",
    "--theme-shell-b",
    "--theme-info-deep",
    "--theme-info-soft",
    "--theme-sheen-a",
    "--theme-sheen-b",
    "--theme-ok",
    "--theme-ok-deep",
    "--theme-ok-soft",
    "--theme-info",
)


def ficheros():
    for f in sorted(JUGADOR.rglob("*")):
        if f.suffix in (".tsx", ".ts", ".css"):
            yield f


def sin_comentarios(texto: str) -> str:
    """Sin comentarios, pero conservando los saltos de línea.

    Hace falta que el número de línea siga cuadrando con el fichero de verdad:
    la salida `(no-tema)` se busca en la línea original, y si aquí se comieran
    los saltos, los números apuntarían a otro sitio.
    """
    texto = re.sub(
        r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), texto, flags=re.DOTALL
    )
    return re.sub(r"//[^\n]*", "", texto)


def test_o_barniz_xa_non_esta_cravado():
    """Con una salida: `(no-tema)` en la misma línea.

    Hay un color que NO debe seguir al tema: el negro del dibujo de la pegatina
    de QR. Es papel impreso, negro sobre blanco, y teñido de ladrillo deja de
    parecer un código, que es lo que el jugador tiene que reconocer de lejos.
    Para saltarse esta prueba hay que escribir por qué.
    """
    culpables = []

    for f in ficheros():
        crudo = f.read_text(encoding="utf-8")
        codigo = sin_comentarios(crudo)
        lineas = crudo.split("\n")
        for patron in PROHIBIDOS:
            for m in re.finditer(patron, codigo):
                n = codigo[: m.start()].count("\n")
                if "no-tema" in lineas[n]:
                    continue
                culpables.append(f"{f.relative_to(RAIZ)}:{n + 1}  {m.group(0)}")

    assert not culpables, (
        "colores clavados en la pantalla del jugador (%d):\n  %s"
        % (len(culpables), "\n  ".join(culpables[:20]))
    )


def test_os_dous_temas_declaran_todas_as_variables():
    """Una variable sin valor en un tema es un color que no se pinta."""
    css = TEMAS.read_text(encoding="utf-8")

    for bloque in ("theme-glass", "theme-flame-red"):
        inicio = css.index("body.%s {" % bloque)
        cuerpo = css[inicio : css.index("}", inicio)]
        faltan = [v for v in VARIABLES if "%s:" % v not in cuerpo]
        assert not faltan, "a %s le faltan %s" % (bloque, faltan)


def test_os_tres_verdes_son_distintos():
    """Colapsarlos deja los degradados en un color liso."""
    css = TEMAS.read_text(encoding="utf-8")

    for bloque in ("theme-glass", "theme-flame-red"):
        inicio = css.index("body.%s {" % bloque)
        cuerpo = css[inicio : css.index("}", inicio)]
        valores = {
            v: re.search(r"%s:\s*([^;]+);" % v, cuerpo).group(1).strip()
            for v in ("--theme-ok", "--theme-ok-deep", "--theme-ok-soft")
        }
        assert len(set(valores.values())) == 3, (
            "en %s los tres verdes no son tres: %s" % (bloque, valores)
        )


def test_cristal_non_cambia():
    """El tema viejo tiene que quedar igual que estaba, al valor exacto."""
    css = TEMAS.read_text(encoding="utf-8")
    inicio = css.index("body.theme-glass {")
    cuerpo = css[inicio : css.index("}", inicio)]

    esperado = {
        "--theme-sheen-a": "100, 116, 139",
        "--theme-sheen-b": "71, 85, 105",
        "--theme-ok": "16, 185, 129",
        "--theme-ok-deep": "5, 150, 105",
        "--theme-ok-soft": "52, 211, 153",
        "--theme-info": "56, 189, 248",
        "--theme-ink": "15, 23, 42",
        "--theme-ink-deep": "2, 6, 23",
        "--theme-ink-soft": "30, 41, 59",
        "--theme-ink-mid": "51, 65, 85",
        "--theme-line": "148, 163, 184",
        "--theme-shell-a": "84, 91, 104",
        "--theme-shell-b": "110, 116, 128",
        "--theme-info-deep": "14, 116, 190",
        "--theme-info-soft": "125, 211, 252",
    }

    for variable, valor in esperado.items():
        assert "%s: %s;" % (variable, valor) in cuerpo, (
            "cristal cambió de color en %s: se esperaba %s" % (variable, valor)
        )


def test_ningunha_variable_dentro_dun_atributo_de_svg():
    """Ahí el navegador no las sustituye: el icono sale negro y sin avisar."""
    culpables = []
    atributo = re.compile(r'\b(color|fill|stroke|stop-color|stopColor)="[^"]*var\(--theme')

    for f in ficheros():
        codigo = f.read_text(encoding="utf-8")
        for m in atributo.finditer(codigo):
            linea = codigo[: m.start()].count("\n") + 1
            culpables.append(f"{f.relative_to(RAIZ)}:{linea}")

    assert not culpables, "variables dentro de atributos de SVG: %s" % culpables

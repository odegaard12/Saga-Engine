# -*- coding: utf-8 -*-
"""Que el tema llegue al móvil, y que llegue a algo que exista.

`mobile-themes.css` estuvo en el repositorio sin que lo importara nadie. Vite
sólo empaqueta el CSS que alguien importa, así que nunca entró en el bundle: el
`dist` construido tenía **cero** reglas `theme-*`. El móvil recibía
`class="theme-glass"` y no había ni una regla que casara. Tres commits de temas,
un selector en el panel y una lista de temas válidos recortada, y ni un píxel
cambió en ningún teléfono.

Y cuando por fin se importa, tiene que apuntar a algo real. Medido en su
primera versión:

    .player-panel        0 usos
    .login-panel         0 usos
    .saga-mobile-shell   0 usos
    .saga-glass-panel    8 componentes  <- este es el bueno

`button[type=button][style*=backgroundColor]` tampoco podía casar nunca: el DOM
serializa el estilo como `background-color`.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

TEMAS = FRONT / "mobile-themes.css"
ENTRADA = FRONT / "main.tsx"
SERVIDOR = RAIZ / "main.py"
LISTA_TS = FRONT / "shared" / "tema.ts"
PANEL = FRONT / "admin" / "components" / "SettingsPanel.tsx"
ADMIN = FRONT / "admin" / "AdminApp.tsx"
PUBLICO = RAIZ / "backend" / "app" / "routers" / "public.py"


def sin_comentarios_css(fichero: Path) -> str:
    return re.sub(r"/\*.*?\*/", "", fichero.read_text(encoding="utf-8"), flags=re.DOTALL)


def test_alguen_importa_a_folla_de_temas():
    """Sin un import, vite no lo empaqueta y el tema no existe en el móvil."""
    codigo = ENTRADA.read_text(encoding="utf-8")

    assert re.search(r"import\s+['\"][^'\"]*mobile-themes\.css['\"]", codigo), (
        "nadie importa mobile-themes.css: el tema no llegaria al bundle"
    )


def test_os_temas_do_css_e_os_do_servidor_son_os_mesmos():
    """Dos listas de temas divergen siempre.

    Uno que el servidor acepte y no esté en el CSS deja al jugador sin colores;
    uno que esté en el CSS y el servidor no acepte no se puede elegir.
    """
    css = sin_comentarios_css(TEMAS)
    en_css = set(re.findall(r"body\.theme-([a-z0-9-]+)", css))

    servidor = SERVIDOR.read_text(encoding="utf-8")
    linea = re.search(r"VALID_PLAYER_THEMES\s*=\s*\{([^}]*)\}", servidor)
    assert linea, "no se encontró VALID_PLAYER_THEMES"
    en_servidor = set(re.findall(r"[\"']([a-z0-9-]+)[\"']", linea.group(1)))

    assert en_css == en_servidor, (
        f"solo en el CSS: {sorted(en_css - en_servidor)} · "
        f"solo en el servidor: {sorted(en_servidor - en_css)}"
    )


def test_o_tema_chega_aos_paneis_do_xogador():
    """`.saga-glass-panel` es la cara del juego: 8 componentes, minijuegos
    incluidos. Si el tema no toca sus variables, sólo cambia el fondo."""
    css = sin_comentarios_css(TEMAS)

    assert "--saga-glass-bg:" in css
    assert "--saga-glass-border:" in css
    assert "--saga-accent-glow:" in css


def test_non_hai_selectores_que_non_casan_con_nada():
    css = sin_comentarios_css(TEMAS)

    for muerto in (".player-panel", ".login-panel", ".saga-mobile-shell", "backgroundColor"):
        assert muerto not in css, f"{muerto} no existe en la aplicación"


def test_o_panel_de_administracion_non_se_pinta():
    """La clase `theme-*` sólo la ponen la entrada y el jugador.

    Si las reglas que pintan no se limitan a esa clase, el panel se lleva por
    delante su propio aspecto.
    """
    css = sin_comentarios_css(TEMAS)

    # Cada bloque que pinta tiene que estar limitado por la clase de tema.
    bloques = re.findall(r"([^{}]+)\{([^}]*)\}", css)
    for selector, cuerpo in bloques:
        selector = selector.strip()
        if selector in (":root",) or selector.startswith("body.theme-"):
            continue
        if "background-color:" in cuerpo or "color:" in cuerpo:
            assert 'body[class*=' in selector, (
                f"este bloque pinta fuera del tema y alcanzaria al panel: {selector!r}"
            )


def _temas_do_servidor() -> set[str]:
    linea = re.search(
        r"VALID_PLAYER_THEMES\s*=\s*\{([^}]*)\}", SERVIDOR.read_text(encoding="utf-8")
    )
    assert linea, "no se encontró VALID_PLAYER_THEMES"
    return set(re.findall(r"[\"']([a-z0-9-]+)[\"']", linea.group(1)))


def test_a_lista_de_temas_esta_nun_so_sitio():
    """Había cuatro sitios eligiendo qué temas hay y cuál es el de por defecto."""
    codigo = LISTA_TS.read_text(encoding="utf-8")

    assert "export const TEMAS" in codigo, "falta la lista canónica de temas"
    assert "export const TEMA_POR_DEFECTO" in codigo, "falta el tema por defecto"


def test_a_lista_de_ts_e_a_do_servidor_coinciden():
    codigo = LISTA_TS.read_text(encoding="utf-8")
    en_ts = set(re.findall(r"id:\s*'([a-z0-9-]+)'", codigo))

    assert en_ts == _temas_do_servidor(), (
        f"solo en TypeScript: {sorted(en_ts - _temas_do_servidor())} · "
        f"solo en el servidor: {sorted(_temas_do_servidor() - en_ts)}"
    )


def test_ninguen_usa_classic_como_respaldo():
    """`classic` dejó de ser un tema válido.

    Seguía siendo el valor por defecto en tres sitios. Consecuencia real: una
    misión sin tema dejaba el selector del panel EN BLANCO, porque `classic` ya
    no es ninguna de sus opciones, y al guardar el servidor lo convertía en
    `glass` sin que nadie lo hubiese elegido.
    """
    culpables = []

    for fichero in (ADMIN, PUBLICO):
        for n, linea in enumerate(fichero.read_text(encoding="utf-8").split("\n"), 1):
            if "player_theme" in linea and "classic" in linea:
                culpables.append(f"{fichero.name}:{n}")

    assert not culpables, f"usan 'classic', que ya no es un tema: {culpables}"


def test_o_panel_ofrece_os_temas_da_lista():
    """Escritas a mano, las opciones del panel se quedan atrás."""
    codigo = PANEL.read_text(encoding="utf-8")

    assert "TEMAS" in codigo, "el panel tiene que sacar las opciones de la lista canónica"
    assert '<option value="glass">' not in codigo, "las opciones ya no se escriben a mano"

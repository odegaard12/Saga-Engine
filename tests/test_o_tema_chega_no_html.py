# -*- coding: utf-8 -*-
"""La página llega del servidor con el tema puesto, sin parpadeo.

Síntoma: «hizo como un parpadeo pero se antepuso el otro tema».

Tenía dos causas, y las dos son de orden:

1. El servidor entregaba `index.html` tal cual, con el `<body>` sin clase. La
   pantalla de carga —el anillo y la barra de "Primera vez: se guarda el
   mapa"— se pinta ANTES de que exista configuración ninguna, así que salía
   siempre con los colores por defecto, dijera lo que dijera la misión.

2. `LoginApp` y `PlayerApp` llamaban los DOS a `aplicarTema` al cargar el
   módulo, y `App.tsx` los importa a los dos de golpe. En la página del jugador
   se ejecutaban las dos llamadas; sin configuración guardada las dos ponían el
   respaldo, y sólo despues llegaba el tema de verdad. Eso es el parpadeo: se
   ve el tema equivocado y luego cambia.

El sitio donde esto se arregla de una vez es el HTML: si la página ya viene con
`<body class="theme-...">`, no hay ningún instante sin tema. Y el servidor sabe
cuál es, porque la configuración es suya.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CONSTRUCCION = RAIZ / "backend" / "app" / "build_frontend.py"
FRONT = RAIZ / "frontend" / "src"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_o_servidor_pon_a_clase_do_tema_no_html():
    codigo = CONSTRUCCION.read_text(encoding="utf-8")

    assert "player_theme" in codigo, (
        "el servidor tiene que saber qué tema lleva la misión al servir la página"
    )
    assert "<body" in codigo, "hay que tocar la etiqueta body del html"


def test_a_paxina_xa_non_se_serve_tal_cual():
    """`FileResponse` entrega el fichero sin poder tocarlo."""
    codigo = CONSTRUCCION.read_text(encoding="utf-8")

    inicio = codigo.index("def react_index_or_missing")
    cuerpo = codigo[inicio : inicio + 1400]

    assert "HTMLResponse" in cuerpo, (
        "para poner la clase hay que devolver el html, no el fichero a pelo"
    )


def test_o_tema_de_arranque_ponse_nun_so_sitio():
    """Dos módulos poniéndolo a la vez es lo que se veía parpadear."""
    culpables = []

    for fichero in (FRONT / "login" / "LoginApp.tsx", FRONT / "player" / "PlayerApp.tsx"):
        codigo = sin_comentarios(fichero)
        # La llamada de arranque va fuera del componente; las de dentro de un
        # efecto son otra cosa y esas sí valen.
        antes = codigo.split("export default function")[0]
        if "aplicarTema(" in antes:
            culpables.append(fichero.name)

    assert not culpables, (
        f"siguen poniendo el tema al cargar el módulo: {culpables}. "
        "Con los dos importados a la vez, se pisan."
    )

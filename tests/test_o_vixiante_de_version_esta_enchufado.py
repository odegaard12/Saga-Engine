# -*- coding: utf-8 -*-
"""El vigilante de versión tiene que llamarlo alguien.

`versionGuard.ts` compara la versión que lleva el bundle con la que dice
`/api/version` y, si no coinciden, borra la caché del armazón y recarga UNA vez.
Su propia cabecera explica por qué existe:

    «Ha pasado: se desplegaban arreglos, el servidor los servía, y en el móvil
     no.»

Pues bien: estaba escrito, exportado, con su candado de una-recarga-por-versión
y su cuidado de no tocar el mapa ni las misiones guardadas... **y no lo llamaba
nadie**. Cero importaciones en todo el proyecto. El mecanismo montado para
arreglar el problema, sin enchufar.

Es la séptima vez en dos días con el mismo patrón, y la más cara: significa que
un móvil que abrió la aplicación por la mañana se queda con ese código todo el
día, y un arreglo desplegado a media mañana no le llega nunca.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"


def _codigo_del_arranque() -> str:
    return (FRONT / "main.tsx").read_text(encoding="utf-8")


def test_alguen_chama_ao_vixiante():
    fuentes = [p for p in FRONT.rglob("*.ts") if p.name != "versionGuard.ts"]
    fuentes += list(FRONT.rglob("*.tsx"))

    llamantes = [
        p.relative_to(RAIZ).as_posix()
        for p in fuentes
        if "vixiarVersion" in p.read_text(encoding="utf-8", errors="replace")
    ]

    assert llamantes, (
        "nadie llama a vixiarVersion: el vigilante de versión es código muerto y "
        "un móvil con la aplicación abierta no se entera de ningún despliegue"
    )


def test_chamase_no_arranque():
    """Al arrancar es el único momento en que una recarga no molesta a nadie."""
    assert "vixiarVersion" in _codigo_del_arranque(), (
        "el vigilante no se llama al arrancar, que es cuando recargar no "
        "interrumpe ninguna partida"
    )


def test_non_bloquea_o_arranque():
    """La aplicación no puede esperar a que responda el servidor para pintar.

    Sin cobertura `/api/version` no contesta, y arrancar es justo lo que tiene
    que seguir funcionando en el monte.
    """
    codigo = _codigo_del_arranque()
    linea = next(l for l in codigo.split("\n") if "vixiarVersion" in l and "import" not in l)
    assert "void " in linea or ".catch" in linea or "then" in linea, (
        "se está esperando al vigilante antes de pintar: sin cobertura eso "
        "retrasa el arranque justo donde no puede"
    )

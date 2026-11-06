# -*- coding: utf-8 -*-
"""6/11: no se añaden colores escritos a mano. Los colores salen de los tokens del tema (--s-*, mobile-themes.css).

La auditoría del 6/11 contó ~4 100 colores escritos a mano en el frontend (admin 2 247, juegos 590, jugador 569,
mapa 392...). Se migran por tandas; mientras tanto, esta prueba congela la cuenta de cada fichero en
`colores_a_mano_base.json`: puede bajar, no subir, y un fichero nuevo empieza en cero.

Qué no cuenta: las declaraciones de variables (`--algo: #fff`), los comentarios y las líneas marcadas con
`no-tema` (colores horneados en una imagen o con significado propio, p. ej. los tipos de nodo). `mobile-themes.css`
es el fichero de los tokens y no entra.

Al migrar una tanda, se regenera la base: `python tests/test_sin_colores_a_mano_nuevos.py --base`.
"""
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
FRONT = RAIZ / "frontend" / "src"
BASE = Path(__file__).with_name("colores_a_mano_base.json")
COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d[^)]*\)|hsla?\(\s*\d[^)]*\)")
DECLARA = re.compile(r"^\s*--[\w-]+\s*:")


def contar() -> dict:
    cuenta = {}
    for f in sorted(FRONT.rglob("*")):
        if f.suffix not in (".ts", ".tsx", ".css") or f.name == "mobile-themes.css" or ".generado" in f.name:
            continue
        texto = re.sub(r"/\*.*?\*/", "", f.read_text(encoding="utf-8", errors="replace"), flags=re.DOTALL)
        n = 0
        for linea in texto.splitlines():
            if "no-tema" in linea or DECLARA.match(linea) or linea.strip().startswith("//"):
                continue
            n += len(COLOR.findall(linea.split(" // ")[0]))
        if n:
            cuenta[f.relative_to(FRONT).as_posix()] = n
    return cuenta


def test_ningun_fichero_suma_colores_a_mano():
    base = json.loads(BASE.read_text(encoding="utf-8"))
    suben = [
        f"{f}: {n} (base {base.get(f, 0)})" for f, n in contar().items() if n > base.get(f, 0)
    ]
    assert not suben, (
        "colores escritos a mano nuevos; usa los tokens del tema (var(--s-…)) o marca `no-tema` si va horneado:\n  "
        + "\n  ".join(suben)
    )


if __name__ == "__main__" and "--base" in sys.argv:
    BASE.write_text(json.dumps(contar(), indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print("base regenerada")

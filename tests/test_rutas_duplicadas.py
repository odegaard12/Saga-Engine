# -*- coding: utf-8 -*-
"""Ninguna ruta puede estar declarada dos veces.

La migración de main.py a backend/app/routers/ se quedó a medias y cuatro rutas
del panel acabaron escritas en los dos sitios. Los routers se incluyen en la
primera línea de main.py, así que son los suyos los que responden: las copias de
main.py son código muerto que PARECE vivo. Se editan, se despliega, y no cambia
nada. Cuesta una tarde descubrirlo, y ya la costó.

Se mira el código fuente y no la tabla de rutas a propósito: la tabla depende de
la versión de FastAPI instalada, y aquí lo que hay que vigilar es que no se
escriba dos veces la misma ruta.
"""
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-rutas-"))

RAIZ = Path(__file__).resolve().parent.parent

DECORADOR = re.compile(r"@(?:app|router)\.(get|post|delete|put|patch|api_route)\(\s*[\"']([^\"']+)")


def rutas_de(fichero: Path):
    texto = fichero.read_text(encoding="utf-8", errors="replace")
    return {camino for _, camino in DECORADOR.findall(texto)}


def rutas_por_fichero():
    ficheros = [RAIZ / "main.py"] + sorted((RAIZ / "backend" / "app" / "routers").glob("*.py"))
    return {f.relative_to(RAIZ).as_posix(): rutas_de(f) for f in ficheros if f.exists()}


def test_ningunha_ruta_esta_en_dous_ficheiros():
    por_fichero = rutas_por_fichero()

    duplicadas = {}
    for fichero, rutas in por_fichero.items():
        for otro, otras in por_fichero.items():
            if otro <= fichero:
                continue
            for comun in rutas & otras:
                duplicadas.setdefault(comun, set()).update({fichero, otro})

    assert not duplicadas, (
        "Rutas escritas dos veces. Sólo responde la que se registre primero "
        "—los routers—, así que la otra copia no se ejecuta nunca:\n"
        + "\n".join(
            "  %s  ->  %s" % (ruta, ", ".join(sorted(sitios)))
            for ruta, sitios in sorted(duplicadas.items())
        )
    )


def test_o_panel_e_o_xogo_seguen_a_ter_as_suas_rutas():
    """Red por si alguien borra un fichero de rutas entero por error."""
    por_fichero = rutas_por_fichero()

    assert "/api/admin/login" in por_fichero["backend/app/routers/admin.py"]
    assert "/api/advance" in por_fichero["backend/app/routers/game.py"]
